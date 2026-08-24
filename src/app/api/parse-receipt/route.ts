import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, incrementRateLimit, normalizeIp } from "@/lib/rateLimiter"
import { getLearnedKnowledgeContext, matchItemWithLearnedMemory } from "@/lib/selfLearningEngine"
import { getOrSeedCategories } from "@/lib/categories"
import { GoogleGenAI } from "@google/genai"

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
  discountAmount: number
  taxAmount: number
  totalAmount: number
  items: ParsedItem[]
}

function parseIndonesianPrice(str: string | number): number {
  if (typeof str === "number") return isNaN(str) ? 0 : str
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
  const cleanKey = (apiKey || "").trim().replace(/^["']|["']$/g, "")
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${cleanKey}`
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: contentsParts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    if (errText.includes("API_KEY_INVALID") || errText.includes("API key not valid") || errText.includes("INVALID_ARGUMENT")) {
      const invalidErr = new Error("GOOGLE_API_KEY_INVALID: API Key tidak valid. Silakan buat API Key gratis di https://aistudio.google.com/app/apikey")
      ;(invalidErr as any).status = 400
      throw invalidErr
    }
    if (response.status === 429 || errText.includes("RESOURCE_EXHAUSTED") || errText.includes("Quota exceeded")) {
      const quotaErr = new Error("GOOGLE_CLOUD_QUOTA_EXCEEDED")
      ;(quotaErr as any).status = 429
      throw quotaErr
    }
    if (response.status === 404) {
      throw new Error(`MODEL_NOT_FOUND: Model ${modelName} tidak ditemukan`)
    }
    throw new Error(`Gemini API Error (${response.status}): ${errText}`)
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
          message: `Batas harian scan nota (${rateLimit.remaining} scan/hari) telah tercapai. Silakan coba lagi besok.`,
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

    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json(
        {
          error: "INVALID_API_KEY",
          message: "Kunci GEMINI_API_KEY belum dikonfigurasi di lingkungan server (.env.local) atau Vercel. Silakan buat API Key gratis di https://aistudio.google.com/app/apikey",
        },
        { status: 400 }
      )
    }

    // 3. Fetch Official Parent & Sub Categories strictly from Database (auto-seeded if empty)
    const categoryHierarchy = await getOrSeedCategories()

    // Build DB Hierarchy Map
    const officialHierarchyMap = categoryHierarchy.map((parent) => ({
      parentName: parent.name,
      subNames: Array.from(new Set(["Umum", ...parent.subCategories.map((s) => s.name)])),
    }))

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
5. DISKON / POTONGAN HARGA / PROMO: Cari nilai diskon, potongan harga, promo, atau voucher (baik dalam nominal Rp maupun persentase %). Konversi ke angka nominal murni dalam Rupiah (Rp). Jika tidak ada, isi 0.
6. PAJAK / PPN: Cari nilai PPN atau Pajak jika ada. Jika tidak ada, isi 0.
7. SUBTOTAL & TOTAL NETTO AKHIR:
   - "subtotal": Jumlah harga barang sebelum diskon dan PPN.
   - "discountAmount": Nominal potongan diskon dalam Rupiah.
   - "totalAmount": Netto / Total Akhir pembayaran (Subtotal - Diskon + PPN).

TEKS OCR PENDUKUNG:
"""
${rawText || "Tidak ada teks OCR"}
"""

Keluarkan HANYA format JSON valid berikut tanpa markdown/penjelasan tambahan:
{
  "merchantName": "Nama Toko / PT",
  "date": "YYYY-MM-DD",
  "subtotal": 1920000,
  "discountAmount": 0,
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

    const candidateModels = [
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-3.6-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-flash-latest",
    ]
    let textOutput = ""
    let lastError: any = null
    let usedModel = candidateModels[0]

    for (const model of candidateModels) {
      try {
        console.log(`[Gemini OCR API] Trying model candidate: ${model}...`)
        textOutput = await callGeminiRestApi(apiKey, model, contentsParts)
        if (textOutput) {
          usedModel = model
          console.log(`[Gemini OCR API] Successfully parsed receipt using model: ${usedModel}`)
          break
        }
      } catch (err: any) {
        lastError = err
        if (err.message?.includes("GOOGLE_API_KEY_INVALID")) {
          return NextResponse.json({ error: "INVALID_API_KEY", message: err.message }, { status: 400 })
        }
        console.warn(`[Gemini OCR API] Model ${model} failed or rate limited (${err.message}). Auto-switching to next candidate...`)
      }
    }

    if (!textOutput) {
      if (lastError?.status === 429 || lastError?.message === "GOOGLE_CLOUD_QUOTA_EXCEEDED") {
        return NextResponse.json(
          {
            error: "QUOTA_EXCEEDED",
            message: "Batas frekuensi Google Gemini API (Rate limit 429) tercapai. Silakan coba beberapa detik lagi.",
          },
          { status: 429 }
        )
      }

      console.error("Gemini API parsing failed all candidates:", lastError)
      return NextResponse.json(
        {
          error: "API_PARSE_FAILED",
          message: `Gagal memproses nota dari server AI: ${lastError?.message || "Kesalahan API"}`,
        },
        { status: 502 }
      )
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

    // 6. Hybrid Auto-Matcher: Local Fast Similarity Engine + AI Semantic Reasoning
    parsedJson.items = await Promise.all(
      parsedJson.items.map(async (it) => {
        const rawItemName = (it.name || "Item").trim()

        // Local Fuzzy Similarity Matcher (Checks token overlap & similarity against learned memory)
        const localMatch = await matchItemWithLearnedMemory(rawItemName, categoryHierarchy)

        let targetCat = localMatch ? localMatch.category : (it.category || "").trim()
        let targetSub = localMatch ? localMatch.subCategory : (it.subCategory || "").trim()

        // Match parent category strictly against official DB list (NEVER create new categories)
        const matchedParentObj = officialHierarchyMap.find(
          (h: any) =>
            h.parentName.toLowerCase().trim() === targetCat.toLowerCase().trim() ||
            targetCat.toLowerCase().trim().includes(h.parentName.toLowerCase().trim()) ||
            h.parentName.toLowerCase().trim().includes(targetCat.toLowerCase().trim())
        )

        const finalParentCategory = matchedParentObj ? matchedParentObj.parentName : defaultParent
        const allowedSubs = matchedParentObj ? matchedParentObj.subNames : ["Umum"]

        const matchedSub = allowedSubs.find(
          (s: string) => s.toLowerCase().trim() === targetSub.toLowerCase().trim()
        )
        const finalSubCategory = matchedSub || "Umum"

        return {
          name: rawItemName,
          category: finalParentCategory,
          subCategory: finalSubCategory,
          price: parseIndonesianPrice(String(it.price)),
          quantity: Number(it.quantity) || 1,
        }
      })
    )

    parsedJson.subtotal = parseIndonesianPrice(String(parsedJson.subtotal))
    parsedJson.discountAmount = parseIndonesianPrice(String(parsedJson.discountAmount || 0))
    parsedJson.taxAmount = parseIndonesianPrice(String(parsedJson.taxAmount))
    parsedJson.totalAmount = parseIndonesianPrice(String(parsedJson.totalAmount))

    if (!parsedJson.subtotal && parsedJson.items.length > 0) {
      parsedJson.subtotal = parsedJson.items.reduce((acc, it) => acc + it.price * it.quantity, 0)
    }
    if (!parsedJson.totalAmount) {
      parsedJson.totalAmount = Math.max(0, parsedJson.subtotal - parsedJson.discountAmount + parsedJson.taxAmount)
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
