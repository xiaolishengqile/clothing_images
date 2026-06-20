import { useCallback, useState } from 'react'

export interface FabricSource {
  file: File
  previewObjectUrl: string
}

/**
 * Reusable hook for managing an optional image source (fabric reference,
 * model reference, etc.) with automatic ObjectURL cleanup.
 */
export function useFabricSource() {
  const [source, setSource] = useState<FabricSource | null>(null)

  const setFromFile = useCallback((file: File) => {
    if (!/^image\//.test(file.type)) return
    setSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return { file, previewObjectUrl: URL.createObjectURL(file) }
    })
  }, [])

  const clear = useCallback(() => {
    setSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return null
    })
  }, [])

  return { source, setFromFile, clear }
}
