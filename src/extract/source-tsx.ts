/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 从 sourcemap 的 sourcesContent 里抽取界面文案。
 *
 * 这是抽取链路的主力：拿到的是原始未压缩的 TypeScript/TSX，
 * JSX 文本子节点天然就是界面文案，不需要像扫压缩 bundle 那样靠正则猜。
 *
 * 分类原则是**默认不可译**——只有明确落在已知 UI 文本位置的字符串才进候选集，
 * 其余一律排除并记录原因。判定强度随位置可信度分级：JSX 文本子节点几乎只可能是
 * 给人看的文字，配置对象里的字段则含糊得多，用更严的过滤。
 */
import ts from 'typescript';
import type { StringRole, ExclusionReason } from '../types.js';

/** 从原始源码里抽出的一条候选。尚未与 bundle 侧信息合并。 */
export interface RawString {
  text: string;
  role: StringRole;
  propName?: string;
  component?: string;
  /** 1 基行号 */
  line: number;
  /** 同一文件内同一 (text, role) 的序号，用于生成稳定 ID */
  ordinal: number;
  translatable: boolean;
  reason?: ExclusionReason;
}

/**
 * 会被渲染成可见文字的属性名。
 * 保守起见只收语义明确的；含糊的（text / content / value）不收。
 */
const TEXT_PROPS = new Set([
  'label',
  'title',
  'tooltip',
  'placeholder',
  'ariaLabel',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'header',
  'message',
  'description',
  'alt',
  'caption',
  'summary',
  'heading',
  'subtitle',
  'subHeader',
  'hint',
  'helperText',
  'errorText',
  'errorMessage',
  'emptyMessage',
  'emptyFilterMessage',
  'leftLabel',
  'rightLabel',
  'leftLabelTooltip',
  'rightLabelTooltip',
  'displayName',
  'confirmLabel',
  'cancelLabel',
  'okLabel',
  'primaryLabel',
  'secondaryLabel',
  'buttonLabel',
  'tooltipLabel',
  'infoText',
  'labelText',
  'titleText',
  'noResultsMessage',
  'loadingMessage',
  'dialogTitle',
  'menuLabel',
  'shortTitle',
  'longTitle',
  // 以下由 propscan 对 ST 源码实测统计补全，都是真实承载界面文字的属性
  'subTitle',
  'text',
  'children',
  'prettyName',
  'clearText',
  'loadingText',
  'highlightedText',
  'dataExportButtonText',
  'defaultPlaceholder',
  'inputPlaceholder',
  'note',
  'lockedLabel',
  'collapsibleLabel',
  'activeTooltip',
  'deleteTooltipText',
  'titleAccess',
  'buttonTitle',
  'showDetailsAction',
  'content',
]);

/** 类里以常量形式声明的界面文案，形如 `static LABEL = 'Cube: Issue Reporter'`。 */
const TEXT_STATIC_NAMES = new Set([
  'LABEL',
  'TITLE',
  'TOOLTIP',
  'DESCRIPTION',
  'MESSAGE',
  'PLACEHOLDER',
  'HEADER',
  'CAPTION',
  'HINT',
]);

/**
 * 明确是代码值的属性名。命中即排除，并给出原因。
 * 这些属性的值会进 DOM 属性、CSS 类名、事件名或框架内部查找表。
 */
