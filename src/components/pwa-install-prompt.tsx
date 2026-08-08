"use client"

import React, { useState, useEffect } from "react"
import { Smartphone, Download, X, CheckCircle2, Sparkles, Monitor } from "lucide-react"

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Detect if running inside standalone PWA app mode (no browser address bar)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true
      setIsStandalone(isStandaloneMode)
    }

    checkStandalone()

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("✓ PWA Service Worker Registered"))
        .catch((err) => console.log("SW Registration info:", err))
    }

    // Capture Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }

    // Detect appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      setIsInstalled(true)
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  // If already running in standalone PWA app mode (no search bar), hide prompt
  if (isStandalone || !showPrompt) return null

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 sm:left-auto sm:right-4 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-2xl border-2 border-emerald-500/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg text-slate-950 font-black text-xl shrink-0">
              NP
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                Instal Aplikasi Nota Photo <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              </h4>
              <p className="text-xs text-slate-300 leading-snug">
                Buka secara Fullscreen tanpa Search Bar / Address Bar Chrome di Tablet Anda.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPrompt(false)}
            className="p-1 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Tampilan Standalone Native App tanpa Browser Header</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleInstallClick}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 font-extrabold text-xs transition-all shadow-md active:scale-95"
          >
            <Download className="w-4 h-4" />
            Instal ke Tablet Sekarang
          </button>

          <button
            onClick={() => setShowPrompt(false)}
            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
          >
            Nanti
          </button>
        </div>
      </div>
    </div>
  )
}
