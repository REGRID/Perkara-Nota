"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  Search,
  Receipt as ReceiptIcon,
  Tag,
  Trash2,
  Eye,
  ShoppingBag,
  TrendingUp,
  X,
  Store,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Edit,
  BarChart3,
  Settings,
  Plus,
  Check,
  ChevronRight,
  ListFilter,
  ArrowDownToLine,
  Maximize2,
  Info,
  Calendar,
  Database,
  Printer,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Layers,
  PieChart as PieIcon,
  LineChart as LineIcon,
  Zap,
  Building2,
  CheckSquare,
  Square,
  Filter,
  User,
  ShieldCheck,
  Image as ImageIcon,
  Bell,
  AlertCircle,
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts"
import { ImageInteractiveLightbox } from "@/components/ImageInteractiveLightbox"
import { getAuthHeaders } from "@/lib/authClient"
import { requestNotificationPermission, sendNativeOSNotification } from "@/lib/pwaNotification"

export interface ReceiptItem {
  id: string
  receiptId: string
  name: string
  category: string
  subCategory?: string
  price: number
  quantity: number
  createdAt: string
}

export interface ReceiptData {
  id: string
  merchantName: string
  date: string
  imageUrl?: string | null
  subtotal?: number
  taxAmount?: number
  totalAmount: number
  paymentMethod?: string
  paymentStatus?: string
  note?: string | null
  items: ReceiptItem[]
  createdAt: string
}

export interface HierarchyGroup {
  id: string
  name: string
  subCategories: { id: string; name: string }[]
}

export interface ItemBreakdownEntry {
  receiptId: string
  receiptDate: string
  merchantName: string
  itemName: string
  category: string
  subCategory: string
  price: number
  quantity: number
  total: number
}

export interface ItemBreakdownModalState {
  title: string
  subTitle: string
  totalSpend: number
  totalQty: number
  items: ItemBreakdownEntry[]
}

const GRAPH_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b"]

interface ReceiptHistoryDashboardProps {
  onScanNewReceipt: () => void
  onEditReceipt?: (receipt: ReceiptData) => void
  currentAdminUser?: string
}

