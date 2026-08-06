import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, DAILY_SCAN_LIMIT, normalizeIp } from "@/lib/rateLimiter"

export async function GET(req: NextRequest) {
  try {
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1"

    const cleanIp = normalizeIp(rawIp)
    const rateLimit = await checkRateLimit(cleanIp)

    const res = NextResponse.json({
      dailyLimit: DAILY_SCAN_LIMIT,
      used: rateLimit.current,
      remaining: rateLimit.remaining,
      allowed: rateLimit.allowed,
      resetAt: rateLimit.resetAt,
      ip: cleanIp,
    })

    // Disable browser HTTP caching so quota is 100% real-time on every refresh
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    return res
  } catch (error: any) {
    return NextResponse.json({
      dailyLimit: DAILY_SCAN_LIMIT,
      used: 0,
      remaining: DAILY_SCAN_LIMIT,
      allowed: true,
    })
  }
}
