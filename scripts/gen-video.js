// Generates the Chrome Web Store promo VIDEO (upload to YouTube, paste the link
// into the listing). Hybrid style: a branded intro card → a REAL screen
// recording of the extension being used → a branded call-to-action outro.
//
// The middle is an actual Playwright screen recording of the popup (real typing,
// clicks, tab switches, scrolling) - not a slideshow. That recording is then
// framed inside a 1920x1080 branded canvas with on-screen captions, rendered
// frame-by-frame (the <video> is seeked per output frame so motion is preserved
// exactly) and encoded to MP4 with ffmpeg. Frames stream straight into ffmpeg
// over stdin, so the disk footprint is just the final ~2 MB MP4.
//
// The video is silent; it also writes docs/store/vo/narration.json (the spoken
// script + timings). To add a voiceover, run gen-vo.js afterwards - it muxes the
// narration straight into promo-video.mp4 (no re-record, so timings stay aligned).
//
//   node scripts/gen-video.js         (npm run gen:video)
//
// Requires @playwright/test's Chromium (installed) and ffmpeg on PATH
// (override with FFMPEG=). All visuals come from the SYNTHETIC tokens in
// test-tokens.md - no real credentials, fully reproducible.
'use strict';

const { chromium } = require('@playwright/test');
const { execFileSync, spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT       = path.resolve(__dirname, '..');
const TOKENS_MD = path.join(EXT, 'test-tokens.md');
const OUT       = path.join(EXT, 'docs', 'store');
const FFMPEG    = process.env.FFMPEG || 'ffmpeg';
const W = 1920, H = 1080, FPS = 30, FADE = 0.45;
const INTRO = 3.0, OUTRO = 3.0;                        // seconds for the two cards
// Recording resolution == the viewport CSS size (Playwright ignores
// deviceScaleFactor for video). To record crisply we use a large viewport and
// zoom the (max-500px-wide) popup up to fill it.
const PV_W = 720, PV_H = 960, ZOOM = 1.44;             // 500px popup × 1.44 ≈ 720

function readToken(nameSubstr) {
  const md = fs.readFileSync(TOKENS_MD, 'utf8');
  const idx = md.indexOf(nameSubstr);
  if (idx === -1) throw new Error(`No test-token section matching "${nameSubstr}"`);
  const m = md.slice(idx).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/);
  if (!m) throw new Error(`No JWT found under "${nameSubstr}"`);
  return m[0];
}
const payloadOf = t => JSON.parse(Buffer.from(
  t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

// The Jotscope logo mark (matches docs/logo-mark.svg), inlined for the cards.
const MARK = `<svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="32" fill="#6366f1"/>
  <line x1="76" y1="76" x2="99" y2="99" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
  <circle cx="53" cy="53" r="30" stroke="#fff" stroke-width="9"/>
  <rect x="39" y="44" width="24" height="6.5" rx="3.25" fill="#fff"/>
  <rect x="39" y="53.75" width="32" height="6.5" rx="3.25" fill="#fff"/>
  <rect x="39" y="63.5" width="19" height="6.5" rx="3.25" fill="#fff"/>
</svg>`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Record the real popup session ───────────────────────────────────────────
// Drives the live extension with human-paced actions while Playwright records
// video. Returns the recording path, its duration, and the wall-clock offset
// (seconds from recording start) of each captioned moment.
async function record() {
  const videoDir = fs.mkdirSync(path.join(os.tmpdir(), 'jotscope-rec-'), { recursive: true })
    || path.join(os.tmpdir(), 'jotscope-rec-' + process.pid);
  fs.mkdirSync(videoDir, { recursive: true });

  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', colorScheme: 'light',
    viewport: { width: PV_W, height: PV_H },
    recordVideo: { dir: videoDir, size: { width: PV_W, height: PV_H } },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new'],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 120000 });
  const extId = new URL(sw.url()).host;

  const page = await ctx.newPage();
  const t0 = Date.now();                               // ≈ recording start
  const marks = {};
  const mark = name => { marks[name] = (Date.now() - t0) / 1000; };

  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.evaluate(async () => { localStorage.clear(); try { await chrome.storage.local.clear(); } catch (_) {} });
  await page.reload();
  await page.waitForSelector('#jwt-input');
  // Zoom the popup to fill the recording frame crisply, and paint the page in
  // the popup's own light theme colour so any space below the content (this is a
  // standalone page, not a real popup) blends in seamlessly instead of showing
  // the browser's default grey.
  await page.evaluate(z => {
    document.documentElement.style.zoom = String(z);
    document.documentElement.style.setProperty('background', '#f8f9fa', 'important');
    document.body.style.setProperty('background', '#f8f9fa', 'important');
    document.body.style.margin = '0';
  }, ZOOM);
  await sleep(900);

  const google = readToken('Google');
  const unsigned = readToken('alg: none');

  // 1) Paste a token and decode it.
  mark('decode');
  await page.click('#jwt-input');
  await page.fill('#jwt-input', google);               // paste
  await sleep(1300);
  await page.locator('#jwt-input').press('Control+Enter');
  await page.waitForSelector('#payload-claims-visual', { state: 'visible' });
  await sleep(2200);                                    // read the overview

  // 2) Browse the claims tree (scroll through it).
  mark('claims');
  await page.click('.tab[data-tab="payload"]');
  await page.waitForSelector('#panel-payload:not([hidden])');
  await sleep(700);
  await page.mouse.move(PV_W / 2, PV_H / 2);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 90); await sleep(260); }
  await sleep(600);
  await page.mouse.wheel(0, -600); await sleep(300);

  // 3) Inspect a different, unsigned token → the risk warning + Verify tab.
  //    ~2s shorter than the claims/decode beats.
  mark('verify');
  await page.click('#token-chip');
  await page.waitForSelector('#jwt-input', { state: 'visible' });
  await page.fill('#jwt-input', unsigned);
  await sleep(900);
  await page.locator('#jwt-input').press('Control+Enter');
  await page.waitForSelector('#payload-claims-visual', { state: 'visible' });
  await sleep(800);                                     // the "unsigned" banner
  await page.click('.tab[data-tab="verify"]');
  await page.waitForSelector('#panel-verify:not([hidden])');
  await sleep(1100);

  // 4) Open Settings - privacy / offline / open-source.
  mark('privacy');
  await page.click('#open-settings-btn');
  await page.waitForSelector('#settings-view', { state: 'visible' });
  await sleep(1600);
  await page.mouse.move(PV_W / 2, PV_H / 2);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 110); await sleep(280); }
  await sleep(1100);                                    // shorter tail → outro starts sooner (smaller gap before it)

  const vid = page.video();
  await ctx.close();                                   // finalizes the recording
  const src = await vid.path();
  const recEnd = (Date.now() - t0) / 1000;             // approx; refined by ffprobe below
  return { src, marks, recEnd };
}

