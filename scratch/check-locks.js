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

async function checkLocks() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected via PG Direct client!');

    console.log('\n--- Testing SELECT count(*) FROM receipts ---');
    const countRes = await client.query('SELECT COUNT(*) FROM public.receipts;');
    console.log('Receipts row count:', countRes.rows[0].count);

    console.log('\n--- Testing sample receipts row ---');
    const sampleRes = await client.query('SELECT * FROM public.receipts LIMIT 5;');
    console.log('Sample receipts rows:', sampleRes.rows.length);
    if (sampleRes.rows[0]) {
      console.log('Sample receipt row:', sampleRes.rows[0]);
    }

  } catch (err) {
    console.error('PG Direct error:', err);
  } finally {
    await client.end();
  }
}

checkLocks();
