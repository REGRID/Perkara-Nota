import { supabase } from "@/lib/supabase"

export interface CategoryHierarchyItem {
  id: string
  name: string
  subCategories: { id: string; name: string }[]
}

export const DEFAULT_SEED_CATEGORIES = [
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
]

let cachedCategories: CategoryHierarchyItem[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60 * 1000 // 60 seconds cache

export function invalidateCategoriesCache() {
  cachedCategories = null
  cacheTimestamp = 0
}

export async function getOrSeedCategories(): Promise<CategoryHierarchyItem[]> {
  const now = Date.now()
  if (cachedCategories && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedCategories
  }

  try {
    let { data: customCats, error } = await supabase
      .from("custom_categories")
      .select("id, name, parentId")
      .order("createdAt", { ascending: true })

    // Auto-seed default categories if empty
    if (error || !customCats || customCats.length === 0) {
      for (const catGroup of DEFAULT_SEED_CATEGORIES) {
        const { data: createdParent } = await supabase
          .from("custom_categories")
          .insert({
            name: catGroup.name,
            parentId: null,
          })
          .select("id")
          .single()

        if (createdParent) {
          for (const subName of catGroup.subs) {
            await supabase.from("custom_categories").insert({
              name: subName,
              parentId: createdParent.id,
            })
          }
        }
      }

      // Re-fetch after seeding
      const refetched = await supabase
        .from("custom_categories")
        .select("id, name, parentId")
        .order("createdAt", { ascending: true })
      customCats = refetched.data || []
    }

    const parents = customCats.filter((c: any) => !c.parentId)
    const subs = customCats.filter((c: any) => c.parentId)

    const hierarchy: CategoryHierarchyItem[] = parents.map((parent: any) => ({
      id: parent.id,
      name: parent.name,
      subCategories: subs
        .filter((sub: any) => sub.parentId === parent.id)
        .map((sub: any) => ({ id: sub.id, name: sub.name })),
    }))

    cachedCategories = hierarchy
    cacheTimestamp = now
    return hierarchy
  } catch (error) {
    console.error("Error in getOrSeedCategories:", error)
    // Fallback static structure if DB query fails
    return DEFAULT_SEED_CATEGORIES.map((cat, idx) => ({
      id: `default-${idx}`,
      name: cat.name,
      subCategories: cat.subs.map((s, sIdx) => ({ id: `default-sub-${idx}-${sIdx}`, name: s })),
    }))
  }
}
