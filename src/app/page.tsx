"use client"

import React, { useState, useEffect, useRef } from "react"
import { extractTextFromReceipt } from "@/lib/ocr"
import { ReceiptImageUpload, BatchFileItem } from "@/components/ReceiptImageUpload"
import { VerificationSplitScreen } from "@/components/VerificationSplitScreen"
import { ReceiptHistoryDashboard, ReceiptData } from "@/components/ReceiptHistoryDashboard"
import { AdminLoginScreen } from "@/components/AdminLoginScreen"
import { ParsedReceiptResult } from "@/app/api/parse-receipt/route"
import { Camera, History, ShieldCheck, CheckCircle2, Maximize2, LogOut, UserCheck, Loader2 } from "lucide-react"

export default function HomePage() {
  // Admin Auth Gate State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [adminUser, setAdminUser] = useState<string>("admin")

  const [activeTab, setActiveTab] = useState<"scan" | "history">("scan")

  // Scanning State
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrStatus, setOcrStatus] = useState("")
  const [ocrPercent, setOcrPercent] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

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

  // Realtime Quota Status State
  const [quotaInfo, setQuotaInfo] = useState<{
    dailyLimit: number
    remaining: number
    used: number
    allowed: boolean
  } | null>(null)

  const fetchQuota = async () => {
    try {
      const res = await fetch("/api/quota", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setQuotaInfo(data)
      }
    } catch (e) {
      console.error("Failed to fetch quota:", e)
    }
  }

  useEffect(() => {
    fetchQuota()
  }, [isProcessing])

  // Initial Auth Check on Mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session")
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated) {
            setIsAuthenticated(true)
            if (data.user?.username) setAdminUser(data.user.username)
            return
          }
        }

        const localToken = localStorage.getItem("nota_admin_token")
        const localUser = localStorage.getItem("nota_admin_user")
        if (localToken) {
          setIsAuthenticated(true)
          if (localUser) setAdminUser(localUser)
          return
        }

        setIsAuthenticated(false)
      } catch {
        setIsAuthenticated(false)
      }
    }

    checkSession()
  }, [])

  const handleLogout = async () => {
    if (isProcessing) return
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {}
    localStorage.removeItem("nota_admin_token")
    localStorage.removeItem("nota_admin_user")
    setIsAuthenticated(false)
  }

  // Cancel scanning in-flight request
  const handleCancelScan = () => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort()
      } catch {}
      abortControllerRef.current = null
    }
    setIsProcessing(false)
    setBatchQueue([])
    setBatchIndex(0)
    setImagePreviewUrl(null)
    setParsedResult(null)
    setQuotaError(null)
    setOcrStatus("")
    setOcrPercent(0)
  }

  // Fetch with retry helper for resilient network calls
  const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, delay = 1000): Promise<Response> => {
    try {
      const res = await fetch(url, options)
      if (!res.ok && res.status >= 500 && retries > 0) {
        await new Promise((r) => setTimeout(r, delay))
        return fetchWithRetry(url, options, retries - 1, delay * 1.5)
      }
      return res
    } catch (err: any) {
      if (err.name === "AbortError") throw err
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, delay))
        return fetchWithRetry(url, options, retries - 1, delay * 1.5)
      }
      throw err
    }
  }

  const processBatchItem = async (index: number, queue: BatchFileItem[]) => {
    if (index < 0 || index >= queue.length) return

    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort()
      } catch {}
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    const item = queue[index]
    setIsProcessing(true)
    setQuotaError(null)
    setEditingReceiptId(null)
    setImagePreviewUrl(item.base64)
    setOcrStatus(`Memproses Nota #${index + 1} dari ${queue.length}...`)
    setOcrPercent(0.3)

    const userApiKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || "" : ""

    // High-speed processing: Send compressed base64 directly to Gemini Server API
    const parsePromise = fetchWithRetry("/api/parse-receipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(userApiKey ? { "x-gemini-api-key": userApiKey } : {}),
      },
      signal: controller.signal,
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
            "Batas harian pemindaian nota telah tercapai. Silakan coba lagi besok."
          setQuotaError(limitMsg)
          throw new Error(limitMsg)
        }
        throw new Error(data.message || data.error || "Gagal memproses nota")
      }

      setOcrPercent(1.0)
      setOcrStatus("Pemrosesan Selesai!")

      if (data.result) {
        setParsedResult(data.result)
        setParsingMode(data.mode || "gemini_multimodal_vision")
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Pemindaian dibatalkan oleh pengguna.")
        return
      }
      console.error("Scanning Error:", err)
      if (!quotaError) {
        alert(`Gagal memproses nota #${index + 1}: ${err.message || "Kesalahan server"}`)
      }
      setImagePreviewUrl(null)
    } finally {
      setIsProcessing(false)
      fetchQuota()
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

  // Render Auth Gate Guard
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col items-center justify-center space-y-3 font-sans">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Memverifikasi Sesi Admin...</p>
      </div>
    )
  }

  if (isAuthenticated === false) {
    return (
      <AdminLoginScreen
        onLoginSuccess={(_token, user) => {
          setAdminUser(user)
          setIsAuthenticated(true)
        }}
      />
    )
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

                {/* Quota Status Dot Indicator with Tooltip */}
                {quotaInfo && (
                  <div
                    className="relative group inline-flex items-center cursor-pointer ml-1"
                    title={`Kuota Scan: ${quotaInfo.remaining} / ${quotaInfo.dailyLimit}`}
                  >
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition-all">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shadow-xs transition-all ${
                          !quotaInfo.allowed || quotaInfo.remaining === 0
                            ? "bg-red-500 shadow-red-500/50"
                            : quotaInfo.remaining <= Math.ceil(quotaInfo.dailyLimit * 0.25)
                            ? "bg-amber-400 animate-pulse shadow-amber-400/50"
                            : "bg-emerald-400 animate-pulse shadow-emerald-400/50"
                        }`}
                      />
                      <span className="text-[11px] font-mono text-slate-300 font-bold">
                        {quotaInfo.remaining}/{quotaInfo.dailyLimit}
                      </span>
                    </div>

                    {/* Hover Tooltip Card */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none transition-all animate-in fade-in zoom-in-95 duration-150">
                      <div className="w-2 h-2 bg-slate-800 rotate-45 border-t border-l border-slate-700 -mb-1" />
                      <div className="bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 shadow-xl whitespace-nowrap flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            !quotaInfo.allowed || quotaInfo.remaining === 0
                              ? "bg-red-500"
                              : quotaInfo.remaining <= Math.ceil(quotaInfo.dailyLimit * 0.25)
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                          }`}
                        />
                        <span>
                          Kuota Scan: <strong>{quotaInfo.remaining}</strong> / {quotaInfo.dailyLimit}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Pemindai & Rekap Nota Digital
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop Tab Selector */}
            <div className="hidden sm:flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  if (isProcessing) return
                  setImagePreviewUrl(null)
                  setActiveTab("scan")
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "scan" && !imagePreviewUrl
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                } ${isProcessing ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
              >
                <Camera className="w-4 h-4" />
                Scan Nota
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  if (isProcessing) return
                  setImagePreviewUrl(null)
                  setActiveTab("history")
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "history" && !imagePreviewUrl
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                } ${isProcessing ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
              >
                <History className="w-4 h-4" />
                Riwayat
              </button>
            </div>

            {/* Logout Admin Button */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleLogout}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 font-bold text-xs border border-red-500/20 transition-all ml-1 ${
                isProcessing ? "opacity-40 cursor-not-allowed pointer-events-none" : "hover:bg-red-500/20 active:bg-red-500/30 active:scale-95 cursor-pointer"
              }`}
              title={isProcessing ? "Sedang memproses scan..." : "Keluar Admin"}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar</span>
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
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Scan Nota & Struk
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-md mx-auto">
                Unggah foto dari galeri atau kamera langsung.
              </p>
            </div>

            <ReceiptImageUpload
              onImageSelected={handleImageSelected}
              onBatchSelected={handleBatchSelected}
              onCancelScan={handleCancelScan}
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
              currentAdminUser={adminUser}
            />
          </div>
        )}
      </div>

      {/* STICKY BOTTOM NAVIGATION FOR MOBILE DEVICES (< sm) - Hidden during verification split screen */}
      {!imagePreviewUrl && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-slate-900 border-t border-slate-800 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-around shadow-2xl">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => {
              if (isProcessing) return
              setImagePreviewUrl(null)
              setActiveTab("scan")
            }}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === "scan" && !imagePreviewUrl ? "text-emerald-400 bg-slate-800" : "text-slate-400"
            } ${isProcessing ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
          >
            <Camera className="w-5 h-5" />
            Scan Nota
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => {
              if (isProcessing) return
              setImagePreviewUrl(null)
              setActiveTab("history")
            }}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === "history" && !imagePreviewUrl ? "text-emerald-400 bg-slate-800" : "text-slate-400"
            } ${isProcessing ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}`}
          >
            <History className="w-5 h-5" />
            Riwayat
          </button>
        </div>
      )}
    </main>
  )
}
