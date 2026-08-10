import { NextRequest } from "next/server"

export function getAdminUserFromRequest(req: NextRequest): string {
  const customUserHeader = req.headers.get("x-admin-user")
  if (customUserHeader && customUserHeader.trim()) {
    return customUserHeader.trim().toLowerCase()
  }

  const sessionCookie = req.cookies.get("nota_admin_session")?.value
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
  const currentToken = sessionCookie || authHeader

  if (!currentToken) return "admin"

  try {
    const decoded = Buffer.from(currentToken, "base64").toString("utf-8")
    const parts = decoded.split(":")
    if (parts.length >= 1 && parts[0] && parts[0].trim()) {
      return parts[0].trim().toLowerCase()
    }
  } catch (err) {
    // Ignore error
  }

  return "admin"
}

export function getAdminRoleFromRequest(req: NextRequest): string {
  const customRoleHeader = req.headers.get("x-admin-role")
  if (customRoleHeader && customRoleHeader.trim()) {
    return customRoleHeader.trim().toUpperCase()
  }

  const user = getAdminUserFromRequest(req)
  if (user === "karyawan") return "KARYAWAN"

  return "ADMIN"
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
