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

async function applyRlsPolicies() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('[Supabase Deployment Setup] Connecting to PostgreSQL...');

    const tables = [
      'receipts',
      'receipt_items',
      'scan_limits',
      'merchant_dictionaries',
      'product_dictionaries',
      'custom_categories',
      'pending_approvals',
      'admin_accounts',
      'notifications',
      'push_subscriptions'
    ];

    console.log('[Supabase Deployment Setup] Enabling Row Level Security (RLS) & Adding Public Policies...');

    for (const t of tables) {
      // 1. Enable RLS
      await client.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);

      // 2. Drop any existing conflicting policies
      await client.query(`
        DROP POLICY IF EXISTS "Allow anon all ${t}" ON public.${t};
        DROP POLICY IF EXISTS "Allow authenticated all ${t}" ON public.${t};
        DROP POLICY IF EXISTS "Allow public all ${t}" ON public.${t};
      `);

      // 3. Create Permissive Policy for ALL operations (SELECT, INSERT, UPDATE, DELETE) for anon & authenticated
      await client.query(`
        CREATE POLICY "Allow public all ${t}" 
        ON public.${t} 
        FOR ALL 
        TO anon, authenticated, service_role 
        USING (true) 
        WITH CHECK (true);
      `);

      console.log(`✓ RLS Policy enabled for table: public.${t}`);
    }

    // 4. Grant explicit table grants
    await client.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    `);

    // 5. Reload PostgREST schema cache
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✓ PostgREST Schema Cache reloaded successfully!');

    console.log('\n======================================================');
    console.log('🎉 ALL SUPABASE TABLES ARE NOW FULLY PUBLICLY ACCESSIBLE FOR VERCEL DEPLOYMENT!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('❌ RLS Setup Error:', err);
  } finally {
    await client.end();
  }
}

applyRlsPolicies();
