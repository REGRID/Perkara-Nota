import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const expectedUsername = process.env.ADMIN_USERNAME || "admin"
    const expectedPassword = process.env.ADMIN_PASSWORD || "adminnota123"
    const expectedToken = Buffer.from(`${expectedUsername}:${expectedPassword}:nota_session_secret`).toString("base64")

    const sessionCookie = req.cookies.get("nota_admin_session")?.value
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")

    const currentToken = sessionCookie || authHeader

    if (currentToken === expectedToken) {
      return NextResponse.json({
        authenticated: true,
        user: { username: expectedUsername },
      })
    }

    return NextResponse.json({ authenticated: false }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
