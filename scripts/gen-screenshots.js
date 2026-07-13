// Generates the README visual assets — logo/icon PNGs plus feature screenshots
// and animated GIFs in BOTH light and dark themes — by driving the real
// unpacked extension with Playwright's Chromium. All images render from the
// SYNTHETIC tokens in test-tokens.md (no real credentials), so the output is
// safe to commit and fully reproducible.
//
//   node scripts/gen-screenshots.js        (npm run gen:media regenerates tokens first)
//
// Requires: @playwright/test's Chromium (already installed) and ffmpeg on PATH
// (override with FFMPEG=/path/to/ffmpeg). No other dependencies.
'use strict';

const { chromium } = require('@playwright/test');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT       = path.resolve(__dirname, '..');
const TOKENS_MD = path.join(EXT, 'test-tokens.md');
const MEDIA     = path.join(EXT, 'docs', 'media');
const FRAMES    = path.join(MEDIA, '.frames');
const ICONS     = path.join(EXT, 'icons');
const FFMPEG    = process.env.FFMPEG || 'ffmpeg';
const WIDTH     = 440;                 // inside the popup's 420–500px clamp
const sfx       = scheme => (scheme === 'dark' ? '-dark' : '');

function readToken(nameSubstr) {
  const md = fs.readFileSync(TOKENS_MD, 'utf8');
  const idx = md.indexOf(nameSubstr);
  if (idx === -1) throw new Error(`No test-token section matching "${nameSubstr}"`);
  const m = md.slice(idx).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/);
  if (!m) throw new Error(`No JWT found under "${nameSubstr}"`);
  return m[0];
}

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

// Decode a JWT payload in Node (to read exp/nbf for clock-pinned shots).
function payloadOf(token) {
  const seg = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(seg, 'base64').toString('utf8'));
}

async function launch(colorScheme, deviceScaleFactor = 1) {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    colorScheme,
    deviceScaleFactor,
    viewport: { width: WIDTH, height: 900 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--headless=new',
    ],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 120000 });
  return { ctx, extId: new URL(sw.url()).host };
}

async function openClean(ctx, extId) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.evaluate(async () => {
    localStorage.clear();
    try { await chrome.storage.local.clear(); } catch (_) {}
  });
  await page.reload();
  await page.waitForSelector('#jwt-input');
  return page;
}

// Like openClean, but with the page clock pinned to a fixed instant (ms) so
// time-relative token states render deterministically.
async function openCleanAt(ctx, extId, timeMs) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.clock.install({ time: timeMs });
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.evaluate(async () => {
    localStorage.clear();
    try { await chrome.storage.local.clear(); } catch (_) {}
  });
  await page.reload();
  await page.waitForSelector('#jwt-input');
  return page;
}

async function decode(page, token) {
  await page.fill('#jwt-input', token);
  await page.locator('#jwt-input').press('Control+Enter');
  await page.waitForSelector('#payload-claims-visual', { state: 'visible' });
}

// Decode when the input may be hidden (already decoded) — reopen via the chip.
async function decodeFresh(page, token) {
  if (!(await page.locator('#jwt-input').isVisible())) {
    await page.click('#token-chip');
    await page.waitForSelector('#jwt-input', { state: 'visible' });
  }
  await decode(page, token);
}

async function tab(page, name) {
  await page.click(`.tab[data-tab="${name}"]`);
  await page.waitForSelector(`#panel-${name}:not([hidden])`);
}

async function shoot(page, selector, out) {
  await page.locator(selector).first().screenshot({ path: path.join(MEDIA, out) });
  console.log('  ✓', out);
}

async function shootClip(page, out, clip) {
  await page.screenshot({ path: path.join(MEDIA, out), clip });
  console.log('  ✓', out);
}

// ── Stills (each rendered in both themes) ───────────────────────────────────
const STILLS = [
  { name: '02-decoded-overview', sel: '#decoded-view',
    setup: async p => { await decode(p, readToken('Google')); await tab(p, 'payload'); } },
  { name: '03-claims-visual', sel: '#payload-claims-visual',
    setup: async p => { await decode(p, readToken('Okta')); await tab(p, 'payload'); } },
  { name: '05-privileged-role', sel: '#payload-claims-visual .claim-value-nested:has(.claim-chip.privileged)',
    setup: async p => { await decode(p, readToken('Keycloak')); await tab(p, 'payload'); } },
  { name: '09-verify-unsigned', sel: '#panel-verify',
    setup: async p => { await decode(p, readToken('alg: none')); await tab(p, 'verify'); } },
  { name: '10-visual', sel: '#payload-claims-visual',
    setup: async p => { await decode(p, readToken('Keycloak')); await tab(p, 'payload'); } },
  { name: '10-json-toggle', sel: '#payload-claims-json',
    setup: async p => {
      await decode(p, readToken('Keycloak')); await tab(p, 'payload');
      await p.click('.view-switch-btn[data-target="payload"][data-view="json"]');
      await p.waitForSelector('#payload-claims-json', { state: 'visible' });
    } },
  { name: '13-settings', sel: '#settings-view',
    setup: async p => { await p.click('#open-settings-btn'); await p.waitForSelector('#settings-view', { state: 'visible' }); } },
];

