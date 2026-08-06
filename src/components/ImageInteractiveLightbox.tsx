"use client"

import React, { useState, useRef, useEffect } from "react"
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  Move,
  Sparkles,
} from "lucide-react"

interface ImageInteractiveLightboxProps {
  imageUrl: string
  altText?: string
  onClose: () => void
}

export function ImageInteractiveLightbox({
  imageUrl,
  altText = "Foto Nota Fisik",
  onClose,
}: ImageInteractiveLightboxProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)

  // Dragging state
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })

  // Pinch-to-zoom touch state for Tablet/Mobile
  const touchDistanceRef = useRef<number | null>(null)
  const initialZoomRef = useRef<number>(1)

  // Reset zoom & pan
  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRotation(0)
  }

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.3, 5))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.3, 0.8))
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360)

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomDelta = e.deltaY < 0 ? 0.2 : -0.2
    setZoom((prev) => Math.max(0.8, Math.min(5, prev + zoomDelta)))
  }

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  // Touch handlers for Tablet (Pinch-to-zoom & Touch Pan)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single finger touch pan
      setIsDragging(true)
      dragStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      }
    } else if (e.touches.length === 2) {
      // Two finger pinch to zoom
      setIsDragging(false)
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      touchDistanceRef.current = dist
      initialZoomRef.current = zoom
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      // Touch pan
      setPan({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      })
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      // Pinch zoom calculation
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const scale = newDist / touchDistanceRef.current
      const newZoom = Math.max(0.8, Math.min(5, initialZoomRef.current * scale))
      setZoom(newZoom)
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    touchDistanceRef.current = null
  }

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col justify-between overflow-hidden animate-in fade-in duration-200 select-none">
      {/* Top Header Floating Bar */}
      <div className="p-4 sm:p-5 flex items-center justify-between z-10 bg-gradient-to-b from-slate-950/80 to-transparent text-white">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Interactive Lightbox Viewer
          </span>
          <p className="text-xs text-slate-300 hidden md:block">
            Gunakan Wheel Mouse / Pinch 2 Jari Tablet untuk Zoom • Drag/Klik Geser untuk Memindahkan Gambar
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all border border-white/10"
          title="Tutup (Esc)"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Interactive Zoom & Pan Canvas Container */}
      <div
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 w-full h-full relative flex items-center justify-center overflow-hidden touch-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <div
          className="transition-transform duration-75 origin-center ease-out pointer-events-none"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          {/* eslint-disable-next-html-element */}
          <img
            src={imageUrl}
            alt={altText}
            className="max-w-none max-h-[85vh] sm:max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-slate-700/50"
          />
        </div>
      </div>

      {/* Floating Bottom Control Bar */}
      <div className="p-4 sm:p-5 flex justify-center items-center z-10 bg-gradient-to-t from-slate-950/90 to-transparent">
        <div className="flex items-center gap-2 sm:gap-3 bg-slate-900/90 border border-slate-700/80 p-2 sm:p-2.5 rounded-2xl shadow-2xl backdrop-blur-md text-white text-xs">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono font-extrabold text-emerald-400 px-2 min-w-[50px] text-center">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={handleRotate}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 font-semibold"
            title="Putar 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all font-bold text-[11px] text-slate-300"
            title="Reset Posisi & Zoom"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
