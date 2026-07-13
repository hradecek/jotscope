// popup.js — orchestrator for the Jotscope popup UI
'use strict';

import {
  SAMPLE_JWT, parseJWT, isLikelyJWT, detectTokens,
  escapeHtml, isValidUrl,
  getTokenStatus, getTimeAgo
} from './utils/jwt.js';

import {
  getRelativeTimeShort, formatClaimDate, stackedDateHtml, formatDuration, formatCountdown
} from './utils/format.js';

import { setupTooltips } from './ui/tooltip.js';
import { copyWithFeedback } from './ui/copy.js';
import { renderClaimsVisual, renderClaimsJSON } from './ui/claims.js';

import { verifySignature, fetchJWKS, selectKeyFromJWKS, ALGORITHM_MAP } from './utils/crypto.js';

import { addToHistory, getHistory, setCleared, wasCleared, getKeepHistory, setKeepHistory, clearExpiredTokens, clearHistory, deleteHistoryItem, getFetchKeysMode, setFetchKeysMode, getFlagWeakAlg, setFlagWeakAlg, getExpiringThreshold, setExpiringThreshold, getTimestampMode, setTimestampMode, getDefaultTab, setDefaultTab, getDefaultView, setDefaultView } from './utils/storage.js';

// ── DOM references ──────────────────────────────────────────────────────────
const jwtInput          = document.getElementById('jwt-input');
const inputHint         = document.getElementById('input-hint');
const errorMessage      = document.getElementById('error-message');
const emptyState        = document.getElementById('empty-state');
const loadSampleBtn     = document.getElementById('load-sample-btn');
const pasteBtn          = document.getElementById('paste-btn');
const pasteArea         = document.getElementById('paste-area');
const recentSection     = document.getElementById('recent-section');
const recentList        = document.getElementById('recent-list');
const recentViewAllBtn  = document.getElementById('recent-view-all');
const openSettingsBtn   = document.getElementById('open-settings-btn');
const appVersion        = document.getElementById('app-version');
const tokenSelector     = document.getElementById('token-selector');
const tokenList         = document.getElementById('token-list');

const decodedView       = document.getElementById('decoded-view');
const chipEl            = document.getElementById('token-chip');
const chipToken         = document.getElementById('chip-token');
const chipClearBtn      = document.getElementById('chip-clear-btn');
const algWarning        = document.getElementById('alg-warning');
const algWarningText    = document.getElementById('alg-warning-text');

const summaryAlg        = document.getElementById('summary-alg');
const summaryStatus     = document.getElementById('summary-status');
const summaryName       = document.getElementById('summary-name');
const summaryMeta       = document.getElementById('summary-meta');
const summaryOrg        = document.getElementById('summary-org');
const summaryOrgValue   = document.getElementById('summary-org-value');
const lifetimeBlock     = document.getElementById('lifetime');
const summaryStatusSub  = document.getElementById('summary-status-sub');
const summaryStatusWrap = document.getElementById('summary-status-wrap');
const lifetimeBarFill   = document.getElementById('lifetime-bar-fill');
const lifetimeIat       = document.getElementById('lifetime-iat');
const lifetimeExp       = document.getElementById('lifetime-exp');
const lifetimeExpLabel  = document.getElementById('lifetime-exp-label');
const lifetimeDuration  = document.getElementById('lifetime-duration');
const lifetimePct       = document.getElementById('lifetime-pct');
const noExpiryCallout   = document.getElementById('no-expiry-callout');
const noExpiryIat       = document.getElementById('no-expiry-iat');
const subtitleVersion   = document.getElementById('header-subtitle-version');
const subtitleContext   = document.getElementById('header-subtitle-context');

const tabCountHeader    = document.getElementById('tab-count-header');
const tabCountPayload   = document.getElementById('tab-count-payload');
const headerVisual      = document.getElementById('header-claims-visual');
const headerJsonEl      = document.getElementById('header-claims-json');
const payloadVisual     = document.getElementById('payload-claims-visual');
const payloadJsonEl     = document.getElementById('payload-claims-json');
const signatureValueEl  = document.getElementById('signature-value');
const signatureWarning  = document.getElementById('signature-warning');

const verifyChecks      = document.getElementById('verify-checks');
const verifyCallout     = document.getElementById('verify-callout');
const verifyCalloutTitle = document.getElementById('verify-callout-title');
const verifyCalloutBody = document.getElementById('verify-callout-body');
const jwksUrlInput      = document.getElementById('jwks-url-input');
const fetchJwksBtn      = document.getElementById('fetch-jwks-btn');
const jwksStatus        = document.getElementById('jwks-status');
const jwksFetchBlock    = document.getElementById('jwks-fetch-block');

const bottomBar         = document.getElementById('bottom-bar');
const copyBearerBtn     = document.getElementById('copy-bearer-btn');
const copyCurlBtn       = document.getElementById('copy-curl-btn');

const RECENT_LIMIT = 5;

// ── State ───────────────────────────────────────────────────────────────────
let currentToken   = null;
let currentHeader  = null;
let currentPayload = null;

// ── Mac modifier detection ──────────────────────────────────────────────────
if (navigator.userAgent.includes('Mac')) {
  document.querySelectorAll('.shortcut-mod').forEach(el => { el.textContent = '⌘'; });
  document.querySelectorAll('.shortcut-plus').forEach(el => { el.remove(); });
}

// ── View switching ──────────────────────────────────────────────────────────
function showEmptyView() {
  pasteArea.classList.remove('hidden');
  decodedView.classList.add('hidden');
  bottomBar.classList.add('hidden');
  subtitleContext.classList.add('hidden');
  subtitleVersion.classList.remove('hidden');
  updateInputEmptyState();
  renderRecent();
}

function showDecodedView() {
  pasteArea.classList.add('hidden');
  recentSection.classList.add('hidden');
  decodedView.classList.remove('hidden');
  bottomBar.classList.remove('hidden');
  hideTokenSelector();
  errorMessage.classList.add('hidden');
}

// ── Recent rendering ────────────────────────────────────────────────────────
function getIssuerHost(issuer) {
  if (!issuer) return null;
  try { return new URL(issuer).host; } catch { return issuer; }
}

