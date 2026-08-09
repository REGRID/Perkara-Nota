import sharp from "sharp"

/**
 * Compresses base64 image strings to maximum efficiency (< 30-80 KB)
 * Resizes max width/height to 800px and converts to WebP quality 60.
 */
export async function compressBase64Image(base64String: string | null | undefined): Promise<string | null> {
  if (!base64String || typeof base64String !== "string") return null
  if (!base64String.includes("base64,")) return base64String

  try {
    const parts = base64String.split("base64,")
    const buffer = Buffer.from(parts[1], "base64")

    // If image is already smaller than 60 KB, return as is
    if (buffer.length <= 60 * 1024) {
      return base64String
    }

    const compressedBuffer = await sharp(buffer)
      .resize({
        width: 800,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 60 })
      .toBuffer()

    const compressedBase64 = `data:image/webp;base64,${compressedBuffer.toString("base64")}`
    return compressedBase64
  } catch (error) {
    console.warn("Base64 image compression warning:", error)
    return base64String
  }
}
