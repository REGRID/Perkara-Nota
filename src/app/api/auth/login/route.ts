import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    const cleanUsername = (username || "").trim()
    const cleanPassword = (password || "").trim()

    if (!cleanUsername || !cleanPassword) {
      return NextResponse.json({ error: "ID Admin dan Password harus diisi" }, { status: 400 })
    }

    const adminAUser = process.env.ADMIN_A_USERNAME || "admin1"
    const adminAPass = process.env.ADMIN_A_PASSWORD || "adminnota123"

    const adminBUser = process.env.ADMIN_B_USERNAME || "admin2"
    const adminBPass = process.env.ADMIN_B_PASSWORD || "adminnota456"

    const legacyUser = process.env.ADMIN_USERNAME || "admin"
    const legacyPass = process.env.ADMIN_PASSWORD || "adminnota123"

    let authenticatedUser: string | null = null

    if (cleanUsername === adminAUser && cleanPassword === adminAPass) {
      authenticatedUser = adminAUser
    } else if (cleanUsername === adminBUser && cleanPassword === adminBPass) {
      authenticatedUser = adminBUser
    } else if (cleanUsername === legacyUser && cleanPassword === legacyPass) {
      authenticatedUser = legacyUser
    }

    if (!authenticatedUser) {
      return NextResponse.json({ error: "ID Admin atau Password salah. Akses ditolak." }, { status: 401 })
    }

    // Auth Token encoded with actual authenticated username
    const tokenPayload = Buffer.from(`${authenticatedUser}:${cleanPassword}:nota_session_secret`).toString("base64")

    const response = NextResponse.json({
      success: true,
      message: `Login Admin (${authenticatedUser}) berhasil`,
      user: { username: authenticatedUser },
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
