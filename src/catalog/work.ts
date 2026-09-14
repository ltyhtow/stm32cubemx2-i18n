/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 与外部翻译者（人或 AI）交换工作的 JSON 批次。
 *
 * 为什么不直接把 PO 交出去：PO 的转义、折行、注释语法对 AI 来说容易写坏，
 * 而一个「msgid -> msgstr」的 JSON 几乎不可能写坏。批次里每条自带语境、位置和注意事项，
 * 翻译方不需要接触仓库的任何其它文件。
 *
 * 导回时按 msgid 对齐（PO 里 msgid 唯一），所以批次可以任意拆分、乱序、部分交回。
 */
import type { PoData } from './po.js';

export interface WorkItem {
  /** 批内序号，只为方便对话里引用 */
  n: number;
  msgid: string;
  /** 翻译方填写；留空表示暂不翻译 */
  msgstr: string;
  /** 来自 PO 的 #, 标记：jsx-child / config-value / keep-whitespace / needs-review … */
  flags: string[];
  /** 界面位置：模块 → 组件 */
  where?: string;
  /** 原始 JSX 语境片段 */
  context?: string;
  /** 额外注意事项，如首尾空格 */
  note?: string;
  /** 源文件:行 */
  refs: string[];
}

export interface WorkBatch {
  _readme: string;
  locale: string;
  batch: number;
  of: number;
  count: number;
  items: WorkItem[];
}

const README =
  '只填写每条的 msgstr。不要改 msgid，不要增删条目，不要改 flags。' +
  '占位符 {0} ${x} `code` 原样保留；标 keep-whitespace 的条目首尾空格必须与 msgid 一致。' +
  '拿不准就把 msgstr 留空。交回时保持同一个 JSON 结构与文件名。';

/** 从 PO 的 #. 注释里拆出界面位置 / 语境 / 其它提示。 */
function parseExtracted(text: string | undefined): { where?: string; context?: string; note?: string } {
  const out: { where?: string; context?: string; note?: string } = {};
  const notes: string[] = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('界面位置：')) out.where = line.slice('界面位置：'.length);
    else if (line.startsWith('语境：')) out.context = line.slice('语境：'.length);
    else if (/^共 \d+ 处使用$/.test(line)) continue;
    else notes.push(line);
  }
  if (notes.length) out.note = notes.join('；');
  return out;
}

export function buildWorkBatches(
  data: PoData,
  opts: { locale: string; batchSize: number; includeTranslated?: boolean },
): WorkBatch[] {
  const items: Omit<WorkItem, 'n'>[] = [];

  for (const entries of Object.values(data.translations)) {
    for (const [msgid, entry] of Object.entries(entries)) {
      if (!msgid) continue;
      const msgstr = entry.msgstr?.[0] ?? '';
      if (msgstr.trim() && !opts.includeTranslated) continue;

      const flags = (entry.comments?.flag ?? '').split(',').map((f) => f.trim()).filter(Boolean);
      const refs = (entry.comments?.reference ?? '').split('\n').map((r) => r.trim()).filter(Boolean);
      const ex = parseExtracted(entry.comments?.extracted);

      items.push({
        msgid,
        msgstr,
        flags,
        ...(ex.where ? { where: ex.where } : {}),
        ...(ex.context ? { context: ex.context } : {}),
        ...(ex.note ? { note: ex.note } : {}),
        refs: refs.slice(0, 3),
      });
    }
  }

  const size = Math.max(1, opts.batchSize);
  const total = Math.ceil(items.length / size);
  const batches: WorkBatch[] = [];
  for (let b = 0; b < total; b++) {
    const slice = items.slice(b * size, (b + 1) * size);
    batches.push({
      _readme: README,
      locale: opts.locale,
      batch: b + 1,
      of: total,
      count: slice.length,
      items: slice.map((it, i) => ({ n: b * size + i + 1, ...it })),
    });
  }
  return batches;
}

export interface ApplyResult {
  applied: number;
  skippedExisting: number;
  emptyInput: number;
  unknown: string[];
}

/**
 * 把翻译方交回的条目灌进 PO。
 * 接受三种形状：批次格式 { items: [...] }、数组 [{msgid, msgstr}]、或平铺对象 { msgid: msgstr }。
 */
export function normalizeIncoming(json: unknown): { msgid: string; msgstr: string }[] {
  if (Array.isArray(json)) {
    return json
      .filter((x): x is { msgid: string; msgstr?: string } => !!x && typeof x === 'object' && typeof (x as { msgid?: unknown }).msgid === 'string')
      .map((x) => ({ msgid: x.msgid, msgstr: typeof x.msgstr === 'string' ? x.msgstr : '' }));
  }
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj['items'])) return normalizeIncoming(obj['items']);
    return Object.entries(obj)
      .filter(([k, v]) => k && !k.startsWith('_') && typeof v === 'string')
      .map(([msgid, msgstr]) => ({ msgid, msgstr: msgstr as string }));
  }
  return [];
}

export function applyWork(
  data: PoData,
  incoming: { msgid: string; msgstr: string }[],
  opts: { overwrite?: boolean; source?: string } = {},
): ApplyResult {
  const result: ApplyResult = { applied: 0, skippedExisting: 0, emptyInput: 0, unknown: [] };
  const ctx = data.translations[''] ?? (data.translations[''] = {});

  for (const { msgid, msgstr } of incoming) {
    if (!msgstr.trim()) {
      result.emptyInput++;
      continue;
    }
    const entry = ctx[msgid];
    if (!entry) {
      result.unknown.push(msgid);
      continue;
    }
    const existing = entry.msgstr?.[0] ?? '';
    if (existing.trim() && !opts.overwrite) {
      result.skippedExisting++;
      continue;
    }
    entry.msgstr = [msgstr];
    if (opts.source) {
      const c = (entry.comments ??= {});
      const tag = `译者: ${opts.source}`;
      c.translator = c.translator ? `${c.translator.replace(/^译者: .*$/m, '').trim()}\n${tag}`.trim() : tag;
    }
    result.applied++;
  }
  return result;
}
