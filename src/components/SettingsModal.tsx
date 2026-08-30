"use client"

import React, { useState, useEffect } from "react"
import { Settings, X, KeyRound, UserCheck, LogOut, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Bell, Zap, Lock, Key, Boxes, Store, Warehouse, RefreshCw, Layers } from "lucide-react"
import {
  getNotificationPermissionStatus,
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  sendNativeOSNotification,
  testNativeOSNotification,
  registerPushSubscription,
  isPushSubscribed,
  unsubscribePushNotifications,
  testBackgroundPushNotification,
  NotificationSettings,
} from "@/lib/pwaNotification"
import { useAppDialog } from "@/components/ui/app-dialog"
import { toast } from "sonner"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentAdminUser: string
  onLogout: () => void
}

export function SettingsModal({ isOpen, onClose, currentAdminUser, onLogout }: SettingsModalProps) {
  const { showAlert } = useAppDialog()
  const isKaryawan = currentAdminUser.trim().toLowerCase() === "karyawan"
  const [activeTab, setActiveTab] = useState<"notification" | "pos" | "password" | "info">("notification")

  // Notification Permission State
  const [permState, setPermState] = useState<string>("default")
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false)
  const [isRegisteringPush, setIsRegisteringPush] = useState<boolean>(false)
  const [countdown, setCountdown] = useState<number>(0)
  const [testMsg, setTestMsg] = useState<string>("")
  const [notifySettings, setNotifySettings] = useState<NotificationSettings>({
    osPushEnabled: true,
    newReceiptEnabled: true,
    approvalReqEnabled: true,
  })

  // POS & Stock Sync Settings State
  const [stockDestination, setStockDestination] = useState<"BAR" | "WAREHOUSE">("BAR")
  const [isTestingPos, setIsTestingPos] = useState(false)
  const [posSyncStatus, setPosSyncStatus] = useState<{ success?: boolean; message?: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setPermState(getNotificationPermissionStatus())
      setNotifySettings(getNotificationSettings())
      isPushSubscribed().then(setIsSubscribed)

      const savedDest = localStorage.getItem("perkara_default_stock_dest")
      if (savedDest === "WAREHOUSE" || savedDest === "BAR") {
        setStockDestination(savedDest)
      }
    }
  }, [isOpen])

  const handleSetStockDestination = (dest: "BAR" | "WAREHOUSE") => {
    setStockDestination(dest)
    localStorage.setItem("perkara_default_stock_dest", dest)
    toast.success(`Tujuan penambahan stok default diatur ke: Stok ${dest === "BAR" ? "Bar / Toko" : "Gudang"}`)
  }

  const handleTestPosConnection = async () => {
    setIsTestingPos(true)
    setPosSyncStatus(null)
    try {
      const res = await fetch("/api/pos/test-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: stockDestination }),
      })
      const data = await res.json()
      setPosSyncStatus(data)
      if (data.success) {
        toast.success("Koneksi ke New PERKARA POS Terhubung & Berhasil!")
      } else {
        toast.error("Gagal terhubung ke POS: " + (data.message || "Offline"))
      }
    } catch (e: any) {
      setPosSyncStatus({ success: false, message: e.message || "Gagal menghubungi server" })
      toast.error("Koneksi gagal: " + (e.message || "POS Offline"))
    } finally {
      setIsTestingPos(false)
    }
  }

  // Countdown timer effect for push test
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // Change Password State
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [showOldPass, setShowOldPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  if (!isOpen) return null

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatusMessage(null)

    if (isKaryawan) {
      setStatusMessage({ type: "error", text: "Akses Ditolak: Role Karyawan tidak memiliki izin untuk mengubah password." })
      return
    }

    if (!oldPassword || !newPassword) {
      setStatusMessage({ type: "error", text: "Password lama dan password baru wajib diisi." })
      return
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: "error", text: "Konfirmasi password baru tidak cocok." })
      return
    }

    if (newPassword.length < 4) {
      setStatusMessage({ type: "error", text: "Password baru minimal 4 karakter." })
      return
    }

    try {
      setIsSaving(true)
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Gagal mengubah password")
      }

      setStatusMessage({ type: "success", text: "Password berhasil diperbarui! Silakan gunakan password baru pada login berikutnya." })
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Terjadi kesalahan saat mengubah password" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl p-5 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-none mb-1">
                Pengaturan
              </h3>
              <p className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                ID Login: <strong className="text-slate-900 font-mono">{currentAdminUser}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold gap-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("notification")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "notification" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" /> Notif OS
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pos")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "pos" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-purple-600" /> Stok POS
          </button>

          {!isKaryawan && (
            <button
              type="button"
              onClick={() => setActiveTab("password")}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === "password" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-600" /> Password
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "info" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" /> Info
          </button>
        </div>

        {/* Tab Content: Notifikasi (PWA OS System Push Settings) */}
        {activeTab === "notification" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Background Push Status Card */}
            <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl border border-slate-700 shadow-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm flex items-center gap-2 text-white">
                  <Bell className="w-4 h-4 text-emerald-400 animate-bounce" /> Push HP Latar Belakang
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  isSubscribed && permState === "granted"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : permState === "granted"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-red-500/20 text-red-300 border border-red-500/40"
                }`}>
                  {isSubscribed && permState === "granted"
                    ? "✓ Siap (HP Tertutup)"
                    : permState === "granted"
                    ? "Izin Aktif (Belum Terhubung)"
                    : "Belum Diizinkan"}
                </span>
              </div>

              <p className="text-[11.5px] text-slate-300 leading-relaxed">
                Fitur ini mengirimkan notifikasi langsung ke bilah notifikasi & layar kunci HP Android / iPhone Anda melalui <strong>Web Push Protocol</strong>, bahkan saat aplikasi <strong>ditutup total</strong> atau layar HP dikunci.
              </p>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {(!isSubscribed || permState !== "granted") ? (
                  <button
                    type="button"
                    disabled={isRegisteringPush}
                    onClick={async () => {
                      setIsRegisteringPush(true)
                      const res = await registerPushSubscription(
                        currentAdminUser,
                        isKaryawan ? "KARYAWAN" : "ADMIN"
                      )
                      setIsRegisteringPush(false)
                      setPermState(getNotificationPermissionStatus())
                      const subStatus = await isPushSubscribed()
                      setIsSubscribed(subStatus)
                      if (res.success) {
                        toast.success("Notifikasi latar belakang telah aktif untuk perangkat ini!")
                      } else {
                        showAlert({ title: "Perhatian Notifikasi", description: res.error || "Gagal mengaktifkan notifikasi latar belakang.", variant: "warning" })
                      }
                    }}
                    className="w-full py-2.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-slate-950 font-black text-xs transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isRegisteringPush ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Paksa Aktifkan Notifikasi HP (Saat Ditutup)
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={countdown > 0}
                      onClick={async () => {
                        setCountdown(5)
                        setTestMsg("Kunci layar HP atau tutup browser sekarang dalam 5 detik...")
                        await testBackgroundPushNotification(5)
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {countdown > 0 ? `Menunggu (${countdown}s)... Kunci HP!` : "⏱️ Tes HP Tertutup (5s)"}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await unsubscribePushNotifications()
                        setIsSubscribed(false)
                        toast.info("Langganan push untuk perangkat ini telah dinonaktifkan.")
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 font-bold text-xs transition-all cursor-pointer border border-slate-700"
                    >
                      Putus
                    </button>
                  </div>
                )}

                {countdown > 0 && (
                  <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-200 text-[11px] font-bold text-center animate-pulse">
                    🔔 Notifikasi akan dikirim dalam {countdown} detik! Segera kunci layar HP Anda untuk menguji.
                  </div>
                )}
              </div>
            </div>

            {/* In-App Toggle Settings */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Preferensi Notifikasi
              </span>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <span className="text-xs font-bold text-slate-800">Pemberitahuan Nota Baru Masuk</span>
                <input
                  type="checkbox"
                  checked={notifySettings.newReceiptEnabled}
                  onChange={(e) => {
                    const next = { ...notifySettings, newReceiptEnabled: e.target.checked }
                    setNotifySettings(next)
                    saveNotificationSettings(next)
                  }}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <span className="text-xs font-bold text-slate-800">Pemberitahuan Permintaan Approval</span>
                <input
                  type="checkbox"
                  checked={notifySettings.approvalReqEnabled}
                  onChange={(e) => {
                    const next = { ...notifySettings, approvalReqEnabled: e.target.checked }
                    setNotifySettings(next)
                    saveNotificationSettings(next)
                  }}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}

        {/* Tab Content: Integrasi POS & Stok Otomatis */}
        {activeTab === "pos" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Stock Destination Config Card */}
            <div className="p-4 bg-gradient-to-br from-purple-950 via-slate-900 to-slate-900 text-white rounded-3xl border border-purple-800/60 shadow-md space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm flex items-center gap-2 text-white">
                  <Boxes className="w-4 h-4 text-purple-400" /> Lokasi Penambahan Stok
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  {stockDestination === "BAR" ? "Stok Bar (Default)" : "Stok Gudang"}
                </span>
              </div>

              <p className="text-[11.5px] text-slate-300 leading-relaxed">
                Tentukan ke mana stok bahan baku (kopi, susu, sirup, dll) akan otomatis bertambah di <strong>New PERKARA POS</strong> begitu nota disetujui oleh Admin 2.
              </p>

              {/* Destination Switcher */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSetStockDestination("BAR")}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    stockDestination === "BAR"
                      ? "bg-purple-600 text-white border-purple-400 shadow-md ring-2 ring-purple-400/40"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Store className="w-4 h-4" />
                    {stockDestination === "BAR" && <span className="text-[9px] font-black bg-white text-purple-900 px-1.5 py-0.2 rounded-full">AKTIF</span>}
                  </div>
                  <div>
                    <strong className="block text-xs font-black">Stok Bar / Toko</strong>
                    <span className="text-[10px] opacity-80 block">floorQuantity (Bahan siap pakai)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetStockDestination("WAREHOUSE")}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    stockDestination === "WAREHOUSE"
                      ? "bg-purple-600 text-white border-purple-400 shadow-md ring-2 ring-purple-400/40"
                      : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Warehouse className="w-4 h-4" />
                    {stockDestination === "WAREHOUSE" && <span className="text-[9px] font-black bg-white text-purple-900 px-1.5 py-0.2 rounded-full">AKTIF</span>}
                  </div>
                  <div>
                    <strong className="block text-xs font-black">Stok Gudang</strong>
                    <span className="text-[10px] opacity-80 block">warehouseQuantity (Stok cadangan)</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-600" /> Uji Koneksi Webhook POS
                </span>
                <button
                  type="button"
                  disabled={isTestingPos}
                  onClick={handleTestPosConnection}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-extrabold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isTestingPos ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  Tes Sinkronisasi
                </button>
              </div>

              {posSyncStatus && (
                <div className={`p-2.5 rounded-xl border text-[11px] font-medium leading-relaxed ${
                  posSyncStatus.success
                    ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                    : "bg-amber-50 text-amber-900 border-amber-200"
                }`}>
                  {posSyncStatus.success ? "✓ " : "⚠️ "}
                  {posSyncStatus.message}
                </div>
              )}

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Setiap nota baru yang disetujui Admin 2 akan otomatis menghitung rasio konversi satuan, meng-update moving average HPP, dan mencatat mutasi stok di POS.
              </p>
            </div>
          </div>
        )}

        {/* Tab Content: Password */}
        {activeTab === "password" && !isKaryawan && (
          <form onSubmit={handleChangePassword} className="space-y-3.5 animate-in fade-in duration-150">
            {statusMessage && (
              <div
                className={`p-3 rounded-2xl text-xs font-semibold flex items-start gap-2 ${
                  statusMessage.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {statusMessage.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Password Lama</label>
              <div className="relative">
                <input
                  type={showOldPass ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Masukkan password lama"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPass(!showOldPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Password Baru</label>
              <div className="relative">
                <input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Masukkan password baru (min 4 karakter)"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Konfirmasi Password Baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {isSaving ? "Menyimpan..." : "Simpan Password Baru"}
            </button>
          </form>
        )}

        {/* Tab Content: Info Akun */}
        {activeTab === "info" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">ID Login:</span>
                <span className="font-bold font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200">
                  {currentAdminUser}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                <span className="font-semibold text-slate-500">Role Akses:</span>
                <span className="font-bold text-slate-800 uppercase font-mono">
                  {isKaryawan ? "KARYAWAN" : "ADMIN"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                <span className="font-semibold text-slate-500">Mode Sistem:</span>
                <span className="font-bold text-slate-800">
                  {isKaryawan ? "Input Nota & Talangan Staf" : "Dual-Admin Approval"}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs leading-relaxed font-medium flex items-start gap-2">
              {isKaryawan ? (
                <>
                  <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>Fitur penggantian password dan persetujuan verifikasi <strong>dikhususkan untuk Admin</strong>.</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>Password yang diganti hanya berlaku untuk ID <strong>{currentAdminUser}</strong> dan langsung tersimpan di sistem.</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Logout Option at Modal Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose()
              onLogout()
            }}
            className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 font-extrabold text-xs border border-red-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
            title="Keluar dari sesi saat ini"
          >
            <LogOut className="w-4 h-4 -scale-x-100" /> Log out
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
