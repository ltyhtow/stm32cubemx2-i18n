/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffCatalogs } from './diff.js';
import { computeStats, entryId } from '../extract/catalog.js';
import { catalogToPot, mergePo, poToRuntimeTable } from './po.js';
import type { Catalog, CatalogEntry } from '../types.js';

function entry(text: string, override: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: entryId('view.tsx', 'jsx-child', text, 0), text, role: 'jsx-child', feature: 'example',
    source: { file: 'view.tsx', line: 1 }, occurrences: 1, translatable: true, confidence: 'high', tier: 2,
    ...override,
  };
}
function catalog(entries: CatalogEntry[], appVersion = '1.0.0'): Catalog {
  return { appVersion, generatedAt: '2026-01-01T00:00:00.000Z', entries, stats: computeStats(entries) };
}

test('重复抽取仅时间与顺序变化时无内容差异', () => {
  const before = catalog([entry('Open'), entry('Close')]);
  const after = { ...catalog([...before.entries].reverse()), generatedAt: '2026-02-01T00:00:00.000Z' };
  const report = diffCatalogs(before, after);
  assert.deepEqual(report.summary, { added: 0, removed: 0, changed: 0, unchanged: 2 });
  assert.deepEqual(report.texts, { before: 2, after: 2, retained: 2, added: [], removed: [] });
});

test('文件搬迁改变 ID，但同一原文仍可继承，重复使用只需翻译一次', () => {
  const before = catalog([entry('Open'), entry('Close')]);
  const after = catalog([
    entry('Open', { id: entryId('new.tsx', 'jsx-child', 'Open', 0), source: { file: 'new.tsx', line: 9 } }),
    entry('Open', { id: entryId('other.tsx', 'jsx-child', 'Open', 0) }),
    entry('Save'),
  ], '2.0.0');
  const report = diffCatalogs(before, after);
  assert.deepEqual(report.summary, { added: 3, removed: 2, changed: 0, unchanged: 0 });
  assert.deepEqual(report.texts, { before: 2, after: 2, retained: 1, added: ['Save'], removed: ['Close'] });
});

test('行号、语境和可译资格变化会指出具体字段，新增可译原文不遗漏', () => {
  const before = catalog([entry('Open', { translatable: false, reason: 'not-ui-position' })]);
  const after = catalog([entry('Open', { source: { file: 'view.tsx', line: 9 }, context: 'new context' })]);
  const report = diffCatalogs(before, after);
  assert.equal(report.summary.changed, 1);
  assert.deepEqual(report.changed[0]?.fields, ['translatable', 'reason', 'context', 'source.line']);
  assert.deepEqual(report.texts.added, ['Open']);
});

test('首尾空白不同的片段不能合并；代码字符串不计入翻译工作量', () => {
  const before = catalog([entry('Open'), entry('identifier', { translatable: false })]);
  const after = catalog([entry(' Open '), entry('anotherIdentifier', { translatable: false })]);
  const report = diffCatalogs(before, after);
  assert.deepEqual(report.texts, { before: 1, after: 1, retained: 0, added: [' Open '], removed: ['Open'] });
});

test('重复 ID 与损坏清单必须报错，不能静默吞掉差异', () => {
  assert.throws(() => diffCatalogs(catalog([entry('Open'), entry('Open')]), catalog([])), /重复 ID/);
  assert.throws(() => diffCatalogs({} as Catalog, catalog([])), /不是有效 catalog/);
  assert.throws(() => diffCatalogs(catalog([{} as CatalogEntry]), catalog([])), /无效条目/);
});

test('升级差异与 PO 合并一致：搬迁继承原文，改写文案留空，组件译文保留', () => {
  const before = catalog([entry('Open'), entry('Delete')]);
  const after = catalog([
    entry('Open', { id: entryId('moved.tsx', 'jsx-child', 'Open', 0), source: { file: 'moved.tsx', line: 20 } }),
    entry('Delete all'),
  ], '2.0.0');
  const existing = catalogToPot(before, 'zh-CN');
  existing.translations['']!['Open']!.msgstr = ['打开'];
  existing.translations['']!['Delete']!.msgstr = ['删除'];
  existing.translations['GateStatus'] = { Open: { msgid: 'Open', msgctxt: 'GateStatus', msgstr: ['开启'] } };
  const report = diffCatalogs(before, after);
  const { merged, kept, added, dropped } = mergePo(catalogToPot(after), existing);
  assert.deepEqual(report.texts.added, ['Delete all']);
  assert.deepEqual({ kept, added, dropped }, { kept: 2, added: 1, dropped: 1 });
  const runtime = poToRuntimeTable(merged, 'zh-CN');
  assert.deepEqual(runtime.strings, { Open: '打开' });
  assert.equal(runtime.scoped['GateStatus\u0000Open'], '开启');
  assert.deepEqual(merged.translations['']?.['Delete all']?.msgstr, ['']);
});
