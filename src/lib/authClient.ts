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

    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    if (user) {
      headers["x-admin-user"] = user
    }
  }

  return headers
}
