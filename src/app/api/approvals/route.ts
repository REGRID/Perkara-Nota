import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING"

    let query = supabase
      .from("pending_approvals")
      .select("*, receipt:receipts(*, items:receipt_items(*))")
      .order("createdAt", { ascending: false })

    if (status !== "ALL") {
      query = query.eq("status", status)
    }

    const { data: approvals, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json(approvals || [])
  } catch (error: any) {
    console.error("GET Approvals Error:", error)
    return NextResponse.json({ error: "Gagal mengambil daftar verifikasi" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const body = await req.json()
    const { receiptId, actionType, payload } = body

    if (!actionType || !payload) {
      return NextResponse.json({ error: "Tipe aksi dan payload data wajib diisi" }, { status: 400 })
    }

    const { data: newApproval, error } = await supabase
      .from("pending_approvals")
      .insert({
        receiptId: receiptId || null,
        actionType, // DELETE, EDIT, SETTLE, BULK_DELETE
        requestedBy: adminUser,
        status: "PENDING",
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      success: true,
      message: `Permintaan ${actionType} berhasil diajukan oleh ${adminUser}. Menunggu verifikasi oleh admin lain.`,
      approval: newApproval,
    }, { status: 201 })
  } catch (error: any) {
    console.error("POST Approval Request Error:", error)
    return NextResponse.json({ error: "Gagal membuat permintaan verifikasi" }, { status: 500 })
  }
}
