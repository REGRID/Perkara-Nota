import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest, getAdminRoleFromRequest } from "@/lib/authHelper"
import { compressBase64Image } from "@/lib/imageCompressor"
import { invalidateReceiptsListCache } from "@/app/api/receipts/route"
import { invalidateApprovalsCache } from "@/app/api/approvals/route"
import { invalidateNotificationsCache } from "@/app/api/notifications/route"
import { sendWebPushNotification } from "@/lib/serverPush"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const cleanId = (id || "").trim()

    if (!cleanId) {
      return NextResponse.json({ error: "ID permintaan verifikasi tidak valid" }, { status: 400 })
    }

    const approvingAdmin = getAdminUserFromRequest(req)
    const userRole = getAdminRoleFromRequest(req)

    if (userRole === "KARYAWAN") {
      return NextResponse.json({
        error: "Akses Ditolak: Role Karyawan tidak diizinkan memverifikasi/menyetujui permintaan. Persetujuan wajib dilakukan oleh Admin (Rama / Refo).",
      }, { status: 403 })
    }

    // Fetch approval request safely with maybeSingle to avoid coercion error
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

    // Dual-Control Enforcement: Prevent Self-Approval (Case-Insensitive)
    if (pendingApproval.requestedBy.trim().toLowerCase() === approvingAdmin.trim().toLowerCase()) {
      return NextResponse.json({
        error: `Akses Ditolak: Permintaan diajukan oleh Anda (${approvingAdmin}). Verifikasi harus dilakukan oleh Admin lain.`,
      }, { status: 403 })
    }

    let payload: any = {}
    try {
      payload = JSON.parse(pendingApproval.payload || "{}")
    } catch (pErr) {
      payload = {}
    }

    const actionType = pendingApproval.actionType

    // Invalidate list cache so fresh updated data is returned immediately
    invalidateReceiptsListCache()

    // Execute requested changes in database
    if (actionType === "DELETE" && (pendingApproval.receiptId || payload.id)) {
      const targetId = pendingApproval.receiptId || payload.id
      const { error: delErr } = await supabase
        .from("receipts")
        .delete()
        .eq("id", targetId)

      if (delErr) console.warn("Delete receipt execution notice:", delErr)
    } else if (actionType === "BULK_DELETE" && payload.ids && Array.isArray(payload.ids)) {
      const { error: bulkErr } = await supabase
        .from("receipts")
        .delete()
        .in("id", payload.ids)

      if (bulkErr) console.warn("Bulk delete receipts execution notice:", bulkErr)
    } else if (actionType === "BULK_SETTLE" || actionType === "SETTLE") {
      const targetIds: string[] =
        payload.ids && Array.isArray(payload.ids) && payload.ids.length > 0
          ? payload.ids
          : pendingApproval.receiptId
          ? [pendingApproval.receiptId]
          : payload.id
          ? [payload.id]
          : []

      if (targetIds.length > 0) {
        const { error: setErr } = await supabase
          .from("receipts")
          .update({
            paymentStatus: "Sudah Dilunasi",
            updatedAt: new Date().toISOString(),
          })
          .in("id", targetIds)

        if (setErr) console.warn("Settle execution notice:", setErr)
      }
    } else if (actionType === "EDIT" && (pendingApproval.receiptId || payload.id)) {
      const targetReceiptId = pendingApproval.receiptId || payload.id
      const { merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, items } = payload
      const compressedImageUrl = imageUrl ? await compressBase64Image(imageUrl) : null

      // Delete existing receipt items
      await supabase
        .from("receipt_items")
        .delete()
        .eq("receiptId", targetReceiptId)

      // Update parent receipt record (preserve exact paymentStatus passed in edit payload)
      const updateFields: any = {
        merchantName: merchantName || "Nota / Toko",
        date: date,
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || "Cash",
        paymentStatus: paymentStatus || "Lunas",
        note: note || null,
        updatedAt: new Date().toISOString(),
      }

      if (compressedImageUrl) {
        updateFields.imageUrl = compressedImageUrl
      }

      const { error: editErr } = await supabase
        .from("receipts")
        .update(updateFields)
        .eq("id", targetReceiptId)

      if (editErr) console.warn("Edit receipt execution notice:", editErr)

      // Re-create items
      if (items && Array.isArray(items) && items.length > 0) {
        const itemsToCreate = items.map((it: any) => ({
          receiptId: targetReceiptId,
          name: it.name || "Item",
          category: it.category || "Lain-lain",
          subCategory: it.subCategory || "Umum",
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
        }))

        await supabase
          .from("receipt_items")
          .insert(itemsToCreate)
      }
    }

    // Mark approval request as APPROVED in Supabase
    const { data: updatedApproval, error: updateErr } = await supabase
      .from("pending_approvals")
      .update({
        status: "APPROVED",
        approvedBy: approvingAdmin,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", cleanId)
      .select("*")
      .maybeSingle()

    if (updateErr) {
      console.error("Update Approval Status Error:", updateErr)
      throw new Error(updateErr.message)
    }

    // Invalidate caches immediately
    invalidateApprovalsCache()
    invalidateNotificationsCache()
    invalidateReceiptsListCache()

    // Insert notification to all admins & Send Web Push
    try {
      const notifTitle = "Permintaan Diverifikasi & Disetujui"
      const notifMsg = `Admin ${approvingAdmin} telah memverifikasi & menyetujui permintaan ${pendingApproval.actionType} Anda.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: approvingAdmin,
        type: "APPROVE",
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
        excludeUsername: approvingAdmin,
      }).catch((pErr) => console.warn("[WebPush Error on Approval]:", pErr))
    } catch (nErr) {
      console.warn("Approve notification error:", nErr)
    }

    return NextResponse.json({
      success: true,
      message: `Perubahan berhasil diverifikasi dan diterapkan oleh Admin ${approvingAdmin}.`,
      approval: updatedApproval || { id: cleanId, status: "APPROVED" },
    })
  } catch (error: any) {
    console.error("Approve Request Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menyetujui perubahan" }, { status: 500 })
  }
}
