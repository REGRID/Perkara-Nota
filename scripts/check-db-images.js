const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

async function checkImages() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.\n");

    // 1. Total receipts and breakdown of imageUrl
    const resCount = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN "imageUrl" IS NOT NULL AND length("imageUrl") > 10 THEN 1 END) as with_image,
        COUNT(CASE WHEN "imageUrl" IS NULL OR length("imageUrl") <= 10 THEN 1 END) as without_image
      FROM receipts;
    `);

    console.log("=== RINGKASAN DATABASE NOTA (RECEIPTS) ===");
    console.log(`Total Semua Nota: ${resCount.rows[0].total}`);
    console.log(`Nota yang Memiliki Foto: ${resCount.rows[0].with_image}`);
    console.log(`Nota Tanpa Foto / Kosong: ${resCount.rows[0].without_image}`);
    console.log("------------------------------------------\n");

    // 2. List all receipts with image status
    const resList = await client.query(`
      SELECT 
        id, 
        "merchantName", 
        date, 
        "totalAmount", 
        "paymentMethod", 
        "paymentStatus", 
        CASE 
          WHEN "imageUrl" IS NOT NULL AND length("imageUrl") > 10 THEN true 
          ELSE false 
        END as has_image,
        length("imageUrl") as image_len,
        substring("imageUrl" from 1 for 40) as image_prefix,
        "createdAt"
      FROM receipts
      ORDER BY date DESC, "createdAt" DESC
      LIMIT 100;
    `);

    console.log("=== DAFTAR NOTA DI DATABASE ===");
    resList.rows.forEach((r, idx) => {
      const statusIcon = r.has_image ? "✅ ADA FOTO" : "❌ TIDAK ADA FOTO";
      console.log(
        `${idx + 1}. [${r.date}] ${r.merchantName} - Rp ${Number(r.totalAmount).toLocaleString('id-ID')} | Status: ${r.paymentStatus} | Foto: ${statusIcon} (Panjang: ${r.image_len || 0} char)`
      );
    });

    // 3. Check pending_approvals payload for images
    console.log("\n=== CEK PENDING APPROVALS / SETTLEMENTS ===");
    const resApprovals = await client.query(`
      SELECT id, "actionType", status, "requestedBy", "createdAt", length(payload) as payload_len
      FROM pending_approvals
      ORDER BY "createdAt" DESC
      LIMIT 10;
    `);
    console.log(`Total Pending Approvals Tercatat: ${resApprovals.rows.length}`);
    resApprovals.rows.forEach((a, idx) => {
      console.log(`${idx + 1}. [${a.actionType}] Status: ${a.status} by ${a.requestedBy} (${a.createdAt})`);
    });

  } catch (err) {
    console.error("Query Error:", err);
  } finally {
    await client.end();
  }
}

checkImages();
