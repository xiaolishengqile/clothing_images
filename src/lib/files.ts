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
