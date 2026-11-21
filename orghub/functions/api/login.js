import { checkAuth } from './data.js';

export async function onRequestPost({ request, env }) {
  const ok = await checkAuth(request, env);
  return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 401, headers: { 'content-type': 'application/json' } });
}
