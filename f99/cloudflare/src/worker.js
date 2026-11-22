import { D1GasEnv, acquireD1Lock, releaseD1Lock } from './gas-d1.js';
import { createGasBackend } from '../dist/backend.js';
import { INDEX_TEMPLATE } from '../dist/assets.js';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderIndex(appName, trackParam, appUrl, deepModel) {
  let html = INDEX_TEMPLATE;
  html = html.replace(/<\?=\s*appName\s*\?>/g, escHtml(appName));
  html = html.replace(/<\?!=\s*JSON\.stringify\(trackParam \|\| ''\)\s*\?>/g, JSON.stringify(trackParam || ''));
  html = html.replace(/<\?!=\s*JSON\.stringify\(appUrl \|\| ''\)\s*\?>/g, JSON.stringify(appUrl || ''));
  html = html.replace(/<\?!=\s*JSON\.stringify\(deepModel \|\| ''\)\s*\?>/g, JSON.stringify(deepModel || ''));
  return html;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'SAMEORIGIN'
};

const READ_ONLY_ACTIONS = new Set([
  'GET_ADVANCED_DASHBOARD', 'GET_TABLE', 'GET_ALL_DATA', 'GET_SETTINGS_LIST',
  'NEWS_LIST', 'GET_CUSTOMER_BY_PHONE', 'GET_INVOICES', 'TRACK_ORDER',
  'PUBLIC_TRACK_ORDER', 'VALIDATE_COUPON', 'EXPORT_BACKUP'
]);

