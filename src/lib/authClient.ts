/**
 * Client-side Authentication Header Helper
 * Automatically extracts the stored session token & username from localStorage
 * to ensure all API requests properly transmit current admin credentials.
 */
export function getAuthHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...additionalHeaders,
  }

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("nota_admin_token")
    const user = localStorage.getItem("nota_admin_user")
    const role = localStorage.getItem("nota_admin_role")
    const staffName = localStorage.getItem("nota_staff_name")

    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    if (user) {
      headers["x-admin-user"] = user
    }
    if (role) {
      headers["x-admin-role"] = role
    }
    if (staffName) {
      headers["x-staff-name"] = staffName
    }
  }

  return headers
}
