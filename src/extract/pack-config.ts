/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** CMSIS Pack 的参数表单来自 .config/*_parameters.json，不在前端 sourcemap 中。 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { CatalogEntry } from '../types.js';
import { entryId } from './catalog.js';
import { hasSignificantWhitespace, looksLikeCode } from './source-tsx.js';
import { textShapes } from './text-expressions.js';

const DISPLAY_FIELDS = new Set(['title', 'description']);
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', 'definitions', '$defs']);
const SCHEMA_CHILDREN = new Set([
  'items', 'additionalItems', 'additionalProperties', 'contains',
  'oneOf', 'anyOf', 'allOf', 'prefixItems', 'if', 'then', 'else', 'not',
]);

function properties(node: ts.ObjectLiteralExpression): ts.PropertyAssignment[] {
  return node.properties.filter(ts.isPropertyAssignment);
}

function propertyName(node: ts.PropertyAssignment): string {
  return ts.isStringLiteral(node.name) || ts.isIdentifier(node.name) ? node.name.text : '';
}

/** 只读取已知 schema 位置；不执行 functions、condition、computed 或任何脚本。 */
export function extractPackConfig(file: string, content: string): CatalogEntry[] {
  let data: unknown;
  try { data = JSON.parse(content); } catch {
    throw new Error(`参数文件不是有效 JSON：${file}`);
  }
  if (!data || typeof data !== 'object' || !('componentid' in data) ||
      typeof data.componentid !== 'string' || !data.componentid ||
      !('type' in data) || data.type !== 'object' || !('properties' in data) ||
      !data.properties || typeof data.properties !== 'object' || Array.isArray(data.properties)) {
    throw new Error(`不是受支持的 Pack 参数 schema（需要 componentid、type: object、properties）：${file}`);
  }
  const componentId = data.componentid;
  const source = ts.parseJsonText(file, content);
  const statement = source.statements[0];
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isObjectLiteralExpression(statement.expression)) {
    throw new Error(`无法解析参数 schema：${file}`);
  }

  const entries: CatalogEntry[] = [];
  // 虚拟来源名不包含安装位置/Pack 版本；同一 schema 搬家或升级仍可继承 ID。
  const sourceName = `pack-config/${path.basename(file)}`;
  const feature = `pack-config/${path.basename(file, '.json')}`;
  const pointerPart = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1');

  function add(node: ts.PropertyAssignment, pointer: string, shape?: string) {
    if (!ts.isStringLiteral(node.initializer)) return;
    const text = shape ?? node.initializer.text;
    if (!text.trim()) return;
    const reason = shape !== undefined || /\{\{|\$\{/.test(text) ? 'template-concat' : looksLikeCode(text, 'text-prop');
    entries.push({
      id: entryId(`${sourceName}:${componentId}:${pointer}`, 'config-value', text, 0),
      text, role: 'config-value', propName: propertyName(node), feature,
      source: { file: sourceName, line: source.getLineAndCharacterOfPosition(node.initializer.getStart(source)).line + 1 },
      context: `${componentId} · ${pointer}`,
      occurrences: 1, translatable: !reason,
      confidence: reason || hasSignificantWhitespace(text) ? 'needs-review' : 'high',
      ...(reason ? { reason } : {}), tier: 2,
    });
  }

  function visit(node: ts.Expression, pointer: string) {
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((child, i) => visit(child, `${pointer}/${i}`));
      return;
    }
    if (!ts.isObjectLiteralExpression(node)) return;
    // source 是可执行的 DSL/JS 文本。只读 AST 中 itemTitle 指向的对象字段，绝不求值。
    const itemTitle = properties(node).find(p => propertyName(p) === 'itemTitle')?.initializer;
    const inputSource = properties(node).find(p => propertyName(p) === 'source');
    if (itemTitle && ts.isStringLiteral(itemTitle) && inputSource && ts.isStringLiteral(inputSource.initializer)) {
      const expression = ts.createSourceFile('pack-source.ts', `(${inputSource.initializer.text})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      let ordinal = 0;
      const scan = (child: ts.Node) => {
        if (ts.isPropertyAssignment(child) && propertyName(child) === itemTitle.text) {
          for (const shape of textShapes(child.initializer)) {
            if (/[A-Za-z]{3}/.test(shape)) add(inputSource, `${pointer}/source/itemTitle/${pointerPart(itemTitle.text)}/${ordinal++}`, shape);
          }
        }
        ts.forEachChild(child, scan);
      };
      scan(expression);
    }
    for (const property of properties(node)) {
      const name = propertyName(property);
      const child = property.initializer;
      const location = `${pointer}/${pointerPart(name)}`;
      if (DISPLAY_FIELDS.has(name)) add(property, location);
      else if (SCHEMA_MAPS.has(name) && ts.isObjectLiteralExpression(child)) {
        for (const item of properties(child)) visit(item.initializer, `${location}/${pointerPart(propertyName(item))}`);
      } else if (SCHEMA_CHILDREN.has(name)) visit(child, location);
      else if (name === 'actions' && ts.isArrayLiteralExpression(child)) {
        child.elements.forEach((action, i) => {
          if (!ts.isObjectLiteralExpression(action)) return;
          for (const field of properties(action)) {
            const fieldName = propertyName(field);
            const actionPath = `${location}/${i}/${fieldName}`;
            if (fieldName === 'message') add(field, actionPath);
            if (fieldName === 'attributes') visit(field.initializer, actionPath);
          }
        });
      }
    }
  }
  visit(statement.expression, '');
  return entries;
}

/** 显式文件或目录；目录内只收 *_parameters.json，包括隐藏的 .config。 */
export function readPackConfigs(inputs: string[]): { files: string[]; entries: CatalogEntry[] } {
  const files = new Set<string>();
  function collect(input: string, explicit = false) {
    const info = statSync(input);
    if (info.isFile()) {
      if (explicit || /_parameters\.json$/i.test(input)) files.add(realpathSync(input));
    } else if (info.isDirectory()) {
      for (const entry of readdirSync(input, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        // 不跟随目录链接，避免循环或意外越出指定的 Pack 树。
        if (!entry.isSymbolicLink()) collect(path.join(input, entry.name));
      }
    }
  }
  for (const input of inputs) collect(path.resolve(input), true);
  if (!files.size) throw new Error('指定目录中未找到 *_parameters.json');
  const entries = new Map<string, CatalogEntry>();
  for (const file of files) {
    for (const entry of extractPackConfig(file, readFileSync(file, 'utf8'))) entries.set(entry.id, entry);
  }
  return { files: [...files], entries: [...entries.values()] };
}
