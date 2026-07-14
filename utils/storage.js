// History and storage management utilities

import { parseJWT } from './jwt.js';

const HISTORY_KEY = 'jwt_token_history';
const CLEARED_KEY = 'jwt_cleared';
const KEEP_HISTORY_KEY = 'jwt_keep_history';
const MAX_HISTORY_ITEMS = 150;

// Whether recently-decoded tokens are remembered. Defaults to on.
export function getKeepHistory() {
  return localStorage.getItem(KEEP_HISTORY_KEY) !== 'false';
}

export function setKeepHistory(value) {
  localStorage.setItem(KEEP_HISTORY_KEY, value ? 'true' : 'false');
}

// Whether to auto-fetch JWKS from the issuer to verify signatures.
// The only outbound network call in the app - 'manual' (on-demand only) by
// default; 'automatic' fetches on decode. Legacy 'never' values read as 'manual'.
const FETCH_KEYS_KEY = 'jwt_fetch_keys_mode';

export function getFetchKeysMode() {
  return localStorage.getItem(FETCH_KEYS_KEY) === 'automatic' ? 'automatic' : 'manual';
}

export function setFetchKeysMode(mode) {
  localStorage.setItem(FETCH_KEYS_KEY, mode === 'automatic' ? 'automatic' : 'manual');
}

// Whether to flag alg:none / unrecognized algorithms. Defaults to on.
const FLAG_WEAK_ALG_KEY = 'jwt_flag_weak_alg';

export function getFlagWeakAlg() {
  return localStorage.getItem(FLAG_WEAK_ALG_KEY) !== 'false';
}

export function setFlagWeakAlg(value) {
  localStorage.setItem(FLAG_WEAK_ALG_KEY, value ? 'true' : 'false');
}

// How many seconds before expiry a token is flagged "Expiring". Default 5 min.
const EXPIRING_THRESHOLD_KEY = 'jwt_expiring_threshold';

export function getExpiringThreshold() {
  const v = parseInt(localStorage.getItem(EXPIRING_THRESHOLD_KEY), 10);
  return Number.isFinite(v) && v > 0 ? v : 300;
}

export function setExpiringThreshold(seconds) {
  localStorage.setItem(EXPIRING_THRESHOLD_KEY, String(seconds));
}

// Timestamp display mode: 'local' | 'utc' | 'both'. Default local.
const TIMESTAMP_MODE_KEY = 'jwt_timestamp_mode';

export function getTimestampMode() {
  const v = localStorage.getItem(TIMESTAMP_MODE_KEY);
  return v === 'utc' || v === 'both' ? v : 'local';
}

export function setTimestampMode(mode) {
  localStorage.setItem(TIMESTAMP_MODE_KEY, mode);
}

// Which tab opens after decoding. Default 'header'.
const DEFAULT_TAB_KEY = 'jwt_default_tab';

export function getDefaultTab() {
  const v = localStorage.getItem(DEFAULT_TAB_KEY);
  return ['header', 'payload', 'signature', 'verify'].includes(v) ? v : 'payload';
}

export function setDefaultTab(tab) {
  localStorage.setItem(DEFAULT_TAB_KEY, tab);
}

// Default claim view: 'visual' | 'json'. Default visual.
const DEFAULT_VIEW_KEY = 'jwt_default_view';

export function getDefaultView() {
  return localStorage.getItem(DEFAULT_VIEW_KEY) === 'json' ? 'json' : 'visual';
}

export function setDefaultView(view) {
  localStorage.setItem(DEFAULT_VIEW_KEY, view === 'json' ? 'json' : 'visual');
}

export function getHistory() {
  try {
    const historyData = localStorage.getItem(HISTORY_KEY);
    let history = historyData ? JSON.parse(historyData) : [];

    // Backfill issuer for old history items
    let needsSave = false;
    history = history.map(item => {
      if (item.issuer === undefined) {
        try {
          const { payload } = parseJWT(item.token);
          item.issuer = payload.iss || null;
          item.audience = payload.aud || null;
          needsSave = true;
        } catch (e) {
          item.issuer = null;
          item.audience = null;
        }
      }
      return item;
    });

    if (needsSave) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }

    return history;
  } catch (e) {
    console.error('Failed to load history:', e);
    return [];
  }
}

export function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

export function addToHistory(token, payload) {
  if (!getKeepHistory()) return;
  const history = getHistory();

  const existingIndex = history.findIndex(item => item.token === token);
  if (existingIndex !== -1) {
    const [existing] = history.splice(existingIndex, 1);
    existing.count = (existing.count || 1) + 1;   // decoded again
    existing.decodedAt = Date.now();              // most-recent decode time
    history.unshift(existing);
    saveHistory(history);
    return;
  }

  const historyItem = {
    id: Date.now(),
    token,
    decodedAt: Date.now(),
    count: 1,
    subject: payload.sub || payload.email || payload.name || null,
    issuer: payload.iss || null,
    audience: payload.aud || null
  };

  history.unshift(historyItem);

  if (history.length > MAX_HISTORY_ITEMS) {
    history.splice(MAX_HISTORY_ITEMS);
  }

  saveHistory(history);
}

export function deleteHistoryItem(id) {
  const history = getHistory().filter(item => item.id !== id);
  saveHistory(history);
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function clearExpiredTokens() {
  const history = getHistory();
  const now = Math.floor(Date.now() / 1000);
  const filtered = history.filter(item => {
    try {
      const { payload } = parseJWT(item.token);
      return !payload.exp || payload.exp > now;
    } catch {
      return true;
    }
  });
  saveHistory(filtered);
}

export function setCleared(value) {
  if (value) {
    localStorage.setItem(CLEARED_KEY, 'true');
  } else {
    localStorage.removeItem(CLEARED_KEY);
  }
}

export function wasCleared() {
  if (localStorage.getItem(CLEARED_KEY) === 'true') {
    localStorage.removeItem(CLEARED_KEY);
    return true;
  }
  return false;
}