export function ReceiptHistoryDashboard({ onScanNewReceipt, onEditReceipt, currentAdminUser = "" }: ReceiptHistoryDashboardProps) {
  const [allReceipts, setAllReceipts] = useState<ReceiptData[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("nota_receipts_cache_v2")
        if (cached) return JSON.parse(cached)
      } catch (e) {}
    }
    return []
  })
  const [hierarchy, setHierarchy] = useState<HierarchyGroup[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("nota_receipts_cache_v2")
        if (cached && JSON.parse(cached).length > 0) return false
      } catch (e) {}
    }
    return true
  })

  // Dual-Admin Pending Approvals State
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [isProcessingApproval, setIsProcessingApproval] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [expandedApprovalId, setExpandedApprovalId] = useState<string | null>(null)

  // Approval Receipt Image On-Demand Cache State
  const [approvalImageUrls, setApprovalImageUrls] = useState<Record<string, string>>({})
  const [loadingApprovalImageId, setLoadingApprovalImageId] = useState<string | null>(null)

  const fetchReceiptImageForApproval = async (receiptId: string) => {
    if (approvalImageUrls[receiptId]) return approvalImageUrls[receiptId]
    setLoadingApprovalImageId(receiptId)
    try {
      const res = await fetch(`/api/receipts/${receiptId}`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.imageUrl) {
          setApprovalImageUrls((prev) => ({ ...prev, [receiptId]: data.imageUrl }))
          return data.imageUrl
        }
      }
    } catch (e) {
      console.error("Fetch approval receipt image error:", e)
    } finally {
      setLoadingApprovalImageId(null)
    }
    return null
  }

  // Selected Detail Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null)
  const [isLoadingDetailImage, setIsLoadingDetailImage] = useState(false)
  const [receiptHistoryLogs, setReceiptHistoryLogs] = useState<any[]>([])
  const [isLoadingHistoryLogs, setIsLoadingHistoryLogs] = useState(false)

  // Lazy-load original receipt photo and fetch approval/edit history logs when detail modal opens
  useEffect(() => {
    if (selectedReceipt && selectedReceipt.id) {
      if (!selectedReceipt.imageUrl) {
        setIsLoadingDetailImage(true)
        fetch(`/api/receipts/${selectedReceipt.id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.imageUrl) {
              setSelectedReceipt((prev) => (prev && prev.id === selectedReceipt.id ? { ...prev, imageUrl: data.imageUrl } : prev))
              setAllReceipts((prev) => prev.map((r) => (r.id === selectedReceipt.id ? { ...r, imageUrl: data.imageUrl } : r)))
            }
          })
          .catch((e) => console.error("Gagal memuat foto nota detail:", e))
          .finally(() => setIsLoadingDetailImage(false))
      }

      // Fetch Approval & Edit History Logs
      setIsLoadingHistoryLogs(true)
      fetch(`/api/approvals?status=ALL&receiptId=${selectedReceipt.id}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setReceiptHistoryLogs(data)
          }
        })
        .catch((e) => console.error("Gagal memuat histori approval:", e))
        .finally(() => setIsLoadingHistoryLogs(false))
    } else {
      setReceiptHistoryLogs([])
    }
  }, [selectedReceipt?.id])

  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptData | null>(null)

  // Toggle Analytics Charts display & Chart View Type
  const [showCharts, setShowCharts] = useState(false)
  const [chartMode, setChartMode] = useState<"category" | "daily" | "topSubCategories">("category")

  // Item Breakdown Drill-Down Modal State
  const [itemBreakdownModal, setItemBreakdownModal] = useState<ItemBreakdownModalState | null>(null)

  // Interactive Lightbox Modal State
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null)

  // Filters State
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("Semua")
  const [selectedSubCategory, setSelectedSubCategory] = useState("Semua Sub-Kategori")

  // Date Range Filter State
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "today" | "7days" | "month" | "custom">("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Backup & Restore State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isBackupRestoring, setIsBackupRestoring] = useState(false)

  // Rekening Koran Print Modal State & Page Settings (A3, A4, Letter, Legal, Portrait, Landscape)
  const [showStatementPrintModal, setShowStatementPrintModal] = useState(false)
  const [printPaperSize, setPrintPaperSize] = useState<"A4" | "A3" | "Letter" | "Legal" | "auto">("A4")
  const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("portrait")

  // Kelola Data & Export Combined Modal State
  const [showDataOptionsModal, setShowDataOptionsModal] = useState(false)

  // Selected Detail Modal State
  const [isDeleting, setIsDeleting] = useState(false)

  // Multi-Selection State for Bulk Actions
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkSettling, setIsBulkSettling] = useState(false)

  // Status Filter Panel Toggle & Filter States
  const [showStatusFilterPanel, setShowStatusFilterPanel] = useState<boolean>(false)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("Semua Status")

  // Sub-Status / Penanggung Jawab Filter State
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>("Semua Penanggung Jawab")

  // Dynamically extract all unique person names from [Dibayar oleh: ...] tags in receipts
  const availablePersonNames = useMemo(() => {
    const personSet = new Set<string>()
    allReceipts.forEach((r) => {
      if (r.note) {
        const match = r.note.match(/\[Dibayar oleh: ([^\]]+)\]/)
        if (match && match[1] && match[1].trim()) {
          personSet.add(match[1].trim())
        }
      }
    })
    return Array.from(personSet)
  }, [allReceipts])

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Notification State
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0)
  const [showNotificationsModal, setShowNotificationsModal] = useState<boolean>(false)
  const notifiedIdsRef = useRef<Set<string>>(new Set())

  // Fetch Notifications & Trigger Native OS System Notifications
  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications", {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        const fetchedList: any[] = data.notifications || []
        setNotifications(fetchedList)
        setUnreadNotificationCount(data.unreadCount || 0)

        // Trigger Native OS System Notifications for new unread notifications
        fetchedList.forEach((n) => {
          if (!n.isRead && n.sender.toLowerCase() !== currentAdminUser.toLowerCase()) {
            if (!notifiedIdsRef.current.has(n.id)) {
              notifiedIdsRef.current.add(n.id)
              sendNativeOSNotification(n.title, n.message)
            }
          }
        })
      }
    } catch (e) {
      console.error("Fetch notifications error:", e)
    }
  }

  // Targeted Settle Modal State (Settle with Payment Proof Upload)
  const [showSettleModal, setShowSettleModal] = useState<boolean>(false)
  const [settleTargetTitle, setSettleTargetTitle] = useState<string>("")
  const [settleTargetPerson, setSettleTargetPerson] = useState<string>("")
  const [settleTargetReceipts, setSettleTargetReceipts] = useState<ReceiptData[]>([])
  const [paymentProofImage, setPaymentProofImage] = useState<string | null>(null)
  const [isSubmittingSettle, setIsSubmittingSettle] = useState<boolean>(false)

  // Unified Settle Flow Trigger (Single or Checkmarked Receipts with mandatory Payment Proof Upload)
  const triggerSettleFlow = (clickedReceipt?: ReceiptData) => {
    // If there are checkmarked receipts in the list, settle all checkmarked receipts!
    if (selectedReceiptIds.length > 0) {
      const selectedObjList = allReceipts.filter(
        (r) => selectedReceiptIds.includes(r.id) && !isReceiptSettled(r.paymentStatus)
      )

      if (selectedObjList.length === 0) {
        alert("Nota yang Anda pilih sudah berstatus Sudah Dilunasi.")
        return
      }

      setSettleTargetTitle(`Pelunasan ${selectedObjList.length} Nota Terpilih`)
      setSettleTargetPerson("")
      setSettleTargetReceipts(selectedObjList)
      setPaymentProofImage(null)
      setShowSettleModal(true)
      return
    }

    // If no receipts are checkmarked, target the single clicked receipt!
    if (clickedReceipt) {
      if (isReceiptSettled(clickedReceipt.paymentStatus)) {
        alert("Nota ini sudah berstatus Sudah Dilunasi.")
        return
      }

      setSettleTargetTitle(`Pelunasan Nota: ${clickedReceipt.merchantName}`)
      setSettleTargetPerson("")
      setSettleTargetReceipts([clickedReceipt])
      setPaymentProofImage(null)
      setShowSettleModal(true)
      return
    }
  }

  // Export Confirmation Modal State
  const [exportConfirmFormat, setExportConfirmFormat] = useState<"xlsx" | "csv" | "statement" | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Category CRUD Management Modal State
  const [showManageCategoryModal, setShowManageCategoryModal] = useState(false)
  const [newCatType, setNewCatType] = useState<"parent" | "sub">("parent")
  const [newCatNameInput, setNewCatNameInput] = useState("")
  const [selectedParentId, setSelectedParentId] = useState("")
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState("")

  // Fetch Hierarchy Categories from API (STRICTLY FROM DATABASE)
  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories")
      if (res.ok) {
        const data = await res.json()
        if (data.hierarchy && Array.isArray(data.hierarchy)) {
          setHierarchy(data.hierarchy)
          if (data.hierarchy.length > 0 && !selectedParentId) {
            setSelectedParentId(data.hierarchy[0].id)
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Fetch All Receipts from API (Initial & Background Sync)
  const fetchAllReceipts = async (silent = false) => {
    if (!silent && allReceipts.length === 0) setIsInitialLoading(true)
    try {
      const res = await fetch("/api/receipts")
      if (res.ok) {
        const data = await res.json()
        setAllReceipts(data)
        try {
          localStorage.setItem("nota_receipts_cache_v2", JSON.stringify(data))
        } catch (e) {}
      }
    } catch (err) {
      console.error("Gagal mengambil riwayat nota:", err)
    } finally {
      setIsInitialLoading(false)
    }
  }

  // Fetch Pending Approvals for Dual-Admin Verification
  const fetchPendingApprovals = async () => {
    try {
      const res = await fetch("/api/approvals?status=PENDING", {
        headers: getAuthHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setPendingApprovals(data)
      }
    } catch (err) {
      console.error("Gagal mengambil daftar pending approval:", err)
    }
  }

  const handleApproveRequest = async (approvalId: string) => {
    setIsProcessingApproval(true)
    try {
      const res = await fetch(`/api/approvals/${approvalId}/approve`, {
        method: "POST",
        headers: getAuthHeaders(),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Gagal menyetujui perubahan.")
      } else {
        alert(data.message || "Perubahan berhasil diverifikasi dan diterapkan.")
        await fetchPendingApprovals()
        await fetchAllReceipts(true)
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat menyetujui verifikasi.")
    } finally {
      setIsProcessingApproval(false)
    }
  }

  const handleRejectRequest = async (approvalId: string) => {
    setIsProcessingApproval(true)
    try {
      const res = await fetch(`/api/approvals/${approvalId}/reject`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: rejectionReason }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Gagal menolak perubahan.")
      } else {
        alert(data.message || "Permintaan perubahan telah ditolak.")
        setRejectionReason("")
        await fetchPendingApprovals()
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat menolak verifikasi.")
    } finally {
      setIsProcessingApproval(false)
    }
  }

  const handleSettleReceiptRequest = async (receipt: ReceiptData) => {
    if (!confirm(`Ajukan pelunasan untuk Nota ${receipt.merchantName} (Rp ${receipt.totalAmount.toLocaleString("id-ID")})?`)) return
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          receiptId: receipt.id,
          actionType: "SETTLE",
          payload: { id: receipt.id, paymentStatus: "Sudah Dilunasi" },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Gagal mengajukan pelunasan nota.")
      } else {
        alert(data.message || "Permintaan pelunasan nota berhasil diajukan. Menunggu verifikasi dari admin lain.")
        await fetchPendingApprovals()
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat mengajukan pelunasan.")
    }
  }

  const markAllNotificationsAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ markAllRead: true }),
      })
      setUnreadNotificationCount(0)
      setNotifications((prev: any[]) => prev.map((n: any) => ({ ...n, isRead: true })))
    } catch (e) {
      console.error("Mark notifications read error:", e)
    }
  }

  const handleOpenSettleModalForPerson = (personName: string) => {
    const unsettledForPerson = allReceipts.filter((r) => {
      if (isReceiptSettled(r.paymentStatus)) return false
      const noteText = r.note || ""
      const match = noteText.match(/\[Dibayar oleh: ([^\]]+)\]/)
      const paidBy = match ? match[1].trim() : ""
      return paidBy.toLowerCase() === personName.toLowerCase()
    })

    if (unsettledForPerson.length === 0) {
      alert(`Tidak ada nota yang belum direimburse / tempo untuk ${personName}.`)
      return
    }

    setSettleTargetTitle(`Pelunasan Talangan: ${personName}`)
    setSettleTargetPerson(personName)
    setSettleTargetReceipts(unsettledForPerson)
    setPaymentProofImage(null)
    setShowSettleModal(true)
  }

  const handleOpenSettleModalForSelection = () => {
    const selectedObjList = allReceipts.filter((r) => selectedReceiptIds.includes(r.id))
    if (selectedObjList.length === 0) return

    setSettleTargetTitle(`Pelunasan ${selectedObjList.length} Nota Terpilih`)
    setSettleTargetPerson("")
    setSettleTargetReceipts(selectedObjList)
    setPaymentProofImage(null)
    setShowSettleModal(true)
  }

  const handleSubmitSettleWithProof = async () => {
    if (settleTargetReceipts.length === 0) return
    if (!paymentProofImage) {
      alert("Wajib mengunggah / melampirkan foto bukti pembayaran atau struk transfer terlebih dahulu.")
      return
    }

    const ids = settleTargetReceipts.map((r) => r.id)
    const totalAmt = settleTargetReceipts.reduce((sum, r) => sum + r.totalAmount, 0)

    setIsSubmittingSettle(true)
    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ids,
          paymentStatus: "Sudah Dilunasi",
          proofImageUrl: paymentProofImage,
          personName: settleTargetPerson,
          totalAmount: totalAmt,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        alert(data.message || `Permintaan pelunasan (${ids.length} nota) berhasil diajukan ke Admin lain.`)
        setShowSettleModal(false)
        setSelectedReceiptIds([])
        setPaymentProofImage(null)
        await fetchPendingApprovals()
        await fetchNotifications()
      } else {
        alert(data.error || "Gagal mengajukan pelunasan nota.")
      }
    } catch (e: any) {
      alert("Terjadi kesalahan saat mengajukan pelunasan.")
    } finally {
      setIsSubmittingSettle(false)
    }
  }

  useEffect(() => {
    fetchCategories()
    fetchAllReceipts(false)
    fetchPendingApprovals()
    fetchNotifications()

    // Smart Polling: Only poll when document tab is active to save bandwidth & database connections
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchPendingApprovals()
        fetchNotifications()
      }
    }, 10000)

    // Instant Sync when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchPendingApprovals()
        fetchNotifications()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  // Parent Category Tabs List strictly built from database hierarchy
  const parentTabs = ["Semua", ...hierarchy.map((h) => h.name)]

  // Build Sub-Category Pills for selected parent category
  const activeParentObj = hierarchy.find((h) => h.name === selectedCategory)
  const subCategoryOptions = activeParentObj
    ? ["Semua Sub-Kategori", ...activeParentObj.subCategories.map((s) => s.name)]
    : []

  // Reset Sub-Category filter seamlessly when Parent Category changes
  const handleSelectParentCategory = (cat: string) => {
    setSelectedCategory(cat)
    setSelectedSubCategory("Semua Sub-Kategori")
    setCurrentPage(1)
  }

  // Check if a specific sub-category filter is active
  const isSubCategoryActive = selectedSubCategory && selectedSubCategory !== "Semua Sub-Kategori"
  const subQ = isSubCategoryActive ? selectedSubCategory.toLowerCase() : ""

  // Helper to check if receipt is settled (Lunas)
  const isReceiptSettled = (paymentStatus?: string | null): boolean => {
    if (!paymentStatus) return true
    const st = paymentStatus.toLowerCase().trim()
    if (st.includes("belum") || st.includes("tempo")) {
      return false
    }
    return st === "lunas" || st.includes("sudah")
  }

  // SEAMLESS INSTANT CLIENT-SIDE FILTERING (Category + Sub-Category + Search + Date Range + Status)
  const filteredReceipts = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const currentMonthStr = todayStr.substring(0, 7) // YYYY-MM

    return allReceipts.filter((r) => {
      // 1. Date Range Filter
      if (dateRangeFilter === "today" && r.date !== todayStr) return false
      if (dateRangeFilter === "7days" && r.date < sevenDaysAgo) return false
      if (dateRangeFilter === "month" && !r.date.startsWith(currentMonthStr)) return false
      if (dateRangeFilter === "custom") {
        if (startDate && r.date < startDate) return false
        if (endDate && r.date > endDate) return false
      }

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchMerchant = r.merchantName.toLowerCase().includes(q)
        const matchItem = r.items.some(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            (item.subCategory && item.subCategory.toLowerCase().includes(q))
        )
        const matchPayment = (r.paymentMethod || "").toLowerCase().includes(q)
        const matchNote = (r.note || "").toLowerCase().includes(q)
        if (!matchMerchant && !matchItem && !matchPayment && !matchNote) return false
      }

      // 3. Sub-Category Filter
      if (isSubCategoryActive) {
        const hasSubItem = r.items.some((item) => {
          const sub = (item.subCategory || "").toLowerCase()
          const cat = (item.category || "").toLowerCase()
          return sub.includes(subQ) || cat.includes(subQ)
        })
        if (!hasSubItem) return false
      }
      // 4. Parent Category Filter
      else if (selectedCategory && selectedCategory !== "Semua") {
        const catQ = selectedCategory.toLowerCase().split("/")[0].trim()
        const hasCatItem = r.items.some((item) => {
          const cat = (item.category || "").toLowerCase()
          const sub = (item.subCategory || "").toLowerCase()
          return cat.includes(catQ) || sub.includes(catQ)
        })
        if (!hasCatItem) return false
      }

      // 5. Payment Status Filter
      if (selectedStatusFilter === "Lunas") {
        if (r.paymentStatus !== "Lunas") return false
      } else if (selectedStatusFilter === "Sudah Dilunasi") {
        if (r.paymentStatus !== "Sudah Dilunasi") return false
      } else if (selectedStatusFilter === "Belum Direimburse / Tempo") {
        if (isReceiptSettled(r.paymentStatus)) return false
      }

      // 6. Sub-Status (Penanggung Jawab / Talangan) Filter
      if (selectedPersonFilter !== "Semua Penanggung Jawab") {
        const noteText = r.note || ""
        const match = noteText.match(/\[Dibayar oleh: ([^\]]+)\]/)
        const paidBy = match ? match[1].trim() : ""
        if (paidBy.toLowerCase() !== selectedPersonFilter.toLowerCase()) return false
      }

      return true
    })
  }, [
    allReceipts,
    dateRangeFilter,
    startDate,
    endDate,
    searchQuery,
    selectedCategory,
    selectedSubCategory,
    isSubCategoryActive,
    subQ,
    selectedStatusFilter,
    selectedPersonFilter,
  ])

  // Reset to Page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, dateRangeFilter, startDate, endDate, selectedCategory, selectedSubCategory, selectedStatusFilter, selectedPersonFilter])

  // Build lookup map for receipts that have pending approval requests
  const pendingApprovalMap = useMemo(() => {
    const map: Record<string, { actionType: string; requestedBy: string; id: string }> = {}
    pendingApprovals.forEach((req) => {
      if (req.receiptId) {
        map[req.receiptId] = { actionType: req.actionType, requestedBy: req.requestedBy, id: req.id }
      }
      if ((req.actionType === "BULK_DELETE" || req.actionType === "BULK_SETTLE") && req.payload) {
        try {
          const payloadObj = JSON.parse(req.payload)
          if (payloadObj.ids && Array.isArray(payloadObj.ids)) {
            payloadObj.ids.forEach((id: string) => {
              map[id] = { actionType: req.actionType, requestedBy: req.requestedBy, id: req.id }
            })
          }
        } catch (e) {}
      }
    })
    return map
  }, [pendingApprovals])

  // Pagination Calculations
  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage) || 1
  const paginatedReceipts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredReceipts.slice(start, start + itemsPerPage)
  }, [filteredReceipts, currentPage, itemsPerPage])

  // Bulk Selection Handlers
  const isAllSelected = useMemo(() => {
    if (paginatedReceipts.length === 0) return false
    return paginatedReceipts.every((r) => selectedReceiptIds.includes(r.id))
  }, [paginatedReceipts, selectedReceiptIds])

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedReceiptIds([])
    } else {
      setSelectedReceiptIds(paginatedReceipts.map((r) => r.id))
    }
  }

  const isAllFilteredSelected = useMemo(() => {
    if (filteredReceipts.length === 0) return false
    return filteredReceipts.every((r) => selectedReceiptIds.includes(r.id))
  }, [filteredReceipts, selectedReceiptIds])

  const toggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      setSelectedReceiptIds([])
    } else {
      setSelectedReceiptIds(filteredReceipts.map((r) => r.id))
    }
  }

  const toggleSelectRow = (id: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleBulkDelete = async () => {
    if (selectedReceiptIds.length === 0) return
    if (!confirm(`Ajukan penghapusan massal untuk ${selectedReceiptIds.length} nota yang dipilih?`)) return

    setIsBulkDeleting(true)
    try {
      const res = await fetch("/api/receipts", {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ids: selectedReceiptIds }),
      })

      const data = await res.json()
      if (res.ok) {
        if (data.pendingApproval) {
          alert(data.message || `Permintaan hapus massal (${selectedReceiptIds.length} nota) telah diajukan. Menunggu verifikasi dari admin lain.`)
          await fetchPendingApprovals()
        } else {
          setAllReceipts((prev) => prev.filter((r) => !selectedReceiptIds.includes(r.id)))
        }
        setSelectedReceiptIds([])
      } else {
        alert(data.error || "Gagal menghapus nota terpilih")
      }
    } catch (e) {
      alert("Gagal menghapus beberapa nota terpilih")
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleBulkSettle = async () => {
    if (selectedReceiptIds.length === 0) return
    if (!confirm(`Ajukan pelunasan massal untuk ${selectedReceiptIds.length} nota yang dipilih?`)) return

    setIsBulkSettling(true)
    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ids: selectedReceiptIds, paymentStatus: "Sudah Dilunasi" }),
      })

      const data = await res.json()
      if (res.ok) {
        if (data.pendingApproval) {
          alert(data.message || `Permintaan pelunasan massal (${selectedReceiptIds.length} nota) telah diajukan. Menunggu verifikasi dari admin lain.`)
          await fetchPendingApprovals()
        } else {
          setAllReceipts((prev) =>
            prev.map((r) =>
              selectedReceiptIds.includes(r.id) ? { ...r, paymentStatus: "Sudah Dilunasi" } : r
            )
          )
        }
        setSelectedReceiptIds([])
      } else {
        alert(data.error || "Gagal mengajukan pelunasan nota terpilih")
      }
    } catch (e) {
      alert("Gagal mengajukan pelunasan nota terpilih")
    } finally {
      setIsBulkSettling(false)
    }
  }

  // Category CRUD Handlers
  const handleCreateCategory = async () => {
    if (!newCatNameInput.trim()) return
    try {
      const payload: any = { name: newCatNameInput.trim() }
      if (newCatType === "sub" && selectedParentId) {
        payload.parentId = selectedParentId
      }

      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setNewCatNameInput("")
        await fetchCategories()
        await fetchAllReceipts(true)
      }
    } catch (e) {
      alert("Gagal membuat kategori baru")
    }
  }

  const handleUpdateCategory = async (catId: string) => {
    if (!editingCatName.trim()) return
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingCatName.trim() }),
      })

      if (res.ok) {
        setEditingCatId(null)
        setEditingCatName("")
        await fetchCategories()
        await fetchAllReceipts(true)
      }
    } catch (e) {
      alert("Gagal memperbarui kategori")
    }
  }

  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (!confirm(`Yakin ingin menghapus kategori "${catName}"?`)) return
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        await fetchCategories()
        await fetchAllReceipts(true)
      }
    } catch (e) {
      alert("Gagal menghapus kategori")
    }
  }

  // Backup & Restore Database Handlers
  const handleExportJsonBackup = async () => {
    try {
      const res = await fetch("/api/backup")
      if (!res.ok) throw new Error("Gagal mengunduh cadangan JSON")
      const blob = await res.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = `NotaPhoto_FullBackup_${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      alert("Gagal membuat cadangan database JSON")
    }
  }

  const handleRestoreJsonBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsBackupRestoring(true)
    try {
      const text = await file.text()
      const backupData = JSON.parse(text)

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backupData),
      })

      const data = await res.json()
      if (res.ok) {
        alert(data.message || "Berhasil memulihkan cadangan database!")
        await fetchCategories()
        await fetchAllReceipts(false)
      } else {
        alert(data.error || "Gagal mengimpor cadangan database")
      }
    } catch (err: any) {
      alert("Format file cadangan tidak valid atau bermasalah")
    } finally {
      setIsBackupRestoring(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // Trigger A4/A3/Letter Rekening Koran Printing
  const handleTriggerA4Print = () => {
    window.print()
  }

  // Direct Native PDF Vector File Exporter (jsPDF + autoTable)
  const handleExportPdfDirect = () => {
    try {
      const format = printPaperSize === "auto" ? "a4" : printPaperSize.toLowerCase()
      const orientation = printOrientation

      const doc = new jsPDF({
        orientation,
        unit: "mm",
        format,
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()

      // Header Banner
      doc.setFillColor(15, 23, 42)
      doc.rect(10, 10, pageWidth - 20, 14, "F")

      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(255, 255, 255)
      doc.text("LAPORAN REKAPITULASI PEMBUKUAN NOTA PHOTO", 14, 19)

      doc.setFontSize(8)
      doc.setTextColor(16, 185, 129)
      doc.text("PERKARA KOPI — OFFICIAL STATEMENT", pageWidth - 14, 19, { align: "right" })

      // Metadata Section
      let currentY = 29
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.5)
      doc.setTextColor(15, 23, 42)
      doc.text(`Periode Data: ${statementDateRange.from} s/d ${statementDateRange.to}`, 10, currentY)
      doc.text(`Total Ringkasan: ${statementTableRows.length} Struk — Rp ${Math.round(totalSpend).toLocaleString("id-ID")}`, pageWidth - 10, currentY, { align: "right" })

      currentY += 5
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text(`No. Registrasi: 140008801996 | Kategori: ${selectedCategory}${isSubCategoryActive ? ` (${selectedSubCategory})` : ""}`, 10, currentY)

      currentY += 6

      // Prepare Table Rows
      const head = [["Tanggal", "No. Ref", "Toko", "Rincian Barang & Kategori", "Pengeluaran", "Total"]]

      const body = statementTableRows.map((row) => {
        const itemDetails = row.rawItems
          .map((it) => `• ${it.name} (x${it.quantity})`)
          .join("\n")
        const catLabel = `[${row.categories || "Umum"}]`
        const fullDetails = `${catLabel}\n${itemDetails}`

        return [
          row.date,
          row.refNo,
          row.merchantName,
          fullDetails,
          `Rp ${Math.round(row.debit).toLocaleString("id-ID")}`,
          `Rp ${Math.round(row.balance).toLocaleString("id-ID")}`,
        ]
      })

      // Generate Table
      autoTable(doc, {
        startY: currentY,
        head,
        body,
        margin: { top: 12, bottom: 16, left: 10, right: 10 },
        theme: "grid",
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          halign: "left",
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [30, 41, 59],
          cellPadding: 2.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: orientation === "landscape" ? 24 : 22, halign: "center", fontStyle: "bold" },
          1: { cellWidth: orientation === "landscape" ? 28 : 25, fontStyle: "normal" },
          2: { cellWidth: orientation === "landscape" ? 38 : 32, fontStyle: "bold" },
          3: { cellWidth: "auto" },
          4: { cellWidth: orientation === "landscape" ? 32 : 28, halign: "right", fontStyle: "bold", textColor: [16, 185, 129] },
          5: { cellWidth: orientation === "landscape" ? 34 : 30, halign: "right", fontStyle: "bold" },
        },
        didDrawPage: (data) => {
          const totalPages = doc.getNumberOfPages()
          doc.setFontSize(8)
          doc.setTextColor(148, 163, 184)
          doc.text(
            `Halaman ${data.pageNumber} dari ${totalPages} — Dokumen Laporan Rekapitulasi Pembukuan Nota Photo`,
            pageWidth / 2,
            pageHeight - 6,
            { align: "center" }
          )
        },
      })

      // Summary Card on last page
      const finalY = (doc as any).lastAutoTable?.finalY || currentY + 40
      if (finalY + 18 < pageHeight - 12) {
        doc.setFillColor(15, 23, 42)
        doc.roundedRect(10, finalY + 4, pageWidth - 20, 12, 2.5, 2.5, "F")

        doc.setFont("helvetica", "bold")
        doc.setFontSize(8.5)
        doc.setTextColor(148, 163, 184)
        doc.text("TOTAL AKUMULASI PENGELUARAN (OUTFLOW STATEMENT TOTAL)", 15, finalY + 11.5)

        doc.setFontSize(11)
        doc.setTextColor(16, 185, 129)
        doc.text(`Rp ${Math.round(totalSpend).toLocaleString("id-ID")}`, pageWidth - 15, finalY + 11.5, { align: "right" })
      }

      // Save PDF file
      const dateToday = new Date().toISOString().split("T")[0]
      doc.save(`Laporan_Pembukuan_Nota_Photo_${dateToday}.pdf`)
    } catch (err: any) {
      console.error("PDF Export Error:", err)
      alert("Gagal mengunduh file PDF: " + (err?.message || "Terjadi kesalahan"))
    }
  }

  // Delete Receipt Handler
  const triggerDeleteConfirm = (receipt: ReceiptData) => {
    setDeletingReceipt(receipt)
  }

  const confirmDeleteReceipt = async () => {
    if (!deletingReceipt) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/receipts/${deletingReceipt.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      })

      const data = await res.json()
      if (res.ok) {
        if (data.pendingApproval) {
          alert(data.message || "Permintaan hapus nota telah diajukan. Menunggu verifikasi dari admin lain.")
          await fetchPendingApprovals()
        } else {
          setAllReceipts((prev) => prev.filter((r) => r.id !== deletingReceipt.id))
        }
        if (selectedReceipt?.id === deletingReceipt.id) {
          setSelectedReceipt(null)
        }
        setDeletingReceipt(null)
      } else {
        alert(data.error || "Gagal menghapus nota")
      }
    } catch (err) {
      alert("Gagal menghubungkan ke server untuk menghapus nota")
    } finally {
      setIsDeleting(false)
    }
  }

  // Export File Generator Handler
  const handleProceedExport = async () => {
    if (!exportConfirmFormat) return
    setIsExporting(true)

    try {
      const url = new URL("/api/receipts/export", window.location.origin)
      if (searchQuery) url.searchParams.set("search", searchQuery)
      if (selectedSubCategory && selectedSubCategory !== "Semua Sub-Kategori") {
        url.searchParams.set("category", selectedSubCategory)
      } else if (selectedCategory && selectedCategory !== "Semua") {
        url.searchParams.set("category", selectedCategory)
      }
      if (selectedStatusFilter && selectedStatusFilter !== "Semua Status") {
        url.searchParams.set("status", selectedStatusFilter)
      }
      if (selectedPersonFilter && selectedPersonFilter !== "Semua Penanggung Jawab") {
        url.searchParams.set("person", selectedPersonFilter)
      }
      if (dateRangeFilter === "custom") {
        if (startDate) url.searchParams.set("startDate", startDate)
        if (endDate) url.searchParams.set("endDate", endDate)
      } else if (dateRangeFilter !== "all") {
        url.searchParams.set("dateRange", dateRangeFilter)
      }

      url.searchParams.set("format", exportConfirmFormat)
      url.searchParams.set("order", "asc")

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error("Gagal mengunduh laporan excel/csv")

      const blob = await res.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      const ext = exportConfirmFormat === "csv" ? "csv" : "xlsx"
      const prefix = exportConfirmFormat === "statement" ? "Rekening_Koran" : "Laporan_Nota"
      a.download = `${prefix}_${selectedCategory.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(downloadUrl)

      setExportConfirmFormat(null)
    } catch (err: any) {
      alert(err.message || "Gagal membuat laporan ekspor")
    } finally {
      setIsExporting(false)
    }
  }

  // Calculate Total Spend dynamically: If sub-category filter is active, sum items belonging ONLY to that sub-category
  const totalSpend = useMemo(() => {
    return filteredReceipts.reduce((acc, r) => {
      if (isSubCategoryActive) {
        const subItems = r.items.filter((item) => {
          const sub = (item.subCategory || "").toLowerCase()
          const cat = (item.category || "").toLowerCase()
          return sub.includes(subQ) || cat.includes(subQ)
        })
        return acc + subItems.reduce((subAcc, item) => subAcc + item.price * item.quantity, 0)
      }
      return acc + r.totalAmount
    }, 0)
  }, [filteredReceipts, isSubCategoryActive, subQ])

  const totalItemsCount = useMemo(() => {
    return filteredReceipts.reduce((acc, r) => {
      if (isSubCategoryActive) {
        const subItems = r.items.filter((item) => {
          const sub = (item.subCategory || "").toLowerCase()
          const cat = (item.category || "").toLowerCase()
          return sub.includes(subQ) || cat.includes(subQ)
        })
        return acc + subItems.length
      }
      return acc + r.items.length
    }, 0)
  }, [filteredReceipts, isSubCategoryActive, subQ])

  // Calculate Dominant Category and Category Chart Data
  const { categoryChartData, dominantCategoryName, maxSpend } = useMemo(() => {
    const map: Record<string, number> = {}
    const dbParentNames = hierarchy.map((h) => h.name)

    filteredReceipts.forEach((r) => {
      r.items.forEach((item) => {
        const rawCat = item.category || "Lain-lain"
        const rawRoot = rawCat.split("/")[0].trim().toLowerCase()

        let matchedCategory = dbParentNames.find((p) => {
          const pRoot = p.split("/")[0].trim().toLowerCase()
          return pRoot === rawRoot || p.toLowerCase() === rawCat.toLowerCase()
        })

        if (!matchedCategory) {
          matchedCategory = rawCat.split("/")[0].trim()
        }

        map[matchedCategory] = (map[matchedCategory] || 0) + item.price * item.quantity
      })
    })

    let domName = "-"
    let max = 0
    Object.entries(map).forEach(([cat, val]) => {
      if (val > max) {
        max = val
        domName = cat
      }
    })

    const chartData = Object.keys(map).map((catName, idx) => ({
      name: catName,
      value: map[catName],
      percentage: totalSpend > 0 ? Math.round((map[catName] / totalSpend) * 100) : 0,
      color: GRAPH_COLORS[idx % GRAPH_COLORS.length],
    }))

    return { categoryChartData: chartData, dominantCategoryName: domName, maxSpend: max }
  }, [filteredReceipts, totalSpend, hierarchy])

  // Calculate Daily Trend Data (Date vs Spending Total)
  const dailyTrendData = useMemo(() => {
    const dateMap: Record<string, number> = {}
    const sorted = [...filteredReceipts].sort((a, b) => a.date.localeCompare(b.date))
    sorted.forEach((r) => {
      const d = r.date
      const val = isSubCategoryActive
        ? r.items
            .filter((item) => {
              const sub = (item.subCategory || "").toLowerCase()
              const cat = (item.category || "").toLowerCase()
              return sub.includes(subQ) || cat.includes(subQ)
            })
            .reduce((acc, item) => acc + item.price * item.quantity, 0)
        : r.totalAmount

      dateMap[d] = (dateMap[d] || 0) + val
    })

    return Object.keys(dateMap).map((d) => ({
      date: d,
      displayDate: d.split("-").slice(1).join("/"),
      total: dateMap[d],
    }))
  }, [filteredReceipts, isSubCategoryActive, subQ])

  // Calculate Sub-Category Breakdown Data
  const subCategoryChartData = useMemo(() => {
    const map: Record<string, { totalSpend: number; count: number; category: string; subCategory: string }> = {}

    filteredReceipts.forEach((r) => {
      r.items.forEach((item) => {
        const parent = item.category || "Lain-lain"
        const sub = item.subCategory || "Umum"
        const key = `${parent} / ${sub}`

        if (!map[key]) {
          map[key] = { totalSpend: 0, count: 0, category: parent, subCategory: sub }
        }
        map[key].totalSpend += item.price * item.quantity
        map[key].count += item.quantity
      })
    })

    return Object.entries(map)
      .map(([key, stat], idx) => ({
        name: key,
        category: stat.category,
        subCategory: stat.subCategory,
        value: stat.totalSpend,
        count: stat.count,
        percentage: totalSpend > 0 ? Math.round((stat.totalSpend / totalSpend) * 100) : 0,
        color: GRAPH_COLORS[idx % GRAPH_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredReceipts, totalSpend])

  // Calculate Top 5 Most Expensive Purchased Products
  const topProductsData = useMemo(() => {
    const prodMap: Record<string, { totalSpend: number; qty: number; category: string; subCategory: string }> = {}

    filteredReceipts.forEach((r) => {
      r.items.forEach((item) => {
        const key = item.name.trim()
        if (!prodMap[key]) {
          prodMap[key] = {
            totalSpend: 0,
            qty: 0,
            category: item.category || "Lain-lain",
            subCategory: item.subCategory || "Umum",
          }
        }
        prodMap[key].totalSpend += item.price * item.quantity
        prodMap[key].qty += item.quantity
      })
    })

    return Object.entries(prodMap)
      .map(([name, stat]) => ({
        name,
        totalSpend: stat.totalSpend,
        qty: stat.qty,
        category: stat.category,
        subCategory: stat.subCategory,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5)
  }, [filteredReceipts])

  // Drill-down breakdown openers
  const handleOpenProductBreakdown = (productName: string) => {
    const matchedEntries: ItemBreakdownEntry[] = []
    let totalSpend = 0
    let totalQty = 0
    let catName = ""
    let subCatName = ""

    filteredReceipts.forEach((r) => {
      r.items.forEach((item) => {
        if (item.name.trim().toLowerCase() === productName.trim().toLowerCase()) {
          const itemTotal = item.price * item.quantity
          totalSpend += itemTotal
          totalQty += item.quantity
          catName = item.category || "Lain-lain"
          subCatName = item.subCategory || "Umum"

          matchedEntries.push({
            receiptId: r.id,
            receiptDate: r.date,
            merchantName: r.merchantName,
            itemName: item.name,
            category: catName,
            subCategory: subCatName,
            price: item.price,
            quantity: item.quantity,
            total: itemTotal,
          })
        }
      })
    })

    matchedEntries.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate))

    setItemBreakdownModal({
      title: productName,
      subTitle: `Kategori Utama: ${catName} • Sub-Kategori: ${subCatName}`,
      totalSpend,
      totalQty,
      items: matchedEntries,
    })
  }

  const handleOpenSubCategoryBreakdown = (subCategoryKey: string) => {
    const matchedEntries: ItemBreakdownEntry[] = []
    let totalSpend = 0
    let totalQty = 0

    filteredReceipts.forEach((r) => {
      r.items.forEach((item) => {
        const parent = item.category || "Lain-lain"
        const sub = item.subCategory || "Umum"
        const fullKey = `${parent} / ${sub}`

        if (
          fullKey.toLowerCase() === subCategoryKey.toLowerCase() ||
          sub.toLowerCase() === subCategoryKey.toLowerCase() ||
          parent.toLowerCase() === subCategoryKey.toLowerCase()
        ) {
          const itemTotal = item.price * item.quantity
          totalSpend += itemTotal
          totalQty += item.quantity

          matchedEntries.push({
            receiptId: r.id,
            receiptDate: r.date,
            merchantName: r.merchantName,
            itemName: item.name,
            category: parent,
            subCategory: sub,
            price: item.price,
            quantity: item.quantity,
            total: itemTotal,
          })
        }
      })
    })

    matchedEntries.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate))

    setItemBreakdownModal({
      title: `Perincian Rincian Item: ${subCategoryKey}`,
      subTitle: `Total ${matchedEntries.length} transaksi barang/nota penyumbang nominal`,
      totalSpend,
      totalQty,
      items: matchedEntries,
    })
  }

  // Calculate Rekening Koran Statement Rows (Matching Bank Mandiri Reference Layout)
  const statementTableRows = useMemo(() => {
    const sorted = [...filteredReceipts].sort((a, b) => a.date.localeCompare(b.date))
    let cumulative = 0

    return sorted.map((r, idx) => {
      const amount = isSubCategoryActive
        ? r.items
            .filter((item) => {
              const sub = (item.subCategory || "").toLowerCase()
              const cat = (item.category || "").toLowerCase()
              return sub.includes(subQ) || cat.includes(subQ)
            })
            .reduce((acc, item) => acc + item.price * item.quantity, 0)
        : r.totalAmount

      cumulative += amount
      const categoriesStr = Array.from(new Set(r.items.map((i) => i.category || "Lain-lain"))).join(", ")

      const refNo = `NTA-${r.id.substring(0, 8).toUpperCase()}`
      const dateParts = r.date.split("-")
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : r.date

      return {
        id: r.id,
        no: idx + 1,
        date: formattedDate,
        merchantName: r.merchantName,
        categories: categoriesStr,
        rawItems: r.items,
        refNo,
        debit: amount,
        balance: cumulative,
      }
    })
  }, [filteredReceipts, isSubCategoryActive, subQ])

  // Date Range Statement From / To
  const statementDateRange = useMemo(() => {
    if (statementTableRows.length === 0) return { from: "-", to: "-" }
    const firstDate = statementTableRows[0].date
    const lastDate = statementTableRows[statementTableRows.length - 1].date
    return { from: firstDate, to: lastDate }
  }, [statementTableRows])

  const averageSpendPerReceipt = filteredReceipts.length > 0 ? Math.round(totalSpend / filteredReceipts.length) : 0

  return (
    <div className="w-full space-y-5 pb-12 transition-all duration-300">
      {/* GLOBAL PRINT STYLES FOR MULTI-PAGE A4/A3/LETTER PDF STATEMENT */}
      <style jsx global>{`
        @media print {
          @page {
            size: ${printPaperSize === "auto" ? "auto" : `${printPaperSize} ${printOrientation}`};
            margin: 8mm 10mm 10mm 10mm;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide controls */
          .no-print {
            display: none !important;
          }

          /* Hide page elements visually without destroying DOM tree */
          body * {
            visibility: hidden !important;
          }

          /* Make ONLY statement document visible */
          #printable-rekening-koran,
          #printable-rekening-koran * {
            visibility: visible !important;
          }

          /* Position statement fixed at (0,0) of printed page */
          #printable-rekening-koran {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            z-index: 9999999 !important;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
          }

          thead {
            display: table-header-group !important;
          }

          tbody {
            display: table-row-group !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .avoid-break-total {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>


      {/* Hidden File Input for JSON Backup Restore */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRestoreJsonBackup}
        accept=".json"
        className="hidden"
      />

      {/* TOP HEADER BANNER (COMPACT & SINGLE LINE FIT) */}
      <div className="bg-white px-5 py-3.5 rounded-3xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <ReceiptIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Riwayat Nota
            </h2>
            <p className="text-[11px] text-slate-500 font-semibold">
              Rekapitulasi pengeluaran & laporan.
            </p>
          </div>
        </div>

        {/* Compact Actions Row */}
        <div className="flex items-center gap-1.5 flex-wrap md:flex-nowrap shrink-0">
          {/* Dual-Admin Approval Requests Button */}
          <button
            type="button"
            onClick={() => setShowApprovalModal(true)}
            className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-extrabold text-xs transition-all border shadow-2xs active:scale-95 shrink-0 ${
              pendingApprovals.length > 0
                ? "bg-amber-500 text-slate-950 border-amber-600 animate-pulse font-black"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            }`}
            title="Verifikasi Persetujuan Admin (Empat Mata)"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Persetujuan
            {pendingApprovals.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-black leading-none">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          {/* NOTIFICATION BUTTON IN MAIN ACTION BAR */}
          <button
            type="button"
            onClick={() => setShowNotificationsModal(true)}
            className={`relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-extrabold text-xs transition-all border shadow-2xs active:scale-95 shrink-0 cursor-pointer ${
              unreadNotificationCount > 0
                ? "bg-slate-900 text-white border-slate-800 font-black"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            }`}
            title="Buka Pusat Notifikasi Aktivitas Admin"
          >
            <Bell className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" /> Notifikasi
            {unreadNotificationCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 bg-amber-400 text-slate-950 rounded-full text-[10px] font-black leading-none animate-bounce">
                {unreadNotificationCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowCharts(!showCharts)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all border shadow-2xs active:scale-95 shrink-0 ${
              showCharts
                ? "bg-slate-900 text-white border-slate-800"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" /> Grafik
          </button>

          {/* COMBINED DATA & EXPORT BUTTON */}
          <button
            type="button"
            onClick={() => setShowDataOptionsModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs transition-all border border-slate-200 shadow-2xs active:scale-95 shrink-0 cursor-pointer"
            title="Opsi Backup, Restore, dan Ekspor Excel"
          >
            <Database className="w-3.5 h-3.5 text-emerald-600" /> Kelola Data
          </button>

          {/* PRINT OPTION DIRECTLY TRIGGERS BANK MANDIRI STYLE REKENING KORAN MODAL */}
          <button
            type="button"
            onClick={() => setShowStatementPrintModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition-all shadow-md shrink-0 active:scale-95"
            title="Cetak Laporan Rekening Koran Standard Bank"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" /> Print
          </button>
        </div>
      </div>

      {/* TOP 4 KPI CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Pengeluaran Netto */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-2 hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-black uppercase tracking-wider">
            <span>
              {isSubCategoryActive ? `SUB-KATEGORI (${selectedSubCategory.toUpperCase()})` : "TOTAL PENGELUARAN"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 font-mono font-black text-xs flex items-center justify-center">
              Rp
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-mono text-slate-900 transition-all duration-200">
            Rp {totalSpend.toLocaleString("id-ID")}
          </p>
          <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {isSubCategoryActive ? selectedSubCategory : `${filteredReceipts.length} nota`}
          </p>
        </div>

        {/* Card 2: Jumlah Nota */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-2 hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-black uppercase tracking-wider">
            <span>JUMLAH NOTA</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <ReceiptIcon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 transition-all duration-200">
            {filteredReceipts.length} Struk
          </p>
          <p className="text-[11px] font-bold text-slate-500">
            Rata-rata Rp {averageSpendPerReceipt.toLocaleString("id-ID")}
          </p>
        </div>

        {/* Card 3: Total Barang */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-2 hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-black uppercase tracking-wider">
            <span>{isSubCategoryActive ? `ITEM ${selectedSubCategory.toUpperCase()}` : "TOTAL BARANG"}</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 transition-all duration-200">
            {totalItemsCount} Item
          </p>
          <p className="text-[11px] font-bold text-purple-700">Produk terdata</p>
        </div>

        {/* Card 4: Kategori Dominan */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-2 hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-black uppercase tracking-wider">
            <span>PENGELUARAN TERBANYAK</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 truncate transition-all duration-200">
            {dominantCategoryName}
          </p>
          <p className="text-[11px] font-bold text-amber-700 font-mono">
            {maxSpend > 0 ? `Rp ${maxSpend.toLocaleString("id-ID")}` : "-"}
          </p>
        </div>
      </div>

      {/* HIGHLY USEFUL FINANCIAL ANALYTICS MODULE */}
      {showCharts && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs space-y-5 transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-0.5">
              <h3 className="font-black text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                Analitik Visual & Wawasan Keuangan
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                Grafik interaktif untuk menganalisis distribusi pengeluaran, tren harian, dan produk terboros.
              </p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold w-fit self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => setChartMode("category")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                  chartMode === "category" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <PieIcon className="w-3.5 h-3.5" /> Distribusi Kategori
              </button>
              <button
                type="button"
                onClick={() => setChartMode("daily")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                  chartMode === "daily" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <LineIcon className="w-3.5 h-3.5 text-blue-400" /> Tren Harian
              </button>
              <button
                type="button"
                onClick={() => setChartMode("topSubCategories")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                  chartMode === "topSubCategories" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Top 5 Sub-Kategori
              </button>
            </div>
          </div>

          {chartMode === "category" && categoryChartData.length > 0 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-7 space-y-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                    Pengeluaran Bersih Per Kategori Utama (Rp)
                  </span>
                  <div className="h-64 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fontWeight: 700, fill: "#334155" }}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickFormatter={(v) => `Rp ${(v / 1000).toLocaleString("id-ID")}k`}
                        />
                        <Tooltip
                          formatter={(value: any) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Total Pengeluaran"]}
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            borderRadius: "14px",
                            color: "#fff",
                            fontSize: "12px",
                            fontWeight: "bold",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                          }}
                        />
                        <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block text-center">
                    Persentase Proporsi (%)
                  </span>
                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => [`Rp ${Number(val).toLocaleString("id-ID")}`, "Total"]}
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            borderColor: "#334155",
                            borderRadius: "14px",
                            color: "#fff",
                            fontSize: "12px",
                            fontWeight: "bold",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-500" /> Ringkasan Persentase Kategori (Klik untuk rincian item):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {categoryChartData.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleOpenSubCategoryBreakdown(item.name)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200/80 hover:border-emerald-300 text-[11px] shadow-2xs cursor-pointer transition-all active:scale-95 group"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-extrabold text-slate-800 group-hover:text-emerald-800">{item.name}:</span>
                      <span className="font-mono text-slate-700 font-bold">
                        Rp {item.value.toLocaleString("id-ID")} ({item.percentage}%)
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-emerald-600" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {chartMode === "daily" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  Grafik Fluktuasi Pengeluaran Harian (Tanggal vs Nominal Rp)
                </span>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  {dailyTrendData.length} Hari Transaksi
                </span>
              </div>

              {dailyTrendData.length > 0 ? (
                <div className="h-64 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrendData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="displayDate" tick={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        tickFormatter={(v) => `Rp ${(v / 1000).toLocaleString("id-ID")}k`}
                      />
                      <Tooltip
                        formatter={(val: any) => [`Rp ${Number(val).toLocaleString("id-ID")}`, "Pengeluaran Harian"]}
                        labelFormatter={(lbl: any, payload: any) => payload?.[0]?.payload?.date || lbl}
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderColor: "#334155",
                          borderRadius: "14px",
                          color: "#fff",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      />
                      <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-8">Belum ada data tren harian di kriteria ini.</p>
              )}
            </div>
          )}

          {chartMode === "topSubCategories" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  TOP 5 SUB-KATEGORI DENGAN PENGELUARAN NOMINAL TERTINGGI (KLIK UNTUK RINCIAN ITEM)
                </span>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  Sub-Kategori Terboros
                </span>
              </div>

              {subCategoryChartData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
                  {subCategoryChartData.slice(0, 5).map((prod, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleOpenSubCategoryBreakdown(prod.name)}
                      className="bg-slate-50 hover:bg-emerald-50/60 p-3.5 rounded-2xl border border-slate-200/90 hover:border-emerald-500/80 space-y-1.5 cursor-pointer transition-all shadow-2xs hover:shadow-md active:scale-95 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                          Rank #{idx + 1}
                        </span>
                        <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-xs truncate pt-1 group-hover:text-emerald-800 transition-colors">
                        {prod.subCategory}
                      </h4>
                      <p className="text-sm font-black font-mono text-emerald-700">
                        Rp {prod.value.toLocaleString("id-ID")}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">
                        {prod.count} item • [{prod.category} / {prod.subCategory}]
                      </p>
                      <div className="pt-1 text-[10px] font-bold text-emerald-600 flex items-center gap-1 opacity-80 group-hover:opacity-100">
                        <span>Rincian item penopang</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-8">Belum ada data sub-kategori terboros di kriteria ini.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* SEARCH & FILTER BAR DIRECTLY ABOVE RECEIPTS HISTORY */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari toko, barang, atau metode bayar..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all bg-slate-50/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* DATE RANGE FILTER DROPDOWN */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Calendar className="w-4 h-4 text-emerald-600" /> Periode:
            </span>

            <div className="relative inline-block">
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value as any)}
                className="appearance-none pl-3.5 pr-8 py-2 rounded-xl border border-slate-300 text-xs font-extrabold text-slate-800 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-2xs cursor-pointer hover:border-slate-400 transition-colors"
              >
                <option value="all">Semua Waktu</option>
                <option value="today">Hari Ini</option>
                <option value="7days">7 Hari Terakhir</option>
                <option value="month">Bulan Ini</option>
                <option value="custom">Kustom Tanggal...</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {dateRangeFilter === "custom" && (
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 w-fit">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white"
            />
            <span className="text-xs text-slate-400 font-bold">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white"
            />
          </div>
        )}

        {/* Parent Category Filter Tabs & KELOLA KATEGORI BUTTON AT FAR RIGHT */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-emerald-600" /> Kategori:
            </span>
            {parentTabs.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectParentCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition-all duration-150 whitespace-nowrap active:scale-95 ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Small Compact Icon Button: Filter Status */}
            <button
              type="button"
              onClick={() => setShowStatusFilterPanel((prev) => !prev)}
              className={`relative p-2 rounded-xl transition-all border shadow-2xs active:scale-95 flex items-center justify-center shrink-0 ${
                showStatusFilterPanel || selectedStatusFilter !== "Semua Status" || selectedPersonFilter !== "Semua Penanggung Jawab"
                  ? "bg-slate-900 text-emerald-400 border-slate-800"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
              }`}
              title="Filter Status Pembayaran & Talangan"
            >
              <Filter className="w-4 h-4" />
              {(selectedStatusFilter !== "Semua Status" || selectedPersonFilter !== "Semua Penanggung Jawab") && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
              )}
            </button>

            {/* Small Compact Icon Button: Kelola Kategori */}
            <button
              type="button"
              onClick={() => setShowManageCategoryModal(true)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all shrink-0 border border-slate-200 hover:border-slate-300 active:scale-95 flex items-center justify-center"
              title="Kelola Kategori & Sub-Kategori"
            >
              <Settings className="w-4 h-4 text-slate-700" />
            </button>
          </div>
        </div>

        {/* Dynamic Sub-Category Filter Pills */}
        {selectedCategory !== "Semua" && subCategoryOptions.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-3 border-t border-slate-200/70 bg-emerald-50/40 p-3 rounded-2xl border border-emerald-100/60 transition-all duration-200">
            <span className="text-[11px] font-black text-emerald-800 flex items-center gap-1 shrink-0 uppercase tracking-wider mr-1">
              <ListFilter className="w-3.5 h-3.5 text-emerald-600" /> SUB-KATEGORI ({selectedCategory.toUpperCase()}):
            </span>

            {subCategoryOptions.map((subName) => (
              <button
                key={subName}
                type="button"
                onClick={() => setSelectedSubCategory(subName)}
                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all duration-150 whitespace-nowrap active:scale-95 ${
                  selectedSubCategory === subName
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-white text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                }`}
              >
                {subName}
              </button>
            ))}
          </div>
        )}

        {/* Dedicated Payment Status & Sub-Status Filter Panel (Appears when Filter Status button is clicked or filter active) */}
        {(showStatusFilterPanel || selectedStatusFilter !== "Semua Status" || selectedPersonFilter !== "Semua Penanggung Jawab") && (
          <div className="space-y-2.5 pt-3 border-t border-slate-200/70 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> STATUS PEMBAYARAN:
              </span>

              {(selectedStatusFilter !== "Semua Status" || selectedPersonFilter !== "Semua Penanggung Jawab") && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatusFilter("Semua Status")
                    setSelectedPersonFilter("Semua Penanggung Jawab")
                  }}
                  className="text-[11px] font-bold text-red-600 hover:text-red-700 underline"
                >
                  Reset Filter Status
                </button>
              )}
            </div>            <div className="flex items-center gap-1.5 overflow-x-auto">
              {["Semua Status", "Lunas", "Sudah Dilunasi", "Belum Direimburse / Tempo"].map((statusOpt) => (
                <button
                  key={statusOpt}
                  type="button"
                  onClick={() => {
                    setSelectedStatusFilter(statusOpt)
                    if (statusOpt === "Sudah Dilunasi" || statusOpt === "Lunas") {
                      setSelectedPersonFilter("Semua Penanggung Jawab")
                    }
                  }}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all duration-150 whitespace-nowrap active:scale-95 ${
                    selectedStatusFilter === statusOpt
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                  }`}
                >
                  {statusOpt}
                </button>
              ))}
            </div>

            {/* Sub-Status: Penanggung Jawab / Talangan (Only shown if NOT filtered by Lunas/Sudah Dilunasi) */}
            {selectedStatusFilter !== "Sudah Dilunasi" && selectedStatusFilter !== "Lunas" && availablePersonNames.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 bg-amber-50/60 p-2.5 rounded-2xl border border-amber-200/70 transition-all animate-in fade-in duration-150">
                <span className="text-[11px] font-black text-amber-900 flex items-center gap-1 shrink-0 uppercase tracking-wider mr-1">
                  <User className="w-3.5 h-3.5 text-amber-600" /> SUB-STATUS (TALANGAN):
                </span>

                {["Semua Penanggung Jawab", ...availablePersonNames].map((personName) => (
                  <button
                    key={personName}
                    type="button"
                    onClick={() => setSelectedPersonFilter(personName)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-150 whitespace-nowrap active:scale-95 ${
                      selectedPersonFilter === personName
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-white text-amber-900 hover:bg-amber-100 border border-amber-200"
                    }`}
                  >
                    {personName === "Semua Penanggung Jawab" ? "Semua Orang" : personName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* HORIZONTAL LIST VIEW: DAFTAR RIWAYAT STRUK BELANJA */}
      <div className="space-y-3">
        {/* Header Bar + Bulk Action Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
              <ReceiptIcon className="w-5 h-5 text-emerald-600" />
              Daftar Nota ({filteredReceipts.length})
            </h3>
            {selectedReceiptIds.length > 0 && (
              <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {selectedReceiptIds.length} Dipilih
              </span>
            )}

            {/* Quick Select All Button (Visible on all devices for fast 1-tap select) */}
            {!isInitialLoading && filteredReceipts.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  isAllSelected
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 active:bg-slate-100"
                }`}
                title="Pilih atau batalkan pilih semua nota pada halaman ini"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{isAllSelected ? "Batal Pilih Semua" : "Pilih Semua (Hal. Ini)"}</span>
              </button>
            )}

            {pendingApprovals.length > 0 && (
              <button
                type="button"
                onClick={() => setShowApprovalModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-xs shadow-xs animate-pulse transition-all cursor-pointer"
                title="Buka Verifikasi Persetujuan Dual-Control"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{pendingApprovals.length} Verifikasi Pending</span>
              </button>
            )}
          </div>

          {/* Bulk Action Controls */}
          {selectedReceiptIds.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in duration-150 flex-wrap">
              <button
                type="button"
                onClick={() => triggerSettleFlow()}
                disabled={isBulkSettling || isBulkDeleting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Tandai Lunas untuk semua nota yang dicentang"
              >
                {isBulkSettling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />}
                Lunasi Terpilih ({selectedReceiptIds.length})
              </button>

              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting || isBulkSettling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isBulkDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Hapus Terpilih ({selectedReceiptIds.length})
              </button>

              <button
                type="button"
                onClick={() => setSelectedReceiptIds([])}
                className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Batal Pilih
              </button>
            </div>
          )}
        </div>

        {/* MOBILE QUICK SELECTION CONTROL STRIP (VISIBLE ON HP & TABLET < lg) */}
        {!isInitialLoading && filteredReceipts.length > 0 && (
          <div className="flex lg:hidden items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-100/90 rounded-xl border border-slate-200/90 text-xs text-slate-700 shadow-2xs">
            <label className="flex items-center gap-2.5 cursor-pointer select-none font-bold">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer shrink-0"
              />
              <span className="text-slate-800 text-xs font-extrabold">
                {isAllSelected ? "Batal Pilih Semua" : `Pilih Semua (${paginatedReceipts.length} Struk Halaman Ini)`}
              </span>
            </label>

            {filteredReceipts.length > paginatedReceipts.length && (
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                {isAllFilteredSelected ? "Batal Semua Filter" : `Pilih Semua (${filteredReceipts.length} Struk)`}
              </button>
            )}
          </div>
        )}

        {/* STATIC TABLE HEADER BAR (FOR HORIZONTAL ROW COLUMN LANDMARKS) */}
        {!isInitialLoading && filteredReceipts.length > 0 && (
          <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-100/80 rounded-xl border border-slate-200/90 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                title="Pilih Semua Baris"
              />
              <span>TANGGAL</span>
            </div>
            <div className="col-span-2">TOKO & KATEGORI</div>
            <div className="col-span-3">RINGKASAN PRODUK</div>
            <div className="col-span-1 text-center">METODE</div>
            <div className="col-span-2 text-right">TOTAL NETTO</div>
            <div className="col-span-2 text-right pr-2">AKSI</div>
          </div>
        )}

        {/* LOADING STATE */}
        {isInitialLoading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-500">Memuat data...</p>
          </div>
        ) : filteredReceipts.length === 0 ? (
          /* EMPTY STATE */
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4 transition-all duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <ReceiptIcon className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-900 text-base">Belum Ada Nota Di Kriteria Ini</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Coba sesuaikan filter kategori, kata kunci pencarian, atau periode waktu Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={onScanNewReceipt}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all shadow-md shadow-emerald-600/20"
            >
              <Sparkles className="w-4 h-4" /> Scan Struk Baru Sekarang
            </button>
          </div>
        ) : (
          /* HORIZONTAL ROW-BASED CARDS CONTAINER */
          <div className="space-y-2">
            {paginatedReceipts.map((receipt) => {
              const isSelected = selectedReceiptIds.includes(receipt.id)
              const pendingReq = pendingApprovalMap[receipt.id]

              const cardPreviewItems = isSubCategoryActive
                ? receipt.items.filter((item) => {
                    const sub = (item.subCategory || "").toLowerCase()
                    const cat = (item.category || "").toLowerCase()
                    return sub.includes(subQ) || cat.includes(subQ)
                  })
                : receipt.items

              const cardDisplayNetto = isSubCategoryActive
                ? cardPreviewItems.reduce((acc, item) => acc + item.price * item.quantity, 0)
                : receipt.totalAmount

              const productSummaryText = cardPreviewItems
                .slice(0, 2)
                .map((i) => `${i.name} (${i.quantity}x)`)
                .join(", ") + (cardPreviewItems.length > 2 ? ` (+${cardPreviewItems.length - 2} items)` : "")

              const categoryPill = Array.from(new Set(receipt.items.map((i) => i.category || "Lain-lain")))[0] || "Umum"

              const dateParts = receipt.date.split("-")
              const formattedDateStr =
                dateParts.length === 3
                  ? `${dateParts[2]} ${new Date(receipt.date).toLocaleDateString("id-ID", { month: "short" })} ${dateParts[0]}`
                  : receipt.date

              return (
                <div
                  key={receipt.id}
                  onClick={() => setSelectedReceipt(receipt)}
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                  className={`rounded-xl border transition-all duration-200 px-4 py-3.5 cursor-pointer ${
                    pendingReq
                      ? "border-amber-400 bg-amber-50/20 ring-1 ring-amber-400/40"
                      : isSelected
                      ? "border-emerald-500 bg-emerald-50/30"
                      : "bg-white border-slate-200/90 hover:border-emerald-500 hover:bg-slate-50/70"
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-xs">
                    {/* KOLOM 1: Checkbox & Tanggal */}
                    <div className="lg:col-span-2 flex items-center gap-2.5 min-w-0">
                      <label
                        className="flex items-center gap-2 p-1 -m-1 rounded-lg hover:bg-slate-100/80 active:bg-slate-200/80 cursor-pointer select-none shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        title="Centang untuk memilih nota ini"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(receipt.id)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer shrink-0"
                        />
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80 text-[11px] whitespace-nowrap">
                          {formattedDateStr}
                        </span>
                      </label>
                    </div>

                    {/* KOLOM 2: Identitas Toko & Category Pill & Pending Badge */}
                    <div className="lg:col-span-2 space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <h4 className="font-black text-slate-900 text-sm truncate">{receipt.merchantName}</h4>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200/60 truncate max-w-full">
                          {categoryPill}
                        </span>
                        {isSubCategoryActive && (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 font-bold text-[10px] border border-purple-200/60 truncate max-w-full">
                            {selectedSubCategory}
                          </span>
                        )}
                        {pendingReq && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedApprovalId(pendingReq.id)
                              setShowApprovalModal(true)
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[9.5px] border border-amber-600 shadow-2xs transition-colors cursor-pointer shrink-0"
                          >
                            <ShieldCheck className="w-3 h-3 text-amber-100 animate-pulse" />
                            {pendingReq.actionType === "DELETE" && "Hapus Pending"}
                            {pendingReq.actionType === "BULK_DELETE" && "Hapus Massal Pending"}
                            {pendingReq.actionType === "EDIT" && "Edit Pending"}
                            {pendingReq.actionType === "SETTLE" && "Pelunasan Pending"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* KOLOM 3: Ringkasan Produk (Truncated Single Line) */}
                    <div className="lg:col-span-3 min-w-0">
                      <p
                        className="text-slate-600 font-medium truncate text-xs"
                        title={productSummaryText}
                      >
                        {productSummaryText}
                      </p>
                    </div>

                    {/* KOLOM 4: Metode Bayar */}
                    <div className="lg:col-span-1 text-left lg:text-center shrink-0">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px] whitespace-nowrap border border-slate-200">
                        {receipt.paymentMethod || "Cash"}
                      </span>
                    </div>

                    {/* KOLOM 5: Total Netto (Nominal Paling Menonjol TANPA ,00) */}
                    <div className="lg:col-span-2 text-left lg:text-right pr-1 shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block lg:hidden">Total Netto:</span>
                      <span className="font-black font-mono text-emerald-600 text-sm sm:text-base tracking-tight whitespace-nowrap">
                        Rp {Math.round(cardDisplayNetto).toLocaleString("id-ID")}
                      </span>
                    </div>

                    {/* KOLOM 6: Action Buttons Group (Status, Lunasi, Edit & Hapus or Pending Review Badge) */}
                    <div className="lg:col-span-2 flex items-center justify-end gap-1.5 border-t lg:border-t-0 border-slate-100 pt-2 lg:pt-0 mt-1 lg:mt-0 shrink-0">
                      {pendingReq ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedApprovalId(pendingReq.id)
                            setShowApprovalModal(true)
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-extrabold text-[10.5px] transition-all shadow-xs animate-pulse cursor-pointer shrink-0"
                          title={`Nota ini sedang dalam peninjauan Dual-Control (${pendingReq.actionType}) oleh admin ${pendingReq.requestedBy}. Klik untuk verifikasi.`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-100" />
                          <span>Dalam Peninjauan</span>
                        </button>
                      ) : (
                        <>
                          {!isReceiptSettled(receipt.paymentStatus) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                triggerSettleFlow(receipt)
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-emerald-700 text-white font-black text-[11px] transition-all shadow-2xs active:scale-95 shrink-0"
                              title="Tandai Nota Sudah Direimburse / Lunasi"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Lunasi
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] border shrink-0 ${
                                receipt.paymentStatus === "Sudah Dilunasi"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-green-50 text-green-800 border-green-200"
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {receipt.paymentStatus === "Sudah Dilunasi" ? "Sudah Dilunasi" : "Lunas"}
                            </span>
                          )}

                          {onEditReceipt && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onEditReceipt(receipt)
                              }}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors shrink-0"
                              title="Edit Data Nota"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              triggerDeleteConfirm(receipt)
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors shrink-0"
                            title="Hapus Nota"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* PAGINATION COMPONENT (PAGE 1 OF X, PREV, NEXT, ITEMS PER PAGE) */}
        {!isInitialLoading && filteredReceipts.length > 0 && (
          <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600 font-semibold">
              <span>Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredReceipts.length)} dari {filteredReceipts.length} Nota</span>
              
              <div className="relative inline-block ml-2">
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="appearance-none pl-2.5 pr-6 py-1 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white cursor-pointer"
                >
                  <option value={10}>10 / hal</option>
                  <option value={20}>20 / hal</option>
                  <option value={50}>50 / hal</option>
                  <option value={100}>100 / hal</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-bold mr-2">
                Halaman {currentPage} dari {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AUTHENTIC BANK STATEMENT (MANDIRI REFERENCE STYLE) A4 PRINT MODAL */}
      {showStatementPrintModal && (
        <div id="statement-print-modal-overlay" className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-3xl border border-slate-200 shadow-2xl w-full ${printOrientation === "landscape" || printPaperSize === "A3" ? "max-w-[95vw]" : "max-w-5xl"} max-h-[96vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
            {/* Modal Control Bar */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white no-print">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    Pratinjau Cetak Laporan Rekapitulasi Pembukuan PDF
                  </h3>
                  <p className="text-xs text-slate-300 font-medium">
                    Tampilan presisi format dokumen resmi (A4/A3/Letter/Legal - Portrait & Landscape).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Selector Ukuran Kertas */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-bold">Kertas:</span>
                  <select
                    value={printPaperSize}
                    onChange={(e) => setPrintPaperSize(e.target.value as any)}
                    className="bg-transparent text-white font-bold cursor-pointer focus:outline-none text-xs"
                  >
                    <option value="A4" className="bg-slate-900 text-white">A4 (210 x 297 mm)</option>
                    <option value="A3" className="bg-slate-900 text-white">A3 (297 x 420 mm)</option>
                    <option value="Letter" className="bg-slate-900 text-white">Letter (216 x 279 mm)</option>
                    <option value="Legal" className="bg-slate-900 text-white">Legal (216 x 356 mm)</option>
                    <option value="auto" className="bg-slate-900 text-white">Bebas / Auto Browser</option>
                  </select>
                </div>

                {/* Selector Orientasi Kertas */}
                <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-bold">Orientasi:</span>
                  <select
                    value={printOrientation}
                    onChange={(e) => setPrintOrientation(e.target.value as any)}
                    className="bg-transparent text-white font-bold cursor-pointer focus:outline-none text-xs"
                  >
                    <option value="portrait" className="bg-slate-900 text-white">Portrait (Tegak)</option>
                    <option value="landscape" className="bg-slate-900 text-white">Landscape (Mendatar)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setExportConfirmFormat("statement")
                    handleProceedExport()
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>

                <button
                  type="button"
                  onClick={handleExportPdfDirect}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-all shadow-md shadow-emerald-600/30"
                  title="Unduh file PDF resmi langsung ke HP/Komputer"
                >
                  <Download className="w-4 h-4 text-emerald-200" /> Unduh PDF
                </button>

                <button
                  type="button"
                  onClick={handleTriggerA4Print}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all"
                  title="Buka dialog cetak printer browser"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-300" /> Cetak
                </button>
                <button
                  type="button"
                  onClick={() => setShowStatementPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* COMPACT PRINTABLE PDF DOCUMENT BODY (FIT TO 1 PAGE A4 PORTRAIT) */}
            <div id="printable-rekening-koran" className="p-6 sm:p-8 bg-white text-slate-900 space-y-3 font-sans text-xs overflow-y-auto">
              {/* Header 2 Kolom (Compact Vertical Margin) */}
              <div className="flex items-start justify-between border-b border-slate-200 pb-2.5 mb-2">
                <div className="space-y-1">
                  <div>
                    <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                      Laporan Rekapitulasi Pembukuan Nota
                    </h1>
                    <p className="text-[10.5px] font-bold text-slate-500 italic leading-none">
                      (Receipt Accounting Summary Report)
                    </p>
                  </div>

                  {/* Metadata Info List (Compact 11px) */}
                  <div className="space-y-0.5 text-[11px] font-semibold text-slate-800 pt-0.5 leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="w-28 text-slate-500 font-normal">Periode Data</span>
                      <span>:</span>
                      <span className="font-bold">{statementDateRange.from} s/d {statementDateRange.to}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="w-28 text-slate-500 font-normal">No. Registrasi</span>
                      <span>:</span>
                      <span className="font-bold font-mono">140008801996 - NOTA PHOTO PEMBUKUAN</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="w-28 text-slate-500 font-normal">Kategori Utama</span>
                      <span>:</span>
                      <span className="font-bold">{selectedCategory}</span>
                    </div>

                    {isSubCategoryActive && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-28 text-slate-500 font-normal">Sub-Kategori</span>
                        <span>:</span>
                        <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">{selectedSubCategory}</span>
                      </div>
                    )}

                    {selectedStatusFilter !== "Semua Status" && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-28 text-slate-500 font-normal">Filter Status</span>
                        <span>:</span>
                        <span className="font-bold text-blue-800">{selectedStatusFilter}</span>
                      </div>
                    )}

                    {selectedPersonFilter !== "Semua Penanggung Jawab" && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-28 text-slate-500 font-normal">Penanggung Jawab</span>
                        <span>:</span>
                        <span className="font-bold text-purple-800">{selectedPersonFilter}</span>
                      </div>
                    )}

                    {searchQuery.trim() && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-28 text-slate-500 font-normal">Kata Kunci Cari</span>
                        <span>:</span>
                        <span className="font-bold text-amber-800">&quot;{searchQuery}&quot;</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <span className="w-28 text-slate-500 font-normal">Total Ringkasan</span>
                      <span>:</span>
                      <span className="font-bold font-mono text-emerald-700">{statementTableRows.length} Struk — Rp {totalSpend.toLocaleString("id-ID")}</span>
                    </div>
                  </div>
                </div>

                {/* Right Logo Brand */}
                <div className="flex items-center gap-1.5 text-blue-900 font-black text-lg tracking-tighter shrink-0 pt-0.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-800 text-white flex items-center justify-center font-bold text-xs">
                    NP
                  </div>
                  <span>nota-photo</span>
                </div>
              </div>

              {/* REFACTORED HIGH-READABILITY COMPACT TABLE (EXACT 100% PROPORTIONS) */}
              <div className="pt-0.5">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-[#f1f5f9] text-slate-900 font-bold border border-slate-300 text-[10.5px]">
                      <th style={{ width: "12%" }} className="px-1.5 py-1.5 text-center border-r border-slate-300">Tanggal</th>
                      <th style={{ width: "14%" }} className="px-1.5 py-1.5 text-left border-r border-slate-300">No. Ref</th>
                      <th style={{ width: "16%" }} className="px-2 py-1.5 text-left border-r border-slate-300">Toko</th>
                      <th style={{ width: "38%" }} className="px-2 py-1.5 text-left border-r border-slate-300">Rincian Barang & Kategori</th>
                      <th style={{ width: "10%" }} className="px-2 py-1.5 text-right border-r border-slate-300">Pengeluaran</th>
                      <th style={{ width: "10%" }} className="px-2 py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 border-x border-b border-slate-300 text-xs font-sans">
                    {statementTableRows.length > 0 ? (
                      statementTableRows.map((row, idx) => (
                        <tr key={row.id} className={idx % 2 === 1 ? "bg-[#f8fafc]" : "bg-white"}>
                          {/* Tanggal (12%, center) */}
                          <td style={{ verticalAlign: "top", padding: "4px 6px" }} className="text-center text-slate-800 border-r border-slate-200 font-mono text-[10.5px] whitespace-nowrap">
                            {row.date}
                          </td>

                          {/* No. Ref (14%, left, font-mono) */}
                          <td style={{ verticalAlign: "top", padding: "4px 6px" }} className="text-slate-800 border-r border-slate-200 font-mono text-[10.5px] whitespace-nowrap">
                            {row.refNo}
                          </td>

                          {/* Toko (16%, left, font-bold) */}
                          <td style={{ verticalAlign: "top", padding: "4px 6px" }} className="text-slate-900 border-r border-slate-200 font-bold text-[11px]">
                            {row.merchantName}
                          </td>

                          {/* Rincian Barang & Kategori (38%, left, Area Paling Luas, Compact List) */}
                          <td style={{ verticalAlign: "top", padding: "4px 6px" }} className="text-slate-900 border-r border-slate-200">
                            <span className="inline-block px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-bold text-[9px] border border-emerald-200 mb-0.5">
                              [{row.categories || "Umum"}]
                            </span>
                            <ul style={{ margin: "2px 0", paddingLeft: "12px" }} className="list-disc space-y-0 text-[9.5px] text-slate-700 font-medium leading-tight">
                              {row.rawItems.map((item, itemIdx) => (
                                <li key={itemIdx}>
                                  {item.name} <span className="font-bold text-slate-900">x{item.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          </td>

                          {/* Pengeluaran (10%, right, clean IDR) */}
                          <td style={{ verticalAlign: "top", padding: "4px 6px" }} className="text-right font-bold text-emerald-700 border-r border-slate-200 font-mono text-[10.5px] whitespace-nowrap">
                            Rp {Math.round(row.debit).toLocaleString("id-ID")}
                          </td>

                          {/* Saldo (10%, right, clean IDR) */}
                          <td style={{ verticalAlign: "top", padding: "4px 6px" }} className="text-right font-bold text-slate-900 font-mono text-[10.5px] whitespace-nowrap">
                            Rp {Math.round(row.balance).toLocaleString("id-ID")}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400 italic">
                          Tidak ada data transaksi di kriteria ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total Summary Footer Box */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-xs avoid-break-total">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Akumulasi Pengeluaran
                  </span>
                  <p className="text-xs text-slate-300">
                    (Accumulated Outflow Statement Total)
                  </p>
                </div>
                <span className="font-mono text-xl sm:text-2xl font-black text-emerald-400">
                  Rp {Math.round(totalSpend).toLocaleString("id-ID")}
                </span>
              </div>

              {/* Footer Statement Note */}
              <div className="text-center pt-3 pb-1 text-[10px] font-semibold text-slate-500 italic">
                *** Dokumen Laporan Rekapitulasi Pembukuan Resmi — Perkara Kopi ***
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between no-print">
              <span className="text-xs text-slate-500 font-semibold">
                Klik tombol "Cetak / Save PDF" untuk menghasilkan file PDF resmi.
              </span>
              <button
                type="button"
                onClick={() => setShowStatementPrintModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT CONFIRMATION MODAL */}
      {exportConfirmFormat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Konfirmasi Ekspor Laporan ({exportConfirmFormat.toUpperCase()})
              </h3>
              <button
                type="button"
                onClick={() => setExportConfirmFormat(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-950">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Siap Mendownload Laporan Rekapitulasi</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Laporan akan diurutkan secara **Kronologis (Tanggal Terlama ke Terbaru)** agar rapi saat dibuka di Microsoft Excel atau Google Sheets.
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200 font-medium">
              <p className="flex justify-between">
                <span>Filter Kategori Utama:</span>
                <span className="font-bold text-slate-900">{selectedCategory}</span>
              </p>
              <p className="flex justify-between">
                <span>Filter Sub-Kategori:</span>
                <span className="font-bold text-slate-900">{selectedSubCategory}</span>
              </p>
              <p className="flex justify-between">
                <span>Jumlah Nota Diekspor:</span>
                <span className="font-bold font-mono text-emerald-700">{filteredReceipts.length} Struk</span>
              </p>
              <p className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5 font-bold">
                <span>Total Netto Rekap:</span>
                <span className="font-mono text-emerald-700">Rp {totalSpend.toLocaleString("id-ID")}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setExportConfirmFormat(null)}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={handleProceedExport}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50"
              >
                {isExporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowDownToLine className="w-4 h-4" />
                )}
                Unduh {exportConfirmFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIERARCHICAL CATEGORY MANAGEMENT MODAL */}
      {showManageCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                Kelola Kategori & Sub-Kategori
              </h3>
              <button
                type="button"
                onClick={() => setShowManageCategoryModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CREATE CATEGORY / SUB-CATEGORY FORM */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 shrink-0">
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold w-fit">
                <button
                  type="button"
                  onClick={() => setNewCatType("parent")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    newCatType === "parent" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600"
                  }`}
                >
                  + Kategori Utama
                </button>
                <button
                  type="button"
                  onClick={() => setNewCatType("sub")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    newCatType === "sub" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600"
                  }`}
                >
                  + Sub-Kategori
                </button>
              </div>

              {newCatType === "sub" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Pilih Kategori Induk Utama</label>
                  <select
                    value={selectedParentId}
                    onChange={(e) => setSelectedParentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 bg-white"
                  >
                    {hierarchy.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCatNameInput}
                  onChange={(e) => setNewCatNameInput(e.target.value)}
                  placeholder={newCatType === "parent" ? "Nama Kategori Utama..." : "Nama Sub-Kategori Baru..."}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 text-xs font-semibold text-slate-900 bg-white"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-colors shadow-sm shrink-0"
                >
                  <Plus className="w-4 h-4" /> Tambah
                </button>
              </div>
            </div>

            {/* READ & UPDATE / DELETE CATEGORY LIST */}
            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                <span>Struktur Kategori ({hierarchy.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">Bisa Edit & Hapus</span>
              </div>

              <div className="space-y-3">
                {hierarchy.length > 0 ? (
                  hierarchy.map((parent) => (
                    <div key={parent.id} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                      {/* Parent Item Header */}
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                        {editingCatId === parent.id ? (
                          <div className="flex items-center gap-2 w-full">
                            <input
                              type="text"
                              value={editingCatName}
                              onChange={(e) => setEditingCatName(e.target.value)}
                              className="flex-1 px-2 py-1 rounded-lg border border-emerald-500 text-xs font-bold text-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateCategory(parent.id)}
                              className="p-1 bg-emerald-600 text-white rounded-lg"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCatId(null)}
                              className="p-1 bg-slate-200 text-slate-700 rounded-lg"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex items-center gap-1.5 text-slate-900">
                              <Tag className="w-3.5 h-3.5 text-emerald-600" />
                              {parent.name}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCatId(parent.id)
                                  setEditingCatName(parent.name)
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded"
                                title="Edit Kategori Utama"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(parent.id, parent.name)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded"
                                title="Hapus Kategori Utama"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Sub-Categories List */}
                      <div className="pl-4 space-y-1">
                        {parent.subCategories.map((sub) => (
                          <div key={sub.id} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-none">
                            {editingCatId === sub.id ? (
                              <div className="flex items-center gap-2 w-full">
                                <input
                                  type="text"
                                  value={editingCatName}
                                  onChange={(e) => setEditingCatName(e.target.value)}
                                  className="flex-1 px-2 py-1 rounded-lg border border-emerald-500 text-xs font-bold text-slate-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCategory(sub.id)}
                                  className="p-1 bg-emerald-600 text-white rounded-lg"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCatId(null)}
                                  className="p-1 bg-slate-200 text-slate-700 rounded-lg"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-slate-600 font-medium flex items-center gap-1 text-[11px]">
                                  <ChevronRight className="w-3 h-3 text-slate-400" />
                                  {sub.name}
                                </span>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCatId(sub.id)
                                      setEditingCatName(sub.name)
                                    }}
                                    className="p-1 text-slate-400 hover:text-blue-600 rounded"
                                    title="Edit Sub-Kategori"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCategory(sub.id, sub.name)}
                                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                                    title="Hapus Sub-Kategori"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic py-4 text-center">
                    Tidak ada kategori tersisa di database. Tambahkan kategori baru di atas!
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowManageCategoryModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {deletingReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Hapus Nota Permanen?</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
              <p className="font-bold text-slate-800">
                Toko/PT: <span className="text-slate-900">{deletingReceipt.merchantName}</span>
              </p>
              <p className="text-slate-600">
                Tanggal: {deletingReceipt.date} • Total:{" "}
                <span className="font-bold font-mono text-emerald-700">
                  Rp {deletingReceipt.totalAmount.toLocaleString("id-ID")}
                </span>
              </p>
              <p className="text-slate-500 text-[11px]">
                {deletingReceipt.items.length} rincian barang produk akan ikut dihapus.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingReceipt(null)}
                className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteReceipt}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold text-xs transition-colors shadow-md shadow-red-600/30"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Ya, Hapus Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL RECEIPT DETAIL MODAL (SHOWS ALL ITEMS OF THE RECEIPT) */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {selectedReceipt.date}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2.5 py-0.5 rounded-full">
                    {selectedReceipt.paymentMethod || "Cash"}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2 pt-1">
                  <Store className="w-5 h-5 text-slate-600" />
                  {selectedReceipt.merchantName}
                </h3>
              </div>

              <button
                onClick={() => setSelectedReceipt(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
              <div
                onClick={() => selectedReceipt.imageUrl && setLightboxImageUrl(selectedReceipt.imageUrl)}
                className={`md:col-span-5 bg-slate-900 rounded-2xl p-4 flex items-center justify-center min-h-[300px] relative group ${
                  selectedReceipt.imageUrl ? "cursor-zoom-in" : ""
                }`}
              >
                {selectedReceipt.imageUrl ? (
                  <>
                    {/* eslint-disable-next-html-element */}
                    <img
                      src={selectedReceipt.imageUrl}
                      alt="Original Receipt"
                      className="max-h-[420px] w-auto object-contain rounded-xl shadow-lg group-hover:opacity-85 transition-opacity"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-2xs rounded-2xl">
                      <span className="px-4 py-2 rounded-2xl bg-slate-900/90 text-white font-extrabold text-xs border border-slate-700 flex items-center gap-2 shadow-2xl">
                        <Maximize2 className="w-4 h-4 text-emerald-400" /> Klik Untuk Pop-Up Lightbox Zoom
                      </span>
                    </div>
                  </>
                ) : isLoadingDetailImage ? (
                  <div className="text-center text-emerald-400 space-y-2 p-6">
                    <RefreshCw className="w-10 h-10 mx-auto animate-spin" />
                    <p className="text-xs font-bold">Memuat foto nota fisik dari database...</p>
                  </div>
                ) : (
                  <div className="text-center text-slate-500 space-y-2 p-6">
                    <ReceiptIcon className="w-12 h-12 mx-auto" />
                    <p className="text-xs font-medium">Tidak ada foto nota tersimpan</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLoadingDetailImage(true)
                        fetch(`/api/receipts/${selectedReceipt.id}`)
                          .then((res) => (res.ok ? res.json() : null))
                          .then((data) => {
                            if (data && data.imageUrl) {
                              setSelectedReceipt((prev) => (prev && prev.id === selectedReceipt.id ? { ...prev, imageUrl: data.imageUrl } : prev))
                            }
                          })
                          .catch(() => {})
                          .finally(() => setIsLoadingDetailImage(false))
                      }}
                      className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold transition-colors"
                    >
                      Coba Muat Ulang Foto
                    </button>
                  </div>
                )}
              </div>

              <div className="md:col-span-7 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    Seluruh Item Nota ({selectedReceipt.items.length})
                  </h4>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {selectedReceipt.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                            {item.category}
                          </span>
                          {item.subCategory && item.subCategory !== "Umum" && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {item.subCategory}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <p className="font-bold text-slate-900">
                          Rp {item.price.toLocaleString("id-ID")}
                        </p>
                        <span className="text-[10px] text-slate-500">Qty: {item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Subtotal Barang</span>
                    <span>Rp {(selectedReceipt.subtotal || selectedReceipt.items.reduce((a, b) => a + b.price * b.quantity, 0)).toLocaleString("id-ID")}</span>
                  </div>
                  {selectedReceipt.taxAmount ? (
                    <div className="flex items-center justify-between text-amber-400">
                      <span>Pajak (PPN)</span>
                      <span>+ Rp {selectedReceipt.taxAmount.toLocaleString("id-ID")}</span>
                    </div>
                  ) : null}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-emerald-400 font-bold text-sm">
                    <span>Netto Total Akhir</span>
                    <span>Rp {selectedReceipt.totalAmount.toLocaleString("id-ID")}</span>
                  </div>
                </div>

                {selectedReceipt.note && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                    <span className="font-bold">Catatan:</span>
                    <p>{selectedReceipt.note}</p>
                  </div>
                )}

                {/* BUKTI TRANSFER & HISTORI PENGEDITAN (DUAL-CONTROL AUDIT LOG) */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <h5 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Bukti Transfer Pelunasan & Histori Approval
                  </h5>

                  {isLoadingHistoryLogs ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                      Memuat riwayat verifikasi & bukti pelunasan...
                    </div>
                  ) : receiptHistoryLogs.length === 0 ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-200/80">
                      Belum ada catatan histori pengeditan atau pelunasan khusus pada nota ini.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                      {receiptHistoryLogs.map((log: any) => {
                        let payloadObj: any = {}
                        try {
                          payloadObj = JSON.parse(log.payload || "{}")
                        } catch (e) {}

                        const isApproved = log.status === "APPROVED"
                        const isPending = log.status === "PENDING"
                        const isRejected = log.status === "REJECTED"

                        return (
                          <div
                            key={log.id}
                            className={`p-3 rounded-2xl border text-xs space-y-2 transition-all ${
                              isApproved
                                ? "bg-emerald-50/50 border-emerald-200"
                                : isPending
                                ? "bg-amber-50/50 border-amber-200"
                                : "bg-red-50/50 border-red-200"
                            }`}
                          >
                            {/* Log Header Badge & Meta */}
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="font-black text-slate-900 flex items-center gap-1">
                                {log.actionType === "SETTLE" || log.actionType === "BULK_SETTLE" ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                                )}
                                {log.actionType === "SETTLE" || log.actionType === "BULK_SETTLE"
                                  ? "PELUNASAN NOTA"
                                  : log.actionType === "EDIT"
                                  ? "PENGEDITAN DATA NOTA"
                                  : log.actionType}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  isApproved
                                    ? "bg-emerald-600 text-white"
                                    : isPending
                                    ? "bg-amber-500 text-white animate-pulse"
                                    : "bg-red-600 text-white"
                                }`}
                              >
                                {isApproved
                                  ? `Disetujui oleh ${log.approvedBy || "Admin"}`
                                  : isPending
                                  ? "Menunggu Approval Admin 2"
                                  : "Ditolak"}
                              </span>
                            </div>

                            {/* Sub Meta: Requested By & Date */}
                            <div className="text-[11px] text-slate-600 flex items-center justify-between">
                              <span>Diajukan oleh: <strong>{log.requestedBy}</strong></span>
                              <span className="font-mono text-slate-400">
                                {new Date(log.createdAt).toLocaleDateString("id-ID", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {/* BUKTI TRANSFER IMAGE (IF AVAILABLE IN PAYLOAD) */}
                            {payloadObj.proofImageUrl && (
                              <div className="space-y-1 pt-1 border-t border-emerald-200/80">
                                <span className="text-[10.5px] font-extrabold text-emerald-900 flex items-center gap-1">
                                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600" /> Bukti Foto Transfer / Pelunasan:
                                </span>
                                <div
                                  onClick={() => setLightboxImageUrl(payloadObj.proofImageUrl)}
                                  className="relative group rounded-xl overflow-hidden border border-emerald-300 max-w-[180px] bg-slate-900 cursor-pointer"
                                >
                                  {/* eslint-disable-next-html-element */}
                                  <img
                                    src={payloadObj.proofImageUrl}
                                    alt="Bukti Transfer Pelunasan"
                                    className="w-full h-24 object-cover group-hover:opacity-80 transition-opacity"
                                  />
                                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white font-extrabold">
                                    <Maximize2 className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Zoom Foto
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* BEFORE & AFTER DETAILS FOR EDIT LOGS */}
                            {log.actionType === "EDIT" && payloadObj && (
                              <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                                <span className="font-bold text-slate-700 block text-[10.5px] uppercase tracking-wider">Histori Perubahan Data (Sebelum ➔ Sesudah):</span>
                                {payloadObj.merchantName && payloadObj.merchantName !== selectedReceipt.merchantName && (
                                  <p className="text-slate-600">
                                    <strong>Toko:</strong> {selectedReceipt.merchantName} ➔ <span className="text-emerald-700 font-semibold">{payloadObj.merchantName}</span>
                                  </p>
                                )}
                                {payloadObj.totalAmount && payloadObj.totalAmount !== selectedReceipt.totalAmount && (
                                  <p className="text-slate-600 font-mono">
                                    <strong>Total Netto:</strong> Rp {selectedReceipt.totalAmount.toLocaleString("id-ID")} ➔ <span className="text-emerald-700 font-bold">Rp {Number(payloadObj.totalAmount).toLocaleString("id-ID")}</span>
                                  </p>
                                )}
                                {payloadObj.paymentStatus && payloadObj.paymentStatus !== selectedReceipt.paymentStatus && (
                                  <p className="text-slate-600">
                                    <strong>Status:</strong> {selectedReceipt.paymentStatus} ➔ <span className="text-emerald-700 font-semibold">{payloadObj.paymentStatus}</span>
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {!isReceiptSettled(selectedReceipt.paymentStatus) && (
                  <button
                    type="button"
                    onClick={() => triggerSettleFlow(selectedReceipt)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition-colors border border-emerald-500 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Tandai Sudah Direimburse / Lunasi
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => triggerDeleteConfirm(selectedReceipt)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition-colors border border-red-200"
                >
                  <Trash2 className="w-4 h-4" /> Hapus Nota Ini
                </button>

                {onEditReceipt && (
                  <button
                    type="button"
                    onClick={async () => {
                      const r = selectedReceipt
                      setSelectedReceipt(null)
                      let fullR = r
                      if (!fullR.imageUrl) {
                        try {
                          const res = await fetch(`/api/receipts/${r.id}`)
                          if (res.ok) {
                            const fetched = await res.json()
                            if (fetched && fetched.id) fullR = fetched
                          }
                        } catch (e) {}
                      }
                      onEditReceipt(fullR)
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors border border-blue-200 cursor-pointer"
                  >
                    <Edit className="w-4 h-4" /> Edit Ulang Data Nota
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITEM BREAKDOWN DRILL-DOWN MODAL */}
      {itemBreakdownModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base sm:text-lg flex items-center gap-2">
                    {itemBreakdownModal.title}
                  </h3>
                  <p className="text-xs text-slate-300 font-medium">
                    {itemBreakdownModal.subTitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setItemBreakdownModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Stat Badges */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">TOTAL NOMINAL</span>
                <span className="text-base font-black font-mono text-emerald-700">
                  Rp {itemBreakdownModal.totalSpend.toLocaleString("id-ID")}
                </span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">TOTAL VOLUME</span>
                <span className="text-base font-black font-mono text-slate-800">
                  {itemBreakdownModal.totalQty} item
                </span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">FREKUENSI NOTA</span>
                <span className="text-base font-black font-mono text-blue-700">
                  {itemBreakdownModal.items.length} kali transaksi
                </span>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">RATA-RATA HARGA SATUAN</span>
                <span className="text-base font-black font-mono text-purple-700">
                  Rp {Math.round(itemBreakdownModal.totalSpend / (itemBreakdownModal.totalQty || 1)).toLocaleString("id-ID")}
                </span>
              </div>
            </div>

            {/* Item Breakdown Table */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ListFilter className="w-4 h-4 text-emerald-600" /> Rincian Item-Item Penyumbang ({itemBreakdownModal.items.length} rincian)
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Klik &quot;Buka Nota&quot; untuk melihat struk fisik</span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="p-3">Tanggal</th>
                        <th className="p-3">Toko / Supplier</th>
                        <th className="p-3">Nama Barang / Produk</th>
                        <th className="p-3">Sub-Kategori</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Harga Satuan</th>
                        <th className="p-3 text-right">Total Subtotal</th>
                        <th className="p-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {itemBreakdownModal.items.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-600 whitespace-nowrap">
                            {row.receiptDate}
                          </td>
                          <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                            {row.merchantName}
                          </td>
                          <td className="p-3 font-extrabold text-slate-900">
                            {row.itemName}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                              {row.category} / {row.subCategory}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold font-mono">
                            {row.quantity}
                          </td>
                          <td className="p-3 text-right font-mono font-semibold text-slate-600 whitespace-nowrap">
                            Rp {row.price.toLocaleString("id-ID")}
                          </td>
                          <td className="p-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                            Rp {row.total.toLocaleString("id-ID")}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                const matchedReceipt = allReceipts.find((r) => r.id === row.receiptId)
                                if (matchedReceipt) {
                                  setSelectedReceipt(matchedReceipt)
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition-colors shadow-2xs"
                            >
                              <Eye className="w-3 h-3 text-emerald-400" /> Buka Nota
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setItemBreakdownModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Interactive Lightbox Modal (Renders at front layer) */}
      {lightboxImageUrl && (
        <ImageInteractiveLightbox
          imageUrl={lightboxImageUrl}
          altText="Foto Struk Original"
          onClose={() => setLightboxImageUrl(null)}
        />
      )}

      {/* DUAL-ADMIN APPROVAL MODAL */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white text-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base flex items-center gap-2">
                    Verifikasi Persetujuan Admin <span className="text-emerald-400 text-xs font-mono font-normal">(Dual Control)</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Empat Mata: Persetujuan Silang Tindakan Sensitif (Hapus, Edit, Pelunasan)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 font-medium">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Setiap tindakan Hapus, Edit, atau Pelunasan Nota memerlukan persetujuan dari <strong>Admin lain</strong>. Anda sedang aktif sebagai <strong>{currentAdminUser}</strong>.
                </span>
              </div>

              {pendingApprovals.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h4 className="font-extrabold text-slate-800 text-sm sm:text-base">Tidak Ada Permintaan Pending</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Semua tindakan Hapus, Edit, dan Pelunasan Nota telah selesai atau tidak ada yang menunggu verifikasi.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 pb-1">
                    <span>Daftar Permintaan ({pendingApprovals.length})</span>
                    <span>Klik baris untuk detail & foto</span>
                  </div>

                  {pendingApprovals.map((reqItem) => {
                    const isSelfRequest = (reqItem.requestedBy || "").trim().toLowerCase() === (currentAdminUser || "").trim().toLowerCase()
                    let payloadObj: any = {}
                    try {
                      payloadObj = JSON.parse(reqItem.payload || "{}")
                    } catch {}

                    const targetReceipt = reqItem.receipt || null
                    const receiptImage = targetReceipt?.imageUrl || payloadObj.imageUrl || approvalImageUrls[reqItem.receiptId] || null
                    const isExpanded = expandedApprovalId === reqItem.id

                    const merchantNameDisplay = targetReceipt
                      ? targetReceipt.merchantName
                      : payloadObj.merchantName || (reqItem.actionType === "BULK_DELETE" ? `${payloadObj.ids?.length || 0} Nota Pilihan` : "Nota / Toko")
                    
                    const amountDisplay = targetReceipt
                      ? targetReceipt.totalAmount
                      : Number(payloadObj.totalAmount || 0)

                    const dateDisplay = targetReceipt ? targetReceipt.date : payloadObj.date || ""

                    const targetIds: string[] = payloadObj.ids && Array.isArray(payloadObj.ids) && payloadObj.ids.length > 0
                      ? payloadObj.ids
                      : reqItem.receiptId
                      ? [reqItem.receiptId]
                      : payloadObj.id
                      ? [payloadObj.id]
                      : []

                    const targetReceiptsList = allReceipts.filter((r) => targetIds.includes(r.id))

                    return (
                      <div
                        key={reqItem.id}
                        className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-2xs ${
                          isExpanded ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {/* COMPACT MINIMALIST ROW HEADER (High Scannability) */}
                        <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-white">
                          <div
                            onClick={() => setExpandedApprovalId(isExpanded ? null : reqItem.id)}
                            className="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0 w-full"
                          >
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                reqItem.actionType === "DELETE" || reqItem.actionType === "BULK_DELETE"
                                  ? "bg-red-100 text-red-700 border border-red-200"
                                  : reqItem.actionType === "SETTLE" || reqItem.actionType === "BULK_SETTLE"
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}
                            >
                              {reqItem.actionType === "DELETE" && "HAPUS"}
                              {reqItem.actionType === "BULK_DELETE" && `HAPUS MASSAL (${payloadObj.ids?.length || 0})`}
                              {reqItem.actionType === "EDIT" && "EDIT"}
                              {reqItem.actionType === "SETTLE" && "PELUNASAN"}
                              {reqItem.actionType === "BULK_SETTLE" && `PELUNASAN MASSAL (${payloadObj.ids?.length || 0})`}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-xs text-slate-900 truncate">
                                  {merchantNameDisplay}
                                </span>
                                {dateDisplay && (
                                  <span className="text-[10.5px] font-semibold text-slate-400 shrink-0">
                                    ({dateDisplay})
                                  </span>
                                )}
                                <span className="font-mono text-xs font-black text-emerald-700 shrink-0 ml-auto sm:ml-0">
                                  Rp {amountDisplay.toLocaleString("id-ID")}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-medium pt-0.5 flex items-center gap-1.5">
                                <span>oleh <strong className="text-slate-700">{reqItem.requestedBy}</strong></span>
                                <span>•</span>
                                <span className="font-mono text-[10.5px]">{new Date(reqItem.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedApprovalId(isExpanded ? null : reqItem.id)
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 transition-colors"
                              title={isExpanded ? "Tutup Detail" : "Lihat Detail"}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 w-full sm:w-auto justify-end">
                            {isSelfRequest ? (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                Self-Approval Dilarang
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isProcessingApproval}
                                  onClick={() => handleRejectRequest(reqItem.id)}
                                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-xs transition-all disabled:opacity-50"
                                >
                                  Tolak
                                </button>

                                <button
                                  type="button"
                                  disabled={isProcessingApproval}
                                  onClick={() => handleApproveRequest(reqItem.id)}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs transition-all shadow-2xs active:scale-95 disabled:opacity-50 flex items-center gap-1"
                                >
                                  {isProcessingApproval ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Setujui
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* EXPANDABLE ACCORDION DETAIL (Only Shown When Clicked) */}
                        {isExpanded && (
                          <div className="p-4 bg-slate-50/90 border-t border-slate-200 space-y-3 text-xs animate-in fade-in zoom-in-98 duration-150">
                            {/* DAFTAR NOTA YANG DIAJUKAN (Compact List) */}
                            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                                <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-extrabold text-slate-900">
                                  <ReceiptIcon className="w-4 h-4 text-emerald-600" />
                                  Daftar Nota ({targetReceiptsList.length > 0 ? targetReceiptsList.length : targetIds.length} Nota)
                                </span>
                                <span className="text-[10.5px] font-semibold text-slate-400">
                                  Klik baris nota untuk membuka detail
                                </span>
                              </div>

                              {targetReceiptsList.length > 0 ? (
                                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                                  {targetReceiptsList.map((r, rIdx) => (
                                    <div
                                      key={r.id || rIdx}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedReceipt(r)
                                      }}
                                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between gap-2 group"
                                    >
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className="font-extrabold text-slate-900 text-xs truncate group-hover:text-emerald-900">
                                            {r.merchantName || "Nota Tanpa Nama"}
                                          </span>
                                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                            {r.date}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                                          <span>Metode: <strong>{r.paymentMethod}</strong></span>
                                          {r.note && <span className="truncate max-w-[180px] text-slate-400">({r.note})</span>}
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0 flex items-center gap-2">
                                        <span className="font-black font-mono text-emerald-700 text-xs">
                                          Rp {r.totalAmount.toLocaleString("id-ID")}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-600 border border-slate-200/80 flex items-center justify-between">
                                  <span>Target Nota: <strong>{merchantNameDisplay}</strong></span>
                                  <span className="font-mono font-bold text-emerald-700">Rp {amountDisplay.toLocaleString("id-ID")}</span>
                                </div>
                              )}
                            </div>

                            {/* RINCIAN PERUBAHAN EDIT DATA (SIDE-BY-SIDE DIFF) */}
                            {reqItem.actionType === "EDIT" && (
                              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                                <span className="font-black text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5 border-b border-slate-100 pb-1">
                                  <Edit className="w-3.5 h-3.5 text-blue-600" /> Perbandingan Perubahan Data Edit:
                                </span>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                  {/* Column Left: Data Saat Ini */}
                                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                    <span className="font-extrabold text-slate-500 uppercase text-[10px] block">Data Saat Ini (Database):</span>
                                    <p><strong>Toko:</strong> {targetReceipt?.merchantName || "-"}</p>
                                    <p><strong>Tanggal:</strong> {targetReceipt?.date || "-"}</p>
                                    <p><strong>Total:</strong> Rp {Number(targetReceipt?.totalAmount || 0).toLocaleString("id-ID")}</p>
                                    <p><strong>Metode:</strong> {targetReceipt?.paymentMethod || "Cash"}</p>
                                    <p><strong>Status:</strong> {targetReceipt?.paymentStatus || "Lunas"}</p>
                                    {targetReceipt?.items && (
                                      <div className="pt-1 border-t border-slate-200">
                                        <span className="font-bold block text-[10px]">Item Produk ({targetReceipt.items.length}):</span>
                                        <ul className="list-disc pl-3 text-[10.5px] space-y-0.5 text-slate-600">
                                          {targetReceipt.items.map((i: any, idx: number) => (
                                            <li key={idx}>{i.name} (x{i.quantity}) — Rp {Number(i.price * i.quantity).toLocaleString("id-ID")}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>

                                  {/* Column Right: Usulan Data Baru */}
                                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1 text-emerald-950">
                                    <span className="font-extrabold text-emerald-700 uppercase text-[10px] block">Usulan Data Baru (Draft):</span>
                                    <p><strong>Toko:</strong> <span className="font-bold text-emerald-900">{payloadObj.merchantName || "-"}</span></p>
                                    <p><strong>Tanggal:</strong> <span className="font-bold text-emerald-900">{payloadObj.date || "-"}</span></p>
                                    <p><strong>Total Baru:</strong> <span className="font-mono font-bold text-emerald-700">Rp {Number(payloadObj.totalAmount || 0).toLocaleString("id-ID")}</span></p>
                                    <p><strong>Metode:</strong> {payloadObj.paymentMethod || "Cash"}</p>
                                    <p><strong>Status:</strong> {payloadObj.paymentStatus || "Lunas"}</p>
                                    {payloadObj.items && Array.isArray(payloadObj.items) && (
                                      <div className="pt-1 border-t border-emerald-200">
                                        <span className="font-bold block text-[10px]">Item Produk Baru ({payloadObj.items.length}):</span>
                                        <ul className="list-disc pl-3 text-[10.5px] space-y-0.5 text-emerald-900 font-medium">
                                          {payloadObj.items.map((i: any, idx: number) => (
                                            <li key={idx}>{i.name} (x{i.quantity || 1}) — Rp {Number((i.price || 0) * (i.quantity || 1)).toLocaleString("id-ID")}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {(reqItem.actionType === "SETTLE" || reqItem.actionType === "BULK_SETTLE") && (
                              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-950 space-y-2">
                                <span className="font-bold block text-emerald-900">Usulan Pelunasan / Reimbursement Nota:</span>
                                <p>Status Pembayaran akan diubah menjadi <strong className="text-emerald-700">LUNAS</strong>.</p>

                                {payloadObj.proofImageUrl && (
                                  <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                                    <span className="font-extrabold text-emerald-900 flex items-center gap-1 text-[11px]">
                                      <UploadCloud className="w-3.5 h-3.5 text-emerald-700" />
                                      Bukti Transfer / Pembayaran Kas:
                                    </span>
                                    <div
                                      onClick={() => setLightboxImageUrl(payloadObj.proofImageUrl)}
                                      className="relative max-h-48 overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center cursor-zoom-in p-1 border border-emerald-300 group"
                                    >
                                      {/* eslint-disable-next-html-element */}
                                      <img
                                        src={payloadObj.proofImageUrl}
                                        alt="Bukti Transfer"
                                        className="max-h-44 object-contain rounded-lg shadow-md group-hover:opacity-90 transition-opacity"
                                      />
                                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs">
                                        Klik Untuk Zoom Lightbox Bukti Transfer
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {(reqItem.actionType === "DELETE" || reqItem.actionType === "BULK_DELETE") && (
                              <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs text-red-900 space-y-1">
                                <span className="font-bold flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" /> Peringatan Penghapusan Nota:
                                </span>
                                <p>Nota di atas akan <strong>dihapus secara permanen</strong> dari database Supabase jika Anda menyetujui permintaan ini.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KELOLA DATA & EXPORT COMBINED MODAL */}
      {showDataOptionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Kelola Data</h3>
                  <p className="text-xs text-slate-500 font-medium">Pilih opsi kelola data atau laporan yang diinginkan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDataOptionsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Opsi 1: Export Excel */}
              <button
                type="button"
                onClick={() => {
                  setShowDataOptionsModal(false)
                  setExportConfirmFormat("xlsx")
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-emerald-50/80 hover:bg-emerald-100/80 border border-emerald-200 text-left transition-all group active:scale-[0.99] cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <Download className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-extrabold text-xs text-emerald-950 flex items-center gap-1.5">
                    Ekspor Laporan ke Excel
                    <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-mono">.xlsx</span>
                  </h4>
                  <p className="text-[11px] text-emerald-700/90 font-medium leading-relaxed mt-0.5">
                    Unduh spreadsheet Excel lengkap sesuai filter yang aktif.
                  </p>
                </div>
              </button>

              {/* Opsi 2: Backup Data JSON */}
              <button
                type="button"
                onClick={() => {
                  setShowDataOptionsModal(false)
                  handleExportJsonBackup()
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200 text-left transition-all group active:scale-[0.99] cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  <Database className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-extrabold text-xs text-blue-950 flex items-center gap-1.5">
                    Download Backup Data
                    <span className="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-mono">.json</span>
                  </h4>
                  <p className="text-[11px] text-blue-700/90 font-medium leading-relaxed mt-0.5">
                    Unduh cadangan basis data nota lengkap untuk pengamanan.
                  </p>
                </div>
              </button>

              {/* Opsi 3: Restore Data JSON */}
              <button
                type="button"
                onClick={() => {
                  setShowDataOptionsModal(false)
                  fileInputRef.current?.click()
                }}
                disabled={isBackupRestoring}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200 text-left transition-all group active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  {isBackupRestoring ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                    Upload / Restore Data
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-mono">.json</span>
                  </h4>
                  <p className="text-[11px] text-amber-700/90 font-medium leading-relaxed mt-0.5">
                    Unggah berkas cadangan JSON untuk memulihkan data nota.
                  </p>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDataOptionsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TARGETED SETTLE CONFIRMATION & PAYMENT PROOF UPLOAD MODAL */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 space-y-0">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white leading-tight">
                    {settleTargetTitle}
                  </h3>
                  <p className="text-xs text-emerald-200/80 font-medium">
                    Lampirkan Bukti Transfer / Pembayaran Kas
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSettleModal(false)}
                className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 bg-slate-50/50">
              {/* Nominal Total Card */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1">
                <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider block">
                  TOTAL NOMINAL YANG HARUS DILUNASI
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-700 tracking-tight block">
                  Rp {Math.round(settleTargetReceipts.reduce((acc, r) => acc + r.totalAmount, 0)).toLocaleString("id-ID")}
                </span>
                <span className="text-xs text-emerald-800 font-bold block">
                  Cakupan: {settleTargetReceipts.length} Nota Transaksi
                </span>
              </div>

              {/* Upload Foto Bukti Pembayaran */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4 text-emerald-600" />
                  Upload Foto Bukti Transfer / Pembayaran <span className="text-red-500">*</span>
                </label>

                {paymentProofImage ? (
                  <div className="relative rounded-2xl border-2 border-emerald-500 overflow-hidden bg-slate-900 group">
                    <img
                      src={paymentProofImage}
                      alt="Bukti Pembayaran"
                      className="w-full h-44 object-contain mx-auto"
                    />
                    <button
                      type="button"
                      onClick={() => setPaymentProofImage(null)}
                      className="absolute top-2 right-2 p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                    >
                      Ganti Foto
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-white p-6 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-emerald-50/20 group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onload = (event) => {
                            setPaymentProofImage(event.target?.result as string)
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                    />
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100/60 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 text-center">
                      Klik untuk Memilih / Ambil Foto Bukti Transfer
                    </span>
                    <span className="text-[10.5px] text-slate-400 text-center font-medium mt-0.5">
                      Struk transfer M-Banking, Kasir, atau Bukti Kwitansi
                    </span>
                  </label>
                )}
              </div>

              {/* List Ringkasan Nota yang Dilunasi */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                <span className="text-[10.5px] font-black text-slate-500 uppercase tracking-wider block">
                  Rincian Nota Terlibat ({settleTargetReceipts.length}):
                </span>
                <div className="space-y-1">
                  {settleTargetReceipts.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs">
                      <span className="font-bold text-slate-800 truncate max-w-[200px]">
                        {r.merchantName} ({r.date})
                      </span>
                      <span className="font-extrabold font-mono text-emerald-600">
                        Rp {Math.round(r.totalAmount).toLocaleString("id-ID")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!paymentProofImage || isSubmittingSettle}
                  onClick={handleSubmitSettleWithProof}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmittingSettle ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-emerald-200" />
                  )}
                  <span>Ajukan Pelunasan ke Admin 2</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION CENTER MODAL */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                <h3 className="font-black text-sm text-white">Notifikasi Aktivitas Admin</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => requestNotificationPermission()}
                  className="text-[10px] font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer"
                  title="Minta izin Notifikasi Pop-up Native HP / Windows"
                >
                  <Bell className="w-3 h-3" /> Notifikasi HP
                </button>
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                >
                  Tandai Dibaca
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotificationsModal(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-2.5 bg-slate-50/50">
              {notifications.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400 text-center py-8">
                  Belum ada notifikasi aktivitas baru.
                </p>
              ) : (
                notifications.map((n: any) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-2xl border text-xs space-y-1 transition-all ${
                      !n.isRead ? "bg-amber-50/80 border-amber-200" : "bg-white border-slate-200 opacity-80"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">{n.title}</span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(n.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-slate-600 font-medium leading-snug">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* FLOATING MOBILE BULK ACTIONS BAR (STICKY AT BOTTOM ON HP / MOBILE) */}
      {selectedReceiptIds.length > 0 && (
        <div className="fixed bottom-16 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 z-40 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl border border-slate-700 shadow-2xl flex items-center justify-between gap-2.5 animate-in slide-in-from-bottom duration-200 lg:hidden">
          <span className="text-xs font-bold text-slate-200 whitespace-nowrap pl-1">
            <span className="bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black text-[11px] mr-1.5">
              {selectedReceiptIds.length}
            </span>
            Nota Dipilih
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => triggerSettleFlow()}
              disabled={isBulkSettling || isBulkDeleting}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 active:bg-emerald-700 text-white font-extrabold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isBulkSettling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Lunasi
            </button>

            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || isBulkSettling}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600 active:bg-red-700 text-white font-extrabold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isBulkDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Hapus
            </button>

            <button
              type="button"
              onClick={() => setSelectedReceiptIds([])}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* FULLSCREEN INTERACTIVE LIGHTBOX FOR RECEIPT PHOTO */}
      {lightboxImageUrl && (
        <ImageInteractiveLightbox
          imageUrl={lightboxImageUrl}
          onClose={() => setLightboxImageUrl(null)}
        />
      )}
    </div>
  )
}
