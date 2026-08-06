import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { recordVerifiedReceiptLearning } from "@/lib/selfLearningEngine"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const receipt = await db.receipt.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!receipt) {
      return NextResponse.json({ error: "Nota tidak ditemukan" }, { status: 404 })
    }

    return NextResponse.json(receipt)
  } catch (error: any) {
    console.error("GET Single Receipt Error:", error)
    return NextResponse.json({ error: "Gagal memuat detail nota" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, items } = body

    if (!date) {
      return NextResponse.json({ error: "Tanggal nota wajib diisi" }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Nota harus memiliki minimal 1 item produk" }, { status: 400 })
    }

    const isPersonal =
      paymentMethod === "Dana Pribadi Owner" || paymentMethod === "Talangan Karyawan"
    const cleanedNote = note
      ? isPersonal
        ? note
        : note.replace(/\[Dibayar oleh: [^\]]+\]\s*/g, "").trim() || null
      : null

    await db.receiptItem.deleteMany({
      where: { receiptId: id },
    })

    const updatedReceipt = await db.receipt.update({
      where: { id },
      data: {
        merchantName: merchantName || "Nota / Toko",
        date,
        imageUrl: imageUrl || undefined,
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || "Cash",
        paymentStatus: paymentStatus || "Lunas",
        note: cleanedNote,
        items: {
          create: items.map((it: any) => ({
            name: it.name || "Item",
            category: it.category || "Lain-lain",
            subCategory: it.subCategory || "Umum",
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    // Continuous Self-Learning Engine: Record verified user updates
    await recordVerifiedReceiptLearning(merchantName, items)

    return NextResponse.json(updatedReceipt)
  } catch (error: any) {
    console.error("PUT Receipt Error:", error)
    return NextResponse.json({ error: error.message || "Gagal memperbarui nota" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    await db.receipt.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, message: "Nota berhasil dihapus" })
  } catch (error: any) {
    console.error("DELETE Receipt Error:", error)
    return NextResponse.json({ error: "Gagal menghapus nota" }, { status: 500 })
  }
}
