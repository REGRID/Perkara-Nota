const { createClient } = require('@supabase/supabase-js');
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEFAULT_ADMINS = [
  { username: "rama", password: process.env.ADMIN_A_PASSWORD || "adminnota123" },
  { username: "refo", password: process.env.ADMIN_B_PASSWORD || "adminnota456" },
];

async function syncAdminAccounts() {
  console.log('[Admin Accounts Sync] Checking admin_accounts in Supabase...');

  const { data: existing, error } = await supabase
    .from('admin_accounts')
    .select('*');

  if (error) {
    console.error('Error fetching admin accounts:', error);
    return;
  }

  console.log('Existing admin accounts in Supabase:', existing);

  for (const admin of DEFAULT_ADMINS) {
    const found = (existing || []).find((a) => a.username.toLowerCase() === admin.username.toLowerCase());
    if (!found) {
      console.log(`Seeding default admin account "${admin.username}" into Supabase...`);
      const { data: inserted, error: insErr } = await supabase
        .from('admin_accounts')
        .insert({
          username: admin.username,
          password: admin.password,
        })
        .select('*');
      console.log('Inserted:', inserted, insErr);
    } else {
      console.log(`Admin account "${admin.username}" already exists in Supabase with ID: ${found.id}`);
    }
  }

  const { data: finalAccounts } = await supabase.from('admin_accounts').select('*');
  console.log('\n✓ Current admin accounts in Supabase:');
  console.dir(finalAccounts);
}

syncAdminAccounts();
