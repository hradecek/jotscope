// Generates SMOOTH looping video clips (MP4 + WebM + poster) of the animated
// popup flows for the website - a higher-fidelity replacement for the 2-fps
// key-frame GIFs. Records the real unpacked extension with Playwright's video
// capture (~25 fps, real motion), then transcodes with ffmpeg. Everything
// renders from the SYNTHETIC tokens in test-tokens.md, so output is safe to
// commit and reproducible.
//
//   node scripts/gen-clips.js            (all demos, both themes)
//   DEMO=paste-decode SCHEME=light node scripts/gen-clips.js   (one, for iterating)
//
// Requires @playwright/test's Chromium (installed) and ffmpeg on PATH
// (override with FFMPEG=). Writes to docs/media/clips/.
'use strict';

const { chromium } = require('@playwright/test');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT       = path.resolve(__dirname, '..');
const TOKENS_MD = path.join(EXT, 'test-tokens.md');
const OUT       = path.join(EXT, 'docs', 'media', 'clips');
const REC       = path.join(OUT, '.rec');
const FFMPEG    = process.env.FFMPEG || 'ffmpeg';
const WIDTH     = 440;
const sfx       = s => (s === 'dark' ? '-dark' : '');

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function readToken(nameSubstr) {
  const md = fs.readFileSync(TOKENS_MD, 'utf8');
  const idx = md.indexOf(nameSubstr);
  if (idx === -1) throw new Error(`No test-token section matching "${nameSubstr}"`);
  const m = md.slice(idx).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/);
  if (!m) throw new Error(`No JWT found under "${nameSubstr}"`);
  return m[0];
}

// A demo = a fixed capture height + a driver that performs the flow with
// real-time pauses so CSS animations land in the recording.
const DEMOS = {
  'paste-decode': {
    height: 540,
    async run(page) {
      await page.waitForTimeout(1400);                 // let the empty-state mark animate
      await page.fill('#jwt-input', readToken('Google'));
      await page.waitForTimeout(500);
      await page.locator('#jwt-input').press('Control+Enter');
      await page.waitForSelector('#payload-claims-visual', { state: 'visible' });
      await page.waitForTimeout(1500);                 // hold on the decoded overview
      await page.click('.tab[data-tab="payload"]');
      await page.waitForSelector('#panel-payload:not([hidden])');
      await page.waitForTimeout(1800);                 // hold on the claims
    },
  },
  'nested-tree': {
    height: 540,
    async run(page) {
      await page.fill('#jwt-input', readToken('Keycloak'));
      await page.locator('#jwt-input').press('Control+Enter');
      await page.waitForSelector('#payload-claims-visual', { state: 'visible' });
      await page.click('.tab[data-tab="payload"]');
      await page.waitForSelector('#panel-payload:not([hidden])');
      await page.waitForTimeout(1000);
      const node = page.locator('.claim-node-head.is-toggle').first();
      await node.click();                              // collapse
      await page.waitForTimeout(1100);
      await node.click();                              // expand (animates open)
      await page.waitForTimeout(1900);                 // hold expanded
    },
  },
};

function ff(args) {
  const r = spawnSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}

async function capture(scheme, demoName) {
  const demo = DEMOS[demoName];
  const recDir = path.join(REC, `${demoName}${sfx(scheme)}`);
  mkdirp(recDir);
  const t0 = Date.now();
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    colorScheme: scheme,
    viewport: { width: WIDTH, height: demo.height },
    recordVideo: { dir: recDir, size: { width: WIDTH, height: demo.height } },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 120000 });
  const extId = new URL(sw.url()).host;

  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.evaluate(async () => { localStorage.clear(); try { await chrome.storage.local.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForSelector('#jwt-input');
  await page.waitForTimeout(200);

  const startOffset = (Date.now() - t0) / 1000;        // trim the setup lead
  await demo.run(page);

  const src = await page.video().path();
  await ctx.close();                                   // finalizes the webm

  const base = path.join(OUT, `${demoName}${sfx(scheme)}`);
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  // MP4 (H.264, broad support) - start after setup, cap the tail
  ff(['-y', '-ss', startOffset.toFixed(2), '-i', src, '-an', '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p', '-vf', `${even},fps=25`, '-crf', '25', `${base}.mp4`]);
  // WebM (VP9) - smaller for browsers that prefer it
  ff(['-y', '-ss', startOffset.toFixed(2), '-i', src, '-an', '-c:v', 'libvpx-vp9',
      '-b:v', '0', '-crf', '34', '-vf', `${even},fps=25`, `${base}.webm`]);
  // Poster (first frame of the trimmed clip)
  ff(['-y', '-ss', startOffset.toFixed(2), '-i', src, '-frames:v', '1', '-update', '1', '-q:v', '3', `${base}-poster.jpg`]);

  console.log(`  ✓ ${demoName}${sfx(scheme)}  (trimmed ${startOffset.toFixed(2)}s lead)`);
}

(async () => {
  mkdirp(OUT);
  const only = process.env.DEMO ? [process.env.DEMO] : Object.keys(DEMOS);
  const schemes = process.env.SCHEME ? [process.env.SCHEME] : ['light', 'dark'];
  for (const scheme of schemes) {
    for (const name of only) {
      console.log(`[${scheme}] ${name}`);
      await capture(scheme, name);
    }
  }
  fs.rmSync(REC, { recursive: true, force: true });
  console.log('\nDone → docs/media/clips/');
})().catch(e => { console.error(e); process.exit(1); });
