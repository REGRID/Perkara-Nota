import { db } from "@/lib/db"
import fs from "fs"
import path from "path"

export const DEFAULT_ADMINS = [
  { username: "rama", defaultPass: "adminnota123" },
  { username: "refo", defaultPass: "adminnota456" },
]

const LOCAL_PASSWORDS_FILE = path.join(process.cwd(), "admin_passwords.json")

function getLocalPasswords(): Record<string, string> {
  try {
    if (fs.existsSync(LOCAL_PASSWORDS_FILE)) {
      const data = fs.readFileSync(LOCAL_PASSWORDS_FILE, "utf-8")
      return JSON.parse(data) || {}
    }
  } catch (e) {
    console.warn("Could not read local admin_passwords.json:", e)
  }
  return {}
}

function setLocalPassword(username: string, pass: string): boolean {
  try {
    const current = getLocalPasswords()
    current[username.toLowerCase()] = pass
    fs.writeFileSync(LOCAL_PASSWORDS_FILE, JSON.stringify(current, null, 2), "utf-8")
    return true
  } catch (e) {
    console.error("Could not write to admin_passwords.json:", e)
    return false
  }
}

/**
 * Validate admin credentials for a given username and password.
 * Checks local file, DB custom password, DEFAULT_ADMINS, and .env credentials.
 */
export async function validateAdminCredentials(username: string, inputPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = inputPass.trim()

    if (!cleanUser || !cleanPass) return false

    // 1. Check Local File Passwords
    const localPasses = getLocalPasswords()
    if (localPasses[cleanUser]) {
      if (cleanPass === localPasses[cleanUser].trim()) {
        return true
      }
    }

    // 2. Check DB custom password if updated via Settings
    try {
      const dbAccount = await (db as any).adminAccount.findFirst({
        where: { username: cleanUser },
      })
      if (dbAccount && dbAccount.password) {
        if (cleanPass === dbAccount.password.trim()) {
          return true
        }
      }
    } catch (e) {
      // DB table not pushed yet or query error
    }

    // 3. Check DEFAULT_ADMINS
    const defaultItem = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (defaultItem && cleanPass === defaultItem.defaultPass) {
      return true
    }

    // 4. Check env variables
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

    // 1. Check Local File
    const localPasses = getLocalPasswords()
    if (localPasses[cleanUser]) {
      return localPasses[cleanUser]
    }

    // 2. Check DB
    try {
      const dbAccount = await (db as any).adminAccount.findFirst({
        where: { username: cleanUser },
      })
      if (dbAccount && dbAccount.password) {
        return dbAccount.password
      }
    } catch (e) {
      // fallback
    }

    // 3. Check Defaults
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
 * Update password for a given admin username (rama / refo).
 * Saves to local persistent JSON file AND attempts DB sync.
 */
export async function updateAdminPassword(username: string, newPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = newPass.trim()

    if (!cleanUser || !cleanPass) return false

    // 1. Always save to local JSON file first to guarantee instant success
    const fileSaved = setLocalPassword(cleanUser, cleanPass)

    // 2. Attempt DB sync if table exists
    try {
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
    } catch (dbErr) {
      console.warn("DB password sync notice (saved to local persistent file):", dbErr)
    }

    return fileSaved
  } catch (error) {
    console.error("updateAdminPassword error:", error)
    return false
  }
}
