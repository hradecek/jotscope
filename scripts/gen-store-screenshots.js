// Generates the Chrome Web Store listing screenshots: five 1280x800 JPEGs that
// showcase the extension's key features. Each shot drives the REAL unpacked
// extension with Playwright's Chromium, captures the popup UI, then composites
// it onto a branded canvas with a headline. All images render from the
// SYNTHETIC tokens in test-tokens.md (no real credentials), so the output is
// safe and fully reproducible.
//
//   node scripts/gen-store-screenshots.js   (npm run gen:store)
//
// Output: docs/store/*.jpg  - 1280x800, JPEG (no alpha channel), exactly what
// the Chrome Web Store "Screenshots" field accepts (max 5, at least 1 required).
'use strict';

const { chromium } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT       = path.resolve(__dirname, '..');
const TOKENS_MD = path.join(EXT, 'test-tokens.md');
const OUT       = path.join(EXT, 'docs', 'store');
const CANVAS_W  = 1280;
const CANVAS_H  = 800;
const DSF       = 2;                   // capture the popup at 2x for crisp scaling
const POPUP_W   = 460;                 // inside the popup's 420-500px clamp

function readToken(nameSubstr) {
  const md = fs.readFileSync(TOKENS_MD, 'utf8');
  const idx = md.indexOf(nameSubstr);
  if (idx === -1) throw new Error(`No test-token section matching "${nameSubstr}"`);
  const m = md.slice(idx).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/);
  if (!m) throw new Error(`No JWT found under "${nameSubstr}"`);
  return m[0];
}

// PNG intrinsic size lives at bytes 16-24 (IHDR width/height, big-endian).
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function payloadOf(token) {
  const seg = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(seg, 'base64').toString('utf8'));
}

async function launch(colorScheme) {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    colorScheme,
    deviceScaleFactor: DSF,
    viewport: { width: POPUP_W, height: 1000 },
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

async function openClean(ctx, extId, timeMs) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: POPUP_W, height: 1000 });
  if (timeMs != null) await page.clock.install({ time: timeMs });
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

async function tab(page, name) {
  await page.click(`.tab[data-tab="${name}"]`);
  await page.waitForSelector(`#panel-${name}:not([hidden])`);
}

// The Jotscope logo mark (indigo tile, white magnifier), inlined so the canvas
// needs no external asset. Matches docs/logo-mark.svg.
const MARK = `<svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="32" fill="#6366f1"/>
  <line x1="76" y1="76" x2="99" y2="99" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <circle cx="53" cy="53" r="30" stroke="#fff" stroke-width="9"/>
  <rect x="39" y="44" width="24" height="6.5" rx="3.25" fill="#fff"/>
  <rect x="39" y="53.75" width="32" height="6.5" rx="3.25" fill="#fff"/>
  <rect x="39" y="63.5" width="19" height="6.5" rx="3.25" fill="#fff"/>
</svg>`;

