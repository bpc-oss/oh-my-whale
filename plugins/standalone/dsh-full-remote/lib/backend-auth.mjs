import { request } from 'node:http';

// Exchange the official launch URL only on loopback. Credentials stay in memory
// behind the proxy's existing per-device admission; never forward browser cookies.
export async function createBackendAuth({ connection, backendHost, backendPort, timeoutMs = 5000, warn = () => {} }) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(backendHost)) throw new Error('backend-auth: loopback required');
  if (typeof connection?.authenticatedUrl !== 'function') throw new Error('backend-auth: official Connection service required');
  const authority = `${backendHost === '::1' ? '[::1]' : backendHost}:${backendPort}`;
  const base = `http://${authority}/`;
  let cookie, expires = 0, timer, closed = false, pending;
  async function exchange() {
    let url;
    try { url = new URL(connection.authenticatedUrl(base)); } catch { throw new Error('backend-auth: launch URL unavailable'); }
    if (url.origin !== new URL(base).origin || url.pathname !== '/' || url.username || url.password || url.hash)
      throw new Error('backend-auth: invalid launch authority');
    const result = await new Promise((resolve, reject) => {
      const req = request(url, { headers: { host: authority, origin: new URL(base).origin } }, res => {
        const cookies = res.headers['set-cookie'] ?? [];
        const candidates = cookies.filter(c => /^dsh-auth-[A-Za-z0-9_-]+=/.test(c));
        res.resume();
        if (res.statusCode !== 303 || candidates.length !== 1) return reject(new Error('backend-auth: official exchange refused'));
        const first = candidates[0].split(';', 1)[0];
        const age = /(?:^|;)\s*Max-Age=(\d+)(?:;|$)/i.exec(candidates[0]);
        if (!/^dsh-auth-[A-Za-z0-9_-]+=[A-Za-z0-9_.-]+$/.test(first) || !age || Number(age[1]) < 2)
          return reject(new Error('backend-auth: invalid session cookie'));
        resolve({ cookie: first, age: Number(age[1]) });
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error('backend-auth: exchange timed out')));
      req.on('error', () => reject(new Error('backend-auth: exchange failed')));
      req.end();
    });
    if (closed) return;
    cookie = result.cookie; expires = Date.now() + result.age * 1000;
    schedule(Math.min(result.age * 500, 12 * 3600 * 1000));
  }
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = exchange().catch(() => { if (!closed) { warn('backend-auth: renewal failed; expired credentials will be refused'); schedule(30000); } });
    }, ms);
    timer.unref?.();
  }
  await exchange();
  return {
    cookie() {
      if (closed || !cookie || Date.now() >= expires) throw new Error('backend-auth: session expired');
      return cookie;
    },
    async close() { closed = true; clearTimeout(timer); cookie = undefined; await pending; }
  };
}
