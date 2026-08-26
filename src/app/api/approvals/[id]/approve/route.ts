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

    const actionType = pendingApproval.actionType
    const cleanApprovingAdmin = approvingAdmin.trim().toLowerCase()
    const isRamaAdmin1 = cleanApprovingAdmin === "rama" || cleanApprovingAdmin === "admin1"

    // Exclusive Approval for New Receipts (CREATE): Only Admin 1 (Rama) is authorized to approve new receipts
    if (actionType === "CREATE" && !isRamaAdmin1) {
      return NextResponse.json({
        error: "Akses Ditolak: Hak persetujuan (approval) nota baru hanya dimiliki khusus oleh Admin 1 (Rama).",
      }, { status: 403 })
    }

    // Dual-Control Enforcement: Prevent Self-Approval (Case-Insensitive) for destructive actions (DELETE, BULK_DELETE, EDIT)
    const isDestructive = actionType === "DELETE" || actionType === "BULK_DELETE" || actionType === "EDIT"
    if (isDestructive && pendingApproval.requestedBy.trim().toLowerCase() === cleanApprovingAdmin) {
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

    let targetReceiptId = pendingApproval.receiptId || payload.id

    // Invalidate list cache so fresh updated data is returned immediately
    invalidateReceiptsListCache()

    // Execute requested changes in database
    if (actionType === "CREATE") {
      const {
        merchantName,
        date,
        imageUrl,
        subtotal,
        taxAmount,
        totalAmount,
        paymentMethod,
        paymentStatus,
        note,
        staffName,
        items,
      } = payload

      const compressedImageUrl = imageUrl ? await compressBase64Image(imageUrl) : null

      // Insert master receipt
      const { data: newReceipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          merchantName: merchantName || "Nota / Toko",
          date: date || new Date().toISOString().split("T")[0],
          imageUrl: compressedImageUrl,
          subtotal: Number(subtotal) || 0,
          taxAmount: Number(taxAmount) || 0,
          totalAmount: Number(totalAmount) || 0,
          paymentMethod: paymentMethod || "Cash",
          paymentStatus: paymentStatus || "Lunas",
          note: note || null,
          staffName: staffName || null,
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single()

      if (receiptError) {
        console.error("Insert Approved Receipt Error:", receiptError)
        throw new Error(receiptError.message)
      }

      targetReceiptId = newReceipt.id

      // Insert items
      if (items && Array.isArray(items) && items.length > 0) {
        const itemsToInsert = items.map((item: any) => ({
          receiptId: newReceipt.id,
          name: item.name || "Item",
          category: item.category || "Lain-lain",
          subCategory: item.subCategory || "Umum",
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
        }))

        const { error: itemsError } = await supabase
          .from("receipt_items")
          .insert(itemsToInsert)

        if (itemsError) {
          console.error("Insert Approved Items Error:", itemsError)
        }
      }

      // Background auto-learning into dictionaries
      try {
        if (merchantName) {
          await supabase.from("merchant_dictionaries").upsert(
            {
              rawPattern: merchantName.toLowerCase().trim(),
              cleanName: merchantName.trim(),
              updatedAt: new Date().toISOString(),
            },
            { onConflict: "rawPattern" }
          )
        }

        if (items && Array.isArray(items)) {
          for (const itm of items) {
            if (itm.name) {
              await supabase.from("product_dictionaries").upsert(
                {
                  rawName: itm.name.toLowerCase().trim(),
                  verifiedName: itm.name.trim(),
                  category: itm.category || "Lain-lain",
                  subCategory: itm.subCategory || "Umum",
                  lastKnownPrice: Number(itm.price) || 0,
                  updatedAt: new Date().toISOString(),
                },
                { onConflict: "rawName" }
              )
            }
          }
        }
      } catch (dictErr) {
        console.warn("Background auto-learning notice:", dictErr)
      }
    } else if (actionType === "DELETE" && (pendingApproval.receiptId || payload.id)) {
      const delId = pendingApproval.receiptId || payload.id
      const { error: delErr } = await supabase
        .from("receipts")
        .delete()
        .eq("id", delId)

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
      const editReceiptId = pendingApproval.receiptId || payload.id
      const { merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, items } = payload
      const compressedImageUrl = imageUrl ? await compressBase64Image(imageUrl) : null

      // Delete existing receipt items
      await supabase
        .from("receipt_items")
        .delete()
        .eq("receiptId", editReceiptId)

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
        .eq("id", editReceiptId)

      if (editErr) console.warn("Edit receipt execution notice:", editErr)

      // Re-create items
      if (items && Array.isArray(items) && items.length > 0) {
        const itemsToCreate = items.map((it: any) => ({
          receiptId: editReceiptId,
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
        receiptId: targetReceiptId || null,
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

    // Insert notification & Send Web Push
    try {
      const notifTitle = actionType === "CREATE" ? "Nota Baru Disetujui & Diterbitkan" : "Permintaan Diverifikasi & Disetujui"
      const notifMsg = actionType === "CREATE"
        ? `Admin ${approvingAdmin} telah menyetujui nota baru dari "${payload.merchantName || 'Nota / Toko'}" sebesar Rp ${(Number(payload.totalAmount) || 0).toLocaleString("id-ID")}. Nota kini resmi tercatat di sistem.`
        : `Admin ${approvingAdmin} telah memverifikasi & menyetujui permintaan ${pendingApproval.actionType} Anda.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: approvingAdmin,
        type: "APPROVE",
        title: notifTitle,
        message: notifMsg,
        approvalId: cleanId,
        receiptId: targetReceiptId || null,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ALL",
        excludeUsername: approvingAdmin,
      }).catch((pErr) => console.warn("[WebPush Error on Approval]:", pErr))
    } catch (nErr) {
      console.warn("Approve notification error:", nErr)
    }

    return NextResponse.json({
      success: true,
      message: actionType === "CREATE"
        ? `Nota baru "${payload.merchantName || 'Nota'}" berhasil disetujui & diterbitkan ke sistem oleh Admin ${approvingAdmin}.`
        : `Perubahan berhasil diverifikasi dan diterapkan oleh Admin ${approvingAdmin}.`,
      approval: updatedApproval || { id: cleanId, status: "APPROVED" },
    })
  } catch (error: any) {
    console.error("Approve Request Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menyetujui perubahan" }, { status: 500 })
  }
}
