import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"
import { compressBase64Image } from "@/lib/imageCompressor"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const approvingAdmin = getAdminUserFromRequest(req)

    const { data: pendingApproval, error: findErr } = await supabase
      .from("pending_approvals")
      .select("*")
      .eq("id", id)
      .single()

    if (findErr || !pendingApproval) {
      return NextResponse.json({ error: "Permintaan verifikasi tidak ditemukan" }, { status: 404 })
    }

    if (pendingApproval.status !== "PENDING") {
      return NextResponse.json({ error: "Permintaan verifikasi ini telah diproses sebelumnya" }, { status: 400 })
    }

    // Dual-Control Enforcement: Prevent Self-Approval!
    if (pendingApproval.requestedBy.toLowerCase() === approvingAdmin.toLowerCase()) {
      return NextResponse.json({
        error: `Akses Ditolak: Permintaan diajukan oleh Anda (${approvingAdmin}). Verifikasi harus dilakukan oleh Admin lain.`,
      }, { status: 403 })
    }

    const payload = JSON.parse(pendingApproval.payload)
    const actionType = pendingApproval.actionType

    // Execute requested changes in database
    if (actionType === "DELETE" && pendingApproval.receiptId) {
      await supabase
        .from("receipts")
        .delete()
        .eq("id", pendingApproval.receiptId)
    } else if (actionType === "BULK_DELETE" && payload.ids && Array.isArray(payload.ids)) {
      await supabase
        .from("receipts")
        .delete()
        .in("id", payload.ids)
    } else if (actionType === "SETTLE" && pendingApproval.receiptId) {
      await supabase
        .from("receipts")
        .update({
          paymentStatus: "Lunas",
          updatedAt: new Date().toISOString(),
        })
        .eq("id", pendingApproval.receiptId)
    } else if (actionType === "EDIT" && pendingApproval.receiptId) {
      const { merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, items } = payload
      const compressedImageUrl = await compressBase64Image(imageUrl)

      // Delete existing receipt items
      await supabase
        .from("receipt_items")
        .delete()
        .eq("receiptId", pendingApproval.receiptId)

      // Update parent receipt record
      await supabase
        .from("receipts")
        .update({
          merchantName: merchantName || "Nota / Toko",
          date,
          imageUrl: compressedImageUrl || null,
          subtotal: Number(subtotal) || 0,
          taxAmount: Number(taxAmount) || 0,
          totalAmount: Number(totalAmount) || 0,
          paymentMethod: paymentMethod || "Cash",
          paymentStatus: paymentStatus || "Lunas",
          note: note || null,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", pendingApproval.receiptId)

      // Re-create items
      if (items && Array.isArray(items) && items.length > 0) {
        const itemsToCreate = items.map((it: any) => ({
          receiptId: pendingApproval.receiptId,
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
      .eq("id", id)
      .select("*")
      .single()

    if (updateErr) {
      throw new Error(updateErr.message)
    }

    return NextResponse.json({
      success: true,
      message: `Perubahan berhasil diverifikasi dan diterapkan oleh Admin ${approvingAdmin}.`,
      approval: updatedApproval,
    })
  } catch (error: any) {
    console.error("Approve Request Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menyetujui perubahan" }, { status: 500 })
  }
}