// Compose one 1280x800 tile: headline + subline in a left column, the captured
// popup floating in a shadowed card on the right. Returns a JPEG buffer.
async function compose(composeCtx, shot, scene) {
  const { w, h } = pngSize(shot);
  const cssW = w / DSF, cssH = h / DSF;                 // popup's logical size
  const maxH = CANVAS_H - 96;                           // vertical breathing room
  const scale = Math.min(1, maxH / cssH);               // shrink tall popups to fit
  const dataUri = `data:image/png;base64,${shot.toString('base64')}`;

  // Composite in a DSF=1 context so the canvas screenshot is EXACTLY 1280x800
  // (the popup image is 2x, so it stays crisp when displayed smaller here).
  const page = await composeCtx.newPage();
  await page.setViewportSize({ width: CANVAS_W, height: CANVAS_H });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${CANVAS_W}px;height:${CANVAS_H}px;overflow:hidden}
    body{
      display:flex;align-items:center;gap:56px;padding:0 72px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:
        radial-gradient(1100px 700px at 88% -10%, #e0e7ff 0%, rgba(224,231,255,0) 60%),
        radial-gradient(900px 600px at 6% 110%, #ede9fe 0%, rgba(237,233,254,0) 55%),
        linear-gradient(135deg,#f8f9ff 0%,#eef2ff 100%);
      position:relative;
    }
    /* faint oversized watermark mark, bottom-right */
    .wm{position:absolute;right:-90px;bottom:-120px;width:520px;height:520px;opacity:.05;transform:rotate(-8deg)}
    .copy{flex:1;min-width:0;max-width:600px}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}
    .brand svg{width:44px;height:44px;filter:drop-shadow(0 6px 14px rgba(99,102,241,.35))}
    .brand .name{font-size:26px;font-weight:700;color:#312e81;letter-spacing:-.5px}
    h1{font-size:52px;line-height:1.08;font-weight:800;color:#1a1a2e;letter-spacing:-1.5px;margin-bottom:22px}
    h1 em{font-style:normal;color:#6366f1}
    p.sub{font-size:24px;line-height:1.45;color:#475569;font-weight:450;max-width:520px}
    .stage{flex-shrink:0;width:${Math.round(cssW * scale)}px}
    .stage img{
      width:100%;display:block;border-radius:16px;
      box-shadow:0 30px 60px -12px rgba(49,46,129,.30),0 12px 24px -8px rgba(49,46,129,.22);
      border:1px solid rgba(255,255,255,.9);
    }
  </style></head><body>
    <div class="wm">${MARK}</div>
    <div class="copy">
      <div class="brand">${MARK}<span class="name">Jotscope</span></div>
      <h1>${scene.title}</h1>
      <p class="sub">${scene.sub}</p>
    </div>
    <div class="stage"><img src="${dataUri}"></div>
  </body></html>`);
  await page.waitForLoadState('networkidle');
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
  await page.close();
  return jpeg;
}

// The five scenes, in listing order. `setup` leaves the popup in the state to
// capture; `sel` is the element to screenshot (defaults to the whole popup).
const SCENES = [
  {
    file: '1-decode',
    title: 'Decode any JWT <em>instantly</em>',
    sub: 'Paste a token and read its header, payload, and signature - decoded 100% offline, right in your browser.',
    token: 'Google',
    time: t => (payloadOf(t).exp - 1800) * 1000,   // 30 min left → green "Valid" pill
    setup: async (p, t) => { await decode(p, t); await tab(p, 'payload'); },
  },
  {
    file: '2-claims',
    title: 'Claims you can <em>actually read</em>',
    sub: 'Typed values, human-formatted timestamps, and role chips - no more squinting at raw JSON.',
    token: 'Okta',
    time: t => (payloadOf(t).exp - 1800) * 1000,   // 30 min left → green "Valid" pill
    setup: async (p, t) => { await decode(p, t); await tab(p, 'payload'); },
  },
  {
    file: '3-verify',
    title: 'Verify signatures, <em>flag risks</em>',
    sub: 'Check HMAC and RSA/EC signatures against a JWKS, and spot an unsigned “alg: none” token at a glance.',
    setup: async p => { await decode(p, readToken('alg: none')); await tab(p, 'verify'); },
  },
  {
    file: '4-lifecycle',
    title: 'Know when a token <em>expires</em>',
    sub: 'A live status pill and countdown tell you if a token is valid, expiring soon, expired, or not yet active.',
    // pin the clock so the Google token reads "expiring soon" (2 min left)
    time: t => (payloadOf(t).exp - 120) * 1000,
    token: 'Google',
    setup: async (p, t) => { await decode(p, t); await tab(p, 'payload'); },
  },
  {
    file: '5-privacy',
    title: '<em>100% offline.</em> Zero tracking',
    sub: 'No external API calls, no analytics - your tokens never leave your machine. Open source under MIT.',
    sel: '#settings-view',   // settings replaces .container, which gets hidden
    setup: async p => {
      await p.click('#open-settings-btn');
      await p.waitForSelector('#settings-view', { state: 'visible' });
    },
  },
];

// The 440x280 "Small promo tile" - a pure brand card (logo mark + wordmark +
// tagline), no popup. Same gradient/watermark language as the screenshots.
async function promoTile(composeCtx) {
  const page = await composeCtx.newPage();
  await page.setViewportSize({ width: 440, height: 280 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:440px;height:280px;overflow:hidden}
    body{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:
        radial-gradient(520px 340px at 88% -20%, #e0e7ff 0%, rgba(224,231,255,0) 62%),
        radial-gradient(460px 320px at 4% 120%, #ede9fe 0%, rgba(237,233,254,0) 58%),
        linear-gradient(135deg,#f8f9ff 0%,#eef2ff 100%);
      position:relative;text-align:center;
    }
    .wm{position:absolute;right:-70px;bottom:-90px;width:300px;height:300px;opacity:.05;transform:rotate(-8deg)}
    .mark{width:76px;height:76px;filter:drop-shadow(0 10px 20px rgba(99,102,241,.35));margin-bottom:16px}
    .name{font-size:44px;font-weight:800;color:#1a1a2e;letter-spacing:-1.5px;line-height:1}
    .tag{margin-top:12px;font-size:17px;font-weight:500;color:#4f46e5;letter-spacing:.2px}
    .tag b{color:#312e81;font-weight:700}
  </style></head><body>
    <div class="wm">${MARK}</div>
    <div class="mark">${MARK}</div>
    <div class="name">Jotscope</div>
    <div class="tag">Decode &amp; verify JWTs · <b>100% offline</b></div>
  </body></html>`);
  await page.waitForLoadState('networkidle');
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
  await page.close();
  const out = path.join(OUT, 'promo-small.jpg');
  fs.writeFileSync(out, jpeg);
  console.log('  ✓', path.relative(EXT, out), `(${(jpeg.length / 1024).toFixed(0)} KB)`);
}

// The 1400x560 "Marquee promo tile" - a wide banner: brand + headline on the
// left, a product shot (the decode popup) floating on the right. Reuses a popup
// screenshot already captured for the listing screenshots.
async function marqueeTile(composeCtx, shot) {
  const { w, h } = pngSize(shot);
  const cssW = w / DSF, cssH = h / DSF;
  const scale = Math.min(1, (560 - 64) / cssH);        // fit the 560px height
  const dataUri = `data:image/png;base64,${shot.toString('base64')}`;

  const page = await composeCtx.newPage();
  await page.setViewportSize({ width: 1400, height: 560 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:1400px;height:560px;overflow:hidden}
    body{
      display:flex;align-items:center;gap:72px;padding:0 96px;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:
        radial-gradient(1200px 720px at 90% -20%, #e0e7ff 0%, rgba(224,231,255,0) 60%),
        radial-gradient(1000px 640px at 4% 120%, #ede9fe 0%, rgba(237,233,254,0) 55%),
        linear-gradient(135deg,#f8f9ff 0%,#eef2ff 100%);
      position:relative;
    }
    .wm{position:absolute;right:-100px;bottom:-160px;width:620px;height:620px;opacity:.05;transform:rotate(-8deg)}
    .copy{flex:1;min-width:0}
    .brand{display:flex;align-items:center;gap:14px;margin-bottom:30px}
    .brand svg{width:52px;height:52px;filter:drop-shadow(0 8px 18px rgba(99,102,241,.35))}
    .brand .name{font-size:32px;font-weight:800;color:#312e81;letter-spacing:-1px}
    h1{font-size:60px;line-height:1.05;font-weight:800;color:#1a1a2e;letter-spacing:-2px;margin-bottom:24px}
    h1 em{font-style:normal;color:#6366f1}
    p.sub{font-size:26px;line-height:1.4;color:#475569;font-weight:450;max-width:560px}
    .stage{flex-shrink:0;width:${Math.round(cssW * scale)}px}
    .stage img{
      width:100%;display:block;border-radius:18px;
      box-shadow:0 34px 68px -14px rgba(49,46,129,.32),0 14px 28px -10px rgba(49,46,129,.24);
      border:1px solid rgba(255,255,255,.9);
    }
  </style></head><body>
    <div class="wm">${MARK}</div>
    <div class="copy">
      <div class="brand">${MARK}<span class="name">Jotscope</span></div>
      <h1>Decode &amp; verify JWTs<br><em>100% offline</em></h1>
      <p class="sub">Inspect, decode, and verify JSON Web Tokens right in your browser - no server, no tracking.</p>
    </div>
    <div class="stage"><img src="${dataUri}"></div>
  </body></html>`);
  await page.waitForLoadState('networkidle');
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
  await page.close();
  const out = path.join(OUT, 'promo-marquee.jpg');
  fs.writeFileSync(out, jpeg);
  console.log('  ✓', path.relative(EXT, out), `(${(jpeg.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  if (!fs.existsSync(TOKENS_MD)) {
    console.log('test-tokens.md missing - generating…');
    execFileSync('node', ['scripts/gen-test-tokens.js'], { cwd: EXT, stdio: 'inherit' });
  }
  fs.mkdirSync(OUT, { recursive: true });

  const { ctx, extId } = await launch('light');
  const composeBrowser = await chromium.launch();
  const composeCtx = await composeBrowser.newContext({ deviceScaleFactor: 1 });
  const shots = {};                                    // popup captures, reused by the promo tiles
  try {
    for (const s of SCENES) {
      const token = s.token ? readToken(s.token) : null;
      const timeMs = s.time && token ? s.time(token) : undefined;
      const page = await openClean(ctx, extId, timeMs);
      try {
        await s.setup(page, token);
        const shot = await page.locator(s.sel || '.container').first()
          .screenshot({ type: 'png' });
        shots[s.file] = shot;
        const jpeg = await compose(composeCtx, shot, s);
        const out = path.join(OUT, `${s.file}.jpg`);
        fs.writeFileSync(out, jpeg);
        console.log('  ✓', path.relative(EXT, out), `(${(jpeg.length / 1024).toFixed(0)} KB)`);
      } finally { await page.close(); }
    }
    console.log('\nsmall promo tile (440×280)');
    await promoTile(composeCtx);
    console.log('\nmarquee promo tile (1400×560)');
    await marqueeTile(composeCtx, shots['1-decode']);
  } finally { await ctx.close(); await composeBrowser.close(); }

  console.log(`\nDone → ${path.relative(EXT, OUT)}/  (1280×800 screenshots + 440×280 & 1400×560 promo, all JPEG no-alpha)`);
}

main().catch(err => { console.error(err); process.exit(1); });
