import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { invalidateCategoriesCache } from "@/lib/categories"

// GET: Export entire database data as JSON
export async function GET() {
  try {
    const { data: receipts } = await supabase
      .from("receipts")
      .select("*, items:receipt_items(*)")
      .order("createdAt", { ascending: true })

    const { data: customCategories } = await supabase
      .from("custom_categories")
      .select("*")
      .order("createdAt", { ascending: true })

    const { data: merchantDictionaries } = await supabase
      .from("merchant_dictionaries")
      .select("*")

    const { data: productDictionaries } = await supabase
      .from("product_dictionaries")
      .select("*")

    const backupData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      receipts: receipts || [],
      customCategories: customCategories || [],
      merchantDictionaries: merchantDictionaries || [],
      productDictionaries: productDictionaries || [],
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
          let catQuery = supabase
            .from("custom_categories")
            .select("id")
            .eq("name", cat.name)

          if (cat.parentId) {
            catQuery = catQuery.eq("parentId", cat.parentId)
          } else {
            catQuery = catQuery.is("parentId", null)
          }

          const { data: exists } = await catQuery.maybeSingle()

          if (!exists) {
            await supabase.from("custom_categories").insert({
              name: cat.name,
              parentId: cat.parentId || null,
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
          const { data: exists } = await supabase
            .from("receipts")
            .select("id")
            .eq("id", r.id)
            .maybeSingle()

          if (!exists) {
            const { data: newReceipt } = await supabase
              .from("receipts")
              .insert({
                id: r.id,
                merchantName: r.merchantName || "Nota / Toko",
                date: r.date,
                imageUrl: r.imageUrl || null,
                subtotal: Number(r.subtotal) || 0,
                discountAmount: Number(r.discountAmount) || 0,
                taxAmount: Number(r.taxAmount) || 0,
                totalAmount: Number(r.totalAmount) || 0,
                paymentMethod: r.paymentMethod || "Cash",
                paymentStatus: r.paymentStatus || "Lunas",
                note: r.note || null,
                createdAt: r.createdAt || new Date().toISOString(),
              })
              .select("id")
              .single()

            if (newReceipt && r.items && Array.isArray(r.items) && r.items.length > 0) {
              const itemsToInsert = r.items.map((it: any) => ({
                receiptId: newReceipt.id,
                name: it.name || "Item",
                category: it.category || "Lain-lain",
                subCategory: it.subCategory || "Umum",
                price: Number(it.price) || 0,
                quantity: Number(it.quantity) || 1,
              }))

              await supabase.from("receipt_items").insert(itemsToInsert)
            }
            importedReceipts++
          }
        } catch (e) {}
      }
    }

    invalidateCategoriesCache()

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
