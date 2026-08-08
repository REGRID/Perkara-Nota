import { db } from "@/lib/db"

export const DEFAULT_ADMINS = [
  { username: "rama", defaultPass: "adminnota123" },
  { username: "refo", defaultPass: "adminnota456" },
]

/**
 * Validate admin credentials for a given username and password.
 * Checks DB custom password first, then falls back to DEFAULT_ADMINS and .env credentials.
 */
export async function validateAdminCredentials(username: string, inputPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = inputPass.trim()

    if (!cleanUser || !cleanPass) return false

    // 1. Check DB custom password if updated via Settings
    let dbAccount: any = null
    try {
      dbAccount = await (db as any).adminAccount.findFirst({
        where: { username: cleanUser },
      })
    } catch (e) {
      console.warn("DB adminAccount check fallback:", e)
    }

    if (dbAccount && dbAccount.password) {
      if (cleanPass === dbAccount.password.trim()) {
        return true
      }
    }

    // 2. Check DEFAULT_ADMINS
    const defaultItem = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (defaultItem && cleanPass === defaultItem.defaultPass) {
      return true
    }

    // 3. Check env variables
    const envUserA = (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()
    const envPassA = (process.env.ADMIN_A_PASSWORD || "adminnota123").trim()

    const envUserB = (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()
    const envPassB = (process.env.ADMIN_B_PASSWORD || "adminnota456").trim()

    if (cleanUser === envUserA && cleanPass === envPassA) return true
    if (cleanUser === envUserB && cleanPass === envPassB) return true

    return false
  } catch (error) {
    console.error("validateAdminCredentials error:", error)
    return false
  }
}

/**
 * Fetch active password for a given admin username (rama / refo).
 * Returns null if username is unknown.
 */
export async function getAdminPassword(username: string): Promise<string | null> {
  try {
    const cleanUser = username.trim().toLowerCase()

    let dbAccount: any = null
    try {
      dbAccount = await (db as any).adminAccount.findFirst({
        where: { username: cleanUser },
      })
    } catch (e) {
      // fallback
    }

    if (dbAccount && dbAccount.password) {
      return dbAccount.password
    }

    const defaultItem = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (defaultItem) {
      return defaultItem.defaultPass
    }

    if (cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
      return (process.env.ADMIN_A_PASSWORD || "adminnota123").trim()
    }
    if (cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
      return (process.env.ADMIN_B_PASSWORD || "adminnota456").trim()
    }

    return null
  } catch (error) {
    console.error("getAdminPassword error:", error)
    return null
  }
}

/**
 * Update password for a given admin username (rama / refo / admin)
 */
export async function updateAdminPassword(username: string, newPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = newPass.trim()

    const existing = await (db as any).adminAccount.findFirst({
      where: { username: cleanUser },
    })

    if (existing) {
      await (db as any).adminAccount.update({
        where: { id: existing.id },
        data: { password: cleanPass },
      })
    } else {
      await (db as any).adminAccount.create({
        data: {
          username: cleanUser,
          password: cleanPass,
        },
      })
    }

    return true
  } catch (error) {
    console.error("updateAdminPassword error:", error)
    return false
  }
}
