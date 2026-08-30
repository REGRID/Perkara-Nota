"use client"

import React, { useState, useEffect } from "react"
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  Trash2,
  Plus,
  Calendar,
  Store,
  Tag,
  FileText,
  Eye,
  EyeOff,
  ArrowLeft,
  Sparkles,
  Save,
  AlertCircle,
  FileCheck,
  ImageIcon,
  Receipt,
  Percent,
  CreditCard,
  CheckSquare,
  FolderPlus,
  X,
  Layers,
  ShoppingBag,
  Coins,
  Package,
  ChevronDown,
  ArrowRight,
  Maximize2,
  User,
} from "lucide-react"
import { ParsedItem, ParsedReceiptResult } from "@/app/api/parse-receipt/route"
import { ImageInteractiveLightbox } from "@/components/ImageInteractiveLightbox"
import { getAuthHeaders } from "@/lib/authClient"
import { useAppDialog } from "@/components/ui/app-dialog"
import { toast } from "sonner"

interface VerificationSplitScreenProps {
  imagePreviewUrl: string
  rawOcrText: string
  initialResult: ParsedReceiptResult
  parsingMode: string
  editingReceiptId?: string | null
  existingPaymentMethod?: string
  existingPaymentStatus?: string
  existingNote?: string
  batchInfo?: { currentIndex: number; totalCount: number } | null
  onSkipBatch?: () => void
  onSaveSuccess: () => void
  onCancel: () => void
  onDraftUpdate?: (
    updatedResult: ParsedReceiptResult,
    extraFields: { paymentMethod: string; paymentStatus: string; note: string }
  ) => void
}

export interface CategoryGroup {
  id: string
  name: string
  subCategories: { id: string; name: string }[]
}

const PAYMENT_METHODS = [
  "Cash",
  "Transfer Bank",
  "QRIS",
  "Kredit / Debit",
  "Dana Pribadi Owner",
  "Talangan Karyawan",
  "Hutang Supplier",
]

