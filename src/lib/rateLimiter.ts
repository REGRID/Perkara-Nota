import { supabase } from "@/lib/supabase"

export const DAILY_SCAN_LIMIT = 999999

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  current: number
  resetAt: Date
}

/**
 * Normalizes IP address strings (e.g. ::1, ::ffff:127.0.0.1, 127.0.0.1) to unified keys
 */
export function normalizeIp(ipAddress?: string | null): string {
  if (!ipAddress) return "127.0.0.1"
  let clean = ipAddress.trim()
  if (clean === "::1" || clean === "::ffff:127.0.0.1" || clean === "localhost") {
    return "127.0.0.1"
  }
  if (clean.startsWith("::ffff:")) {
    clean = clean.replace("::ffff:", "")
  }
  return clean
}

/**
 * Checks rate limit using persistent Supabase database tracking.
 */
export async function checkRateLimit(ipAddress: string): Promise<RateLimitResult> {
  const now = new Date()
  const cleanIp = normalizeIp(ipAddress)

  try {
    const tomorrow = new Date(now)
    tomorrow.setHours(tomorrow.getHours() + 24)

    const { data: existingRecord } = await supabase
      .from("scan_limits")
      .select("*")
      .eq("ipAddress", cleanIp)
      .maybeSingle()

    let limitRecord = existingRecord

    if (!limitRecord) {
      const { data: newRecord } = await supabase
        .from("scan_limits")
        .insert({
          ipAddress: cleanIp,
          scanCount: 0,
          lastScanAt: now.toISOString(),
          resetAt: tomorrow.toISOString(),
        })
        .select("*")
        .maybeSingle()

      limitRecord = newRecord || existingRecord
    }

    if (!limitRecord) {
      return {
        allowed: true,
        remaining: DAILY_SCAN_LIMIT,
        current: 0,
        resetAt: tomorrow,
      }
    }

    const resetAtDate = new Date(limitRecord.resetAt)

    // Reset daily counter if 24 hours elapsed
    if (now > resetAtDate) {
      const nextReset = new Date(now)
      nextReset.setHours(nextReset.getHours() + 24)

      const { data: updated } = await supabase
        .from("scan_limits")
        .update({
          scanCount: 0,
          resetAt: nextReset.toISOString(),
        })
        .eq("id", limitRecord.id)
        .select("*")
        .maybeSingle()

      if (updated) limitRecord = updated
    }

    const current = limitRecord.scanCount || 0
    const remaining = Math.max(DAILY_SCAN_LIMIT - current, 0)
    const allowed = true

    return {
      allowed,
      remaining,
      current,
      resetAt: new Date(limitRecord.resetAt || tomorrow),
    }
  } catch (error) {
    console.error("Rate limiter DB error:", error)
    return {
      allowed: true,
      remaining: DAILY_SCAN_LIMIT,
      current: 0,
      resetAt: new Date(now.getTime() + 86400000),
    }
  }
}

/**
 * Atomically increments the scan count in Supabase for the normalized IP.
 */
export async function incrementRateLimit(ipAddress: string): Promise<number> {
  const cleanIp = normalizeIp(ipAddress)
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86400000)

  try {
    const { data: record } = await supabase
      .from("scan_limits")
      .select("*")
      .eq("ipAddress", cleanIp)
      .maybeSingle()

    if (!record) {
      const { data: created } = await supabase
        .from("scan_limits")
        .insert({
          ipAddress: cleanIp,
          scanCount: 1,
          lastScanAt: now.toISOString(),
          resetAt: tomorrow.toISOString(),
        })
        .select("*")
        .maybeSingle()

      return Math.max(DAILY_SCAN_LIMIT - (created?.scanCount || 1), 0)
    }

    const newCount = (record.scanCount || 0) + 1
    const { data: updated } = await supabase
      .from("scan_limits")
      .update({
        scanCount: newCount,
        lastScanAt: now.toISOString(),
      })
      .eq("id", record.id)
      .select("*")
      .maybeSingle()

    return Math.max(DAILY_SCAN_LIMIT - (updated?.scanCount || newCount), 0)
  } catch (error) {
    console.error("Error incrementing rate limit count:", error)
    return DAILY_SCAN_LIMIT - 1
  }
}
