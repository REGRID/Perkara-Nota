import { supabase } from "@/lib/supabase"
import fs from "fs"
import path from "path"

export const DEFAULT_ADMINS = [
  { username: "rama", defaultPass: process.env.ADMIN_A_PASSWORD || "", role: "ADMIN" },
  { username: "admin1", defaultPass: process.env.ADMIN_A_PASSWORD || "", role: "ADMIN" },
  { username: "refo", defaultPass: process.env.ADMIN_B_PASSWORD || "", role: "ADMIN" },
  { username: "admin2", defaultPass: process.env.ADMIN_B_PASSWORD || "", role: "ADMIN" },
  { username: "karyawan", defaultPass: process.env.KARYAWAN_PASSWORD || "", role: "KARYAWAN" },
]

export function normalizeAdminUsername(input: string): string {
  const clean = (input || "").trim().toLowerCase()
  if (clean === "admin 1" || clean === "admin1" || clean === "admin_1" || clean === "admin 1 (rama)") return "rama"
  if (clean === "admin 2" || clean === "admin2" || clean === "admin_2" || clean === "admin 2 (refo)") return "refo"
  return clean
}

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

    if (cleanUser === "rama" || cleanUser === "admin1" || cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
      process.env.ADMIN_A_PASSWORD = newPass
    }
    if (cleanUser === "refo" || cleanUser === "admin2" || cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
      process.env.ADMIN_B_PASSWORD = newPass
    }

    const envPath = path.join(process.cwd(), ".env.local")
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, "utf-8")
      if (cleanUser === "rama" || cleanUser === "admin1" || cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
        content = content.replace(/ADMIN_A_PASSWORD=["'][^"']*["']/g, `ADMIN_A_PASSWORD="${newPass}"`)
        content = content.replace(/ADMIN_A_PASSWORD=[^\r\n]+/g, `ADMIN_A_PASSWORD="${newPass}"`)
      }
      if (cleanUser === "refo" || cleanUser === "admin2" || cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
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
 * Fetch active password for a given admin username (rama / refo / admin1 / admin2).
 * Supabase `admin_accounts` table is the PRIMARY source of truth.
 */
export async function getAdminPassword(username: string): Promise<string | null> {
  try {
    const cleanUser = normalizeAdminUsername(username)

    // 1. Primary: Check Supabase Database Table `admin_accounts`
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
      console.warn("Supabase admin_accounts query notice:", e)
    }

    // 2. Secondary: Check Local Memory / Persistent JSON file
    const localPasses = getLocalPasswords()
    if (localPasses[cleanUser]) {
      return localPasses[cleanUser].trim()
    }

    // 3. Fallback: Default Credentials / Environment Variables
    const defaultItem = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (defaultItem && defaultItem.defaultPass) {
      return defaultItem.defaultPass.trim()
    }

    if (cleanUser === (process.env.ADMIN_A_USERNAME || "rama").toLowerCase()) {
      return (process.env.ADMIN_A_PASSWORD || "").trim()
    }
    if (cleanUser === (process.env.ADMIN_B_USERNAME || "refo").toLowerCase()) {
      return (process.env.ADMIN_B_PASSWORD || "").trim()
    }
    if (cleanUser === (process.env.KARYAWAN_USERNAME || "karyawan").toLowerCase()) {
      return (process.env.KARYAWAN_PASSWORD || "").trim()
    }

    return null
  } catch (error) {
    console.error("getAdminPassword error:", error)
    return null
  }
}

/**
 * Validate admin credentials for a given username and password.
 */
export async function validateAdminCredentials(username: string, inputPass: string): Promise<boolean> {
  try {
    const cleanUser = normalizeAdminUsername(username)
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
 * Fetch full account details including role and password
 */
export async function getUserAccountDetails(username: string): Promise<{ username: string; role: string; password?: string } | null> {
  try {
    const cleanUser = normalizeAdminUsername(username)
    const { data: dbAccount } = await supabase
      .from("admin_accounts")
      .select("username, password, role")
      .eq("username", cleanUser)
      .maybeSingle()

    if (dbAccount) {
      return {
        username: dbAccount.username,
        password: dbAccount.password,
        role: dbAccount.role || (cleanUser === "karyawan" ? "KARYAWAN" : "ADMIN"),
      }
    }

    if (cleanUser === "karyawan") {
      const pass = process.env.KARYAWAN_PASSWORD || (await getAdminPassword("karyawan")) || ""
      return { username: "karyawan", password: pass, role: "KARYAWAN" }
    }

    const pass = await getAdminPassword(cleanUser)
    if (pass) {
      return { username: cleanUser, password: pass, role: "ADMIN" }
    }

    return null
  } catch (e) {
    console.error("getUserAccountDetails error:", e)
    return null
  }
}

/**
 * Update password for a given admin username (rama / refo).
 * Writes directly to Supabase DB `admin_accounts` table as primary, and updates local fallbacks.
 */
export async function updateAdminPassword(username: string, newPass: string): Promise<boolean> {
  try {
    const cleanUser = normalizeAdminUsername(username)
    const cleanPass = newPass.trim()

    if (!cleanUser || !cleanPass) return false

    // 1. Primary: Update or Insert into Supabase `admin_accounts` table
    try {
      const { data: existing } = await supabase
        .from("admin_accounts")
        .select("id")
        .eq("username", cleanUser)
        .maybeSingle()

      if (existing) {
        await supabase
          .from("admin_accounts")
          .update({
            password: cleanPass,
            updatedAt: new Date().toISOString(),
          })
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
      console.warn("Supabase admin_accounts update warning:", dbErr)
    }

    // 2. Secondary: Update local in-memory & file fallbacks
    const def = DEFAULT_ADMINS.find((a) => a.username === cleanUser)
    if (def) {
      def.defaultPass = cleanPass
    }

    setLocalPassword(cleanUser, cleanPass)
    updateEnvFilePassword(cleanUser, cleanPass)

    return true
  } catch (error) {
    console.error("updateAdminPassword error:", error)
    return true
  }
}
