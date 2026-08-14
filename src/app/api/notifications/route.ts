import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest, getAdminRoleFromRequest } from "@/lib/authHelper"

const NOTIF_SELECT =
  "id, recipient, sender, type, title, message, receiptId, approvalId, isRead, createdAt"

// In-memory cache per user/role to reduce Supabase Egress during polling
let notifCache: Map<string, { data: any; timestamp: number }> = new Map()
const CACHE_TTL_MS = 8000 // 8 seconds cache

export function invalidateNotificationsCache() {
  notifCache.clear()
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const userRole = getAdminRoleFromRequest(req)
    const cleanUser = (adminUser || "all").trim().toLowerCase() || "all"
    const cacheKey = `${userRole}_${cleanUser}`
    const now = Date.now()

    const cached = notifCache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      const res = NextResponse.json(cached.data)
      res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=15")
      return res
    }

    let query = supabase
      .from("notifications")
      .select(NOTIF_SELECT)
      .order("createdAt", { ascending: false })
      .limit(30)

    if (userRole === "ADMIN") {
      query = query.or(`recipient.eq.${cleanUser},recipient.eq.admin,recipient.eq.all,recipient.eq.*,recipient.eq.rama,recipient.eq.refo`)
    } else {
      // Role KARYAWAN: Only receive notifications targeted to karyawan/all
      query = query.or(`recipient.eq.karyawan,recipient.eq.all,recipient.eq.${cleanUser},recipient.eq.*`)
    }

    const { data: rawNotifications, error } = await query

    if (error) {
      console.error("GET Notifications Error:", error)
      throw new Error(error.message)
    }

    let notifications = rawNotifications || []

    // Strict Filter for KARYAWAN: Only see notifications from fellow Karyawan inputs
    if (userRole === "KARYAWAN") {
      const knownStaff = ["karyawan", "reza", "ummu", "cheisa", "novi", "titis"]
      notifications = notifications.filter((n) => {
        const senderLower = (n.sender || "").toLowerCase().trim()
        const isFromKaryawan =
          knownStaff.some((staff) => senderLower.includes(staff)) ||
          n.recipient === "karyawan"
        const isNewReceipt = n.type === "NEW_RECEIPT"
        return isNewReceipt && isFromKaryawan
      })
    }

    const unreadCount = notifications.filter((n) => {
      if (n.isRead) return false
      const senderLower = (n.sender || "").toLowerCase()
      if (cleanUser && cleanUser !== "all" && senderLower.includes(cleanUser)) return false
      return true
    }).length

    const payload = {
      notifications,
      unreadCount,
    }

    notifCache.set(cacheKey, { data: payload, timestamp: now })

    const res = NextResponse.json(payload)
    res.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=15")
    return res
  } catch (error: any) {
    console.error("Notifications API Error:", error)
    return NextResponse.json({ notifications: [], unreadCount: 0 }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const userRole = getAdminRoleFromRequest(req)
    const cleanUser = (adminUser || "all").trim().toLowerCase() || "all"
    const { id, markAllRead } = await req.json()

    invalidateNotificationsCache()

    if (markAllRead) {
      if (userRole === "KARYAWAN") {
        await supabase
          .from("notifications")
          .update({ isRead: true })
          .or(`recipient.eq.karyawan,recipient.eq.all,recipient.eq.${cleanUser},recipient.eq.*`)
      } else {
        await supabase
          .from("notifications")
          .update({ isRead: true })
          .or(`recipient.eq.${cleanUser},recipient.eq.admin,recipient.eq.all,recipient.eq.*`)
      }
    } else if (id) {
      await supabase
        .from("notifications")
        .update({ isRead: true })
        .eq("id", id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("PATCH Notification Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
