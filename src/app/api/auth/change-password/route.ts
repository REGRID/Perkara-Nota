import { NextRequest, NextResponse } from "next/server"
import { validateAdminCredentials, updateAdminPassword } from "@/lib/adminAccounts"

export async function POST(req: NextRequest) {
  try {
    const { username, oldPassword, newPassword } = await req.json()

    const cleanUser = (username || "").trim().toLowerCase()
    const cleanOld = (oldPassword || "").trim()
    const cleanNew = (newPassword || "").trim()

    if (!cleanUser || !cleanOld || !cleanNew) {
      return NextResponse.json({ error: "Password lama dan password baru wajib diisi" }, { status: 400 })
    }

    if (cleanNew.length < 4) {
      return NextResponse.json({ error: "Password baru minimal 4 karakter" }, { status: 400 })
    }

    const isOldValid = await validateAdminCredentials(cleanUser, cleanOld)

    if (!isOldValid) {
      return NextResponse.json({ error: "Password saat ini tidak sesuai." }, { status: 400 })
    }

    const success = await updateAdminPassword(cleanUser, cleanNew)

    if (!success) {
      return NextResponse.json({ error: "Gagal memperbarui password di database" }, { status: 500 })
    }

    const newToken = Buffer.from(`${cleanUser}:${cleanNew}:nota_session_secret`).toString("base64")

    const response = NextResponse.json({
      success: true,
      message: `Password untuk ID "${cleanUser}" berhasil diperbarui!`,
      token: newToken,
    })

    response.cookies.set({
      name: "nota_admin_session",
      value: newToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch (error: any) {
    console.error("Change Password API Error:", error)
    return NextResponse.json({ error: "Terjadi kesalahan server saat mengubah password" }, { status: 500 })
  }
}
