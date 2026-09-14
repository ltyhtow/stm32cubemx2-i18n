/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintEntry, lintPo, type Glossary } from './lint.js';

const G: Glossary = {
  terms: [{ en: 'Project', use: '工程', avoid: ['项目'] }],
  keep: ['Cube'],
};
const opts = { locale: 'zh-CN', glossary: G };
const rules = (msgid: string, msgstr: string, flags: string[] = []) =>
  lintEntry(msgid, msgstr, flags, opts).map((f) => `${f.severity}:${f.rule}`);

test('占位符必须一一对应，顺序可变', () => {
  assert.deepEqual(rules('Task {0} exited with {1}', '任务 {1} 已退出，代码 {0}'), []);
  assert.deepEqual(rules('Task {0} exited', '任务已退出'), ['error:placeholder']);
  assert.deepEqual(rules('Open {0}', '打开 {0} {1}'), ['error:placeholder']);
  assert.deepEqual(rules('Use ${activeEditorShort}', '使用 ${activeEditorShort}'), []);
  assert.deepEqual(rules('Use ${activeEditorShort}', '使用 ${活动编辑器}'), ['error:placeholder', 'error:placeholder']);
});

test('反引号代码片段与设置引用原样保留', () => {
  assert.deepEqual(rules('Controls `editor.fontSize`', '控制 `editor.fontSize`'), []);
  assert.deepEqual(rules('Controls `editor.fontSize`', '控制字体大小'), ['error:code-span']);
  assert.deepEqual(rules('Requires `#editor.hover.sticky#`', '需要启用 `#editor.hover.sticky#`'), []);
});

test('禁译词整词匹配、区分大小写', () => {
  assert.deepEqual(rules('Configure GPIO pins', '配置 GPIO 引脚'), []);
  assert.deepEqual(rules('Configure GPIO pins', '配置通用输入输出引脚'), ['error:keep-term']);
  // 动词 can 不应被当成 CAN 总线
  assert.deepEqual(rules('You can retry', '你可以重试'), []);
  assert.deepEqual(rules('Enable CAN', '启用 CAN'), []);
  assert.deepEqual(rules('Pack management', 'Pack 管理'), []);
  assert.deepEqual(rules('Pack management', '包管理'), ['error:keep-term']);
});

test('首尾空格、换行、助记符', () => {
  assert.deepEqual(rules('Your project ', '您的工程 '), []);
  assert.deepEqual(rules('Your project ', '您的工程', ['keep-whitespace']), ['error:whitespace']);
  assert.deepEqual(rules('Line one\nLine two', '第一行\n第二行'), []);
  assert.deepEqual(rules('Line one\nLine two', '第一行 第二行'), ['error:newline']);
  assert.deepEqual(rules('&&View', '查看(&&V)'), []);
  assert.deepEqual(rules('&&View', '查看'), ['error:mnemonic']);
});

test('结构符号与伪翻译泄漏', () => {
  assert.deepEqual(rules('] already exists.', '] 已存在。'), []);
  assert.deepEqual(rules('] already exists.', '已存在。'), ['error:structure']);
  assert.deepEqual(rules('Expand all', '⟦Expand all⟧'), ['error:pseudo', 'warning:untranslated'].filter((r) => r !== 'warning:untranslated'));
});

test('术语禁用译法与未翻译', () => {
  assert.deepEqual(rules('Open Recent Projects', '打开最近工程'), []);
  assert.deepEqual(rules('Open Recent Projects', '打开最近项目'), ['warning:glossary']);
  assert.deepEqual(rules('Open Recent Projects', 'Open Recent Projects'), ['warning:untranslated']);
  // 单个词与原文相同不算未翻译
  assert.deepEqual(rules('GPIO', 'GPIO'), []);
});

test('省略号与冒号收尾', () => {
  assert.deepEqual(rules('Loading...', '正在加载…'), []);
  assert.deepEqual(rules('Loading...', '正在加载'), ['warning:ellipsis']);
  assert.deepEqual(rules('Danger Score:', '风险评分：'), []);
  assert.deepEqual(rules('Danger Score:', '风险评分'), ['warning:colon']);
});

test('中文语境的半角标点只报 style，代码片段与路径不算', () => {
  assert.deepEqual(rules('A, B', '甲,乙'), ['style:punctuation']);
  assert.deepEqual(rules('Note: x', '注意:x'), ['style:punctuation']);
  assert.deepEqual(rules('Done.', '完成.'), ['style:punctuation']);
  assert.deepEqual(rules('See `a,b` at 12:30', '见 `a,b`，于 12:30'), []);
  // 非中文 locale 不做排版检查
  assert.deepEqual(lintEntry('A, B', 'A,B', [], { locale: 'de' }).map((f) => f.rule), []);
});

test('lintPo 统计与排序', () => {
  const data = {
    charset: 'UTF-8',
    headers: {},
    translations: {
      '': {
        '': { msgid: '', msgstr: [''] },
        'Open {0}': { msgid: 'Open {0}', msgstr: ['打开'], comments: { flag: 'jsx-child', reference: 'a.tsx:1' } },
        'Save': { msgid: 'Save', msgstr: ['保存'] },
        'Untouched': { msgid: 'Untouched', msgstr: [''] },
        'A, B': { msgid: 'A, B', msgstr: ['甲,乙'] },
      },
    },
  };
  const r = lintPo(data, opts);
  assert.equal(r.total, 4);
  assert.equal(r.translated, 3);
  assert.equal(r.untranslated, 1);
  assert.equal(r.errors, 1);
  assert.equal(r.styles, 1);
  assert.equal(r.findings[0]?.severity, 'error');
  assert.deepEqual(r.findings[0]?.refs, ['a.tsx:1']);
});
