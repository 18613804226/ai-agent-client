// Pure-Node (built-in zlib) PNG: downscale icon-1024 to ~72% centered on transparent 1024 canvas.
// No deps. Output: assets/icon-1024-padded.png (RGBA 8-bit).
const fs = require('fs');
const zlib = require('zlib');

const SRC = 'D:/personal/ai-agent-client/assets/icon-1024.png';
const OUT = 'D:/personal/ai-agent-client/assets/icon-1024-padded.png';

// CRC32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([len, Buffer.from(type), data, crc]);
}

function readPNG(path) {
  const b = fs.readFileSync(path);
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not png');
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
  const bppBytes = channels * (bd > 8 ? 2 : 1); // 8-bit only supported here
  const stride = w * bppBytes;
  const px = new Uint8ClampedArray(w * h * 4); // normalize to RGBA
  let prev = new Uint8ClampedArray(stride);
  const rowBytes = 1 + stride;
  const toRGBA = (i, r) => { // r = reconstructed pixel bytes (bppBytes) -> RGBA
    if (ct === 6 && bd === 8) { // RGBA
      px[i * 4 + 0] = r[0]; px[i * 4 + 1] = r[1]; px[i * 4 + 2] = r[2]; px[i * 4 + 3] = r[3];
    } else if (ct === 2 && bd === 8) { // RGB
      px[i * 4 + 0] = r[0]; px[i * 4 + 1] = r[1]; px[i * 4 + 2] = r[2]; px[i * 4 + 3] = 255;
    } else { // gray / grayscale+alpha fallback
      const v = r[0]; px[i * 4 + 0] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = ct === 4 ? r[1] : 255;
    }
  };
  const paeth = (a, b, c) => { const pr = a + b - c; const pa = Math.abs(pr - a); const pb = Math.abs(pr - b); const pc = Math.abs(pr - c); if (pa <= pb && pa <= pc) return a; if (pb <= pc) return b; return c; };
  for (let r = 0; r < h; r++) {
    const fo = r * rowBytes;
    const filt = raw[fo];
    const recon = new Uint8ClampedArray(stride);
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

const src = readPNG(SRC);
const T = 1024, inner = Math.round(T * 0.72), pad = Math.round((T - inner) / 2);
const sx = (src.w - 1) / (inner - 1);
const small = new Uint8ClampedArray(inner * inner * 4);
for (let oy = 0; oy < inner; oy++) {
  const fy = oy * sx; const iy = Math.min(Math.floor(fy), src.w - 1); const ty = fy - iy; const iy1 = Math.min(iy + 1, src.w - 1);
  for (let ox = 0; ox < inner; ox++) {
    const fx = ox * sx; const ix = Math.min(Math.floor(fx), src.w - 1); const tx = fx - ix; const ix1 = Math.min(ix + 1, src.w - 1);
    const a = (oy * inner + ox) * 4;
    for (let c = 0; c < 4; c++) {
      const p00 = src.px[(iy * src.w + ix) * 4 + c];
      const p10 = src.px[(iy * src.w + ix1) * 4 + c];
      const p01 = src.px[(iy1 * src.w + ix) * 4 + c];
      const p11 = src.px[(iy1 * src.w + ix1) * 4 + c];
      small[a + c] = Math.round(p00 * (1 - tx) * (1 - ty) + p10 * tx * (1 - ty) + p01 * (1 - tx) * ty + p11 * tx * ty);
    }
  }
}
const out = new Uint8ClampedArray(T * T * 4); // transparent (all 0)
for (let oy = 0; oy < inner; oy++)
  for (let ox = 0; ox < inner; ox++) {
    const srcI = (oy * inner + ox) * 4;
    const dstI = ((pad + oy) * T + (pad + ox)) * 4;
    for (let c = 0; c < 4; c++) out[dstI + c] = small[srcI + c];
  }
// encode
const stride = T * 4;
const raw = Buffer.alloc((1 + stride) * T);
for (let y = 0; y < T; y++) { raw[y * (1 + stride)] = 0; out.subarray(y * stride, (y + 1) * stride).forEach((v, i) => raw[y * (1 + stride) + 1 + i] = v); }
const deflated = zlib.deflateSync(raw);
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(T, 0); ihdr.writeUInt32BE(T, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(OUT, png);
console.log('wrote', OUT, png.length, 'bytes; inner=737 pad=143');
