import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { name } = await req.json()
    const cleanName = name ? name.trim() : ""

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ error: "Nama kategori minimal 2 karakter" }, { status: 400 })
    }

    const updated = await (db as any).customCategory.update({
      where: { id },
      data: { name: cleanName },
    })

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
    await (db as any).customCategory.deleteMany({
      where: { parentId: id },
    })

    // Delete the target category itself
    await (db as any).customCategory.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("DELETE Category Error:", error)
    return NextResponse.json({ error: "Gagal menghapus kategori" }, { status: 500 })
  }
}
