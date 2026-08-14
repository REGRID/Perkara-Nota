const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres.pvdumvhgnnfdxsijslmz:Xinora088258@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

async function searchSpecific() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Search in receipts for TOFICO or 935000
    const res1 = await client.query(`
      SELECT id, "merchantName", date, "totalAmount", "imageUrl" IS NOT NULL as has_image, "createdAt"
      FROM receipts
      WHERE "merchantName" ILIKE '%TOFICO%' OR "totalAmount" = 935000 OR date = '2026-08-13';
    `);
    console.log("=== NOTA TOFICO / 935.000 DI RECEIPTS ===");
    console.log(res1.rows);

    // Search in pending_approvals
    const res2 = await client.query(`
      SELECT id, "receiptId", "actionType", "requestedBy", status, payload, "createdAt"
      FROM pending_approvals;
    `);
    console.log("\n=== SEMUA PENDING APPROVALS ===");
    console.log(res2.rows);

    // Search in notifications
    const res3 = await client.query(`
      SELECT id, title, message, "receiptId", "createdAt"
      FROM notifications
      ORDER BY "createdAt" DESC
      LIMIT 10;
    `);
    console.log("\n=== NOTIFIKASI TERAKHIR ===");
    console.log(res3.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

searchSpecific();