const CODE_PROPS = new Map<string, ExclusionReason>([
  ['className', 'css-class'],
  ['class', 'css-class'],
  ['id', 'identifier'],
  ['key', 'identifier'],
  ['ref', 'identifier'],
  ['role', 'dom-attribute'],
  ['type', 'enum-value'],
  ['kind', 'enum-value'],
  ['variant', 'enum-value'],
  ['color', 'enum-value'],
  ['size', 'enum-value'],
  ['severity', 'enum-value'],
  ['status', 'enum-value'],
  ['align', 'enum-value'],
  ['direction', 'enum-value'],
  ['position', 'enum-value'],
  ['placement', 'enum-value'],
  ['orientation', 'enum-value'],
  ['anchor', 'enum-value'],
  ['edge', 'enum-value'],
  ['mode', 'enum-value'],
  ['field', 'identifier'],
  ['name', 'identifier'],
  ['command', 'identifier'],
  ['commandId', 'identifier'],
  ['iconClass', 'css-class'],
  ['icon', 'identifier'],
  ['iconName', 'identifier'],
  ['startIconName', 'identifier'],
  ['endIconName', 'identifier'],
  ['src', 'identifier'],
  ['href', 'identifier'],
  ['keybinding', 'keybinding'],
  ['when', 'identifier'],
  ['group', 'identifier'],
  ['order', 'identifier'],
  ['sortField', 'identifier'],
  ['width', 'css-selector'],
  ['height', 'css-selector'],
  ['style', 'css-selector'],
  ['fontFamily', 'css-selector'],
  ['testId', 'identifier'],
  ['locale', 'identifier'],
  ['format', 'identifier'],
  ['encoding', 'identifier'],
  ['scheme', 'identifier'],
  ['uri', 'identifier'],
  ['path', 'identifier'],
  ['autoComplete', 'dom-attribute'],
  ['target', 'dom-attribute'],
  ['rel', 'dom-attribute'],
]);

/** 已知会接收界面文案的调用，记录「第几个参数是文案」。 */
const LABEL_CALLS = new Map<RegExp, number>([
  [/registerSubmenu$/, 1],
  [/\baddMenuLabel$/, 1],
]);

