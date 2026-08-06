import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET: Export entire database data as JSON
export async function GET() {
  try {
    const receipts = await db.receipt.findMany({
      include: { items: true },
      orderBy: { createdAt: "asc" },
    })

    const customCategories = await (db as any).customCategory.findMany({
      orderBy: { createdAt: "asc" },
    })

    const merchantDictionaries = await (db as any).merchantDictionary.findMany()
    const productDictionaries = await (db as any).productDictionary.findMany()

    const backupData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      receipts,
      customCategories,
      merchantDictionaries,
      productDictionaries,
    }

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="NotaPhoto_Backup_${new Date().toISOString().split("T")[0]}.json"`,
      },
    })
  } catch (error: any) {
    console.error("Backup Export Error:", error)
    return NextResponse.json({ error: "Gagal mengekspor cadangan database" }, { status: 500 })
  }
}

// POST: Restore / Import database data from JSON backup file
export async function POST(req: NextRequest) {
  try {
    const backupData = await req.json()

    if (!backupData || !backupData.receipts) {
      return NextResponse.json({ error: "Format file cadangan JSON tidak valid" }, { status: 400 })
    }

    let importedCategories = 0
    let importedReceipts = 0

    // 1. Restore Custom Categories
    if (backupData.customCategories && Array.isArray(backupData.customCategories)) {
      for (const cat of backupData.customCategories) {
        try {
          const exists = await (db as any).customCategory.findFirst({
            where: { name: cat.name, parentId: cat.parentId || null },
          })
          if (!exists) {
            await (db as any).customCategory.create({
              data: {
                name: cat.name,
                parentId: cat.parentId || null,
              },
            })
            importedCategories++
          }
        } catch (e) {}
      }
    }

    // 2. Restore Receipts & Items
    if (backupData.receipts && Array.isArray(backupData.receipts)) {
      for (const r of backupData.receipts) {
        try {
          const exists = await db.receipt.findUnique({
            where: { id: r.id },
          })

          if (!exists) {
            await db.receipt.create({
              data: {
                id: r.id,
                merchantName: r.merchantName || "Nota / Toko",
                date: r.date,
                imageUrl: r.imageUrl || null,
                subtotal: Number(r.subtotal) || 0,
                taxAmount: Number(r.taxAmount) || 0,
                totalAmount: Number(r.totalAmount) || 0,
                paymentMethod: r.paymentMethod || "Cash",
                paymentStatus: r.paymentStatus || "Lunas",
                note: r.note || null,
                createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
                items: {
                  create: (r.items || []).map((it: any) => ({
                    name: it.name || "Item",
                    category: it.category || "Lain-lain",
                    subCategory: it.subCategory || "Umum",
                    price: Number(it.price) || 0,
                    quantity: Number(it.quantity) || 1,
                  })),
                },
              },
            })
            importedReceipts++
          }
        } catch (e) {}
      }
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil mengimpor ${importedReceipts} nota & ${importedCategories} kategori baru dari file backup.`,
      importedReceipts,
      importedCategories,
    })
  } catch (error: any) {
    console.error("Backup Import Error:", error)
    return NextResponse.json({ error: error.message || "Gagal mengimpor file cadangan" }, { status: 500 })
  }
}
