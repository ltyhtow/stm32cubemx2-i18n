/*
 * STM32CubeMX2-translator 运行时。
 *
 * 由 index.html 在 bundle.js 之前同步加载，负责：
 *   1. 读取 Theia 自己的 localStorage.localeId，取出对应语言的译文表
 *   2. 暴露 wrapCreateElement / wrapJsx，供注入到 bundle 的两处包装调用
 *
 * 设计约束：
 *   - 全程 try/catch。译文表缺失、损坏、解析失败都必须静默回落英文，
 *     绝不能影响应用启动。
 *   - locale 为空或 en 时不安装任何包装，零运行时开销。
 *   - 不修改传入的 props 对象；确有改动时才浅拷贝，避免影响 React 的复用假设。
 *
 * 本文件是 Apache-2.0 项目的一部分，与 STMicroelectronics 无关联。
 */
(function () {
  'use strict';

  var SEP = '\u0000'; // 组件名与原文的分隔符，不可能出现在文案里

  /** 会被渲染成可见文字的属性。与抽取端的 TEXT_PROPS 保持一致。 */
  var TEXT_PROPS = [
    'label', 'title', 'tooltip', 'placeholder', 'ariaLabel', 'aria-label',
    'aria-description', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext',
    'header', 'message', 'description', 'alt', 'caption', 'summary', 'heading',
    'subtitle', 'subHeader', 'hint', 'helperText', 'errorText', 'errorMessage',
    'emptyMessage', 'emptyFilterMessage', 'leftLabel', 'rightLabel',
    'leftLabelTooltip', 'rightLabelTooltip', 'displayName', 'confirmLabel',
    'cancelLabel', 'okLabel', 'primaryLabel', 'secondaryLabel', 'buttonLabel',
    'tooltipLabel', 'infoText', 'labelText', 'titleText', 'noResultsMessage',
    'loadingMessage', 'dialogTitle', 'menuLabel', 'shortTitle', 'longTitle'
  ];

  function readLocale() {
    try {
      return (window.localStorage && window.localStorage.getItem('localeId')) || '';
    } catch (e) {
      return '';
    }
  }

  /** 同步读取译文表。必须同步——bundle.js 紧随其后执行，来不及等异步。 */
  function loadTable(locale) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', './st-i18n/' + encodeURIComponent(locale) + '.json', false);
      xhr.send(null);
      if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 400)) return null;
      var data = JSON.parse(xhr.responseText);
      if (!data || typeof data !== 'object') return null;
      return {
        locale: data.locale || locale,
        strings: data.strings || {},
        scoped: data.scoped || {}
      };
    } catch (e) {
      return null;
    }
  }

  var locale = readLocale();
  if (!locale || locale === 'en') return;

  var table = loadTable(locale);
  if (!table) return;

  var strings = table.strings;
  var scoped = table.scoped;
  var hasScoped = false;
  for (var _k in scoped) { if (Object.prototype.hasOwnProperty.call(scoped, _k)) { hasScoped = true; break; } }

  var stats = { lookups: 0, hits: 0, misses: Object.create(null) };
  var auditing = false;
  try {
    auditing = window.localStorage.getItem('cubemx2TranslatorAudit') === '1';
  } catch (e) { /* 忽略 */ }

  /** 取组件名，用于按组件消歧。 */
  function nameOf(type) {
    if (typeof type === 'string') return type;
    if (type && typeof type === 'object') {
      // React.memo / forwardRef 包装后真实组件在 .type / .render 上
      if (type.displayName) return type.displayName;
      if (type.type) return nameOf(type.type);
      if (type.render) return nameOf(type.render);
      return '';
    }
    if (typeof type === 'function') return type.displayName || type.name || '';
    return '';
  }

  function translate(text, owner) {
    if (typeof text !== 'string' || text.length === 0) return text;
    stats.lookups++;
    if (hasScoped && owner) {
      var s = scoped[owner + SEP + text];
      if (typeof s === 'string') { stats.hits++; return s; }
    }
    var v = strings[text];
    if (typeof v === 'string') { stats.hits++; return v; }
    if (auditing && /[A-Za-z]{2}/.test(text)) stats.misses[text] = (stats.misses[text] || 0) + 1;
    return text;
  }

  function shallowCopy(o) {
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }

  /** 翻译 children 里的字符串项。返回新数组或原值。 */
  function translateChildren(children, owner) {
    if (typeof children === 'string') {
      var t = translate(children, owner);
      return t === children ? children : t;
    }
    if (!Array.isArray(children)) return children;
    var copy = null;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (typeof c !== 'string') continue;
      var tc = translate(c, owner);
      if (tc !== c) {
        if (!copy) copy = children.slice();
        copy[i] = tc;
      }
    }
    return copy || children;
  }

  function translateProps(props, owner) {
    if (!props || typeof props !== 'object') return props;
    var out = null;
    for (var i = 0; i < TEXT_PROPS.length; i++) {
      var k = TEXT_PROPS[i];
      var v = props[k];
      if (typeof v !== 'string' || v.length === 0) continue;
      var t = translate(v, owner);
      if (t !== v) {
        if (!out) out = shallowCopy(props);
        out[k] = t;
      }
    }
    if ('children' in props) {
      var ch = props.children;
      var tc = translateChildren(ch, owner);
      if (tc !== ch) {
        if (!out) out = shallowCopy(props);
        out.children = tc;
      }
    }
    return out || props;
  }

  /** 包装 React.createElement(type, props, ...children)。 */
  function wrapCreateElement(orig) {
    if (typeof orig !== 'function') return orig;
    var wrapped = function (type, props) {
      try {
        var owner = nameOf(type);
        var n = arguments.length;
        var newProps = translateProps(props, owner);
        if (n <= 2) return orig.call(this, type, newProps);
        var args = new Array(n);
        args[0] = type;
        args[1] = newProps;
        for (var i = 2; i < n; i++) {
          var c = arguments[i];
          args[i] = typeof c === 'string' ? translate(c, owner) : c;
        }
        return orig.apply(this, args);
      } catch (e) {
        return orig.apply(this, arguments);
      }
    };
    for (var key in orig) {
      if (Object.prototype.hasOwnProperty.call(orig, key)) wrapped[key] = orig[key];
    }
    return wrapped;
  }

  /** 包装新 JSX 转换的 jsx(type, props, key)。children 在 props 里。 */
  function wrapJsx(orig) {
    if (typeof orig !== 'function') return orig;
    var wrapped = function (type, props, key) {
      try {
        var newProps = translateProps(props, nameOf(type));
        return arguments.length <= 2
          ? orig.call(this, type, newProps)
          : orig.call(this, type, newProps, key);
      } catch (e) {
        return orig.apply(this, arguments);
      }
    };
    for (var k in orig) {
      if (Object.prototype.hasOwnProperty.call(orig, k)) wrapped[k] = orig[k];
    }
    return wrapped;
  }

  var api = {
    version: 1,
    locale: table.locale,
    size: Object.keys(strings).length,
    wrapCreateElement: wrapCreateElement,
    wrapJsx: wrapJsx,
    translate: translate,
    stats: stats,
    /** 审计模式：导出界面上出现过、但译文表里没有的英文。 */
    report: function () {
      var out = [];
      for (var k in stats.misses) {
        if (Object.prototype.hasOwnProperty.call(stats.misses, k)) {
          out.push({ text: k, count: stats.misses[k] });
        }
      }
      out.sort(function (a, b) { return b.count - a.count; });
      return { locale: table.locale, lookups: stats.lookups, hits: stats.hits, missing: out };
    }
  };

  try {
    Object.defineProperty(window, '__CUBEMX2_I18N__', { value: api, writable: false });
  } catch (e) {
    window.__CUBEMX2_I18N__ = api;
  }
})();
