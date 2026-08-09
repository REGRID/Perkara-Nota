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

async function verify() {
  console.time('apiQuery');
  const RECEIPT_LIST_SELECT =
    "id, merchantName, date, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, createdAt, updatedAt, items:receipt_items(*)";

  const { data, error } = await supabase
    .from("receipts")
    .select(RECEIPT_LIST_SELECT)
    .order("createdAt", { ascending: false });

  console.timeEnd('apiQuery');

  if (error) {
    console.error('API Verification Error:', error);
  } else {
    console.log(`✓ Verification Successful! Fetched ${data.length} receipts instantly without timeout.`);
    console.log('Sample receipt:', {
      merchant: data[0].merchantName,
      total: data[0].totalAmount,
      items: data[0].items?.length,
    });
  }
}

verify();
