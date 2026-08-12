import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest, getAdminRoleFromRequest } from "@/lib/authHelper"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const cleanId = (id || "").trim()

    if (!cleanId) {
      return NextResponse.json({ error: "ID permintaan verifikasi tidak valid" }, { status: 400 })
    }

    const rejectingAdmin = getAdminUserFromRequest(req)
    const userRole = getAdminRoleFromRequest(req)

    if (userRole === "KARYAWAN") {
      return NextResponse.json({
        error: "Akses Ditolak: Role Karyawan tidak diizinkan menolak/memverifikasi permintaan. Penolakan/Persetujuan wajib dilakukan oleh Admin (Rama / Refo).",
      }, { status: 403 })
    }
    const body = await req.json()
    const { reason } = body || {}

    const { data: pendingApproval, error: findErr } = await supabase
      .from("pending_approvals")
      .select("*")
      .eq("id", cleanId)
      .maybeSingle()

    if (findErr) {
      console.error("Supabase Find Approval Error:", findErr)
      return NextResponse.json({ error: "Gagal membaca permintaan verifikasi" }, { status: 500 })
    }

    if (!pendingApproval) {
      return NextResponse.json({ error: "Permintaan verifikasi tidak ditemukan" }, { status: 404 })
    }

    if (pendingApproval.status !== "PENDING") {
      return NextResponse.json({ error: "Permintaan verifikasi ini telah diproses sebelumnya" }, { status: 400 })
    }

    if (pendingApproval.requestedBy.trim().toLowerCase() === rejectingAdmin.trim().toLowerCase()) {
      return NextResponse.json({
        error: `Akses Ditolak: Permintaan diajukan oleh Anda (${rejectingAdmin}). Verifikasi/penolakan harus dilakukan oleh Admin lain.`,
      }, { status: 403 })
    }

    const { data: updatedApproval, error: updateErr } = await supabase
      .from("pending_approvals")
      .update({
        status: "REJECTED",
        approvedBy: rejectingAdmin,
        rejectionReason: reason || "Ditolak oleh admin",
        updatedAt: new Date().toISOString(),
      })
      .eq("id", cleanId)
      .select("*")
      .maybeSingle()

    if (updateErr) {
      console.error("Update Reject Status Error:", updateErr)
      throw new Error(updateErr.message)
    }

    // Insert notification to requesting admin
    const requester = pendingApproval.requestedBy
    await supabase.from("notifications").insert({
      recipient: requester.toLowerCase(),
      sender: rejectingAdmin,
      type: "REJECT",
      title: "Permintaan Ditolak",
      message: `Admin ${rejectingAdmin} menolak permintaan ${pendingApproval.actionType} Anda. Alasan: ${reason || "Tidak disetujui"}.`,
      approvalId: cleanId,
      isRead: false,
    })

    return NextResponse.json({
      success: true,
      message: `Permintaan perubahan telah ditolak oleh Admin ${rejectingAdmin}.`,
      approval: updatedApproval || { id: cleanId, status: "REJECTED" },
    })
  } catch (error: any) {
    console.error("Reject Request Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menolak permintaan" }, { status: 500 })
  }
}
