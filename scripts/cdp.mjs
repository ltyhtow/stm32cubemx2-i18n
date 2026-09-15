/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Development-only Electron probe. Requires Node.js 22 or newer. */
export async function connectPage(endpoint = 'http://127.0.0.1:9222') {
  if (typeof WebSocket === 'undefined') throw new Error('CDP probes require Node.js 22 or newer');
  const response = await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`CDP target list: HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find(t => t.type === 'page' && /\/index\.html(?:[?#]|$)/.test(t.url));
  if (!target) throw new Error('STM32CubeMX2 index.html is not open (the splash screen is not a ready application)');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  const events = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      events.push({ text: detail.text, description: detail.exception?.description ?? '', url: detail.url ?? '' });
    }
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('CDP connection closed'));
    }
    pending.clear();
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('CDP connection timed out')); }, 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };
  return { target, call, evaluate, events, close: () => socket.close() };
}

export const pageStateExpression = `(() => {
  const api = window.__CUBEMX2_I18N__;
  const body = document.body?.innerText ?? '';
  const labels = selector => Array.from(document.querySelectorAll(selector)).map(e => e.textContent);
  const menu = labels('.p-MenuBar-itemLabel, .lm-MenuBar-itemLabel');
  const tabs = labels('.p-TabBar-tabLabel, .lm-TabBar-tabLabel');
  return {
    ready: document.readyState === 'complete' && menu.length > 0 && body.trim().length > 0,
    localeId: localStorage.getItem('localeId'),
    title: document.title,
    menu, tabs, body,
    chineseCharacters: (body.match(/[\\u4e00-\\u9fff]/g) ?? []).length,
    pseudoMarkers: (body.match(/[⟦⟧]/g) ?? []).length,
    tier2: api ? { locale: api.locale, size: api.size, lookups: api.stats.lookups, hits: api.stats.hits } : null,
    audit: api?.report() ?? null
  };
})()`;
