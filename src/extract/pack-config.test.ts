/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractPackConfig, readPackConfigs } from './pack-config.js';

const schema = (properties: object) => JSON.stringify({ componentid: 'Example:Timer', type: 'object', properties }, null, 2);

test('参数 schema 只收显示标题、说明与静态提示，不收枚举值或执行表达式', () => {
  const input = schema({
    mode: {
      type: 'string', title: 'Counter mode', description: 'Choose a counting mode.',
      default: 'Free running', enum: ['Free running'],
      oneOf: [{ title: 'Continuous', const: 'Free running' }],
      actions: [{
        type: 'set', condition: 'Choose a counting mode.', message: 'A clock is required.',
        attributes: { title: 'Clock source', description: 'Use an external signal.', const: 'A clock is required.' },
        computed: { title: 'executeMe()', description: 'executeMeToo()' },
      }],
      variables: [{ name: 'title', title: 'Not a display field' }],
    },
  });
  const entries = extractPackConfig('timer_parameters.json', input);
  assert.deepEqual(entries.filter(e => e.translatable).map(e => e.text), [
    'Counter mode', 'Choose a counting mode.', 'Continuous', 'A clock is required.', 'Clock source', 'Use an external signal.',
  ]);
  assert.ok(entries.every(e => e.source && input.split('\n')[e.source.line - 1]?.includes(JSON.stringify(e.text))));
});

test('动态模板保留排除理由；数组、定义与条件分支仍按 schema 规则访问', () => {
  const entries = extractPackConfig('timer_parameters.json', schema({
    pins: { type: 'array', items: { title: 'Channel {{index}}' }, title: 'Channels' },
    pins2: { title: 'Channel ${index}' },
    choice: { if: { const: { title: 'Ignore me' } }, then: { title: 'Available clocks' } },
    fields: { $defs: { item: { title: 'Input source' } }, properties: { 'a/b~c': { title: 'A name' } } },
  }));
  assert.deepEqual(entries.filter(e => !e.translatable).map(e => e.reason), ['template-concat', 'template-concat']);
  assert.ok(entries.some(e => e.context?.endsWith('/properties/fields/properties/a~1b~0c/title')));
  assert.ok(!entries.some(e => e.text === 'Ignore me'));
  assert.ok(entries.some(e => e.text === 'Available clocks'));
  assert.ok(entries.some(e => e.text === 'Input source'));
});

test('移动安装路径、空白格式、属性顺序不改变参数条目 ID', () => {
  const before = extractPackConfig(path.join('v1', 'timer_parameters.json'), schema({ a: { title: 'A name' }, b: { title: 'A name' } }));
  const after = extractPackConfig(path.join('v2', 'timer_parameters.json'), schema({ b: { title: 'A name' }, a: { title: 'A name' } }));
  assert.equal(new Set(before.map(e => e.id)).size, 2);
  assert.deepEqual(before.map(e => e.id).sort(), after.map(e => e.id).sort());
  assert.ok(before.every(e => e.source?.file === 'pack-config/timer_parameters.json'));
});

test('拒绝普通 JSON 与损坏输入，不把任意数据当作参数表单', () => {
  for (const input of ['{', 'null', '{}', '{"type":"object","properties":{}}']) {
    assert.throws(() => extractPackConfig('input.json', input), /JSON|schema/);
  }
});

test('source 只静态读取 itemTitle 的显示模板，不执行其中代码或提取 id', () => {
  const entries = extractPackConfig('timer_parameters.json', schema({ channels: {
    type: 'array', itemTitle: 'name', source: 'runDangerousCode().map(i => ({ id: `CH${i}`, name: `Channel ${i + 1}` }))',
  }, other: { source: '({ name: "Not a display field" })' } }));
  assert.deepEqual(entries.map(e => e.text), ['Channel {}']);
  assert.equal(entries[0]!.translatable, false);
  assert.equal(entries[0]!.reason, 'template-concat');
  assert.ok(entries[0]!.context?.includes('/source/itemTitle/name/0'));
});

test('显式目录会找到隐藏 .config，并去重重复输入且跳过帮助脚本', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cubemx2-pack-test-'));
  try {
    const config = path.join(dir, '.config');
    mkdirSync(config);
    const file = path.join(config, 'timer_parameters.json');
    writeFileSync(file, schema({ input: { title: 'Input source' } }));
    writeFileSync(path.join(config, 'helper.js'), 'throw new Error("must not execute")');
    writeFileSync(path.join(config, 'data.json'), '{}');
    const result = readPackConfigs([dir, file]);
    assert.equal(result.files.length, 1);
    assert.equal(result.entries.length, 1);
    assert.throws(() => readPackConfigs([path.join(dir, 'missing')]), /ENOENT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
