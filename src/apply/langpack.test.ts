/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { pickVersion, readZipEntry, verifyVsix, packNameFor, LangpackError } from './langpack.js';

const AVAIL = ['1.131.0', '1.130.0', '1.108.0', '1.108.1', '1.107.0', '1.95.3'];

test('同一 major.minor 取最高 patch', () => {
  const r = pickVersion(AVAIL, '1.108.0');
  assert.equal(r.version, '1.108.1');
  assert.equal(r.exact, true);
});

test('没有同 minor 时取最接近的较低版本', () => {
  const r = pickVersion(AVAIL, '1.120.0');
  assert.equal(r.version, '1.108.1');
  assert.equal(r.exact, false);
  assert.match(r.note ?? '', /较低/);
});

test('全部比应用新时取最低版本并提示', () => {
  const r = pickVersion(['1.131.0', '1.130.0'], '1.108.0');
  assert.equal(r.version, '1.130.0');
  assert.match(r.note ?? '', /比应用的/);
});

test('识别不出 API 版本时取最新版', () => {
  const r = pickVersion(AVAIL, undefined);
  assert.equal(r.version, '1.131.0');
});

test('locale 映射：zh-cn 对应微软的 zh-hans', () => {
  assert.equal(packNameFor('zh-cn'), 'vscode-language-pack-zh-hans');
  assert.equal(packNameFor('ZH-CN'), 'vscode-language-pack-zh-hans');
  assert.throws(() => packNameFor('xx'), LangpackError);
});

/** 手工拼一个最小 zip（一个 deflate 条目），测 zip 读取与 VSIX 校验。 */
function makeZip(name: string, content: Buffer): Buffer {
  const data = deflateRawSync(content);
  const nameBuf = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // local header offset

  const cdOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

test('能从 zip 里读出指定条目', () => {
  const zip = makeZip('extension/package.json', Buffer.from('{"a":1}'));
  assert.equal(readZipEntry(zip, 'extension/package.json')?.toString(), '{"a":1}');
  assert.equal(readZipEntry(zip, 'nope'), undefined);
});

test('校验 VSIX 声明了目标语言', () => {
  const pkg = JSON.stringify({
    contributes: { localizations: [{ languageId: 'zh-cn', translations: [{ id: 'vscode' }, { id: 'x' }] }] },
  });
  const zip = makeZip('extension/package.json', Buffer.from(pkg));
  assert.deepEqual(verifyVsix(zip, 'zh-cn'), { languageId: 'zh-cn', translations: 2 });
  assert.throws(() => verifyVsix(zip, 'ja'), /没有声明 ja/);
  assert.throws(() => verifyVsix(Buffer.from('not a zip'), 'zh-cn'), /不是 VSIX/);
});
