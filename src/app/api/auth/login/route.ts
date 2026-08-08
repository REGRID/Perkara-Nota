import { NextRequest, NextResponse } from "next/server"
import { validateAdminCredentials } from "@/lib/adminAccounts"

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    const cleanUsername = (username || "").trim().toLowerCase()
    const cleanPassword = (password || "").trim()

    if (!cleanUsername || !cleanPassword) {
      return NextResponse.json({ error: "ID Admin dan Password harus diisi" }, { status: 400 })
    }

    const isValid = await validateAdminCredentials(cleanUsername, cleanPassword)

    if (!isValid) {
      return NextResponse.json({ error: "ID Admin atau Password salah. Akses ditolak." }, { status: 401 })
    }

    const authenticatedUser = cleanUsername

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
