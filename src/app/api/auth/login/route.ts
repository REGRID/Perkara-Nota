import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    const expectedUsername = process.env.ADMIN_USERNAME || "admin"
    const expectedPassword = process.env.ADMIN_PASSWORD || "adminnota123"

    const cleanUsername = (username || "").trim()
    const cleanPassword = (password || "").trim()

    if (!cleanUsername || !cleanPassword) {
      return NextResponse.json({ error: "ID Admin dan Password harus diisi" }, { status: 400 })
    }

    if (cleanUsername !== expectedUsername || cleanPassword !== expectedPassword) {
      return NextResponse.json({ error: "ID Admin atau Password salah. Akses ditolak." }, { status: 401 })
    }

    // Auth Token generated based on expected credentials hash / timestamp
    const tokenPayload = Buffer.from(`${expectedUsername}:${expectedPassword}:nota_session_secret`).toString("base64")

    const response = NextResponse.json({
      success: true,
      message: "Login Admin berhasil",
      user: { username: expectedUsername },
      token: tokenPayload,
    })

    // Set secure HTTP-only Cookie for seamless PWA & browser session persistence
    response.cookies.set({
      name: "nota_admin_session",
      value: tokenPayload,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days session
    })

    return response
  } catch (error: any) {
    console.error("Login API Error:", error)
    return NextResponse.json({ error: "Terjadi kesalahan server saat login" }, { status: 500 })
  }
}
