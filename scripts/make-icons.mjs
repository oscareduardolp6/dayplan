// Generates simple PNG icons (rounded square + clock-like block marks) without external deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

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
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function make(size) {
  const bg = [17, 17, 17], fg = [255, 255, 255];
  const accents = [[96, 165, 250], [52, 211, 153], [251, 191, 36], [248, 113, 113]];
  const r = size * 0.22;
  const inRound = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // Vertical timeline: a thin line at 30% and four colored blocks to its right.
  const lineX = size * 0.3, lineW = size * 0.04;
  const blocks = accents.map((c, i) => ({
    x0: size * 0.38, x1: size * 0.78,
    y0: size * (0.2 + i * 0.16), y1: size * (0.2 + i * 0.16 + 0.11), c,
  }));
  return png(size, (x, y) => {
    if (!inRound(x + 0.5, y + 0.5)) return [0, 0, 0, 0];
    for (const b of blocks) if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) return [...b.c, 255];
    if (x >= lineX && x < lineX + lineW && y >= size * 0.18 && y < size * 0.82) return [...fg, 255];
    return [...bg, 255];
  });
}
mkdirSync('public/icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, make(s));
console.log('icons written');
