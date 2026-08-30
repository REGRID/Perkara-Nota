/**
 * POS Sync Client for Perkara-Nota
 * Automatically syncs approved receipts to New PERKARA POS
 */

export interface PosReceiptItem {
  name: string
  category: string
  subCategory?: string
  price: number
  quantity: number
  sku?: string
}

export interface PosSyncPayload {
  receiptId: string
  merchantName: string
  date: string
  totalAmount: number
  subtotal?: number
  taxAmount?: number
  discountAmount?: number
  paymentMethod: string
  paymentStatus: string
  note?: string | null
  imageUrl?: string | null
  staffName?: string | null
  approvedBy?: string | null
  stockDestination?: "BAR" | "WAREHOUSE"
  items: PosReceiptItem[]
}

const DEFAULT_POS_WEBHOOK_URL = process.env.POS_WEBHOOK_URL || "http://localhost:3001/api/webhooks/nota-approved"
const POS_WEBHOOK_SECRET = process.env.POS_WEBHOOK_SECRET || "perkara_pos_secret_key_2026"

export async function syncReceiptToPos(payload: PosSyncPayload): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const targetUrl = process.env.POS_WEBHOOK_URL || DEFAULT_POS_WEBHOOK_URL

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 6000) // 6s timeout

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${POS_WEBHOOK_SECRET}`,
        "x-source-app": "perkara-nota",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errorText = await res.text()
      console.warn(`[POS Sync Warning] POS responded with status ${res.status}: ${errorText}`)
      return { success: false, message: `POS HTTP Error ${res.status}: ${errorText.slice(0, 150)}` }
    }

    const data = await res.json()
    console.log(`[POS Sync Success] Receipt ${payload.receiptId} synced to New PERKARA POS:`, data)
    return { success: true, message: "Berhasil disinkronkan ke New PERKARA POS", data }
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn(`[POS Sync Timeout] Target POS at ${DEFAULT_POS_WEBHOOK_URL} timed out after 6 seconds.`)
      return { success: false, message: "Koneksi ke POS time out (offline/belum aktif)" }
    }
    console.warn(`[POS Sync Notice] Could not reach POS server: ${err.message || err}`)
    return { success: false, message: err.message || "Gagal menghubungi server POS" }
  }
}
