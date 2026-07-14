// format.js - date/time and duration formatting helpers.

import { getTimestampMode } from './storage.js';
import { escapeHtml } from './jwt.js';

// Date + time parts in a given zone ('local' or 'UTC'); the time carries the
// zone label so a UTC epoch is never mistaken for local.
export function dateTimeParts(ts, zone) {
  const d = new Date(ts * 1000);
  const zoneOpt = zone === 'UTC' ? { timeZone: 'UTC' } : {};
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...zoneOpt });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short', ...zoneOpt });
  return { date, time };
}

export function formatClaimDate(ts) {
  const mode = getTimestampMode();
  if (mode === 'utc') {
    const { date, time } = dateTimeParts(ts, 'UTC');
    return `${date}, ${time}`;
  }
  if (mode === 'both') {
    const local = dateTimeParts(ts, 'local');
    const utc = dateTimeParts(ts, 'UTC');
    return `${local.date}, ${local.time} · ${utc.time}`;
  }
  const { date, time } = dateTimeParts(ts, 'local');
  return `${date}, ${time}`;
}

// Date + time stacked for the lifetime columns (adds a UTC line in "both").
export function stackedDateHtml(ts) {
  const mode = getTimestampMode();
  const zone = mode === 'utc' ? 'UTC' : 'local';
  const { date, time } = dateTimeParts(ts, zone);
  let html = `<span class="lt-date">${escapeHtml(date)}</span><span class="lt-time">${escapeHtml(time)}</span>`;
  if (mode === 'both') {
    const utc = dateTimeParts(ts, 'UTC');
    html += `<span class="lt-time">${escapeHtml(utc.time)}</span>`;
  }
  return html;
}

export function formatDuration(seconds) {
  const s = Math.abs(Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 2592000) return `${Math.round(s / 86400)}d`;
  if (s < 31536000) return `${Math.round(s / 2592000)}mo`;
  return `${Math.round(s / 31536000)}y`;
}

export function formatCountdown(total) {
  total = Math.max(0, Math.floor(total));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function getRelativeTimeShort(ts) {
  const now = Math.floor(Date.now() / 1000);
  const diff = ts - now;
  const abs = Math.abs(diff);
  let value, unit;
  if (abs < 60) { value = abs; unit = 's'; }
  else if (abs < 3600) { value = Math.floor(abs / 60); unit = 'min'; }
  else if (abs < 86400) { value = Math.floor(abs / 3600); unit = 'h'; }
  else if (abs < 2592000) { value = Math.floor(abs / 86400); unit = 'd'; }
  else if (abs < 31536000) { value = Math.floor(abs / 2592000); unit = 'mo'; }
  else { value = Math.floor(abs / 31536000); unit = 'y'; }
  return diff > 0 ? `in ${value}${unit}` : `${value}${unit} ago`;
}
