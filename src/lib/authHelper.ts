import { NextRequest } from "next/server"

export function getAdminUserFromRequest(req: NextRequest): string {
  let user = ""
  const customUserHeader = req.headers.get("x-admin-user")
  if (customUserHeader && customUserHeader.trim()) {
    user = customUserHeader.trim().toLowerCase()
  } else {
    const sessionCookie = req.cookies.get("nota_admin_session")?.value
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
    const currentToken = sessionCookie || authHeader

    if (currentToken) {
      try {
        const decoded = Buffer.from(currentToken, "base64").toString("utf-8")
        const parts = decoded.split(":")
        if (parts.length >= 1 && parts[0] && parts[0].trim()) {
          user = parts[0].trim().toLowerCase()
        }
      } catch (err) {
        // Ignore error
      }
    }
  }

  if (user === "admin 1" || user === "admin1" || user === "admin_1") return "rama"
  if (user === "admin 2" || user === "admin2" || user === "admin_2") return "refo"
  return user
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
