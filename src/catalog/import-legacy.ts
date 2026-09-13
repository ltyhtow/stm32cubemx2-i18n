/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 从旧项目的 CSV 工作表导入译文。
 *
 * 合规约束：旧表里 `from_dict=1` 的行来自另一个**未声明开源许可证**的项目的词典，
 * 属于该项目的翻译成果，不能并入本项目。因此默认只导入 `from_dict=0` 的行，
 * 即使用者自己翻译的部分。需要连同他人成果一起导入时必须显式加 --include-foreign，
 * 那样产出的 PO 就不可公开分发。
 */
import type { PoData } from './po.js';

export interface LegacyRow {
  en: string;
  zh: string;
  fromDict: boolean;
  skip: boolean;
  kind: string;
}

export interface ImportResult {
  /** 旧表总行数 */
  total: number;
  /** 符合来源要求、且有译文的候选 */
  eligible: number;
  /** 因来源存疑被排除 */
  foreignSkipped: number;
  /** 实际填入 PO 的条目数 */
  applied: number;
  /** 旧表有译文、但新目录里没有对应原文 */
  unmatched: number;
  /** PO 里已有译文、未被覆盖 */
  alreadyTranslated: number;
}

/** 解析旧表的 CSV。只认它实际用到的那几列，不追求通用。 */
export function parseLegacyCsv(text: string): LegacyRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cur.push(field);
      field = '';
    } else if (c === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || cur.length) {
    cur.push(field);
    rows.push(cur);
  }

  const header = (rows.shift() ?? []).map((h) => h.replace(/^﻿/, '').trim());
  const idx = (name: string) => header.indexOf(name);
  const iEn = idx('en');
  const iZh = idx('zh');
  const iFrom = idx('from_dict');
  const iSkip = idx('skip');
  const iKind = idx('kind');
  if (iEn < 0 || iZh < 0) throw new Error('CSV 缺少 en / zh 列，不像是旧项目的工作表');

  return rows
    .filter((r) => r.length >= header.length)
    .map((r) => ({
      en: r[iEn] ?? '',
      zh: r[iZh] ?? '',
      fromDict: (r[iFrom] ?? '') === '1',
      skip: (r[iSkip] ?? '') === '1',
      kind: r[iKind] ?? '',
    }));
}

/**
 * 把旧译文填进 PO。只填 msgstr 为空的条目，已有译文不覆盖。
 */
export function importLegacy(
  po: PoData,
  legacy: LegacyRow[],
  opts: { includeForeign?: boolean } = {},
): ImportResult {
  const result: ImportResult = {
    total: legacy.length,
    eligible: 0,
    foreignSkipped: 0,
    applied: 0,
    unmatched: 0,
    alreadyTranslated: 0,
  };

  // 旧表按原文建索引。同一原文多行时取第一条非空译文。
  const byText = new Map<string, string>();
  for (const row of legacy) {
    if (row.skip || !row.zh.trim() || !row.en) continue;
    if (row.fromDict && !opts.includeForeign) {
      result.foreignSkipped++;
      continue;
    }
    result.eligible++;
    if (!byText.has(row.en)) byText.set(row.en, row.zh);
  }

  const entries = po.translations[''] ?? {};
  const seen = new Set<string>();

  for (const [msgid, entry] of Object.entries(entries)) {
    if (!msgid) continue;
    const existing = entry.msgstr?.find((s) => s.trim());
    if (existing) {
      result.alreadyTranslated++;
      seen.add(msgid);
      continue;
    }
    // 先精确匹配；旧表里 JSX 文本被 trim 过，所以再退一步用 trim 后的原文匹配
    const hit = byText.get(msgid) ?? byText.get(msgid.trim());
    if (hit === undefined) continue;
    entry.msgstr = [hit];
    result.applied++;
    seen.add(msgid);
  }

  for (const text of byText.keys()) {
    if (!seen.has(text) && !seen.has(text.trim())) result.unmatched++;
  }

  return result;
}
