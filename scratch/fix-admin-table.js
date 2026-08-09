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

async function fixAdminTable() {
  const client = new Client({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected via PG Direct client!');

    console.log('[Fix Admin Table] Setting default gen_random_uuid() on id column of admin_accounts...');
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      ALTER TABLE public.admin_accounts ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE public.admin_accounts ALTER COLUMN "createdAt" SET DEFAULT now();
      ALTER TABLE public.admin_accounts ALTER COLUMN "updatedAt" SET DEFAULT now();
    `);

    // Insert default accounts if not exists
    await client.query(`
      INSERT INTO public.admin_accounts (username, password)
      VALUES 
        ('rama', 'adminnota123'),
        ('refo', 'adminnota456')
      ON CONFLICT (username) DO NOTHING;
    `);

    console.log('✓ Successfully set default id generator and seeded admin accounts!');

    const res = await client.query('SELECT * FROM public.admin_accounts;');
    console.log('Current admin_accounts in Supabase:');
    console.dir(res.rows);

  } catch (err) {
    console.error('Fix Admin Table Error:', err);
  } finally {
    await client.end();
  }
}

fixAdminTable();
