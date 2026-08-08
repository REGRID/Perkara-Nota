import { db } from "@/lib/db"

export const DAILY_SCAN_LIMIT = 500

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
 * Checks rate limit using persistent database tracking.
 * Normalizes IP and tracks daily usage window reliably across page refreshes.
 */
export async function checkRateLimit(ipAddress: string): Promise<RateLimitResult> {
  const now = new Date()
  const cleanIp = normalizeIp(ipAddress)

  try {
    const tomorrow = new Date(now)
    tomorrow.setHours(tomorrow.getHours() + 24)

    let limitRecord = await db.scanLimit.findFirst({
      where: { ipAddress: cleanIp },
    })

    if (!limitRecord) {
      try {
        limitRecord = await db.scanLimit.create({
          data: {
            ipAddress: cleanIp,
            scanCount: 0,
            lastScanAt: now,
            resetAt: tomorrow,
          },
        })
      } catch (createErr) {
        // Race condition: another request created the record concurrently
        limitRecord = await db.scanLimit.findFirst({
          where: { ipAddress: cleanIp },
        })
      }
    }

    if (!limitRecord) {
      return {
        allowed: true,
        remaining: DAILY_SCAN_LIMIT,
        current: 0,
        resetAt: tomorrow,
      }
    }

    // Reset daily counter if 24 hours elapsed
    if (now > limitRecord.resetAt) {
      const nextReset = new Date(now)
      nextReset.setHours(nextReset.getHours() + 24)

      limitRecord = await db.scanLimit.update({
        where: { id: limitRecord.id },
        data: {
          scanCount: 0,
          resetAt: nextReset,
        },
      })
    }

    const current = limitRecord.scanCount
    const remaining = Math.max(DAILY_SCAN_LIMIT - current, 0)
    const allowed = current < DAILY_SCAN_LIMIT

    return {
      allowed,
      remaining,
      current,
      resetAt: limitRecord.resetAt,
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
 * Atomically increments the scan count in the database for the normalized IP.
 */
export async function incrementRateLimit(ipAddress: string): Promise<number> {
  const cleanIp = normalizeIp(ipAddress)
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86400000)

  try {
    let record = await db.scanLimit.findFirst({
      where: { ipAddress: cleanIp },
    })

    if (!record) {
      try {
        record = await db.scanLimit.create({
          data: {
            ipAddress: cleanIp,
            scanCount: 1,
            lastScanAt: now,
            resetAt: tomorrow,
          },
        })
        return Math.max(DAILY_SCAN_LIMIT - record.scanCount, 0)
      } catch (err) {
        record = await db.scanLimit.findFirst({
          where: { ipAddress: cleanIp },
        })
      }
    }

    if (record) {
      const updated = await db.scanLimit.update({
        where: { id: record.id },
        data: {
          scanCount: { increment: 1 },
          lastScanAt: now,
        },
      })
      return Math.max(DAILY_SCAN_LIMIT - updated.scanCount, 0)
    }

    return DAILY_SCAN_LIMIT - 1
  } catch (error) {
    console.error("Error incrementing rate limit count:", error)
    return DAILY_SCAN_LIMIT - 1
  }
}
