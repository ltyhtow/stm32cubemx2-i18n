/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { connectPage, pageStateExpression } from './cdp.mjs';

const { values } = parseArgs({ options: {
  endpoint: { type: 'string', default: 'http://127.0.0.1:9222' },
  locale: { type: 'string' },
  'set-locale': { type: 'string' },
  expect: { type: 'string', multiple: true, default: [] },
  'expect-menu': { type: 'string', multiple: true, default: [] },
  'expect-tab': { type: 'string', multiple: true, default: [] },
  out: { type: 'string', default: 'work/validation/live.json' },
  screenshot: { type: 'string' },
  reload: { type: 'boolean', default: false },
  audit: { type: 'boolean', default: false },
} });

let page;
try {
  page = await connectPage(values.endpoint);
  await page.call('Runtime.enable');
  if (values['set-locale']) {
    await page.evaluate(`localStorage.setItem('localeId', ${JSON.stringify(values['set-locale'].toLowerCase())})`);
  }
  if (values.audit) await page.evaluate("localStorage.setItem('cubemx2TranslatorAudit', '1')");
  if (values.reload || values['set-locale'] || values.audit) {
    await page.call('Page.reload', { ignoreCache: true });
  }
  let state;
  let stableSince = Date.now();
  let previousBody = '';
  let settled = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try { state = await page.evaluate(pageStateExpression); } catch {
      state = undefined; // Reload is replacing the execution context; do not reuse an old page.
    }
    if (!state?.ready || state.body !== previousBody) stableSince = Date.now();
    previousBody = state?.body ?? '';
    const expectedVisible = state?.ready &&
      values.expect.every(text => state.body.includes(text)) &&
      values['expect-menu'].every(text => state.menu.includes(text)) &&
      values['expect-tab'].every(text => state.tabs.includes(text));
    if (expectedVisible && Date.now() - stableSince >= 2000) { settled = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const failures = [];
  if (!state?.ready) failures.push('Application did not finish rendering its menu');
  else if (!settled) failures.push('Page did not settle with the expected text within 45 seconds');
  const locale = (values.locale ?? values['set-locale'])?.toLowerCase();
  if (locale && state?.localeId?.toLowerCase() !== locale) failures.push(`Expected localeId ${locale}, got ${state?.localeId}`);
  if (locale === 'en') {
    if (state?.tier2) failures.push('English must not install runtime wrappers');
  } else if (locale) {
    if (state?.tier2?.locale?.toLowerCase() !== locale) failures.push('Runtime table locale does not match');
    if (!(state?.tier2?.size > 0 && state.tier2.hits > 0)) failures.push('Runtime translation table has no observed hits');
  }
  if (state?.pseudoMarkers) failures.push('Pseudo translation markers are visible');
  for (const expected of values.expect) if (!state?.body.includes(expected)) failures.push(`Missing visible text: ${expected}`);
  for (const expected of values['expect-menu']) if (!state?.menu.includes(expected)) failures.push(`Missing menu: ${expected}`);
  for (const expected of values['expect-tab']) if (!state?.tabs.includes(expected)) failures.push(`Missing tab: ${expected}`);
  if (page.events.length) failures.push(`${page.events.length} uncaught renderer exception(s)`);
  if (values.screenshot) {
    try {
      await page.call('Page.bringToFront');
      const shot = await page.call('Page.captureScreenshot', { format: 'png', fromSurface: false });
      mkdirSync(path.dirname(values.screenshot), { recursive: true });
      writeFileSync(values.screenshot, Buffer.from(shot.data, 'base64'));
    } catch (error) {
      failures.push(`Screenshot failed: ${error.message}`);
    }
  }
  const report = { capturedAt: new Date().toISOString(), url: page.target.url, passed: !failures.length, failures, ...state, exceptions: page.events };
  mkdirSync(path.dirname(values.out), { recursive: true });
  writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ passed: report.passed, failures, localeId: state?.localeId, menu: state?.menu, tabs: state?.tabs, tier2: state?.tier2, chineseCharacters: state?.chineseCharacters, pseudoMarkers: state?.pseudoMarkers, report: values.out }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  page?.close();
}
