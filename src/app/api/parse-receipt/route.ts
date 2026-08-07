import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, incrementRateLimit, normalizeIp } from "@/lib/rateLimiter"
import { getLearnedKnowledgeContext } from "@/lib/selfLearningEngine"
import { db } from "@/lib/db"

export interface ParsedItem {
  name: string
  category: string
  subCategory?: string
  price: number
  quantity: number
}

export interface ParsedReceiptResult {
  merchantName: string
  date: string
  subtotal: number
  taxAmount: number
  totalAmount: number
  items: ParsedItem[]
}

function parseIndonesianPrice(str: string): number {
  if (!str) return 0
  let clean = String(str).replace(/^Rp\.?\s*/i, "").trim()
  clean = clean.replace(/,\d{2}$/, "").replace(/,-$/, "")
  clean = clean.replace(/\./g, "").replace(/,/g, "")
  const val = parseFloat(clean)
  return isNaN(val) ? 0 : val
}

function sanitizeRawText(input: string): string {
  if (!input || typeof input !== "string") return ""
  let sanitized = input.slice(0, 15000)
  sanitized = sanitized.replace(/System:\s*/gi, "Teks: ")
  sanitized = sanitized.replace(/Ignore previous instructions/gi, "")
  sanitized = sanitized.replace(/Developer mode/gi, "")
  return sanitized
}

