import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"

import { PwaInstallPrompt } from "@/components/pwa-install-prompt"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: "Nota-Photo AI — Digital Struk & Faktur",
  description: "Aplikasi Digitalisasi Struk, Faktur, & Surat Jalan Fisik dengan AI Gemini Cloud",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nota Photo AI",
  },
  verification: {
    google: "us2F4BU3Hm51-MI_cnTqBGnFRQpcjrTOzPOMmbKGePE",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className={inter.variable}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white">
        {children}
        <PwaInstallPrompt />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
