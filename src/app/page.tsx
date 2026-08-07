"use client"

import React, { useState } from "react"
import { extractTextFromReceipt } from "@/lib/ocr"
import { ReceiptImageUpload, BatchFileItem } from "@/components/ReceiptImageUpload"
import { VerificationSplitScreen } from "@/components/VerificationSplitScreen"
import { ReceiptHistoryDashboard, ReceiptData } from "@/components/ReceiptHistoryDashboard"
import { ParsedReceiptResult } from "@/app/api/parse-receipt/route"
import { Camera, History, ShieldCheck, CheckCircle2 } from "lucide-react"

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan")

  // Scanning State
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrStatus, setOcrStatus] = useState("")
  const [ocrPercent, setOcrPercent] = useState(0)

  // Batch Queue State for Mass Upload
  const [batchQueue, setBatchQueue] = useState<BatchFileItem[]>([])
  const [batchIndex, setBatchIndex] = useState(0)
  const [batchToast, setBatchToast] = useState<string | null>(null)

  // Verification & Editing State
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [rawOcrText, setRawOcrText] = useState("")
  const [parsedResult, setParsedResult] = useState<ParsedReceiptResult | null>(null)
  const [parsingMode, setParsingMode] = useState<string>("gemini_multimodal_vision")
  const [quotaError, setQuotaError] = useState<string | null>(null)

  // Saved Receipt Editing State
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null)
  const [existingPaymentMethod, setExistingPaymentMethod] = useState<string>("Cash")
  const [existingPaymentStatus, setExistingPaymentStatus] = useState<string>("Lunas")
  const [existingNote, setExistingNote] = useState<string>("")

  // Fetch with retry helper for resilient network calls
  const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, delay = 1000): Promise<Response> => {
    try {
      const res = await fetch(url, options)
      if (!res.ok && res.status >= 500 && retries > 0) {
        await new Promise((r) => setTimeout(r, delay))
        return fetchWithRetry(url, options, retries - 1, delay * 1.5)
      }
      return res
    } catch (err) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, delay))
        return fetchWithRetry(url, options, retries - 1, delay * 1.5)
      }
      throw err
    }
  }

  const processBatchItem = async (index: number, queue: BatchFileItem[]) => {
    if (index < 0 || index >= queue.length) return

    const item = queue[index]
    setIsProcessing(true)
    setQuotaError(null)
    setEditingReceiptId(null)
    setImagePreviewUrl(item.base64)
    setOcrStatus(`Memproses Nota #${index + 1} dari ${queue.length} via Gemini AI...`)
    setOcrPercent(0.3)

    const userApiKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || "" : ""

    // High-speed processing: Send compressed base64 directly to Gemini Server API
    const parsePromise = fetchWithRetry("/api/parse-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(userApiKey ? { "x-gemini-api-key": userApiKey } : {}),
      },
      body: JSON.stringify({
        rawText: "",
        imageBase64: item.base64,
        apiKey: userApiKey,
      }),
    })

    // Run Tesseract background OCR asynchronously for debugging preview
    extractTextFromReceipt(item.base64)
      .then((txt) => setRawOcrText(txt))
      .catch(() => setRawOcrText("Nota Belanja"))

    try {
      setOcrPercent(0.7)
      const response = await parsePromise
      const data = await response.json()

      if (!response.ok) {
        if (response.status === 429 || data.error === "QUOTA_EXCEEDED") {
          const limitMsg =
            data.message ||
            "Batas kuota harian scan nota (20 scan/hari) atau kuota Google Cloud telah tercapai. Silakan coba lagi besok."
          setQuotaError(limitMsg)
          throw new Error(limitMsg)
        }
        throw new Error(data.message || data.error || "Gagal memproses nota via Gemini API")
      }

      setOcrPercent(1.0)
      setOcrStatus("Pemrosesan AI Selesai!")

      if (data.result) {
        setParsedResult(data.result)
        setParsingMode(data.mode || "gemini_multimodal_vision")
      }
    } catch (err: any) {
      console.error("Scanning Error:", err)
      if (!quotaError) {
        alert(`Gagal memproses nota #${index + 1}: ${err.message || "Kesalahan server"}`)
      }
      setImagePreviewUrl(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImageSelected = async (file: File, base64Data: string) => {
    setBatchQueue([])
    setBatchIndex(0)
    processBatchItem(0, [{ file, base64: base64Data }])
  }

  const handleBatchSelected = async (batch: BatchFileItem[]) => {
    if (!batch || batch.length === 0) return
    setBatchQueue(batch)
    setBatchIndex(0)
    processBatchItem(0, batch)
  }

  const handleEditReceipt = (receipt: ReceiptData) => {
    setEditingReceiptId(receipt.id)
    setBatchQueue([])
    setImagePreviewUrl(receipt.imageUrl || "")
    setRawOcrText("")
    setParsedResult({
      merchantName: receipt.merchantName,
      date: receipt.date,
      subtotal: receipt.subtotal || receipt.totalAmount - (receipt.taxAmount || 0),
      taxAmount: receipt.taxAmount || 0,
      totalAmount: receipt.totalAmount,
      items: receipt.items.map((it) => ({
        name: it.name,
        category: it.category,
        subCategory: it.subCategory || "Umum",
        price: it.price,
        quantity: it.quantity,
      })),
    })
    setExistingPaymentMethod(receipt.paymentMethod || "Cash")
    setExistingPaymentStatus(receipt.paymentStatus || "Lunas")
    setExistingNote(receipt.note || "")
    setParsingMode("saved_receipt_edit")
  }

  const handleSaveSuccess = () => {
    // Check if there are remaining items in the Batch Upload Queue
    if (batchQueue.length > 1 && batchIndex < batchQueue.length - 1) {
      const nextIdx = batchIndex + 1
      setBatchIndex(nextIdx)

      setBatchToast(`Nota ke-${batchIndex + 1} berhasil disimpan! Memproses Nota ke-${nextIdx + 1} dari ${batchQueue.length}...`)
      setTimeout(() => setBatchToast(null), 4000)

      processBatchItem(nextIdx, batchQueue)
    } else {
      // Completed full batch queue or single upload
      if (batchQueue.length > 1) {
        setBatchToast(`Semua ${batchQueue.length} nota batch berhasil disetujui & disimpan!`)
        setTimeout(() => setBatchToast(null), 4000)
      }
      setBatchQueue([])
      setBatchIndex(0)
      setImagePreviewUrl(null)
      setParsedResult(null)
      setEditingReceiptId(null)
      setActiveTab("history")
    }
  }

  const handleSkipBatch = () => {
    if (batchQueue.length > 1 && batchIndex < batchQueue.length - 1) {
      const nextIdx = batchIndex + 1
      setBatchIndex(nextIdx)
      processBatchItem(nextIdx, batchQueue)
    }
  }

  const handleCancelVerification = () => {
    setBatchQueue([])
    setBatchIndex(0)
    setImagePreviewUrl(null)
    setParsedResult(null)
    setEditingReceiptId(null)
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans pb-16 sm:pb-0">
      {/* Toast Notification */}
      {batchToast && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{batchToast}</span>
        </div>
      )}

      {/* Top Header Navbar */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-md shadow-emerald-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base sm:text-lg tracking-tight leading-tight flex items-center gap-2">
                Nota-Photo
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Cloud Secured
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Server-Side Gemini Cloud API Scanner & Relational Itemization
              </p>
            </div>
          </div>

          {/* Desktop Tab Selector */}
          <div className="hidden sm:flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => {
                setImagePreviewUrl(null)
                setActiveTab("scan")
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "scan" && !imagePreviewUrl
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Camera className="w-4 h-4" />
              Scan Nota Baru
            </button>

            <button
              onClick={() => {
                setImagePreviewUrl(null)
                setActiveTab("history")
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "history" && !imagePreviewUrl
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <History className="w-4 h-4" />
              Riwayat & Laporan
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {imagePreviewUrl && parsedResult ? (
          <VerificationSplitScreen
            imagePreviewUrl={imagePreviewUrl}
            rawOcrText={rawOcrText}
            initialResult={parsedResult}
            parsingMode={parsingMode}
            editingReceiptId={editingReceiptId}
            existingPaymentMethod={existingPaymentMethod}
            existingPaymentStatus={existingPaymentStatus}
            existingNote={existingNote}
            batchInfo={batchQueue.length > 1 ? { currentIndex: batchIndex, totalCount: batchQueue.length } : null}
            onSkipBatch={handleSkipBatch}
            onSaveSuccess={handleSaveSuccess}
            onCancel={handleCancelVerification}
          />
        ) : activeTab === "scan" ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold border border-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Fast Server-Side AI Vision
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Scan Struk & Surat Jalan
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Pilih foto nota dari galeri (1 atau banyak sekaligus untuk Mass Batch Upload) atau kamera HP/Tablet.
              </p>
            </div>

            <ReceiptImageUpload
              onImageSelected={handleImageSelected}
              onBatchSelected={handleBatchSelected}
              isProcessing={isProcessing}
              ocrProgressStatus={ocrStatus}
              ocrProgressPercent={ocrPercent}
              quotaError={quotaError}
            />
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <ReceiptHistoryDashboard
              onScanNewReceipt={() => setActiveTab("scan")}
              onEditReceipt={handleEditReceipt}
            />
          </div>
        )}
      </div>

      {/* STICKY BOTTOM NAVIGATION FOR MOBILE DEVICES (< sm) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-slate-900 border-t border-slate-800 p-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => {
            setImagePreviewUrl(null)
            setActiveTab("scan")
          }}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === "scan" && !imagePreviewUrl ? "text-emerald-400 bg-slate-800" : "text-slate-400"
          }`}
        >
          <Camera className="w-5 h-5" />
          Scan Nota
        </button>

        <button
          onClick={() => {
            setImagePreviewUrl(null)
            setActiveTab("history")
          }}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === "history" && !imagePreviewUrl ? "text-emerald-400 bg-slate-800" : "text-slate-400"
          }`}
        >
          <History className="w-5 h-5" />
          Riwayat
        </button>
      </div>
    </main>
  )
}
