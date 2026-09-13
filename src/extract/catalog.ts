/**
 * 组装文本清单。
 *
 * 把三路信号合并成最终 catalog：
 *   - 原始 TSX（source-tsx）：这句话是不是界面文案，语境是什么
 *   - 产物扫描（bundle-scan）：它是否活到产物里，出现几次，是否落在代码位置
 *   - sourcemap：源文件路径与功能模块归属
 */
import { createHash } from 'node:crypto';
import type { Catalog, CatalogEntry, CatalogStats } from '../types.js';
import { SourceMapIndex, featureOf, isVendorSource } from './sourcemap.js';
import { BundleScanner } from './bundle-scan.js';
import { extractFromSource, hasSignificantWhitespace } from './source-tsx.js';

export interface BuildOptions {
  /** 只抽 ST 自研代码（@prg-cube）。框架文案归 Tier 0，不需要我们翻。 */
  vendorOnly?: boolean;
  /** 进度回调 */
  onProgress?: (done: number, total: number, file: string) => void;
}

/** 稳定 ID：不依赖文本 slug，避免同名撞车。 */
export function entryId(file: string, role: string, text: string, ordinal: number): string {
  return createHash('sha1').update(`${file}:${role}:${text}:${ordinal}`).digest('hex').slice(0, 12);
}

export function buildCatalog(
  map: SourceMapIndex,
  bundle: BundleScanner,
  appVersion: string,
  opts: BuildOptions = {},
): Catalog {
  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();

  const targets: number[] = [];
  for (let i = 0; i < map.sources.length; i++) {
    const file = map.sources[i]!;
    if (!/\.(tsx?|jsx?)$/i.test(file)) continue;
    if (opts.vendorOnly !== false && !isVendorSource(file)) continue;
    if (!map.sourcesContent[i]) continue;
    targets.push(i);
  }

  let done = 0;
  for (const i of targets) {
    const file = map.sources[i]!;
    const content = map.sourcesContent[i]!;
    opts.onProgress?.(++done, targets.length, file);

    const feature = featureOf(file);
    for (const raw of extractFromSource(file, content)) {
      const id = entryId(file, raw.role, raw.text, raw.ordinal);
      if (seen.has(id)) continue;
      seen.add(id);

      const facts = bundle.factsFor(raw.text);

      // 产物里根本不存在的字面量，多半被编译期内联或摇掉了，收录但标明
      let translatable = raw.translatable && facts.occurrences > 0;
      let reason = raw.reason;
      let confidence: CatalogEntry['confidence'] = 'high';

      if (translatable && facts.codePosition) {
        // 原始源码说是文案，产物说全部落在代码位置——以保守为准，转人工复核
        translatable = false;
        reason = facts.codePosition;
        confidence = 'needs-review';
      }
      if (translatable && hasSignificantWhitespace(raw.text)) {
        // 首尾空格承载语义。运行时 shim 不会 strip，所以仍可翻译，
        // 但要提醒翻译人员保留空格
        confidence = 'needs-review';
      }
      if (raw.translatable && facts.occurrences === 0) {
        reason = reason ?? 'not-ui-position';
        confidence = 'needs-review';
      }

      const tier: CatalogEntry['tier'] = raw.role === 'nls-default' ? 0 : 2;

      const entry: CatalogEntry = {
        id,
        text: raw.text,
        role: raw.role,
        feature,
        occurrences: facts.occurrences,
        translatable,
        confidence,
        tier,
        source: { file, line: raw.line },
      };
      if (raw.propName) entry.propName = raw.propName;
      if (raw.component) entry.component = raw.component;
      if (reason) entry.reason = reason;

      const context = map.contextAround(i, raw.line - 1);
      if (context) entry.context = context;

      entries.push(entry);
    }
  }

  entries.sort(
    (a, b) =>
      a.feature.localeCompare(b.feature) ||
      (a.source?.file ?? '').localeCompare(b.source?.file ?? '') ||
      (a.source?.line ?? 0) - (b.source?.line ?? 0),
  );

  return {
    appVersion,
    generatedAt: new Date().toISOString(),
    entries,
    stats: computeStats(entries),
  };
}

export function computeStats(entries: CatalogEntry[]): CatalogStats {
  const byTier: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  let translatable = 0;
  let needsReview = 0;

  for (const e of entries) {
    byTier[String(e.tier)] = (byTier[String(e.tier)] ?? 0) + 1;
    byRole[e.role] = (byRole[e.role] ?? 0) + 1;
    if (e.reason) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
    if (e.translatable) translatable++;
    if (e.confidence === 'needs-review') needsReview++;
  }

  return {
    total: entries.length,
    translatable,
    excluded: entries.length - translatable,
    needsReview,
    byTier,
    byRole,
    byReason,
  };
}