// Short, stable, non-crypto fingerprint (FNV-1a → 8 hex) to tell tokens apart.
function tokenFingerprint(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Meta line (alg · time · status) — recomputed live as tokens change state.
function rowMetaHtml(item, opts = {}) {
  let alg = '';
  let status = { label: 'Valid', tone: 'valid' };
  let payload = {};
  let valid = true;
  try {
    const parsed = parseJWT(item.token);
    alg = parsed.header?.alg || '';
    payload = parsed.payload || {};
    status = getTokenStatus(payload, getExpiringThreshold());
  } catch (_) {
    valid = false;
    status = { label: 'Invalid', tone: 'expired' };
  }

  let statusText;
  if (!valid) statusText = 'invalid';
  else if (status.tone === 'expired') statusText = `expired ${getRelativeTimeShort(payload.exp).replace(' ago', '')} ago`;
  else if (status.tone === 'notyet') statusText = `active in ${getRelativeTimeShort(payload.nbf).replace('in ', '')}`;
  else if (status.tone === 'no-expiry') statusText = 'no expiry';
  else {
    const rel = getRelativeTimeShort(payload.exp).replace('in ', '');
    statusText = status.tone === 'expiring' ? `expires in ${rel}` : `valid for ${rel}`;
  }

  const count = item.count > 1 ? item.count : 0;
  let timeStr;
  if (opts.clockTime) {
    const t = new Date(item.decodedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    timeStr = count ? `last decoded ${t}` : `decoded ${t}`;
  } else {
    timeStr = `decoded ${getTimeAgo(item.decodedAt)}`;
  }

  const bits = [];
  if (alg) bits.push(`<span>${escapeHtml(alg)}</span>`);
  bits.push(`<span>${escapeHtml(timeStr)}</span>`);
  bits.push(`<span class="recent-status ${status.tone}"><span class="recent-status-dot" aria-hidden="true"></span>${escapeHtml(statusText)}</span>`);
  return bits.join('<span class="recent-sep">&middot;</span>');
}

function buildRecentRow(item, opts = {}) {
  const row = document.createElement('div');
  row.className = 'recent-row';
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row._item = item;
  row._opts = opts;

  const host = getIssuerHost(item.issuer) || item.subject || 'Unknown token';
  const fp = tokenFingerprint(item.token);
  const count = item.count > 1 ? item.count : 0;

  row.innerHTML = `
    <div class="recent-row-main">
      <div class="recent-row-head">
        <span class="recent-issuer">${escapeHtml(host)}</span>
        <span class="recent-fp">${escapeHtml(fp)}</span>
        ${count ? `<span class="recent-count">&times;${count}</span>` : ''}
      </div>
      <div class="recent-row-meta">${rowMetaHtml(item, opts)}</div>
    </div>
    <span class="recent-row-right">
      <button class="recent-remove" type="button" aria-label="Remove from history" title="Remove from history">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </span>
  `;

  const select = () => {
    jwtInput.value = item.token;
    // Selecting from the History view returns to the main view.
    historyView.classList.add('hidden');
    mainContainer.classList.remove('hidden');
    handleDecode();
  };
  row.addEventListener('click', select);
  row.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
  });

  // Per-row remove — must not trigger the row's select.
  row.querySelector('.recent-remove').addEventListener('click', e => {
    e.stopPropagation();
    deleteHistoryItem(item.id);
    afterHistoryChange();
  });

  return row;
}

function renderRecent() {
  if (!pasteArea.classList.contains('hidden')) {
    const history = getHistory();
    recentList.innerHTML = '';
    if (history.length === 0) {
      recentSection.classList.add('hidden');
      return;
    }
    recentSection.classList.remove('hidden');
    for (const item of history.slice(0, RECENT_LIMIT)) {
      recentList.appendChild(buildRecentRow(item));
    }
  } else {
    recentSection.classList.add('hidden');
  }
}

// ── Multi-token selector ────────────────────────────────────────────────────
function showTokenSelector(tokens) {
  tokenList.innerHTML = '';
  for (const ti of tokens) {
    const item = document.createElement('div');
    item.className = 'token-selector-item';
    const preview = ti.token.length > 40
      ? ti.token.substring(0, 20) + '...' + ti.token.substring(ti.token.length - 15)
      : ti.token;
    item.innerHTML = `
      <div class="token-selector-source">${escapeHtml(ti.source)}</div>
      <div class="token-selector-preview">${escapeHtml(preview)}</div>
    `;
    item.addEventListener('click', () => {
      hideTokenSelector();
      jwtInput.value = ti.token;
      decodeToken(ti.token);
    });
    tokenList.appendChild(item);
  }
  tokenSelector.classList.remove('hidden');
}

function hideTokenSelector() { tokenSelector.classList.add('hidden'); }

// ── Token chip ──────────────────────────────────────────────────────────────
function renderChip(token) {
  chipToken.textContent = token;
}


// ── Summary card ────────────────────────────────────────────────────────────
function deriveIssuerOrg(iss) {
  if (!iss) return null;
  try {
    const host = new URL(iss).host.split(':')[0];
    const labels = host.split('.');
    if (labels.length >= 2) return labels[labels.length - 2];
    return labels[0];
  } catch { return null; }
}

function renderSummary(token, header, payload) {
  const subjectLabel = payload.name || payload.given_name || payload.preferred_username || payload.sub || payload.email || 'Unknown';

  // alg pill
  summaryAlg.textContent = header.alg || '—';

  // name (large)
  summaryName.textContent = subjectLabel;

  // sub-line: email · role · org — only the slots that actually exist (no placeholders,
  // no sub fallback since sub already owns the heading). Hidden when nothing to show.
  const metaParts = [];
  if (payload.email) metaParts.push(String(payload.email));
  if (Array.isArray(payload.roles) && payload.roles.length) metaParts.push(payload.roles.join(', '));
  else if (payload.role) metaParts.push(String(payload.role));
  if (metaParts.length) {
    summaryMeta.textContent = metaParts.join(' · ');
    summaryMeta.style.display = '';
  } else {
    summaryMeta.textContent = '';
    summaryMeta.style.display = 'none';
  }

  // org shown as a pill (org_id → tenant_id → issuer-derived)
  const orgPart = payload.org_id || payload.tenant_id || deriveIssuerOrg(payload.iss);
  if (orgPart) {
    summaryOrgValue.textContent = String(orgPart);
    summaryOrg.classList.remove('hidden');
  } else {
    summaryOrg.classList.add('hidden');
  }

  // Lifetime vs no-expiry callout
  if (typeof payload.exp === 'number') {
    lifetimeBlock.classList.remove('hidden');
    noExpiryCallout.classList.add('hidden');
    renderLifetimeStatic(payload);
  } else {
    lifetimeBlock.classList.add('hidden');
    noExpiryCallout.classList.remove('hidden');
    renderNoExpiryCallout(payload);
  }

  // Status pill, live countdown and progress bar (also ticked every second).
  tickState();
}

