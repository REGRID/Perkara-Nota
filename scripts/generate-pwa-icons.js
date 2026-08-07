const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Utility to create a valid PNG file buffer with solid color and simple icon mark
function createPngBuffer(width, height, r, g, b) {
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 2; // Color type: 2 (Truecolor RGB)
  ihdr[10] = 0; // Compression method
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // Interlace method

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT Chunk (Image Data)
  const rowSize = width * 3 + 1;
  const rawData = Buffer.alloc(height * rowSize);

  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = width * 0.42;
  const innerRadius = width * 0.22;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // No filter for row

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded rectangle / icon styling
      let pr = r;
      let pg = g;
      let pb = b;

      // Draw camera lens circle mark in center
      if (dist < innerRadius) {
        pr = 255;
        pg = 255;
        pb = 255;
      } else if (dist < innerRadius + width * 0.04) {
        pr = Math.round(r * 0.7);
        pg = Math.round(g * 0.7);
        pb = Math.round(b * 0.7);
      } else if (dist > outerRadius) {
        // Dark background corner padding for rounded icon look
        const cornerDist = Math.max(Math.abs(dx), Math.abs(dy));
        if (cornerDist > width * 0.46) {
          pr = 15;
          pg = 23;
          pb = 42;
        }
      }

      rawData[pxOffset] = pr;
      rawData[pxOffset + 1] = pg;
      rawData[pxOffset + 2] = pb;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);

  const crcVal = crc32(buf.slice(4, 8 + len));
  buf.writeUInt32BE(crcVal, 8 + len);
  return buf;
}

// CRC32 implementation for PNG chunks
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ -1) >>> 0;
}

// Generate PWA Icon files
const publicDir = path.join(__dirname, '..', 'public');

const icon192 = createPngBuffer(192, 192, 16, 185, 129); // Emerald Green
const icon512 = createPngBuffer(512, 512, 16, 185, 129);
const maskable = createPngBuffer(512, 512, 16, 185, 129);
const appleTouch = createPngBuffer(180, 180, 16, 185, 129);

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);
fs.writeFileSync(path.join(publicDir, 'maskable-icon.png'), maskable);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouch);

console.log('✓ Icon PWA 192x192, 512x512, maskable, & apple-touch-icon berhasil dibuat di folder public/');
