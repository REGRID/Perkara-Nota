import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getOrSeedCategories } from "@/lib/categories"

export async function GET() {
  try {
    const hierarchy = await getOrSeedCategories()
    const allCategoryNames = hierarchy.map((h) => h.name)

    const customCats = await (db as any).customCategory.findMany({
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

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ error: "Nama kategori minimal 2 karakter" }, { status: 400 })
    }

    const created = await (db as any).customCategory.create({
      data: {
        name: cleanName,
        parentId: parentId || null,
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error("POST Category Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menambah kategori baru" }, { status: 500 })
  }
}
