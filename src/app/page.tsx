"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { extractTextFromReceipt } from "@/lib/ocr"
import { ReceiptImageUpload, BatchFileItem } from "@/components/ReceiptImageUpload"
import { VerificationSplitScreen } from "@/components/VerificationSplitScreen"
import { ReceiptHistoryDashboard, ReceiptData } from "@/components/ReceiptHistoryDashboard"
import { AdminLoginScreen } from "@/components/AdminLoginScreen"
import { SettingsModal } from "@/components/SettingsModal"
import { ParsedReceiptResult } from "@/app/api/parse-receipt/route"
import { Camera, History, ShieldCheck, CheckCircle2, Maximize2, LogOut, UserCheck, Loader2, Settings } from "lucide-react"

export default function HomePage() {
  // Admin Auth Gate State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [adminUser, setAdminUser] = useState<string>("rama")

  const [activeTab, setActiveTab] = useState<"scan" | "history">(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("nota_admin_user") || "rama"
      const key = `nota_active_tab_${savedUser.toLowerCase()}`
      const savedTab = localStorage.getItem(key) || localStorage.getItem("nota_active_tab")
      if (savedTab === "scan" || savedTab === "history") return savedTab as "scan" | "history"
    }
    return "scan"
  })
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // Auto-Persist Active Navigation Tab Per-Account
  useEffect(() => {
    if (typeof window !== "undefined" && adminUser) {
      const key = `nota_active_tab_${adminUser.trim().toLowerCase()}`
      localStorage.setItem(key, activeTab)
      localStorage.setItem("nota_active_tab", activeTab)
    }
  }, [activeTab, adminUser])

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

  // Helper to clear verification draft for a specific admin user
  const clearVerificationDraft = useCallback((targetUser?: string) => {
    const userToClear = targetUser || adminUser
    if (userToClear) {
      try {
        const key = `nota_verification_draft_${userToClear.trim().toLowerCase()}`
        localStorage.removeItem(key)
      } catch (e) {}
    }
  }, [adminUser])

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

  // Browser Close / Refresh Warning Protection during Scan & Verification
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing || imagePreviewUrl || parsedResult) {
        e.preventDefault()
        e.returnValue = "Proses verifikasi/scan nota sedang berjalan. Yakin ingin menutup atau merefresh halaman?"
        return e.returnValue
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isProcessing, imagePreviewUrl, parsedResult])

  // Restore Per-Account Active Verification Draft State on Session Load or Admin Account Switch
  useEffect(() => {
    if (!isAuthenticated || !adminUser) return

    const cleanUser = adminUser.trim().toLowerCase()
    const draftKey = `nota_verification_draft_${cleanUser}`
    const savedTabKey = `nota_active_tab_${cleanUser}`

    try {
      const savedTab = localStorage.getItem(savedTabKey)
      if (savedTab === "scan" || savedTab === "history") {
        setActiveTab(savedTab as "scan" | "history")
      }

      const savedDraftStr = localStorage.getItem(draftKey)
      if (savedDraftStr) {
        const draft = JSON.parse(savedDraftStr)
        if (draft && (draft.parsedResult || draft.imagePreviewUrl || draft.editingReceiptId)) {
          console.log(`[Verification Session] Auto-restoring active draft for account: ${cleanUser}`)
          setImagePreviewUrl(draft.imagePreviewUrl || null)
          setRawOcrText(draft.rawOcrText || "")
          setParsedResult(draft.parsedResult || null)
          setParsingMode(draft.parsingMode || "gemini_multimodal_vision")
          setEditingReceiptId(draft.editingReceiptId || null)
          setExistingPaymentMethod(draft.existingPaymentMethod || "Cash")
          setExistingPaymentStatus(draft.existingPaymentStatus || "Lunas")
          setExistingNote(draft.existingNote || "")
          if (draft.batchQueue && Array.isArray(draft.batchQueue)) {
            setBatchQueue(draft.batchQueue)
            setBatchIndex(draft.batchIndex || 0)
          }

          // If session was closed mid-scan without parsedResult, re-trigger extraction automatically
          if (draft.isProcessing && !draft.parsedResult && draft.imagePreviewUrl) {
            const queueToUse = draft.batchQueue && draft.batchQueue.length > 0
              ? draft.batchQueue
              : [{ file: null, base64: draft.imagePreviewUrl }]
            setTimeout(() => {
              processBatchItem(draft.batchIndex || 0, queueToUse)
            }, 300)
          }
        }
      }
    } catch (e) {
      console.warn("Could not restore verification draft:", e)
    }
  }, [isAuthenticated, adminUser])

  // Auto-Persist Active Verification Draft Per-Account on Form Edits, Scanning, or Refresh
  useEffect(() => {
    if (!adminUser) return
    const cleanUser = adminUser.trim().toLowerCase()
    const draftKey = `nota_verification_draft_${cleanUser}`

    if (imagePreviewUrl || isProcessing || (parsedResult && editingReceiptId)) {
      const draftData = {
        imagePreviewUrl,
        rawOcrText,
        parsedResult,
        parsingMode,
        editingReceiptId,
        existingPaymentMethod,
        existingPaymentStatus,
        existingNote,
        batchQueue,
        batchIndex,
        isProcessing,
        savedAt: new Date().toISOString(),
      }
      try {
        localStorage.setItem(draftKey, JSON.stringify(draftData))
      } catch (e) {
        console.warn("Could not save verification draft:", e)
      }
    }
  }, [
    adminUser,
    imagePreviewUrl,
    rawOcrText,
    parsedResult,
    parsingMode,
    editingReceiptId,
    existingPaymentMethod,
    existingPaymentStatus,
    existingNote,
    batchQueue,
    batchIndex,
    isProcessing,
  ])

  // Handle continuous form changes from VerificationSplitScreen
  const handleDraftUpdate = useCallback((
    updatedResult: ParsedReceiptResult,
    extraFields: { paymentMethod: string; paymentStatus: string; note: string }
  ) => {
    setParsedResult(updatedResult)
    setExistingPaymentMethod(extraFields.paymentMethod)
    setExistingPaymentStatus(extraFields.paymentStatus)
    setExistingNote(extraFields.note)
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
    clearVerificationDraft(adminUser)
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
      const responseText = await response.text()

      let data: any = {}
      try {
        data = JSON.parse(responseText)
      } catch (jsonErr) {
        if (response.status === 413 || responseText.includes("Request Entity Too Large")) {
          throw new Error("Ukuran foto nota terlalu besar melebihi batas server. Sistem telah mengompres ulang gambar, silakan coba lagi.")
        }
        throw new Error(`Respon server tidak valid (${response.status}): ${responseText.slice(0, 100)}`)
      }

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

  const handleEditReceipt = async (receipt: ReceiptData) => {
    let targetReceipt = receipt

    // Fetch full receipt details (including original imageUrl) if not populated
    if (!targetReceipt.imageUrl) {
      try {
        const res = await fetch(`/api/receipts/${receipt.id}`)
        if (res.ok) {
          const fullData = await res.json()
          if (fullData && fullData.id) {
            targetReceipt = fullData
          }
        }
      } catch (err) {
        console.error("Fetch full receipt for edit error:", err)
      }
    }

    const previewUrl =
      targetReceipt.imageUrl ||
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%230f172a'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2334d399' font-family='sans-serif' font-size='16' font-weight='bold'>EDIT NOTA</text></svg>"

    setEditingReceiptId(targetReceipt.id)
    setBatchQueue([])
    setImagePreviewUrl(previewUrl)
    setRawOcrText("")
    setParsedResult({
      merchantName: targetReceipt.merchantName,
      date: targetReceipt.date,
      subtotal: targetReceipt.subtotal || targetReceipt.totalAmount - (targetReceipt.taxAmount || 0),
      taxAmount: targetReceipt.taxAmount || 0,
      totalAmount: targetReceipt.totalAmount,
      items: (targetReceipt.items || []).map((it) => ({
        name: it.name,
        category: it.category,
        subCategory: it.subCategory || "Umum",
        price: it.price,
        quantity: it.quantity,
      })),
    })
    setExistingPaymentMethod(targetReceipt.paymentMethod || "Cash")
    setExistingPaymentStatus(targetReceipt.paymentStatus || "Lunas")
    setExistingNote(targetReceipt.note || "")
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
      clearVerificationDraft(adminUser)
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
    clearVerificationDraft(adminUser)
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

            {/* Settings Gear Icon Button */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                if (isProcessing) return
                setShowSettingsModal(true)
              }}
              className={`inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-emerald-400 font-bold text-xs border border-slate-700 transition-all ml-1 cursor-pointer ${
                isProcessing ? "opacity-40 cursor-not-allowed pointer-events-none" : "active:scale-95"
              }`}
              title={isProcessing ? "Sedang memproses scan..." : "Pengaturan & Keluar"}
            >
              <Settings className="w-4 h-4 text-emerald-400" />
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
            onDraftUpdate={handleDraftUpdate}
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

      {/* Settings Modal Card */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentAdminUser={adminUser}
        onLogout={handleLogout}
      />
    </main>
  )
}
