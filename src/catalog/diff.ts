/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Catalog, CatalogEntry } from '../types.js';

const FIELDS = [
  'text', 'role', 'propName', 'component', 'feature', 'occurrences',
  'translatable', 'confidence', 'reason', 'tier', 'context',
] as const;

export interface CatalogChange {
  id: string;
  fields: string[];
  before: CatalogEntry;
  after: CatalogEntry;
}

export interface CatalogDiff {
  formatVersion: 1;
  before: { appVersion: string; generatedAt: string; entries: number };
  after: { appVersion: string; generatedAt: string; entries: number };
  summary: { added: number; removed: number; changed: number; unchanged: number };
  /** PO 按原文归并。文件搬迁/ID 变化不等于需要重新翻译。 */
  texts: { before: number; after: number; retained: number; added: string[]; removed: string[] };
  added: CatalogEntry[];
  removed: CatalogEntry[];
  changed: CatalogChange[];
}

function index(catalog: Catalog, name: string): Map<string, CatalogEntry> {
  if (!catalog || typeof catalog.appVersion !== 'string' || typeof catalog.generatedAt !== 'string' || !Array.isArray(catalog.entries)) {
    throw new Error(`${name} 不是有效 catalog：需要 appVersion、generatedAt 与 entries`);
  }
  const entries = new Map<string, CatalogEntry>();
  for (const entry of catalog.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.text !== 'string' || typeof entry.translatable !== 'boolean') {
      throw new Error(`${name} 含无效条目：需要 id、text 与 translatable`);
    }
    if (entries.has(entry.id)) throw new Error(`${name} 含重复 ID：${entry.id}`);
    entries.set(entry.id, entry);
  }
  return entries;
}

function changedFields(before: CatalogEntry, after: CatalogEntry): string[] {
  const fields: string[] = FIELDS.filter(field => before[field] !== after[field]);
  if (before.source?.file !== after.source?.file) fields.push('source.file');
  if (before.source?.line !== after.source?.line) fields.push('source.line');
  return fields;
}

/** 精确匹配 ID 与原文，不猜测改写后的文案应继承哪条译文。 */
export function diffCatalogs(before: Catalog, after: Catalog): CatalogDiff {
  const previous = index(before, '旧清单');
  const current = index(after, '新清单');
  const added: CatalogEntry[] = [];
  const removed: CatalogEntry[] = [];
  const changed: CatalogChange[] = [];
  let unchanged = 0;

  // 按 ID 排序保证报告稳定，不受抽取顺序和 JSON 属性顺序影响。
  for (const id of [...current.keys()].sort()) {
    const entry = current.get(id)!;
    const prev = previous.get(id);
    if (!prev) added.push(entry);
    else {
      const fields = changedFields(prev, entry);
      if (fields.length) changed.push({ id, fields, before: prev, after: entry });
      else unchanged++;
    }
  }
  for (const id of [...previous.keys()].sort()) if (!current.has(id)) removed.push(previous.get(id)!);

  const texts = (catalog: Catalog) => new Set(catalog.entries.filter(e => e.translatable).map(e => e.text));
  const previousTexts = texts(before);
  const currentTexts = texts(after);
  const addedTexts = [...currentTexts].filter(text => !previousTexts.has(text)).sort();
  const removedTexts = [...previousTexts].filter(text => !currentTexts.has(text)).sort();
  const metadata = (catalog: Catalog) => ({ appVersion: catalog.appVersion, generatedAt: catalog.generatedAt, entries: catalog.entries.length });
  return {
    formatVersion: 1,
    before: metadata(before),
    after: metadata(after),
    summary: { added: added.length, removed: removed.length, changed: changed.length, unchanged },
    texts: {
      before: previousTexts.size,
      after: currentTexts.size,
      retained: currentTexts.size - addedTexts.length,
      added: addedTexts,
      removed: removedTexts,
    },
    added,
    removed,
    changed,
  };
}

export function formatDiff(report: CatalogDiff): string {
  const { summary: s, texts: t } = report;
  const lines = [
    `应用版本 ${report.before.appVersion} → ${report.after.appVersion}`,
    `条目：新增 ${s.added} ・ 移除 ${s.removed} ・ 变化 ${s.changed} ・ 不变 ${s.unchanged}`,
    `可译原文：可继承 ${t.retained} ・ 新增 ${t.added.length} ・ 失效 ${t.removed.length}`,
    '可继承按原文精确匹配计算；是否已有译文以 sync 后的 PO 为准。',
  ];
  for (const [label, texts] of [['新增', t.added], ['失效', t.removed]] as const) {
    if (!texts.length) continue;
    lines.push('', `${label}原文（最多显示 8 条）：`, ...texts.slice(0, 8).map(text => `  ${JSON.stringify(text)}`));
  }
  return lines.join('\n');
}