function renderNoExpiryCallout(payload) {
  if (typeof payload.iat === 'number') {
    noExpiryIat.textContent = `iat · ${formatClaimDate(payload.iat)} · ${getRelativeTimeShort(payload.iat)}`;
    noExpiryIat.style.display = '';
  } else {
    noExpiryIat.style.display = 'none';
  }
}

// Static lifetime bits (dates never change); the bar/label tick live in tickState().
function renderLifetimeStatic(payload) {
  const iat = typeof payload.iat === 'number' ? payload.iat : null;
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  lifetimeIat.innerHTML = iat ? stackedDateHtml(iat) : '—';
  lifetimeExp.innerHTML = exp ? stackedDateHtml(exp) : '—';
  lifetimeIat.title = iat ? `${iat} · epoch seconds` : '';
  lifetimeExp.title = exp ? `${exp} · epoch seconds` : '';
  lifetimeDuration.textContent = (iat && exp && exp > iat) ? formatDuration(exp - iat) : '—';
}

// ── Live state: status pill, countdown, progress bar — ticked every second ───
const STATUS_TONES = ['valid', 'expired', 'expiring', 'no-expiry', 'notyet'];

function tickState() {
  if (!currentPayload) return;
  const payload = currentPayload;
  const status = getTokenStatus(payload, getExpiringThreshold());
  const now = Math.floor(Date.now() / 1000);

  summaryStatus.classList.remove(...STATUS_TONES);
  summaryStatus.classList.add(status.tone);
  summaryStatus.querySelector('.label').textContent = status.label;

  let sub = '';
  if (status.tone === 'notyet' && typeof payload.nbf === 'number') {
    sub = `in ${formatCountdown(payload.nbf - now)}`;
  } else if (typeof payload.exp === 'number') {
    const diff = payload.exp - now;
    if (diff <= 0) sub = `${formatCountdown(-diff)} ago`;
    else if (status.tone === 'expiring') sub = `in ${formatCountdown(diff)}`;
    else sub = `for ${formatCountdown(diff)}`;
  }
  summaryStatusSub.textContent = sub;
  summaryStatusSub.classList.remove(...STATUS_TONES);
  summaryStatusSub.classList.add(status.tone);
  summaryStatusWrap.classList.remove(...STATUS_TONES);
  summaryStatusWrap.classList.add(status.tone);

  if (typeof payload.exp === 'number') {
    const iat = typeof payload.iat === 'number' ? payload.iat : null;
    const exp = payload.exp;
    lifetimeExpLabel.textContent = exp < now ? 'EXPIRED' : 'EXPIRES';
    let pct = 0;
    if (status.tone === 'expired') pct = 100;
    else if (status.tone === 'notyet') pct = 0;   // not active yet → nothing elapsed
    else if (iat && exp > iat && now > iat) pct = Math.min(100, ((now - iat) / (exp - iat)) * 100);
    lifetimeBarFill.style.width = `${pct}%`;
    lifetimeBarFill.classList.remove(...STATUS_TONES);
    lifetimeBarFill.classList.add(status.tone);
    lifetimePct.textContent = `${Math.round(pct)}%`;
  }
}

// Refresh the time-sensitive parts of the visible Recent/History rows in place
// (no rebuild — hover, scroll and the issuer menu are untouched).
function refreshListRows() {
  document.querySelectorAll('.recent-row').forEach(row => {
    if (!row._item || row.offsetParent === null) return;   // skip hidden rows
    const meta = row.querySelector('.recent-row-meta');
    if (meta) meta.innerHTML = rowMetaHtml(row._item, row._opts || {});
  });
}

// Live-update the Visual-view relative times (exp "in 54min", iat "3m ago", …).
function refreshClaimMetas() {
  const now = Math.floor(Date.now() / 1000);
  document.querySelectorAll('.claim-meta[data-ts]').forEach(meta => {
    if (meta.offsetParent === null) return;
    const ts = Number(meta.dataset.ts);
    meta.textContent = getRelativeTimeShort(ts);
    if (meta.dataset.key === 'exp') {
      meta.classList.toggle('expired', ts < now || ts - now < getExpiringThreshold());
    }
  });
}

// One always-on ticker drives the live summary countdown AND the list rows.
setInterval(() => {
  if (currentPayload) { tickState(); refreshClaimMetas(); }
  refreshListRows();
}, 1000);

