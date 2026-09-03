import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import * as XLSX from "xlsx"

const EXPORT_SELECT =
  "id, merchantName, date, subtotal, discountAmount, taxAmount, totalAmount, paymentMethod, paymentStatus, note, staffName, createdAt, updatedAt, items:receipt_items(id, name, category, subCategory, price, quantity, createdAt)"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const category = searchParams.get("category") || ""
    const status = searchParams.get("status") || ""
    const person = searchParams.get("person") || ""
    const dateRange = searchParams.get("dateRange") || ""
    const startDate = searchParams.get("startDate") || ""
    const endDate = searchParams.get("endDate") || ""
    const format = searchParams.get("format") || "xlsx"
    const order = searchParams.get("order") || "asc"
    const paymentMethodsParam = searchParams.get("paymentMethods") || ""
    const selectedPaymentMethods = paymentMethodsParam
      ? paymentMethodsParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
      : []

    const sortDirection = order === "desc" ? "desc" : "asc"
    const rootKeyword = category ? category.split("/")[0].trim() : ""

    const { data: rawReceipts, error } = await supabase
      .from("receipts")
      .select(EXPORT_SELECT)
      .order("date", { ascending: sortDirection === "asc" })
      .order("createdAt", { ascending: sortDirection === "asc" })

    if (error) {
      throw new Error(error.message)
    }

    let receipts = rawReceipts || []

    const todayStr = new Date().toISOString().split("T")[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const currentMonthStr = todayStr.substring(0, 7)

    // Comprehensive client-aligned filter processing
    receipts = receipts.filter((r: any) => {
      // 1. Date Range
      if (dateRange === "today" && r.date !== todayStr) return false
      if (dateRange === "7days" && r.date < sevenDaysAgo) return false
      if (dateRange === "month" && !r.date.startsWith(currentMonthStr)) return false
      if (startDate && r.date < startDate) return false
      if (endDate && r.date > endDate) return false

      // 2. Search
      if (search) {
        const searchLower = search.toLowerCase().trim()
        const matchesMerchant = (r.merchantName || "").toLowerCase().includes(searchLower)
        const matchesNote = (r.note || "").toLowerCase().includes(searchLower)
        const matchesPayment = (r.paymentMethod || "").toLowerCase().includes(searchLower)
        const matchesItems = (r.items || []).some(
          (i: any) =>
            (i.name || "").toLowerCase().includes(searchLower) ||
            (i.category || "").toLowerCase().includes(searchLower) ||
            (i.subCategory || "").toLowerCase().includes(searchLower)
        )
        if (!matchesMerchant && !matchesNote && !matchesPayment && !matchesItems) return false
      }

      // 3. Category & Sub-Category
      if (category) {
        const categoryLower = category.toLowerCase().trim()
        const rootLower = rootKeyword.toLowerCase().trim()
        const matchesCat = (r.items || []).some((i: any) => {
          const itemCat = (i.category || "").toLowerCase()
          const itemSub = (i.subCategory || "").toLowerCase()
          return itemCat.includes(categoryLower) || itemSub.includes(categoryLower) || (rootLower && itemCat.includes(rootLower))
        })
        if (!matchesCat) return false
      }

      // 4. Status Filter
      if (status && status !== "Semua Status") {
        const st = (r.paymentStatus || "").toLowerCase().trim()
        const isSettled = !st.includes("belum") && !st.includes("tempo") && (st === "lunas" || st.includes("sudah"))
        if (status === "Lunas" && !isSettled) return false
        if (status.includes("Belum") && isSettled) return false
      }

      // 5. Person Filter
      if (person && person !== "Semua Penanggung Jawab") {
        const noteText = r.note || ""
        const match = noteText.match(/\[Dibayar oleh: ([^\]]+)\]/)
        const paidBy = match ? match[1].trim() : ""
        if (paidBy.toLowerCase() !== person.toLowerCase()) return false
      }

      // 6. Payment Method Filter (Multi-Select OR condition)
      if (selectedPaymentMethods.length > 0) {
        const rMethod = (r.paymentMethod || "Cash").toLowerCase().trim()
        const matchesAnyMethod = selectedPaymentMethods.some((sMethod: string) => {
          if (rMethod === sMethod) return true
          if (rMethod.includes(sMethod) || sMethod.includes(rMethod)) return true
          if (sMethod === "cash" && (rMethod === "cash" || rMethod === "tunai")) return true
          if (sMethod.includes("transfer") && rMethod.includes("transfer")) return true
          if (sMethod.includes("qris") && rMethod.includes("qris")) return true
          if (sMethod.includes("debit") && (rMethod.includes("debit") || rMethod.includes("kredit") || rMethod.includes("kartu") || rMethod.includes("edc"))) return true
          if (sMethod.includes("pribadi") && (rMethod.includes("pribadi") || rMethod.includes("owner"))) return true
          if (sMethod.includes("talangan") && rMethod.includes("talangan")) return true
          if (sMethod.includes("hutang") && (rMethod.includes("hutang") || rMethod.includes("supplier") || rMethod.includes("tempo"))) return true
          return false
        })
        if (!matchesAnyMethod) return false
      }

      return true
    })

    // Sort items inside each receipt by createdAt asc
    receipts.forEach((r: any) => {
      if (r.items && Array.isArray(r.items)) {
        r.items.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      }
    })

    // If format === "statement", generate Bank Statement (Rekening Koran) Excel / CSV
    if (format === "statement" || format === "statement-csv") {
      let runningBalance = 0
      const statementRows = receipts.map((r: any, idx: number) => {
        runningBalance += r.totalAmount
        const categorySummary = Array.from(new Set((r.items || []).map((i: any) => i.category))).join(", ")
        const itemsSummary = (r.items || []).slice(0, 3).map((i: any) => i.name).join(", ") + ((r.items || []).length > 3 ? "..." : "")

        return {
          "No.": idx + 1,
          "Tanggal Transaksi": r.date,
          "ID Struk / Transaksi": r.id,
          "Uraian / Toko (Merchant)": r.merchantName,
          "Rincian Barang / Kategori": `${categorySummary} (${itemsSummary})`,
          "Metode Bayar": r.paymentMethod || "Cash",
          "Pengeluaran / Debet (Rp)": r.totalAmount,
          "Saldo Akumulasi Pengeluaran (Rp)": runningBalance,
        }
      })

      const workbook = XLSX.utils.book_new()
      const statementSheet = XLSX.utils.json_to_sheet(statementRows)

      statementSheet["!cols"] = [
        { wch: 6 },  // No
        { wch: 16 }, // Tanggal
        { wch: 38 }, // ID Struk
        { wch: 30 }, // Merchant
        { wch: 45 }, // Rincian Barang
        { wch: 16 }, // Metode
        { wch: 22 }, // Debet
        { wch: 26 }, // Saldo Akumulasi
      ]

      XLSX.utils.book_append_sheet(workbook, statementSheet, "Rekening Koran Pengeluaran")

      if (format === "statement-csv") {
        const csvOutput = XLSX.utils.sheet_to_csv(statementSheet)
        return new Response(csvOutput, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="Rekening_Koran_Nota_${new Date().toISOString().split("T")[0]}.csv"`,
          },
        })
      }

      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })
      return new Response(excelBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Rekening_Koran_Nota_${new Date().toISOString().split("T")[0]}.xlsx"`,
        },
      })
    }

    // Sheet 1: Ringkasan Nota (Standard Summary)
    const summaryData = receipts.map((r: any, idx: number) => ({
      "No.": idx + 1,
      "Tanggal Nota": r.date,
      "Nama Toko / Merchant": r.merchantName,
      "Metode Pembayaran": r.paymentMethod || "Cash",
      "Status Pembayaran": r.paymentStatus || "Lunas",
      "Subtotal (Rp)": r.subtotal,
      "Diskon (Rp)": r.discountAmount || 0,
      "Pajak / PPN (Rp)": r.taxAmount,
      "Total Netto (Rp)": r.totalAmount,
      "Jumlah Item": (r.items || []).length,
      "Catatan": r.note || "",
      "ID Nota": r.id,
    }))

    // Sheet 2: Rincian Item Produk
    const itemsData: any[] = []
    let itemIdx = 1
    receipts.forEach((r: any) => {
      ;(r.items || []).forEach((it: any) => {
        itemsData.push({
          "No.": itemIdx++,
          "Tanggal Nota": r.date,
          "Toko / Merchant": r.merchantName,
          "Nama Barang": it.name,
          "Kategori Utama": it.category,
          "Sub-Kategori": it.subCategory || "Umum",
          "Jumlah (Qty)": it.quantity,
          "Harga Satuan (Rp)": it.price,
          "Total Item (Rp)": it.price * it.quantity,
          "Metode Pembayaran": r.paymentMethod || "Cash",
          "ID Nota": r.id,
        })
      })
    })

    const workbook = XLSX.utils.book_new()
    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    const itemsSheet = XLSX.utils.json_to_sheet(itemsData)

    summarySheet["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 30 },
      { wch: 20 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 12 },
      { wch: 30 },
      { wch: 38 },
    ]

    itemsSheet["!cols"] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 28 },
      { wch: 32 },
      { wch: 24 },
      { wch: 20 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 38 },
    ]

    XLSX.utils.book_append_sheet(workbook, summarySheet, "Ringkasan Nota")
    XLSX.utils.book_append_sheet(workbook, itemsSheet, "Rincian Item Produk")

    if (format === "csv") {
      const csvOutput = XLSX.utils.sheet_to_csv(summarySheet)
      return new Response(csvOutput, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="Laporan_Nota_${new Date().toISOString().split("T")[0]}.csv"`,
        },
      })
    }

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })

    return new Response(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Laporan_Nota_Photo_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    })
  } catch (error: any) {
    console.error("Export Error:", error)
    return NextResponse.json({ error: "Gagal mengekspor data nota" }, { status: 500 })
  }
}
