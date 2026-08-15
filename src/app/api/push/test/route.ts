import { NextRequest, NextResponse } from "next/server"
import { sendWebPushNotification } from "@/lib/serverPush"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      title = "Pengujian Notifikasi HP (Background Push)",
      message = "Notifikasi berhasil masuk ke HP meskipun aplikasi dalam keadaan tertutup!",
      url = "/",
      delaySeconds = 0,
    } = body

    if (delaySeconds > 0) {
      // Delay execution in background
      setTimeout(async () => {
        await sendWebPushNotification({
          title,
          message,
          url,
          tag: `test-push-${Date.now()}`,
        })
      }, delaySeconds * 1000)

      return NextResponse.json({
        success: true,
        delayed: true,
        message: `Notifikasi push dijadwalkan dalam ${delaySeconds} detik. Silakan kunci layar HP atau tutup aplikasi sekarang untuk menguji!`,
      })
    }

    const result = await sendWebPushNotification({
      title,
      message,
      url,
      tag: `test-push-${Date.now()}`,
    })

    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    console.error("[API push/test error]:", err)
    return NextResponse.json({ error: err.message || "Internal Error" }, { status: 500 })
  }
}