async function callGeminiRestApi(apiKey: string, modelName: string, contentsParts: any[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: contentsParts }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("Quota exceeded")) {
      const quotaErr = new Error("GOOGLE_CLOUD_QUOTA_EXCEEDED")
      ;(quotaErr as any).status = 429
      throw quotaErr
    }
    throw new Error(`Gemini REST API Error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""
  return textOutput
}

export async function POST(req: NextRequest) {
  try {
    // 1. IP Normalization & Realtime Rate Limiting Enforcement
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1"

    const cleanIp = normalizeIp(rawIp)
    const rateLimit = await checkRateLimit(cleanIp)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "QUOTA_EXCEEDED",
          message: `Batas harian scan nota (20 scan/hari) telah tercapai untuk IP ${cleanIp}. Silakan coba lagi besok.`,
          remaining: 0,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 }
      )
    }

    // 2. Parse & Sanitize Input
    const body = await req.json()
    const rawText = sanitizeRawText(body.rawText || "")
    const imageBase64 = body.imageBase64

    if (!rawText && !imageBase64) {
      return NextResponse.json({ error: "Data gambar atau teks nota diperlukan" }, { status: 400 })
    }

    const apiKey =
      req.headers.get("x-gemini-api-key") ||
      (body && typeof body === "object" ? body.apiKey : null) ||
      process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "API_KEY_MISSING",
          message: "Kunci GEMINI_API_KEY belum dikonfigurasi di lingkungan server (.env.local) atau diisi di modal UI.",
        },
        { status: 500 }
      )
    }

    // 3. Fetch Official Parent & Sub Categories strictly from Database
    const dbCategories = await (db as any).customCategory.findMany({
      orderBy: { createdAt: "asc" },
    })

    const parentCats = dbCategories.filter((c: any) => !c.parentId)
    const subCats = dbCategories.filter((c: any) => c.parentId)

    // Build DB Hierarchy Map
    const officialHierarchyMap = parentCats.map((parent: any) => {
      const subsForParent = subCats
        .filter((sub: any) => sub.parentId === parent.id)
        .map((sub: any) => sub.name)

      return {
        parentName: parent.name,
        subNames: Array.from(new Set(["Umum", ...subsForParent])),
      }
    })

    let officialCategoriesPromptText = "DAFTAR RESMI KATEGORI UTAMA & SUB-KATEGORI DATABASE (DILARANG MEMBUAT BARU/SENDIRI):\n"
    if (officialHierarchyMap.length > 0) {
      officialHierarchyMap.forEach((h: any) => {
        officialCategoriesPromptText += `- Kategori Utama: "${h.parentName}" -> Sub-Kategori yang diizinkan: ${JSON.stringify(h.subNames)}\n`
      })
    } else {
      officialCategoriesPromptText += `- Kategori Utama: "Lain-lain" -> Sub-Kategori: ["Umum"]\n`
    }

    // 4. Retrieve Self-Learned Knowledge Base from Past Verified Receipts
    const learnedKnowledgeContext = await getLearnedKnowledgeContext()

    // 5. Construct Multimodal Prompt with Injected Active Memory & Strict Database Constraints
    const promptText = `
Anda adalah ahli ekstraksi visual data struk/nota/surat jalan/faktur fisik tingkat tinggi.
Tugas Anda adalah membaca foto nota atau surat jalan berikut.

${officialCategoriesPromptText}

${learnedKnowledgeContext}

PETUNJUK ANALISIS MULTIMODAL & ATURAN TERKATALOG:
1. DETEKSI ORIENTASI: Baca teks sesuai arah tulisan.
2. NAMA TOKO / PT / COFFEE SHOP: Cari di bagian header paling atas.
3. TANGGAL TRANSAKSI: Format YYYY-MM-DD. Gunakan (${new Date().toISOString().split("T")[0]}) jika tidak tertera.
4. RINCIAN ITEM PRODUK (PENTING! DILARANG MEMBUAT KATEGORI ATAU SUB-KATEGORI SENDIRI):
   - Baca setiap baris barang dalam tabel nota/surat jalan.
   - Baca HARGA atau JUMLAH RP untuk tiap barang. Konversi ke angka murni tanpa titik/koma desimal.
   - Tentukan quantity (banyaknya pcs/crt/pack) jika tertera.
   - PILIH "category" (Kategori Utama) HANYA DARI DAFTAR RESMI DI ATAS! (DILARANG menciptakan nama kategori baru).
   - PILIH "subCategory" HANYA DARI DAFTAR SUB-KATEGORI RESMI YANG SESUAI DI ATAS! (Jika tidak tertera, isi "Umum").
   - ABAIKAN baris non-barang (seperti nomor surat jalan, penerima, pengirim, disetujui oleh, hormat kami).
5. PAJAK / PPN: Cari nilai PPN atau Pajak jika ada. Jika tidak ada, isi 0.
6. SUBTOTAL & TOTAL NETTO AKHIR:
   - "subtotal": Jumlah harga barang sebelum PPN.
   - "totalAmount": Netto / Total Akhir pembayaran.

TEKS OCR PENDUKUNG:
"""
${rawText || "Tidak ada teks OCR"}
"""

Keluarkan HANYA format JSON valid berikut tanpa markdown/penjelasan tambahan:
{
  "merchantName": "Nama Toko / PT",
  "date": "YYYY-MM-DD",
  "subtotal": 1920000,
  "taxAmount": 211200,
  "totalAmount": 2131205,
  "items": [
    {
      "name": "Nama Produk / Barang",
      "category": "Bahan Baku",
      "subCategory": "Susu",
      "price": 1920000,
      "quantity": 10
    }
  ]
}
`

    const contentsParts: any[] = []

    if (imageBase64 && typeof imageBase64 === "string" && imageBase64.includes("base64,")) {
      if (imageBase64.length > 14 * 1024 * 1024) {
        return NextResponse.json({ error: "Ukuran gambar terlalu besar (Maksimal 10MB)" }, { status: 400 })
      }

      const [header, data] = imageBase64.split("base64,")
      const mimeTypeMatch = header.match(/data:(.*?);/)
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg"

      contentsParts.push({
        inlineData: {
          mimeType,
          data,
        },
      })
    }

    contentsParts.push({ text: promptText })

    let textOutput = ""

    try {
      textOutput = await callGeminiRestApi(apiKey, "gemini-flash-latest", contentsParts)
    } catch (e1: any) {
      if (e1.status === 429 || e1.message === "GOOGLE_CLOUD_QUOTA_EXCEEDED") {
        return NextResponse.json(
          {
            error: "QUOTA_EXCEEDED",
            message: "Kuota harian Google Cloud Gemini API telah habis atau batas rate limit tercapai. Silakan coba lagi esok hari.",
          },
          { status: 429 }
        )
      }

      console.warn("gemini-flash-latest failed, trying gemini-2.0-flash-lite:", e1.message)
      try {
        textOutput = await callGeminiRestApi(apiKey, "gemini-2.0-flash-lite", contentsParts)
      } catch (e2: any) {
        if (e2.status === 429 || e2.message === "GOOGLE_CLOUD_QUOTA_EXCEEDED") {
          return NextResponse.json(
            {
              error: "QUOTA_EXCEEDED",
              message: "Kuota Google Cloud Gemini API telah habis (Rate limit 429). Silakan coba lagi esok hari.",
            },
            { status: 429 }
          )
        }

        console.warn("gemini-2.0-flash-lite failed, trying gemini-2.0-flash:", e2.message)
        try {
          textOutput = await callGeminiRestApi(apiKey, "gemini-2.0-flash", contentsParts)
        } catch (e3: any) {
          if (e3.status === 429 || e3.message === "GOOGLE_CLOUD_QUOTA_EXCEEDED") {
            return NextResponse.json(
              {
                error: "QUOTA_EXCEEDED",
                message: "Kuota Google Cloud Gemini API telah habis (Rate limit 429). Silakan coba lagi esok hari.",
              },
              { status: 429 }
            )
          }

          console.error("Gemini API parsing failed:", e3)
          return NextResponse.json(
            {
              error: "API_PARSE_FAILED",
              message: `Gagal memproses nota dari server AI: ${e3.message || "Kesalahan API"}`,
            },
            { status: 502 }
          )
        }
      }
    }

    const jsonMatch = textOutput.match(/\{[\s\S]*\}/)
    const cleanedJson = jsonMatch ? jsonMatch[0] : textOutput

    let parsedJson: ParsedReceiptResult
    try {
      parsedJson = JSON.parse(cleanedJson) as ParsedReceiptResult
    } catch (parseErr) {
      console.error("Failed to parse JSON from Gemini output:", textOutput)
      return NextResponse.json(
        {
          error: "API_PARSE_INVALID_JSON",
          message: "Respon dari server AI tidak berbentuk format JSON yang valid. Silakan coba lagi.",
        },
        { status: 500 }
      )
    }

    if (!parsedJson.merchantName) parsedJson.merchantName = "Nota / Toko"
    if (!parsedJson.date) parsedJson.date = new Date().toISOString().split("T")[0]
    if (!Array.isArray(parsedJson.items)) parsedJson.items = []

    const validParentNames = officialHierarchyMap.map((h: any) => h.parentName)
    const defaultParent = validParentNames[0] || "Lain-lain"

    // Strict Backend Enforcer: Ensure category & subCategory strictly exist in database lists
    parsedJson.items = parsedJson.items.map((it) => {
      const rawCat = (it.category || "").trim()
      // Match parent category against official DB list
      const matchedParentObj = officialHierarchyMap.find(
        (h: any) =>
          h.parentName.toLowerCase().trim() === rawCat.toLowerCase() ||
          rawCat.toLowerCase().includes(h.parentName.toLowerCase()) ||
          h.parentName.toLowerCase().includes(rawCat.toLowerCase())
      )

      const finalParentCategory = matchedParentObj ? matchedParentObj.parentName : defaultParent
      const allowedSubs = matchedParentObj ? matchedParentObj.subNames : ["Umum"]

      const rawSub = (it.subCategory || "").trim()
      const matchedSub = allowedSubs.find(
        (s: string) => s.toLowerCase().trim() === rawSub.toLowerCase()
      )
      const finalSubCategory = matchedSub || "Umum"

      return {
        name: it.name || "Item",
        category: finalParentCategory,
        subCategory: finalSubCategory,
        price: parseIndonesianPrice(String(it.price)),
        quantity: Number(it.quantity) || 1,
      }
    })

    parsedJson.subtotal = parseIndonesianPrice(String(parsedJson.subtotal))
    parsedJson.taxAmount = parseIndonesianPrice(String(parsedJson.taxAmount))
    parsedJson.totalAmount = parseIndonesianPrice(String(parsedJson.totalAmount))

    if (!parsedJson.subtotal && parsedJson.items.length > 0) {
      parsedJson.subtotal = parsedJson.items.reduce((acc, it) => acc + it.price * it.quantity, 0)
    }
    if (!parsedJson.totalAmount) {
      parsedJson.totalAmount = parsedJson.subtotal + parsedJson.taxAmount
    }

    // Atomically increment quota counter in database & return real-time remaining count
    const remainingQuota = await incrementRateLimit(cleanIp)

    const response = NextResponse.json({
      result: parsedJson,
      mode: "gemini_multimodal_vision",
      remainingQuota,
    })

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    return response
  } catch (error: any) {
    console.error("Parse Receipt Server Error:", error)
    return NextResponse.json({ error: "SERVER_ERROR", message: error.message || "Gagal memproses nota" }, { status: 500 })
  }
}
