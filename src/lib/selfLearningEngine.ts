import { supabase } from "@/lib/supabase"
import { getOrSeedCategories } from "@/lib/categories"

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

      const { data: existingMerchant } = await supabase
        .from("merchant_dictionaries")
        .select("id, verifiedCount")
        .eq("rawPattern", rawKey)
        .maybeSingle()

      if (existingMerchant) {
        await supabase
          .from("merchant_dictionaries")
          .update({
            cleanName: cleanMerchant,
            verifiedCount: (existingMerchant.verifiedCount || 1) + 1,
            updatedAt: new Date().toISOString(),
          })
          .eq("id", existingMerchant.id)
      } else {
        await supabase.from("merchant_dictionaries").insert({
          rawPattern: rawKey,
          cleanName: cleanMerchant,
          verifiedCount: 1,
        })
      }
    }

    const officialHierarchy = await getOrSeedCategories()

    // Deduplicate items by rawName (case-insensitive) to prevent duplicate DB locks
    const uniqueItemsMap = new Map<string, { name: string; category: string; subCategory?: string; price: number }>()
    for (const item of items) {
      const cleanItemName = item.name ? item.name.trim() : ""
      if (cleanItemName && cleanItemName.length >= 2) {
        const rawKey = cleanItemName.toLowerCase()
        if (!uniqueItemsMap.has(rawKey)) {
          // Strictly validate category & subCategory against official DB hierarchy
          const matchedParent = officialHierarchy.find(
            (h) => h.name.toLowerCase().trim() === (item.category || "").toLowerCase().trim()
          )
          const finalCategory = matchedParent ? matchedParent.name : officialHierarchy[0]?.name || "Lain-lain"
          const validSubNames = matchedParent ? matchedParent.subCategories.map((s) => s.name) : []
          const matchedSub = validSubNames.find(
            (s) => s.toLowerCase().trim() === (item.subCategory || "").toLowerCase().trim()
          )
          const finalSubCategory = matchedSub || "Umum"

          uniqueItemsMap.set(rawKey, {
            ...item,
            name: cleanItemName,
            category: finalCategory,
            subCategory: finalSubCategory,
          })
        }
      }
    }

    for (const [rawKey, item] of uniqueItemsMap.entries()) {
      const { data: existingProd } = await supabase
        .from("product_dictionaries")
        .select("id, verifiedCount")
        .eq("rawName", rawKey)
        .maybeSingle()

      if (existingProd) {
        await supabase
          .from("product_dictionaries")
          .update({
            verifiedName: item.name,
            category: item.category,
            subCategory: item.subCategory,
            lastKnownPrice: Number(item.price) || 0,
            verifiedCount: (existingProd.verifiedCount || 1) + 1,
            updatedAt: new Date().toISOString(),
          })
          .eq("id", existingProd.id)
      } else {
        await supabase.from("product_dictionaries").insert({
          rawName: rawKey,
          verifiedName: item.name,
          category: item.category,
          subCategory: item.subCategory,
          lastKnownPrice: Number(item.price) || 0,
          verifiedCount: 1,
        })
      }
    }
  } catch (error) {
    console.warn("Self-learning memory recording warning:", error)
  }
}

/**
 * Retrieves learned merchant & product context from Supabase database to inject into Gemini prompt.
 */
export async function getLearnedKnowledgeContext(): Promise<string> {
  try {
    const { data: topMerchantsData } = await supabase
      .from("merchant_dictionaries")
      .select("cleanName, verifiedCount")
      .order("verifiedCount", { ascending: false })
      .limit(10)

    const { data: topProductsData } = await supabase
      .from("product_dictionaries")
      .select("verifiedName, category, subCategory, lastKnownPrice")
      .order("verifiedCount", { ascending: false })
      .limit(15)

    const topMerchants = topMerchantsData || []
    const topProducts = topProductsData || []

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
        knowledgeText += `- "${p.verifiedName}" -> Kategori Utama: "${p.category}", Sub-Kategori: "${p.subCategory || "Umum"}" (Harga Terakhir: Rp ${Number(p.lastKnownPrice || 0).toLocaleString("id-ID")})\n`
      })
    }

    knowledgeText += "PETUNJUK TAMBAHAN: Gunakan pengetahuan di atas untuk mencocokkan ejaan nama toko, nama barang, Kategori Utama, dan Sub-Kategori jika menemukan barang sejenis pada nota baru.\n"

    return knowledgeText
  } catch (error) {
    console.warn("Error fetching learned knowledge context:", error)
    return ""
  }
}

/**
 * Token overlap and similarity score helper for local fast matching
 */
function calculateItemSimilarityScore(nameA: string, nameB: string): number {
  const cleanA = nameA.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim()
  const cleanB = nameB.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim()

  if (cleanA === cleanB) return 1.0

  const tokensA = new Set(cleanA.split(/\s+/).filter((t) => t.length >= 2))
  const tokensB = new Set(cleanB.split(/\s+/).filter((t) => t.length >= 2))

  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let matchCount = 0
  tokensA.forEach((token) => {
    if (tokensB.has(token)) matchCount++
  })

  const unionSize = new Set([...Array.from(tokensA), ...Array.from(tokensB)]).size
  const jaccardScore = matchCount / unionSize

  // Substring bonus if one contains the other
  const substringBonus = cleanA.includes(cleanB) || cleanB.includes(cleanA) ? 0.3 : 0

  return Math.min(1.0, jaccardScore + substringBonus)
}

/**
 * Fast Local Fuzzy Matcher: Matches a raw item name against learned database items in Supabase
 */
export async function matchItemWithLearnedMemory(
  rawItemName: string,
  officialHierarchy: any[]
): Promise<{ category: string; subCategory: string; confidence: number } | null> {
  try {
    const cleanRaw = rawItemName.trim()
    if (!cleanRaw || cleanRaw.length < 2) return null

    const { data: allLearnedProducts } = await supabase
      .from("product_dictionaries")
      .select("rawName, verifiedName, category, subCategory")
      .order("verifiedCount", { ascending: false })
      .limit(100)

    if (!allLearnedProducts || allLearnedProducts.length === 0) return null

    let bestMatch: any = null
    let highestScore = 0

    for (const prod of allLearnedProducts) {
      const score = calculateItemSimilarityScore(cleanRaw, prod.verifiedName || prod.rawName)
      if (score > highestScore && score >= 0.45) {
        highestScore = score
        bestMatch = prod
      }
    }

    if (bestMatch) {
      const matchedParent = officialHierarchy.find(
        (h) => h.name.toLowerCase().trim() === (bestMatch.category || "").toLowerCase().trim()
      )
      if (matchedParent) {
        const validSubs = matchedParent.subCategories.map((s: any) => s.name)
        const matchedSub = validSubs.find(
          (s: string) => s.toLowerCase().trim() === (bestMatch.subCategory || "").toLowerCase().trim()
        )
        return {
          category: matchedParent.name,
          subCategory: matchedSub || "Umum",
          confidence: highestScore,
        }
      }
    }

    return null
  } catch (error) {
    console.warn("Fuzzy local match error:", error)
    return null
  }
}
