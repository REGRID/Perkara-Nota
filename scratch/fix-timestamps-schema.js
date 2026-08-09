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

async function fixTimestamps() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('[Fix Timestamps] Connecting to PostgreSQL...');

    const tables = [
      'receipts',
      'receipt_items',
      'scan_limits',
      'merchant_dictionaries',
      'product_dictionaries',
      'custom_categories',
      'pending_approvals',
      'admin_accounts'
    ];

    for (const t of tables) {
      await client.query(`
        ALTER TABLE public.${t} ALTER COLUMN id SET DEFAULT gen_random_uuid();
      `);

      // Check if createdAt column exists
      try {
        await client.query(`ALTER TABLE public.${t} ALTER COLUMN "createdAt" SET DEFAULT now();`);
      } catch (e) {}

      // Check if updatedAt column exists
      try {
        await client.query(`ALTER TABLE public.${t} ALTER COLUMN "updatedAt" SET DEFAULT now();`);
      } catch (e) {}

      console.log(`✓ Set DEFAULT now() for timestamps on public.${t}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL TABLES UPDATED WITH DEFAULT TIMESTAMPS & UUIDs!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ Fix Timestamps Error:', err);
  } finally {
    await client.end();
  }
}

fixTimestamps();
