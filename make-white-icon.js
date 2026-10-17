// Rebuild icon-1024.png as a WHITE opaque icon whose logo matches the adaptive
// foreground scale (icon-1024-padded.png, logo at ~72%). This makes the launcher
// icon (adaptive) and the main icon (iOS / legacy / splash) show the logo at the
// SAME size. Output is fully opaque (alpha=255) -> iOS-safe.
const fs = require('fs');
const zlib = require('zlib');

const ROOT = 'D:/personal/ai-agent-client/assets/';
const SRC = ROOT + 'icon-1024-padded.png'; // transparent bg, logo at 72%
const OUT = ROOT + 'icon-1024.png';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return ((c ^ 0xffffffff) >>> 0); }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data]))); return Buffer.concat([len, Buffer.from(type), data, crc]); }

function readPNG(path) {
  const b = fs.readFileSync(path);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p); const type = b.slice(p + 4, p + 8).toString('ascii');
    if (type === 'IHDR') { const d = b.slice(p + 8, p + 8 + len); w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    if (type === 'IDAT') idat.push(b.slice(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct] || 4;
  const bppBytes = channels * (bd > 8 ? 2 : 1);
  const stride = w * bppBytes;
  const px = new Uint8ClampedArray(w * h * 4);
  let prev = new Uint8ClampedArray(stride);
  const rowBytes = 1 + stride;
  const toRGBA = (i, r) => {
    if (ct === 6 && bd === 8) { px[i * 4] = r[0]; px[i * 4 + 1] = r[1]; px[i * 4 + 2] = r[2]; px[i * 4 + 3] = r[3]; }
    else if (ct === 2 && bd === 8) { px[i * 4] = r[0]; px[i * 4 + 1] = r[1]; px[i * 4 + 2] = r[2]; px[i * 4 + 3] = 255; }
    else { const v = r[0]; px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = ct === 4 ? r[1] : 255; }
  };
  const paeth = (a, b, c) => { const pr = a + b - c; const pa = Math.abs(pr - a); const pb = Math.abs(pr - b); const pc = Math.abs(pr - c); if (pa <= pb && pa <= pc) return a; if (pb <= pc) return b; return c; };
  for (let r = 0; r < h; r++) {
    const fo = r * rowBytes; const filt = raw[fo]; const recon = new Uint8ClampedArray(stride);
    for (let i = 0; i < stride; i++) {
      const o = raw[fo + 1 + i] & 255; let v;
      if (filt === 0) v = o;
      else if (filt === 1) { const left = i >= bppBytes ? recon[i - bppBytes] : 0; v = (o + left) & 255; }
      else if (filt === 2) v = (o + prev[i]) & 255;
      else if (filt === 3) { const left = i >= bppBytes ? recon[i - bppBytes] : 0; v = (o + ((left + prev[i]) >> 1)) & 255; }
      else { const left = i >= bppBytes ? recon[i - bppBytes] : 0; const up = prev[i]; const ul = i >= bppBytes ? prev[i - bppBytes] : 0; v = (o + paeth(left, up, ul)) & 255; }
      recon[i] = v;
    }
    for (let x = 0; x < w; x++) toRGBA(r * w + x, recon.subarray(x * bppBytes, x * bppBytes + bppBytes));
    prev = recon;
  }
  return { w, h, px };
}
function writePNG(path, w, h, px) {
  const stride = w * 4;
  const raw = Buffer.alloc((1 + stride) * h);
  for (let y = 0; y < h; y++) { raw[y * (1 + stride)] = 0; for (let x = 0; x < stride; x++) raw[y * (1 + stride) + 1 + x] = px[y * stride + x]; }
  const deflated = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(path, png);
  return png.length;
}

const img = readPNG(SRC);
const { w, h, px } = img;
let opaquePx = 0;
for (let i = 0; i < px.length; i += 4) {
  const a = px[i + 3] / 255;
  // composite over white
  px[i] = Math.round(px[i] * a + 255 * (1 - a));
  px[i + 1] = Math.round(px[i + 1] * a + 255 * (1 - a));
  px[i + 2] = Math.round(px[i + 2] * a + 255 * (1 - a));
  px[i + 3] = 255;
  if (a > 0.5) opaquePx++;
}
const bytes = writePNG(OUT, w, h, px);
console.log('wrote', OUT, w + 'x' + h, bytes, 'bytes | logo px:', opaquePx, '| fully opaque, logo at 72% (matches adaptive foreground)');
