import { NextRequest } from "next/server"

export function getAdminUserFromRequest(req: NextRequest): string {
  const sessionCookie = req.cookies.get("nota_admin_session")?.value
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
  const currentToken = sessionCookie || authHeader

  if (!currentToken) return "admin"

  try {
    const decoded = Buffer.from(currentToken, "base64").toString("utf-8")
    const parts = decoded.split(":")
    if (parts.length >= 1 && parts[0]) {
      return parts[0]
    }
  } catch (err) {
    // Ignore error
  }

  return "admin"
}
