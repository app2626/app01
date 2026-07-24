const TOKEN_KEY = 'ipur_token';
const USER_KEY = 'ipur_user';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  else sessionStorage.removeItem(USER_KEY);
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}

// Reads the token's expiry without verifying its signature — used only to decide
// whether to restore the logged-in UI after a page refresh. The server still
// verifies the signature on every real apiHandler call, so this can't be used
// to forge access.
export function isTokenExpired(token) {
  try {
    const payload = JSON.parse(base64UrlDecode(token.split('.')[0]));
    return !payload.exp || Date.now() > payload.exp;
  } catch {
    return true;
  }
}

let sessionExpiredHandler = null;
export function onSessionExpired(handler) {
  sessionExpiredHandler = handler;
}

function hasGasBridge() {
  return typeof google !== 'undefined' && google.script && google.script.run;
}

// Every server call goes through this one apiHandler(action, payload, token) entry point.
function callApi(action, payload) {
  return new Promise((resolve, reject) => {
    if (!hasGasBridge()) {
      reject(new Error(`google.script.run unavailable (running outside GAS) — action: ${action}`));
      return;
    }
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(new Error(err && err.message ? err.message : String(err))))
      .apiHandler(action, payload || {}, { Token: getToken() });
  });
}

async function request(action, payload) {
  const res = await callApi(action, payload);
  if (res && res.status === 'error') {
    const message = res.message || 'Request failed';
    if (action !== 'LOGIN' && /session expired|unauthorized|invalid user session/i.test(message)) {
      setToken('');
      setStoredUser(null);
      if (sessionExpiredHandler) sessionExpiredHandler(message);
    }
    throw new Error(message);
  }
  return res;
}

export const api = {
  isLive: hasGasBridge,
  login: (username, password) => request('LOGIN', { username, password }),
  changePassword: (oldPassword, newPassword) => request('CHANGE_PASSWORD', { oldPassword, newPassword }),
  describeSheet: (sheetName) => request('DESCRIBE_SHEET', { sheetName }),
  getFilterOptions: (sheetName) => request('GET_FILTER_OPTIONS', { sheetName }),
  getRecords: (sheetName, opts) => request('GET_RECORDS', { sheetName, ...opts }),
  saveRecord: (sheetName, record) => request('SAVE_RECORD', { sheetName, record }),
  deleteRecord: (sheetName, rowUid) => request('DELETE_RECORD', { sheetName, rowUid }),
};
