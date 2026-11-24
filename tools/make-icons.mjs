// Renders the app icon (same design as icons/icon.svg) to PNGs with no dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Shapes in a 64x64 design space, painted in order.
const shapes = [
  ['#1b1d21', 0, 0, 64, 64],
  ['#7fae4c', 8, 8, 16, 16], ['#2e6a33', 24, 8, 16, 16], ['#2e7ec0', 40, 8, 16, 16],
  ['#7fae4c', 8, 24, 16, 16], ['#d74a4a', 24, 24, 16, 16], ['#2e7ec0', 40, 24, 16, 16],
  ['#e8b923', 8, 40, 16, 16], ['#7fae4c', 24, 40, 16, 16], ['#a68d5b', 40, 40, 16, 16],
  ['#000000', 10.5, 42.5, 11, 11], ['#f2c230', 11, 43, 10, 10],
  ['#000000', 42.5, 42.5, 11, 11], ['#9aa4ad', 43, 43, 10, 10],
  ['#000000', 10.5, 26.5, 11, 11], ['#9ccf5a', 11, 27, 10, 10],
];
const frame = '#f0a630';

function render(size, pad = 0) {
  const px = new Uint8Array(size * size * 4);
  const scale = (size - pad * 2) / 64;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5 - pad) / scale, v = (y + 0.5 - pad) / scale;
    let col = hex('#1b1d21');
    for (const [c, sx, sy, w, h] of shapes) if (u >= sx && u < sx + w && v >= sy && v < sy + h) col = hex(c);
    const onFrame = u >= 7 && u <= 57 && v >= 7 && v <= 57 && !(u > 9 && u < 55 && v > 9 && v < 55);
    if (onFrame) col = hex(frame);
    const o = (y * size + x) * 4; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
  }
  return png(size, size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192));
writeFileSync(new URL('icon-512.png', out), render(512, 40)); // padded so it survives maskable cropping
console.log('icons written');
