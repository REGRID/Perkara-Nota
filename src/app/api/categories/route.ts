import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getOrSeedCategories, invalidateCategoriesCache } from "@/lib/categories"

export async function GET() {
  try {
    const hierarchy = await getOrSeedCategories()
    const allCategoryNames = hierarchy.map((h) => h.name)

    const customCats = await (db as any).customCategory.findMany({
      select: { id: true, name: true, parentId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({
      allCategories: allCategoryNames,
      customCategories: customCats,
      hierarchy,
      allRawCategories: customCats,
    })
  } catch (error: any) {
    console.error("GET Categories Error:", error)
    return NextResponse.json({
      allCategories: [],
      customCategories: [],
      hierarchy: [],
      allRawCategories: [],
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, parentId } = await req.json()
    const cleanName = name ? name.trim() : ""

    if (!cleanName || cleanName.length < 1) {
      return NextResponse.json({ error: "Nama kategori tidak boleh kosong" }, { status: 400 })
    }

    invalidateCategoriesCache()
    // Ensure database has default categories seeded if empty
    await getOrSeedCategories()

    let resolvedParentId: string | null = null

    if (parentId && typeof parentId === "string" && parentId.trim()) {
      const targetParentStr = parentId.trim()

      // 1. Try finding parent by database ID
      const parentById = await (db as any).customCategory.findFirst({
        where: { id: targetParentStr },
        select: { id: true },
      })

      if (parentById) {
        resolvedParentId = parentById.id
      } else {
        // 2. Try finding parent by Name (case-insensitive)
        const allParents = await (db as any).customCategory.findMany({
          where: { parentId: null },
          select: { id: true, name: true },
        })
        const parentByName = allParents.find(
          (c: any) => c.name.toLowerCase().trim() === targetParentStr.toLowerCase().trim()
        )

        if (parentByName) {
          resolvedParentId = parentByName.id
        } else {
          // 3. Create parent category if not found
          const createdParent = await (db as any).customCategory.create({
            data: {
              name: targetParentStr,
              parentId: null,
            },
          })
          resolvedParentId = createdParent.id
        }
      }
    }

    // Check if duplicate exists (case-insensitive)
    const siblings = await (db as any).customCategory.findMany({
      where: { parentId: resolvedParentId },
      select: { id: true, name: true },
    })

    const existing = siblings.find(
      (c: any) => c.name.toLowerCase().trim() === cleanName.toLowerCase().trim()
    )

    if (existing) {
      const updatedHierarchy = await getOrSeedCategories()
      return NextResponse.json({ ...existing, hierarchy: updatedHierarchy }, { status: 200 })
    }

    const created = await (db as any).customCategory.create({
      data: {
        name: cleanName,
        parentId: resolvedParentId,
      },
    })

    invalidateCategoriesCache()
    const finalHierarchy = await getOrSeedCategories()
    return NextResponse.json({ ...created, hierarchy: finalHierarchy }, { status: 201 })
  } catch (error: any) {
    console.error("POST Category Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menambah kategori baru" }, { status: 500 })
  }
}
