// claims.js - the Visual / JSON claim renderers and the recursive nested-value
// tree (string arrays → chips, objects → collapsible key rows, scalars → text).

import { formatClaimDate, stackedDateHtml, getRelativeTimeShort } from '../utils/format.js';
import { CLAIM_TOOLTIPS, highlightJSON, isTimestampValue } from '../utils/jwt.js';
import { getExpiringThreshold } from '../utils/storage.js';
import { setupTooltips } from './tooltip.js';
import { setupCopyableValues } from './copy.js';

// ── Measure key text width (canvas → works even when the panel is hidden) ───
let _keyMeasureCtx = null;
function measureKeyWidth(text) {
  if (!_keyMeasureCtx) {
    _keyMeasureCtx = document.createElement('canvas').getContext('2d');
    const mono = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-mono').trim() || 'monospace';
    _keyMeasureCtx.font = `600 14px ${mono}`;   // matches .claim-key
  }
  return _keyMeasureCtx.measureText(text).width;
}

// NumericDate claims (RFC 7519 + OIDC) rendered as human dates with relative time.
const DATE_CLAIMS = new Set(['exp', 'nbf', 'iat', 'auth_time', 'updated_at']);

// Values worth rendering as individual chips: space-delimited scope strings,
// and any array of scalar values (aud, roles, groups, amr, scp, …) - so every
// multi-value claim renders consistently.
const SCOPE_KEYS = new Set(['scope', 'scopes', 'scp']);

// Scope-style filled accent chips: space-delimited scope strings and the array
// variants (scp). Every other multi-value / nested claim goes through the
// recursive renderer below (neutral outlined chips, indented trees).
function scopeChips(key, value) {
  if (!SCOPE_KEYS.has(key)) return null;
  if (typeof value === 'string' && value.trim()) return value.trim().split(/\s+/);
  if (Array.isArray(value) && value.length) return value.map(String);
  return null;
}

// ── Recursive nested-value renderer (Payload Visual) ────────────────────────
// Formats any provider's nested claims at any depth - string arrays → chips,
// objects → indented collapsible key rows, arrays of objects → indexed rows,
// scalars → formatted text - while keeping the exact JSON reachable per claim.

const MAX_TREE_DEPTH   = 6;   // hard cap against hostile / deeply-nested tokens
const COLLAPSE_DEPTH   = 2;   // auto-collapse nodes deeper than this…
const COLLAPSE_CHILDREN = 8;  // …or wider than this

// Privileged role names → warning tint + bold. Kept small and centralized.
const PRIVILEGED_ROLES = new Set(['admin', 'superuser']);
function isPrivilegedRole(v) {
  const s = String(v).trim().toLowerCase();
  return PRIVILEGED_ROLES.has(s) || /[-_:/]admin$/.test(s);   // admin, superuser, *-admin
}

function isScalarArray(v) {
  return Array.isArray(v) && v.every(x => x === null || typeof x !== 'object');
}

function nodeKind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'empty';
    return isScalarArray(v) ? 'chips' : 'list';   // list = array of objects
  }
  if (typeof v === 'object') return Object.keys(v).length === 0 ? 'empty' : 'object';
  return 'scalar';
}

function mkEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function renderChips(arr, filled) {
  const wrap = mkEl('span', 'claim-chips');
  for (const item of arr) {
    const s = String(item);
    const chip = mkEl('span', filled ? 'claim-chip' : 'claim-chip outlined', s);
    chip.title = s;
    if (!filled && isPrivilegedRole(s)) chip.classList.add('privileged');
    wrap.appendChild(chip);
  }
  return wrap;
}

function renderScalar(value) {
  const span = mkEl('span', `claim-scalar ${valueType(value)}`, formatClaimValue(value));
  if (typeof value === 'string' || typeof value === 'number') {
    span.classList.add('copyable');
    span.dataset.copyValue = String(value);
    span.title = String(value);
  }
  return span;
}

