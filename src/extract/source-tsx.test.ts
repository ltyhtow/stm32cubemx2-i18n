/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromSource } from './source-tsx.js';

test('补收表格列按钮和封装翻转标签，同时保留代码属性排除', () => {
  const entries = extractFromSource('view.tsx', '<Table columnsButtonText="Columns" id="table-id" />; const options = { topLabel: "Top", bottomLabel: "Bottom", name: "hardware" };');
  assert.deepEqual(entries.filter(e => e.translatable).map(e => e.text), ['Columns', 'Top', 'Bottom']);
  assert.ok(entries.filter(e => ['table-id', 'hardware'].includes(e.text)).every(e => !e.translatable));
});

test('JSX 显示属性和对象标题中的动态模板可审查，不进入词表且不执行函数', () => {
  const entries = extractFromSource('view.tsx', 'const view = <Card title={`Last Opened project - ${runCode()}`} id={`danger-${runCode()}`} />; const options = { tooltip: "Items: " + count };');
  assert.deepEqual(entries.map(e => e.text), ['Last Opened project - {}', 'Items: {}']);
  assert.ok(entries.every(e => !e.translatable && e.reason === 'template-concat'));
});

test('插值中的有限文案分支连同后缀提取，仍作为拼接审查项', () => {
  const entries = extractFromSource('view.tsx', '<Alert>{`${enabled ? "Select a mode." : "Enable this peripheral."} Dependencies may be installed.`}</Alert>');
  assert.deepEqual(entries.map(e => e.text), ['Select a mode. Dependencies may be installed.', 'Enable this peripheral. Dependencies may be installed.']);
  assert.ok(entries.every(e => e.reason === 'template-concat' && !e.translatable));
});

test('只收 this.title 的显示赋值，不收命令标识或一般对象 label 赋值', () => {
  const entries = extractFromSource('view.ts', 'class View { init() { this.title.label = id ?? "No Peripheral Selected"; this.title.caption = "A tooltip"; this.id = "internal-id"; other.label = "Not verified"; } }');
  assert.deepEqual(entries.filter(e => e.translatable).map(e => e.text), ['No Peripheral Selected', 'A tooltip']);
});

test('文案常量表与命令代码表分开，未知属性不会扩大抽取', () => {
  const entries = extractFromSource('view.ts', 'const EXPAND_COLLAPSE_LABEL = { EXPAND_ALL: "Expand all", COLLAPSE_ALL: "Collapse all" } as const; const NEXTCOMMAND = { EXPAND_ALL: "expandAll" } as const; const COMMAND_ID_LABEL = { VALUE: "Not a display label" };');
  assert.deepEqual(entries.filter(e => e.translatable).map(e => e.text), ['Expand all', 'Collapse all']);
});
