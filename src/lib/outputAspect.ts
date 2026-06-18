function parseAspectRatio(label: string): number {
  const [w, h] = label.split(':').map(Number)
  if (!w || !h) return 1
  return w / h
}

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('无法校正生成图比例'))
    img.src = dataUrl
  })
}

export async function ensureOutputAspect(dataUrl: string, aspectLabel: string): Promise<string> {
  const targetRatio = parseAspectRatio(aspectLabel)
  const img = await loadDataUrlImage(dataUrl)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return dataUrl

  const currentRatio = width / height
  if (Math.abs(currentRatio - targetRatio) < 0.01) return dataUrl

  const canvas = document.createElement('canvas')
  if (currentRatio > targetRatio) {
    canvas.width = width
    canvas.height = Math.round(width / targetRatio)
  } else {
    canvas.height = height
    canvas.width = Math.round(height * targetRatio)
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, (canvas.width - width) / 2, (canvas.height - height) / 2)
  return canvas.toDataURL('image/png')
}
