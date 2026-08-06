import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import * as XLSX from "xlsx"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const category = searchParams.get("category") || ""
    const format = searchParams.get("format") || "xlsx"
    const order = searchParams.get("order") || "asc" // default chronological order asc

    const sortDirection = order === "desc" ? "desc" : "asc"
    const rootKeyword = category ? category.split("/")[0].trim() : ""

    const receipts = await db.receipt.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { merchantName: { contains: search } },
                  { note: { contains: search } },
                  { paymentMethod: { contains: search } },
                  {
                    items: {
                      some: {
                        OR: [
                          { name: { contains: search } },
                          { category: { contains: search } },
                          { subCategory: { contains: search } },
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
                      { category: { contains: category } },
                      { subCategory: { contains: category } },
                      { category: { contains: rootKeyword } },
                    ],
                  },
                },
              }
            : {},
        ],
      },
      include: {
        items: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: [
        { date: sortDirection },
        { createdAt: sortDirection },
      ],
    })

    // If format === "statement", generate Bank Statement (Rekening Koran) Excel / CSV
    if (format === "statement" || format === "statement-csv") {
      let runningBalance = 0
      const statementRows = receipts.map((r, idx) => {
        runningBalance += r.totalAmount
        const categorySummary = Array.from(new Set(r.items.map((i) => i.category))).join(", ")
        const itemsSummary = r.items.slice(0, 3).map((i) => i.name).join(", ") + (r.items.length > 3 ? "..." : "")

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
    const summaryData = receipts.map((r, idx) => ({
      "No.": idx + 1,
      "Tanggal Nota": r.date,
      "Nama Toko / Merchant": r.merchantName,
      "Metode Pembayaran": r.paymentMethod || "Cash",
      "Status Pembayaran": r.paymentStatus || "Lunas",
      "Subtotal (Rp)": r.subtotal,
      "Pajak / PPN (Rp)": r.taxAmount,
      "Total Netto (Rp)": r.totalAmount,
      "Jumlah Item": r.items.length,
      "Catatan": r.note || "",
      "ID Nota": r.id,
    }))

    // Sheet 2: Rincian Item Produk
    const itemsData: any[] = []
    let itemIdx = 1
    receipts.forEach((r) => {
      r.items.forEach((it) => {
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

    const summaryColWidths = [
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

    const itemsColWidths = [
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

    summarySheet["!cols"] = summaryColWidths
    itemsSheet["!cols"] = itemsColWidths

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
