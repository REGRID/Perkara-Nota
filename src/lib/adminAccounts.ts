import { db } from "@/lib/db"
import fs from "fs"
import path from "path"

export const DEFAULT_ADMINS = [
  { username: "rama", defaultPass: "adminnota123" },
  { username: "refo", defaultPass: "adminnota456" },
]

const LOCAL_PASSWORDS_FILE = path.join(process.cwd(), "admin_passwords.json")
const IN_MEMORY_PASSWORDS = new Map<string, string>()

function getLocalPasswords(): Record<string, string> {
  const result: Record<string, string> = {}

  try {
    if (fs.existsSync(LOCAL_PASSWORDS_FILE)) {
      const data = fs.readFileSync(LOCAL_PASSWORDS_FILE, "utf-8")
      const parsed = JSON.parse(data) || {}
      Object.assign(result, parsed)
    }
  } catch (e) {
    console.warn("Could not read local admin_passwords.json:", e)
  }

  IN_MEMORY_PASSWORDS.forEach((val, key) => {
    result[key] = val
  })

  return result
}

function setLocalPassword(username: string, pass: string): boolean {
  const cleanKey = username.toLowerCase()
  IN_MEMORY_PASSWORDS.set(cleanKey, pass)

  try {
    const current = getLocalPasswords()
    current[cleanKey] = pass
    fs.writeFileSync(LOCAL_PASSWORDS_FILE, JSON.stringify(current, null, 2), "utf-8")
  } catch (e) {
    console.warn("Could not write to admin_passwords.json, saved in memory:", e)
  }
  return true
}

/**
 * Fetch active single password for a given admin username (rama / refo).
 * Returns custom changed password if exists, or default credential.
 * Returns null if username is unknown.
 */
export async function getAdminPassword(username: string): Promise<string | null> {
  try {
    const cleanUser = username.trim().toLowerCase()

    // 1. Check Local Persistent / Memory File
    const localPasses = getLocalPasswords()
    if (localPasses[cleanUser]) {
      return localPasses[cleanUser].trim()
    }

    // 2. Check Database Table
    try {
      const dbAccount = await (db as any).adminAccount.findFirst({
        where: { username: cleanUser },
      })
      if (dbAccount && dbAccount.password) {
        return dbAccount.password.trim()
      }
    } catch (e) {
      // fallback if table query error
    }

    // 3. Fallback to DEFAULT_ADMINS if not customized yet
    const defaultItem = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (defaultItem) {
      return defaultItem.defaultPass.trim()
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
 * Validate admin credentials for a given username and password.
 * Strictly compares against the single active password for the ID.
 */
export async function validateAdminCredentials(username: string, inputPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = inputPass.trim()

    if (!cleanUser || !cleanPass) return false

    const activePassword = await getAdminPassword(cleanUser)

    if (!activePassword) return false

    return cleanPass === activePassword
  } catch (error) {
    console.error("validateAdminCredentials error:", error)
    return false
  }
}

/**
 * Update password for a given admin username (rama / refo).
 * Saves to memory + local persistent JSON file AND attempts DB sync.
 */
export async function updateAdminPassword(username: string, newPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = newPass.trim()

    if (!cleanUser || !cleanPass) return false

    // 1. Always save to local storage & in-memory map first
    setLocalPassword(cleanUser, cleanPass)

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

    return true
  } catch (error) {
    console.error("updateAdminPassword error:", error)
    return true
  }
}