// ── Tabs ────────────────────────────────────────────────────────────────────
function selectTab(name) {
  document.querySelectorAll('.tab').forEach(btn => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const isActive = panel.id === `panel-${name}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

// ── View-switch (Visual / JSON) ─────────────────────────────────────────────
function setPanelView(target, view) {
  document.querySelectorAll(`.view-switch-btn[data-target="${target}"]`).forEach(b => {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const visual = document.getElementById(`${target}-claims-visual`);
  const json   = document.getElementById(`${target}-claims-json`);
  if (view === 'visual') { visual.classList.remove('hidden'); json.classList.add('hidden'); }
  else                   { visual.classList.add('hidden');    json.classList.remove('hidden'); }
}

// Apply the user's preferred default view to both claim panels.
function applyDefaultView() {
  const view = getDefaultView();
  setPanelView('header', view);
  setPanelView('payload', view);
}

document.querySelectorAll('.view-switch-btn').forEach(btn => {
  btn.addEventListener('click', () => setPanelView(btn.dataset.target, btn.dataset.view));
});

// ── Copy JSON buttons ───────────────────────────────────────────────────────
document.querySelectorAll('.btn-copy-json').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const obj = target === 'header' ? currentHeader : currentPayload;
    if (!obj) return;
    copyWithFeedback(JSON.stringify(obj, null, 2), btn,
      '<span aria-hidden="true">✓</span> Copied!');
  });
});

// ── Verify panel ────────────────────────────────────────────────────────────
function setVerifyRow(name, key, state, status) {
  const row = document.createElement('div');
  row.className = 'verify-row';
  row.dataset.check = key;
  const iconChar = state === 'ok' ? '✓' : state === 'fail' ? '✕' : state === 'warn' ? '!' : '—';
  row.innerHTML = `
    <span class="verify-icon ${state}" aria-hidden="true">${iconChar}</span>
    <span class="verify-name">${escapeHtml(name)}</span>
    <span class="verify-status ${state}">${escapeHtml(status)}</span>
  `;
  return row;
}

function renderVerify(token, header, payload, signatureB64) {
  verifyChecks.innerHTML = '';
  const now = Math.floor(Date.now() / 1000);

  const algNone = !header.alg || String(header.alg).toLowerCase() === 'none';

  // Signature row — unsigned is its own warning state, not a "no key" state.
  const sigRow = setVerifyRow('Signature', 'signature', 'warn',
    algNone ? 'Unsigned (alg: none)' : 'Not verified — no key');
  verifyChecks.appendChild(sigRow);

  // Expiration
  if (typeof payload.exp === 'number') {
    if (payload.exp < now) {
      verifyChecks.appendChild(setVerifyRow('Expiration', 'exp', 'fail',
        `Token expired ${getRelativeTimeShort(payload.exp)}`));
    } else {
      verifyChecks.appendChild(setVerifyRow('Expiration', 'exp', 'ok',
        `Valid for ${getRelativeTimeShort(payload.exp).replace('in ', '')}`));
    }
  } else {
    verifyChecks.appendChild(setVerifyRow('Expiration', 'exp', 'skip', 'No exp claim'));
  }

  // Not before
  if (typeof payload.nbf === 'number') {
    if (payload.nbf > now) {
      verifyChecks.appendChild(setVerifyRow('Not before', 'nbf', 'fail',
        `Active ${getRelativeTimeShort(payload.nbf)}`));
    } else {
      verifyChecks.appendChild(setVerifyRow('Not before', 'nbf', 'ok', 'Token is active'));
    }
  } else {
    verifyChecks.appendChild(setVerifyRow('Not before', 'nbf', 'ok', 'Token is active'));
  }

  // Issuer
  if (payload.iss) {
    if (isValidUrl(payload.iss)) {
      verifyChecks.appendChild(setVerifyRow('Issuer', 'iss', 'ok', payload.iss));
    } else {
      verifyChecks.appendChild(setVerifyRow('Issuer', 'iss', 'ok', String(payload.iss)));
    }
  } else {
    verifyChecks.appendChild(setVerifyRow('Issuer', 'iss', 'skip', 'No iss claim'));
  }

  // Audience
  if (payload.aud) {
    const audStr = Array.isArray(payload.aud) ? payload.aud.join(', ') : String(payload.aud);
    verifyChecks.appendChild(setVerifyRow('Audience', 'aud', 'ok', `Includes ${audStr}`));
  } else {
    verifyChecks.appendChild(setVerifyRow('Audience', 'aud', 'skip', 'No aud claim'));
  }

  // Reset callout
  verifyCallout.classList.add('hidden');
  jwksStatus.classList.add('hidden');
  jwksStatus.classList.remove('success', 'error');
  jwksUrlInput.value = '';

  // Unsigned by design → a vulnerability, not a fetch problem. Distinct path:
  // no key to fetch, amber warning about server-side acceptance.
  if (algNone) {
    jwksFetchBlock.classList.add('hidden');
    showAutoDetectError('Unsigned token',
      'This token has no signature. Anyone can alter its contents — a server must never accept it.', 'warn');
    return;
  }
  jwksFetchBlock.classList.remove('hidden');

  // Verifying the signature means contacting the issuer's JWKS — the only
  // outbound request. Gated by the "Fetch keys from issuer" setting.
  if (payload.iss && isValidUrl(payload.iss)) {
    if (getFetchKeysMode() === 'automatic') {
      autoFetchAndVerify(token, header, payload);
    } else {
      jwksUrlInput.value = buildJwksUrl(payload.iss);
      showAutoDetectError('', '', 'info');
    }
  } else {
    showAutoDetectError('', '', 'info');
  }
}

function updateSignatureRow(state, status) {
  const row = verifyChecks.querySelector('[data-check="signature"]');
  if (!row) return;
  const icon = row.querySelector('.verify-icon');
  const statusEl = row.querySelector('.verify-status');
  icon.className = `verify-icon ${state}`;
  icon.textContent = state === 'ok' ? '✓' : state === 'fail' ? '✕' : state === 'warn' ? '!' : '—';
  statusEl.className = `verify-status ${state}`;
  statusEl.textContent = status;
}

function showAutoDetectError(title, body, tone = 'error') {
  verifyCalloutTitle.textContent = title || '';
  verifyCalloutTitle.classList.toggle('hidden', !title);
  verifyCalloutBody.textContent = body || '';
  verifyCalloutBody.classList.toggle('hidden', !body);
  verifyCallout.classList.remove('hidden', 'info', 'warn');
  if (tone === 'info') verifyCallout.classList.add('info');
  else if (tone === 'warn') verifyCallout.classList.add('warn');
  // 'error' → base (red) styling
}

function hideAutoDetectCallout() { verifyCallout.classList.add('hidden'); }

function buildJwksUrl(iss) {
  return iss.endsWith('/') ? `${iss}.well-known/jwks.json` : `${iss}/.well-known/jwks.json`;
}

async function autoFetchAndVerify(token, header, payload) {
  const jwksUrl = buildJwksUrl(payload.iss);
  jwksUrlInput.value = jwksUrl;
  try {
    const jwks = await fetchJWKS(jwksUrl);
    const key = selectKeyFromJWKS(jwks, header.kid, header.alg);
    const ok = await verifySignature(token, key, 'jwk');
    if (ok) {
      updateSignatureRow('ok', 'Verified via JWKS');
      hideAutoDetectCallout();
    } else {
      updateSignatureRow('fail', 'Signature invalid — possibly forged');
      showAutoDetectError('Invalid signature',
        'The signature doesn\'t match the issuer\'s key — the token may be forged or signed with a different key.', 'error');
    }
  } catch (err) {
    updateSignatureRow('warn', "Couldn't fetch keys");
    showAutoDetectError("Couldn't fetch keys",
      `${jwksUrl} returned ${err.message || 'an error'}. Paste a JWKS URL below to verify manually.`, 'warn');
  }
}

fetchJwksBtn.addEventListener('click', async () => {
  const url = jwksUrlInput.value.trim();
  if (!url || !currentToken || !currentHeader) return;
  jwksStatus.classList.remove('hidden', 'success', 'error');
  jwksStatus.textContent = 'Fetching...';
  try {
    const jwks = await fetchJWKS(url);
    const key = selectKeyFromJWKS(jwks, currentHeader.kid, currentHeader.alg);
    const ok = await verifySignature(currentToken, key, 'jwk');
    if (ok) {
      jwksStatus.classList.add('success');
      jwksStatus.textContent = 'Verified successfully';
      updateSignatureRow('ok', 'Verified via JWKS');
      hideAutoDetectCallout();
    } else {
      jwksStatus.classList.add('error');
      jwksStatus.textContent = 'Signature invalid';
      updateSignatureRow('fail', 'Signature invalid — possibly forged');
    }
  } catch (err) {
    jwksStatus.classList.add('error');
    jwksStatus.textContent = err.message || 'Fetch failed';
  }
});

// ── Bottom bar actions ──────────────────────────────────────────────────────
copyBearerBtn.addEventListener('click', () => {
  if (!currentToken) return;
  copyWithFeedback(`Bearer ${currentToken}`, copyBearerBtn,
    '<span aria-hidden="true">✓</span> Copied!');
});

copyCurlBtn.addEventListener('click', () => {
  if (!currentToken) return;
  copyWithFeedback(`-H "Authorization: Bearer ${currentToken}"`, copyCurlBtn,
    '<span aria-hidden="true">✓</span> Copied!');
});

// ── Algorithm security warning ───────────────────────────────────────────────
function renderAlgWarning(header) {
  if (!getFlagWeakAlg()) { algWarning.className = 'alg-warning hidden'; return; }
  const alg = header && header.alg;
  const norm = typeof alg === 'string' ? alg.toLowerCase() : '';
  if (!alg || norm === 'none') {
    algWarning.className = 'alg-warning warn';
    algWarningText.textContent = 'Unsigned token (alg: none). Anyone can forge this — never trust it in production.';
  } else if (!ALGORITHM_MAP[alg]) {
    algWarning.className = 'alg-warning warn';
    algWarningText.textContent = `Unrecognized algorithm “${alg}” — its signature can't be verified here.`;
  } else {
    algWarning.className = 'alg-warning hidden';
  }
}

