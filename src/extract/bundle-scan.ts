/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 扫描已构建的 bundle.js，给抽取结果做二次确认。
 *
 * 原始 TSX 负责「这句话是不是界面文案」，bundle 负责回答两件事：
 *   1. 这个字面量是否真的活到了产物里（有些会被摇树或内联掉）
 *   2. 它在产物里出现几次，以及是否落在明显的代码位置
 *
 * 用 acorn 的 tokenizer 单遍扫描，不建完整 AST——28MB 的产物建 AST 会吃掉数 GB 内存。
 */
import { readFileSync } from 'node:fs';
import * as acorn from 'acorn';
import type { ExclusionReason } from '../types.js';

export interface BundleFacts {
  /** 该字面量在产物中作为字符串 token 出现的次数 */
  occurrences: number;
  /** 若所有出现位置都落在代码位置，给出原因 */
  codePosition?: ExclusionReason;
}

/** 前置 token 模式 -> 排除原因。检查字符串 token 之前的若干个 token。 */
interface CodePattern {
  reason: ExclusionReason;
  /** 倒序匹配：[前1个, 前2个, ...]，null 表示任意 */
  before: (string | null)[];
}

const CODE_PATTERNS: CodePattern[] = [
  // f.bind(void 0, "div")
  { reason: 'tag-factory', before: [',', '0', 'void', '('] },
  // setAttribute("role", "menu") —— 第二个参数
  { reason: 'dom-attribute', before: [',', null, '(', 'setAttribute'] },
  // classList.add("x") / classList.remove("x")
  { reason: 'css-class', before: ['(', null, '.', 'classList'] },
  // "...".concat("px, ")
  { reason: 'string-concat', before: ['(', 'concat', '.'] },
  // hasStringProp(o, "label") 一类的类型守卫
  { reason: 'type-guard', before: [',', null, '('] },
];

const GUARD_CALLEE = /^(has(String|Array|Boolean|Number|Object|Function)Prop|hasOwnProperty|pluck|groupBy|keyBy|sumBy|omit|matchesKeystroke)$/;

export class BundleScanner {
  /** 字面量 -> 出现次数 */
  private readonly counts = new Map<string, number>();
  /** 字面量 -> 出现在代码位置的次数 */
  private readonly codeHits = new Map<string, Map<ExclusionReason, number>>();
  readonly source: string;

  private constructor(source: string) {
    this.source = source;
  }

  static fromFile(bundlePath: string): BundleScanner {
    const scanner = new BundleScanner(readFileSync(bundlePath, 'utf8'));
    scanner.scan();
    return scanner;
  }

  private scan(): void {
    // 保留最近若干个 token 的文本，用于判断字符串所处的调用位置
    const ring: string[] = [];
    const RING = 6;

    const tokenizer = acorn.tokenizer(this.source, {
      ecmaVersion: 'latest',
      allowHashBang: true,
    });

    for (const token of tokenizer) {
      if (token.type === acorn.tokTypes.string) {
        const value = String((token as acorn.Token & { value?: unknown }).value ?? '');
        this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
        const reason = classifyByContext(ring);
        if (reason) {
          let m = this.codeHits.get(value);
          if (!m) {
            m = new Map();
            this.codeHits.set(value, m);
          }
          m.set(reason, (m.get(reason) ?? 0) + 1);
        }
      }
      // 记录 token 文本；数字/标识符/符号都按原文记
      const text = this.source.slice(token.start, token.end);
      ring.unshift(text);
      if (ring.length > RING) ring.pop();
    }
  }

  factsFor(text: string): BundleFacts {
    const occurrences = this.counts.get(text) ?? 0;
    const facts: BundleFacts = { occurrences };
    const hits = this.codeHits.get(text);
    if (hits && occurrences > 0) {
      // 只有当全部出现位置都是代码位置时才判定为不可译；
      // 混合情况交给原始 TSX 的判定，因为它更可靠
      let total = 0;
      let top: ExclusionReason | undefined;
      let topN = 0;
      for (const [reason, n] of hits) {
        total += n;
        if (n > topN) {
          topN = n;
          top = reason;
        }
      }
      if (total >= occurrences && top) facts.codePosition = top;
    }
    return facts;
  }

  /** 产物里所有不同的字符串字面量数量，供 doctor 展示规模。 */
  get distinctLiterals(): number {
    return this.counts.size;
  }
}

/** 根据字符串 token 之前的 token 序列判断它是否落在代码位置。 */
function classifyByContext(ring: string[]): ExclusionReason | undefined {
  // 类型守卫：形如 hasStringProp(x,"key") —— 前面是 ",", 标识符, "("
  if (ring[0] === ',' && ring[2] === '(' && ring[3] && GUARD_CALLEE.test(ring[3])) {
    return 'type-guard';
  }
  for (const pattern of CODE_PATTERNS) {
    let ok = true;
    for (let i = 0; i < pattern.before.length; i++) {
      const want = pattern.before[i];
      if (want === null) continue;
      if (ring[i] !== want) {
        ok = false;
        break;
      }
    }
    // 上面那条通用的 type-guard 模式太宽，只在 callee 匹配已知工具函数时才算
    if (ok && pattern.reason === 'type-guard') {
      if (!(ring[3] && GUARD_CALLEE.test(ring[3]))) continue;
    }
    if (ok) return pattern.reason;
  }
  return undefined;
}
