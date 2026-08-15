const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

async function main() {
  console.log('[Supabase Setup] Connecting to Supabase PostgreSQL...');
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✓ Successfully connected to Supabase PostgreSQL!');

    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema SQL file not found at ${schemaPath}`);
    }

    const sqlScript = fs.readFileSync(schemaPath, 'utf-8');
    console.log('[Supabase Setup] Executing DDL Schema script...');

    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      ${sqlScript}
      ALTER TABLE public.admin_accounts ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.custom_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.merchant_dictionaries ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.product_dictionaries ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.pending_approvals ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.receipts ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.receipt_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.scan_limits ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.push_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    `);
    console.log('✓ All 10 Supabase Tables & 22 B-Tree Indexes created/verified with gen_random_uuid()!');

    // Seed default admin accounts if empty
    await client.query(`
      INSERT INTO public.admin_accounts (username, password)
      VALUES 
        ('rama', 'adminnota123'),
        ('refo', 'adminnota456')
      ON CONFLICT (username) DO NOTHING;
    `);

    console.log('\n======================================================');
    console.log('🎉 SUPABASE DATABASE & ADMIN ACCOUNTS READY!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Supabase Setup Error:', err);
  } finally {
    await client.end();
  }
}

main();
