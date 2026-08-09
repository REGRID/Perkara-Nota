import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { recordVerifiedReceiptLearning } from "@/lib/selfLearningEngine"
import { getAdminUserFromRequest } from "@/lib/authHelper"
import { getOrSeedCategories } from "@/lib/categories"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const category = searchParams.get("category") || ""
    const limit = searchParams.has("limit") || searchParams.has("take")
      ? Math.min(Math.max(Number(searchParams.get("limit") || searchParams.get("take")), 1), 1000)
      : undefined

    // Extract root keyword if category is e.g. "Bahan Baku" vs "Bahan Baku / Sembako"
    const rootKeyword = category ? category.split("/")[0].trim() : ""

    const receipts = await db.receipt.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { merchantName: { contains: search, mode: "insensitive" } },
                  { note: { contains: search, mode: "insensitive" } },
                  { paymentMethod: { contains: search, mode: "insensitive" } },
                  {
                    items: {
                      some: {
                        OR: [
                          { name: { contains: search, mode: "insensitive" } },
                          { category: { contains: search, mode: "insensitive" } },
                          { subCategory: { contains: search, mode: "insensitive" } },
                        ],
                      },
                    },
                  },
                ],
              }
            : {},
          category
            ? {
                items: {
                  some: {
                    OR: [
                      { category: { contains: category, mode: "insensitive" } },
                      { subCategory: { contains: category, mode: "insensitive" } },
                      { category: { contains: rootKeyword, mode: "insensitive" } },
                    ],
                  },
                },
              }
            : {},
        ],
      },
      take: limit,
      select: {
        id: true,
        merchantName: true,
        date: true,
        imageUrl: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        note: true,
        createdAt: true,
        updatedAt: true,
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

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
        items: r.items.map((item: any) => {
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

    const newReceipt = await db.receipt.create({
      data: {
        merchantName: merchantName || "Nota / Toko",
        date: date,
        imageUrl: imageUrl || null,
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || "Cash",
        paymentStatus: paymentStatus || "Lunas",
        note: cleanedNote,
        items: {
          create: items.map((it: any) => ({
            name: it.name || "Item",
            category: it.category ? it.category.split("/")[0].trim() : "Lain-lain",
            subCategory: it.subCategory || "Umum",
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
          })),
        },
      },
      include: {
        items: true,
      },
    })

    // Continuous Self-Learning Engine: Record verified user input asynchronously (non-blocking for fast save response)
    void recordVerifiedReceiptLearning(merchantName, items).catch((err) =>
      console.warn("Background self-learning error:", err)
    )

    return NextResponse.json(newReceipt, { status: 201 })
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

    const approval = await (db as any).pendingApproval.create({
      data: {
        actionType: "BULK_DELETE",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify({ ids }),
      },
    })

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
