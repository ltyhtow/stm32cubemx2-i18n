/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkBatches, normalizeIncoming, applyWork, distinctModules } from './work.js';
import type { PoData } from './po.js';

const po = (): PoData => ({
  charset: 'UTF-8',
  headers: {},
  translations: {
    '': {
      '': { msgid: '', msgstr: [''] },
      Line: {
        msgid: 'Line',
        msgstr: [''],
        comments: {
          extracted: '界面位置：application-project → McuSelector，exti-configuration → ExtiTableView\n语境：{ field: "line", header: "Line" }\n共 2 处使用',
          flag: 'config-value',
          reference: 'a.tsx:27\nb.tsx:144',
        },
      },
      'Expand all': {
        msgid: 'Expand all',
        msgstr: [''],
        comments: { extracted: '界面位置：application-project → ExpandCollapseButton', flag: 'jsx-child' },
      },
      Saved: { msgid: 'Saved', msgstr: ['已保存'], comments: {} },
    },
  },
});

test('界面位置里取出去重的模块名', () => {
  assert.deepEqual(distinctModules('a → X，b → Y，a → Z'), ['a', 'b']);
  assert.deepEqual(distinctModules('a → X'), ['a']);
  assert.deepEqual(distinctModules(undefined), []);
});

test('跨模块的条目带上「只能有一个译文」提醒', () => {
  const [b] = buildWorkBatches(po(), { locale: 'zh-CN', batchSize: 60 });
  const line = b!.items.find((i) => i.msgid === 'Line')!;
  assert.match(line.note ?? '', /跨 2 个模块/);
  assert.match(line.note ?? '', /只能有一个译文/);
  assert.equal(line.where, 'application-project → McuSelector，exti-configuration → ExtiTableView');
  // 单模块的不加噪音
  const one = b!.items.find((i) => i.msgid === 'Expand all')!;
  assert.equal(one.note, undefined);
});

test('默认只导出未翻译的条目，分批带序号', () => {
  const bs = buildWorkBatches(po(), { locale: 'zh-CN', batchSize: 1 });
  assert.equal(bs.length, 2);
  assert.deepEqual(bs.map((b) => b.count), [1, 1]);
  assert.deepEqual([bs[0]!.items[0]!.n, bs[1]!.items[0]!.n], [1, 2]);
  assert.equal(bs[0]!.of, 2);
  const withDone = buildWorkBatches(po(), { locale: 'zh-CN', batchSize: 60, includeTranslated: true });
  assert.equal(withDone[0]!.count, 3);
});

test('导回接受批次 / 数组 / 平铺三种形状', () => {
  const want = [{ msgid: 'Line', msgstr: '线' }];
  assert.deepEqual(normalizeIncoming({ items: [{ msgid: 'Line', msgstr: '线' }] }), want);
  assert.deepEqual(normalizeIncoming([{ msgid: 'Line', msgstr: '线' }]), want);
  assert.deepEqual(normalizeIncoming({ Line: '线' }), want);
  assert.deepEqual(normalizeIncoming({ _readme: '忽略', Line: '线' }), want);
  assert.deepEqual(normalizeIncoming('nonsense'), []);
});

test('导回默认不覆盖已有译文，空译文跳过，认不出的原文单列', () => {
  const d = po();
  const r = applyWork(d, [
    { msgid: 'Line', msgstr: '线' },
    { msgid: 'Saved', msgstr: '存好了' },
    { msgid: 'Expand all', msgstr: '   ' },
    { msgid: '不存在的原文', msgstr: 'x' },
  ]);
  assert.deepEqual(
    { a: r.applied, s: r.skippedExisting, e: r.emptyInput, u: r.unknown },
    { a: 1, s: 1, e: 1, u: ['不存在的原文'] },
  );
  assert.equal(d.translations['']!['Line']!.msgstr[0], '线');
  assert.equal(d.translations['']!['Saved']!.msgstr[0], '已保存');
});

test('--overwrite 覆盖已有译文并记录译者', () => {
  const d = po();
  const r = applyWork(d, [{ msgid: 'Saved', msgstr: '存好了' }], { overwrite: true, source: 'claude' });
  assert.equal(r.applied, 1);
  assert.equal(d.translations['']!['Saved']!.msgstr[0], '存好了');
  assert.match(d.translations['']!['Saved']!.comments!.translator!, /claude/);
});
