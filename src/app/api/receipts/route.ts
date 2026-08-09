import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { recordVerifiedReceiptLearning } from "@/lib/selfLearningEngine"
import { getAdminUserFromRequest } from "@/lib/authHelper"
import { getOrSeedCategories } from "@/lib/categories"

import { compressBase64Image } from "@/lib/imageCompressor"

const RECEIPT_LIST_SELECT =
  "id, merchantName, date, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, createdAt, updatedAt, items:receipt_items(*)"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const category = searchParams.get("category") || ""
    const limit = searchParams.has("limit") || searchParams.has("take")
      ? Math.min(Math.max(Number(searchParams.get("limit") || searchParams.get("take")), 1), 1000)
      : undefined

    const rootKeyword = category ? category.split("/")[0].trim() : ""

    let query = supabase
      .from("receipts")
      .select(RECEIPT_LIST_SELECT)
      .order("createdAt", { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    const { data: rawReceipts, error } = await query

    if (error) {
      console.error("GET Receipts Supabase Error:", error)
      throw new Error(error.message)
    }

    let receipts = rawReceipts || []

    // In-memory filter for complex relational search/category criteria
    if (search || category) {
      const searchLower = search.toLowerCase().trim()
      const categoryLower = category.toLowerCase().trim()
      const rootLower = rootKeyword.toLowerCase().trim()

      receipts = receipts.filter((r: any) => {
        const matchesSearch = !searchLower || (
          (r.merchantName || "").toLowerCase().includes(searchLower) ||
          (r.note || "").toLowerCase().includes(searchLower) ||
          (r.paymentMethod || "").toLowerCase().includes(searchLower) ||
          (r.items || []).some((i: any) =>
            (i.name || "").toLowerCase().includes(searchLower) ||
            (i.category || "").toLowerCase().includes(searchLower) ||
            (i.subCategory || "").toLowerCase().includes(searchLower)
          )
        )

        const matchesCategory = !categoryLower || (
          (r.items || []).some((i: any) => {
            const itemCat = (i.category || "").toLowerCase()
            const itemSub = (i.subCategory || "").toLowerCase()
            return (
              itemCat.includes(categoryLower) ||
              itemSub.includes(categoryLower) ||
              (rootLower && itemCat.includes(rootLower))
            )
          })
        )

        return matchesSearch && matchesCategory
      })
    }

    // Fetch cached Custom Categories to map legacy category names
    const categoryHierarchy = await getOrSeedCategories()
    const parentNames: string[] = categoryHierarchy.map((c) => c.name)

    // Normalize item categories and strip legacy [Dibayar oleh: ...] from non-personal payment receipts
    const normalizedReceipts = receipts.map((r: any) => {
      const isPersonal =
        r.paymentMethod === "Dana Pribadi Owner" || r.paymentMethod === "Talangan Karyawan"
      const cleanedNote =
        !isPersonal && r.note
          ? r.note.replace(/\[Dibayar oleh: [^\]]+\]\s*/g, "").trim() || null
          : r.note

      return {
        ...r,
        note: cleanedNote,
        items: (r.items || []).map((item: any) => {
          const itemCat = item.category || "Lain-lain"
          const itemRoot = itemCat.split("/")[0].trim().toLowerCase()

          const matchedParent = parentNames.find((p) => {
            const pRoot = p.split("/")[0].trim().toLowerCase()
            return pRoot === itemRoot || p.toLowerCase() === itemCat.toLowerCase()
          })

          return {
            ...item,
            category: matchedParent || itemCat.split("/")[0].trim(),
          }
        }),
      }
    })

    return NextResponse.json(normalizedReceipts)
  } catch (error: any) {
    console.error("GET Receipts Error:", error)
    return NextResponse.json({ error: "Gagal mengambil data nota" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { merchantName, date, imageUrl, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, items } = body

    if (!date) {
      return NextResponse.json({ error: "Tanggal nota wajib diisi" }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Nota harus memiliki minimal 1 item produk" }, { status: 400 })
    }

    const isPersonal =
      paymentMethod === "Dana Pribadi Owner" || paymentMethod === "Talangan Karyawan"
    const cleanedNote = note
      ? isPersonal
        ? note
        : note.replace(/\[Dibayar oleh: [^\]]+\]\s*/g, "").trim() || null
      : null

    const compressedImageUrl = await compressBase64Image(imageUrl)

    const { data: newReceipt, error: receiptErr } = await supabase
      .from("receipts")
      .insert({
        merchantName: merchantName || "Nota / Toko",
        date: date,
        imageUrl: compressedImageUrl || null,
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || "Cash",
        paymentStatus: paymentStatus || "Lunas",
        note: cleanedNote,
      })
      .select("id, merchantName, date, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, createdAt, updatedAt")
      .single()

    if (receiptErr || !newReceipt) {
      throw new Error(receiptErr?.message || "Gagal menyimpan nota ke database")
    }

    const itemsToCreate = items.map((it: any) => ({
      receiptId: newReceipt.id,
      name: it.name || "Item",
      category: it.category ? it.category.split("/")[0].trim() : "Lain-lain",
      subCategory: it.subCategory || "Umum",
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1,
    }))

    const { data: createdItems } = await supabase
      .from("receipt_items")
      .insert(itemsToCreate)
      .select("*")

    const fullReceipt = {
      ...newReceipt,
      items: createdItems || [],
    }

    // Continuous Self-Learning Engine: Record verified user input asynchronously (non-blocking)
    void recordVerifiedReceiptLearning(merchantName, items).catch((err) =>
      console.warn("Background self-learning error:", err)
    )

    return NextResponse.json(fullReceipt, { status: 201 })
  } catch (error: any) {
    console.error("POST Receipt Error:", error)
    return NextResponse.json({ error: error.message || "Gagal menyimpan nota ke database" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const { ids } = await req.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ID nota yang akan dihapus tidak valid" }, { status: 400 })
    }

    const { data: approval, error } = await supabase
      .from("pending_approvals")
      .insert({
        actionType: "BULK_DELETE",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify({ ids }),
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      pendingApproval: true,
      message: `Permintaan hapus massal (${ids.length} nota) berhasil diajukan oleh ${adminUser}. Menunggu verifikasi dari admin lain.`,
      approval,
    })
  } catch (error: any) {
    console.error("Bulk DELETE Receipts Error:", error)
    return NextResponse.json({ error: "Gagal mengajukan hapus nota secara massal" }, { status: 500 })
  }
}