function sheetsForAction(action, payload) {
  switch (action) {
    case 'LOGIN':
      return ['Members', 'Branches', 'AuditLog'];
    case 'PUBLIC_TRACK_ORDER':
      return ['Orders', 'OrderStatusLog', 'Settings'];
    case 'VALIDATE_COUPON':
      return ['Members', 'Coupons'];
    case 'GET_TABLE': {
      const t = payload && payload.tableName ? String(payload.tableName) : '';
      return t ? ['Members', t] : null;
    }
    case 'GET_SETTINGS_LIST':
      return ['Members', 'Settings', 'UI_Banners'];
    case 'GET_ADVANCED_DASHBOARD':
      return ['Members', 'Orders', 'Products'];
    case 'GET_INVOICES':
      return ['Members', 'Invoices', 'Settings'];
    case 'NEWS_LIST':
      return ['Members', 'News', 'NewsCategories', 'AuditLog'];
    case 'GET_ALL_DATA':
      return [
        'Members', 'Products', 'Branches', 'Channels', 'Promotions',
        'Interests', 'GiftMappings', 'AutoPromotions', 'Settings',
        'UI_Banners', 'Coupons', 'News', 'NewsCategories', 'Orders'
      ];
    case 'CHECKOUT':
      return [
        'Members', 'Products', 'Branches', 'Orders', 'InventoryLog',
        'Promotions', 'AutoPromotions', 'GiftMappings', 'Coupons', 'Settings', 'AuditLog'
      ];
    case 'SET_ORDER_STATUS':
    case 'UPDATE_FULL_ORDER':
      return ['Members', 'Orders', 'OrderStatusLog', 'Products', 'InventoryLog', 'AuditLog'];
    case 'UPLOAD_IMAGE':
      return ['Members', 'Settings', 'AuditLog'];
    case 'CHANGE_PASSWORD':
      return ['Members', 'AuditLog'];
    case 'SEND_WEBHOOK_SUMMARY':
      return ['Members', 'Settings', 'Orders', 'Products', 'AuditLog'];
    case 'SAVE_SETTINGS_ITEM':
    case 'DELETE_SETTINGS_ITEM':
      return ['Members', 'Settings', 'UI_Banners', 'AuditLog'];
    case 'NEWS_SAVE':
    case 'NEWS_DELETE':
    case 'NEWS_SET_SEQ':
    case 'NEWS_CAT_SAVE':
    case 'NEWS_CAT_DELETE':
      return ['Members', 'News', 'NewsCategories', 'AuditLog'];
    case 'SAVE_INVOICE':
    case 'APPROVE_INVOICE':
    case 'DELETE_INVOICE':
      return ['Members', 'Invoices', 'AuditLog'];
    case 'SAVE_PRODUCT_GROUP':
    case 'UPDATE_PRODUCT_GROUP':
    case 'BULK_UPDATE_PRODUCTS':
    case 'IMPORT_PRODUCTS':
      return ['Members', 'Products', 'InventoryLog', 'AuditLog'];
    case 'CLEANUP_IMAGES':
      return ['Members', 'Products', 'UI_Banners', 'News', 'Settings', 'AuditLog'];
    default:
      return null;
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Serve versioned static assets directly from Cloudflare Pages CDN (long-lived immutable cache)
      if (request.method === 'GET' && pathname.startsWith('/assets/') && env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status === 200) {
          const headers = new Headers(assetRes.headers);
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          return new Response(assetRes.body, { status: 200, headers });
        }
      }

      if (request.method === 'GET' && pathname === '/api/health') {
        const t0 = Date.now();
        try {
          const row = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM sheet_rows').first();
          return jsonResponse({
            status: 'ok',
            service: 'f9-booking',
            db: 'connected',
            dbLatencyMs: Date.now() - t0,
            rows: row ? Number(row.cnt) : 0
          });
        } catch (dbErr) {
          return jsonResponse({
            status: 'error',
            service: 'f9-booking',
            db: 'disconnected',
            message: dbErr && dbErr.message ? dbErr.message : String(dbErr)
          }, 503);
        }
      }

      if (request.method === 'GET' && pathname.startsWith('/api/images/')) {
        const id = pathname.slice('/api/images/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!id) return new Response('Not Found', { status: 404 });
        const row = await env.DB.prepare('SELECT mime_type, data_base64 FROM uploaded_images WHERE id = ?').bind(id).first();
        if (!row) return new Response('Not Found', { status: 404 });
        const bytes = Buffer.from(row.data_base64, 'base64');
        return new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': row.mime_type || 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff'
          }
        });
      }

      const gasEnv = new D1GasEnv(env.DB, url.origin, ctx, env.AUTH_SECRET);

      if (request.method === 'GET' && pathname === '/api/public-config') {
        await gasEnv.load(['UI_Banners', 'Settings']);
        const backend = createGasBackend(gasEnv.createGasGlobals());
        const cfg = backend.getPublicConfig();
        return jsonResponse(cfg);
      }

      if (request.method === 'POST' && pathname === '/api/setup') {
        const lockToken = await acquireD1Lock(env.DB);
        if (!lockToken) {
          return jsonResponse({ status: 'error', message: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง' }, 503);
        }
        try {
          await gasEnv.load();
          const backend = createGasBackend(gasEnv.createGasGlobals());
          const body = await request.json().catch(() => ({}));
          const res = backend.setupDatabase(body.userToken || null);
          await gasEnv.flush();
          return jsonResponse(res);
        } finally {
          await releaseD1Lock(env.DB, lockToken);
        }
      }

      if (request.method === 'POST' && pathname === '/api') {
        const body = await request.json().catch(() => ({}));
        const needsLock = !READ_ONLY_ACTIONS.has(body.action);
        const lockToken = needsLock ? await acquireD1Lock(env.DB) : null;
        if (needsLock && !lockToken) {
          return jsonResponse({ status: 'error', message: 'ระบบกำลังประมวลผลรายการอื่นอยู่ กรุณาลองใหม่อีกครั้ง' }, 503);
        }
        try {
          await gasEnv.load(sheetsForAction(body.action, body.payload));
          const backend = createGasBackend(gasEnv.createGasGlobals());
          const res = backend.apiHandler(body.action, body.payload || {}, body.userToken || null);
          if (body.action === 'UPLOAD_IMAGE' && res && res.status === 'success' && typeof res.url === 'string') {
            const m = res.url.match(/[?&]id=([A-Za-z0-9_-]+)/);
            if (m) res.url = url.origin + '/api/images/' + m[1];
          }
          if (body.action === 'CLEANUP_IMAGES' && res && res.status === 'success' && Array.isArray(res.referencedIds)) {
            const refSet = new Set(res.referencedIds);
            const cutoff = Date.now() - 600000;
            const imgRows = await env.DB.prepare('SELECT id, created_at FROM uploaded_images').all();
            const allRows = (imgRows && imgRows.results) ? imgRows.results : [];
            const toDelete = allRows.filter(r => !refSet.has(r.id) && Number(r.created_at || 0) < cutoff).map(r => r.id);
            for (let i = 0; i < toDelete.length; i += 50) {
              const stmts = toDelete.slice(i, i + 50).map(id => env.DB.prepare('DELETE FROM uploaded_images WHERE id = ?').bind(id));
              await env.DB.batch(stmts);
            }
            res.deleted = toDelete.length;
            res.kept = allRows.length - toDelete.length;
            delete res.referencedIds;
          }
          await gasEnv.flush();
          return jsonResponse(res);
        } finally {
          if (lockToken) await releaseD1Lock(env.DB, lockToken);
        }
      }

      if (request.method === 'GET') {
        await gasEnv.load(['Settings']);
        let appName = 'Mobile Pre Booking System';
        try {
          const settingsSheet = gasEnv.sheets['Settings'];
          if (settingsSheet) {
            const rows = settingsSheet.getDataRange().getValues();
            for (let i = 1; i < rows.length; i++) {
              if (String(rows[i][0] || '').trim() === 'SystemName' && rows[i][1]) {
                appName = String(rows[i][1]).trim();
                break;
              }
            }
          }
        } catch (e) {}

        const rawTrack = url.searchParams.get('track') || url.searchParams.get('orderId') || '';
        const trackParam = /^[A-Za-z0-9_-]{1,64}$/.test(rawTrack) ? rawTrack : '';
        const rawP = url.searchParams.get('p') || '';
        const deepModel = rawP.length <= 120 ? rawP.replace(/[<>&\u0000-\u001f\u2028\u2029]/g, '') : '';

        const html = renderIndex(appName, trackParam, url.origin, deepModel);
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            ...SECURITY_HEADERS
          }
        });
      }

      return new Response('Method Not Allowed', { status: 405 });
    } catch (err) {
      return jsonResponse({ status: 'error', message: err && err.message ? err.message : String(err) }, 500);
    }
  }
};