// ── Chip actions ────────────────────────────────────────────────────────────
function editChip() {
  showEmptyView();
  jwtInput.focus();
  jwtInput.select();
}

chipEl.addEventListener('click', editChip);
chipEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editChip(); }
});

chipClearBtn.addEventListener('click', e => {
  e.stopPropagation();
  clearInput();
});

// ── Decode flow ─────────────────────────────────────────────────────────────
function decodeToken(token) {
  try {
    const { header, payload, signatureB64 } = parseJWT(token);
    currentToken = token;
    currentHeader = header;
    currentPayload = payload;

    renderChip(token);
    renderAlgWarning(header);
    renderSummary(token, header, payload);

    tabCountHeader.textContent = String(Object.keys(header).length);
    tabCountPayload.textContent = String(Object.keys(payload).length);

    renderClaimsVisual(headerVisual, header);
    renderClaimsJSON(headerJsonEl, header);
    renderClaimsVisual(payloadVisual, payload, { injectMissingExp: true });
    renderClaimsJSON(payloadJsonEl, payload);
    if (signatureB64) {
      signatureValueEl.textContent = signatureB64;
      signatureValueEl.classList.remove('hidden');
      signatureWarning.classList.add('hidden');
    } else {
      signatureValueEl.classList.add('hidden');
      signatureWarning.classList.remove('hidden');
    }

    renderVerify(token, header, payload, signatureB64);

    applyDefaultView();
    selectTab(getDefaultTab());
    addToHistory(token, payload);
    setCleared(false);
    showDecodedView();
  } catch (e) {
    showError(e.message);
  }
}

function handleDecode() {
  const inputText = jwtInput.value;
  errorMessage.classList.add('hidden');
  jwtInput.classList.remove('invalid');
  inputHint.classList.remove('visible');
  hideTokenSelector();
  if (!inputText.trim()) return;

  const trimmed = inputText.trim();
  if (isLikelyJWT(trimmed)) { decodeToken(trimmed); return; }

  const detected = detectTokens(inputText);
  if (detected.length === 0) {
    jwtInput.classList.add('invalid');
    inputHint.classList.add('visible');
    setCleared(true);
    return;
  }
  if (detected.length === 1) { jwtInput.value = detected[0].token; decodeToken(detected[0].token); return; }
  showTokenSelector(detected);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function clearInput() {
  jwtInput.value = '';
  jwtInput.classList.remove('invalid');
  jwtInput.classList.add('is-empty');
  inputHint.classList.remove('visible');
  errorMessage.classList.add('hidden');
  hideTokenSelector();
  currentToken = null;
  currentHeader = null;
  currentPayload = null;
  setCleared(true);
  showEmptyView();
  jwtInput.focus();
}

function updateInputEmptyState() {
  // The "Paste a JWT to decode" prompt stays visible in the paste/edit view
  // (including when editing an existing token via the chip).
  jwtInput.classList.toggle('is-empty', jwtInput.value.trim() === '');
}

function restoreLastToken() {
  if (wasCleared()) return;
  const history = getHistory();
  if (history.length > 0) {
    jwtInput.value = history[0].token;
    decodeToken(history[0].token);
  }
}

// ── Input wiring ────────────────────────────────────────────────────────────
loadSampleBtn.addEventListener('click', e => {
  e.preventDefault();
  jwtInput.value = SAMPLE_JWT;
  handleDecode();
});

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) { jwtInput.value = text; jwtInput.focus(); handleDecode(); }
  } catch (_) { jwtInput.focus(); }
}

