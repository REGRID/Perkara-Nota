import { NextResponse } from "next/server"

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logout Admin berhasil",
  })

  // Clear HTTP-only session cookie
  response.cookies.set({
    name: "nota_admin_session",
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  })

  return response
}
