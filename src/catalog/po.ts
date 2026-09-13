/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Gettext PO 工作流。
 *
 * 翻译人员面对的唯一格式。设计目标是让不懂代码的人也能干活：
 *   - msgid 是干净的英文原文，看不到任何 JS
 *   - `#.` 注释给出界面位置与原始 JSX 语境
 *   - `#:` 指向源文件与行号，方便开发者回查
 *   - `#,` 标记角色与注意事项（如首尾空格必须保留）
 *
 * 默认**按原文归并**，不加 msgctxt：同一句英文在界面里通常该译成同一句中文，
 * 一条 PO 条目对应一处翻译工作。确有歧义时，翻译人员可手动补 msgctxt，
 * 运行时会把带 msgctxt 的条目放进按组件消歧的二级表。
 */
import { po as gtPo } from 'gettext-parser';
import type { Catalog, CatalogEntry, RuntimeTable } from '../types.js';
import { hasSignificantWhitespace } from '../extract/source-tsx.js';

/**
 * 消歧表的键分隔符：`组件名 + NUL + 原文`。
 * 用 NUL 是因为它绝不可能出现在界面文案或组件名里。
 * 运行时 runtime/loader.js 的 SEP 必须与此一致。
 */
export const SCOPE_SEP = String.fromCharCode(0);

const HEADER_COMMENT = [
  'STM32CubeMX2 界面翻译',
  '',
  '本文件由 cubemx2-translator extract 生成。',
  '只需填写 msgstr，不要修改 msgid、#: 与 #, 行。',
  '',
  '注意事项：',
  '  - 占位符 {0} {1} ${...} %s 原样保留，顺序可调',
  '  - 标 "keep-whitespace" 的条目首尾空格有意义，必须原样保留',
  '  - 留空表示不翻译，界面会显示英文原文',
].join('\n');

interface PoTranslation {
  msgctxt?: string;
  msgid: string;
  msgstr: string[];
  comments?: {
    translator?: string;
    reference?: string;
    extracted?: string;
    flag?: string;
  };
}

type PoTranslations = Record<string, Record<string, PoTranslation>>;

interface PoData {
  charset: string;
  headers: Record<string, string>;
  translations: PoTranslations;
}

/** 把同一句原文的多处出现合并成一条，附上全部语境。 */
function groupByText(catalog: Catalog): Map<string, CatalogEntry[]> {
  const groups = new Map<string, CatalogEntry[]>();
  for (const e of catalog.entries) {
    if (!e.translatable) continue;
    const list = groups.get(e.text);
    if (list) list.push(e);
    else groups.set(e.text, [e]);
  }
  return groups;
}

function buildComments(entries: CatalogEntry[]): PoTranslation['comments'] {
  const first = entries[0]!;

  const places = new Set<string>();
  for (const e of entries) {
    places.add(e.component ? `${e.feature} → ${e.component}` : e.feature);
  }

  const extracted: string[] = [];
  extracted.push(`界面位置：${[...places].slice(0, 4).join('，')}`);
  if (first.context) extracted.push(`语境：${first.context.slice(0, 160)}`);
  if (entries.length > 1) extracted.push(`共 ${entries.length} 处使用`);
  if (hasSignificantWhitespace(first.text)) {
    extracted.push('首尾空格有意义：该片段会与相邻内容拼接，翻译时请原样保留');
  }

  const refs = entries
    .filter((e) => e.source)
    .slice(0, 8)
    .map((e) => `${e.source!.file}:${e.source!.line}`);

  const flags = new Set<string>();
  for (const e of entries) flags.add(e.role);
  if (entries.some((e) => e.confidence === 'needs-review')) flags.add('needs-review');
  if (hasSignificantWhitespace(first.text)) flags.add('keep-whitespace');

  return {
    extracted: extracted.join('\n'),
    reference: refs.join('\n'),
    flag: [...flags].join(', '),
  };
}

/** 由 catalog 生成 POT 模板（msgstr 全空）。 */
export function catalogToPot(catalog: Catalog, locale = ''): PoData {
  const translations: PoTranslations = { '': {} };
  const ctx = translations['']!;

  for (const [text, entries] of groupByText(catalog)) {
    ctx[text] = {
      msgid: text,
      msgstr: [''],
      comments: buildComments(entries),
    };
  }

  return {
    charset: 'UTF-8',
    headers: {
      'Project-Id-Version': `STM32CubeMX2 ${catalog.appVersion}`,
      'POT-Creation-Date': catalog.generatedAt,
      'MIME-Version': '1.0',
      'Content-Type': 'text/plain; charset=UTF-8',
      'Content-Transfer-Encoding': '8bit',
      'X-Generator': 'cubemx2-translator',
      'X-App-Version': catalog.appVersion,
      ...(locale ? { Language: locale } : {}),
    },
    translations,
  };
}

