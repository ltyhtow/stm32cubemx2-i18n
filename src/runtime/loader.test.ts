/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 运行时 shim 的行为测试。
 *
 * 在模拟的 window/localStorage/XHR 环境里加载 runtime/loader.js，
 * 用一个假的 React.createElement 验证：
 *   - 子节点与白名单属性被翻译
 *   - 非白名单属性、非字符串值不受影响
 *   - 原 props 对象不被修改
 *   - 原函数抛错时包装层不改变行为
 *   - locale 为空 / 表加载失败时不安装包装
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RUNTIME = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'runtime',
  'loader.js',
);

interface Api {
  locale: string;
  size: number;
  wrapCreateElement: (f: Function) => Function;
  wrapJsx: (f: Function) => Function;
  translate: (s: string, owner?: string) => string;
  report: () => { missing: { text: string; count: number }[] };
}

/** 在沙箱里跑 loader.js，返回它挂到 window 上的 API（未安装则返回 undefined）。 */
function loadRuntime(opts: {
  locale?: string | null;
  table?: unknown;
  status?: number;
  audit?: boolean;
}): Api | undefined {
  const store: Record<string, string> = {};
  if (opts.locale) store['localeId'] = opts.locale;
  if (opts.audit) store['cubemx2TranslatorAudit'] = '1';

  const body = opts.table === undefined ? '' : JSON.stringify(opts.table);

  class FakeXHR {
    status = opts.status ?? 200;
    responseText = body;
    open() {}
    send() {
      if (opts.table === undefined) throw new Error('network');
    }
  }

  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k]! : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
    XMLHttpRequest: FakeXHR,
  };
  win['window'] = win;

  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(RUNTIME, 'utf8'), ctx);
  return win['__CUBEMX2_I18N__'] as Api | undefined;
}

/** 与 runtime/loader.js 的 SEP 、po.ts 的 SCOPE_SEP 保持一致。 */
const SEP = String.fromCharCode(0);

const TABLE = {
  locale: 'zh-CN',
  strings: {
    'Expand all': '全部展开',
    Name: '名称',
    'Your project ': '您的工程 ',
  },
  scoped: { ['PackTable' + SEP + 'Name']: 'Pack 名称' },
};

test('locale 为空时不安装包装', () => {
  assert.equal(loadRuntime({ locale: null, table: TABLE }), undefined);
});

test('locale 为 en 时不安装包装', () => {
  assert.equal(loadRuntime({ locale: 'en', table: TABLE }), undefined);
});

test('译文表加载失败时静默跳过，不抛错', () => {
  assert.equal(loadRuntime({ locale: 'zh-CN' }), undefined);
  assert.equal(loadRuntime({ locale: 'zh-CN', table: TABLE, status: 404 }), undefined);
});

test('主表按原文翻译，未命中回落原文', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  assert.equal(api.translate('Expand all'), '全部展开');
  assert.equal(api.translate('Not in table'), 'Not in table');
  assert.equal(api.size, 3);
});

test('消歧表优先于主表', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  assert.equal(api.translate('Name'), '名称');
  assert.equal(api.translate('Name', 'PackTable'), 'Pack 名称');
  assert.equal(api.translate('Name', 'OtherComponent'), '名称');
});

test('首尾空格原样保留', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  assert.equal(api.translate('Your project '), '您的工程 ');
});

test('createElement 的字符串子节点被翻译', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  const calls: unknown[][] = [];
  const wrapped = api.wrapCreateElement((...args: unknown[]) => {
    calls.push(args);
    return 'element';
  });
  wrapped('div', null, 'Expand all', 42, 'Not in table');
  assert.deepEqual(calls[0], ['div', null, '全部展开', 42, 'Not in table']);
});

test('白名单属性被翻译，其它属性原样', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  let seen: Record<string, unknown> = {};
  const wrapped = api.wrapCreateElement((_t: unknown, p: Record<string, unknown>) => {
    seen = p;
    return null;
  });
  const props = { label: 'Expand all', className: 'Expand all', count: 3 };
  wrapped('div', props);
  assert.equal(seen['label'], '全部展开');
  assert.equal(seen['className'], 'Expand all', 'className 不在白名单，必须原样');
  assert.equal(seen['count'], 3);
});

test('不修改传入的 props 对象', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  const wrapped = api.wrapCreateElement(() => null);
  const props = { label: 'Expand all' };
  wrapped('div', props);
  assert.equal(props.label, 'Expand all', '原对象必须保持不变');
});

test('无命中时直接复用原 props，不做多余拷贝', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  let seen: unknown;
  const wrapped = api.wrapCreateElement((_t: unknown, p: unknown) => {
    seen = p;
    return null;
  });
  const props = { label: 'Nothing matches' };
  wrapped('div', props);
  assert.equal(seen, props);
});

test('jsx 包装翻译 props.children', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  let seen: Record<string, unknown> = {};
  const wrapped = api.wrapJsx((_t: unknown, p: Record<string, unknown>) => {
    seen = p;
    return null;
  });
  wrapped('span', { children: 'Expand all' });
  assert.equal(seen['children'], '全部展开');

  wrapped('span', { children: ['Expand all', 1, 'Name'] });
  assert.deepEqual(seen['children'], ['全部展开', 1, '名称']);
});

test('用组件名做消歧来源', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  let seen: Record<string, unknown> = {};
  const wrapped = api.wrapJsx((_t: unknown, p: Record<string, unknown>) => {
    seen = p;
    return null;
  });
  function PackTable() {}
  wrapped(PackTable, { children: 'Name' });
  assert.equal(seen['children'], 'Pack 名称');
});

test('原函数抛错时不吞掉异常', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE })!;
  const wrapped = api.wrapCreateElement(() => {
    throw new Error('boom');
  });
  assert.throws(() => wrapped('div', null, 'Expand all'), /boom/);
});

test('审计模式记录未命中的英文', () => {
  const api = loadRuntime({ locale: 'zh-CN', table: TABLE, audit: true })!;
  api.translate('Expand all');
  api.translate('Some untranslated label');
  api.translate('Some untranslated label');
  const missing = api.report().missing;
  assert.equal(missing[0]?.text, 'Some untranslated label');
  assert.equal(missing[0]?.count, 2);
  assert.ok(!missing.some((m) => m.text === 'Expand all'));
});
