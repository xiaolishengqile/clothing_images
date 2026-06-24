import { useCallback, useState } from 'react'

export interface MultiImageItem {
  id: string
  file: File
  previewObjectUrl: string
}

/**
 * Manages a list of uploaded images (multi-select / drag-drop).
 */
export function useMultiImageSource() {
  const [items, setItems] = useState<MultiImageItem[]>([])

  const addFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) => /^image\//.test(f.type))
    if (arr.length === 0) return
    setItems((prev) => [
      ...prev,
      ...arr.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewObjectUrl: URL.createObjectURL(file),
      })),
    ])
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((x) => x.id === id)
      if (item?.previewObjectUrl) URL.revokeObjectURL(item.previewObjectUrl)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clear = useCallback(() => {
    setItems((prev) => {
      for (const item of prev) {
        if (item.previewObjectUrl) URL.revokeObjectURL(item.previewObjectUrl)
      }
      return []
    })
  }, [])

  return { items, addFiles, removeItem, clear }
}
