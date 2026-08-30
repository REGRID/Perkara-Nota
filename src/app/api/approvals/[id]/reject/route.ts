import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest, getAdminRoleFromRequest } from "@/lib/authHelper"
import { sendWebPushNotification } from "@/lib/serverPush"
import { invalidateApprovalsCache } from "@/app/api/approvals/route"
import { invalidateNotificationsCache } from "@/app/api/notifications/route"

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

    const cleanRejectingAdmin = rejectingAdmin.trim().toLowerCase()
    const isRamaAdmin1 = cleanRejectingAdmin === "rama" || cleanRejectingAdmin === "admin1"

    // Exclusive Rejection for New Receipts (CREATE): Only Admin 1 (Rama) is authorized to reject new receipts
    if (pendingApproval.actionType === "CREATE" && !isRamaAdmin1) {
      return NextResponse.json({
        error: "Akses Ditolak: Hak penolakan/persetujuan nota baru hanya dimiliki khusus oleh Admin 1 (Rama).",
      }, { status: 403 })
    }

    // Dual-Control Enforcement: Prevent Self-Rejection only for destructive items
    const isDestructive = pendingApproval.actionType === "DELETE" || pendingApproval.actionType === "BULK_DELETE" || pendingApproval.actionType === "EDIT"
    if (isDestructive && pendingApproval.requestedBy.trim().toLowerCase() === cleanRejectingAdmin) {
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

    // Invalidate caches immediately
    invalidateApprovalsCache()
    invalidateNotificationsCache()

    // Insert notification & Send Web Push
    try {
      let payloadObj: any = {}
      try {
        payloadObj = JSON.parse(pendingApproval.payload || "{}")
      } catch (e) {}

      const notifTitle = pendingApproval.actionType === "CREATE" ? "Pengajuan Nota Baru Ditolak" : "Permintaan Ditolak"
      const notifMsg = pendingApproval.actionType === "CREATE"
        ? `Admin ${rejectingAdmin} menolak pengajuan nota baru dari "${payloadObj.merchantName || 'Nota'}". Alasan: ${reason || "Tidak disetujui"}.`
        : `Admin ${rejectingAdmin} menolak permintaan ${pendingApproval.actionType} Anda. Alasan: ${reason || "Tidak disetujui"}.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: rejectingAdmin,
        type: "REJECT",
        title: notifTitle,
        message: notifMsg,
        approvalId: cleanId,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ADMIN",
        excludeUsername: rejectingAdmin,
      }).catch((pErr) => console.warn("[WebPush Error on Reject]:", pErr))
    } catch (nErr) {
      console.warn("Reject notification error:", nErr)
    }

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
