/**
 * PWA Native OS System Notification Utility
 */

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

export function sendNativeOSNotification(title: string, body: string, icon = "/icon-192.png") {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return
  }

  const settings = getNotificationSettings()
  if (!settings.osPushEnabled) return

  try {
    // 1. Try Service Worker registration notification first (Best for PWA installed apps on Mobile & Desktop)
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "TRIGGER_NOTIFICATION",
        title,
        options: {
          body,
          icon,
          badge: icon,
          vibrate: [200, 100, 200],
          timestamp: Date.now(),
        },
      })
      return
    }

    // 2. Fallback to standard Browser Notification constructor
    new Notification(title, {
      body,
      icon,
      badge: icon,
      vibrate: [200, 100, 200],
    } as any)
  } catch (err) {
    console.warn("Could not trigger native OS notification:", err)
  }
}
