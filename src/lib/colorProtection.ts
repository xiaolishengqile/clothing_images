function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败，无法执行白底保护'))
    img.src = src
  })
}

function fileObjectUrl(file: File): string {
  return URL.createObjectURL(file)
}

function isProtectedLightNeutral(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const spread = max - min

  // White / off-white / cream / pale gray fabric and its soft shadow areas.
  if (max >= 150 && min >= 115 && spread <= 58) return true
  if (max >= 118 && min >= 88 && spread <= 36) return true
  return false
}

export async function restoreProtectedLightNeutrals(
  originalFile: File,
  generatedDataUrl: string,
): Promise<string> {
  const originalUrl = fileObjectUrl(originalFile)
  try {
    const [original, generated] = await Promise.all([loadImage(originalUrl), loadImage(generatedDataUrl)])
    const width = generated.naturalWidth || generated.width
    const height = generated.naturalHeight || generated.height
    if (!width || !height) return generatedDataUrl

    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = width
    sourceCanvas.height = height
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceCtx) return generatedDataUrl
    sourceCtx.drawImage(original, 0, 0, width, height)
    const sourceData = sourceCtx.getImageData(0, 0, width, height)

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = width
    outputCanvas.height = height
    const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: true })
    if (!outputCtx) return generatedDataUrl
    outputCtx.drawImage(generated, 0, 0, width, height)
    const outputData = outputCtx.getImageData(0, 0, width, height)

    for (let i = 0; i < sourceData.data.length; i += 4) {
      const r = sourceData.data[i]
      const g = sourceData.data[i + 1]
      const b = sourceData.data[i + 2]
      if (!isProtectedLightNeutral(r, g, b)) continue

      outputData.data[i] = r
      outputData.data[i + 1] = g
      outputData.data[i + 2] = b
    }

    outputCtx.putImageData(outputData, 0, 0)
    return outputCanvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(originalUrl)
  }
}
