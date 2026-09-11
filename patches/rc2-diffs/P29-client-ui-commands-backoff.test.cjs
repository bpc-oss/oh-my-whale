// P29 offline micro-test: extract the directory.js region from the patched browser client.js and exercise the backoff layer.
// P29b/c additions: 15s AbortController pull deadline, 250ms force-merge window, pending storm guard (forceRefresh).
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync(process.argv[2], "utf8");
let region = src.slice(src.indexOf("var Entry = class"), src.indexOf("//#endregion"));
region = region.replace("const PULL_TIMEOUT_MS = 15000;", "const PULL_TIMEOUT_MS = 60;"); // fast clock, prod value stays 15000
const { CommandDirectory, backoffDelayMs } = new Function(region + ";return { CommandDirectory, backoffDelayMs };")();
assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map(backoffDelayMs), [1000, 2000, 4000, 8000, 16000, 30000]); // delays grow, 30s cap
let calls = 0;
const fail = new CommandDirectory(async () => { calls++; throw new Error("boom"); });
const ok = new CommandDirectory(async () => { calls++; return [{ name: "x" }]; });
(async () => {
	await fail.refresh("s"); assert.strictEqual(calls, 1); // pull 1 fails -> failures=1, window 1s
	await fail.refresh("s"); assert.strictEqual(calls, 1); // inside window: NO fetch, timer armed instead
	const e = fail.entries.get("s");
	assert.strictEqual(e.failures, 1); assert.ok(e.retryTimer !== null);
	await fail.warm("s"); assert.strictEqual(calls, 2); // session-switch interaction forces through, count reset
	assert.strictEqual(fail.entries.get("s").state, "failed");
	await ok.refresh("t"); assert.strictEqual(ok.entries.get("t").failures, 0); // success clears the count
	// P29a: a hung fetcher must TIME OUT into the failure path (pending never hangs forever).
	let resolveU; const hung = new CommandDirectory(() => new Promise((r) => { resolveU = r; }));
	await hung.refresh("u");
	assert.strictEqual(hung.entries.get("u").state, "failed"); assert.strictEqual(hung.entries.get("u").failures, 1);
	assert.match(hung.entries.get("u").lastError.message, /timed out after 60ms/); resolveU([]);
	// P29b: two forces inside the merge window = one fetch; reuse path leaves failures untouched (never negative).
	let callsM = 0; const slow = new CommandDirectory(async () => { callsM++; await new Promise((r) => setTimeout(r, 80)); return []; });
	const p1 = slow.refresh("m", true);
	const flying = slow.entries.get("m").inflight;
	const p2 = slow.refresh("m", true);
	assert.strictEqual(slow.entries.get("m").inflight, flying); // merge: second force reuses the flying pull
	assert.strictEqual(callsM, 1);
	slow.entries.get("m").failures = 1; slow.refresh("m", true); // inside window: no counter churn
	assert.strictEqual(slow.entries.get("m").failures, 1); assert.strictEqual(callsM, 1); await p1;
	// P29c: forceRefresh while pending never double-fires; it re-checks once via a single armed timer.
	let callsP = 0; const pend = new CommandDirectory(async () => { callsP++; await new Promise((r) => setTimeout(r, 80)); return []; });
	pend.refresh("p", true); pend.forceRefresh("p"); pend.forceRefresh("p");
	assert.strictEqual(callsP, 1); assert.notStrictEqual(pend.entries.get("p").retryTimer, null);
	await new Promise((r) => setTimeout(r, 350));
	assert.strictEqual(callsP, 2); pend.entries.get("p").retryTimer = null; // timer fired the deferred repull
	for (const en of [...fail.entries.values(), ...ok.entries.values()]) clearTimeout(en.retryTimer);
	console.log("P29 micro-test OK: growth+cap, window blocks fetch, force wake, timeout->failure count, 250ms merge x1, pending no double-fire");
})();
