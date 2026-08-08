import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAdminUserFromRequest } from "@/lib/authHelper"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const approvingAdmin = getAdminUserFromRequest(req)

    const pendingApproval = await (db as any).pendingApproval.findUnique({
      where: { id },
    })

    if (!pendingApproval) {
      return NextResponse.json({ error: "Permintaan verifikasi tidak ditemukan" }, { status: 404 })
    }

    if (pendingApproval.status !== "PENDING") {
      return NextResponse.json({ error: "Permintaan verifikasi ini telah diproses sebelumnya" }, { status: 400 })
    }

    // Dual-Control Enforcement: Prevent Self-Approval!
    if (pendingApproval.requestedBy === approvingAdmin) {
      return NextResponse.json({
        error: `Akses Ditolak: Permintaan diajukan oleh Anda (${approvingAdmin}). Verifikasi harus dilakukan oleh Admin lain.`,
      }, { status: 403 })
    }

    const payload = JSON.parse(pendingApproval.payload)
    const actionType = pendingApproval.actionType

    // Execute requested changes in database
    if (actionType === "DELETE" && pendingApproval.receiptId) {
      await db.receipt.delete({
        where: { id: pendingApproval.receiptId },
      })
    } else if (actionType === "BULK_DELETE" && payload.ids && Array.isArray(payload.ids)) {
      await db.receipt.deleteMany({
        where: { id: { in: payload.ids } },
      })
    } else if (actionType === "SETTLE" && pendingApproval.receiptId) {
      await db.receipt.update({
        where: { id: pendingApproval.receiptId },
        data: { paymentStatus: "Lunas" },
      })
    } else if (actionType === "EDIT" && pendingApproval.receiptId) {
      const { merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, items } = payload

      await db.receiptItem.deleteMany({
        where: { receiptId: pendingApproval.receiptId },
      })

      await db.receipt.update({
        where: { id: pendingApproval.receiptId },
        data: {
          merchantName: merchantName || "Nota / Toko",
          date,
          imageUrl: imageUrl || undefined,
          subtotal: Number(subtotal) || 0,
          taxAmount: Number(taxAmount) || 0,
          totalAmount: Number(totalAmount) || 0,
          paymentMethod: paymentMethod || "Cash",
          paymentStatus: paymentStatus || "Lunas",
          note: note || null,
          items: {
            create: (items || []).map((it: any) => ({
              name: it.name || "Item",
              category: it.category || "Lain-lain",
              subCategory: it.subCategory || "Umum",
              price: Number(it.price) || 0,
              quantity: Number(it.quantity) || 1,
            })),
          },
        },
      })
    }

    // Mark approval request as APPROVED
    const updatedApproval = await (db as any).pendingApproval.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedBy: approvingAdmin,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Perubahan berhasil diverifikasi dan diterapkan oleh Admin ${approvingAdmin}.`,
      approval: updatedApproval,
    })
  } catch (error: any) {
    console.error("Approve Request Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menyetujui perubahan" }, { status: 500 })
  }
}
