const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Read .env.local manually
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  envText.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkImageSizes() {
  console.log("Checking receipt image sizes in Supabase Cloud...\n");
  const { data: receipts, error } = await supabase
    .from("receipts")
    .select("id, merchantName, date, imageUrl");

  if (error) {
    console.error("Error querying receipts:", error);
    return;
  }

  if (!receipts || receipts.length === 0) {
    console.log("No receipts found in database.");
    return;
  }

  let totalImages = 0;
  let totalSizeBytes = 0;
  const sizeList = [];

  for (const r of receipts) {
    if (r.imageUrl && r.imageUrl.length > 50) {
      totalImages++;
      // Base64 size estimation in bytes: (length * 3 / 4)
      const base64Str = r.imageUrl.replace(/^data:image\/\w+;base64,/, "");
      const sizeBytes = Math.round((base64Str.length * 3) / 4);
      totalSizeBytes += sizeBytes;
      sizeList.push({
        id: r.id,
        merchantName: r.merchantName,
        date: r.date,
        sizeBytes,
        sizeKB: (sizeBytes / 1024).toFixed(2),
        sizeMB: (sizeBytes / (1024 * 1024)).toFixed(3),
      });
    }
  }

  sizeList.sort((a, b) => b.sizeBytes - a.sizeBytes);

  const avgSizeBytes = totalImages > 0 ? totalSizeBytes / totalImages : 0;
  const avgSizeKB = (avgSizeBytes / 1024).toFixed(2);
  const avgSizeMB = (avgSizeBytes / (1024 * 1024)).toFixed(3);
  const minSizeKB = sizeList.length > 0 ? (sizeList[sizeList.length - 1].sizeBytes / 1024).toFixed(2) : 0;
  const maxSizeKB = sizeList.length > 0 ? (sizeList[0].sizeBytes / 1024).toFixed(2) : 0;
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

  console.log("==================================================");
  console.log("       ANALISIS UKURAN FOTO NOTA DI SUPABASE      ");
  console.log("==================================================");
  console.log(`Jumlah Total Nota di Database : ${receipts.length} Nota`);
  console.log(`Jumlah Nota Memiliki Foto     : ${totalImages} Foto`);
  console.log(`Total Ukuran Seluruh Foto     : ${totalSizeMB} MB (${totalSizeBytes.toLocaleString("id-ID")} Bytes)`);
  console.log(`RATA-RATA UKURAN FOTO / NOTA  : ${avgSizeKB} KB (${avgSizeMB} MB)`);
  console.log(`Ukuran Foto TerKecil          : ${minSizeKB} KB`);
  console.log(`Ukuran Foto TerBesar          : ${maxSizeKB} KB`);
  console.log("==================================================\n");

  console.log("Top 10 Foto Terbesar:");
  sizeList.slice(0, 10).forEach((item, idx) => {
    console.log(`${idx + 1}. [${item.date}] ${item.merchantName}: ${item.sizeKB} KB (${item.sizeMB} MB)`);
  });
}

checkImageSizes();
