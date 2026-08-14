import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { recordVerifiedReceiptLearning } from "@/lib/selfLearningEngine"
import { getAdminUserFromRequest, getAdminRoleFromRequest, getStaffNameFromRequest } from "@/lib/authHelper"
import { getOrSeedCategories } from "@/lib/categories"
import { compressBase64Image } from "@/lib/imageCompressor"
import { sendWebPushNotification } from "@/lib/serverPush"
import { invalidateApprovalsCache } from "@/app/api/approvals/route"
import { invalidateNotificationsCache } from "@/app/api/notifications/route"

const RECEIPT_LIST_SELECT =
  "id, merchantName, date, subtotal, taxAmount, totalAmount, paymentMethod, paymentStatus, note, staffName, createdAt, updatedAt, items:receipt_items(id, name, category, subCategory, price, quantity)"

let listCache: { key: string; data: any; timestamp: number } | null = null
const LIST_CACHE_TTL = 5000 // 5 seconds cache

export function invalidateReceiptsListCache() {
  listCache = null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const category = searchParams.get("category") || ""
    const limit = searchParams.has("limit") || searchParams.has("take")
      ? Math.min(Math.max(Number(searchParams.get("limit") || searchParams.get("take")), 1), 1000)
      : undefined

    const cacheKey = `${search}_${category}_${limit || 'all'}`
    const now = Date.now()

    if (listCache && listCache.key === cacheKey && now - listCache.timestamp < LIST_CACHE_TTL) {
      const cachedResponse = NextResponse.json(listCache.data)
      cachedResponse.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30")
      return cachedResponse
    }

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
    let normalizedReceipts = receipts.map((r: any) => {
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

    // Role KARYAWAN Data Scoping: Only return receipts uploaded by Karyawan or Talangan Karyawan
    const userRole = getAdminRoleFromRequest(req)
    if (userRole === "KARYAWAN") {
      const knownStaff = ["reza", "ummu", "cheisa", "novi", "titis", "karyawan"]
      normalizedReceipts = normalizedReceipts.filter((r: any) => {
        const noteText = (r.note || "").toLowerCase()
        const method = (r.paymentMethod || "").toLowerCase()
        return (
          method === "talangan karyawan" ||
          noteText.includes("(karyawan)") ||
          noteText.includes("diunggah oleh:") ||
          knownStaff.some((st) => noteText.includes(st))
        )
      })
    }

    listCache = { key: cacheKey, data: normalizedReceipts, timestamp: now }

    const response = NextResponse.json(normalizedReceipts)
    response.headers.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=15")
    return response
  } catch (error: any) {
    console.error("GET Receipts Error:", error)
    return NextResponse.json({ error: "Gagal mengambil data nota" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      merchantName,
      date,
      subtotal = 0,
      taxAmount = 0,
      totalAmount = 0,
      paymentMethod = "Cash",
      paymentStatus = "Lunas",
      note,
      items = [],
      imageUrl,
      staffName,
    } = body

    if (!date) {
      return NextResponse.json({ error: "Tanggal nota wajib diisi" }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Nota harus memiliki minimal 1 item produk" }, { status: 400 })
    }

    invalidateReceiptsListCache()

    const userRole = getAdminRoleFromRequest(req)
    const reqStaffName = staffName || getStaffNameFromRequest(req)

    const isPersonal =
      paymentMethod === "Dana Pribadi Owner" || paymentMethod === "Talangan Karyawan"
    
    let cleanedNote = note
      ? isPersonal
        ? note
        : note.replace(/\[Dibayar oleh: [^\]]+\]\s*/g, "").trim() || null
      : null

    if (userRole === "KARYAWAN" && reqStaffName) {
      const uploaderTag = `[Diunggah oleh: ${reqStaffName} (Karyawan)]`
      if (!cleanedNote) {
        cleanedNote = uploaderTag
      } else if (!cleanedNote.includes("[Diunggah oleh:")) {
        cleanedNote = `${cleanedNote} ${uploaderTag}`
      }
    }

    // 1. Compress Image before storing
    const compressedImageUrl = imageUrl ? await compressBase64Image(imageUrl) : null

    // 2. Insert master receipt
    const { data: newReceipt, error: receiptError } = await supabase
      .from("receipts")
      .insert({
        merchantName: merchantName || "Nota / Toko",
        date: date || new Date().toISOString().split("T")[0],
        imageUrl: compressedImageUrl,
        subtotal: Number(subtotal) || 0,
        taxAmount: Number(taxAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        paymentMethod: paymentMethod || "Cash",
        paymentStatus: paymentStatus || "Lunas",
        note: cleanedNote,
        staffName: reqStaffName || null,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single()

    if (receiptError) {
      console.error("Insert Receipt Error:", receiptError)
      throw new Error(receiptError.message)
    }

    // 3. Insert items if any
    let insertedItems: any[] = []
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((item: any) => ({
        receiptId: newReceipt.id,
        name: item.name || "Item",
        category: item.category || "Lain-lain",
        subCategory: item.subCategory || "Umum",
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
      }))

      const { data: itemsData, error: itemsError } = await supabase
        .from("receipt_items")
        .insert(itemsToInsert)
        .select()

      if (itemsError) {
        console.error("Insert Items Error:", itemsError)
      } else {
        insertedItems = itemsData || []
      }
    }

    const fullReceipt = {
      ...newReceipt,
      items: insertedItems,
    }

    // 4. Background auto-learning into dictionaries
    try {
      if (merchantName) {
        await supabase
          .from("merchant_dictionaries")
          .upsert(
            {
              rawPattern: merchantName.toLowerCase().trim(),
              cleanName: merchantName.trim(),
              updatedAt: new Date().toISOString(),
            },
            { onConflict: "rawPattern" }
          )
      }

      if (insertedItems.length > 0) {
        for (const itm of insertedItems) {
          if (itm.name) {
            await supabase
              .from("product_dictionaries")
              .upsert(
                {
                  rawName: itm.name.toLowerCase().trim(),
                  verifiedName: itm.name.trim(),
                  category: itm.category || "Lain-lain",
                  subCategory: itm.subCategory || "Umum",
                  lastKnownPrice: Number(itm.price) || 0,
                  updatedAt: new Date().toISOString(),
                },
                { onConflict: "rawName" }
              )
          }
        }
      }
    } catch (dictErr) {
      console.warn("Background auto-learning notice:", dictErr)
    }

    // 5. Insert Notification & Send Real Web Push to Mobile Phones
    try {
      const isKaryawanUpload = Boolean(staffName) || getAdminRoleFromRequest(req) === "KARYAWAN"
      const uploaderName = staffName
        ? `${staffName} (Karyawan)`
        : isKaryawanUpload
        ? "Karyawan"
        : getAdminUserFromRequest(req) || "Admin"

      const notifTitle = "Nota Baru Masuk"
      const notifMessage = `${uploaderName} telah menyimpan nota baru dari "${merchantName || 'Nota / Toko'}" sebesar Rp ${(Number(totalAmount) || 0).toLocaleString("id-ID")}.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: uploaderName,
        type: "NEW_RECEIPT",
        title: notifTitle,
        message: notifMessage,
        receiptId: newReceipt.id,
        isRead: false,
      })

      // Trigger Web Push so locked/closed phones receive the notification
      sendWebPushNotification({
        title: notifTitle,
        message: notifMessage,
        url: "/",
        recipientRole: "ALL",
        excludeUsername: uploaderName,
      }).catch((pErr: any) => console.warn("[WebPush Error on New Receipt]:", pErr))
      invalidateNotificationsCache()
    } catch (nErr) {
      console.warn("New receipt notification insert notice:", nErr)
    }

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

    invalidateReceiptsListCache()
    invalidateApprovalsCache()
    invalidateNotificationsCache()

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

    // Insert Notification for other admin & Send Web Push
    try {
      const notifTitle = `Permintaan Hapus Massal (${ids.length} Nota)`
      const notifMsg = `Admin ${adminUser} mengajukan penghapusan massal untuk ${ids.length} nota.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: adminUser,
        type: "REQUEST",
        title: notifTitle,
        message: notifMsg,
        approvalId: approval.id,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ADMIN",
        excludeUsername: adminUser,
      }).catch((pErr: any) => console.warn("[WebPush Error on Bulk Delete]:", pErr))
    } catch (nErr) {
      console.warn("Bulk delete notification insert notice:", nErr)
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

export async function PATCH(req: NextRequest) {
  try {
    const adminUser = getAdminUserFromRequest(req)
    const { ids, paymentStatus, proofImageUrl, personName, totalAmount } = await req.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ID nota yang akan diperbarui tidak valid" }, { status: 400 })
    }

    invalidateReceiptsListCache()
    invalidateApprovalsCache()
    invalidateNotificationsCache()

    const statusToSet = paymentStatus || "Sudah Dilunasi"
    const compressedProof = proofImageUrl ? await compressBase64Image(proofImageUrl) : null

    const payloadObj = {
      ids,
      paymentStatus: statusToSet,
      proofImageUrl: compressedProof,
      personName: personName || "",
      totalAmount: Number(totalAmount) || 0,
    }

    const { data: approval, error } = await supabase
      .from("pending_approvals")
      .insert({
        actionType: "BULK_SETTLE",
        requestedBy: adminUser,
        status: "PENDING",
        payload: JSON.stringify(payloadObj),
      })
      .select("*")
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Insert Notification for all admins & Send Web Push
    try {
      const notifTitle = `Pengajuan Pelunasan (${ids.length} Nota)`
      const notifMsg = `Admin ${adminUser} mengajukan pelunasan untuk ${ids.length} nota${personName ? ` (${personName})` : ''} sebesar Rp ${(Number(totalAmount) || 0).toLocaleString("id-ID")}.`

      await supabase.from("notifications").insert({
        recipient: "all",
        sender: adminUser,
        type: "REQUEST",
        title: notifTitle,
        message: notifMsg,
        approvalId: approval.id,
        isRead: false,
      })

      sendWebPushNotification({
        title: notifTitle,
        message: notifMsg,
        url: "/",
        recipientRole: "ADMIN",
        excludeUsername: adminUser,
      }).catch((pErr: any) => console.warn("[WebPush Error on Bulk Settle]:", pErr))
    } catch (nErr) {
      console.warn("Bulk settle notification insert notice:", nErr)
    }

    return NextResponse.json({
      pendingApproval: true,
      message: `Permintaan pelunasan massal (${ids.length} nota) berhasil diajukan oleh ${adminUser}. Menunggu verifikasi dari admin lain.`,
      approval,
    })
  } catch (error: any) {
    console.error("Bulk PATCH Receipts Error:", error)
    return NextResponse.json({ error: "Gagal mengajukan pelunasan nota secara massal" }, { status: 500 })
  }
}
