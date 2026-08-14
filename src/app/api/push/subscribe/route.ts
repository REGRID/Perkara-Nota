import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { VAPID_PUBLIC_KEY } from "@/lib/serverPush"

// GET: Returns VAPID Public Key for client-side subscription
export async function GET() {
  return NextResponse.json({
    publicKey: VAPID_PUBLIC_KEY,
  })
}

// POST: Register or update push subscription
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, username = "all", role = "ALL", userAgent = "" } = body

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { error: "Invalid subscription payload" },
        { status: 400 }
      )
    }

    const { endpoint, keys } = subscription
    const { p256dh, auth } = keys

    if (!p256dh || !auth) {
      return NextResponse.json(
        { error: "Missing p256dh or auth keys" },
        { status: 400 }
      )
    }

    // Upsert into push_subscriptions
    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          username: username.toLowerCase(),
          role: role.toUpperCase(),
          userAgent: userAgent || req.headers.get("user-agent") || "",
          updatedAt: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      )
      .select()

    if (error) {
      console.error("[API push/subscribe error]:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error("[API push/subscribe catch]:", err)
    return NextResponse.json({ error: err.message || "Internal Error" }, { status: 500 })
  }
}
