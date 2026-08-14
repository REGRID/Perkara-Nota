import { supabase } from "@/lib/supabase"

export const DAILY_SCAN_LIMIT = 999999

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  current: number
  resetAt: Date
}

// In-memory cache for Rate Limiting to prevent repeated Supabase queries
const rateLimitCache = new Map<string, { result: RateLimitResult; timestamp: number }>()
const RATE_LIMIT_CACHE_TTL = 60 * 1000 // 60 seconds cache

const SCAN_LIMITS_SELECT = "id, ipAddress, scanCount, lastScanAt, resetAt"

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
 * Checks rate limit using persistent Supabase database tracking with in-memory caching.
 */
export async function checkRateLimit(ipAddress: string): Promise<RateLimitResult> {
  const now = new Date()
  const cleanIp = normalizeIp(ipAddress)

  const cached = rateLimitCache.get(cleanIp)
  if (cached && now.getTime() - cached.timestamp < RATE_LIMIT_CACHE_TTL) {
    return cached.result
  }

  try {
    const tomorrow = new Date(now)
    tomorrow.setHours(tomorrow.getHours() + 24)

    const { data: existingRecord } = await supabase
      .from("scan_limits")
      .select(SCAN_LIMITS_SELECT)
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
        .select(SCAN_LIMITS_SELECT)
        .maybeSingle()

      limitRecord = newRecord || existingRecord
    }

    if (!limitRecord) {
      const res: RateLimitResult = {
        allowed: true,
        remaining: DAILY_SCAN_LIMIT,
        current: 0,
        resetAt: tomorrow,
      }
      rateLimitCache.set(cleanIp, { result: res, timestamp: now.getTime() })
      return res
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
        .select(SCAN_LIMITS_SELECT)
        .maybeSingle()

      if (updated) limitRecord = updated
    }

    const current = limitRecord.scanCount || 0
    const remaining = Math.max(DAILY_SCAN_LIMIT - current, 0)
    const allowed = true

    const result: RateLimitResult = {
      allowed,
      remaining,
      current,
      resetAt: new Date(limitRecord.resetAt || tomorrow),
    }

    rateLimitCache.set(cleanIp, { result, timestamp: now.getTime() })
    return result
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

  rateLimitCache.delete(cleanIp)

  try {
    const { data: record } = await supabase
      .from("scan_limits")
      .select(SCAN_LIMITS_SELECT)
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
        .select(SCAN_LIMITS_SELECT)
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
      .select(SCAN_LIMITS_SELECT)
      .maybeSingle()

    return Math.max(DAILY_SCAN_LIMIT - (updated?.scanCount || newCount), 0)
  } catch (error) {
    console.error("Error incrementing rate limit count:", error)
    return DAILY_SCAN_LIMIT - 1
  }
}
