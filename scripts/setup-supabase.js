const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Read .env.local or .env
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

// Standardize SSL connection for Supabase Cloud
const cleanUrl = connectionString.replace(/\?.*$/, "");

async function main() {
  console.log('[Supabase Setup] Connecting to Supabase PostgreSQL...');
  console.log(`[Supabase Setup] Target: ${cleanUrl.replace(/:[^:@]+@/, ':****@')}`);

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
    console.log('[Supabase Setup] Executing DDL Schema script (Creating tables & indexes)...');

    await client.query(sqlScript);
    console.log('✓ All 8 Supabase Tables & 16 B-Tree Indexes created successfully!');

    // Seed default categories if custom_categories is empty
    const checkCatRes = await client.query('SELECT COUNT(*) FROM public.custom_categories;');
    const catCount = parseInt(checkCatRes.rows[0].count, 10);

    if (catCount === 0) {
      console.log('[Supabase Setup] Seeding default categories into custom_categories...');
      const seedGroups = [
        {
          name: "Bahan Baku",
          subs: ["Bumbu & Rempah", "Daging & Seafood", "Sayur & Buah", "Susu & Olahan", "Tepung & Minyak", "Minuman & Sirup"],
        },
        {
          name: "Operasional & Perlengkapan",
          subs: ["Kemasan & Plastik", "Alat Tulis & Kasir", "Kebersihan & Sanitasi", "Gas & Listrik", "Perlengkapan Toko"],
        },
        {
          name: "Peralatan & Aset",
          subs: ["Alat Dapur", "Mesin & Elektronik", "Furniture & Interior"],
        },
        {
          name: "Lain-lain",
          subs: ["Umum", "Jasa & Ongkir"],
        },
      ];

      for (const group of seedGroups) {
        const pRes = await client.query(
          'INSERT INTO public.custom_categories (name, "parentId") VALUES ($1, NULL) RETURNING id;',
          [group.name]
        );
        const parentId = pRes.rows[0].id;
        for (const subName of group.subs) {
          await client.query(
            'INSERT INTO public.custom_categories (name, "parentId") VALUES ($1, $2);',
            [subName, parentId]
          );
        }
      }
      console.log('✓ Default categories seeded successfully!');
    }

    console.log('\n======================================================');
    console.log('🎉 SUPABASE DATABASE SETUP COMPLETE! ALL TABLES ARE READY.');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Supabase Setup Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
