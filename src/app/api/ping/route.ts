import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { db } from "@/lib/db"

/**
 * Ping / Keep-Alive API Endpoint for Supabase Database
 * Performs a lightweight, ultra-efficient query selecting only 1 column with limit(1)
 * to keep the Supabase database awake and prevent auto-pause.
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    let supabasePingSuccess = false
    let pingDetails = ""

    // 1. Direct Supabase JS query (Selecting only specific column 'id' and limit 1)
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { data, error } = await supabase
          .from("scan_limits")
          .select("id")
          .limit(1)

        if (!error) {
          supabasePingSuccess = true
          pingDetails = "Supabase JS client query succeeded"
        }
      } catch (sbErr: any) {
        pingDetails = `Supabase JS client error: ${sbErr?.message || sbErr}`
      }
    }

    // 2. Prisma fallback query (Selecting only specific column 'id' with take: 1)
    let prismaPingSuccess = false
    try {
      await db.scanLimit.findFirst({
        select: { id: true },
      })
      prismaPingSuccess = true
    } catch (pErr: any) {
      console.warn("Prisma ping fallback error:", pErr?.message)
    }

    if (supabasePingSuccess || prismaPingSuccess) {
      return NextResponse.json(
        {
          status: "healthy",
          message: "Database ping successful - project active",
          details: pingDetails || "Prisma query succeeded",
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        status: "degraded",
        message: "Ping completed with warnings",
        details: pingDetails,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        error: error?.message || "Internal Server Error",
      },
      { status: 500 }
    )
  }
}
