#!/usr/bin/env node
/**
 * cdp-eval.mjs — evaluate JavaScript inside the running DSH Desktop renderer.
 *
 * Functional verification of the 0.2.0 port cannot be done from the host side:
 * the interesting state (model list, sidebar tabs, plugin surface, the rendered
 * conversation) lives in the renderer. The desktop is launched with
 * --remote-debugging-port, so the page can be driven directly.
 *
 * Usage:
 *   node cdp-eval.mjs <expr-file.mjs>            # run a module that exports default async (page) => result
 *   node cdp-eval.mjs --expr "document.title"    # one-liner
 *   node cdp-eval.mjs --list                     # list targets
 */
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const PORT = process.env.CDP_PORT || 9222;

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const mid = ++id;
          return new Promise((res, rej) => {
            pending.set(mid, { res, rej });
            ws.send(JSON.stringify({ id: mid, method, params }));
          });
        },
        close: () => ws.close(),
      })
    );
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.addEventListener('error', (e) => reject(new Error('ws error: ' + (e.message || 'unknown'))));
  });
}

const argv = process.argv.slice(2);
const listIdx = argv.indexOf('--list');
if (listIdx >= 0) {
  for (const t of await targets()) console.log(`${t.type}\t${t.title || ''}\t${t.url || ''}`);
  process.exit(0);
}

const exprIdx = argv.indexOf('--expr');
const code = exprIdx >= 0
  ? argv[exprIdx + 1]
  : readFileSync(argv[0], 'utf8');

const ts = await targets();
// prefer the DSH app page (http on the host port), not the shell's own window
const page = ts.find((t) => t.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+/.test(t.url || ''));
if (!page) {
  console.error('no DSH renderer page found among targets:');
  for (const t of ts) console.error('  ', t.type, t.url);
  process.exit(2);
}

const client = await connect(page.webSocketDebuggerUrl);
await client.send('Runtime.enable');

const wrapped = `(async () => { ${code} })()`;
const res = await client.send('Runtime.evaluate', {
  expression: wrapped,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
});
client.close();

if (res.exceptionDetails) {
  console.error('PAGE EXCEPTION:', res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  process.exit(1);
}
const v = res.result?.value;
console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
