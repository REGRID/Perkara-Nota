import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { getAdminUserFromRequest } from "@/lib/authHelper"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || "PENDING"
    const receiptId = searchParams.get("receiptId") || ""

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

    let result = approvals || []

    if (receiptId) {
      result = result.filter((app: any) => {
        if (app.receiptId === receiptId) return true
        if (app.payload) {
          try {
            const p = JSON.parse(app.payload)
            if (p.id === receiptId) return true
            if (p.ids && Array.isArray(p.ids) && p.ids.includes(receiptId)) return true
          } catch (e) {}
        }
        return false
      })
    }

    return NextResponse.json(result)
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

    // Insert Notification for other admin
    try {
      const recipientAdmin = adminUser.toLowerCase().includes("rama") ? "refo" : "rama"
      await supabase.from("notifications").insert({
        recipient: recipientAdmin,
        sender: adminUser,
        type: "REQUEST",
        title: `Permintaan Verifikasi (${actionType})`,
        message: `Admin ${adminUser} mengajukan permintaan verifikasi ${actionType}.`,
        approvalId: newApproval.id,
        isRead: false,
      })
    } catch (nErr) {
      console.warn("Approval POST notification insert notice:", nErr)
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
