import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get("nota_admin_session")?.value
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
    const currentToken = sessionCookie || authHeader

    if (!currentToken) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const decoded = Buffer.from(currentToken, "base64").toString("utf-8")
    const parts = decoded.split(":")
    if (parts.length < 3 || parts[2] !== "nota_session_secret") {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const username = parts[0]
    const password = parts[1]

    const adminAUser = process.env.ADMIN_A_USERNAME || "admin1"
    const adminAPass = process.env.ADMIN_A_PASSWORD || "adminnota123"

    const adminBUser = process.env.ADMIN_B_USERNAME || "admin2"
    const adminBPass = process.env.ADMIN_B_PASSWORD || "adminnota456"

    const legacyUser = process.env.ADMIN_USERNAME || "admin"
    const legacyPass = process.env.ADMIN_PASSWORD || "adminnota123"

    let isValid = false
    if (username === adminAUser && password === adminAPass) isValid = true
    else if (username === adminBUser && password === adminBPass) isValid = true
    else if (username === legacyUser && password === legacyPass) isValid = true

    if (isValid) {
      return NextResponse.json({
        authenticated: true,
        user: { username },
      })
    }

    return NextResponse.json({ authenticated: false }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