/** 形如 ctrl+shift+t / ctrlcmd+k ctrlcmd+w 的键位描述符，框架要解析，绝不能翻译。 */
const KEYBINDING_RE =
  /^((ctrlcmd|ctrl|cmd|meta|alt|option|shift|win)\+)+[a-z0-9`\-=[\]\\;',./]+( ((ctrlcmd|ctrl|cmd|meta|alt|option|shift|win)\+)+[a-z0-9`\-=[\]\\;',./]+)*$/i;

/**
 * 纯标识符形态。要求整串无空格——带空格的是句子，哪怕以 $ 开头
 * （`$SolutionDir()$: Maps to ...` 是说明文字，不是标识符）。
 */
const IDENTIFIER_RE =
  /^(?!\s)(?:[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*|[a-z0-9]+(?:[-_][a-z0-9]+)+|[a-z][\w-]*(?:\.[\w-]+)+|[A-Z][A-Z0-9]*_[A-Z0-9_]*|[-_$#.@][^\s]*)$/;

/**
 * CSS 片段。刻意收窄：
 *   - 类/ID 选择器要求 `.`/`#` 后面跟标识符字符（排除 `...loading` 这类省略号开头的文案）
 *   - 声明式要求属性名全小写（排除 `Cube: Refresh ...` 这类「单词: 文案」的命令标签）
 */
const CSS_RE =
  /^[\s>+~]*[.#][a-zA-Z_-]|^@media\b|!important|^[a-z-]{2,30}\s*:\s*[^\s]+\s*;?\s*$|^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|fr)$/;

/** 判定强度分级。位置越可信，过滤越宽松。 */
type Strictness = 'jsx-child' | 'text-prop' | 'ambiguous';

/**
 * 判定一段文本是否不该翻译。
 *
 * @param strictness 该字符串所处位置的可信度。JSX 文本子节点按定义就是显示文字，
 *                   只需排掉键位描述符与无字母的片段；配置对象里的字段则全套过滤。
 */
export function looksLikeCode(text: string, strictness: Strictness): ExclusionReason | undefined {
  const t = text.trim();
  if (!t) return 'not-ui-position';
  if (!/[A-Za-z]/.test(t)) return 'not-ui-position';
  if (KEYBINDING_RE.test(t)) return 'keybinding';

  if (strictness === 'jsx-child') return undefined;

  // 带空格的多词串是句子，不再按标识符/CSS 判
  const multiWord = /\s/.test(t);
  if (!multiWord && IDENTIFIER_RE.test(t)) return 'identifier';
  if (CSS_RE.test(t)) return 'css-selector';
  if (strictness === 'ambiguous' && !multiWord && /^[a-z]+$/.test(t)) {
    // 配置对象里的单个小写词多半是枚举值而非文案
    return 'enum-value';
  }
  return undefined;
}

/**
 * 判断一个值是否像「给人看的句子」。
 *
 * 用于捕捉白名单覆盖不到的位置——尤其是模块级导出的界面文案常量
 * （`export const PROJECT_SAVED_SUCCESSFULLY = 'The project was saved successfully !'`）。
 *
 * 这里可以比属性白名单放开一档，因为**运行时才是安全网**：静态多收一条
 * logger 消息，代价只是浪费翻译人员一点时间（它不走 React 渲染，运行时永远不会替换它）；
 * 而静态漏收一条，界面上就是永久的英文。
 */
export function looksLikeSentence(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 300) return false;
  if (!/\s/.test(t)) return false;              // 单个词交给属性白名单判断
  if (!/^[A-Z]/.test(t)) return false;          // 界面文案通常首字母大写
  if (/[{}<>|\\]|\$\{|^\w+:\/\//.test(t)) return false; // 模板、标签、URL
  if (/^[a-z-]+\s*:/.test(t)) return false;     // CSS 声明
  return /[A-Za-z]{3}/.test(t);
}

/** 名字表明这不是界面文案的常量。 */
const NON_UI_CONST = /URL|URI|PATH|REGEX|PATTERN|SCHEME|CHANNEL|COMMAND_ID|_KEY$|_ID$|^ID_|SELECTOR|CLASS_?NAME|TEST_?ID/i;

/** 首尾空格承载语义的片段：它会被拼接到相邻内容上。 */
export function hasSignificantWhitespace(text: string): boolean {
  return text !== text.trim() && text.trim().length > 0;
}

/**
 * 按 React/Babel 的规则折叠 JSX 文本。
 *
 * 关键在于「只裁剪与换行相邻的空白」：
 *   "\n    Your project "  ->  "Your project "     尾随空格同行，必须保留
 *   " is ready.\n     "    ->  " is ready."        前导空格同行，必须保留
 *
 * 直接 `replace(/\s+/g,' ').trim()` 会把这些空格吃掉，导致折叠结果在产物里查不到。
 * 实现对齐 Babel 的 cleanJSXElementLiteralChild。
 */
export function collapseJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  let lastNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i]!)) lastNonEmpty = i;
  }
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    if (i !== 0) line = line.replace(/^[ \t]+/, '');
    if (i !== lines.length - 1) line = line.replace(/[ \t]+$/, '');
    if (!line) continue;
    if (i !== lastNonEmpty) line += ' ';
    out += line;
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  ne: '≠',
  le: '≤',
  ge: '≥',
  infin: '∞',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  harr: '↔',
  laquo: '«',
  raquo: '»',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  prime: '′',
  Prime: '″',
  frasl: '⁄',
};

/**
 * 解码 JSX 文本里的 HTML 实体。
 *
 * TypeScript 的 `JsxText.text` 保留实体原文（`&nbsp;`），而编译产物里已经是真字符，
 * 不解码就会在产物中查不到这条文案。
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** 向上找最近的、名字像组件的声明。 */
function enclosingComponent(node: ts.Node): string | undefined {
  let cur: ts.Node | undefined = node;
  while (cur) {
    if (ts.isClassDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name)) {
      const n = cur.name.text;
      if (/^[A-Z]/.test(n)) return n;
    }
    cur = cur.parent;
  }
  return undefined;
}

/**
 * 解析一个源文件，抽出全部字符串候选。
 *
 * @param fileName 仅用于 TS 判定 JSX 方言，不读盘
 * @param content  源码文本
 */
