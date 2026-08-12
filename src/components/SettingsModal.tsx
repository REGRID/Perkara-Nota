"use client"

import React, { useState, useEffect } from "react"
import { Settings, X, KeyRound, UserCheck, LogOut, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Bell, Zap } from "lucide-react"
import {
  getNotificationPermissionStatus,
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  sendNativeOSNotification,
  NotificationSettings,
} from "@/lib/pwaNotification"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentAdminUser: string
  onLogout: () => void
}

export function SettingsModal({ isOpen, onClose, currentAdminUser, onLogout }: SettingsModalProps) {
  const isKaryawan = currentAdminUser.trim().toLowerCase() === "karyawan"
  const [activeTab, setActiveTab] = useState<"password" | "info" | "notification">("notification")

  // Notification Permission State
  const [permState, setPermState] = useState<string>("default")
  const [notifySettings, setNotifySettings] = useState<NotificationSettings>({
    osPushEnabled: true,
    newReceiptEnabled: true,
    approvalReqEnabled: true,
  })

  useEffect(() => {
    if (isOpen) {
      setPermState(getNotificationPermissionStatus())
      setNotifySettings(getNotificationSettings())
    }
  }, [isOpen])

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

    setIsSaving(true)

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentAdminUser,
          oldPassword,
          newPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Gagal memperbarui password.")
      }

      if (data.token) {
        localStorage.setItem("nota_admin_token", data.token)
      }

      setStatusMessage({ type: "success", text: `Password ID "${currentAdminUser}" berhasil diperbarui!` })
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Gagal memperbarui password." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
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
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("notification")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "notification" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" /> Notifikasi HP & OS
          </button>

          {!isKaryawan && (
            <button
              type="button"
              onClick={() => setActiveTab("password")}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "password" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-600" /> Password
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "info" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Info
          </button>
        </div>

        {/* Tab Content: Notifikasi (PWA OS System Push Settings) */}
        {activeTab === "notification" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Status Card */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-amber-500" /> Status Izin Browser / OS
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  permState === "granted"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : permState === "denied"
                    ? "bg-red-100 text-red-800 border border-red-200"
                    : "bg-amber-100 text-amber-800 border border-amber-200"
                }`}>
                  {permState === "granted"
                    ? "🟢 Aktif (Granted)"
                    : permState === "denied"
                    ? "🔴 Diblokir (Denied)"
                    : "🟡 Belum Diizinkan"}
                </span>
              </div>

              <p className="text-[11.5px] text-slate-600 leading-relaxed">
                Notifikasi sistem akan muncul sebagai pop-up banner di layar HP Android/iOS atau Windows bahkan saat aplikasi berjalan di latar belakang (background/minimized).
              </p>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 flex-wrap">
                {permState !== "granted" && (
                  <button
                    type="button"
                    onClick={async () => {
                      const granted = await requestNotificationPermission()
                      setPermState(getNotificationPermissionStatus())
                      if (granted) {
                        sendNativeOSNotification("🔔 Notifikasi Berhasil Diaktifkan!", "Anda akan menerima pemberitahuan setiap ada nota baru atau permintaan approval.")
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-extrabold text-xs transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" /> Izinkan Notifikasi Pop-up HP
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    sendNativeOSNotification(
                      "🔔 Uji Coba Notifikasi Native",
                      "Sistem notifikasi HP & Windows Perkara Nota aktif dan siap menerima pesan!"
                    )
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Zap className="w-4 h-4 text-amber-400" /> Uji Notifikasi Native
                </button>
              </div>
            </div>

            {/* Toggle Preferences */}
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-2.5 text-xs">
              <span className="font-extrabold text-slate-800 block text-[11.5px] uppercase tracking-wider">
                Pengaturan Filter Notifikasi:
              </span>

              <label className="flex items-center justify-between text-slate-700 font-semibold cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-colors">
                <span>Banner Pop-up System OS</span>
                <input
                  type="checkbox"
                  checked={notifySettings.osPushEnabled}
                  onChange={(e) => {
                    const updated = { ...notifySettings, osPushEnabled: e.target.checked }
                    setNotifySettings(updated)
                    saveNotificationSettings(updated)
                  }}
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-slate-700 font-semibold cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-colors">
                <span>Notifikasi Struk/Nota Masuk Baru</span>
                <input
                  type="checkbox"
                  checked={notifySettings.newReceiptEnabled}
                  onChange={(e) => {
                    const updated = { ...notifySettings, newReceiptEnabled: e.target.checked }
                    setNotifySettings(updated)
                    saveNotificationSettings(updated)
                  }}
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-slate-700 font-semibold cursor-pointer hover:bg-slate-50 p-1.5 rounded-xl transition-colors">
                <span>Notifikasi Approval & Edit Data</span>
                <input
                  type="checkbox"
                  checked={notifySettings.approvalReqEnabled}
                  onChange={(e) => {
                    const updated = { ...notifySettings, approvalReqEnabled: e.target.checked }
                    setNotifySettings(updated)
                    saveNotificationSettings(updated)
                  }}
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        )}

        {/* Tab Content 1: Ganti Password (Admin Only) */}
        {activeTab === "password" && !isKaryawan && (
          <form onSubmit={handleChangePassword} className="space-y-4 animate-in fade-in duration-150">
            {statusMessage && (
              <div
                className={`p-3 rounded-2xl text-xs font-semibold flex items-start gap-2 animate-in fade-in duration-200 ${
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

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Password Saat Ini ({currentAdminUser})</label>
              <div className="relative">
                <input
                  type={showOldPass ? "text" : "password"}
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Masukkan password saat ini..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-semibold text-slate-900 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPass(!showOldPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Password Baru</label>
              <div className="relative">
                <input
                  type={showNewPass ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Masukkan password baru..."
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-semibold text-slate-900 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Ulangi Password Baru</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Konfirmasi password baru..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-semibold text-slate-900 bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Simpan Password Baru
            </button>
          </form>
        )}

        {/* Tab Content 2: Info Akun */}
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

            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs leading-relaxed font-medium">
              {isKaryawan ? (
                <>🔒 Fitur penggantian password dan persetujuan verifikasi <strong>dikhususkan untuk Admin</strong>.</>
              ) : (
                <>🔑 Password yang diganti hanya berlaku untuk ID <strong>{currentAdminUser}</strong> dan akan langsung tersimpan di sistem.</>
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
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
