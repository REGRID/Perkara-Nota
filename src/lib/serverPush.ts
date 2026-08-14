import webpush from "web-push"
import { supabase } from "./supabase"

// VAPID keys for Web Push Protocol
// Can be customized via environment variables or use the pre-configured production keys
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BO_S9oK2ObAvgfSAO-osPlgLpEp6471E9BVQxYNN0CgbQPHFEojBmJAvRhcK4iOqmYkmRfmOGpK6wUOezzaoWhk"

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ZFrM4s75bYa7BITthm3kVzdKQtfQankA-Mwvhsd9TI0"

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@perkarakopi.com"

// Initialize web-push details
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} catch (e) {
  console.error("[WebPush Init Error]:", e)
}

export interface PushPayload {
  title: string
  message: string
  url?: string
  icon?: string
  badge?: string
  tag?: string
  timestamp?: number
}

export interface SendPushOptions {
  title: string
  message: string
  url?: string
  recipientRole?: "ALL" | "ADMIN" | "KARYAWAN"
  excludeUsername?: string
  tag?: string
}

/**
 * Broadcasts a Web Push notification to all matching subscriptions (even when browser/app is closed on mobile).
 */
export async function sendWebPushNotification(options: SendPushOptions) {
  try {
    const { title, message, url = "/", recipientRole = "ALL", excludeUsername, tag } = options

    let query = supabase.from("push_subscriptions").select("*")

    if (recipientRole !== "ALL") {
      // Allow subscriptions that match target role or 'ALL'
      query = query.or(`role.eq.${recipientRole},role.eq.ALL`)
    }

    const { data: subscriptions, error } = await query

    if (error) {
      console.error("[WebPush] Failed to query subscriptions:", error)
      return { success: false, sentCount: 0, error }
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("[WebPush] No active subscriptions found.")
      return { success: true, sentCount: 0 }
    }

    // Clean text (remove excessive non-printable chars)
    const cleanTitle = title.trim()
    const cleanMessage = message.trim()

    const payload: PushPayload = {
      title: cleanTitle,
      message: cleanMessage,
      url,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag || `nota-${Date.now()}`,
      timestamp: Date.now(),
    }

    const jsonPayload = JSON.stringify(payload)

    const staleEndpointIds: string[] = []
    let sentCount = 0

    const sendPromises = subscriptions.map(async (sub) => {
      // Exclude sender if specified
      if (excludeUsername && sub.username && sub.username.toLowerCase() === excludeUsername.toLowerCase()) {
        return
      }

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }

      try {
        await webpush.sendNotification(pushSubscription, jsonPayload, {
          TTL: 86400, // 24 hours queueing in FCM / Apple APNs
          urgency: "high", // Wake up mobile phone screen/notification bar immediately
        })
        sentCount++
      } catch (err: any) {
        // HTTP 404 or 410 means subscription expired or uninstalled
        if (err.statusCode === 404 || err.statusCode === 410) {
          staleEndpointIds.push(sub.id)
        } else {
          console.warn(`[WebPush] Failed to push to endpoint (${sub.username || "unknown"}):`, err.message || err)
        }
      }
    })

    await Promise.allSettled(sendPromises)

    // Remove expired subscriptions in the background
    if (staleEndpointIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", staleEndpointIds)
    }

    return { success: true, sentCount, staleRemoved: staleEndpointIds.length }
  } catch (err) {
    console.error("[WebPush Broadcast Error]:", err)
    return { success: false, error: err }
  }
}
