/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePo, parsePo, serializePo, poToRuntimeTable, type PoData } from './po.js';

function template(...texts: string[]): PoData {
  return {
    charset: 'UTF-8',
    headers: { 'Project-Id-Version': 'Example 2.0', 'Language': 'zh-CN' },
    translations: { '': Object.fromEntries(texts.map(msgid => [msgid, {
      msgid, msgstr: [''], comments: { reference: 'new-view.tsx:42', extracted: 'New context', flag: 'jsx-prop' },
    }])) },
  };
}

test('升级保留译文、译者注释和 fuzzy，更新来源并去掉过时抽取标记', () => {
  const existing = template('Open');
  existing.translations['']!['Open']!.msgstr = ['打开'];
  existing.translations['']!['Open']!.comments = {
    translator: '译者: Example\n需要复核', reference: 'old-view.tsx:1', flag: 'fuzzy, jsx-child, keep-whitespace, reviewer-flag',
  };
  const original = structuredClone(existing);
  const { merged, kept, added, dropped } = mergePo(template('Open'), existing);
  const entry = merged.translations['']!['Open']!;
  assert.deepEqual(entry.msgstr, ['打开']);
  assert.equal(entry.comments?.translator, '译者: Example\n需要复核');
  assert.equal(entry.comments?.reference, 'new-view.tsx:42');
  assert.equal(entry.comments?.flag, 'jsx-prop, fuzzy, reviewer-flag');
  assert.deepEqual({ kept, added, dropped }, { kept: 1, added: 0, dropped: 0 });
  assert.deepEqual(existing, original);
});

test('无上下文模板不会删除手工添加的组件消歧译文', () => {
  const existing = template('Open');
  existing.translations['']!['Open']!.msgstr = ['打开'];
  existing.translations['GateStatus'] = {
    Open: { msgid: 'Open', msgctxt: 'GateStatus', msgstr: ['开启'], comments: { translator: '保留开关含义' } },
    Deleted: { msgid: 'Deleted', msgctxt: 'GateStatus', msgstr: ['已删除'] },
  };
  const result = mergePo(template('Open', 'Close'), existing);
  const roundTrip = parsePo(serializePo(result.merged));
  assert.deepEqual(roundTrip.translations['GateStatus']?.['Open']?.msgstr, ['开启']);
  assert.equal(roundTrip.translations['GateStatus']?.['Open']?.comments?.reference, 'new-view.tsx:42');
  assert.equal(roundTrip.translations['GateStatus']?.['Open']?.comments?.translator, '保留开关含义');
  assert.equal(roundTrip.translations['GateStatus']?.['Deleted'], undefined);
  assert.equal(result.kept, 2);
  assert.equal(result.added, 1);
  assert.equal(result.dropped, 1);
  const table = poToRuntimeTable(roundTrip, 'zh-CN');
  assert.equal(table.strings['Open'], '打开');
  assert.equal(table.scoped['GateStatus\u0000Open'], '开启');
});

test('已有空译文不重复算新增，统计不计 PO 头，移除失效原文', () => {
  const existing = parsePo(serializePo(template('Open', 'Gone')));
  const result = mergePo(parsePo(serializePo(template('Open', 'Close'))), existing);
  assert.deepEqual({ kept: result.kept, added: result.added, dropped: result.dropped }, { kept: 0, added: 1, dropped: 1 });
});

test('兼容头字段大小写，保留语言并升级应用版本，不输出重复头字段', () => {
  const existing = parsePo(serializePo({ ...template('Open'), headers: { Language: 'de', 'Project-Id-Version': 'Example 1.0' } }));
  existing.headers['language'] = existing.headers['Language']!;
  delete existing.headers['Language'];
  const merged = mergePo(template('Open'), existing).merged;
  const serialized = serializePo(merged);
  const roundTrip = parsePo(serialized);
  assert.equal(roundTrip.headers['Language'], 'de');
  assert.equal(roundTrip.headers['Project-Id-Version'], 'Example 2.0');
  assert.equal((serialized.toString().match(/"Language:/gi) ?? []).length, 1);
});

test('未声明字符集的 UTF-8 PO 不会把中文解析成乱码', () => {
  const data = parsePo(Buffer.from('msgid "Open"\nmsgstr "打开"\n', 'utf8'));
  assert.deepEqual(data.translations['']?.['Open']?.msgstr, ['打开']);
});
