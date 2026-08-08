import { db } from "@/lib/db"

export const DEFAULT_ADMINS = [
  { username: "rama", defaultPass: "adminnota123" },
  { username: "refo", defaultPass: "adminnota456" },
  { username: "admin", defaultPass: "adminnota123" },
]

/**
 * Fetch active password for a given admin username (rama / refo / admin).
 * Returns null if username is unknown.
 */
export async function getAdminPassword(username: string): Promise<string | null> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const dbAccount = await (db as any).adminAccount.findFirst({
      where: { username: cleanUser },
    })

    if (dbAccount && dbAccount.password) {
      return dbAccount.password
    }

    const defaultItem = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (defaultItem) {
      return defaultItem.defaultPass
    }

    if (cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
      return process.env.ADMIN_A_PASSWORD || "adminnota123"
    }
    if (cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
      return process.env.ADMIN_B_PASSWORD || "adminnota456"
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
