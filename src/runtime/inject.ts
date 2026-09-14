/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 把运行时包装注入 bundle.js。
 *
 * 只动两处单点赋值——React 的 createElement 导出与 JSX runtime 的 jsx/jsxs 导出。
 * 替换表达式本身不含任何翻译逻辑，逻辑全在我们自己的 runtime/loader.js 里，
 * 因此升级译文、切换语言都不需要重新注入。
 *
 * 三条硬性约束：
 *   1. 始终以 .orig（原始产物）为基准注入，绝不在已有补丁上叠加
 *   2. 注入后用 acorn 重新解析，解析不通过就不写盘
 *   3. 后端会优先服务 bundle.js.gz，注入后必须同步重新压缩
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as acorn from 'acorn';
import path from 'node:path';
import type { Installation } from '../types.js';

/** 注入标记。既用于幂等判断，也便于 doctor 识别。 */
export const MARKER = '/*cubemx2-translator*/';

const GLOBAL = 'window.__CUBEMX2_I18N__';

export interface InjectSite {
  what: string;
  index: number;
  original: string;
  replacement: string;
}

export class InjectError extends Error {}

/**
 * 定位 React 的 createElement 导出。
 *
 * 产物里形如 `X.createElement=Y` 的赋值不止一处——Theia 自己也有个
 * `document.createElement` 的别名导出。靠模块上下文消歧：真正的 React 模块
 * 带 react.production.min 的许可证横幅，且相邻导出里有 createContext / createRef。
 */
function findCreateElement(src: string): InjectSite {
  const re = /([A-Za-z_$][\w$]*)\.createElement\s*=\s*([A-Za-z_$][\w$]*)(?=\s*[,;])/g;
  const all = [...src.matchAll(re)];
  if (all.length === 0) throw new InjectError('未找到 createElement 导出，产物结构可能已变化');

  const isReactModule = (index: number): boolean => {
    const from = Math.max(0, index - 8000);
    const win = src.slice(from, index + 3000);
    if (win.includes('react.production.min')) return true;
    return /\.createContext\s*=/.test(win) && /\.createRef\s*=/.test(win);
  };

  const hits = all.filter((m) => isReactModule(m.index!));
  if (hits.length === 0) {
    throw new InjectError(
      `找到 ${all.length} 处 createElement 导出，但没有一处落在 React 模块内，无法确定注入点`,
    );
  }
  if (hits.length > 1) {
    throw new InjectError(`React createElement 导出有 ${hits.length} 处匹配，无法确定注入点`);
  }
  const m = hits[0]!;
  const [whole, ns, fn] = m as unknown as [string, string, string];
  return {
    what: 'createElement',
    index: m.index!,
    original: whole,
    replacement: `${ns}.createElement=${MARKER}(${GLOBAL}?${GLOBAL}.wrapCreateElement(${fn}):${fn})`,
  };
}

/**
 * 定位新 JSX 转换的导出。
 * 形如 `e.Fragment=o,e.jsx=a,e.jsxs=a`。
 */
function findJsxRuntime(src: string): InjectSite[] {
  const re =
    /([A-Za-z_$][\w$]*)\.jsx\s*=\s*([A-Za-z_$][\w$]*)\s*,\s*\1\.jsxs\s*=\s*([A-Za-z_$][\w$]*)(?=\s*[,;}])/g;
  const hits = [...src.matchAll(re)];
  if (hits.length === 0) return []; // 产物可能未用新 JSX 转换
  if (hits.length > 1) {
    throw new InjectError(`JSX runtime 导出有 ${hits.length} 处匹配，无法确定注入点`);
  }
  const m = hits[0]!;
  const [whole, ns, jsxFn, jsxsFn] = m as unknown as [string, string, string, string];
  const wrap = (fn: string) => `${MARKER}(${GLOBAL}?${GLOBAL}.wrapJsx(${fn}):${fn})`;
  return [
    {
      what: 'jsx',
      index: m.index!,
      original: whole,
      replacement: `${ns}.jsx=${wrap(jsxFn)},${ns}.jsxs=${wrap(jsxsFn)}`,
    },
  ];
}

export function findSites(src: string): InjectSite[] {
  return [findCreateElement(src), ...findJsxRuntime(src), ...findMethodSites(src)];
}

/**
 * 在方法体开头插一句翻译调用的注入点。
 *
 * React 挂钩只覆盖 React 渲染的内容；Theia 的命令面板、主菜单、标签页标题
 * 由 Lumino 渲染，够不到。这几处是它们的注册咽喉：所有命令与菜单项的标签
 * 都要流经，且都是单点匹配。
 */
