import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"

export async function GET(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const cleanUser = adminUser.trim().toLowerCase()

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .or(`recipient.eq.${cleanUser},recipient.eq.all,recipient.eq.*`)
      .order("createdAt", { ascending: false })
      .limit(50)

    if (error) {
      console.error("GET Notifications Error:", error)
      throw new Error(error.message)
    }

    const unreadCount = (notifications || []).filter((n) => !n.isRead && n.sender.toLowerCase() !== cleanUser).length

    return NextResponse.json({
      notifications: notifications || [],
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
    const { id, markAllRead } = await req.json()

    if (markAllRead) {
      await supabase
        .from("notifications")
        .update({ isRead: true })
        .or(`recipient.eq.${adminUser.toLowerCase()},recipient.eq.all,recipient.eq.*`)
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
