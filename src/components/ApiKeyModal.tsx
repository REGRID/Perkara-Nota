"use client"

import React, { useState, useEffect } from "react"
import { Key, Sparkles, Check, X, ShieldCheck, ExternalLink } from "lucide-react"

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("")
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("gemini_api_key") || ""
      setApiKey(saved)
    }
  }, [isOpen])

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("gemini_api_key", apiKey.trim())
    }
    setIsSaved(true)
    setTimeout(() => {
      setIsSaved(false)
      onClose()
    }, 800)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-600" />
            Pengaturan Gemini API Key
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-600">
          <p className="leading-relaxed">
            Masukkan <strong>Google Gemini API Key</strong> Anda untuk memproses rincian nota secara otomatis dengan AI. Jika kosong, sistem secara cerdas akan menggunakan <em>Smart Regex OCR Fallback</em>.
          </p>

          <div className="space-y-1.5 pt-1">
            <label className="font-semibold text-slate-700 block">Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-mono text-slate-800"
            />
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-600 hover:underline text-[11px] font-semibold"
          >
            Dapatkan Google Gemini API Key Gratis di Google AI Studio <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Batal
          </button>

          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" /> Tersimpan!
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Simpan API Key
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
