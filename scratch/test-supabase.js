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

console.log('Testing Supabase JS Client query without giant imageUrl payload...');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testOptimizedQuery() {
  const selectCols = "id, merchantName, date, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, createdAt, updatedAt, items:receipt_items(*)";

  console.time('fetchReceipts');
  const { data, error } = await supabase
    .from("receipts")
    .select(selectCols)
    .order("createdAt", { ascending: false });
  console.timeEnd('fetchReceipts');

  console.log('Receipts error:', error);
  console.log('Receipts count:', data?.length);
  if (data && data[0]) {
    console.log('First receipt merchant:', data[0].merchantName, 'totalAmount:', data[0].totalAmount);
    console.log('First receipt items count:', data[0].items?.length);
  }
}

testOptimizedQuery();
