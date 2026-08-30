"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react"

export type DialogVariant = "default" | "destructive" | "success" | "warning" | "info"

export interface DialogOptions {
  title?: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: DialogVariant
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
  isConfirm?: boolean
}

interface DialogContextType {
  showAlert: (options: DialogOptions | string) => Promise<void>
  showConfirm: (options: DialogOptions) => Promise<boolean>
}

const DialogContext = React.createContext<DialogContextType | null>(null)

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [config, setConfig] = React.useState<DialogOptions>({})
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null)

  const showAlert = React.useCallback((options: DialogOptions | string) => {
    return new Promise<void>((resolve) => {
      const opts: DialogOptions = typeof options === "string" ? { description: options } : options
      setConfig({
        title: opts.title || "Pemberitahuan",
        description: opts.description,
        confirmText: opts.confirmText || "OK",
        variant: opts.variant || "info",
        isConfirm: false,
        onConfirm: opts.onConfirm,
      })
      resolverRef.current = () => {
        resolve()
      }
      setOpen(true)
    })
  }, [])

  const showConfirm = React.useCallback((options: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfig({
        title: options.title || "Konfirmasi Tindakan",
        description: options.description,
        confirmText: options.confirmText || "Lanjutkan",
        cancelText: options.cancelText || "Batal",
        variant: options.variant || "default",
        isConfirm: true,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
      })
      resolverRef.current = (confirmed: boolean) => {
        resolve(confirmed)
      }
      setOpen(true)
    })
  }, [])

  const handleAction = async () => {
    try {
      setLoading(true)
      if (config.onConfirm) {
        await config.onConfirm()
      }
      if (resolverRef.current) {
        resolverRef.current(true)
      }
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  const handleCancel = () => {
    if (config.onCancel) {
      config.onCancel()
    }
    if (resolverRef.current) {
      resolverRef.current(false)
    }
    setOpen(false)
  }

  const getIcon = () => {
    switch (config.variant) {
      case "success":
        return <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
      case "destructive":
      case "warning":
        return <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
      case "info":
      default:
        return <Info className="w-6 h-6 text-blue-600 shrink-0" />
    }
  }

  const getActionBtnClass = () => {
    switch (config.variant) {
      case "destructive":
        return "bg-rose-600 hover:bg-rose-700 text-white"
      case "success":
        return "bg-emerald-600 hover:bg-emerald-700 text-white"
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white"
      default:
        return "bg-slate-900 hover:bg-slate-800 text-white"
    }
  }

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="sm:max-w-[440px] p-6 rounded-3xl border-slate-200/90 shadow-2xl bg-white animate-in zoom-in-95">
          <AlertDialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-slate-100/90 border border-slate-200/60 shrink-0">
                {getIcon()}
              </div>
              <AlertDialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {config.title}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs sm:text-sm text-slate-600 leading-relaxed pt-1">
              {config.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 gap-2">
            {config.isConfirm && (
              <AlertDialogCancel
                disabled={loading}
                onClick={handleCancel}
                className="rounded-xl px-4 py-2 text-xs sm:text-sm font-bold border-slate-200 hover:bg-slate-100 text-slate-700"
              >
                {config.cancelText || "Batal"}
              </AlertDialogCancel>
            )}
            <AlertDialogAction
              disabled={loading}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                handleAction()
              }}
              className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold shadow-xs cursor-pointer ${getActionBtnClass()}`}
            >
              {loading ? "Memproses..." : config.confirmText || "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContext.Provider>
  )
}

export function useAppDialog() {
  const context = React.useContext(DialogContext)
  if (!context) {
    throw new Error("useAppDialog must be used within an AppDialogProvider")
  }
  return context
}