pasteBtn.addEventListener('click', pasteFromClipboard);
pasteBtn.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pasteFromClipboard(); }
});

jwtInput.addEventListener('input', () => {
  // Don't decode mid-edit — that would yank you into the decoded view on every
  // keystroke. Decoding happens on blur, Ctrl+Enter, or paste instead.
  updateInputEmptyState();
  inputHint.classList.remove('visible');
  jwtInput.classList.remove('invalid');
});

jwtInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) handleDecode();
  if (e.key === 'C' && e.ctrlKey && e.shiftKey) { e.preventDefault(); clearInput(); }
});

jwtInput.addEventListener('paste', () => {
  setTimeout(() => { if (jwtInput.value.trim()) handleDecode(); }, 0);
});

// Clicking away from the textarea re-decodes: unchanged token returns you to the
// same decoded view, a changed one decodes the new token. Skip when focus moved
// to a control (recent row, link, button) so it can handle its own click.
jwtInput.addEventListener('blur', e => {
  if (e.relatedTarget) return;
  if (jwtInput.value.trim()) handleDecode();
});

// Global paste — redirect any paste outside of an input/textarea to decode the clipboard contents.
document.addEventListener('paste', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const text = e.clipboardData.getData('text');
  if (!text) return;
  e.preventDefault();
  jwtInput.value = text;
  jwtInput.focus();
  handleDecode();
});

// Global keyboard shortcuts (Ctrl+Shift+H/P/B)
document.addEventListener('keydown', async e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (!currentToken) return;
  if (e.key === 'H' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    selectTab('header');
    copyWithFeedback(JSON.stringify(currentHeader, null, 2),
      document.querySelector('.btn-copy-json[data-target="header"]'),
      '<span aria-hidden="true">✓</span> Copied!');
  }
  if (e.key === 'P' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    selectTab('payload');
    copyWithFeedback(JSON.stringify(currentPayload, null, 2),
      document.querySelector('.btn-copy-json[data-target="payload"]'),
      '<span aria-hidden="true">✓</span> Copied!');
  }
  if (e.key === 'B' && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    copyBearerBtn.click();
  }
});

// View "View all" placeholder
// ── History view ──────────────────────────────────────────────────────────
const historyView           = document.getElementById('history-view');
const historyBackBtn        = document.getElementById('history-back-btn');
const historyCountEl        = document.getElementById('history-count');
const historyClearAllBtn    = document.getElementById('history-clear-all');
const historySearchInput    = document.getElementById('history-search-input');
const historyListEl         = document.getElementById('history-list');
const historyExpiredCountEl = document.getElementById('history-expired-count');
const historyRemoveExpired  = document.getElementById('history-remove-expired');
const historyFilters        = document.querySelector('.history-filters');
const historyToggleBtn      = document.getElementById('history-toggle-btn');
const historyIssuerEl       = document.getElementById('history-issuer');
const historyIssuerBtn      = document.getElementById('history-issuer-btn');
const historyIssuerLabel    = document.getElementById('history-issuer-label');
const historyIssuerMenu     = document.getElementById('history-issuer-menu');
let historyFilter = 'all';
let historyIssuerFilter = 'all';

function historyGroupLabel(ts) {
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86400000);
  if (diff <= 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase();
}

function historyItemMatches(item, q) {
  if (historyIssuerFilter !== 'all' && getIssuerHost(item.issuer) !== historyIssuerFilter) return false;
  let tone = 'expired';
  let hay = item.token || '';
  try {
    const { header, payload } = parseJWT(item.token);
    tone = getTokenStatus(payload, getExpiringThreshold()).tone;
    hay = [item.issuer || '', header.kid || '', JSON.stringify(payload)].join(' ');
  } catch (_) { /* invalid token — treated as expired for filtering */ }
  if (historyFilter === 'valid' && tone === 'expired') return false;
  if (historyFilter === 'expired' && tone !== 'expired') return false;
  if (q && !hay.toLowerCase().includes(q)) return false;
  return true;
}

function renderHistory() {
  const all = getHistory();
  historyCountEl.textContent = `${all.length} token${all.length === 1 ? '' : 's'}`;

  const now = Math.floor(Date.now() / 1000);
  let expired = 0;
  for (const item of all) {
    try {
      const { payload } = parseJWT(item.token);
      if (typeof payload.exp === 'number' && payload.exp <= now) expired++;
    } catch (_) { /* kept by clearExpiredTokens, so not counted */ }
  }
  historyExpiredCountEl.textContent = `${expired} expired ${expired === 1 ? 'entry' : 'entries'}`;
  historyRemoveExpired.classList.toggle('disabled', expired === 0);

  const q = historySearchInput.value.trim().toLowerCase();
  const filtered = all.filter(item => historyItemMatches(item, q));

  historyListEl.innerHTML = '';
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = all.length ? 'No matching tokens' : 'No history yet';
    historyListEl.appendChild(empty);
    return;
  }

  let lastLabel = null;
  for (const item of filtered) {
    const label = historyGroupLabel(item.decodedAt);
    if (label !== lastLabel) {
      const h = document.createElement('div');
      h.className = 'history-group-label';
      h.textContent = label;
      historyListEl.appendChild(h);
      lastLabel = label;
    }
    historyListEl.appendChild(buildRecentRow(item, { clockTime: true }));
  }
}

function updateHistoryIssuers() {
  const hosts = [...new Set(getHistory().map(i => getIssuerHost(i.issuer)).filter(Boolean))].sort();
  if (!hosts.includes(historyIssuerFilter)) historyIssuerFilter = 'all';
  const opts = [{ value: 'all', label: 'All issuers' }].concat(hosts.map(h => ({ value: h, label: h })));
  historyIssuerMenu.innerHTML = opts.map(o =>
    `<div class="dropdown-option ${o.value === historyIssuerFilter ? 'selected' : ''}" role="option" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</div>`
  ).join('');
  historyIssuerLabel.textContent = historyIssuerFilter === 'all' ? 'Issuer' : historyIssuerFilter;
}

