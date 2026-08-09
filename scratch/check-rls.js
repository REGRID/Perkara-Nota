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

async function checkRlsAndPermissions() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected via PG Direct client!');

    console.log('\n--- 1. Checking RLS status on tables ---');
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);
    console.dir(rlsRes.rows);

    console.log('\n--- 2. Checking Grants on public schema tables for anon & authenticated ---');
    const grantRes = await client.query(`
      SELECT table_name, grantee, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role');
    `);
    console.dir(grantRes.rows);

    console.log('\n--- 3. Granting ALL privileges to anon, authenticated, service_role on public schema ---');
    await client.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    `);
    console.log('✓ Granted schema privileges successfully!');

    console.log('\n--- 4. Disabling RLS or adding permissive policies ---');
    const tables = ['receipts', 'receipt_items', 'scan_limits', 'merchant_dictionaries', 'product_dictionaries', 'custom_categories', 'pending_approvals', 'admin_accounts'];
    for (const t of tables) {
      await client.query(`ALTER TABLE public.${t} DISABLE ROW LEVEL SECURITY;`);
    }
    console.log('✓ Disabled RLS on all tables successfully!');

    console.log('\n--- 5. Reloading PostgREST Schema Cache ---');
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✓ PostgREST schema cache reloaded!');

  } catch (err) {
    console.error('PG Direct error:', err);
  } finally {
    await client.end();
  }
}

checkRlsAndPermissions();
