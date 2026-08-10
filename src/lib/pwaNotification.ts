/**
 * PWA Native OS System Notification Utility
 */

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

export function sendNativeOSNotification(title: string, body: string, icon = "/icon-192.png") {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return
  }

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