function closeIssuerMenu() {
  historyIssuerMenu.classList.add('hidden');
  historyIssuerBtn.setAttribute('aria-expanded', 'false');
}

function afterHistoryChange() {
  renderRecent();
  updateHistoryIssuers();
  renderHistory();
}

function openHistory() {
  updateHistoryIssuers();
  renderHistory();
  settingsView.classList.add('hidden');
  mainContainer.classList.add('hidden');
  historyView.classList.remove('hidden');
}

historyBackBtn.addEventListener('click', () => {
  historyView.classList.add('hidden');
  mainContainer.classList.remove('hidden');
});

recentViewAllBtn.addEventListener('click', e => { e.preventDefault(); openHistory(); });
if (historyToggleBtn) historyToggleBtn.addEventListener('click', openHistory);
historySearchInput.addEventListener('input', renderHistory);
historyClearAllBtn.addEventListener('click', () => { clearHistory(); afterHistoryChange(); });
historyRemoveExpired.addEventListener('click', e => { e.preventDefault(); clearExpiredTokens(); afterHistoryChange(); });
historyFilters.querySelectorAll('.hfilter').forEach(btn => {
  btn.addEventListener('click', () => {
    historyFilter = btn.dataset.filter;
    historyFilters.querySelectorAll('.hfilter').forEach(b => b.classList.toggle('selected', b === btn));
    renderHistory();
  });
});
historyIssuerBtn.addEventListener('click', e => {
  e.stopPropagation();
  const nowHidden = historyIssuerMenu.classList.toggle('hidden');
  historyIssuerBtn.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
});

historyIssuerMenu.addEventListener('click', e => {
  const opt = e.target.closest('.dropdown-option');
  if (!opt) return;
  historyIssuerFilter = opt.dataset.value;
  closeIssuerMenu();
  updateHistoryIssuers();
  renderHistory();
});

// Close the issuer menu on outside click / Escape.
document.addEventListener('click', e => {
  if (!historyIssuerEl.contains(e.target)) closeIssuerMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeIssuerMenu();
});

// Settings is an in-popup view toggled from the header gear.
const settingsView    = document.getElementById('settings-view');
const settingsBackBtn = document.getElementById('settings-back-btn');
const mainContainer   = document.querySelector('.container');
let fetchModeOnSettingsOpen = null;

function openSettings() {
  refreshHistoryButtons();
  fetchModeOnSettingsOpen = getFetchKeysMode();
  mainContainer.classList.add('hidden');
  settingsView.classList.remove('hidden');
}
openSettingsBtn.addEventListener('click', openSettings);

// Header version → open Settings and jump to the About section.
function openAbout() {
  openSettings();
  const about = document.getElementById('about-section');
  if (about) about.scrollIntoView({ block: 'start' });
}
appVersion.addEventListener('click', openAbout);
appVersion.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAbout(); }
});

settingsBackBtn.addEventListener('click', () => {
  // Apply the "keep history off" deletion on the way out.
  if (!getKeepHistory()) {
    clearHistory();
    renderRecent();
  }
  // If the fetch-keys mode changed, re-render Verify for the current token so
  // it reflects the new setting (e.g. drops the "off" hint / auto-fetches).
  if (currentToken && getFetchKeysMode() !== fetchModeOnSettingsOpen) {
    renderVerify(currentToken, currentHeader, currentPayload);
  }
  settingsView.classList.add('hidden');
  mainContainer.classList.remove('hidden');
});

// ── Setting: Keep history ─────────────────────────────────────────────────
const keepHistoryToggle = document.getElementById('toggle-keep-history');

function syncKeepHistoryToggle() {
  const on = getKeepHistory();
  keepHistoryToggle.classList.toggle('on', on);
  keepHistoryToggle.setAttribute('aria-checked', on ? 'true' : 'false');
}

function toggleKeepHistory() {
  // Only flip the preference here — deletion is deferred until you leave Settings,
  // so toggling off then back on within Settings deletes nothing.
  setKeepHistory(!getKeepHistory());
  syncKeepHistoryToggle();
}

keepHistoryToggle.addEventListener('click', toggleKeepHistory);
keepHistoryToggle.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleKeepHistory(); }
});
syncKeepHistoryToggle();

// ── Setting: Fetch keys from issuer (never | automatic) ───────────────────
const fetchKeysSeg = document.getElementById('fetch-keys-seg');

function syncFetchKeysSeg() {
  const mode = getFetchKeysMode();
  fetchKeysSeg.querySelectorAll('.seg').forEach(seg => {
    const on = seg.dataset.mode === mode;
    seg.classList.toggle('selected', on);
    seg.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

fetchKeysSeg.querySelectorAll('.seg').forEach(seg => {
  seg.setAttribute('role', 'button');
  seg.tabIndex = 0;
  const choose = () => { setFetchKeysMode(seg.dataset.mode); syncFetchKeysSeg(); };
  seg.addEventListener('click', choose);
  seg.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
  });
});

syncFetchKeysSeg();

// ── Setting: Flag alg:none / weak algorithms ──────────────────────────────
const flagAlgToggle = document.getElementById('toggle-flag-alg');

function syncFlagAlgToggle() {
  const on = getFlagWeakAlg();
  flagAlgToggle.classList.toggle('on', on);
  flagAlgToggle.setAttribute('aria-checked', on ? 'true' : 'false');
}

function toggleFlagAlg() {
  setFlagWeakAlg(!getFlagWeakAlg());
  syncFlagAlgToggle();
  if (currentHeader) renderAlgWarning(currentHeader);   // reflect immediately
}

flagAlgToggle.addEventListener('click', toggleFlagAlg);
flagAlgToggle.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFlagAlg(); }
});
syncFlagAlgToggle();

