import { db } from "@/lib/db"

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

export async function getOrSeedCategories(): Promise<CategoryHierarchyItem[]> {
  try {
    let customCats = await (db as any).customCategory.findMany({
      orderBy: { createdAt: "asc" },
    })

    // Auto-seed default categories if empty
    if (!customCats || customCats.length === 0) {
      for (const catGroup of DEFAULT_SEED_CATEGORIES) {
        const createdParent = await (db as any).customCategory.create({
          data: {
            name: catGroup.name,
            parentId: null,
          },
        })

        for (const subName of catGroup.subs) {
          await (db as any).customCategory.create({
            data: {
              name: subName,
              parentId: createdParent.id,
            },
          })
        }
      }

      // Re-fetch after seeding
      customCats = await (db as any).customCategory.findMany({
        orderBy: { createdAt: "asc" },
      })
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
