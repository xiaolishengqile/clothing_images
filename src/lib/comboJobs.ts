export type ComboJobStatus = 'queued' | 'running' | 'done' | 'error'

export interface ComboImageItem {
  id: string
  file: File
  previewObjectUrl: string
}

export interface ComboJob {
  id: string
  file: File
  previewObjectUrl: string
  status: ComboJobStatus
  error?: string
  resultDataUrl?: string
  addedSeq: number
  completedAt?: number
  comboModelFile?: File
  comboSceneFile?: File
  comboModelId?: string
  comboSceneId?: string
  comboClothingId?: string
  comboModelLabel?: string
  comboSceneLabel?: string
  comboClothingLabel?: string
  comboModelPreviewUrl?: string
  comboScenePreviewUrl?: string
}

function safeComboBaseName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120)
  return base || 'image'
}

function comboLabel(file: File): string {
  return safeComboBaseName(file.name.replace(/\.[^.]+$/, ''))
}

function comboKey(modelId?: string, sceneId?: string, clothingId?: string): string | null {
  if (!modelId || !sceneId || !clothingId) return null
  return `${modelId}\u0000${sceneId}\u0000${clothingId}`
}

interface RebuildComboJobsParams {
  previousJobs: ComboJob[]
  models: ComboImageItem[]
  scenes: ComboImageItem[]
  clothes: ComboImageItem[]
  nextId: () => string
  nextSeq: () => number
}

export function rebuildComboJobsPreservingResults({
  previousJobs,
  models,
  scenes,
  clothes,
  nextId,
  nextSeq,
}: RebuildComboJobsParams): ComboJob[] {
  if (models.length === 0 || scenes.length === 0 || clothes.length === 0) return []

  const previousByKey = new Map<string, ComboJob>()
  for (const job of previousJobs) {
    const key = comboKey(job.comboModelId, job.comboSceneId, job.comboClothingId)
    if (key) previousByKey.set(key, job)
  }

  const nextJobs: ComboJob[] = []
  for (const model of models) {
    for (const scene of scenes) {
      for (const cloth of clothes) {
        const key = comboKey(model.id, scene.id, cloth.id)
        const existing = key ? previousByKey.get(key) : undefined
        const comboFields = {
          file: cloth.file,
          previewObjectUrl: cloth.previewObjectUrl,
          comboModelFile: model.file,
          comboSceneFile: scene.file,
          comboModelId: model.id,
          comboSceneId: scene.id,
          comboClothingId: cloth.id,
          comboModelLabel: comboLabel(model.file),
          comboSceneLabel: comboLabel(scene.file),
          comboClothingLabel: comboLabel(cloth.file),
          comboModelPreviewUrl: model.previewObjectUrl,
          comboScenePreviewUrl: scene.previewObjectUrl,
        }

        nextJobs.push(
          existing
            ? { ...existing, ...comboFields }
            : {
                id: nextId(),
                status: 'queued',
                addedSeq: nextSeq(),
                ...comboFields,
              },
        )
      }
    }
  }

  return nextJobs
}