// Dispatch on type; recurse for object / array children.
function renderValue(value, depth) {
  if (depth > MAX_TREE_DEPTH) {
    const json = JSON.stringify(value);
    const s = mkEl('span', 'claim-scalar string',
      json.length > 120 ? json.slice(0, 120) + '…' : json);
    s.title = json;
    return s;
  }
  switch (nodeKind(value)) {
    case 'null':   return mkEl('span', 'claim-null', 'null');
    case 'empty':  return mkEl('span', 'claim-null', Array.isArray(value) ? '[]' : '{}');
    case 'scalar': return renderScalar(value);
    case 'chips':  return renderChips(value, false);
    case 'object': return renderTree(Object.entries(value), depth);
    case 'list':   return renderTree(value.map((v, i) => [String(i), v]), depth);
  }
}

function renderTree(entries, depth) {
  const tree = mkEl('div', 'claim-tree');
  for (const [k, v] of entries) tree.appendChild(renderNode(k, v, depth));
  return tree;
}

function renderNode(key, value, depth) {
  const kind = nodeKind(value);
  const composite = kind === 'object' || kind === 'list';
  const node = mkEl('div', 'claim-node');
  const head = mkEl('div', 'claim-node-head');
  const keyEl = mkEl('span', 'claim-node-key', key);

  if (composite) {
    const count = kind === 'list' ? value.length : Object.keys(value).length;
    const collapsed = depth >= COLLAPSE_DEPTH || count > COLLAPSE_CHILDREN;
    node.classList.toggle('collapsed', collapsed);

    head.classList.add('is-toggle');
    head.setAttribute('role', 'button');
    head.tabIndex = 0;
    head.setAttribute('aria-expanded', String(!collapsed));
    head.appendChild(mkEl('span', 'claim-chevron'));
    head.appendChild(keyEl);
    head.appendChild(mkEl('span', 'claim-node-summary',
      kind === 'list' ? `${count} ${count === 1 ? 'item' : 'items'}`
                      : `${count} ${count === 1 ? 'key' : 'keys'}`));
    node.appendChild(head);

    const children = mkEl('div', 'claim-node-children');
    children.appendChild(renderValue(value, depth + 1));
    node.appendChild(children);

    const toggle = () => {
      const nowCollapsed = !node.classList.contains('collapsed');
      node.classList.toggle('collapsed', nowCollapsed);
      head.setAttribute('aria-expanded', String(!nowCollapsed));
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  } else {
    head.appendChild(keyEl);
    const inline = renderValue(value, depth + 1);
    inline.classList.add('claim-node-inline');
    head.appendChild(inline);
    node.appendChild(head);
  }
  return node;
}

// Top-level cell for an object / array-of-objects claim: the flattened
// recursive tree. Raw JSON lives behind the global Visual/JSON toggle, which
// pretty-prints the whole payload - so there's no per-claim raw affordance.
function renderNestedClaim(valueEl, value) {
  valueEl.classList.add('claim-value-nested');

  if (nodeKind(value) === 'empty') {
    valueEl.appendChild(mkEl('span', 'claim-null', Array.isArray(value) ? '[]' : '{}'));
    return;
  }

  valueEl.appendChild(renderValue(value, 0));
}

function valueType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function formatClaimValue(value, key) {
  if (value === undefined) {
    return key === 'exp' ? '- not set -' : '-';
  }
  if (value === null || value === '') return '-';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (DATE_CLAIMS.has(key) && isTimestampValue(value)) {
      return formatClaimDate(value);
    }
    return String(value);
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// ── Visual claim renderer ───────────────────────────────────────────────────
export function renderClaimsVisual(container, obj, opts = {}) {
  container.innerHTML = '';
  const entries = Object.entries(obj);
  // For payload, surface a synthetic exp row when the claim is absent.
  if (opts.injectMissingExp && !('exp' in obj)) {
    entries.push(['exp', undefined]);
  }
  const now = Math.floor(Date.now() / 1000);

  const displayKey = (key) =>
    /^https?:\/\//i.test(key) ? (key.replace(/\/+$/, '').split('/').pop() || key) : key;

  // Size the key column to the longest key, but keep a minimum floor so
  // short-key tokens still get breathing room before the value, and cap at
  // half the width (longer keys ellipsize). The 50% is resolved live by CSS
  // (survives a hidden panel); we only measure the key text.
  const MIN_KEY_COL = 84;
  let maxKeyW = 0;
  for (const [key] of entries) maxKeyW = Math.max(maxKeyW, measureKeyWidth(displayKey(key)));
  const keyCol = Math.max(Math.ceil(maxKeyW) + 3, MIN_KEY_COL);
  container.style.gridTemplateColumns = `min(${keyCol}px, 50%) minmax(0, 1fr)`;

  for (const [key, value] of entries) {
    const type = valueType(value);
    const isUrlKey = /^https?:\/\//i.test(key);

    // The claim key. When an explanation exists, make it an on-demand tooltip
    // trigger - a dotted-underline cue, focusable for keyboard/touch, revealed
    // on hover or focus. No always-visible sub-label; the tooltip is the sole
    // explainer, richer for cryptic provider claims (oid, wids, azp, …).
    const keyEl = document.createElement('span');
    keyEl.className = `claim-key ${type}`;
    const keyText = displayKey(key);
    keyEl.textContent = keyText;

    const tipText = CLAIM_TOOLTIPS[key] || (isUrlKey ? `Custom claim - ${key}` : '');
    if (tipText) {
      keyEl.classList.add('tooltip');
      keyEl.dataset.tooltip = tipText;
      keyEl.tabIndex = 0;                                   // keyboard/touch reachable
      keyEl.setAttribute('aria-label', `${keyText}: ${tipText}`);
    }
    container.appendChild(keyEl);

    const valueEl = document.createElement('div');
    valueEl.className = 'claim-value';

    const scope = scopeChips(key, value);
    if (scope) {
      valueEl.appendChild(renderChips(scope, true));
    } else if (DATE_CLAIMS.has(key) && isTimestampValue(value)) {
      // Stacked date + time line(s) - never truncates, respects Local/UTC/Both.
      // Hover shows the full formatted date; click copies the raw epoch.
      const dateEl = document.createElement('span');
      dateEl.className = 'claim-date copyable';
      dateEl.innerHTML = stackedDateHtml(value);
      dateEl.dataset.copyValue = String(value);
      dateEl.title = formatClaimDate(value);
      valueEl.appendChild(dateEl);

      const meta = document.createElement('span');
      meta.className = 'claim-meta';
      meta.dataset.ts = value;
      meta.dataset.key = key;
      meta.textContent = getRelativeTimeShort(value);
      if (key === 'exp' && (value < now || value - now < getExpiringThreshold())) meta.classList.add('expired');
      valueEl.appendChild(meta);
    } else if (Array.isArray(value) && isScalarArray(value) && value.length) {
      // Simple multi-value claim (aud, groups, amr, roles, …) → outlined chips.
      valueEl.appendChild(renderChips(value, false));
    } else if (value !== null && typeof value === 'object') {
      // Object / array-of-objects → recursive tree with a per-claim raw toggle.
      renderNestedClaim(valueEl, value);
    } else {
      const valueText = document.createElement('span');
      valueText.className = 'claim-value-text';
      valueText.textContent = formatClaimValue(value, key);
      valueEl.appendChild(valueText);

      // Click-to-copy the raw value; full value on hover (it may be truncated).
      if (value !== undefined && value !== null && value !== '') {
        const raw = (typeof value === 'object') ? JSON.stringify(value) : String(value);
        valueText.classList.add('copyable');
        valueText.dataset.copyValue = raw;
        valueText.title = raw;
      }

      // email_verified: false - the classic integration footgun, flag it subtly.
      if (key === 'email_verified' && value === false) {
        const flag = document.createElement('span');
        flag.className = 'claim-flag';
        flag.textContent = 'unverified';
        valueEl.appendChild(flag);
      }

      // Missing exp (synthetic row) → descriptive note.
      if (key === 'exp' && (value === undefined || value === null)) {
        const meta = document.createElement('span');
        meta.className = 'claim-meta';
        meta.textContent = 'no expiration';
        valueEl.appendChild(meta);
      }
    }

    container.appendChild(valueEl);
  }
  setupTooltips(container);
  setupCopyableValues(container);
}

export function renderClaimsJSON(container, obj) {
  container.innerHTML = highlightJSON(obj);
  container.dataset.raw = JSON.stringify(obj, null, 2);
  setupCopyableValues(container);
  setupTooltips(container);
}
