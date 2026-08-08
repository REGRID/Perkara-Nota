import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAdminUserFromRequest } from "@/lib/authHelper"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING"

    const approvals = await (db as any).pendingApproval.findMany({
      where: status === "ALL" ? {} : { status },
      include: {
        receipt: {
          select: {
            id: true,
            merchantName: true,
            date: true,
            totalAmount: true,
            paymentStatus: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(approvals)
  } catch (error: any) {
    console.error("GET Approvals Error:", error)
    return NextResponse.json({ error: "Gagal mengambil daftar verifikasi" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const body = await req.json()
    const { receiptId, actionType, payload } = body

    if (!actionType || !payload) {
      return NextResponse.json({ error: "Tipe aksi dan payload data wajib diisi" }, { status: 400 })
    }

    const newApproval = await (db as any).pendingApproval.create({
      data: {
        receiptId: receiptId || null,
        actionType, // DELETE, EDIT, SETTLE, BULK_DELETE
        requestedBy: adminUser,
        status: "PENDING",
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Permintaan ${actionType} berhasil diajukan oleh ${adminUser}. Menunggu verifikasi oleh admin lain.`,
      approval: newApproval,
    }, { status: 201 })
  } catch (error: any) {
    console.error("POST Approval Request Error:", error)
    return NextResponse.json({ error: "Gagal membuat permintaan verifikasi" }, { status: 500 })
  }
}