async function stills(ctx, extId, scheme) {
  for (const s of STILLS) {
    const page = await openClean(ctx, extId);
    try { await s.setup(page); await shoot(page, s.sel, `${s.name}${sfx(scheme)}.png`); }
    finally { await page.close(); }
  }
}

// Shots that need bespoke flows.
async function specialStills(ctx, extId, scheme) {
  const suffix = sfx(scheme);

  // 11 — multi-token detection from an OAuth-callback-style URL.
  {
    const page = await openClean(ctx, extId);
    const blob = `https://app.example.com/callback#id_token=${readToken('Google')}&access_token=${readToken('Auth0')}`;
    await page.fill('#jwt-input', blob);
    await page.locator('#jwt-input').press('Control+Enter');
    await page.waitForSelector('#token-selector:not(.hidden)');
    await shoot(page, '#token-selector', `11-multi-token${suffix}.png`);
    await page.close();
  }

  // 12 — history view (decode a few first so it has entries).
  {
    const page = await openClean(ctx, extId);
    for (const t of ['Google', 'Okta', 'Keycloak']) { await decodeFresh(page, readToken(t)); }
    await page.click('#history-toggle-btn');
    await page.waitForSelector('#history-view', { state: 'visible' });
    await shoot(page, '#history-view', `12-history${suffix}.png`);
    await page.close();
  }
}

// ── GIFs (each rendered in both themes) ─────────────────────────────────────
function assembleGif(name, fps, width) {
  const dir = path.join(FRAMES, name);
  const out = path.join(MEDIA, `${name}.gif`);
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer`;
  const r = spawnSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f%03d.png'), '-vf', vf, '-loop', '0', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${name} (is ffmpeg on PATH? set FFMPEG=)`);
  console.log('  ✓', `${name}.gif`);
}

async function frame(page, name, i, clip) {
  const dir = path.join(FRAMES, name);
  mkdirp(dir);
  await page.screenshot({ path: path.join(dir, `f${String(i).padStart(3, '0')}.png`), clip });
}

async function gifs(ctx, extId, scheme) {
  const suffix = sfx(scheme);

  // A — paste → decode. Fixed page clip so every frame is the same size.
  {
    const name = `paste-decode${suffix}`;
    const clip = { x: 0, y: 0, width: WIDTH, height: 540 };
    const page = await openClean(ctx, extId);
    let i = 0;
    await frame(page, name, i++, clip);                                   // empty
    await page.fill('#jwt-input', readToken('Google'));
    await frame(page, name, i++, clip);                                   // filled
    await page.locator('#jwt-input').press('Control+Enter');
    await page.waitForSelector('#payload-claims-visual', { state: 'visible' });
    await frame(page, name, i++, clip);                                   // decoded
    await tab(page, 'payload');
    await frame(page, name, i++, clip);
    await frame(page, name, i++, clip);                                   // hold
    await page.close();
    assembleGif(name, 2, WIDTH);
  }

  // B — token lifecycle, time-lapsed (Valid → Expiring → Expired) in ~9s.
  {
    const name = `countdown${suffix}`;
    const token = readToken('Google');
    const start = (payloadOf(token).exp - 480) * 1000;
    const page = await openCleanAt(ctx, extId, start);
    await decode(page, token);
    const box = await page.locator('#lifetime').boundingBox();
    const clip = { x: 0, y: 0, width: WIDTH, height: Math.min(900, Math.ceil(box.y + box.height + 8)) };
    for (let i = 0; i < 18; i++) { await frame(page, name, i, clip); await page.clock.runFor(40000); }
    await page.close();
    assembleGif(name, 2, WIDTH);
  }

  // C — expand a nested claim node.
  {
    const name = `nested-tree${suffix}`;
    const page = await openClean(ctx, extId);
    await decode(page, readToken('Keycloak')); await tab(page, 'payload');
    const panel = await page.locator('#panel-payload').boundingBox();
    const clip = { x: Math.floor(panel.x), y: Math.floor(panel.y), width: Math.ceil(panel.width), height: Math.min(540, Math.ceil(panel.height)) };
    const node = page.locator('.claim-node-head.is-toggle').first();
    let i = 0;
    await node.click();                                                   // collapse
    await frame(page, name, i++, clip);
    await frame(page, name, i++, clip);                                   // hold collapsed
    await node.click();                                                   // expand
    await page.waitForTimeout(150);
    await frame(page, name, i++, clip);
    await frame(page, name, i++, clip);                                   // hold expanded
    await page.close();
    assembleGif(name, 2, clip.width);
  }
}

