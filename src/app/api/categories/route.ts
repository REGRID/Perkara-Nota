import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getOrSeedCategories, invalidateCategoriesCache } from "@/lib/categories"

export async function GET() {
  try {
    const hierarchy = await getOrSeedCategories()
    const allCategoryNames = hierarchy.map((h) => h.name)

    const customCats: any[] = []
    hierarchy.forEach((h) => {
      customCats.push({ id: h.id, name: h.name, parentId: null })
      h.subCategories.forEach((sub) => {
        customCats.push({ id: sub.id, name: sub.name, parentId: h.id })
      })
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
    await getOrSeedCategories()

    let resolvedParentId: string | null = null

    if (parentId && typeof parentId === "string" && parentId.trim()) {
      const targetParentStr = parentId.trim()

      // 1. Try finding parent by database ID
      const { data: parentById } = await supabase
        .from("custom_categories")
        .select("id")
        .eq("id", targetParentStr)
        .maybeSingle()

      if (parentById) {
        resolvedParentId = parentById.id
      } else {
        // 2. Try finding parent by Name (case-insensitive)
        const { data: allParents } = await supabase
          .from("custom_categories")
          .select("id, name")
          .is("parentId", null)

        const parentByName = (allParents || []).find(
          (c: any) => c.name.toLowerCase().trim() === targetParentStr.toLowerCase().trim()
        )

        if (parentByName) {
          resolvedParentId = parentByName.id
        } else {
          // 3. Create parent category if not found
          const { data: createdParent } = await supabase
            .from("custom_categories")
            .insert({
              name: targetParentStr,
              parentId: null,
            })
            .select("id")
            .single()

          if (createdParent) resolvedParentId = createdParent.id
        }
      }
    }

    // Check if duplicate exists (case-insensitive)
    let siblingQuery = supabase
      .from("custom_categories")
      .select("id, name")

    if (resolvedParentId) {
      siblingQuery = siblingQuery.eq("parentId", resolvedParentId)
    } else {
      siblingQuery = siblingQuery.is("parentId", null)
    }

    const { data: siblings } = await siblingQuery

    const existing = (siblings || []).find(
      (c: any) => c.name.toLowerCase().trim() === cleanName.toLowerCase().trim()
    )

    if (existing) {
      const updatedHierarchy = await getOrSeedCategories()
      return NextResponse.json({ ...existing, hierarchy: updatedHierarchy }, { status: 200 })
    }

    const { data: created, error: createErr } = await supabase
      .from("custom_categories")
      .insert({
        name: cleanName,
        parentId: resolvedParentId,
      })
      .select("*")
      .single()

    if (createErr) {
      throw new Error(createErr.message)
    }

    invalidateCategoriesCache()
    const finalHierarchy = await getOrSeedCategories()
    return NextResponse.json({ ...created, hierarchy: finalHierarchy }, { status: 201 })
  } catch (error: any) {
    console.error("POST Category Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menambah kategori baru" }, { status: 500 })
  }
}
