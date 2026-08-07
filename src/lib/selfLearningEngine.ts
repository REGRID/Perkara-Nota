import { db } from "@/lib/db"

/**
 * Record verified receipt data to continuously train local merchant & product dictionary memory.
 */
export async function recordVerifiedReceiptLearning(
  merchantName: string,
  items: { name: string; category: string; subCategory?: string; price: number }[]
) {
  try {
    const cleanMerchant = merchantName ? merchantName.trim() : ""
    if (cleanMerchant && cleanMerchant !== "Nota / Toko") {
      const rawKey = cleanMerchant.toLowerCase()
      await db.merchantDictionary.upsert({
        where: { rawPattern: rawKey },
        update: {
          cleanName: cleanMerchant,
          verifiedCount: { increment: 1 },
        },
        create: {
          rawPattern: rawKey,
          cleanName: cleanMerchant,
          verifiedCount: 1,
        },
      })
    }

    // Deduplicate items by rawName (case-insensitive) to prevent duplicate DB locks
    const uniqueItemsMap = new Map<string, { name: string; category: string; subCategory?: string; price: number }>()
    for (const item of items) {
      const cleanItemName = item.name ? item.name.trim() : ""
      if (cleanItemName && cleanItemName.length >= 2) {
        const rawKey = cleanItemName.toLowerCase()
        if (!uniqueItemsMap.has(rawKey)) {
          uniqueItemsMap.set(rawKey, { ...item, name: cleanItemName })
        }
      }
    }

    const itemUpsertPromises = Array.from(uniqueItemsMap.entries()).map(([rawKey, item]) =>
      db.productDictionary.upsert({
        where: { rawName: rawKey },
        update: {
          verifiedName: item.name,
          category: item.category || "Lain-lain",
          subCategory: item.subCategory || "Umum",
          lastKnownPrice: Number(item.price) || 0,
          verifiedCount: { increment: 1 },
        },
        create: {
          rawName: rawKey,
          verifiedName: item.name,
          category: item.category || "Lain-lain",
          subCategory: item.subCategory || "Umum",
          lastKnownPrice: Number(item.price) || 0,
          verifiedCount: 1,
        },
      })
    )

    await Promise.all(itemUpsertPromises)
  } catch (error) {
    console.warn("Self-learning memory recording warning:", error)
  }
}

/**
 * Retrieves learned merchant & product context from local database to inject into Gemini prompt.
 */
export async function getLearnedKnowledgeContext(): Promise<string> {
  try {
    const topMerchants = await db.merchantDictionary.findMany({
      orderBy: { verifiedCount: "desc" },
      take: 10,
    })

    const topProducts = await db.productDictionary.findMany({
      orderBy: { verifiedCount: "desc" },
      take: 15,
    })

    if (topMerchants.length === 0 && topProducts.length === 0) {
      return ""
    }

    let knowledgeText = "\nDATABASE PENGETAHUAN LOKAL TERVERIFIKASI (PEMBELAJARAN NOTA SEBELUMNYA):\n"

    if (topMerchants.length > 0) {
      knowledgeText += "Nama Toko / PT yang Pernah Diverifikasi:\n"
      topMerchants.forEach((m: any) => {
        knowledgeText += `- "${m.cleanName}" (Terverifikasi ${m.verifiedCount}x)\n`
      })
    }

    if (topProducts.length > 0) {
      knowledgeText += "Daftar Barang, Kategori Utama & Sub-Kategori Terverifikasi:\n"
      topProducts.forEach((p: any) => {
        knowledgeText += `- "${p.verifiedName}" -> Kategori Utama: "${p.category}", Sub-Kategori: "${p.subCategory || "Umum"}" (Harga Terakhir: Rp ${p.lastKnownPrice.toLocaleString("id-ID")})\n`
      })
    }

    knowledgeText += "PETUNJUK TAMBAHAN: Gunakan pengetahuan di atas untuk mencocokkan ejaan nama toko, nama barang, Kategori Utama, dan Sub-Kategori jika menemukan barang sejenis pada nota baru.\n"

    return knowledgeText
  } catch (error) {
    console.warn("Error fetching learned knowledge context:", error)
    return ""
  }
}
