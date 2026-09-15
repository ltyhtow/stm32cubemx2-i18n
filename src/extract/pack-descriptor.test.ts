/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPackDescriptor } from './pack-descriptor.js';

const mapping = (elements: object[]) => JSON.stringify({ series: 'Example', schema_version: '1.0.0', configurable_elements: elements }, null, 2);

test('DFP 分类、说明、功能标签可抽取，名称、协议和脚本保持数据属性', () => {
  const content = mapping([{ name: 'TIM1', category: 'Timers', description: 'Advanced timer', configurationType: 'tim',
    functions: [{ label: 'Async', configurationType: 'async', protocols: ['Serial'] }],
    configurableElements: [{ name: 'SUB', description: 'Nested description' }],
    computed: { description: 'executeMe()' }, docLink: { label: 'Not UI text' },
  }]);
  const result = extractPackDescriptor('mapping.json', content);
  assert.deepEqual(result.map(e => e.text), ['Timers', 'Advanced timer', 'Nested description', 'Async']);
  assert.ok(result.every(e => e.translatable && content.split('\n')[e.source!.line - 1]!.includes(JSON.stringify(e.text))));
});

test('DFP 定时器通道只读取 resources 中的显示名，不收硬件名称或信号', () => {
  const content = JSON.stringify({ schema_version: '1.0.0', peripherals: [{ name: 'TIM1', pinout_signals: [{ name: 'TIM1_CH1' }], resources: [
    { id: 'CC1', name: 'Channel 1', resourceType: 'timer_channel', features: { name: 'Not UI' } },
    { id: 'OTHER', name: 'Internal code', resourceType: 'internal' },
  ] }] });
  const entries = extractPackDescriptor('chip_peripherals.json', content);
  assert.deepEqual(entries.map(e => e.text), ['Channel 1']);
  assert.equal(entries[0]!.translatable, true);
});

test('描述文件条目 ID 不随安装路径或数组重排改变，重复身份拒绝', () => {
  const a = { name: 'TIM1', category: 'Timers' };
  const b = { name: 'TIM2', category: 'Timers' };
  const ids = (file: string, elements: object[]) => extractPackDescriptor(file, mapping(elements)).map(e => e.id).sort();
  assert.deepEqual(ids('v1/mapping.json', [a,b]), ids('v2/mapping.json', [b,a]));
  assert.throws(() => ids('mapping.json', [a,a]), /重复/);
});

test('同名外设的不同关联硬件均保留，关联列表重排不改变 ID', () => {
  const first = { name: 'RAMCFG', description: 'RAM controller', configurationType: 'ramcfg',
    associatedPeripherals: [{ name: 'RAMCFG.SRAM1', type: 'ram' }, { name: 'RAMCFG.SRAM2', type: 'ram' }] };
  const second = { ...first, associatedPeripherals: [{ name: 'SRAM1', type: 'ram' }, { name: 'SRAM2', type: 'ram' }] };
  const entries = extractPackDescriptor('mapping.json', mapping([first, second]));
  assert.equal(entries.length, 2);
  assert.equal(new Set(entries.map(e => e.id)).size, 2);
  const reordered = extractPackDescriptor('mapping.json', mapping([second, { ...first, associatedPeripherals: [...first.associatedPeripherals].reverse() }]));
  assert.deepEqual(entries.map(e => e.id).sort(), reordered.map(e => e.id).sort());
  assert.throws(() => extractPackDescriptor('mapping.json', mapping([first, first])), /重复/);
});

test('描述文件验证根结构，动态字段只登记为排除项', () => {
  for (const content of ['{', 'null', '{}', '{"schema_version":"1"}']) assert.throws(() => extractPackDescriptor('bad.json', content));
  const entries = extractPackDescriptor('mapping.json', mapping([{ name: 'TIM1', description: 'Timer {{id}}' }]));
  assert.equal(entries[0]!.translatable, false);
  assert.equal(entries[0]!.reason, 'template-concat');
});