function probeDuration(file) {
  const r = spawnSync(FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'),
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) ? d : null;
}

// ── The 1920x1080 player: setFrame(t) sets captions + seeks the recording ────
function playerHtml(webmDataUri, recDur, videoStart, beats) {
  const CAPS = beats.map(b => ({ t0: b.t0, hero: b.hero || null, title: b.title || '', sub: b.sub || '' }));
  const liveEnd = beats.find(b => b.hero === 'outro').t0;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden;background:#f8f9ff}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    #bg{position:absolute;inset:0;
      background:
        radial-gradient(1500px 900px at 90% -12%, #e0e7ff 0%, rgba(224,231,255,0) 60%),
        radial-gradient(1200px 780px at 3% 118%, #ede9fe 0%, rgba(237,233,254,0) 55%),
        linear-gradient(135deg,#f8f9ff 0%,#eef2ff 100%);}
    #bg .wm{position:absolute;right:-120px;bottom:-200px;width:760px;height:760px;opacity:.05;transform:rotate(-8deg)}
    .layer{position:absolute;inset:0;opacity:0}
    .pos{position:absolute}
    .pos.cap{left:130px;top:50%;transform:translateY(-50%);width:820px}
    .pos.hero{left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;width:1200px}
    h1{font-size:70px;line-height:1.04;font-weight:800;color:#1a1a2e;letter-spacing:-2.5px;margin-bottom:22px}
    h1 em{font-style:normal;color:#6366f1}
    p.sub{font-size:32px;line-height:1.4;color:#475569;font-weight:450;max-width:700px}
    .hero .mark{width:140px;height:140px;margin:0 auto 26px;filter:drop-shadow(0 14px 28px rgba(99,102,241,.38))}
    .hero .name{font-size:104px;font-weight:800;color:#1a1a2e;letter-spacing:-3px;line-height:1}
    .hero .tag{margin-top:22px;font-size:38px;font-weight:500;color:#4f46e5}
    .hero .tag b{color:#312e81;font-weight:700}
    .hero .cta{display:inline-block;margin-top:34px;padding:18px 40px;border-radius:999px;background:#6366f1;
      color:#fff;font-size:34px;font-weight:700;box-shadow:0 16px 32px -10px rgba(99,102,241,.55)}
    .hero .repo{margin-top:22px;font-size:24px;color:#64748b;font-family:'SF Mono',Monaco,monospace}
    #vidwrap{position:absolute;right:150px;top:50%;opacity:0;
      border-radius:22px;overflow:hidden;border:1px solid rgba(255,255,255,.9);
      box-shadow:0 40px 80px -18px rgba(49,46,129,.34),0 16px 32px -12px rgba(49,46,129,.24)}
    #rec{display:block}
  </style></head><body>
    <div id="bg"><div class="wm">${MARK}</div></div>
    <div id="vidwrap"><video id="rec" src="${webmDataUri}" preload="auto" muted></video></div>
    <div class="layer" id="c0"></div><div class="layer" id="c1"></div>
  <script>
    const CAPS=${JSON.stringify(CAPS)}, MARK=${JSON.stringify(MARK)};
    const FADE=${FADE}, INTRO=${INTRO}, RECDUR=${recDur}, VSTART=${videoStart}, LIVE_END=${liveEnd};
    const capL=[document.getElementById('c0'),document.getElementById('c1')];
    const wrap=document.getElementById('vidwrap'), rec=document.getElementById('rec');

    // Size the video card to a fixed height, keeping the recording's aspect.
    const DISP_H=820, AR=${PV_W}/${PV_H};
    rec.style.height=DISP_H+'px'; rec.style.width=Math.round(DISP_H*AR)+'px';
    wrap.style.transform='translateY(-50%)';

    function hero(kind){
      if(kind==='intro') return '<div class="pos hero"><div class="fg"><div class="mark">'+MARK+'</div>'
        +'<div class="name">Jotscope</div><div class="tag">Inspect, decode &amp; verify JWTs - <b>in your browser</b></div></div></div>';
      return '<div class="pos hero"><div class="fg"><div class="mark">'+MARK+'</div><div class="name">Jotscope</div>'
        +'<div class="cta">Add to Chrome - it\\'s free</div>'
        +'<div class="repo">github.com/hradecek/jotscope · open source, MIT</div></div></div>';
    }
    function buildCap(i){ const b=CAPS[i]; return b.hero?hero(b.hero)
      :'<div class="pos cap"><div class="fg"><h1>'+b.title+'</h1><p class="sub">'+b.sub+'</p></div></div>'; }
    function setLayer(l,idx){ if(l.dataset.idx!==String(idx)){ l.dataset.idx=String(idx); l.innerHTML=buildCap(idx); } }
    function captions(t){
      let k=0; for(let i=0;i<CAPS.length;i++){ if(t>=CAPS[i].t0) k=i; }
      const op=Math.min(1,(t-CAPS[k].t0)/FADE);
      const cur=capL[k%2], prev=capL[(k+1)%2];
      setLayer(cur,k); cur.style.opacity=op;
      const fg=cur.querySelector('.fg'); if(fg) fg.style.transform='translateY('+((1-op)*16).toFixed(2)+'px) scale('+(0.99+0.01*op).toFixed(4)+')';
      if(k>0&&op<1){ setLayer(prev,k-1); prev.style.opacity=1-op; } else prev.style.opacity=0;
    }
    function seek(time){ return new Promise(res=>{
      const want=Math.max(0,Math.min(RECDUR-0.05,time));
      if(Math.abs(rec.currentTime-want)<0.001){ res(); return; }
      const on=()=>{ rec.removeEventListener('seeked',on); res(); };
      rec.addEventListener('seeked',on); rec.currentTime=want;
      setTimeout(on,400);                                // safety net
    });}
    window.ready = () => new Promise(res=>{ if(rec.readyState>=1) res(); else rec.addEventListener('loadedmetadata',()=>res(),{once:true}); });
    window.setFrame = async function(t){
      captions(t);
      // video fades in after intro, out before outro
      let vop=0;
      // fade the example in exactly as the intro caption crossfades out, so the
      // intro slide is fully gone by the time the example is fully in.
      if(t>=INTRO && t<=LIVE_END){ vop=Math.min(1,(t-INTRO)/FADE); }
      if(t>LIVE_END-FADE && t<=LIVE_END){ vop=Math.min(vop,(LIVE_END-t)/FADE); }
      if(t>LIVE_END) vop=0;
      wrap.style.opacity=vop;
      if(vop>0){ await seek(VSTART + (t-INTRO)); }
    };
  <\/script></body></html>`;
}

function mkdirp(p){ fs.mkdirSync(p, { recursive: true }); }

// Render every frame and stream it straight into ffmpeg over stdin (image2pipe),
// so we never write hundreds of PNGs to disk - only the final ~2 MB MP4. Keeps
// the disk footprint tiny and the render robust on a nearly-full drive.
async function renderToSilent(webmDataUri, recDur, videoStart, beats, end) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.setContent(playerHtml(webmDataUri, recDur, videoStart, beats), { waitUntil: 'load' });
  await page.evaluate(() => window.ready());

  const silent = path.join(OUT, '.video-silent.mp4');
  const proc = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', silent]);
  let ffErr = '';
  proc.stderr.on('data', d => { ffErr += d.toString(); });
  const done = new Promise((res, rej) => {
    proc.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg encode failed (exit ' + c + '):\n' + ffErr.slice(-800))));
    proc.on('error', rej);
  });
  const drain = () => new Promise(r => proc.stdin.once('drain', r));

  const total = Math.round(end * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.setFrame(t), i / FPS);
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
    if (!proc.stdin.write(buf)) await drain();         // respect ffmpeg backpressure
    if (i % 60 === 0 || i === total - 1) console.log(`  frame ${i + 1}/${total}`);
  }
  proc.stdin.end();
  await done;
  await browser.close();
  return silent;
}

// Produce the final (silent) video. Voiceover is added afterwards by gen-vo.js,
// which muxes straight into this file - gen-video always re-records (so timings
// shift run-to-run), so it must NOT try to reuse an old voiceover track here.
function finalize(silent) {
  const out = path.join(OUT, 'promo-video.mp4');
  fs.renameSync(silent, out);
  return out;
}

function writeNarration(beats) {
  const dir = path.join(OUT, 'vo'); mkdirp(dir);
  const lines = beats.map((b, i) => ({
    id: String(i + 1).padStart(2, '0'),
    t0: +b.t0.toFixed(2),
    t1: +(i + 1 < beats.length ? beats[i + 1].t0 : beats[i].t0 + 3).toFixed(2),
    text: b.vo,
  }));
  fs.writeFileSync(path.join(dir, 'narration.json'), JSON.stringify({ fps: FPS, lines }, null, 2));
  console.log('  ✓', path.relative(EXT, path.join(dir, 'narration.json')));
}

async function main() {
  // Always regenerate tokens so the recording shows fresh, non-expired tokens
  // (a stale test-tokens.md would render everything as "Expired").
  console.log('regenerating synthetic tokens');
  execFileSync('node', ['scripts/gen-test-tokens.js'], { cwd: EXT, stdio: 'inherit' });
  mkdirp(OUT);

  console.log('recording real popup session'); const { src, marks } = await record();
  const recDur = probeDuration(src) || (marks.privacy + 5);
  const videoStart = Math.max(0, marks.decode);         // start the clip right at the first paste, so the decode caption lands at INTRO

  // Map recording moments → final-timeline beats (recTime → INTRO + (recTime - videoStart)).
  const at = m => +(INTRO + (marks[m] - videoStart)).toFixed(3);
  const liveEnd = +(INTRO + (recDur - videoStart)).toFixed(3);
  const beats = [
    // vo lines are kept short so each fits inside its beat's on-screen window
    // (gen-vo.js also guarantees no overlap). Roughly ~14 chars/sec of speech.
    { t0: 0.0, hero: 'intro', vo: 'Meet Jotscope. <break time="0.4s" /> A JWT inspector.' },
    { t0: at('decode'),  title: 'Decode any JWT <em>instantly</em>',
      sub: 'Paste a token - header, payload &amp; signature, decoded offline.',
      vo: 'Paste any token, and it is decoded instantly.' },
    { t0: at('claims'),  title: 'Claims you can <em>actually read</em>',
      sub: 'Typed values, real dates, and role chips instead of raw JSON.',
      vo: 'Every claim in a clean, readable tree.' },
    { t0: at('verify'),  title: 'Verify signatures, <em>flag risks</em>',
      sub: 'Catch unsigned “alg: none” tokens and weak algorithms at a glance.',
      vo: 'It flags unsigned and weak-algorithm tokens.' },
    { t0: at('privacy'), title: '<em>100% offline.</em> No tracking',
      sub: 'No servers, no analytics - tokens never leave your browser.',
      vo: 'And it all runs offline. <break time="0.3s" /> No servers, no tracking.' },
    { t0: liveEnd, hero: 'outro', vo: 'Jotscope. Free and open source.' },
  ];
  const end = liveEnd + OUTRO;

  console.log('narration script'); writeNarration(beats);

  if (process.env.KEEP_REC) { fs.copyFileSync(src, path.join(OUT, '.debug-rec.webm')); console.log('  kept raw recording → docs/store/.debug-rec.webm'); }
  const webmDataUri = 'data:video/webm;base64,' + fs.readFileSync(src).toString('base64');
  console.log(`rendering ${Math.round(end * FPS)} frames @ ${FPS}fps (real recording ${recDur.toFixed(1)}s)`);
  const silent = await renderToSilent(webmDataUri, recDur, videoStart, beats, end);

  console.log('encoding'); const out = finalize(silent);
  try { fs.rmSync(path.dirname(src), { recursive: true, force: true }); } catch (_) {}
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`\nDone → ${path.relative(EXT, out)}  (${W}x${H}, ${end.toFixed(1)}s, ${kb} KB, silent).`);
  console.log('Add narration: set ELEVENLABS_API_KEY and run `npm run gen:vo` (muxes straight into this file).');
  console.log('Then upload to YouTube and paste the link in the listing.');
}

main().catch(err => { console.error(err); process.exit(1); });