/**
 * 用新模板更新已有 PO，语义同 msgmerge：
 *   - 原文仍存在 -> 保留既有译文
 *   - 原文已消失 -> 丢弃（避免陈旧条目堆积）
 *   - 新增原文   -> 空 msgstr
 * 返回合并结果与统计。
 */
export function mergePo(
  pot: PoData,
  existing: PoData,
): { merged: PoData; kept: number; added: number; dropped: number } {
  let kept = 0;
  let added = 0;

  const merged: PoData = {
    charset: 'UTF-8',
    headers: { ...existing.headers, ...pot.headers, Language: existing.headers['Language'] ?? '' },
    translations: {},
  };

  const existingIds = new Set<string>();
  for (const [ctxKey, entries] of Object.entries(existing.translations)) {
    for (const msgid of Object.keys(entries)) existingIds.add(`${ctxKey}${SCOPE_SEP}${msgid}`);
  }

  for (const [ctxKey, entries] of Object.entries(pot.translations)) {
    const out: Record<string, PoTranslation> = {};
    for (const [msgid, entry] of Object.entries(entries)) {
      const prev = existing.translations[ctxKey]?.[msgid];
      const prevStr = prev?.msgstr?.filter((s) => s.trim()) ?? [];
      if (prevStr.length > 0) {
        out[msgid] = { ...entry, msgstr: prev!.msgstr };
        kept++;
      } else {
        out[msgid] = entry;
        if (msgid) added++;
      }
      existingIds.delete(`${ctxKey}${SCOPE_SEP}${msgid}`);
    }
    merged.translations[ctxKey] = out;
  }

  // 保留 PO 头（msgid 为空的那条）
  const dropped = [...existingIds].filter((k) => !k.endsWith(SCOPE_SEP)).length;
  return { merged, kept, added, dropped };
}

export function serializePo(data: PoData): Buffer {
  // gettext-parser 需要 header 条目存在才会写出头部
  const ctx = data.translations[''] ?? (data.translations[''] = {});
  if (!ctx['']) {
    ctx[''] = {
      msgid: '',
      msgstr: [
        Object.entries(data.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n') + '\n',
      ],
      comments: { translator: HEADER_COMMENT },
    };
  }
  return gtPo.compile(data as never, { foldLength: 100 });
}

export function parsePo(buf: Buffer | string): PoData {
  const parsed = gtPo.parse(buf as never, 'UTF-8') as unknown as PoData;
  parsed.translations ??= { '': {} };
  parsed.headers ??= {};
  return parsed;
}

/**
 * PO -> 运行时译文表。
 *
 * 无 msgctxt 的条目进主表（按原文查）；带 msgctxt 的进消歧表
 * （运行时用 `组件名 + NUL + 原文` 查，优先于主表）。
 */
export function poToRuntimeTable(data: PoData, locale: string): RuntimeTable {
  const strings: Record<string, string> = {};
  const scoped: Record<string, string> = {};

  for (const [ctxKey, entries] of Object.entries(data.translations)) {
    for (const [msgid, entry] of Object.entries(entries)) {
      if (!msgid) continue; // PO 头
      const value = entry.msgstr?.find((s) => s.trim());
      if (!value) continue; // 未翻译的留空，界面回落英文
      if (ctxKey) scoped[`${ctxKey}${SCOPE_SEP}${msgid}`] = value;
      else strings[msgid] = value;
    }
  }

  return { locale, strings, scoped };
}

/**
 * 生成伪翻译表。
 *
 * 把每条可译原文包成 `⟦原文⟧`，不需要任何真实译文。用途是验证：
 *   - 运行时挂钩是否真的生效
 *   - 哪些界面文案真的流经了挂钩点（带括号的就是命中了）
 *   - 哪些抽到了却在界面上看不见（说明走的不是 React 渲染路径）
 *
 * 这比拿半成品译文去装信息量大得多——未加括号的英文一眼就是覆盖缺口。
 */
export function pseudoTable(catalog: Catalog, locale = 'pseudo'): RuntimeTable {
  const strings: Record<string, string> = {};
  for (const e of catalog.entries) {
    if (!e.translatable) continue;
    // 首尾空格留在括号外，否则拼接位置会看不出原本的空格
    const lead = e.text.slice(0, e.text.length - e.text.trimStart().length);
    const trail = e.text.slice(e.text.trimEnd().length);
    strings[e.text] = `${lead}⟦${e.text.trim()}⟧${trail}`;
  }
  return { locale, strings, scoped: {} };
}

/** 统计一个 PO 的完成度。 */
export function poStats(data: PoData): { total: number; translated: number } {
  let total = 0;
  let translated = 0;
  for (const entries of Object.values(data.translations)) {
    for (const [msgid, entry] of Object.entries(entries)) {
      if (!msgid) continue;
      total++;
      if (entry.msgstr?.some((s) => s.trim())) translated++;
    }
  }
  return { total, translated };
}

export type { PoData, PoTranslation };
