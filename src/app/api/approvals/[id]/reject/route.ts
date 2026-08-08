import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAdminUserFromRequest } from "@/lib/authHelper"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rejectingAdmin = getAdminUserFromRequest(req)
    const body = await req.json()
    const { reason } = body || {}

    const pendingApproval = await (db as any).pendingApproval.findUnique({
      where: { id },
    })

    if (!pendingApproval) {
      return NextResponse.json({ error: "Permintaan verifikasi tidak ditemukan" }, { status: 404 })
    }

    if (pendingApproval.status !== "PENDING") {
      return NextResponse.json({ error: "Permintaan verifikasi ini telah diproses sebelumnya" }, { status: 400 })
    }

    if (pendingApproval.requestedBy === rejectingAdmin) {
      return NextResponse.json({
        error: `Akses Ditolak: Permintaan diajukan oleh Anda (${rejectingAdmin}). Verifikasi/penolakan harus dilakukan oleh Admin lain.`,
      }, { status: 403 })
    }

    const updatedApproval = await (db as any).pendingApproval.update({
      where: { id },
      data: {
        status: "REJECTED",
        approvedBy: rejectingAdmin,
        rejectionReason: reason || "Ditolak oleh admin",
      },
    })

    return NextResponse.json({
      success: true,
      message: `Permintaan perubahan telah ditolak oleh Admin ${rejectingAdmin}.`,
      approval: updatedApproval,
    })
  } catch (error: any) {
    console.error("Reject Request Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menolak permintaan" }, { status: 500 })
  }
}
