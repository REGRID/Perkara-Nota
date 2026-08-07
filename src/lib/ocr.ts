import { createWorker } from "tesseract.js"

export interface OCRProgress {
  status: string
  progress: number
}

/**
 * Compresses and resizes large camera photos to prevent payload size overflow and 'load failed' timeouts.
 * Reduces 15MB+ camera photos to ~300-500KB while preserving crisp text legibility.
 */
export function compressImageBase64(
  base64Data: string,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Data || !base64Data.startsWith("data:image")) {
      return resolve(base64Data)
    }

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      let width = img.width
      let height = img.height

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        } else {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")

      if (!ctx) return resolve(base64Data)

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, 0, 0, width, height)

      const compressedBase64 = canvas.toDataURL("image/jpeg", quality)
      resolve(compressedBase64)
    }
    img.onerror = () => resolve(base64Data)
    img.src = base64Data
  })
}

/**
 * Helper to rotate a base64 image by degrees (90, 180, 270) onto a clean Canvas
 */
export function rotateImageBase64(base64Data: string, degrees: number): Promise<string> {
  return new Promise((resolve) => {
    if (degrees === 0) return resolve(base64Data)

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return resolve(base64Data)

      if (degrees === 90 || degrees === 270) {
        canvas.width = img.height
        canvas.height = img.width
      } else {
        canvas.width = img.width
        canvas.height = img.height
      }

      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((degrees * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      resolve(canvas.toDataURL("image/jpeg", 0.9))
    }
    img.onerror = () => resolve(base64Data)
    img.src = base64Data
  })
}

/**
 * Extracts raw text from an image file or base64 data using Tesseract.js
 */
export async function extractTextFromReceipt(
  imageSource: File | string,
  onProgress?: (info: OCRProgress) => void
): Promise<string> {
  let activeWorker: any = null

  let timeoutId: any = null
  const timeout = new Promise<string>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (activeWorker) {
        try {
          activeWorker.terminate()
        } catch {}
      }
      reject(new Error("OCR Timeout"))
    }, 14000)
  })

  const ocrTask = async (): Promise<string> => {
    try {
      const worker = await createWorker("ind+eng", 1, {
        logger: (m) => {
          if (onProgress && m.status) {
            onProgress({
              status: m.status,
              progress: typeof m.progress === "number" ? m.progress : 0,
            })
          }
        },
      })
      activeWorker = worker

      const {
        data: { text },
      } = await worker.recognize(imageSource)

      await worker.terminate()
      activeWorker = null
      return text ? text.trim() : "Nota Belanja"
    } catch (err) {
      console.warn("Primary Tesseract OCR failed, using fallback:", err)
      if (activeWorker) {
        try {
          await activeWorker.terminate()
        } catch {}
        activeWorker = null
      }
      return "Nota Belanja"
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  try {
    return await Promise.race([ocrTask(), timeout])
  } catch (err) {
    console.warn("OCR timed out or failed gracefully:", err)
    if (activeWorker) {
      try {
        await activeWorker.terminate()
      } catch {}
      activeWorker = null
    }
    return "Nota Belanja"
  }
}
