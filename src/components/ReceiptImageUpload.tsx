"use client"

import React, { useState, useEffect } from "react"
import {
  Upload,
  Camera,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  Clock,
  CheckCircle2,
  RotateCw,
  RotateCcw,
  Play,
  AlertTriangle,
  Lock,
  ShieldCheck,
  Zap,
  Layers,
  Maximize2,
  X,
} from "lucide-react"
import { rotateImageBase64, compressImageBase64 } from "@/lib/ocr"
import { ImageInteractiveLightbox } from "@/components/ImageInteractiveLightbox"
import { useAppDialog } from "@/components/ui/app-dialog"

export interface BatchFileItem {
  file: File
  base64: string
}

interface ReceiptImageUploadProps {
  onImageSelected: (file: File, base64: string) => void
  onBatchSelected?: (batch: BatchFileItem[]) => void
  onCancelScan?: () => void
  isProcessing: boolean
  ocrProgressStatus?: string
  ocrProgressPercent?: number
  quotaError?: string | null
}

export function ReceiptImageUpload({
  onImageSelected,
  onBatchSelected,
  onCancelScan,
  isProcessing,
  ocrProgressStatus = "",
  ocrProgressPercent = 0,
  quotaError = null,
}: ReceiptImageUploadProps) {
  const { showAlert } = useAppDialog()
  const [isDragOver, setIsDragOver] = useState(false)

  // Single or Batch Files State
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [batchBase64s, setBatchBase64s] = useState<string[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null)
  const [rotationDegrees, setRotationDegrees] = useState(0)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [isCompressing, setIsCompressing] = useState(false)
  const [showLightbox, setShowLightbox] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    if (!isProcessing) {
      setShowCancelConfirm(false)
    }
  }, [isProcessing])

  // Realtime Quota status state
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

  // Timer countdown while processing
  useEffect(() => {
    let interval: any
    if (isProcessing) {
      setTimerSeconds(0)
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1)
      }, 1000)
    } else {
      setTimerSeconds(0)
    }

    return () => clearInterval(interval)
  }, [isProcessing])

  const triggerFileInput = (inputId: string) => {
    if (isQuotaReached || isProcessing) return
    const el = document.getElementById(inputId) as HTMLInputElement
    if (el) el.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    processFiles(files)
  }

  const processFiles = async (files: File[]) => {
    const validImages = files.filter((f) => f.type.startsWith("image/"))
    if (validImages.length === 0) {
      showAlert({ title: "Format Tidak Didukung", description: "Harap pilih file gambar (JPG, PNG, WEBP, HEIC)", variant: "warning" })
      return
    }

    setIsCompressing(true)
    setSelectedFiles(validImages)
    setCurrentFileIndex(0)
    setRotationDegrees(0)

    // Pre-compress all batch images in background so mass upload transitions smoothly
    const base64Results: string[] = []
    for (let i = 0; i < validImages.length; i++) {
      const b64 = await readFileAsBase64Compressed(validImages[i])
      base64Results.push(b64)
    }

    setBatchBase64s(base64Results)
    setSelectedBase64(base64Results[0])
    setIsCompressing(false)
  }

  const readFileAsBase64Compressed = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const rawBase64 = e.target?.result as string
        const compressed = await compressImageBase64(rawBase64, 1920, 1920, 0.85)
        resolve(compressed)
      }
      reader.readAsDataURL(file)
    })
  }

  const handleSelectBatchIndex = (index: number) => {
    if (index >= 0 && index < selectedFiles.length && batchBase64s[index]) {
      setCurrentFileIndex(index)
      setRotationDegrees(0)
      setSelectedBase64(batchBase64s[index])
    }
  }

  const handleStartScan = async () => {
    if (selectedFiles.length === 0 || !selectedBase64 || isCompressing) return
    if (quotaInfo && !quotaInfo.allowed) return

    if (onBatchSelected && selectedFiles.length > 1 && batchBase64s.length === selectedFiles.length) {
      const batchPayload: BatchFileItem[] = []
      for (let i = 0; i < selectedFiles.length; i++) {
        let b64 = batchBase64s[i]
        if (i === currentFileIndex && rotationDegrees !== 0) {
          b64 = await rotateImageBase64(b64, rotationDegrees)
        }
        batchPayload.push({ file: selectedFiles[i], base64: b64 })
      }
      onBatchSelected(batchPayload)
      return
    }

    let finalBase64 = selectedBase64
    if (rotationDegrees !== 0) {
      finalBase64 = await rotateImageBase64(selectedBase64, rotationDegrees)
    }

    onImageSelected(selectedFiles[currentFileIndex], finalBase64)
  }

  const handleRotateLeft = () => setRotationDegrees((prev) => (prev + 270) % 360)
  const handleRotateRight = () => setRotationDegrees((prev) => (prev + 90) % 360)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) processFiles(files)
  }

  const isQuotaReached = (quotaInfo && !quotaInfo.allowed) || Boolean(quotaError)

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Quota Limit Warning Toast / Alert */}
      {isQuotaReached && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-md space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Bermasalah pada Kuota / API Key</span>
          </div>
          <p className="text-xs text-amber-800 font-medium leading-relaxed">
            {quotaError ||
              "Batas frekuensi Google Gemini API tercapai atau API Key tidak valid. Silakan periksa kembali API Key Anda."}
          </p>
        </div>
      )}

      {/* Native Hidden File Inputs */}
      <input
        id="gallery-file-input"
        type="file"
        multiple
        accept="image/png, image/jpeg, image/jpg, image/webp, image/heic, image/*"
        className="sr-only"
        onChange={(e) => {
          handleFileChange(e)
          e.target.value = ""
        }}
        disabled={isProcessing || isQuotaReached}
      />
      <input
        id="camera-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          handleFileChange(e)
          e.target.value = ""
        }}
        disabled={isProcessing || isQuotaReached}
      />

      {/* Main Upload / Batch Screen */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!isQuotaReached) setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-3xl p-6 sm:p-10 text-center transition-all overflow-hidden ${
          isQuotaReached
            ? "border-slate-300 bg-slate-100 opacity-90 cursor-not-allowed"
            : isDragOver
            ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
            : "border-slate-300 bg-white shadow-sm hover:border-emerald-500"
        }`}
      >
        {isProcessing ? (
          /* WAITING & PROCESSING SCREEN */
          <div className="flex flex-col items-center justify-center py-4 space-y-5 animate-in fade-in zoom-in-95 duration-300">
            {selectedBase64 && (
              <div className="relative w-40 h-40 rounded-2xl bg-slate-900 overflow-hidden shadow-xl border-2 border-emerald-500/50 flex items-center justify-center">
                {/* eslint-disable-next-html-element */}
                <img
                  src={selectedBase64}
                  alt="Nota Preview"
                  className="w-full h-full object-contain opacity-85 transition-transform duration-300"
                  style={{ transform: `rotate(${rotationDegrees}deg)` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                <div className="absolute bottom-2 inset-x-0 flex justify-center">
                  <span className="text-[10px] font-black text-emerald-400 bg-slate-900/90 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" /> Membaca...
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2 text-center max-w-sm">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                <Clock className="w-3.5 h-3.5 text-emerald-600 animate-spin" /> Memproses: {timerSeconds}s
              </div>
              <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl">
                Menganalisis Nota...
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-medium">
                {ocrProgressStatus || "Membaca data nota..."}
              </p>
            </div>

            <div className="w-full max-w-sm bg-slate-50 rounded-2xl border border-slate-200 p-3 space-y-2 text-left text-xs">
              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 1. Optimasi Foto
                </span>
                <span className="text-emerald-600 font-bold">Selesai</span>
              </div>

              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" /> 2. Ekstraksi Data
                </span>
                <span className="text-blue-600 font-bold">
                  {ocrProgressPercent > 0 ? `${Math.round(ocrProgressPercent * 100)}%` : "Proses..."}
                </span>
              </div>

              <div className="flex items-center justify-between font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" /> 3. Menyiapkan Form
                </span>
                <span className="text-slate-400 font-medium">Auto...</span>
              </div>
            </div>

            <div className="w-full max-w-xs bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(Math.round(ocrProgressPercent * 100), 30)}%` }}
              />
            </div>

            {/* Cancel Scan Action Button with Verification */}
            {onCancelScan && (
              <div className="pt-2">
                {!showCancelConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 active:bg-red-100 text-slate-500 font-bold text-xs border border-slate-200 hover:border-red-200 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-2xs"
                    title="Batalkan proses scan nota"
                  >
                    <X className="w-3.5 h-3.5" />
                    Batalkan
                  </button>
                ) : (
                  <div className="bg-red-50/90 border border-red-200 rounded-2xl p-3 text-center space-y-2 animate-in fade-in zoom-in-95 duration-150 max-w-xs mx-auto shadow-sm">
                    <p className="text-xs font-bold text-red-800">
                      Yakin batalkan pemindaian?
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCancelConfirm(false)
                          onCancelScan()
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold text-xs transition-all shadow-xs active:scale-95 cursor-pointer"
                      >
                        Ya, Batalkan
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 transition-all active:scale-95 cursor-pointer"
                      >
                        Tidak
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : selectedBase64 ? (
          /* PREVIEW & ROTATION SCREEN */
          <div className="flex flex-col items-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {selectedFiles.length > 1 && (
              <div className="w-full max-w-md bg-slate-900 text-white p-3.5 rounded-2xl space-y-2 border border-slate-800 shadow-md">
                <div className="flex items-center justify-between text-xs font-bold px-1">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Layers className="w-4 h-4" /> Batch ({selectedFiles.length} Nota)
                  </span>
                  <span className="text-slate-300">Nota #{currentFileIndex + 1}</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {selectedFiles.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectBatchIndex(idx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                        currentFileIndex === idx
                          ? "bg-emerald-500 text-slate-950 shadow-md"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      Nota #{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200">
                Orientasi Foto
              </span>
              <h3 className="text-lg font-extrabold text-slate-900">
                Pastikan Gambar Tegak
              </h3>
              <p className="text-xs text-slate-500">
                Putar foto jika miring agar terbaca sempurna.
              </p>
            </div>

            <div
              onClick={() => {
                if (!isCompressing && selectedBase64) setShowLightbox(true)
              }}
              className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-slate-900 overflow-hidden shadow-2xl border-2 border-slate-800 flex items-center justify-center p-2 cursor-pointer group hover:border-emerald-500/80 transition-all"
              title="Klik untuk memperbesar foto"
            >
              {isCompressing ? (
                <div className="flex flex-col items-center justify-center space-y-2 text-emerald-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs font-bold">Mengompres Foto...</span>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-html-element */}
                  <img
                    src={selectedBase64}
                    alt="Nota Selected"
                    className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
                    style={{ transform: `rotate(${rotationDegrees}deg)` }}
                  />

                  {/* Hover Overlay Hint */}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 text-white pointer-events-none">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/90 flex items-center justify-center shadow-lg">
                      <Maximize2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[11px] font-bold bg-slate-900/90 px-2.5 py-1 rounded-full border border-slate-700">
                      Klik untuk perbesar
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRotateLeft}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Putar Kiri
              </button>

              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">
                {rotationDegrees}°
              </span>

              <button
                type="button"
                onClick={handleRotateRight}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                <RotateCw className="w-4 h-4" /> Putar Kanan
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 w-full max-w-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedBase64(null)
                  setSelectedFiles([])
                  setBatchBase64s([])
                }}
                className="w-full sm:w-auto px-4 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Ganti
              </button>

              <button
                type="button"
                disabled={isQuotaReached || isCompressing}
                onClick={handleStartScan}
                className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-sm transition-all shadow-md active:scale-95 ${
                  isQuotaReached || isCompressing
                    ? "bg-slate-400 text-slate-200 cursor-not-allowed shadow-none"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30"
                }`}
              >
                {isQuotaReached ? (
                  <>
                    <Lock className="w-4 h-4" /> Kuota Habis
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    {selectedFiles.length > 1
                      ? `Scan Batch (${selectedFiles.length})`
                      : "Scan Nota"}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* INITIAL UPLOAD AREA */
          <div className="flex flex-col items-center space-y-4">
            <label
              htmlFor={isQuotaReached ? undefined : "gallery-file-input"}
              className={`group flex flex-col items-center space-y-3 ${
                isQuotaReached ? "cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <div
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shadow-inner transition-transform ${
                  isQuotaReached
                    ? "bg-slate-200 text-slate-400"
                    : "bg-emerald-50 text-emerald-600 group-hover:scale-110"
                }`}
              >
                {isQuotaReached ? <Lock className="w-8 h-8 sm:w-10 sm:h-10" /> : <Upload className="w-8 h-8 sm:w-10 sm:h-10" />}
              </div>

              <div className="space-y-1">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                  {isQuotaReached ? "Kendala Kuota / API Key" : "Unggah Nota"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  {isQuotaReached
                    ? (quotaError || "Batas frekuensi Google Gemini API tercapai atau API Key tidak valid.")
                    : "Pilih foto dari galeri atau ambil foto dari kamera."}
                </p>
              </div>
            </label>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-md pt-2">
              <button
                type="button"
                disabled={isQuotaReached || isProcessing}
                onClick={() => triggerFileInput("gallery-file-input")}
                className={`inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 ${
                  isQuotaReached || isProcessing
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white cursor-pointer"
                }`}
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                Buka Galeri
              </button>

              <button
                type="button"
                disabled={isQuotaReached || isProcessing}
                onClick={() => triggerFileInput("camera-file-input")}
                className={`inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 ${
                  isQuotaReached || isProcessing
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer"
                }`}
              >
                <Camera className="w-4 h-4 text-white" />
                Ambil Foto
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-600" /> Mendukung upload banyak foto sekaligus
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Interactive Lightbox Modal */}
      {showLightbox && selectedBase64 && (
        <ImageInteractiveLightbox
          imageUrl={selectedBase64}
          altText="Preview Detail Nota"
          onClose={() => setShowLightbox(false)}
        />
      )}
    </div>
  )
}
