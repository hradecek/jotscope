// Generates the promo-video voiceover with ElevenLabs text-to-speech, then
// assembles a single track aligned to the storyboard timings so it drops
// straight onto the video.
//
//   ELEVENLABS_API_KEY=sk_...  node scripts/gen-vo.js      (npm run gen:vo)
//
// Optional env:
//   ELEVENLABS_VOICE_ID  voice to use (default: Rachel, a stock ElevenLabs voice)
//   ELEVENLABS_MODEL     model id (default: eleven_multilingual_v2)
//
// Reads docs/store/vo/narration.json (written by gen-video.js) for the lines and
// their start times. Produces:
//   docs/store/vo/<id>.mp3   one clip per narration line
//   docs/store/vo/vo-track.mp3   all clips delayed to their t0 and mixed
// Then re-run `node scripts/gen-video.js` to mux vo-track.mp3 into promo-video.mp4.
//
// Requires ffmpeg on PATH (override with FFMPEG=). Nothing is uploaded anywhere
// except the narration text sent to the ElevenLabs API with YOUR key.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EXT      = path.resolve(__dirname, '..');
const VO_DIR   = path.join(EXT, 'docs', 'store', 'vo');
const NARR      = path.join(VO_DIR, 'narration.json');
const FFMPEG   = process.env.FFMPEG || 'ffmpeg';
const KEY      = process.env.ELEVENLABS_API_KEY;
const VOICE    = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // "Rachel"
const MODEL    = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
// Delivery tuning. Lower stability = livelier / less monotone (that "boring"
// flatness comes from high stability + zero style); higher style = more
// expressive. Overridable per run via env so you can dial it in without edits.
const num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const STABILITY  = num('ELEVENLABS_STABILITY', 0.35);
const STYLE      = num('ELEVENLABS_STYLE', 0.3);
const SIMILARITY = num('ELEVENLABS_SIMILARITY', 0.0);
// Target playback speed. ElevenLabs caps its own `speed` at 1.2, so anything
// faster is split: run the model at 1.2, then apply the remainder as an ffmpeg
// atempo pass on each clip. Clips stay anchored to their beat t0, so faster
// speech just leaves a little more gap - it never desyncs from the visuals.
const SPEED_MIN = 0.7, API_SPEED_MAX = 1.2;
const TARGET_SPEED = Math.max(SPEED_MIN, num('ELEVENLABS_SPEED', 1.07));
const API_SPEED    = Math.min(API_SPEED_MAX, TARGET_SPEED);
const EXTRA_TEMPO  = TARGET_SPEED / API_SPEED;      // 1.0 when TARGET ≤ 1.2

// atempo only accepts 0.5–2.0 per instance, so chain it for larger factors.
function atempoChain(f) {
  const parts = []; let r = f;
  while (r > 2.0) { parts.push('atempo=2.0'); r /= 2.0; }
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  parts.push('atempo=' + r.toFixed(4));
  return parts.join(',');
}
const CINEMATIC  = process.env.VO_CINEMATIC !== '0'; // EQ + light reverb on the mix

