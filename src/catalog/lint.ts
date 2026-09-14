/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PO 译文校验。
 *
 * 三档严重度：
 *   error   会让界面出错或文案失真：占位符丢失、禁译词被改、首尾空格丢失、
 *           `&&` 助记符数量不对、换行数不对、结构符号丢失、伪翻译标记泄漏
 *   warning 大概率是问题但需人判断：术语用了禁用译法、译文与原文完全相同、fuzzy、
 *           省略号 / 冒号收尾不一致
 *   style   中文排版：中文语境里的半角标点
 *
 * 校验只看 msgid 与 msgstr 的对应关系，不需要接触任何应用文件，可在 CI 里跑。
 */
import type { PoData } from './po.js';

export type Severity = 'error' | 'warning' | 'style';

export interface LintFinding {
  severity: Severity;
  rule: string;
  msgid: string;
  msgstr: string;
  message: string;
  refs?: string[];
}

export interface GlossaryTerm {
  en: string;
  use: string;
  avoid?: string[];
  note?: string;
}

export interface Glossary {
  locale?: string;
  /** 术语：原文出现时，译文不得使用 avoid 里的写法 */
  terms?: GlossaryTerm[];
  /** 禁译词：原文里出现就必须在译文里原样出现（区分大小写，整词匹配） */
  keep?: string[];
}

export interface LintReport {
  locale: string;
  total: number;
  translated: number;
  untranslated: number;
  fuzzy: number;
  errors: number;
  warnings: number;
  styles: number;
  findings: LintFinding[];
}

/** 内置禁译词：硬件外设、协议、产品名。术语表的 keep 会与之合并。 */
export const DEFAULT_KEEP = [
  'GPIO', 'DMA', 'NVIC', 'EXTI', 'SPI', 'I2C', 'I3C', 'UART', 'USART', 'LPUART',
  'CAN', 'FDCAN', 'USB', 'RCC', 'ADC', 'DAC', 'TIM', 'LPTIM', 'RTC', 'CMSIS',
  'HAL', 'MCU', 'MPU', 'STM32', 'STM32Cube', 'STM32CubeMX', 'STM32CubeMX2',
  'Pack', 'PDSC', 'IOC2', 'Keil', 'IAR', 'GCC', 'CMake', 'JSON', 'YAML',
  'URL', 'URI', 'API', 'SDK', 'IDE', 'Git', 'Theia',
];

/** 各种占位符：{0} ${x} {{x}} {name} %s #editor.fontSize# $(icon) $SolutionDir()$ */
const PLACEHOLDER_RE =
  /\$\{[^}]*\}|\{\{[^}]*\}\}|\{\d+\}|\{[A-Za-z_]\w*\}|%[sdif]\b|#[A-Za-z][\w.]*#|\$\([\w-]+\)|\$[A-Za-z_]+\(\)\$/g;

/** 反引号代码片段，必须原样保留 */
const CODE_SPAN_RE = /`[^`\n]+`/g;

const CJK = '一-鿿';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function multiset(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

function diffMultiset(a: string[], b: string[]): { missing: string[]; extra: string[] } {
  const ma = multiset(a);
  const mb = multiset(b);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [k, n] of ma) for (let i = (mb.get(k) ?? 0); i < n; i++) missing.push(k);
  for (const [k, n] of mb) for (let i = (ma.get(k) ?? 0); i < n; i++) extra.push(k);
  return { missing, extra };
}

/** 整词、区分大小写。词边界按「非字母数字下划线」算，兼容 STM32CubeMX2 这种带数字的。 */
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(word)}(?![A-Za-z0-9_])`).test(text);
}

