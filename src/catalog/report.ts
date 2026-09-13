/**
 * 开发者文本清单（静态 HTML）。
 *
 * 需求是「足够详尽的文本列表供开发者查阅」，所以这里收录**全部**条目，
 * 包括被判为不可译的——并说明理由。翻译人员看 PO，开发者看这份。
 */
import type { Catalog, CatalogEntry } from '../types.js';

const REASON_LABEL: Record<string, string> = {
  'tag-factory': 'HTML 标签工厂参数',
  'type-guard': '类型守卫属性名',
  'dom-attribute': 'DOM 属性值',
  'css-class': 'CSS 类名',
  'css-selector': 'CSS 选择器/属性值',
  'string-concat': '字符串拼接片段',
  keybinding: '键位描述符',
  'enum-value': '枚举/状态值',
  identifier: '标识符',
  'framework-nls': '框架 NLS 已翻译（Tier 0）',
  'not-ui-position': '非界面文本位置',
};

const ROLE_LABEL: Record<string, string> = {
  'jsx-child': 'JSX 文本子节点',
  'jsx-prop': 'JSX 文本属性',
  'config-value': '配置对象文本字段',
  'command-label': '命令标签',
  'menu-label': '菜单标签',
  'nls-default': 'NLS 默认值',
  'code-value': '代码值',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/** 精简条目，减小 HTML 体积。字段名取单字母。 */
function compact(e: CatalogEntry) {
  const row: Record<string, unknown> = {
    t: e.text.length > 300 ? e.text.slice(0, 300) + '…' : e.text,
    r: e.role,
    f: e.feature,
    s: e.source ? `${e.source.file}:${e.source.line}` : '',
    n: e.occurrences,
    x: e.translatable ? 1 : 0,
    i: e.tier,
  };
  if (e.propName) row['p'] = e.propName;
  if (e.component) row['c'] = e.component;
  if (e.confidence === 'needs-review') row['w'] = 1;
  if (e.reason) row['e'] = e.reason;
  // 语境只对可译条目有用——翻译人员要看，开发者查排除项时看原文与理由就够了。
  // 两万条全带语境会让 HTML 涨到 8MB 以上。
  if (e.translatable && e.context) row['k'] = e.context.slice(0, 200);
  return row;
}

export function renderReport(catalog: Catalog): string {
  const rows = catalog.entries.map(compact);
  const features = [...new Set(catalog.entries.map((e) => e.feature))].sort();
  const s = catalog.stats;

  const reasonRows = Object.entries(s.byReason)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v]) =>
        `<tr><td>${esc(REASON_LABEL[k] ?? k)}</td><td class="num">${v}</td><td class="mono">${esc(k)}</td></tr>`,
    )
    .join('');

  const roleRows = Object.entries(s.byRole)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v]) =>
        `<tr><td>${esc(ROLE_LABEL[k] ?? k)}</td><td class="num">${v}</td><td class="mono">${esc(k)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>STM32CubeMX2 文本清单 ${esc(catalog.appVersion)}</title>
<style>
  :root {
    --bg: #fbfbfa; --fg: #1a1a18; --muted: #6b6b66; --line: #e2e2dd;
    --card: #ffffff; --accent: #0b6bcb; --ok: #1a7f4b; --no: #9a3412; --warn: #8a6d1f;
    --chip: #f0f0ec;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16161a; --fg: #e8e8e4; --muted: #9a9a94; --line: #2c2c32;
      --card: #1d1d22; --accent: #6aa9ee; --ok: #5fc08a; --no: #e8916a; --warn: #d8b45f;
      --chip: #26262c;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 14px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
  header { padding: 22px 26px 14px; border-bottom: 1px solid var(--line); }
  h1 { margin: 0 0 4px; font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 13px; }
  main { padding: 18px 26px 60px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 11px 13px; }
  .stat b { display: block; font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
  .stat span { color: var(--muted); font-size: 12px; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    position: sticky; top: 0; background: var(--bg); padding: 10px 0; z-index: 5;
    border-bottom: 1px solid var(--line); margin-bottom: 12px; }
  input[type=search], select { font: inherit; padding: 7px 10px; border-radius: 7px;
    border: 1px solid var(--line); background: var(--card); color: var(--fg); }
  input[type=search] { flex: 1 1 260px; min-width: 200px; }
  label.cb { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600;
    padding: 7px 9px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 8px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.num { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 12px; }
  .text { font-weight: 500; word-break: break-word; max-width: 420px; }
  .ctx { color: var(--muted); font-size: 11.5px; margin-top: 3px; word-break: break-all;
    font-family: ui-monospace, Consolas, monospace; }
  .chip { display: inline-block; padding: 1px 7px; border-radius: 20px; background: var(--chip);
    font-size: 11.5px; color: var(--muted); white-space: nowrap; }
  .yes { color: var(--ok); font-weight: 600; }
  .no { color: var(--no); }
  .rev { color: var(--warn); }
  .src { color: var(--muted); font-size: 11.5px; word-break: break-all; }
  .more { margin: 16px 0; }
  button { font: inherit; padding: 7px 14px; border-radius: 7px; border: 1px solid var(--line);
    background: var(--card); color: var(--fg); cursor: pointer; }
  button:hover { border-color: var(--accent); color: var(--accent); }
  details { background: var(--card); border: 1px solid var(--line); border-radius: 8px;
    padding: 10px 14px; margin-bottom: 18px; }
  summary { cursor: pointer; font-weight: 600; }
  details table { margin-top: 8px; max-width: 520px; }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1>STM32CubeMX2 文本清单</h1>
  <div class="sub">应用版本 ${esc(catalog.appVersion)} ・ 生成于 ${esc(catalog.generatedAt.slice(0, 19).replace('T', ' '))}
    ・ 本清单由使用者本机安装抽取，不随仓库分发</div>
</header>
<main>
  <div class="grid">
    <div class="stat"><b>${s.total}</b><span>条目总数</span></div>
    <div class="stat"><b class="yes">${s.translatable}</b><span>可译</span></div>
    <div class="stat"><b>${s.excluded}</b><span>已排除</span></div>
    <div class="stat"><b class="rev">${s.needsReview}</b><span>待复核</span></div>
    <div class="stat"><b>${features.length}</b><span>功能模块</span></div>
  </div>

  <details>
    <summary>分类明细</summary>
    <table><thead><tr><th>角色</th><th>条数</th><th>标识</th></tr></thead><tbody>${roleRows}</tbody></table>
    <table><thead><tr><th>排除原因</th><th>条数</th><th>标识</th></tr></thead><tbody>${reasonRows}</tbody></table>
  </details>

  <div class="controls">
    <input type="search" id="q" placeholder="搜索原文、组件、源文件…">
    <select id="feat"><option value="">全部模块</option>${features
      .map((f) => `<option>${esc(f)}</option>`)
      .join('')}</select>
    <select id="role"><option value="">全部角色</option>${Object.keys(s.byRole)
      .map((r) => `<option value="${esc(r)}">${esc(ROLE_LABEL[r] ?? r)}</option>`)
      .join('')}</select>
    <label class="cb"><input type="checkbox" id="onlyT" checked> 只看可译</label>
    <label class="cb"><input type="checkbox" id="onlyR"> 只看待复核</label>
    <span class="chip" id="count"></span>
  </div>

  <table>
    <thead><tr><th>原文</th><th>角色</th><th>模块 / 组件</th><th>源位置</th><th>出现</th><th>可译</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="more"><button id="more" hidden>显示更多</button></div>
</main>

<script id="data" type="application/json">${JSON.stringify(rows).replace(/</g, '\\u003c')}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById('data').textContent);
  var REASON = ${JSON.stringify(REASON_LABEL)};
  var ROLE = ${JSON.stringify(ROLE_LABEL)};
  var PAGE = 300;
  var shown = PAGE;
  var q = document.getElementById('q'), feat = document.getElementById('feat'),
      role = document.getElementById('role'), onlyT = document.getElementById('onlyT'),
      onlyR = document.getElementById('onlyR'), rows = document.getElementById('rows'),
      more = document.getElementById('more'), count = document.getElementById('count');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;'
           : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function filtered() {
    var term = q.value.trim().toLowerCase();
    var f = feat.value, r = role.value, t = onlyT.checked, rev = onlyR.checked;
    return DATA.filter(function (d) {
      if (t && !d.x) return false;
      if (rev && !d.w) return false;
      if (f && d.f !== f) return false;
      if (r && d.r !== r) return false;
      if (term && (d.t + ' ' + d.c + ' ' + d.s + ' ' + d.f).toLowerCase().indexOf(term) < 0) return false;
      return true;
    });
  }

  function render() {
    var list = filtered();
    count.textContent = list.length + ' 条';
    var slice = list.slice(0, shown);
    rows.innerHTML = slice.length ? slice.map(function (d) {
      var ok = d.x
        ? '<span class="yes">可译</span>'
        : '<span class="no">' + esc(REASON[d.e] || d.e || '—') + '</span>';
      if (d.w) ok += ' <span class="rev">待复核</span>';
      return '<tr>'
        + '<td class="text">' + esc(JSON.stringify(d.t).slice(1, -1))
          + (d.k ? '<div class="ctx">' + esc(d.k.slice(0, 150)) + '</div>' : '') + '</td>'
        + '<td><span class="chip">' + esc(ROLE[d.r] || d.r) + (d.p ? ' : ' + esc(d.p) : '') + '</span></td>'
        + '<td>' + esc(d.f) + (d.c ? '<div class="src">' + esc(d.c) + '</div>' : '') + '</td>'
        + '<td class="src">' + esc(d.s) + '</td>'
        + '<td class="num">' + d.n + '</td>'
        + '<td>' + ok + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="6" class="empty">没有匹配的条目</td></tr>';
    more.hidden = list.length <= shown;
  }

  [q, feat, role, onlyT, onlyR].forEach(function (el) {
    el.addEventListener('input', function () { shown = PAGE; render(); });
  });
  more.addEventListener('click', function () { shown += PAGE * 2; render(); });
  render();
})();
</script>
</body>
</html>`;
}
