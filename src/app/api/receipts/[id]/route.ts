import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAdminUserFromRequest } from "@/lib/authHelper"

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
    const adminUser = getAdminUserFromRequest(req)
    const body = await req.json()
    const { date, items } = body

    if (!date) {
      return NextResponse.json({ error: "Tanggal nota wajib diisi" }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Nota harus memiliki minimal 1 item produk" }, { status: 400 })
    }

    // Dual-Admin Control: Create Pending Approval for EDIT action
    const approval = await (db as any).pendingApproval.create({
      data: {
        receiptId: id,
        actionType: "EDIT",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify(body),
      },
    })

    return NextResponse.json({
      pendingApproval: true,
      message: `Permintaan edit nota berhasil diajukan oleh ${adminUser}. Menunggu verifikasi dari admin lain.`,
      approval,
    })
  } catch (error: any) {
    console.error("PUT Receipt Error:", error)
    return NextResponse.json({ error: error.message || "Gagal mengajukan edit nota" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const adminUser = getAdminUserFromRequest(req)

    // Dual-Admin Control: Create Pending Approval for DELETE action
    const approval = await (db as any).pendingApproval.create({
      data: {
        receiptId: id,
        actionType: "DELETE",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify({ id }),
      },
    })

    return NextResponse.json({
      pendingApproval: true,
      message: `Permintaan hapus nota berhasil diajukan oleh ${adminUser}. Menunggu verifikasi dari admin lain.`,
      approval,
    })
  } catch (error: any) {
    console.error("DELETE Receipt Error:", error)
    return NextResponse.json({ error: "Gagal mengajukan penghapusan nota" }, { status: 500 })
  }
}