/** 术语匹配：不分大小写，允许英文复数（project / projects / patches）。 */
function hasWordCI(text: string, word: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(word)}(?:e?s)?(?![A-Za-z0-9_])`, 'i').test(text);
}

const lead = (s: string) => s.length - s.replace(/^[ \t]+/, '').length;
const trail = (s: string) => s.length - s.replace(/[ \t]+$/, '').length;

/** 中文排版检查前，先把不该按中文标点要求的片段挖掉。 */
function stripCodeLike(s: string): string {
  return s
    .replace(CODE_SPAN_RE, ' ')
    .replace(PLACEHOLDER_RE, ' ')
    .replace(/\(&&[A-Za-z0-9]\)/g, ' ') // 助记符 查看(&&V)，VS Code 中文惯例就是半角括号
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[A-Za-z]:\\\S*|\/[\w./-]+/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
}

export function lintEntry(
  msgid: string,
  msgstr: string,
  flags: string[],
  opts: { locale: string; glossary?: Glossary },
): LintFinding[] {
  const out: LintFinding[] = [];
  const add = (severity: Severity, rule: string, message: string) =>
    out.push({ severity, rule, msgid, msgstr, message });

  // ---- error ----
  if (msgstr.includes('⟦') || msgstr.includes('⟧')) {
    add('error', 'pseudo', '译文里混入了伪翻译标记 ⟦⟧');
  }

  const ph = diffMultiset(msgid.match(PLACEHOLDER_RE) ?? [], msgstr.match(PLACEHOLDER_RE) ?? []);
  if (ph.missing.length) add('error', 'placeholder', `占位符丢失：${ph.missing.join(' ')}`);
  if (ph.extra.length) add('error', 'placeholder', `多出原文没有的占位符：${ph.extra.join(' ')}`);

  const cs = diffMultiset(msgid.match(CODE_SPAN_RE) ?? [], msgstr.match(CODE_SPAN_RE) ?? []);
  if (cs.missing.length) add('error', 'code-span', `反引号代码片段必须原样保留：${cs.missing.join(' ')}`);

  const keep = new Set([...DEFAULT_KEEP, ...(opts.glossary?.keep ?? [])]);
  const lost: string[] = [];
  for (const w of keep) if (hasWord(msgid, w) && !hasWord(msgstr, w)) lost.push(w);
  if (lost.length) add('error', 'keep-term', `禁译词必须原样保留：${lost.join(' ')}`);

  if (lead(msgid) !== lead(msgstr) || trail(msgid) !== trail(msgstr)) {
    const hint = flags.includes('keep-whitespace') ? '（该条标了 keep-whitespace，会与相邻文字拼接）' : '';
    add('error', 'whitespace', `首尾空格必须与原文一致${hint}`);
  }

  const nl = (s: string) => (s.match(/\n/g) ?? []).length;
  if (nl(msgid) !== nl(msgstr)) add('error', 'newline', `换行数不一致：原文 ${nl(msgid)}，译文 ${nl(msgstr)}`);

  const amp = (s: string) => (s.match(/&&/g) ?? []).length;
  if (amp(msgid) !== amp(msgstr)) {
    add('error', 'mnemonic', '&& 助记符数量不一致（写法如 查看(&&V)）');
  }

  const mLead = /^[ \t]*([\])}>]+)/.exec(msgid);
  if (mLead && !msgstr.trimStart().startsWith(mLead[1]!)) {
    add('error', 'structure', `开头的结构符号 ${mLead[1]} 必须保留`);
  }
  const mTrail = /([[({<]+)[ \t]*$/.exec(msgid);
  if (mTrail && !msgstr.trimEnd().endsWith(mTrail[1]!)) {
    add('error', 'structure', `结尾的结构符号 ${mTrail[1]} 必须保留`);
  }

  // ---- warning ----
  if (flags.includes('fuzzy')) add('warning', 'fuzzy', '标为 fuzzy（模糊匹配），需人工确认');

  if (/(\.\.\.|…)\s*$/.test(msgid) && !/(\.\.\.|…)\s*$/.test(msgstr)) {
    add('warning', 'ellipsis', '原文以省略号结尾，译文也应以 … 或 ... 结尾');
  }
  if (/:\s*$/.test(msgid) && !/[:：]\s*$/.test(msgstr)) {
    add('warning', 'colon', '原文以冒号结尾，译文也应以冒号结尾');
  }

  for (const t of opts.glossary?.terms ?? []) {
    if (!hasWordCI(msgid, t.en)) continue;
    const bad = (t.avoid ?? []).filter((a) => msgstr.includes(a));
    if (bad.length) {
      add('warning', 'glossary', `术语「${t.en}」应译为「${t.use}」，不用「${bad.join('」「')}」${t.note ? `——${t.note}` : ''}`);
    }
  }

  if (msgstr.trim() === msgid.trim() && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(msgid)) {
    add('warning', 'untranslated', '译文与原文相同（若是有意保留英文可忽略）');
  }

  // ---- style（仅中文 / 日文）----
  if (/^(zh|ja)/i.test(opts.locale)) {
    const s = stripCodeLike(msgstr);
    const hits = new Set<string>();
    if (new RegExp(`[${CJK}],`).test(s) || new RegExp(`,[${CJK}]`).test(s)) hits.add(',');
    if (new RegExp(`[${CJK}][:;?!]`).test(s)) {
      for (const m of s.match(new RegExp(`[${CJK}]([:;?!])`, 'g')) ?? []) hits.add(m.slice(-1));
    }
    if (new RegExp(`[${CJK}]\\.\\s*$`).test(s)) hits.add('.');
    if (new RegExp(`[${CJK}]\\(|\\)[${CJK}]`).test(s)) hits.add('()');
    if (hits.size) {
      add('style', 'punctuation', `中文语境应使用全角标点：${[...hits].join(' ')}`);
    }
  }

  return out;
}

export function lintPo(data: PoData, opts: { locale: string; glossary?: Glossary }): LintReport {
  const report: LintReport = {
    locale: opts.locale,
    total: 0,
    translated: 0,
    untranslated: 0,
    fuzzy: 0,
    errors: 0,
    warnings: 0,
    styles: 0,
    findings: [],
  };

  for (const entries of Object.values(data.translations)) {
    for (const [msgid, entry] of Object.entries(entries)) {
      if (!msgid) continue;
      report.total++;
      const msgstr = entry.msgstr?.[0] ?? '';
      const flags = (entry.comments?.flag ?? '').split(',').map((f) => f.trim()).filter(Boolean);
      const refs = (entry.comments?.reference ?? '').split('\n').map((r) => r.trim()).filter(Boolean);

      if (!msgstr.trim()) {
        report.untranslated++;
        continue;
      }
      report.translated++;
      if (flags.includes('fuzzy')) report.fuzzy++;

      for (const f of lintEntry(msgid, msgstr, flags, opts)) {
        if (refs.length) f.refs = refs.slice(0, 3);
        report.findings.push(f);
        if (f.severity === 'error') report.errors++;
        else if (f.severity === 'warning') report.warnings++;
        else report.styles++;
      }
    }
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, style: 2 };
  report.findings.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));
  return report;
}

const TAG: Record<Severity, string> = { error: 'E', warning: 'W', style: 'S' };

export function formatReport(report: LintReport, opts: { max?: number } = {}): string {
  const max = opts.max ?? 200;
  const lines: string[] = [];
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  for (const f of report.findings.slice(0, max)) {
    lines.push(`[${TAG[f.severity]}] ${f.rule.padEnd(12)} ${f.message}`);
    lines.push(`      原文: ${JSON.stringify(clip(f.msgid, 90))}`);
    lines.push(`      译文: ${JSON.stringify(clip(f.msgstr, 90))}`);
    if (f.refs?.length) lines.push(`      位置: ${f.refs[0]}`);
  }
  if (report.findings.length > max) lines.push(`… 另有 ${report.findings.length - max} 条未显示（--max 可调）`);

  lines.push('');
  lines.push(
    `${report.locale}：${report.translated}/${report.total} 已翻译 ・ ` +
      `错误 ${report.errors} ・ 警告 ${report.warnings} ・ 排版 ${report.styles}` +
      (report.fuzzy ? ` ・ fuzzy ${report.fuzzy}` : ''),
  );
  return lines.join('\n');
}