async function tts(text, outPath) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text, model_id: MODEL,
      voice_settings: { stability: STABILITY, similarity_boost: SIMILARITY, style: STYLE, use_speaker_boost: true, speed: API_SPEED },
    }),
  });
  if (res.status === 402) {
    throw new Error('ElevenLabs 402: this voice needs a paid plan (library voices are paid-only on the free '
      + 'tier). List your account voices with `node scripts/gen-vo.js --voices` and pick a "premade" one, '
      + 'then set ELEVENLABS_VOICE_ID to its id.');
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

// List the voices available on this account (with category), so the user can
// pick one usable on the free tier - "premade" defaults and voices they own,
// NOT shared library voices (those are 402 paid-only).
async function listVoices() {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': KEY } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const { voices } = await res.json();
  console.log(`${voices.length} voice(s) on your account (free tier can use "premade" + your own):\n`);
  const pad = s => (s + '           ').slice(0, 11);
  for (const v of voices) console.log(`  ${v.voice_id}  [${pad(v.category)}]  ${v.name}`);
  console.log('\nPick one, then:  export ELEVENLABS_VOICE_ID=<id>  (PowerShell: $env:ELEVENLABS_VOICE_ID="<id>")');
  console.log('and run:  npm run gen:vo');
}

// Replace dest with src, tolerating Windows file locks (EPERM/EBUSY) from a
// media player or the Explorer preview holding the target open: retry a few
// times, then fall back to copy-over, then give a clear instruction.
async function replaceFile(src, dest) {
  for (let i = 0; i < 5; i++) {
    try { fs.renameSync(src, dest); return; }
    catch (e) {
      if (e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
      if (i < 4) { await new Promise(r => setTimeout(r, 300 * (i + 1))); continue; }
      try { fs.copyFileSync(src, dest); fs.rmSync(src, { force: true }); return; }
      catch {
        throw new Error(`Could not update ${path.relative(EXT, dest)} - it's likely open in a `
          + `media player or the Explorer preview pane. Close it and re-run.`);
      }
    }
  }
}

// Media duration in seconds via ffprobe (0 if it can't be read).
function probeDur(file) {
  const r = spawnSync(FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'),
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  return Number.isFinite(d) ? d : 0;
}

// Value of a --flag (supports "--flag val" and "--flag=val"); null if absent.
function argVal(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith(name + '='));
  return eq ? eq.slice(name.length + 1) : null;
}

async function main() {
  if (!KEY) { console.error('Set ELEVENLABS_API_KEY (get one at elevenlabs.io → Profile → API key).'); process.exit(1); }
  // Reject unknown flags so a typo (e.g. --ony) fails loudly instead of silently
  // regenerating every line (and burning credits).
  const KNOWN_FLAGS = new Set(['--only', '--voices']);
  const unknown = process.argv.slice(2).filter(a => a.startsWith('--') && !KNOWN_FLAGS.has(a.split('=')[0]));
  if (unknown.length) {
    console.error(`Unknown option(s): ${unknown.join(', ')}. Valid: --only <ids|last>, --voices.`);
    process.exit(1);
  }
  if (process.argv.includes('--voices')) { await listVoices(); return; }
  if (!fs.existsSync(NARR)) { console.error(`Missing ${path.relative(EXT, NARR)} - run gen-video.js first.`); process.exit(1); }
  const { lines } = JSON.parse(fs.readFileSync(NARR, 'utf8'));

  // --only <ids>: regenerate just these lines (e.g. "06", "5,6", "last"); the
  // rest are reused from their existing mp3s and the video is re-mixed as usual.
  const onlyArg = argVal('--only');
  let only = null;
  if (onlyArg) {
    const resolve = id => id.toLowerCase() === 'last' ? lines[lines.length - 1].id
      : (/^\d+$/.test(id) ? id.padStart(2, '0') : id);
    only = new Set(onlyArg.split(',').map(s => resolve(s.trim())));
  }

  const speedInfo = EXTRA_TEMPO > 1.01 ? `${TARGET_SPEED} (model ${API_SPEED} × ffmpeg ${EXTRA_TEMPO.toFixed(2)})` : `${TARGET_SPEED}`;
  console.log(only ? `regenerating lines ${[...only].join(', ')} (voice ${VOICE}, model ${MODEL})`
                   : `synthesizing ${lines.length} lines (voice ${VOICE}, model ${MODEL})`);
  console.log(`  delivery: stability ${STABILITY}, style ${STYLE}, similarity ${SIMILARITY}, speed ${speedInfo}, cinematic ${CINEMATIC ? 'on' : 'off'}`);
  const clips = [];
  for (const l of lines) {
    const out = path.join(VO_DIR, `${l.id}.mp3`);
    const regen = !only || only.has(l.id);
    if (regen) {
      await tts(l.text, out);
      if (EXTRA_TEMPO > 1.01) {                          // extra speed-up beyond the model's 1.2 cap
        const tmp = out + '.tmp.mp3';
        const s = spawnSync(FFMPEG, ['-y', '-i', out, '-filter:a', atempoChain(EXTRA_TEMPO), tmp], { stdio: 'ignore' });
        if (s.status !== 0) throw new Error('ffmpeg atempo failed');
        fs.renameSync(tmp, out);
      }
    } else if (!fs.existsSync(out)) {
      throw new Error(`--only skips line ${l.id}, but ${path.relative(EXT, out)} doesn't exist yet - run once without --only first.`);
    }
    const dur = probeDur(out);
    console.log(`  ${regen ? '✓ new   ' : '· reused'} ${l.id} (${dur.toFixed(1)}s)`);
    clips.push({ file: out, t0: l.t0, dur });
  }

  // Place each clip at its beat time, but never before the previous clip has
  // finished (+ a small gap) - so lines that run longer than their on-screen
  // window push the next line later instead of talking over it.
  const GAP = 0.15;
  let prevEnd = 0;
  for (const c of clips) {
    c.start = Math.max(c.t0, prevEnd ? prevEnd + GAP : 0);
    prevEnd = c.start + c.dur;
  }
  const audioEnd = prevEnd;

  // Delay each clip to its start, then mix into one track.
  const args = ['-y'];
  clips.forEach(c => args.push('-i', c.file));
  const filters = clips.map((c, i) => { const ms = Math.round(c.start * 1000); return `[${i}]adelay=${ms}|${ms}[a${i}]`; });
  const mix = clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${clips.length}:normalize=0[mix]`;
  // Cinematic voice: gentle low-shelf boost + high-shelf cut for depth, a light
  // room reverb for space, then compress + limit so the level stays trailer-solid.
  const post = CINEMATIC
    ? '[mix]bass=g=3:f=120,treble=g=-2:f=7000,aecho=0.85:0.9:55|75:0.2|0.13,'
      + 'acompressor=threshold=-18dB:ratio=3:attack=8:release=250,alimiter=limit=0.95[out]'
    : '[mix]anull[out]';
  args.push('-filter_complex', filters.join(';') + ';' + mix + ';' + post, '-map', '[out]');
  const track = path.join(VO_DIR, 'vo-track.mp3');
  args.push(track);
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg mix failed');
  console.log('  ✓', path.relative(EXT, track), `(narration ends at ${audioEnd.toFixed(1)}s)`);

  // Mux the narration straight into the existing promo video (no re-record, so
  // timings stay aligned). -map 0:v:0 takes only the video, so this is safe to
  // re-run - it replaces any previously-added audio instead of stacking it.
  const video = path.join(EXT, 'docs', 'store', 'promo-video.mp4');
  if (!fs.existsSync(video)) {
    console.log(`\nvo-track.mp3 ready, but ${path.relative(EXT, video)} not found.`);
    console.log('Run `npm run gen:video` first, then `npm run gen:vo` again.');
    return;
  }
  const videoDur = probeDur(video);
  if (audioEnd > videoDur + 0.05) {
    console.log(`\n  ⚠ narration (${audioEnd.toFixed(1)}s) runs past the video (${videoDur.toFixed(1)}s).`);
    console.log('    Shorten the vo lines in gen-video.js, re-run gen:video, then gen:vo.');
  }
  // No -shortest: output length is the longer of the two streams, so a video
  // slightly longer than the narration keeps its full tail (with trailing
  // silence) instead of being cut off.
  const tmp = path.join(VO_DIR, '.voiced.mp4');
  const m = spawnSync(FFMPEG, ['-y', '-i', video, '-i', track, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', tmp], { stdio: 'inherit' });
  if (m.status !== 0) throw new Error('ffmpeg mux failed');
  await replaceFile(tmp, video);
  console.log(`\nDone → narration muxed into ${path.relative(EXT, video)}. Upload to YouTube and paste the link in the listing.`);
}

main().catch(err => { console.error(err); process.exit(1); });
