import { NextRequest, NextResponse } from "next/server"
import { getUserAccountDetails } from "@/lib/adminAccounts"

const ALLOWED_STAFF_NAMES = ["reza", "ummu", "cheisa", "novi", "titis"]

export async function POST(req: NextRequest) {
  try {
    const { username, password, staffName } = await req.json()

    const cleanUsername = (username || "").trim().toLowerCase()
    const cleanPassword = (password || "").trim()
    const cleanStaffName = (staffName || "").trim()

    if (!cleanUsername || !cleanPassword) {
      return NextResponse.json({ error: "ID Pengguna dan Password harus diisi" }, { status: 400 })
    }

    const account = await getUserAccountDetails(cleanUsername)

    if (!account || account.password !== cleanPassword) {
      return NextResponse.json({ error: "ID Pengguna atau Password salah. Akses ditolak." }, { status: 401 })
    }

    // Role Karyawan mandatory staffName validation
    if (account.role === "KARYAWAN") {
      if (!cleanStaffName) {
        return NextResponse.json({ error: "Wajib memilih 'Siapa yang login' (Reza, Ummu, Cheisa, Novi, Titis)." }, { status: 400 })
      }
      const isAllowed = ALLOWED_STAFF_NAMES.includes(cleanStaffName.toLowerCase())
      if (!isAllowed) {
        return NextResponse.json({ error: "Nama staf yang dipilih tidak valid." }, { status: 400 })
      }
    }

    const authenticatedUser = cleanUsername
    const userRole = account.role
    const finalStaffName = account.role === "KARYAWAN" ? cleanStaffName : ""

    // Auth Token encoded with authenticated username, role, and staffName
    const tokenPayload = Buffer.from(`${authenticatedUser}:${cleanPassword}:${userRole}:${finalStaffName}:nota_session_secret`).toString("base64")

    const response = NextResponse.json({
      success: true,
      message: `Login ${userRole === "KARYAWAN" ? `Karyawan (${finalStaffName})` : `Admin (${authenticatedUser})`} berhasil`,
      user: {
        username: authenticatedUser,
        role: userRole,
        staffName: finalStaffName,
      },
      token: tokenPayload,
    })

    // Set secure HTTP-only Cookies
    response.cookies.set({
      name: "nota_admin_session",
      value: tokenPayload,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    if (finalStaffName) {
      response.cookies.set({
        name: "nota_staff_name",
        value: finalStaffName,
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      })
    }

    return response
  } catch (error: any) {
    console.error("Login API Error:", error)
    return NextResponse.json({ error: "Terjadi kesalahan server saat login" }, { status: 500 })
  }
}
