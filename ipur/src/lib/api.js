const TOKEN_KEY = 'ipur_token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
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
  if (res && res.status === 'error') throw new Error(res.message || 'Request failed');
  return res;
}

export const api = {
  isLive: hasGasBridge,
  login: (username, password) => request('LOGIN', { username, password }),
  describeSheet: (sheetName) => request('DESCRIBE_SHEET', { sheetName }),
  getRecords: (sheetName, opts) => request('GET_RECORDS', { sheetName, ...opts }),
  saveRecord: (sheetName, record) => request('SAVE_RECORD', { sheetName, record }),
  deleteRecord: (sheetName, rowUid) => request('DELETE_RECORD', { sheetName, rowUid }),
};
