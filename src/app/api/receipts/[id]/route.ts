import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"
import { sendWebPushNotification } from "@/lib/serverPush"
import { invalidateReceiptsListCache } from "@/app/api/receipts/route"
import { invalidateApprovalsCache } from "@/app/api/approvals/route"
import { invalidateNotificationsCache } from "@/app/api/notifications/route"
import { compressBase64Image } from "@/lib/imageCompressor"

import { queryPg } from "@/lib/pgDb"

const SINGLE_RECEIPT_SELECT =
  "id, merchantName, date, imageUrl, subtotal, discountAmount, taxAmount, totalAmount, paymentMethod, paymentStatus, note, staffName, createdAt, updatedAt, items:receipt_items(id, name, category, subCategory, price, quantity)"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const id = resolvedParams?.id

    if (!id) {
      return NextResponse.json({ error: "ID nota tidak valid" }, { status: 400 })
    }

    let receipt: any = null

    // Strategy 1: Supabase JS (Over HTTPS - 100% Native on Vercel Serverless, exactly like commit 4e1545e)
    try {
      const { data, error } = await supabase
        .from("receipts")
        .select("*, items:receipt_items(*)")
        .eq("id", id)
        .maybeSingle()

      if (!error && data) {
        receipt = data
      }
    } catch (sbErr) {
      console.warn("Supabase single fetch notice:", sbErr)
    }

    // Strategy 2: Direct PostgreSQL Query Fallback
    if (!receipt) {
      try {
        const pgRes = await queryPg(
          `SELECT 
            r.id, 
            r."merchantName", 
            r.date, 
            r."imageUrl", 
            r.subtotal, 
            r."discountAmount", 
            r."taxAmount", 
            r."totalAmount", 
            r."paymentMethod", 
            r."paymentStatus", 
            r.note, 
            r."staffName", 
            r."createdAt", 
            r."updatedAt",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id,
                  'name', i.name,
                  'category', i.category,
                  'subCategory', i."subCategory",
                  'price', i.price,
                  'quantity', i.quantity
                )
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'::json
            ) as items
          FROM receipts r
          LEFT JOIN receipt_items i ON i."receiptId" = r.id
          WHERE r.id = $1
          GROUP BY r.id
          LIMIT 1`,
          [id]
        )
        if (pgRes.rows && pgRes.rows.length > 0) {
          receipt = pgRes.rows[0]
        }
      } catch (pgErr) {
        console.warn("PG query notice:", pgErr)
      }
    }

    if (!receipt) {
      return NextResponse.json({ error: "Nota tidak ditemukan di database" }, { status: 404 })
    }

    const res = NextResponse.json(receipt)
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate")
    return res
  } catch (error: any) {
    console.error("GET Single Receipt Error:", error)
    return NextResponse.json({ error: error.message || "Gagal memuat detail nota" }, { status: 500 })
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const id = resolvedParams?.id
    const body = await req.json()
    const { imageUrl } = body

    if (!id || !imageUrl) {
      return NextResponse.json({ error: "ID dan data gambar nota wajib diisi" }, { status: 400 })
    }

    const compressedImageUrl = await compressBase64Image(imageUrl)

    const updateRes = await queryPg(
      `UPDATE receipts 
       SET "imageUrl" = $1, "updatedAt" = now() 
       WHERE id = $2 
       RETURNING id, "merchantName", date, "imageUrl", subtotal, "discountAmount", "taxAmount", "totalAmount", "paymentMethod", "paymentStatus", note, "staffName", "createdAt", "updatedAt"`,
      [compressedImageUrl, id]
    )

    invalidateReceiptsListCache()

    return NextResponse.json({
      success: true,
      message: "Foto nota berhasil diperbarui dan disimpan.",
      receipt: updateRes.rows[0] || null,
    })
  } catch (error: any) {
    console.error("PATCH Receipt Image Error:", error)
    return NextResponse.json({ error: error.message || "Gagal memperbarui foto nota" }, { status: 500 })
  }
}

