import { NextRequest, NextResponse } from "next/server"
import { validateAdminCredentials } from "@/lib/adminAccounts"

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

    const username = (parts[0] || "").trim().toLowerCase()
    const password = (parts[1] || "").trim()

    const isValid = await validateAdminCredentials(username, password)

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
