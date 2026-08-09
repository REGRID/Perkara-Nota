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

async function diagnoseReceipts() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected via PG Direct client!');

    console.log('\n--- 1. Inspecting receipts table columns & data types ---');
    const colRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'receipts' AND table_schema = 'public';
    `);
    console.dir(colRes.rows);

    console.log('\n--- 2. Inspecting receipts table triggers ---');
    const trigRes = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement 
      FROM information_schema.triggers 
      WHERE event_object_table = 'receipts';
    `);
    console.dir(trigRes.rows);

    console.log('\n--- 3. Testing SELECT id FROM receipts LIMIT 1 via PG ---');
    const test1 = await client.query('SELECT id FROM public.receipts LIMIT 1;');
    console.log('SELECT id result:', test1.rows);

    console.log('\n--- 4. Checking if any row in receipts has huge TOAST data (e.g. giant base64 image in imageUrl) ---');
    const toastRes = await client.query(`
      SELECT id, pg_column_size("imageUrl") as image_bytes, pg_column_size(note) as note_bytes 
      FROM public.receipts 
      ORDER BY pg_column_size("imageUrl") DESC NULLS LAST 
      LIMIT 10;
    `);
    console.dir(toastRes.rows);

  } catch (err) {
    console.error('PG Direct error:', err);
  } finally {
    await client.end();
  }
}

diagnoseReceipts();
