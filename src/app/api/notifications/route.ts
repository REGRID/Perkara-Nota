import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest, getAdminRoleFromRequest } from "@/lib/authHelper"

export async function GET(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const userRole = getAdminRoleFromRequest(req)
    const cleanUser = (adminUser || "all").trim().toLowerCase() || "all"

    let query = supabase
      .from("notifications")
      .select("*")
      .order("createdAt", { ascending: false })
      .limit(50)

    if (userRole === "ADMIN") {
      query = query.or(`recipient.eq.${cleanUser},recipient.eq.admin,recipient.eq.all,recipient.eq.*`)
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
      notifications = notifications.filter((n) => {
        const senderLower = (n.sender || "").toLowerCase()
        const isFromKaryawan = senderLower.includes("karyawan") || n.recipient === "karyawan"
        const isNewReceipt = n.type === "NEW_RECEIPT"
        return isNewReceipt && isFromKaryawan
      })
    }

    const unreadCount = notifications.filter((n) => !n.isRead && n.sender.toLowerCase() !== cleanUser).length

    return NextResponse.json({
      notifications,
      unreadCount,
    })
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
