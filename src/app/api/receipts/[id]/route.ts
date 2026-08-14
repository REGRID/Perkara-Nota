import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"
import { sendWebPushNotification } from "@/lib/serverPush"
import { invalidateReceiptsListCache } from "@/app/api/receipts/route"
import { invalidateApprovalsCache } from "@/app/api/approvals/route"
import { invalidateNotificationsCache } from "@/app/api/notifications/route"

const SINGLE_RECEIPT_SELECT =
  "id, merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, staffName, createdAt, updatedAt, items:receipt_items(id, name, category, subCategory, price, quantity)"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: receipt, error } = await supabase
      .from("receipts")
      .select(SINGLE_RECEIPT_SELECT)
      .eq("id", id)
      .single()

    if (error || !receipt) {
      return NextResponse.json({ error: "Nota tidak ditemukan" }, { status: 404 })
    }

    const res = NextResponse.json(receipt)
    res.headers.set("Cache-Control", "public, s-maxage=10, stale-while-revalidate=60")
    return res
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

    invalidateReceiptsListCache()
    invalidateApprovalsCache()
    invalidateNotificationsCache()

    // Dual-Admin Control: Create Pending Approval for EDIT action in Supabase
    const { data: approval, error } = await supabase
      .from("pending_approvals")
      .insert({
        receiptId: id,
        actionType: "EDIT",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify(body),
      })
      .select("id, receiptId, actionType, requestedBy, status, createdAt")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Insert Notification for all admins & Trigger Web Push
    try {
      const notifTitle = "Permintaan Edit Nota"
      const notifMsg = `Admin ${adminUser} mengajukan perubahan data nota "${body.merchantName || 'Nota'}".`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: adminUser,
        type: "REQUEST",
        title: notifTitle,
        message: notifMsg,
        approvalId: approval.id,
        receiptId: id,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ADMIN",
        excludeUsername: adminUser,
      }).catch((pErr: any) => console.warn("[WebPush Error on Edit Request]:", pErr))
      invalidateNotificationsCache()
    } catch (nErr) {
      console.warn("Edit request notification insert notice:", nErr)
    }

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

    invalidateReceiptsListCache()
    invalidateApprovalsCache()
    invalidateNotificationsCache()

    // Dual-Admin Control: Create Pending Approval for DELETE action in Supabase
    const { data: approval, error } = await supabase
      .from("pending_approvals")
      .insert({
        receiptId: id,
        actionType: "DELETE",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify({ id }),
      })
      .select("id, receiptId, actionType, requestedBy, status, createdAt")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Insert Notification for all admins & Trigger Web Push
    try {
      const notifTitle = "Permintaan Hapus Nota"
      const notifMsg = `Admin ${adminUser} mengajukan penghapusan nota.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: adminUser,
        type: "REQUEST",
        title: notifTitle,
        message: notifMsg,
        approvalId: approval.id,
        receiptId: id,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ADMIN",
        excludeUsername: adminUser,
      }).catch((pErr: any) => console.warn("[WebPush Error on Delete Request]:", pErr))
      invalidateNotificationsCache()
    } catch (nErr) {
      console.warn("Delete request notification insert notice:", nErr)
    }

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
