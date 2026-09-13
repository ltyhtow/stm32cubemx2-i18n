/**
 * sourcemap 解析与双向索引。
 *
 * 目标 bundle 的 map 有 18.8MB mappings / 9503 个源文件，且带完整 sourcesContent
 * （即原始 TypeScript/TSX 源码）。全量解码约 4 秒，因此直接一次性建索引，
 * 不做惰性分段。
 */
import { readFileSync } from 'node:fs';
import { decode } from '@jridgewell/sourcemap-codec';

export interface RawSourceMap {
  version: number;
  file?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings: string;
  sourceRoot?: string;
}

/** 一个映射段：生成位置 <-> 原始位置。行号均为 0 基。 */
export interface Segment {
  genLine: number;
  genColumn: number;
  sourceIndex: number;
  sourceLine: number;
  sourceColumn: number;
}

export class SourceMapIndex {
  /** 每个生成行的段列表，按生成列升序 */
  private readonly byGenLine: Segment[][] = [];
  /** 源文件索引 -> 该源的所有段 */
  private readonly bySource = new Map<number, Segment[]>();
  /** 源文件路径（已去掉 webpack:// 前缀与查询串） */
  readonly sources: string[];
  readonly sourcesContent: (string | null)[];
  /** 源文件内容按行切好，惰性缓存 */
  private readonly lineCache = new Map<number, string[]>();

  constructor(raw: RawSourceMap) {
    this.sources = raw.sources.map(normalizeSourcePath);
    this.sourcesContent = raw.sourcesContent ?? raw.sources.map(() => null);

    const decoded = decode(raw.mappings);
    for (let genLine = 0; genLine < decoded.length; genLine++) {
      const lineSegs = decoded[genLine];
      if (!lineSegs || lineSegs.length === 0) continue;
      const out: Segment[] = [];
      for (const seg of lineSegs) {
        // 只有 4/5 元段才携带源位置；1 元段没有来源信息，跳过
        if (seg.length < 4) continue;
        const s: Segment = {
          genLine,
          genColumn: seg[0],
          sourceIndex: seg[1]!,
          sourceLine: seg[2]!,
          sourceColumn: seg[3]!,
        };
        out.push(s);
        let list = this.bySource.get(s.sourceIndex);
        if (!list) {
          list = [];
          this.bySource.set(s.sourceIndex, list);
        }
        list.push(s);
      }
      if (out.length) this.byGenLine[genLine] = out;
    }
  }

  static fromFile(mapPath: string): SourceMapIndex {
    const raw = JSON.parse(readFileSync(mapPath, 'utf8')) as RawSourceMap;
    return new SourceMapIndex(raw);
  }

  /**
   * 正向查找：生成位置 -> 原始位置。
   * 取生成列 <= 目标列的最后一个段，这是 sourcemap 的标准语义。
   */
  originFor(genLine: number, genColumn: number): Segment | undefined {
    const segs = this.byGenLine[genLine];
    if (!segs || segs.length === 0) return undefined;
    let lo = 0;
    let hi = segs.length - 1;
    let best: Segment | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const seg = segs[mid]!;
      if (seg.genColumn <= genColumn) {
        best = seg;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  /** 某个源文件的全部段。 */
  segmentsForSource(sourceIndex: number): Segment[] {
    return this.bySource.get(sourceIndex) ?? [];
  }

  sourceIndexOf(file: string): number {
    return this.sources.indexOf(file);
  }

  /** 取源文件内容，按行切分。行号 0 基。 */
  sourceLines(sourceIndex: number): string[] {
    let lines = this.lineCache.get(sourceIndex);
    if (!lines) {
      const content = this.sourcesContent[sourceIndex];
      lines = content ? content.split('\n') : [];
      this.lineCache.set(sourceIndex, lines);
    }
    return lines;
  }

  /**
   * 取某个源位置周围的代码片段，供翻译人员理解语境。
   * @param before 向上取几行
   * @param after 向下取几行
   */
  contextAround(sourceIndex: number, sourceLine: number, before = 2, after = 2): string {
    const lines = this.sourceLines(sourceIndex);
    if (lines.length === 0) return '';
    const from = Math.max(0, sourceLine - before);
    const to = Math.min(lines.length - 1, sourceLine + after);
    const out: string[] = [];
    for (let i = from; i <= to; i++) {
      out.push((lines[i] ?? '').trim());
    }
    return out.filter(Boolean).join(' ').slice(0, 300);
  }
}

/**
 * 归一化 webpack sourcemap 里的源路径。
 *
 *   webpack:///../node_modules/@prg-cube/foo/src/browser/Bar.tsx?
 *     -> @prg-cube/foo/src/browser/Bar.tsx
 */
export function normalizeSourcePath(src: string): string {
  let s = src.replace(/^webpack:\/{2,3}/, '');
  s = s.replace(/\?.*$/, '');
  s = s.replace(/^(\.\.\/)+/, '');
  s = s.replace(/^node_modules\//, '');
  // css-loader 会在真实路径前再套一层 node_modules/css-loader/...
  s = s.replace(/^css-loader\/(node_modules\/)?/, '');
  return s;
}

/**
 * 从源路径推导功能模块名。
 *   @prg-cube/cube-sw-composer/src/browser/...        -> cube-sw-composer
 *   libs/features/core/ext/core-project-export/...    -> core-project-export
 *   @theia/core/lib/...                               -> @theia/core
 */
export function featureOf(sourcePath: string): string {
  const ext = /^libs\/features\/[^/]+\/ext\/([^/]+)/.exec(sourcePath);
  if (ext) return ext[1]!;
  const area = /^libs\/features\/([^/]+)/.exec(sourcePath);
  if (area) return area[1]!;

  const scoped = /^(@[^/]+)\/([^/]+)/.exec(sourcePath);
  if (scoped) {
    const [, scope, name] = scoped;
    return scope === '@prg-cube' ? name! : `${scope}/${name}`;
  }
  const first = sourcePath.split('/')[0];
  return first ?? 'unknown';
}

/**
 * 判断某个源路径是否属于 ST 自研代码（相对于 Theia / 第三方依赖）。
 *
 * ST 的代码分布在三处源根，只看 @prg-cube 会漏掉 libs/features 下的
 * core-project-export、nvic-configuration、exti-configuration 等功能模块。
 */
export function isVendorSource(sourcePath: string): boolean {
  return (
    sourcePath.startsWith('@prg-cube/') ||
    sourcePath.startsWith('libs/features/') ||
    sourcePath.startsWith('src/')
  );
}