// Re-apply status-dependent rendering for the loaded token (no re-decode).
function rerenderCurrentToken() {
  if (currentToken && currentHeader && currentPayload) {
    renderSummary(currentToken, currentHeader, currentPayload);
    renderClaimsVisual(headerVisual, currentHeader);
    renderClaimsVisual(payloadVisual, currentPayload, { injectMissingExp: true });
  }
  renderRecent();
}

// ── Reusable themed dropdown ───────────────────────────────────────────────
// Same look/behaviour as the History issuer filter; used for the Settings
// selects so all three are consistent (and theme correctly in dark mode).
function createDropdown(el, { ariaLabel, options, getValue, onSelect, labelFor }) {
  el.classList.add('dropdown');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dropdown-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  const labelEl = document.createElement('span');
  btn.appendChild(labelEl);
  btn.insertAdjacentHTML('beforeend',
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu hidden';
  menu.setAttribute('role', 'listbox');
  el.append(btn, menu);

  const opts = () => (typeof options === 'function' ? options() : options);
  const val  = () => (typeof getValue === 'function' ? getValue() : getValue);
  const syncLabel = () => {
    const v = val();
    const o = opts().find(x => x.value === v);
    labelEl.textContent = labelFor ? labelFor(v, o) : (o ? o.label : '');
  };
  const render = () => {
    const v = val();
    menu.innerHTML = opts().map(o =>
      `<div class="dropdown-option ${o.value === v ? 'selected' : ''}" role="option" data-value="${escapeHtml(String(o.value))}">${escapeHtml(o.label)}</div>`
    ).join('');
    syncLabel();
  };
  const close = () => {
    menu.classList.add('hidden');
    menu.classList.remove('dropdown-menu--up');
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    render();
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect();   // flip up if it would clip the bottom edge
    menu.classList.toggle('dropdown-menu--up', r.bottom + menu.offsetHeight + 8 > window.innerHeight);
  };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) open(); else close();
  });
  menu.addEventListener('click', e => {
    const opt = e.target.closest('.dropdown-option');
    if (!opt) return;
    onSelect(opt.dataset.value);
    close();
    render();
  });
  document.addEventListener('click', e => { if (!el.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  render();
  return { refresh: render, close };
}

// ── Setting: Expiring soon threshold ──────────────────────────────────────
createDropdown(document.getElementById('expiring-threshold-dropdown'), {
  ariaLabel: 'Expiring soon threshold',
  options: [
    { value: '60',   label: '1 min' },
    { value: '300',  label: '5 min' },
    { value: '900',  label: '15 min' },
    { value: '1800', label: '30 min' },
    { value: '3600', label: '1 hour' },
  ],
  getValue: () => String(getExpiringThreshold()),
  onSelect: v => { setExpiringThreshold(parseInt(v, 10) || 300); rerenderCurrentToken(); },
});

// ── Setting: Display (timestamps + default tab) ───────────────────────────
function wireSegmented(el, getVal, setVal, onChange) {
  const sync = () => el.querySelectorAll('.seg').forEach(seg => {
    const on = seg.dataset.mode === getVal();
    seg.classList.toggle('selected', on);
    seg.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  el.querySelectorAll('.seg').forEach(seg => {
    seg.setAttribute('role', 'button');
    seg.tabIndex = 0;
    const choose = () => { setVal(seg.dataset.mode); sync(); if (onChange) onChange(); };
    seg.addEventListener('click', choose);
    seg.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
    });
  });
  sync();
}

wireSegmented(document.getElementById('timestamp-seg'), getTimestampMode, setTimestampMode, rerenderCurrentToken);
wireSegmented(document.getElementById('default-view-seg'), getDefaultView, setDefaultView, () => { if (currentPayload) applyDefaultView(); });

createDropdown(document.getElementById('default-tab-dropdown'), {
  ariaLabel: 'Default tab after decode',
  options: [
    { value: 'header',    label: 'Header' },
    { value: 'payload',   label: 'Payload' },
    { value: 'signature', label: 'Signature' },
    { value: 'verify',    label: 'Verify' },
  ],
  getValue: getDefaultTab,
  onSelect: v => setDefaultTab(v),
});

// ── Setting: history actions (Remove expired / Clear history) ─────────────
const removeExpiredBtn  = document.getElementById('remove-expired-btn');
const clearHistoryBtn   = document.getElementById('clear-history-btn');
const clearHistoryLabel = document.getElementById('clear-history-label');

function countExpired(history) {
  const now = Math.floor(Date.now() / 1000);
  let n = 0;
  for (const item of history) {
    try {
      const { payload } = parseJWT(item.token);
      if (typeof payload.exp === 'number' && payload.exp <= now) n++;
    } catch (_) { /* unparseable entries are kept, so not counted */ }
  }
  return n;
}

function refreshHistoryButtons() {
  const history = getHistory();
  const expired = countExpired(history);
  removeExpiredBtn.textContent = expired ? `Remove expired (${expired})` : 'Remove expired';
  removeExpiredBtn.disabled = expired === 0;
  clearHistoryLabel.textContent = history.length ? `Clear history (${history.length})` : 'Clear history';
  clearHistoryBtn.disabled = history.length === 0;
}

removeExpiredBtn.addEventListener('click', () => {
  clearExpiredTokens();
  refreshHistoryButtons();
  renderRecent();
});

clearHistoryBtn.addEventListener('click', () => {
  clearHistory();
  refreshHistoryButtons();
  renderRecent();
});

// ── Initialize ──────────────────────────────────────────────────────────────
try {
  const manifest = chrome.runtime.getManifest();
  const v = manifest && manifest.version;
  if (v) {
    if (appVersion) appVersion.textContent = `v${v}`;
    const aboutVersion = document.getElementById('about-version');
    if (aboutVersion) aboutVersion.textContent = `v${v}`;
    const settingsVersion = document.querySelector('.settings-version');
    if (settingsVersion) settingsVersion.textContent = `v${v} · offline · no telemetry`;
  }
} catch (_) {}

// If history is disabled, ensure nothing lingers (covers closing via ✕, not back).
if (!getKeepHistory()) clearHistory();

// Bind static tooltips (e.g. the JWKS-URL info icon).
setupTooltips();

updateInputEmptyState();
restoreLastToken();
if (!currentToken) {
  showEmptyView();
}
jwtInput.focus();
