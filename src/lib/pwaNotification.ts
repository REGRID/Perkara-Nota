/**
 * PWA Native OS & Web Push Notification Utility
 * Handles Background Notifications even when browser / app is completely closed.
 */

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BO_S9oK2ObAvgfSAO-osPlgLpEp6471E9BVQxYNN0CgbQPHFEojBmJAvRhcK4iOqmYkmRfmOGpK6wUOezzaoWhk"

/**
 * Convert VAPID base64 string to Uint8Array for PushManager
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function getNotificationPermissionStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return 'unsupported'
  }
  return Notification.permission as 'granted' | 'denied' | 'default'
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false
  }

  if (Notification.permission === "granted") {
    return true
  }

  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission()
      return permission === "granted"
    } catch (e) {
      console.warn("Error requesting notification permission:", e)
      return false
    }
  }

  return false
}

export interface NotificationSettings {
  osPushEnabled: boolean
  newReceiptEnabled: boolean
  approvalReqEnabled: boolean
}

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") {
    return { osPushEnabled: true, newReceiptEnabled: true, approvalReqEnabled: true }
  }
  try {
    const saved = localStorage.getItem("nota_notification_settings_v1")
    if (saved) return JSON.parse(saved)
  } catch (e) {}
  return { osPushEnabled: true, newReceiptEnabled: true, approvalReqEnabled: true }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem("nota_notification_settings_v1", JSON.stringify(settings))
  } catch (e) {}
}

/**
 * Register background Web Push subscription to server
 * This allows receiving notifications on mobile phones even when the app is completely closed.
 */
export async function registerPushSubscription(
  username = "all",
  role = "ALL"
): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return { success: false, error: "Window is undefined" }
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return {
      success: false,
      error: "Perangkat atau browser ini tidak mendukung Web Push API.",
    }
  }

  try {
    // 1. Request permission
    const granted = await requestNotificationPermission()
    if (!granted) {
      return { success: false, error: "Izin notifikasi belum diaktifkan oleh pengguna." }
    }

    // 2. Ensure Service Worker is registered and ready
    let reg = await navigator.serviceWorker.getRegistration()
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    }
    await navigator.serviceWorker.ready

    // 3. Check existing subscription or create new one
    let subscription = await reg.pushManager.getSubscription()
    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as any,
      })
    }

    if (!subscription) {
      return { success: false, error: "Gagal membuat langganan push." }
    }

    // 4. Send subscription to server
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        username,
        role,
        userAgent: navigator.userAgent,
      }),
    })

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      return { success: false, error: errJson.error || "Gagal menyimpan langganan di server." }
    }

    // Mark registered in localStorage
    localStorage.setItem("nota_push_registered_v1", "true")
    return { success: true }
  } catch (err: any) {
    console.error("[registerPushSubscription Error]:", err)
    return { success: false, error: err.message || "Terjadi kesalahan saat mendaftarkan Web Push." }
  }
}

/**
 * Check if the current browser already has an active Web Push subscription
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch (e) {
    return false
  }
}

/**
 * Unsubscribe from background Web Push
 */
export async function unsubscribePushNotifications(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      })
    }
    localStorage.removeItem("nota_push_registered_v1")
    return true
  } catch (e) {
    console.error("Unsubscribe error:", e)
    return false
  }
}

/**
 * Send in-app / local OS notification (when app is open)
 */
export function sendNativeOSNotification(title: string, body: string, icon = "/icon-192.png") {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return
  }

  const settings = getNotificationSettings()
  if (!settings.osPushEnabled) return

  // Strip emoji characters if needed for clean display
  const cleanTitle = title.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, "").trim()
  const cleanBody = body.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, "").trim()

  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "TRIGGER_NOTIFICATION",
        title: cleanTitle || title,
        options: {
          body: cleanBody || body,
          icon,
          badge: icon,
          vibrate: [300, 100, 300],
          timestamp: Date.now(),
        },
      })
      return
    }

    new Notification(cleanTitle || title, {
      body: cleanBody || body,
      icon,
      badge: icon,
      vibrate: [300, 100, 300],
    } as any)
  } catch (err) {
    console.warn("Could not trigger native OS notification:", err)
  }
}

/**
 * Test background push notification with countdown delay (allows user to lock screen / close app to test)
 */
export async function testBackgroundPushNotification(delaySeconds = 5): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Perkara Kopi: Pengujian Notifikasi HP",
        message: "Notifikasi berhasil muncul di bilah notifikasi HP Anda meski aplikasi tertutup!",
        delaySeconds,
      }),
    })
    const data = await res.json()
    return {
      success: res.ok && data.success,
      message: data.message || "Notifikasi pengujian dikirim.",
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Gagal mengirim push test." }
  }
}

export async function testNativeOSNotification(
  title = "Pengujian Notifikasi Sistem",
  body = "Sistem notifikasi HP dan Windows beroperasi dengan baik."
): Promise<boolean> {
  if (typeof window === "undefined") return false

  if (!("Notification" in window)) {
    alert("Perangkat atau browser ini tidak mendukung fitur notifikasi native.")
    return false
  }

  let perm = Notification.permission
  if (perm !== "granted") {
    const granted = await requestNotificationPermission()
    perm = Notification.permission
    if (!granted || perm !== "granted") {
      alert("Izin notifikasi belum diaktifkan atau diblokir di browser. Harap aktifkan izin notifikasi pada pengaturan browser / HP Anda.")
      return false
    }
  }

  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "TRIGGER_NOTIFICATION",
        title,
        options: {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          vibrate: [300, 100, 300],
          timestamp: Date.now(),
        },
      })
    } else {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [300, 100, 300],
      } as any)
    }
    return true
  } catch (err) {
    console.warn("Gagal memicu uji notifikasi native:", err)
    alert("Gagal memicu notifikasi native. Pastikan perangkat tidak dalam mode Jangan Ganggu (Do Not Disturb).")
    return false
  }
}
