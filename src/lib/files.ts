/** 将 File 转为 data URL（data:image/...;base64,...） */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/** 从 data URL 中取出纯 base64 段（无前缀） */
export function dataURLToRawBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(',')
  if (i === -1) return dataUrl
  return dataUrl.slice(i + 1)
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('转换 Blob 失败'))
    reader.readAsDataURL(blob)
  })
}

function fileFromImageBlob(blob: Blob, index: number): File {
  const type = blob.type && /^image\//.test(blob.type) ? blob.type : 'image/png'
  const ext = type.includes('jpeg') || type.includes('jpg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png'
  return new File([blob], `paste-${Date.now()}-${index}.${ext}`, { type })
}

/** 从剪贴板或拖放 DataTransfer 中提取图片 File（截图、复制图片文件等） */
export function getImageFilesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = []
  if (dt.files?.length) {
    for (const f of dt.files) {
      if (/^image\//.test(f.type)) out.push(f)
    }
  }
  if (out.length > 0) return out

  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i]
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (f && /^image\//.test(f.type)) out.push(f)
    else if (f && !f.type) {
      out.push(fileFromImageBlob(f, out.length))
    }
  }
  return out
}
