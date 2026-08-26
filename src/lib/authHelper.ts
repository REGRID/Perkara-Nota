import { NextRequest } from "next/server"

export function getAdminUserFromRequest(req: NextRequest): string {
  const customUserHeader = req.headers.get("x-admin-user")
  if (customUserHeader && customUserHeader.trim()) {
    const u = customUserHeader.trim().toLowerCase()
    return u === "admin1" ? "rama" : u === "admin2" ? "refo" : u
  }

  const sessionCookie = req.cookies.get("nota_admin_session")?.value
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
  const currentToken = sessionCookie || authHeader

  if (!currentToken) return ""

  try {
    const decoded = Buffer.from(currentToken, "base64").toString("utf-8")
    const parts = decoded.split(":")
    if (parts.length >= 1 && parts[0] && parts[0].trim()) {
      const u = parts[0].trim().toLowerCase()
      return u === "admin1" ? "rama" : u === "admin2" ? "refo" : u
    }
  } catch (err) {
    // Ignore error
  }

  return ""
}

export function getAdminRoleFromRequest(req: NextRequest): string {
  const customRoleHeader = req.headers.get("x-admin-role")
  if (customRoleHeader && customRoleHeader.trim()) {
    return customRoleHeader.trim().toUpperCase()
  }

  const user = getAdminUserFromRequest(req)
  if (user === "karyawan") return "KARYAWAN"
  if (user === "rama" || user === "refo" || user === "admin1" || user === "admin2" || user === "admin") return "ADMIN"

  return user ? "ADMIN" : "KARYAWAN"
}

export function getStaffNameFromRequest(req: NextRequest): string {
  const staffHeader = req.headers.get("x-staff-name")
  if (staffHeader && staffHeader.trim()) {
    return staffHeader.trim()
  }

  const staffCookie = req.cookies.get("nota_staff_name")?.value
  if (staffCookie && staffCookie.trim()) {
    return staffCookie.trim()
  }

  return ""
}