export function extractFromSource(fileName: string, content: string): RawString[] {
  const isTsx = /\.tsx$/i.test(fileName);
  const sf = ts.createSourceFile(
    isTsx ? 'f.tsx' : 'f.ts',
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const out: RawString[] = [];
  const ordinals = new Map<string, number>();

  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const push = (
    text: string,
    role: StringRole,
    node: ts.Node,
    opts: { propName?: string; translatable: boolean; reason?: ExclusionReason },
  ) => {
    if (!text) return;
    const key = `${role} ${text}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    const entry: RawString = {
      text,
      role,
      line: lineOf(node),
      ordinal,
      translatable: opts.translatable,
    };
    const component = enclosingComponent(node);
    if (component) entry.component = component;
    if (opts.propName) entry.propName = opts.propName;
    if (opts.reason) entry.reason = opts.reason;
    out.push(entry);
  };

  /** 按判定结果收录一条。 */
  const record = (
    text: string,
    role: StringRole,
    node: ts.Node,
    strictness: Strictness,
    propName?: string,
  ) => {
    const code = looksLikeCode(text, strictness);
    push(text, role, node, {
      ...(propName ? { propName } : {}),
      translatable: !code,
      ...(code ? { reason: code } : {}),
    });
  };

  /**
   * 取一个表达式里全部的字符串字面量分支（含三元、`||`、`??`）。
   * 无替换的模板字面量（`` {`文本`} ``）在 JSX 里很常见，等价于字符串字面量。
   */
  const stringBranches = (expr: ts.Expression): ts.LiteralExpression[] => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr];
    if (ts.isParenthesizedExpression(expr)) return stringBranches(expr.expression);
    if (ts.isConditionalExpression(expr)) {
      return [...stringBranches(expr.whenTrue), ...stringBranches(expr.whenFalse)];
    }
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      if (
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        return [...stringBranches(expr.left), ...stringBranches(expr.right)];
      }
    }
    return [];
  };

  const visitJsxText = (node: ts.JsxText) => {
    const text = decodeEntities(collapseJsxText(node.text));
    if (!text.trim()) return;
    record(text, 'jsx-child', node, 'jsx-child');
  };

  /** <Foo>{"文本"}</Foo> 与 <Foo>{cond ? "A" : "B"}</Foo>。 */
  const visitJsxExprChild = (node: ts.JsxExpression) => {
    if (!node.expression) return;

    // 带插值的模板：运行时拿到的是拼好的整句，而我们表里只有各个片段，
    // 按值查表永远对不上。收录并标明原因，免得开发者日后去猜为什么没翻。
    if (ts.isTemplateExpression(node.expression)) {
      const shape =
        node.expression.head.text +
        node.expression.templateSpans.map((s2) => '{}' + s2.literal.text).join('');
      if (shape.trim() && /[A-Za-z]{3}/.test(shape)) {
        push(shape, 'jsx-child', node.expression, {
          translatable: false,
          reason: 'template-concat',
        });
      }
      return;
    }

    for (const lit of stringBranches(node.expression)) {
      record(lit.text, 'jsx-child', lit, 'jsx-child');
    }
  };

  const visitJsxAttribute = (node: ts.JsxAttribute) => {
    const name = ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
    const init = node.initializer;
    if (!init) return;

    let literals: ts.LiteralExpression[] = [];
    if (ts.isStringLiteral(init)) literals = [init];
    else if (ts.isJsxExpression(init) && init.expression) {
      literals = stringBranches(init.expression);
    }
    if (literals.length === 0) return;

    const codeProp = CODE_PROPS.get(name);
    const isData = name.startsWith('data-') || name.startsWith('on');
    for (const lit of literals) {
      if (codeProp) {
        push(lit.text, 'code-value', lit, {
          propName: name,
          translatable: false,
          reason: codeProp,
        });
      } else if (isData) {
        push(lit.text, 'code-value', lit, {
          propName: name,
          translatable: false,
          reason: 'dom-attribute',
        });
      } else if (!TEXT_PROPS.has(name)) {
        push(lit.text, 'code-value', lit, {
          propName: name,
          translatable: false,
          reason: 'not-ui-position',
        });
      } else {
        record(lit.text, 'jsx-prop', lit, 'text-prop', name);
      }
    }
  };

  /**
   * 对象字面量里的文本字段。
   * 这类占 ST 硬编码文案的大头——列定义、对话框描述符、动作描述符，
   * 定义处不在 JSX 里，但最终会流入 React 渲染。
   */
  const visitProperty = (node: ts.PropertyAssignment) => {
    const name = ts.isIdentifier(node.name)
      ? node.name.text
      : ts.isStringLiteral(node.name)
        ? node.name.text
        : undefined;
    if (!name) return;

    const literals = stringBranches(node.initializer);
    if (literals.length === 0) return;

    const codeProp = CODE_PROPS.get(name);
    for (const lit of literals) {
      if (codeProp) {
        push(lit.text, 'code-value', lit, {
          propName: name,
          translatable: false,
          reason: codeProp,
        });
      } else if (TEXT_PROPS.has(name)) {
        record(lit.text, 'config-value', lit, 'text-prop', name);
      }
      // 不在白名单的属性默认不收录
    }
  };

  /**
   * 模块级的界面文案常量：`export const NO_VERSION_FOUND = 'No version found'`。
   * ST 的源码里有 170 多个这样的常量，是白名单覆盖不到的一大片。
   */
  const visitVariable = (node: ts.VariableDeclaration) => {
    if (!node.initializer || !ts.isIdentifier(node.name)) return;
    const name = node.name.text;
    if (NON_UI_CONST.test(name)) return;
    for (const lit of stringBranches(node.initializer)) {
      if (!looksLikeSentence(lit.text)) continue;
      record(lit.text, 'config-value', lit, 'jsx-child', name);
    }
  };

  /** 类里的界面文案常量：`static LABEL = 'Cube: Issue Reporter'`。 */
  const visitClassProperty = (node: ts.PropertyDeclaration) => {
    if (!node.initializer || !ts.isIdentifier(node.name)) return;
    const name = node.name.text;
    if (!TEXT_STATIC_NAMES.has(name) && !TEXT_PROPS.has(name)) return;
    for (const lit of stringBranches(node.initializer)) {
      record(lit.text, 'config-value', lit, 'text-prop', name);
    }
  };

  /** nls.localize(key, default) / localizeByDefault(text)：框架已有翻译，归 Tier 0。 */
  const visitCall = (node: ts.CallExpression) => {
    const callee = node.expression.getText(sf);
    if (/(^|\.)nls\.localize$|(^|\.)localize2?$/.test(callee)) {
      const arg = node.arguments[1];
      if (arg && ts.isStringLiteral(arg)) {
        push(arg.text, 'nls-default', arg, { translatable: false, reason: 'framework-nls' });
      }
      return;
    }
    if (/localizeByDefault$/.test(callee)) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        push(arg.text, 'nls-default', arg, { translatable: false, reason: 'framework-nls' });
      }
      return;
    }
    for (const [re, argIndex] of LABEL_CALLS) {
      if (!re.test(callee)) continue;
      const arg = node.arguments[argIndex];
      if (arg) {
        for (const lit of stringBranches(arg)) {
          record(lit.text, 'menu-label', lit, 'text-prop');
        }
      }
      return;
    }
  };

  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) visitJsxText(node);
    else if (ts.isJsxExpression(node) && isJsxChildPosition(node)) visitJsxExprChild(node);
    else if (ts.isJsxAttribute(node)) visitJsxAttribute(node);
    else if (ts.isPropertyAssignment(node)) visitProperty(node);
    else if (ts.isPropertyDeclaration(node)) visitClassProperty(node);
    else if (ts.isVariableDeclaration(node)) visitVariable(node);
    else if (ts.isCallExpression(node)) visitCall(node);
    ts.forEachChild(node, walk);
  };

  try {
    walk(sf);
  } catch {
    // 单个文件解析异常不应中断整体抽取
  }
  return out;
}

/** JsxExpression 既可能是属性值也可能是子节点，这里只认子节点位置。 */
function isJsxChildPosition(node: ts.Node): boolean {
  const p = node.parent;
  return !!p && (ts.isJsxElement(p) || ts.isJsxFragment(p));
}

export { TEXT_PROPS, CODE_PROPS, TEXT_STATIC_NAMES };