interface MethodSite {
  what: string;
  /** 必须恰好匹配一次；第一个捕获组是要改写的参数名 */
  pattern: RegExp;
  /** 运行时 API 名 */
  api: 'translateCommand' | 'translateMenuLabel' | 'translateTitle';
  note: string;
}

const METHOD_SITES: MethodSite[] = [
  {
    what: 'CommandRegistry.doRegisterCommand',
    pattern: /doRegisterCommand\((\w+)\)\{(?=return this\._commands\[)/,
    api: 'translateCommand',
    note: '命令面板与快捷键提示里的命令标签',
  },
  {
    what: 'MenuModelRegistry.registerSubmenu',
    pattern: /registerSubmenu\(\w+,(\w+),\w+=\{\}\)\{(?=const\{)/,
    api: 'translateMenuLabel',
    note: '主菜单与右键菜单的子菜单标题',
  },
  {
    what: 'MenuModelRegistry.registerMenuAction',
    pattern: /registerMenuAction\(\w+,(\w+)\)\{(?=const \w+=this\.root\.getOrCreate\()/,
    api: 'translateCommand',
    note: '菜单项标签',
  },
  {
    what: 'Lumino Title.label',
    pattern: /set label\((\w+)\)\{(?=this\._label!==\1&&\(this\._label=\1,this\._changed\.emit\()/,
    api: 'translateTitle',
    note: '标签页与菜单栏的标题',
  },
];

function findMethodSites(src: string): InjectSite[] {
  const out: InjectSite[] = [];
  for (const site of METHOD_SITES) {
    const re = new RegExp(site.pattern.source, 'g');
    const hits = [...src.matchAll(re)];
    if (hits.length === 0) {
      // 产物结构变化时跳过该挂钩点而不是整体失败——少翻一处好过装不上
      continue;
    }
    if (hits.length > 1) {
      throw new InjectError(`${site.what} 有 ${hits.length} 处匹配，无法确定注入点`);
    }
    const m = hits[0]!;
    const param = m[1]!;
    out.push({
      what: site.what as InjectSite['what'],
      index: m.index!,
      original: m[0],
      replacement: `${m[0]}${MARKER}${param}=${GLOBAL}?${GLOBAL}.${site.api}(${param}):${param};`,
    });
  }
  return out;
}

export interface InjectResult {
  sites: InjectSite[];
  bytesBefore: number;
  bytesAfter: number;
  /** 基准是 .orig 还是当前 bundle.js */
  basedOn: 'orig' | 'current';
  /** 基准产物是否带有其它工具的改动 */
  foreignPatch: boolean;
}

/** 括号/引号收支，注入前后必须一致。 */
function balance(s: string): [number, number, number, number] {
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let quote = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '{') brace++;
    else if (c === '}') brace--;
    else if (c === '[') bracket++;
    else if (c === ']') bracket--;
    else if (c === '"') quote++;
  }
  return [paren, brace, bracket, quote];
}

/**
 * 执行注入。
 *
 * @param dryRun 只计算不写盘
 */
export function inject(install: Installation, dryRun = false): InjectResult {
  const hasOrig = existsSync(install.bundleOrig);
  const basePath = hasOrig ? install.bundleOrig : install.bundleJs;
  const src = readFileSync(basePath, 'utf8');

  if (src.includes(MARKER)) {
    throw new InjectError('基准产物里已有本工具的注入标记，请先 rollback');
  }

  // 当前 bundle.js 与基准不同且不含我们的标记 = 有其它工具的补丁
  let foreignPatch = false;
  if (hasOrig) {
    const current = readFileSync(install.bundleJs, 'utf8');
    foreignPatch = current !== src && !current.includes(MARKER);
  }

  const sites = findSites(src);

  // 从后往前替换，避免前面的改动影响后面的偏移
  const ordered = [...sites].sort((a, b) => b.index - a.index);
  let out = src;
  for (const site of ordered) {
    const at = out.slice(site.index, site.index + site.original.length);
    if (at !== site.original) {
      throw new InjectError(`注入点 ${site.what} 的偏移校验失败，产物可能在读取后被改动`);
    }
    out = out.slice(0, site.index) + site.replacement + out.slice(site.index + site.original.length);
  }

  // 语法闸：解析不通过就绝不写盘。旧工具那类把 bundle 改成语法错误 JS 的事故，
  // 在这一步会被当场拦下。
  try {
    acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  } catch (e) {
    throw new InjectError(`注入后产物无法解析为合法 JS，已放弃：${(e as Error).message}`);
  }

  const b0 = balance(src);
  const b1 = balance(out);
  for (let i = 0; i < 4; i++) {
    if (b0[i] !== b1[i]) {
      throw new InjectError(`注入前后括号/引号收支不一致（第 ${i} 项：${b0[i]} -> ${b1[i]}）`);
    }
  }

  if (!dryRun) {
    // 首次注入时留一份我们自己的备份，不覆盖其它工具的 .orig
    const ourBackup = install.bundleJs + '.cubemx2-translator.bak';
    if (!existsSync(ourBackup)) copyFileSync(basePath, ourBackup);

    writeFileSync(install.bundleJs, out, 'utf8');
    syncGzip(install.bundleJs);
  }

  return {
    sites,
    bytesBefore: Buffer.byteLength(src),
    bytesAfter: Buffer.byteLength(out),
    basedOn: hasOrig ? 'orig' : 'current',
    foreignPatch,
  };
}

/** 后端会优先服务预压缩的 .gz，内容变了必须同步重压。 */
export function syncGzip(jsPath: string): boolean {
  const gz = jsPath + '.gz';
  if (!existsSync(gz)) return false;
  writeFileSync(gz, gzipSync(readFileSync(jsPath), { level: 9 }));
  return true;
}

/**
 * 还原 .gz：有原始的 .gz.orig 就直接拷回（字节级一致），没有才重压。
 * 重压出来的 .gz 内容等价但字节不同，会让「与原始安装逐字节比对」的校验失败。
 */
function restoreGzip(jsPath: string): void {
  const gz = jsPath + '.gz';
  const gzOrig = gz + '.orig';
  if (existsSync(gzOrig)) copyFileSync(gzOrig, gz);
  else syncGzip(jsPath);
}

const HTML_MARKER = 'st-i18n/loader.js';

/** 在 index.html 的 bundle.js 之前插入一行加载我们的运行时。 */
export function injectHtml(install: Installation, dryRun = false): 'inserted' | 'already' {
  const html = readFileSync(install.indexHtml, 'utf8');
  if (html.includes(HTML_MARKER)) return 'already';

  const re = /<script\b[^>]*\bsrc=["']\.\/bundle\.js["'][^>]*><\/script>/;
  const m = re.exec(html);
  if (!m) throw new InjectError('index.html 里未找到 bundle.js 的 script 标签');

  const tag = `<script type="text/javascript" src="./st-i18n/loader.js" charset="utf-8"></script>\n    `;
  const out = html.slice(0, m.index) + tag + html.slice(m.index);

  if (!dryRun) {
    const backup = install.indexHtml + '.cubemx2-translator.bak';
    if (!existsSync(backup)) copyFileSync(install.indexHtml, backup);
    writeFileSync(install.indexHtml, out, 'utf8');
    syncGzip(install.indexHtml);
  }
  return 'inserted';
}

/** 回滚：优先用我们自己的备份，退而用 .orig。 */
export function rollback(install: Installation): { bundle: boolean; html: boolean } {
  let bundle = false;
  let html = false;

  const ourBackup = install.bundleJs + '.cubemx2-translator.bak';
  const source = existsSync(ourBackup)
    ? ourBackup
    : existsSync(install.bundleOrig)
      ? install.bundleOrig
      : undefined;
  if (source) {
    copyFileSync(source, install.bundleJs);
    restoreGzip(install.bundleJs);
    bundle = true;
  }

  const htmlBackup = install.indexHtml + '.cubemx2-translator.bak';
  if (existsSync(htmlBackup)) {
    copyFileSync(htmlBackup, install.indexHtml);
    restoreGzip(install.indexHtml);
    html = true;
  }

  return { bundle, html };
}

/** 当前 bundle.js 是否已被本工具注入。 */
export function isInjected(install: Installation): boolean {
  if (!existsSync(install.bundleJs)) return false;
  // 标记出现在文件靠后位置，读全文最稳妥但慢；这里做一次全量读，
  // install/doctor 都不是热路径
  return readFileSync(install.bundleJs, 'utf8').includes(MARKER);
}

/** 译文表与运行时的部署目录。 */
export function i18nDir(install: Installation): string {
  return path.join(install.frontendDir, 'st-i18n');
}
