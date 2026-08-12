"use client"

import React, { useState } from "react"
import { Lock, User, Eye, EyeOff, Camera, ArrowRight, AlertCircle, Loader2 } from "lucide-react"

interface AdminLoginScreenProps {
  onLoginSuccess: (token: string, username: string) => void
}

export function AdminLoginScreen({ onLoginSuccess }: AdminLoginScreenProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [staffName, setStaffName] = useState("Reza")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isKaryawanRole = username.trim().toLowerCase() === "karyawan"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!username.trim() || !password.trim()) {
      setErrorMessage("ID dan Password harus diisi.")
      return
    }

    if (isKaryawanRole && !staffName) {
      setErrorMessage("Wajib memilih 'Siapa yang sedang login' untuk akun Karyawan.")
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          staffName: isKaryawanRole ? staffName : "",
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "ID atau Password salah.")
      }

      // Save token & user metadata in localStorage for backup PWA authorization header
      if (data.token) {
        localStorage.setItem("nota_admin_token", data.token)
        localStorage.setItem("nota_admin_user", data.user?.username || username.trim())
        localStorage.setItem("nota_admin_role", data.user?.role || (isKaryawanRole ? "KARYAWAN" : "ADMIN"))
        if (data.user?.staffName) {
          localStorage.setItem("nota_staff_name", data.user.staffName)
        } else {
          localStorage.removeItem("nota_staff_name")
        }
      }

      onLoginSuccess(data.token, data.user?.username || username.trim())
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal masuk ke sistem.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-center items-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-white">
      {/* Ambient Glow Background Effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-300">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-600/20 mb-1">
            <Camera className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Perkara Nota
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-1">
              Pemindai & Pembukuan Nota
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input ID */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-600" /> ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan ID"
                  autoComplete="username"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-2xl px-4 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
              </div>
            </div>

            {/* Conditional Dropdown: Siapa yang login (Only for karyawan role) */}
            {isKaryawanRole && (
              <div className="space-y-2 animate-in fade-in duration-200">
                <label className="text-xs font-black text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit border border-amber-200">
                  <User className="w-3.5 h-3.5 text-amber-700" /> Siapa yang sedang login? <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full appearance-none bg-amber-50 border border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 rounded-2xl px-4 py-3.5 text-sm font-black text-slate-900 cursor-pointer transition-all outline-none"
                  >
                    <option value="Reza">Reza</option>
                    <option value="Ummu">Ummu</option>
                    <option value="Cheisa">Cheisa</option>
                    <option value="Novi">Novi</option>
                    <option value="Titis">Titis</option>
                  </select>
                </div>
              </div>
            )}

            {/* Input Password */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" /> Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan Password"
                  autoComplete="current-password"
                  className="w-full bg-slate-50 border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-2xl pl-4 pr-11 py-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-xl transition-colors"
                  title={showPassword ? "Sembunyikan Password" : "Tampilkan Password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-extrabold text-sm transition-all shadow-md shadow-emerald-600/30 active:scale-95 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <span>Masuk</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
