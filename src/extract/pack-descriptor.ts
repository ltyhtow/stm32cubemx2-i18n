/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { CatalogEntry } from '../types.js';
import { entryId } from './catalog.js';
import { hasSignificantWhitespace, looksLikeCode } from './source-tsx.js';

/** DFP 的外设分类/说明，以及已确认用于 itemTitle 的定时器资源名称。 */
export function extractPackDescriptor(file: string, content: string): CatalogEntry[] {
  let data: unknown;
  try { data = JSON.parse(content); } catch { throw new Error(`描述文件不是有效 JSON：${file}`); }
  if (!data || typeof data !== 'object' || !('schema_version' in data) || typeof data.schema_version !== 'string') {
    throw new Error(`不是受支持的 DFP 描述文件：${file}`);
  }
  const series = 'series' in data && typeof data.series === 'string' ? data.series : '';
  const mapping = 'configurable_elements' in data && Array.isArray(data.configurable_elements) && !!series;
  const peripherals = 'peripherals' in data && Array.isArray(data.peripherals);
  if (!mapping && !peripherals) throw new Error(`描述文件缺少 configurable_elements 或 peripherals：${file}`);
  const source = ts.parseJsonText(file, content);
  const statement = source.statements[0];
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isObjectLiteralExpression(statement.expression)) {
    throw new Error(`无法解析 DFP 描述文件：${file}`);
  }
  const root = statement.expression;
  const sourceName = `pack-descriptor/${path.basename(file)}`;
  const namespace = mapping ? series : path.basename(file, '.json');
  const entries: CatalogEntry[] = [];
  const identifiers = new Set<string>();
  const fields = (node: ts.ObjectLiteralExpression) => node.properties.filter(ts.isPropertyAssignment);
  const nameOf = (node: ts.PropertyAssignment) => ts.isStringLiteral(node.name) || ts.isIdentifier(node.name) ? node.name.text : '';
  const field = (node: ts.ObjectLiteralExpression, name: string) => fields(node).find(p => nameOf(p) === name);
  const textOf = (node: ts.ObjectLiteralExpression, name: string) => {
    const value = field(node, name)?.initializer;
    return value && ts.isStringLiteral(value) ? value.text : undefined;
  };
  const part = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1');

  function add(node: ts.ObjectLiteralExpression, key: string, location: string, identity: string) {
    const value = field(node, key)?.initializer;
    if (!value || !ts.isStringLiteral(value) || !value.text.trim()) return;
    const text = value.text;
    const reason = /\{\{|\$\{/.test(text) ? 'template-concat' : looksLikeCode(text, 'text-prop');
    entries.push({
      id: entryId(`${sourceName}:${namespace}:${identity}/${key}`, 'config-value', text, 0),
      text, role: 'config-value', propName: key, feature: `pack-descriptor/${namespace}`,
      source: { file: sourceName, line: source.getLineAndCharacterOfPosition(value.getStart(source)).line + 1 },
      context: `${namespace} · ${location}/${key} · ${identity}`,
      occurrences: 1, translatable: !reason, confidence: reason || hasSignificantWhitespace(text) ? 'needs-review' : 'high',
      ...(reason ? { reason } : {}), tier: 2,
    });
  }

  function visitArray(parent: ts.ObjectLiteralExpression, key: string, location: string, identity: string, kind: 'mapping' | 'peripheral' | 'resource' | 'function') {
    const array = field(parent, key)?.initializer;
    if (!array) return;
    if (!ts.isArrayLiteralExpression(array)) throw new Error(`描述文件 ${location}/${key} 必须是数组：${file}`);
    array.elements.forEach((node, index) => {
      if (!ts.isObjectLiteralExpression(node)) throw new Error(`描述文件数组条目必须是对象：${file}`);
      const id = textOf(node, kind === 'resource' ? 'id' : kind === 'function' ? 'configurationType' : 'name');
      if (!id) throw new Error(`描述文件条目缺少稳定标识：${file} ${location}/${key}/${index}`);
      const pointer = `${location}/${key}/${index}`;
      const stable = `${identity}/${key}/${part(id)}`;
      if (identifiers.has(stable)) throw new Error(`描述文件含重复标识：${stable}`);
      identifiers.add(stable);
      if (kind === 'mapping') {
        add(node, 'category', pointer, stable);
        add(node, 'description', pointer, stable);
        visitArray(node, 'configurableElements', pointer, stable, 'mapping');
        visitArray(node, 'functions', pointer, stable, 'function');
      } else if (kind === 'function') {
        add(node, 'label', pointer, stable);
      } else {
        // name 在大部分 DFP 位置是硬件标识；这里只收已确认的 timer_channel 显示名。
        if (kind === 'resource' && textOf(node, 'resourceType') === 'timer_channel') add(node, 'name', pointer, stable);
        visitArray(node, 'resources', pointer, stable, 'resource');
      }
    });
  }
  if (mapping) visitArray(root, 'configurable_elements', '', '', 'mapping');
  else visitArray(root, 'peripherals', '', '', 'peripheral');
  return entries;
}

/** 只读取显式指定的描述文件；不修改 Pack，也不运行其中的表达式。 */
export function readPackDescriptors(inputs: string[]): { files: string[]; entries: CatalogEntry[] } {
  const files = [...new Set(inputs.map(file => realpathSync(file)))];
  const entries = new Map<string, CatalogEntry>();
  for (const file of files) {
    for (const entry of extractPackDescriptor(file, readFileSync(file, 'utf8'))) entries.set(entry.id, entry);
  }
  return { files, entries: [...entries.values()] };
}
