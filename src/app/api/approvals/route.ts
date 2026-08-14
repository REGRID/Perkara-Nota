import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"
import { sendWebPushNotification } from "@/lib/serverPush"
import { invalidateNotificationsCache } from "@/app/api/notifications/route"

const APPROVAL_SELECT =
  "id, receiptId, actionType, requestedBy, approvedBy, status, rejectionReason, payload, createdAt, updatedAt, receipt:receipts(id, merchantName, date, totalAmount, paymentMethod, paymentStatus, note, items:receipt_items(id, name, category, subCategory, price, quantity))"

// In-Memory Backend Cache to save Supabase Egress during polling
let approvalsCache: { key: string; data: any; timestamp: number } | null = null
const CACHE_TTL_MS = 8000 // 8 seconds cache

export function invalidateApprovalsCache() {
  approvalsCache = null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING"
    const receiptId = searchParams.get("receiptId") || ""
    const cacheKey = `${status}_${receiptId}`
    const now = Date.now()

    if (approvalsCache && approvalsCache.key === cacheKey && now - approvalsCache.timestamp < CACHE_TTL_MS) {
      const cached = NextResponse.json(approvalsCache.data)
      cached.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=15")
      return cached
    }

    let query = supabase
      .from("pending_approvals")
      .select(APPROVAL_SELECT)
      .order("createdAt", { ascending: false })
      .limit(50)

    if (status !== "ALL") {
      query = query.eq("status", status)
    }

    const { data: approvals, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    let result = approvals || []

    if (receiptId) {
      result = result.filter((app: any) => {
        if (app.receiptId === receiptId) return true
        if (app.payload) {
          try {
            const p = JSON.parse(app.payload)
            if (p.id === receiptId) return true
            if (p.ids && Array.isArray(p.ids) && p.ids.includes(receiptId)) return true
          } catch (e) {}
        }
        return false
      })
    }

    approvalsCache = { key: cacheKey, data: result, timestamp: now }

    const res = NextResponse.json(result)
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=15")
    return res
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

    invalidateApprovalsCache()
    invalidateNotificationsCache()

    const { data: newApproval, error } = await supabase
      .from("pending_approvals")
      .insert({
        receiptId: receiptId || null,
        actionType, // DELETE, EDIT, SETTLE, BULK_DELETE
        requestedBy: adminUser,
        status: "PENDING",
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
      })
      .select("id, receiptId, actionType, requestedBy, status, createdAt")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Insert Notification for all admins & Send Web Push
    try {
      const notifTitle = `Permintaan Verifikasi (${actionType})`
      const notifMsg = `Admin ${adminUser} mengajukan permintaan verifikasi ${actionType}.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: adminUser,
        type: "REQUEST",
        title: notifTitle,
        message: notifMsg,
        approvalId: newApproval.id,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ADMIN",
        excludeUsername: adminUser,
      }).catch((pErr: any) => console.warn("[WebPush Error on Approval POST]:", pErr))
    } catch (nErr) {
      console.warn("Approval POST notification insert notice:", nErr)
    }

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
