import { supabase } from "@/lib/supabase"
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
 * Programmatically rewrite .env.local file to ensure changed password remains default permanently
 */
function updateEnvFilePassword(username: string, newPass: string) {
  try {
    const cleanUser = username.trim().toLowerCase()

    // 1. Update running process env
    if (cleanUser === "rama" || cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
      process.env.ADMIN_A_PASSWORD = newPass
    }
    if (cleanUser === "refo" || cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
      process.env.ADMIN_B_PASSWORD = newPass
    }

    // 2. Rewrite .env.local file on disk
    const envPath = path.join(process.cwd(), ".env.local")
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf-8")
      if (cleanUser === "rama" || cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
        content = content.replace(/ADMIN_A_PASSWORD=["'][^"']*["']/g, `ADMIN_A_PASSWORD="${newPass}"`)
        content = content.replace(/ADMIN_A_PASSWORD=[^\r\n]+/g, `ADMIN_A_PASSWORD="${newPass}"`)
      }
      if (cleanUser === "refo" || cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
        content = content.replace(/ADMIN_B_PASSWORD=["'][^"']*["']/g, `ADMIN_B_PASSWORD="${newPass}"`)
        content = content.replace(/ADMIN_B_PASSWORD=[^\r\n]+/g, `ADMIN_B_PASSWORD="${newPass}"`)
      }
      fs.writeFileSync(envPath, content, "utf-8")
    }
  } catch (err) {
    console.warn("Could not update .env.local file:", err)
  }
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

    // 2. Check Supabase Database Table
    try {
      const { data: dbAccount } = await supabase
        .from("admin_accounts")
        .select("password")
        .eq("username", cleanUser)
        .maybeSingle()

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
 * Permanently updates local memory, .env.local file, admin_passwords.json, and Supabase DB.
 */
export async function updateAdminPassword(username: string, newPass: string): Promise<boolean> {
  try {
    const cleanUser = username.trim().toLowerCase()
    const cleanPass = newPass.trim()

    if (!cleanUser || !cleanPass) return false

    // 1. Update in-memory DEFAULT_ADMINS
    const def = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (def) {
      def.defaultPass = cleanPass
    }

    // 2. Save to local storage & in-memory map
    setLocalPassword(cleanUser, cleanPass)

    // 3. Update .env.local file & process.env on disk
    updateEnvFilePassword(cleanUser, cleanPass)

    // 4. Attempt Supabase DB sync
    try {
      const { data: existing } = await supabase
        .from("admin_accounts")
        .select("id")
        .eq("username", cleanUser)
        .maybeSingle()

      if (existing) {
        await supabase
          .from("admin_accounts")
          .update({ password: cleanPass, updatedAt: new Date().toISOString() })
          .eq("id", existing.id)
      } else {
        await supabase
          .from("admin_accounts")
          .insert({
            username: cleanUser,
            password: cleanPass,
          })
      }
    } catch (dbErr) {
      console.warn("DB password sync notice (saved to local persistent file and .env):", dbErr)
    }

    return true
  } catch (error) {
    console.error("updateAdminPassword error:", error)
    return true
  }
}
