// Render trailer WAVs via OfflineAudioContext in headless Chrome, then loudness-normalize with ffmpeg.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../../trailer/audio');
const PAGE = path.resolve(__dirname, 'trailer-render.html');
fs.mkdirSync(OUT, { recursive: true });

function writeWav(file, { sr, left, right }) {
  const n = left.length, dataSize = n * 2 * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2 * 2, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const L = Math.max(-1, Math.min(1, left[i]));
    const R = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE((L * 32767) | 0, o); o += 2;
    buf.writeInt16LE((R * 32767) | 0, o); o += 2;
  }
  fs.writeFileSync(file, buf);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr}`);
  return r;
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto('file://' + PAGE, { waitUntil: 'load' });
console.log('rendering Offline...');
const data = await page.evaluate(async () => await renderTrailer());
await browser.close();

const raw = {
  'music_bed_45s.raw.wav': data.bed,
  'sfx_spin.raw.wav': data.spin,
  'sfx_win.raw.wav': data.win,
  'sfx_clash_hit.raw.wav': data.clash,
  'sfx_grand.raw.wav': data.grand,
};
for (const [name, pcm] of Object.entries(raw)) {
  const f = path.join(OUT, name);
  writeWav(f, pcm);
  console.log('wrote', f, 'dur', pcm.duration.toFixed(2) + 's');
}

// Normalize: bed ≈ -14 LUFS; one-shots peak ≈ -1 dBTP
const bedIn = path.join(OUT, 'music_bed_45s.raw.wav');
const bedOut = path.join(OUT, 'music_bed_45s.wav');
run('ffmpeg', ['-y', '-i', bedIn, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '2', bedOut]);
console.log('normalized bed ->', bedOut);

for (const name of ['sfx_spin', 'sfx_win', 'sfx_clash_hit', 'sfx_grand']) {
  const inn = path.join(OUT, name + '.raw.wav');
  const out = path.join(OUT, name + '.wav');
  // peak normalize to -1 dBTP via loudnorm with very short content + limiter fallback
  run('ffmpeg', ['-y', '-i', inn, '-af', 'loudnorm=I=-16:TP=-1.0:LRA=7,alimiter=limit=-1dB:level=disabled', '-ar', '48000', '-ac', '2', out]);
  console.log('normalized', out);
}

// clean raw intermediates
for (const name of Object.keys(raw)) fs.unlinkSync(path.join(OUT, name));

// report sizes / durations
for (const f of ['music_bed_45s.wav', 'sfx_spin.wav', 'sfx_win.wav', 'sfx_clash_hit.wav', 'sfx_grand.wav']) {
  const p = path.join(OUT, f);
  const st = fs.statSync(p);
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p]);
  console.log(f, (st.size / 1024).toFixed(1) + 'KB', probe.stdout.trim() + 's');
}
