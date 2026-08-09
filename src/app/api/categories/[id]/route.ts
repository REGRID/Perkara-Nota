import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { invalidateCategoriesCache } from "@/lib/categories"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { name } = await req.json()
    const cleanName = name ? name.trim() : ""

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ error: "Nama kategori minimal 2 karakter" }, { status: 400 })
    }

    const { data: updated, error } = await supabase
      .from("custom_categories")
      .update({ name: cleanName })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    invalidateCategoriesCache()
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("PUT Category Error:", error)
    return NextResponse.json({ error: "Gagal memperbarui nama kategori" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Delete sub-categories under this parent first if it's a parent category
    await supabase.from("custom_categories").delete().eq("parentId", id)

    // Delete the target category itself
    const { error } = await supabase.from("custom_categories").delete().eq("id", id)

    if (error) {
      throw new Error(error.message)
    }

    invalidateCategoriesCache()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("DELETE Category Error:", error)
    return NextResponse.json({ error: "Gagal menghapus kategori" }, { status: 500 })
  }
}