export function VerificationSplitScreen({
  imagePreviewUrl,
  rawOcrText,
  initialResult,
  parsingMode,
  editingReceiptId,
  existingPaymentMethod,
  existingPaymentStatus,
  existingNote,
  batchInfo,
  onSkipBatch,
  onSaveSuccess,
  onCancel,
  onDraftUpdate,
}: VerificationSplitScreenProps) {
  const { showAlert, showConfirm } = useAppDialog()
  const [mobileView, setMobileView] = useState<"form" | "image">("form")

  // Interactive Lightbox State
  const [showLightbox, setShowLightbox] = useState(false)

  // Dynamic Hierarchy Category State
  const [categoryHierarchy, setCategoryHierarchy] = useState<CategoryGroup[]>([])
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false)
  const [newCatType, setNewCatType] = useState<"parent" | "sub">("parent")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [selectedParentForSub, setSelectedParentForSub] = useState("")
  const [targetItemIndexForCategory, setTargetItemIndexForCategory] = useState<number | null>(null)
  const [showRawOcr, setShowRawOcr] = useState(false)

  // Lazy-load single receipt image on-demand when opening receipt detail/edit modal
  const [lazyLoadedImage, setLazyLoadedImage] = useState<string | null>(null)
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false)

  useEffect(() => {
    if (editingReceiptId && !imagePreviewUrl) {
      setIsImageLoading(true)
      fetch(`/api/receipts/${editingReceiptId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.imageUrl) {
            setLazyLoadedImage(data.imageUrl)
          }
        })
        .catch((err) => console.error("Lazy load receipt image error:", err))
        .finally(() => setIsImageLoading(false))
    }
  }, [editingReceiptId, imagePreviewUrl])

  const activeDisplayImage = imagePreviewUrl || lazyLoadedImage

  // Fetch categories hierarchy on mount
  const fetchCategoryHierarchy = async () => {
    try {
      const res = await fetch("/api/categories")
      if (res.ok) {
        const data = await res.json()
        if (data.hierarchy && Array.isArray(data.hierarchy)) {
          setCategoryHierarchy(data.hierarchy)
          if (data.hierarchy.length > 0 && !selectedParentForSub) {
            setSelectedParentForSub(data.hierarchy[0].id)
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchCategoryHierarchy()
  }, [])

  // Auto-sanitize item sub-categories so no out-of-bound sub-categories exist
  useEffect(() => {
    if (!categoryHierarchy || categoryHierarchy.length === 0 || !items || items.length === 0) return

    let hasChanges = false
    const sanitizedItems = items.map((item) => {
      const parentCategoryClean = (item.category || "").toLowerCase().trim()
      const matchingParent = categoryHierarchy.find(
        (h) =>
          h.name.toLowerCase().trim() === parentCategoryClean ||
          parentCategoryClean.includes(h.name.toLowerCase()) ||
          h.name.toLowerCase().includes(parentCategoryClean)
      )

      const dbSubNames = matchingParent ? matchingParent.subCategories.map((s) => s.name) : []
      const validSubList = ["Umum", ...dbSubNames]

      const isValidSub = validSubList.some(
        (s) => s.toLowerCase().trim() === (item.subCategory || "").toLowerCase().trim()
      )

      if (!isValidSub) {
        hasChanges = true
        return {
          ...item,
          category: matchingParent ? matchingParent.name : item.category || categoryHierarchy[0]?.name || "Lain-lain",
          subCategory: dbSubNames.length > 0 ? dbSubNames[0] : "Umum",
        }
      }
      return item
    })

    if (hasChanges) {
      setItems(sanitizedItems)
    }
  }, [categoryHierarchy])

  const openAddCategoryModal = (type: "parent" | "sub", parentName?: string, itemIndex?: number | null) => {
    setNewCatType(type)
    setTargetItemIndexForCategory(itemIndex !== undefined && itemIndex !== null ? itemIndex : null)
    setNewCategoryName("")

    if (type === "sub") {
      if (parentName) {
        const parentObj = categoryHierarchy.find(
          (h) => h.name.toLowerCase().trim() === parentName.toLowerCase().trim()
        )
        if (parentObj) {
          setSelectedParentForSub(parentObj.id)
        } else if (categoryHierarchy.length > 0) {
          setSelectedParentForSub(categoryHierarchy[0].id)
        }
      } else if (categoryHierarchy.length > 0) {
        setSelectedParentForSub(categoryHierarchy[0].id)
      }
    } else if (categoryHierarchy.length > 0 && !selectedParentForSub) {
      setSelectedParentForSub(categoryHierarchy[0].id)
    }

    setShowAddCategoryModal(true)
  }

  const handleCreateCustomCategory = async () => {
    const cleanName = newCategoryName.trim()
    if (!cleanName) {
      showAlert({ title: "Kategori Kosong", description: "Nama kategori tidak boleh kosong.", variant: "warning" })
      return
    }

    try {
      const payload: any = { name: cleanName }
      let targetParentObj: CategoryGroup | undefined

      if (newCatType === "sub") {
        targetParentObj =
          categoryHierarchy.find((h) => h.id === selectedParentForSub) ||
          categoryHierarchy.find((h) => h.name === selectedParentForSub) ||
          categoryHierarchy[0]

        if (targetParentObj) {
          payload.parentId = targetParentObj.id
        }
      }

      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const resData = await res.json()
        setNewCategoryName("")
        setShowAddCategoryModal(false)
        toast.success("Kategori berhasil ditambahkan!")

        let updatedHierarchy = categoryHierarchy
        if (resData.hierarchy && Array.isArray(resData.hierarchy)) {
          updatedHierarchy = resData.hierarchy
          setCategoryHierarchy(resData.hierarchy)
        } else {
          const catRes = await fetch("/api/categories")
          if (catRes.ok) {
            const catData = await catRes.json()
            if (catData.hierarchy && Array.isArray(catData.hierarchy)) {
              updatedHierarchy = catData.hierarchy
              setCategoryHierarchy(catData.hierarchy)
            }
          }
        }

        // Auto-assign created category/subcategory to target item if triggered from item row
        if (targetItemIndexForCategory !== null && targetItemIndexForCategory < items.length) {
          const updatedItems = [...items]
          const currentItem = updatedItems[targetItemIndexForCategory]

          if (newCatType === "parent") {
            updatedItems[targetItemIndexForCategory] = {
              ...currentItem,
              category: cleanName,
              subCategory: "Umum",
            }
          } else {
            const parentName = targetParentObj ? targetParentObj.name : currentItem.category
            updatedItems[targetItemIndexForCategory] = {
              ...currentItem,
              category: parentName,
              subCategory: cleanName,
            }
          }
          setItems(updatedItems)
        }
        setTargetItemIndexForCategory(null)
      } else {
        const errData = await res.json()
        showAlert({ title: "Gagal Menambah Kategori", description: errData.error || "Gagal menambah kategori baru", variant: "destructive" })
      }
    } catch (e) {
      console.error("Create custom category error:", e)
      showAlert({ title: "Kesalahan Sistem", description: "Gagal menambah kategori baru ke database", variant: "destructive" })
    }
  }

  // Extract initial paidByPerson from existing note if present
  const initialPaidByMatch = (existingNote || "").match(/\[Dibayar oleh: ([^\]]+)\]/)
  const initialPaidBy = initialPaidByMatch ? initialPaidByMatch[1] : ""
  const initialCleanNote = (existingNote || "").replace(/\[Dibayar oleh: [^\]]+\]\s*/g, "")

  // Form State
  const [merchantName, setMerchantName] = useState(initialResult.merchantName ?? "")
  const [date, setDate] = useState(initialResult.date || new Date().toISOString().split("T")[0])
  const [items, setItems] = useState<ParsedItem[]>(initialResult.items || [])
  const [taxAmount, setTaxAmount] = useState<number | "">(initialResult.taxAmount ?? 0)
  const [discountAmount, setDiscountAmount] = useState<number | "">(initialResult.discountAmount ?? 0)
  const [discountType, setDiscountType] = useState<"RP" | "PERCENT">("RP")
  const [discountPercentValue, setDiscountPercentValue] = useState<number | "">("")
  const [paymentMethod, setPaymentMethod] = useState<string>(existingPaymentMethod || "Cash")
  const [paymentStatus, setPaymentStatus] = useState<string>(existingPaymentStatus || "Lunas")
  const [paidByPerson, setPaidByPerson] = useState<string>(initialPaidBy)
  const [note, setNote] = useState(initialCleanNote)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const isKaryawanRole = typeof window !== "undefined"
    ? localStorage.getItem("nota_admin_role") === "KARYAWAN" || localStorage.getItem("nota_admin_user") === "karyawan"
    : false

  const activeStaffName = typeof window !== "undefined"
    ? localStorage.getItem("nota_staff_name") || "Reza"
    : "Reza"

  const availablePaymentMethods = isKaryawanRole
    ? ["Cash", "Transfer Bank", "QRIS", "Talangan Karyawan"]
    : PAYMENT_METHODS

  const handlePaymentMethodSelect = (selectedMethod: string) => {
    setPaymentMethod(selectedMethod)
    if (selectedMethod === "Dana Pribadi Owner") {
      setPaymentStatus("Belum Direimburse")
      if (paidByPerson !== "Rama" && paidByPerson !== "Refo") {
        setPaidByPerson("Rama")
      }
    } else if (selectedMethod === "Talangan Karyawan") {
      setPaymentStatus("Belum Direimburse")
      const staffList = ["Reza", "Ummu", "Cheisa", "Novi", "Titis"]
      if (!staffList.includes(paidByPerson)) {
        setPaidByPerson(activeStaffName)
      }
    } else if (selectedMethod === "Hutang Supplier") {
      setPaymentStatus("Tempo (Hutang Supplier)")
      setPaidByPerson("")
    } else {
      setPaymentStatus("Lunas")
      setPaidByPerson("")
    }
  }

  // Update initial form state when initialResult changes (e.g. Next item in batch queue)
  useEffect(() => {
    setMerchantName(initialResult.merchantName ?? "")
    setDate(initialResult.date || new Date().toISOString().split("T")[0])
    setItems(initialResult.items || [])
    setTaxAmount(initialResult.taxAmount ?? 0)
    setDiscountAmount(initialResult.discountAmount ?? 0)
    setErrorMsg("")
  }, [initialResult, batchInfo?.currentIndex, editingReceiptId])

  // Auto-calculated subtotal from items
  const itemsSubtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  const currentDiscountNum = Number(discountAmount) || 0
  const currentTaxNum = Number(taxAmount) || 0
  const calculatedTotal = Math.max(0, itemsSubtotal - currentDiscountNum + currentTaxNum)

  // Handle percent discount calculation
  const handleDiscountPercentChange = (percent: number | "") => {
    setDiscountPercentValue(percent)
    if (percent === "" || isNaN(Number(percent))) {
      setDiscountAmount(0)
    } else {
      const calc = Math.round((itemsSubtotal * Number(percent)) / 100)
      setDiscountAmount(calc)
    }
  }

  const handleDiscountTypeChange = (type: "RP" | "PERCENT") => {
    setDiscountType(type)
    if (type === "PERCENT") {
      if (discountPercentValue !== "") {
        handleDiscountPercentChange(discountPercentValue)
      } else if (itemsSubtotal > 0 && currentDiscountNum > 0) {
        const pct = Math.round(((currentDiscountNum * 100) / itemsSubtotal) * 10) / 10
        setDiscountPercentValue(pct)
      }
    }
  }

  // Continuously sync edited form values to parent draft
  useEffect(() => {
    if (onDraftUpdate) {
      onDraftUpdate(
        {
          merchantName,
          date,
          subtotal: itemsSubtotal,
          discountAmount: currentDiscountNum,
          taxAmount: currentTaxNum,
          totalAmount: calculatedTotal,
          items,
        },
        {
          paymentMethod,
          paymentStatus,
          note: note ? (paidByPerson ? `[Dibayar oleh: ${paidByPerson}] ${note}` : note) : (paidByPerson ? `[Dibayar oleh: ${paidByPerson}]` : ""),
        }
      )
    }
  }, [merchantName, date, items, discountAmount, currentDiscountNum, currentTaxNum, taxAmount, calculatedTotal, itemsSubtotal, paymentMethod, paymentStatus, note, paidByPerson, onDraftUpdate])

  // Item List Handlers
  const handleItemChange = (index: number, field: keyof ParsedItem, value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const handleAddItem = () => {
    setItems([
      ...items,
      { name: "Item Baru", category: "Lain-lain", subCategory: "Umum", price: 0, quantity: 1 },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showAlert({ title: "Item Wajib Ada", description: "Nota harus memiliki minimal 1 item produk.", variant: "warning" })
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  // Final Form Submission
  const handleSave = async () => {
    if (!date) {
      setErrorMsg("Tanggal nota tidak boleh kosong.")
      return
    }

    if (items.length === 0) {
      setErrorMsg("Tambahkan minimal 1 item produk.")
      return
    }

    const invalidItem = items.find((i) => !i.name || !i.name.trim())
    if (invalidItem) {
      setErrorMsg("Semua produk harus memiliki nama yang valid.")
      return
    }

    setIsSaving(true)
    setErrorMsg("")

    const isPersonalPayment =
      paymentMethod === "Dana Pribadi Owner" || paymentMethod === "Talangan Karyawan"

    const cleanBaseNote = note.replace(/\[Dibayar oleh: [^\]]+\]\s*/g, "").trim()

    const finalNoteText =
      isPersonalPayment && paidByPerson.trim()
        ? `[Dibayar oleh: ${paidByPerson.trim()}] ${cleanBaseNote}`.trim()
        : cleanBaseNote

    try {
      const endpoint = editingReceiptId ? `/api/receipts/${editingReceiptId}` : "/api/receipts"
      const method = editingReceiptId ? "PUT" : "POST"

      const response = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          merchantName: merchantName.trim() || "Nota / Toko",
          date,
          imageUrl: imagePreviewUrl || null,
          subtotal: itemsSubtotal,
          discountAmount: currentDiscountNum,
          taxAmount: currentTaxNum,
          totalAmount: calculatedTotal,
          paymentMethod,
          paymentStatus,
          note: finalNoteText || null,
          items: items.map((it) => ({
            name: it.name.trim(),
            category: it.category || "Lain-lain",
            subCategory: it.subCategory || "Umum",
            price: Number(it.price) || 0,
            quantity: Number(it.quantity) || 1,
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Gagal menyimpan nota")
      }

      if (data.pendingApproval) {
        await showAlert({
          title: "Pengajuan Berhasil",
          description: data.message || "Permintaan berhasil diajukan! Menunggu persetujuan (approval) dari admin lain.",
          variant: "success",
        })
      } else {
        toast.success("Nota berhasil disimpan!")
      }

      onSaveSuccess()
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal menyimpan nota")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full flex flex-col space-y-4 pb-20 lg:pb-0">
      {/* Fullscreen Interactive Lightbox Modal */}
      {showLightbox && (
        <ImageInteractiveLightbox
          imageUrl={imagePreviewUrl}
          altText="Foto Struk / Nota Fisik"
          onClose={() => setShowLightbox(false)}
        />
      )}

      {/* Top Header Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
            title="Batal / Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2 flex-wrap">
              {editingReceiptId ? "Edit Ulang Data Nota" : "Verifikasi Hasil Scan Nota"}
              {batchInfo ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold border border-amber-300 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  Nota Ke-{batchInfo.currentIndex + 1} dari {batchInfo.totalCount} (Batch Mass Upload)
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  Split View
                </span>
              )}
            </h2>

          </div>
        </div>

        {/* Action Buttons (Desktop & Tablet) */}
        <div className="hidden sm:flex items-center gap-2.5">
          {batchInfo && onSkipBatch && batchInfo.currentIndex < batchInfo.totalCount - 1 && (
            <button
              type="button"
              onClick={onSkipBatch}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs transition-colors border border-amber-200"
            >
              Lewati Nota Ini <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Batal All
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {batchInfo && batchInfo.currentIndex < batchInfo.totalCount - 1
              ? `ACC & Lanjut Ke Nota #${batchInfo.currentIndex + 2}`
              : editingReceiptId
              ? "Simpan Perubahan Nota"
              : "Simpan / ACC Nota"}
          </button>
        </div>
      </div>

      {/* Mobile Switcher Tabs (< lg) */}
      <div className="flex lg:hidden bg-slate-200/80 p-1 rounded-xl border border-slate-300">
        <button
          type="button"
          onClick={() => setMobileView("form")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
            mobileView === "form"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileCheck className="w-4 h-4 text-emerald-600" />
          Edit Data & Barang ({items.length})
        </button>

        <button
          type="button"
          onClick={() => setMobileView("image")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
            mobileView === "image"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ImageIcon className="w-4 h-4 text-blue-600" />
          Foto Struk Belanja
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* Main Container Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: Interactive Image Viewer with Clean Lightbox Trigger Header */}
        <div
          className={`lg:col-span-5 flex-col space-y-3 lg:sticky lg:top-4 ${
            mobileView === "image" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-600" />
                Foto Struk / Nota Fisik
              </span>

              <button
                type="button"
                onClick={() => setShowLightbox(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs transition-all flex items-center gap-1.5 shadow-xs"
                title="Buka Lightbox Pop-Up Zoom Mouse & Touch"
              >
                <Maximize2 className="w-3.5 h-3.5" /> Fullscreen Zoom
              </button>
            </div>

            {/* Clickable Image Preview Box */}
            <div
              onClick={() => activeDisplayImage && setShowLightbox(true)}
              className="relative min-h-[380px] max-h-[580px] overflow-hidden bg-slate-900 flex items-center justify-center p-4 cursor-zoom-in group"
            >
              {activeDisplayImage ? (
                /* eslint-disable-next-html-element */
                <img
                  src={activeDisplayImage}
                  alt="Foto Struk Belanja"
                  className="max-w-full h-auto max-h-[520px] object-contain rounded-lg shadow-2xl group-hover:opacity-90 transition-opacity"
                />
              ) : isImageLoading ? (
                <div className="text-emerald-400 font-extrabold text-xs flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" /> Memuat Foto Struk Nota...
                </div>
              ) : (
                <div className="text-slate-400 font-semibold text-xs text-center p-6 space-y-1">
                  <ImageIcon className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                  <p>Foto struk tidak diload di awal.</p>
                  <p className="text-[11px] text-slate-500">Klik "Fullscreen Zoom" atau buka foto jika tersedia.</p>
                </div>
              )}

              {/* Hover Overlay Hint */}
              {activeDisplayImage && (
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-2xs">
                  <span className="px-4 py-2 rounded-2xl bg-slate-900/90 text-white font-extrabold text-xs border border-slate-700 flex items-center gap-2 shadow-2xl">
                    <Maximize2 className="w-4 h-4 text-emerald-400" /> Klik Untuk Pop-Up & Zoom Touch / Mouse
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowRawOcr(!showRawOcr)}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-emerald-600 transition-colors py-1"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-500" />
                  {showRawOcr ? "Sembunyikan Teks Mentah OCR" : "Lihat Teks Mentah Tesseract OCR"}
                </span>
                {showRawOcr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>

              {showRawOcr && (
                <div className="mt-2 p-3 bg-slate-900 text-slate-200 text-xs font-mono rounded-xl max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                  {rawOcrText || "Tidak ada teks OCR mentah."}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Editable Form */}
        <div
          className={`lg:col-span-7 flex-col space-y-5 ${
            mobileView === "form" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {editingReceiptId ? "Perbarui Data Nota" : "Rincian Hasil Ekstraksi Struk"}
              </h3>

              <button
                type="button"
                onClick={() => openAddCategoryModal("parent")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-extrabold transition-colors border border-emerald-200 shadow-2xs"
              >
                <FolderPlus className="w-4 h-4" /> + Buat Kategori Baru
              </button>
            </div>

            {/* Header Fields: Merchant Name, Date, Payment Method & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-slate-500" /> Nama Toko / Merchant / PT
                </label>
                <input
                  type="text"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="Nama toko..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm text-slate-900 font-semibold transition-all bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" /> Tanggal Nota
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm text-slate-900 font-semibold transition-all bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" /> Metode Pembayaran
                </label>
                <div className="relative">
                  <select
                    value={paymentMethod}
                    onChange={(e) => handlePaymentMethodSelect(e.target.value)}
                    className="w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-sm font-semibold text-slate-900 bg-white cursor-pointer transition-all"
                  >
                    {availablePaymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Conditional Rendering: Reimbursement (Dana Pribadi / Talangan Karyawan) */}
              {(paymentMethod === "Dana Pribadi Owner" || paymentMethod === "Talangan Karyawan") && (
                <>
                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-emerald-600" /> Penanggung Jawab / Talangan
                    </label>

                    {paymentMethod === "Dana Pribadi Owner" ? (
                      <div className="relative">
                        <select
                          value={paidByPerson === "Refo" || paidByPerson === "refo" ? "Refo" : "Rama"}
                          onChange={(e) => setPaidByPerson(e.target.value)}
                          className="w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-bold text-slate-900 bg-emerald-50/50 cursor-pointer transition-all"
                        >
                          <option value="Rama">Rama (Owner)</option>
                          <option value="Refo">Refo (Owner)</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          value={paidByPerson || activeStaffName}
                          onChange={(e) => setPaidByPerson(e.target.value)}
                          className="w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-sm font-bold text-slate-900 bg-amber-50/50 cursor-pointer transition-all"
                        >
                          <option value="Reza">Reza</option>
                          <option value="Ummu">Ummu</option>
                          <option value="Cheisa">Cheisa</option>
                          <option value="Novi">Novi</option>
                          <option value="Titis">Titis</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-amber-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <CheckSquare className="w-3.5 h-3.5 text-slate-500" /> Status Reimburse
                    </label>
                    <div className="relative">
                      <select
                        value={paymentStatus}
                        onChange={(e) => setPaymentStatus(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-sm font-semibold text-slate-900 bg-white cursor-pointer transition-all"
                      >
                        <option value="Belum Direimburse">Belum Direimburse</option>
                        <option value="Sudah Dilunasi">Sudah Dilunasi / Reimburse</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </>
              )}

              {/* Conditional Rendering: Hutang Supplier (Tempo) */}
              {paymentMethod === "Hutang Supplier" && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-slate-500" /> Status Pembayaran Supplier
                  </label>
                  <div className="relative">
                    <select
                      value={paymentStatus}
                      onChange={(e) => setPaymentStatus(e.target.value)}
                      className="w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-sm font-semibold text-slate-900 bg-white cursor-pointer transition-all"
                    >
                      <option value="Tempo (Hutang Supplier)">Tempo (Belum Lunas)</option>
                      <option value="Sudah Dilunasi">Sudah Dilunasi</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Itemized Products Table with Dynamic Fuzzy Matched Sub-Categories */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" /> RINCIAN ITEM PRODUK & SUB-KATEGORI ({items.length})
                </label>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs transition-colors border border-emerald-200 shadow-2xs active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Tambah Item Baru
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, idx) => {
                  // Fuzzy parent category match
                  const currentCategoryClean = (item.category || "").toLowerCase().trim()
                  const currentParentObj = categoryHierarchy.find(
                    (h) =>
                      h.name.toLowerCase().trim() === currentCategoryClean ||
                      currentCategoryClean.includes(h.name.toLowerCase()) ||
                      h.name.toLowerCase().includes(currentCategoryClean)
                  )

                  const itemTotal = (item.price || 0) * (item.quantity || 1)

                  return (
                    <div
                      key={idx}
                      className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200 hover:border-slate-300 transition-all space-y-4 shadow-2xs"
                    >
                      {/* Header Row of Item Card */}
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-700">Subtotal Item:</span>
                          <span className="text-xs font-extrabold font-mono text-emerald-700 bg-emerald-100/90 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                            Rp {itemTotal.toLocaleString("id-ID")}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
                          title="Hapus Item"
                        >
                          <Trash2 className="w-4 h-4" /> Hapus
                        </button>
                      </div>

                      {/* Row 1: Nama Barang, Harga Satuan, Qty */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                        <div className="sm:col-span-6 space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <ShoppingBag className="w-3.5 h-3.5 text-slate-500" /> Nama Produk / Barang
                          </label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleItemChange(idx, "name", e.target.value)}
                            placeholder="Contoh: Syrup Romma 1L"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-semibold text-slate-900 bg-white"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-slate-500" /> Harga Satuan (Rp)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={item.price === 0 ? 0 : (item.price ?? "")}
                            onChange={(e) => {
                              const val = e.target.value
                              handleItemChange(idx, "price", val === "" ? "" : parseFloat(val))
                            }}
                            placeholder="0"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-bold text-slate-900 font-mono bg-white"
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Package className="w-3.5 h-3.5 text-slate-500" /> Jumlah (Qty)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity === undefined || item.quantity === null ? "" : item.quantity}
                            onChange={(e) => {
                              const val = e.target.value
                              handleItemChange(idx, "quantity", val === "" ? "" : parseInt(val, 10))
                            }}
                            placeholder="1"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-bold text-slate-900 font-mono bg-white"
                          />
                        </div>
                      </div>

                      {/* Row 2: Dynamic Category & Sub-Category Selection */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                        {/* Parent Category Field */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700">Kategori Utama Produk</label>
                            <button
                              type="button"
                              onClick={() => openAddCategoryModal("parent", undefined, idx)}
                              className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-600" /> Tambah
                            </button>
                          </div>
                          <div className="relative">
                            <select
                              value={
                                (() => {
                                  const match = categoryHierarchy.find(
                                    (h) => h.name.toLowerCase().trim() === (item.category || "").toLowerCase().trim()
                                  )
                                  return match ? match.name : item.category || categoryHierarchy[0]?.name || "Lain-lain"
                                })()
                              }
                              onChange={(e) => {
                                const newParent = e.target.value
                                const matchingParent = categoryHierarchy.find(
                                  (h) => h.name.toLowerCase().trim() === newParent.toLowerCase().trim()
                                )
                                const defaultSub = matchingParent?.subCategories[0]?.name || "Umum"
                                handleItemChange(idx, "category", newParent)
                                handleItemChange(idx, "subCategory", defaultSub)
                              }}
                              className="w-full appearance-none pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white cursor-pointer"
                            >
                              {(() => {
                                const parentNames = categoryHierarchy.map((h) => h.name)
                                const hasMatch = parentNames.some(
                                  (p) => p.toLowerCase().trim() === (item.category || "").toLowerCase().trim()
                                )
                                const options = item.category && !hasMatch
                                  ? [item.category, ...parentNames]
                                  : parentNames.length > 0
                                  ? parentNames
                                  : ["Bahan Baku", "Operasional & Perlengkapan", "Peralatan & Aset", "Lain-lain"]

                                return options.map((catName) => (
                                  <option key={catName} value={catName}>
                                    {catName}
                                  </option>
                                ))
                              })()}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {/* Sub-Category Field */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700">Sub-Kategori Produk</label>
                            <button
                              type="button"
                              onClick={() => openAddCategoryModal("sub", item.category, idx)}
                              className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-600" /> Tambah Sub
                            </button>
                          </div>
                          <div className="relative">
                            <select
                              value={
                                (() => {
                                  const matchingParent = categoryHierarchy.find(
                                    (h) => h.name.toLowerCase().trim() === (item.category || "").toLowerCase().trim()
                                  )
                                  const dbSubNames = matchingParent ? matchingParent.subCategories.map((s) => s.name) : []
                                  const validSubList = ["Umum", ...dbSubNames]
                                  const subMatch = validSubList.find(
                                    (s) => s.toLowerCase().trim() === (item.subCategory || "").toLowerCase().trim()
                                  )
                                  return subMatch || (dbSubNames.length > 0 ? dbSubNames[0] : "Umum")
                                })()
                              }
                              onChange={(e) => handleItemChange(idx, "subCategory", e.target.value)}
                              className="w-full appearance-none pl-3.5 pr-8 py-2.5 rounded-xl border border-emerald-300 focus:border-emerald-500 text-xs font-bold text-emerald-900 bg-emerald-50/50 cursor-pointer"
                            >
                              {(() => {
                                const matchingParent = categoryHierarchy.find(
                                  (h) => h.name.toLowerCase().trim() === (item.category || "").toLowerCase().trim()
                                )
                                const dbSubNames = matchingParent ? matchingParent.subCategories.map((s) => s.name) : []
                                const subOptions = Array.from(new Set(["Umum", ...dbSubNames]))

                                return subOptions.map((subName) => (
                                  <option key={subName} value={subName}>
                                    {subName}
                                  </option>
                                ))
                              })()}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Subtotal & Tax (PPN) Fields */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-600" /> Ringkasan Subtotal, Diskon & Pajak (PPN)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Subtotal Barang (Rp)</label>
                  <input
                    type="text"
                    value={`Rp ${itemsSubtotal.toLocaleString("id-ID")}`}
                    readOnly
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-100/90 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-rose-500" /> Diskon / Potongan
                    </label>
                    <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => handleDiscountTypeChange("RP")}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          discountType === "RP" ? "bg-white text-rose-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Rp
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscountTypeChange("PERCENT")}
                        className={`px-2 py-0.5 rounded-md transition-all ${
                          discountType === "PERCENT" ? "bg-white text-rose-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>

                  {discountType === "RP" ? (
                    <input
                      type="number"
                      min="0"
                      value={discountAmount === 0 ? 0 : (discountAmount ?? "")}
                      onChange={(e) => {
                        const val = e.target.value
                        setDiscountAmount(val === "" ? "" : parseFloat(val))
                      }}
                      placeholder="0"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-rose-500 text-xs font-bold text-rose-600 bg-white font-mono"
                    />
                  ) : (
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={discountPercentValue}
                        onChange={(e) => {
                          const val = e.target.value
                          handleDiscountPercentChange(val === "" ? "" : parseFloat(val))
                        }}
                        placeholder="0"
                        className="w-full px-3.5 py-2.5 pr-12 rounded-xl border border-slate-300 focus:border-rose-500 text-xs font-bold text-rose-600 bg-white font-mono"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                        %
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    <Percent className="w-3 h-3 text-amber-500" /> Nominal Pajak / PPN (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={taxAmount === 0 ? 0 : (taxAmount ?? "")}
                    onChange={(e) => {
                      const val = e.target.value
                      setTaxAmount(val === "" ? "" : parseFloat(val))
                    }}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-bold text-slate-900 bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Total Summary Box */}
            <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
              <div className="flex items-center justify-between text-sm sm:text-base">
                <span className="font-bold text-slate-300">Total Netto Akhir Nota</span>
                <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                  Rp {calculatedTotal.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Subtotal: Rp {itemsSubtotal.toLocaleString("id-ID")}
                  {currentDiscountNum > 0 && ` - Diskon: Rp ${currentDiscountNum.toLocaleString("id-ID")}`}
                  {` + PPN: Rp ${currentTaxNum.toLocaleString("id-ID")}`}
                </span>
                <span className="font-semibold text-emerald-400">Kalkulasi Presisi</span>
              </div>
            </div>

            {/* Optional Note */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-700">Catatan Tambahan (Opsional)</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Catatan seperti nama pembeli, keperluan operasional, dsb."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-medium text-slate-900 bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CREATE CATEGORY / SUB-CATEGORY MODAL */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-emerald-600" />
                Tambah Kategori / Sub-Kategori
              </h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setNewCatType("parent")}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  newCatType === "parent" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                }`}
              >
                Kategori Utama
              </button>
              <button
                type="button"
                onClick={() => setNewCatType("sub")}
                className={`flex-1 py-2 rounded-lg transition-all ${
                  newCatType === "sub" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                }`}
              >
                Sub-Kategori
              </button>
            </div>

            {newCatType === "sub" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Pilih Kategori Induk Utama</label>
                <div className="relative">
                  <select
                    value={selectedParentForSub}
                    onChange={(e) => setSelectedParentForSub(e.target.value)}
                    className="w-full appearance-none pl-3.5 pr-9 py-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white cursor-pointer"
                  >
                    {categoryHierarchy.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                {newCatType === "parent" ? "Nama Kategori Utama Baru" : "Nama Sub-Kategori Baru"}
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={newCatType === "parent" ? "Contoh: Bahan Baku Utama" : "Contoh: Daging & Seafood"}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm font-semibold text-slate-900"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateCustomCategory}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-colors shadow-md shadow-emerald-600/30"
              >
                <Plus className="w-4 h-4" /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STICKY BOTTOM ACC BAR FOR MOBILE PHONE (< sm) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center justify-between gap-2 shadow-2xl">
        <div className="pl-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
            {batchInfo ? `Nota ${batchInfo.currentIndex + 1}/${batchInfo.totalCount}` : "Total Netto"}
          </span>
          <p className="text-sm sm:text-base font-black font-mono text-emerald-700">
            Rp {calculatedTotal.toLocaleString("id-ID")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {batchInfo && onSkipBatch && batchInfo.currentIndex < batchInfo.totalCount - 1 && (
            <button
              type="button"
              onClick={onSkipBatch}
              className="px-3 py-2.5 rounded-xl bg-amber-50 active:bg-amber-100 text-amber-800 font-bold text-xs border border-amber-200 transition-all"
            >
              Lewati
            </button>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 active:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {batchInfo && batchInfo.currentIndex < batchInfo.totalCount - 1
              ? `ACC & Lanjut`
              : editingReceiptId
              ? "Simpan Perubahan"
              : "Simpan / ACC"}
          </button>
        </div>
      </div>
    </div>
  )
}