// ── Status pills — the five lifetime states, in both themes ─────────────────
// Captured in a 2× (retina) context, cropped to the real status widget
// (#summary-status-wrap: tinted box + label + relative-time line). The clock
// is pinned per token so short-lived states don't lapse before capture.
async function statusPills() {
  const shots = [
    ['Google',         'valid',    p => p.exp - 1800],  // 30 min left → Valid
    ['Expiring soon',  'expiring', p => p.exp - 120],   // 2 min left (< threshold)
    ['Expired',        'expired',  p => p.exp + 300],   // 5 min past expiry
    ['Not yet active', 'notyet',   p => p.nbf - 60],    // activates in 60s
    ['No expiry',      'noexp',    p => (p.iat || 0) + 60],  // no exp claim
  ];
  for (const scheme of ['light', 'dark']) {
    const { ctx, extId } = await launch(scheme, 2);
    try {
      for (const [tokenName, state, at] of shots) {
        const token = readToken(tokenName);
        const page = await openCleanAt(ctx, extId, at(payloadOf(token)) * 1000);
        await decode(page, token);
        await shoot(page, '#summary-status-wrap', `08-status-${state}${sfx(scheme)}.png`);
        await page.close();
      }
    } finally { await ctx.close(); }
  }
}

// ── Logo & icons (vector → PNG via Chromium, transparent, theme-neutral) ────
async function rasterize(ctx, svgPath, width, height, outPath, ink) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
       html,body{margin:0;padding:0}
       #w{width:${width}px;height:${height}px;color:${ink || '#0f172a'}}
       #w svg{width:${width}px;height:${height}px;display:block}
     </style></head><body><div id="w">${svg}</div></body></html>`);
  await page.locator('#w').screenshot({ path: outPath, omitBackground: true });
  await page.close();
  console.log('  ✓', path.relative(EXT, outPath));
}

async function logoAndIcons(ctx) {
  const logoSvg = path.join(EXT, 'docs', 'logo.svg');
  // Each size rasterizes from a PURPOSE-BUILT source, not one file rescaled.
  // All are self-grounded indigo tiles (white knockout glyph) matching the
  // in-app header tile: 16 = two-bar, 32/48/128 = three-bar (payload longest).
  const iconSrc = {
    16:  path.join(EXT, 'docs', 'logo-mark-16.svg'),
    32:  path.join(EXT, 'docs', 'logo-mark-32.svg'),
    48:  path.join(EXT, 'docs', 'logo-mark.svg'),
    128: path.join(EXT, 'docs', 'logo-mark.svg'),
  };
  for (const [size, src] of Object.entries(iconSrc)) {
    await rasterize(ctx, src, +size, +size, path.join(ICONS, `icon${size}.png`));
  }
  await rasterize(ctx, logoSvg, 960, 240, path.join(MEDIA, 'hero-logo.png'), '#0f172a');
  await rasterize(ctx, logoSvg, 960, 240, path.join(MEDIA, 'hero-logo-dark.png'), '#f8f9fa');
}

async function main() {
  if (!fs.existsSync(TOKENS_MD)) {
    console.log('test-tokens.md missing — generating…');
    execFileSync('node', ['scripts/gen-test-tokens.js'], { cwd: EXT, stdio: 'inherit' });
  }
  mkdirp(MEDIA); mkdirp(ICONS); mkdirp(FRAMES);

  // Logo + icons FIRST: the manifest references icons/*.png, so they must exist
  // before the extension context loads (or the service worker won't register).
  console.log('logo + icons');
  const rb = await chromium.launch();
  try { await logoAndIcons(await rb.newContext()); } finally { await rb.close(); }

  for (const scheme of ['light', 'dark']) {
    console.log(`\n[${scheme}] stills + gifs`);
    const { ctx, extId } = await launch(scheme);
    try {
      await stills(ctx, extId, scheme);
      await specialStills(ctx, extId, scheme);
      await gifs(ctx, extId, scheme);
    } finally { await ctx.close(); }
  }

  console.log('\nstatus pills (2×, light + dark)');
  await statusPills();

  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log('\nDone → docs/media/ + icons/');
}

main().catch(err => { console.error(err); process.exit(1); });
