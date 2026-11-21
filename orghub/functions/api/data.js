const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function checkAuth(request, env) {
  const given = request.headers.get('x-admin-password') || '';
  const real = env.ADMIN_PASSWORD || '';
  if (!real) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, real].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  const row = await env.DB.prepare("SELECT value FROM store WHERE key='data'").first();
  if (!row) return json(null);
  const data = JSON.parse(row.value);
  const admin = request.headers.has('x-admin-password') && await checkAuth(request, env);
  if (admin) return json(data);
  let codes = {};
  try { codes = JSON.parse(decodeURIComponent(request.headers.get('x-section-codes') || '{}')); } catch {}
  data.sections = (data.sections || []).map(s => {
    const { accessCode, ...pub } = s;
    if (!accessCode || codes[s.id] === accessCode) return pub;
    return { id: s.id, title: s.title, subtitle: s.subtitle, locked: true, count: (s.items || []).length, items: [] };
  });
  return json(data);
}
export async function onRequestPut({ request, env }) {
  if (!(await checkAuth(request, env))) return json({ error: 'unauthorized' }, 401);
  const text = await request.text();
  if (text.length > 500000) return json({ error: 'too large' }, 413);
  let d;
  try { d = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
  if (!d || !Array.isArray(d.sections) || typeof d.settings !== 'object') return json({ error: 'bad shape' }, 400);
  await env.DB.prepare("INSERT INTO store (key,value) VALUES ('data',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(JSON.stringify({ settings: d.settings, sections: d.sections })).run();
  return json({ ok: true });
}

