// src/services/pdf-preview.ts
// Helper to render the first page of a PDF document into a base64 thumbnail image

import * as pdfjsLib from 'pdfjs-dist'

export async function renderPdfFirstPageToDataUrl(pdfData: Uint8Array | ArrayBuffer | string): Promise<string | null> {
  try {
    let dataBuffer: Uint8Array
    if (typeof pdfData === 'string') {
      const binaryString = atob(pdfData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      dataBuffer = bytes
    } else if (pdfData instanceof ArrayBuffer) {
      dataBuffer = new Uint8Array(pdfData)
    } else {
      dataBuffer = pdfData
    }

    const loadingTask = pdfjsLib.getDocument({
      data: dataBuffer,
      useSystemFonts: true
    })

    const pdf = await loadingTask.promise
    if (pdf.numPages === 0) return null

    const page = await pdf.getPage(1)
    // 320px width thumbnail
    const unscaledViewport = page.getViewport({ scale: 1.0 })
    const targetWidth = 320
    const scale = targetWidth / unscaledViewport.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport
    } as any).promise

    return canvas.toDataURL('image/jpeg', 0.85)
  } catch (err) {
    console.warn('[momai-emails] Falha ao renderizar miniatura do PDF:', err)
    return null
  }
}
