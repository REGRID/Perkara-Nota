const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      content.split('\n').forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?(.*?)["']?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2];
        }
      });
    }
  }
}

loadEnv();

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres.pvdumvhgnnfdxsijslmz:Xinora088258@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

const cleanUrl = connectionString.replace(/\?.*$/, "");

async function compressImageBuffer(base64Str) {
  if (!base64Str || !base64Str.includes('base64,')) return base64Str;
  const parts = base64Str.split('base64,');
  const buffer = Buffer.from(parts[1], 'base64');

  if (buffer.length <= 60 * 1024) return base64Str;

  const compressedBuffer = await sharp(buffer)
    .resize({
      width: 800,
      height: 1200,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 60 })
    .toBuffer();

  return `data:image/webp;base64,${compressedBuffer.toString('base64')}`;
}

async function main() {
  console.log('[Image Compression] Connecting to Supabase PostgreSQL...');
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✓ Connected to Supabase PostgreSQL!');

    console.log('[Image Compression] Fetching receipt IDs with images...');
    const res = await client.query('SELECT id FROM public.receipts WHERE "imageUrl" IS NOT NULL AND "imageUrl" != \'\';');
    const rows = res.rows;
    console.log(`Found ${rows.length} receipt IDs to inspect/compress.`);

    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;
    let compressedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].id;
      const recRes = await client.query('SELECT "imageUrl" FROM public.receipts WHERE id = $1;', [id]);
      const imageUrl = recRes.rows[0]?.imageUrl;

      const origSize = imageUrl ? Buffer.byteLength(imageUrl, 'utf-8') : 0;
      totalOriginalBytes += origSize;

      if (origSize > 80 * 1024) {
        const compressedBase64 = await compressImageBuffer(imageUrl);
        const newSize = Buffer.byteLength(compressedBase64, 'utf-8');
        totalCompressedBytes += newSize;

        await client.query('UPDATE public.receipts SET "imageUrl" = $1 WHERE id = $2;', [compressedBase64, id]);
        compressedCount++;
        console.log(`[${i + 1}/${rows.length}] Compressed ${id}: ${(origSize / 1024 / 1024).toFixed(2)} MB -> ${(newSize / 1024).toFixed(1)} KB`);
      } else {
        totalCompressedBytes += origSize;
        console.log(`[${i + 1}/${rows.length}] Skipped ${id}: Already compressed (${(origSize / 1024).toFixed(1)} KB)`);
      }
    }

    const origMB = (totalOriginalBytes / 1024 / 1024).toFixed(2);
    const newMB = (totalCompressedBytes / 1024 / 1024).toFixed(2);
    const reductionPercent = totalOriginalBytes > 0 ? (((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) * 100).toFixed(1) : 0;

    console.log('\n======================================================');
    console.log(`🎉 MAXIMUM IMAGE COMPRESSION COMPLETE!`);
    console.log(`- Receipts Processed: ${compressedCount} of ${rows.length}`);
    console.log(`- Total Image Data Before: ${origMB} MB`);
    console.log(`- Total Image Data After:  ${newMB} MB`);
    console.log(`- Database Size Reduction: ${reductionPercent}% SAVED!`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ Compression Error:', err);
  } finally {
    await client.end();
  }
}

main();
