import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { postImagesEdits } from './api/imagesEdits'
import { usePersistedState } from './hooks/usePersistedState'
import { useFabricSource } from './hooks/useFabricSource'
import {
  ASPECT_OPTIONS,
  buildColorCardPromptForEdits,
  buildFabricTransferPromptForEdits,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_API_BASE,
  DEV_PROXY_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DEFAULT_SIZE_2K,
  LEGACY_PRODUCTION_API_BASE,
  MAX_BATCH_CONCURRENCY,
  PRODUCTION_API_BASE,
  buildColorChangePrompt,
  PROMPT_SEPARATES_MODE,
  PROMPT_SEPARATES_DUAL_MODE_EDIT,
  PROMPT_FABRIC_CLOSEUP_MODE_EDIT,
  PROMPT_SOLID_FABRIC_EDIT,
  PROMPT_SKIRT_ONLY_EDIT,
  PROMPT_PATTERN_EXTRACT,
  PROMPT_MODEL_FLATTEN_WITH_REF_EDIT,
  PROMPT_WEAR_MODE_EDIT,
  SIZE_OPTIONS,
  SIZE_OPTIONS_2K,
  STORAGE_KEY_ASPECT,
  STORAGE_KEY_BASE,
  STORAGE_KEY_COLOR_CHANGE,
  STORAGE_KEY_COLOR_CHANGE_PROTECT_NEUTRALS,
  STORAGE_KEY_COLOR_CARD_COUNT,
  STORAGE_KEY_COLOR_CARD_MODE,
  STORAGE_KEY_FABRIC_CLOSEUP_MODE,
  STORAGE_KEY_PATTERN_EXTRACT_MODE,
  STORAGE_KEY_MODEL_FLATTEN_MODE,
  STORAGE_KEY_PROMPT,
  STORAGE_KEY_SIZE,
  STORAGE_KEY_SOLID_FABRIC,
  STORAGE_KEY_STANDARD_VIEW,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USE_2K,
  STORAGE_KEY_SKIRT_ONLY,
  STORAGE_KEY_SEPARATES_DUAL_MODE,
  STORAGE_KEY_SEPARATES_MODE,
  STORAGE_KEY_WEAR_MODE,
} from './lib/constants'
import { PRESET_COLORS } from './lib/presetColors'
import { restoreProtectedLightNeutrals } from './lib/colorProtection'
import { getImageFilesFromDataTransfer, readFileAsDataURL } from './lib/files'
import { closestAspectLabel, getImageDimensions, sizeForAspect } from './lib/imageAspect'
import { ensureOutputAspect } from './lib/outputAspect'
import {
  buildPerJobPromptSuffix,
  checkTargetImage,
  type TargetImageWarning,
} from './lib/targetImageCheck'
import './App.css'

type JobStatus = 'queued' | 'running' | 'done' | 'error'
type PasteTarget = 'fabric' | 'fabricTop' | 'fabricBottom' | 'target' | 'colorCardBack'
/** 主工作模式：换布（默认）、一键换色、上身展示、展平、提取花色、色卡 */
type WorkMode = 'fabric' | 'colorChange' | 'wear' | 'modelFlatten' | 'patternExtract' | 'colorCard'
type ColorCardView = 'front' | 'back'
/** 换布变体：标准正面 / 标准背面 / 裙子 / 仅换上装 / 上下装双参考 / 局部布样 */
type FabricVariant = 'standardFront' | 'standardBack' | 'skirtOnly' | 'separates' | 'separatesDual' | 'fabricCloseup'

/** 设为 true 可在界面显示「换色」模式 */
const COLOR_CHANGE_MODE_ENABLED = false

const WORK_MODE_OPTIONS: { id: WorkMode; label: string; hint: string }[] = [
  { id: 'fabric', label: '换布', hint: '布料图替换花纹' },
  { id: 'colorChange', label: '换色', hint: '整件衣服纯色' },
  { id: 'wear', label: '上身', hint: '保商品版型花色' },
  { id: 'modelFlatten', label: '提平面图', hint: '模特衣服转平铺图' },
  { id: 'patternExtract', label: '提花色', hint: '成衣图转无缝印花' },
  { id: 'colorCard', label: '色卡', hint: '编号色卡批量正背面' },
]

const VISIBLE_WORK_MODE_OPTIONS = WORK_MODE_OPTIONS.filter(
  (opt) => COLOR_CHANGE_MODE_ENABLED || opt.id !== 'colorChange',
)

const DEFAULT_COLOR_CARD_COUNT = 18
const MIN_COLOR_CARD_COUNT = 0
const MAX_COLOR_CARD_COUNT = 99

const FABRIC_VARIANT_OPTIONS: { id: FabricVariant; label: string; hint: string }[] = [
  { id: 'standardFront', label: '标准正面', hint: '正面图锁定' },
  { id: 'standardBack', label: '标准背面', hint: '背面图锁定' },
  { id: 'skirtOnly', label: '裙子模式', hint: '只换下装，上衣不变' },
  { id: 'separates', label: '仅换上装', hint: '只处理上衣' },
  { id: 'separatesDual', label: '双参考', hint: '只取花色，不取版型' },
  { id: 'fabricCloseup', label: '局部布样', hint: '锁旋转褶皱特写' },
]

function loadWorkMode(): WorkMode {
  if (localStorage.getItem(STORAGE_KEY_COLOR_CARD_MODE) === '1') return 'colorCard'
  if (localStorage.getItem(STORAGE_KEY_PATTERN_EXTRACT_MODE) === '1') return 'patternExtract'
  if (localStorage.getItem(STORAGE_KEY_MODEL_FLATTEN_MODE) === '1') return 'modelFlatten'
  if (localStorage.getItem(STORAGE_KEY_WEAR_MODE) === '1') return 'wear'
  if (COLOR_CHANGE_MODE_ENABLED && localStorage.getItem(STORAGE_KEY_COLOR_CHANGE) === '1') return 'colorChange'
  return 'fabric'
}

function loadFabricVariant(workMode: WorkMode): FabricVariant {
  if (workMode !== 'fabric') return 'standardFront'
  if (localStorage.getItem(STORAGE_KEY_FABRIC_CLOSEUP_MODE) === '1') return 'fabricCloseup'
  if (localStorage.getItem(STORAGE_KEY_SEPARATES_DUAL_MODE) === '1') return 'separatesDual'
  if (localStorage.getItem(STORAGE_KEY_SKIRT_ONLY) === '1') return 'skirtOnly'
  if (localStorage.getItem(STORAGE_KEY_SEPARATES_MODE) === '1') return 'separates'
  return localStorage.getItem(STORAGE_KEY_STANDARD_VIEW) === 'back' ? 'standardBack' : 'standardFront'
}

function loadAspectRatio(): string {
  const stored = localStorage.getItem(STORAGE_KEY_ASPECT)
  return stored && ASPECT_OPTIONS.includes(stored) ? stored : DEFAULT_ASPECT_RATIO
}

function clampColorCardCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COLOR_CARD_COUNT
  return Math.min(MAX_COLOR_CARD_COUNT, Math.max(MIN_COLOR_CARD_COUNT, Math.round(value)))
}

function loadColorCardCount(): number {
  const stored = localStorage.getItem(STORAGE_KEY_COLOR_CARD_COUNT)
  if (stored === null) return DEFAULT_COLOR_CARD_COUNT
  return clampColorCardCount(Number(stored))
}

interface ImagePreview {
  src: string
  label: string
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: '等待',
  running: '生成中',
  done: '完成',
  error: '失败',
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el instanceof HTMLElement && el.isContentEditable
}

interface Job {
  id: string
  file: File
  previewObjectUrl: string
  status: JobStatus
  error?: string
  resultDataUrl?: string
  addedSeq: number
  completedAt?: number
  warnings?: TargetImageWarning[]
  /** 背面拍摄：生成时强制保持背面视角 */
  isBackView?: boolean
  /** 局部/特写：强制锁构图，禁止补全 */
  isStrictFraming?: boolean
  /** 色卡模式：编号色号 */
  colorCardNumber?: number
  /** 色卡模式：正面 / 背面 */
  colorCardView?: ColorCardView
  /** 色卡模式：背面任务是否来自用户上传的背面参考图 */
  colorCardUsesBackReference?: boolean
}

function safeBaseName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120)
  return base || 'image'
}

function extensionFromMime(file: File): string {
  const t = file.type
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('webp')) return 'webp'
  if (t.includes('png')) return 'png'
  return 'png'
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取参考图'))
    }
    img.src = url
  })
}

async function createLabeledReferenceFile(file: File, role: 'top' | 'bottom'): Promise<File> {
  const img = await loadImageElement(file)
  const maxWidth = 1400
  const minWidth = 720
  const headerHeight = 96
  const border = 14
  const canvasWidth = Math.min(maxWidth, Math.max(minWidth, img.naturalWidth || img.width))
  const contentWidth = canvasWidth - border * 2
  const contentHeight = Math.max(1, Math.round(contentWidth * img.height / img.width))
  const canvasHeight = headerHeight + contentHeight + border
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建参考图标记')

  const isTop = role === 'top'
  const color = isTop ? '#1d4ed8' : '#15803d'
  const title = isTop ? 'Image 1 · Top only' : 'Image 2 · Bottom only'
  const corner = isTop ? 'Top' : 'Bottom'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, headerHeight)
  ctx.fillRect(0, headerHeight, border, canvas.height - headerHeight)
  ctx.fillRect(canvas.width - border, headerHeight, border, canvas.height - headerHeight)
  ctx.fillRect(0, canvas.height - border, canvas.width, border)
  ctx.drawImage(img, border, headerHeight, contentWidth, contentHeight)

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 40px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, canvas.width / 2, headerHeight / 2)

  ctx.font = '700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const tagPaddingX = 14
  const tagPaddingY = 8
  const tagX = border + 10
  const tagY = headerHeight + 10
  const metrics = ctx.measureText(corner)
  const tagWidth = Math.ceil(metrics.width + tagPaddingX * 2)
  const tagHeight = 44
  ctx.fillStyle = color
  ctx.fillRect(tagX, tagY, tagWidth, tagHeight)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(corner, tagX + tagPaddingX, tagY + tagPaddingY)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('无法生成带标记参考图'))
    }, 'image/png')
  })
  const stem = safeBaseName(file.name.replace(/\.[^.]+$/, ''))
  const suffix = isTop ? 'top_only' : 'bottom_only'
  return new File([blob], `${stem}_${suffix}.png`, { type: 'image/png' })
}

export default function App() {
  // --- Persisted state (replaces 15+ useEffect blocks) ---
  const [apiBase, setApiBase] = usePersistedState(STORAGE_KEY_BASE, DEFAULT_API_BASE)
  const [apiToken, setApiToken] = usePersistedState(STORAGE_KEY_TOKEN, '')
  const [promptExtra, setPromptExtra] = usePersistedState(STORAGE_KEY_PROMPT, '')
  const [size, setSize] = usePersistedState(STORAGE_KEY_SIZE, DEFAULT_SIZE)
  const [aspectRatio, setAspectRatio] = usePersistedState(STORAGE_KEY_ASPECT, loadAspectRatio())
  const [isSolidFabric, setIsSolidFabric] = usePersistedState(STORAGE_KEY_SOLID_FABRIC, false)
  const [use2kOutput, setUse2kOutput] = usePersistedState(STORAGE_KEY_USE_2K, false)
  const [workMode, setWorkMode] = usePersistedState(STORAGE_KEY_COLOR_CHANGE + '_mode', loadWorkMode())
  const [fabricVariant, setFabricVariant] = usePersistedState(STORAGE_KEY_STANDARD_VIEW + '_variant', loadFabricVariant(loadWorkMode()))
  const [colorCardCount, setColorCardCount] = usePersistedState(STORAGE_KEY_COLOR_CARD_COUNT, DEFAULT_COLOR_CARD_COUNT)
  const [protectNeutralAreas, setProtectNeutralAreas] = usePersistedState(STORAGE_KEY_COLOR_CHANGE_PROTECT_NEUTRALS, true)

  // Non-persisted state
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [selectedColor, setSelectedColor] = useState<string>('#FF6B6B')
  const [colorCardCountInput, setColorCardCountInput] = useState(() => String(loadColorCardCount()))

  useEffect(() => {
    const normalizedApiBase = apiBase.replace(/\/$/, '')
    const usesLocalT8Proxy =
      normalizedApiBase === DEV_PROXY_API_BASE ||
      /^https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/t8proxy$/.test(normalizedApiBase)
    if (normalizedApiBase === LEGACY_PRODUCTION_API_BASE || usesLocalT8Proxy) {
      setApiBase(PRODUCTION_API_BASE)
    }
  }, [apiBase, setApiBase])

  const colorChangeMode = workMode === 'colorChange'
  const wearMode = workMode === 'wear'
  const modelFlattenMode = workMode === 'modelFlatten'
  const patternExtractMode = workMode === 'patternExtract'
  const colorCardMode = workMode === 'colorCard'
  const inFabricMode = workMode === 'fabric'
  const standardFrontMode = inFabricMode && fabricVariant === 'standardFront'
  const standardBackMode = inFabricMode && fabricVariant === 'standardBack'
  const skirtOnlyMode = inFabricMode && fabricVariant === 'skirtOnly'
  const separatesMode = inFabricMode && fabricVariant === 'separates'
  const separatesDualMode = inFabricMode && fabricVariant === 'separatesDual'
  const fabricCloseupMode = inFabricMode && fabricVariant === 'fabricCloseup'

  const activeSizeOptions = use2kOutput ? SIZE_OPTIONS_2K : SIZE_OPTIONS

  // --- Fabric sources (replaces 5 pairs of duplicate setters/clearers) ---
  const fabric = useFabricSource()
  const fabricTop = useFabricSource()
  const fabricBottom = useFabricSource()
  const wearModeRef = useFabricSource()
  const modelFlattenRef = useFabricSource()
  const colorCardBack = useFabricSource()

  const [jobs, setJobs] = useState<Job[]>([])
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const addedSeqRef = useRef(0)
  const [isRunning, setIsRunning] = useState(false)
  const [targetDragOver, setTargetDragOver] = useState(false)
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>('fabric')

  const cancelRef = useRef(false)
  const runIdRef = useRef(0)
  const pasteTargetRef = useRef<PasteTarget>('fabric')
  const colorCardSourceFileRef = useRef<File | null>(null)
  const colorCardBackFileRef = useRef<File | null>(null)
  const abortControllersRef = useRef<Set<AbortController>>(new Set())
  const advancedDetailsRef = useRef<HTMLDetailsElement>(null)

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SKIRT_ONLY, fabricVariant === 'skirtOnly' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_SEPARATES_MODE, fabricVariant === 'separates' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_SEPARATES_DUAL_MODE, fabricVariant === 'separatesDual' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_FABRIC_CLOSEUP_MODE, fabricVariant === 'fabricCloseup' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_STANDARD_VIEW, fabricVariant === 'standardBack' ? 'back' : 'front')
  }, [fabricVariant])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLOR_CHANGE, workMode === 'colorChange' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_WEAR_MODE, workMode === 'wear' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_MODEL_FLATTEN_MODE, workMode === 'modelFlatten' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_PATTERN_EXTRACT_MODE, workMode === 'patternExtract' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_COLOR_CARD_MODE, workMode === 'colorCard' ? '1' : '0')
  }, [workMode])

  useEffect(() => {
    if (!COLOR_CHANGE_MODE_ENABLED && workMode === 'colorChange') {
      setWorkMode('fabric')
    }
  }, [workMode, setWorkMode])

  const selectWorkMode = useCallback((mode: WorkMode) => {
    setWorkMode(mode)
  }, [])

  useEffect(() => {
    pasteTargetRef.current = pasteTarget
  }, [pasteTarget])

  useEffect(() => {
    if (!imagePreview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imagePreview])

  const jobStats = useMemo(() => {
    let done = 0
    let running = 0
    let error = 0
    for (const j of jobs) {
      if (j.status === 'done') done++
      else if (j.status === 'running') running++
      else if (j.status === 'error') error++
    }
    return { done, running, error, total: jobs.length }
  }, [jobs])

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }, [])

  const buildColorCardJobs = useCallback((frontFile: File, count: number, backFile?: File | null): Job[] => {
    if (count <= 0) return []
    const frontPreviewObjectUrl = URL.createObjectURL(frontFile)
    const backPreviewObjectUrl = backFile ? URL.createObjectURL(backFile) : frontPreviewObjectUrl
    const jobsForFile: Job[] = []
    for (let number = 1; number <= count; number++) {
      for (const view of ['front', 'back'] as const) {
        const usesBackReference = view === 'back' && Boolean(backFile)
        jobsForFile.push({
          id: crypto.randomUUID(),
          file: usesBackReference ? backFile! : frontFile,
          previewObjectUrl: usesBackReference ? backPreviewObjectUrl : frontPreviewObjectUrl,
          status: 'queued',
          addedSeq: addedSeqRef.current++,
          colorCardNumber: number,
          colorCardView: view,
          colorCardUsesBackReference: usesBackReference,
          isBackView: view === 'back',
        })
      }
    }
    return jobsForFile
  }, [])

  const replaceColorCardJobs = useCallback(
    (frontFile: File, count: number, backFile: File | null = colorCardBackFileRef.current) => {
      colorCardSourceFileRef.current = frontFile
      colorCardBackFileRef.current = backFile
      const newJobs = buildColorCardJobs(frontFile, count, backFile)
      setJobs((prev) => {
        const revoked = new Set<string>()
        for (const j of prev) {
          if (j.previewObjectUrl && !revoked.has(j.previewObjectUrl)) {
            URL.revokeObjectURL(j.previewObjectUrl)
            revoked.add(j.previewObjectUrl)
          }
        }
        return newJobs
      })
      void checkTargetImage(frontFile).then(({ warnings }) => {
        if (warnings.length === 0) return
        setJobs((prev) => prev.map((job) => (job.colorCardView === 'front' ? { ...job, warnings } : job)))
      })
      if (backFile) {
        void checkTargetImage(backFile).then(({ warnings }) => {
          if (warnings.length === 0) return
          setJobs((prev) => prev.map((job) => (job.colorCardView === 'back' ? { ...job, warnings } : job)))
        })
      }
    },
    [buildColorCardJobs],
  )

  const setColorCardBackFromFile = useCallback(
    (file: File) => {
      if (!/^image\//.test(file.type)) return
      colorCardBack.setFromFile(file)
      const frontFile = colorCardSourceFileRef.current ?? jobs[0]?.file
      if (frontFile) replaceColorCardJobs(frontFile, colorCardCount, file)
      else colorCardBackFileRef.current = file
    },
    [colorCardCount, jobs, replaceColorCardJobs, colorCardBack],
  )

  const clearColorCardBackSource = useCallback(() => {
    colorCardBack.clear()
    colorCardBackFileRef.current = null
    const frontFile = colorCardSourceFileRef.current ?? jobs[0]?.file
    if (frontFile) replaceColorCardJobs(frontFile, colorCardCount, null)
  }, [colorCardCount, jobs, replaceColorCardJobs, colorCardBack])

  const updateColorCardCount = useCallback(
    (value: number, syncInput = true) => {
      const nextCount = clampColorCardCount(value)
      setColorCardCount(nextCount)
      if (syncInput) setColorCardCountInput(String(nextCount))
      if (!colorCardMode || isRunning) return
      const sourceFile = colorCardSourceFileRef.current ?? jobs[0]?.file
      if (sourceFile) replaceColorCardJobs(sourceFile, nextCount)
    },
    [colorCardMode, isRunning, jobs, replaceColorCardJobs, setColorCardCount],
  )

  const addTargetFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list).filter((f) => /^image\//.test(f.type))
      if (arr.length === 0) return
      if (colorCardMode) {
        replaceColorCardJobs(arr[0], colorCardCount)
        return
      }
      const newJobs: Job[] = arr.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewObjectUrl: URL.createObjectURL(file),
        status: 'queued' as const,
        addedSeq: addedSeqRef.current++,
        isStrictFraming: fabricCloseupMode ? true : undefined,
      }))
      setJobs((prev) => [...prev, ...newJobs])
      if (patternExtractMode || modelFlattenMode) return
      for (const job of newJobs) {
        void checkTargetImage(job.file).then(({ warnings }) => {
          updateJob(job.id, {
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        })
      }
    },
    [colorCardCount, colorCardMode, fabricCloseupMode, modelFlattenMode, patternExtractMode, replaceColorCardJobs, updateJob],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent | ClipboardEvent, target: PasteTarget) => {
      if (isRunning) return
      const dt = e.clipboardData
      if (!dt) return
      const files = getImageFilesFromDataTransfer(dt)
      if (files.length === 0) return
      e.preventDefault()
      if (target === 'colorCardBack') {
        setColorCardBackFromFile(files[0])
      } else if (target === 'fabricTop') {
        fabricTop.setFromFile(files[0])
      } else if (target === 'fabricBottom') {
        fabricBottom.setFromFile(files[0])
      } else if (target === 'fabric') {
        if (workMode === 'wear') wearModeRef.setFromFile(files[0])
        else if (workMode === 'modelFlatten') modelFlattenRef.setFromFile(files[0])
        else fabric.setFromFile(files[0])
      } else addTargetFiles(files)
    },
    [
      addTargetFiles,
      fabric,
      fabricBottom,
      fabricTop,
      isRunning,
      setColorCardBackFromFile,
      wearMode,
      wearModeRef,
      modelFlattenRef,
    ],
  )

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (isRunning || isEditableElement(document.activeElement)) return
      if ((e.target as Element | null)?.closest?.('.paste-zone')) return
      handlePaste(e, pasteTargetRef.current)
    }
    window.addEventListener('paste', onWindowPaste)
    return () => window.removeEventListener('paste', onWindowPaste)
  }, [handlePaste, isRunning])

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => {
      const j = prev.find((x) => x.id === id)
      const next = prev.filter((x) => x.id !== id)
      if (j?.previewObjectUrl && !next.some((x) => x.previewObjectUrl === j.previewObjectUrl)) {
        URL.revokeObjectURL(j.previewObjectUrl)
      }
      return next
    })
  }, [])

  const clearJobs = useCallback(() => {
    colorCardSourceFileRef.current = null
    setJobs((prev) => {
      const revoked = new Set<string>()
      for (const j of prev) {
        if (j.previewObjectUrl && !revoked.has(j.previewObjectUrl)) {
          URL.revokeObjectURL(j.previewObjectUrl)
          revoked.add(j.previewObjectUrl)
        }
      }
      return []
    })
  }, [])

  const stopRun = useCallback(() => {
    cancelRef.current = true
    runIdRef.current += 1
    for (const ac of abortControllersRef.current) {
      ac.abort()
    }
    abortControllersRef.current.clear()
    setJobs((prev) => prev.map((job) => (job.status === 'running' ? { ...job, status: 'queued' } : job)))
    setIsRunning(false)
  }, [])

  const encodeImage = useCallback(async (file: File) => readFileAsDataURL(file), [])

  const runBatch = useCallback(async () => {
    const token = apiToken.trim()
    if (!token) {
      alert('请先填写 API 密钥（在左侧「连接设置」里）。')
      return
    }
    const base = apiBase.trim()
    if (!base) {
      alert('请填写接口地址。')
      return
    }
    if (!patternExtractMode && !modelFlattenMode && !colorChangeMode && !wearMode && !colorCardMode && separatesDualMode && (!fabricTop.source || !fabricBottom.source)) {
      alert('请先上传「上衣参考图」和「下装参考图」')
      return
    }
    if (!patternExtractMode && !modelFlattenMode && !colorChangeMode && !wearMode && !separatesDualMode && !fabric.source) {
      alert(colorCardMode ? '请先上传「编号色卡图」' : fabricCloseupMode ? '请先上传「新布料图」' : '请先上传「布料图」或「商品图」')
      return
    }
    if (wearMode && !wearModeRef.source) {
      alert('请先上传「模特参考图」')
      return
    }
    if (modelFlattenMode && !modelFlattenRef.source) {
      alert('请先上传「平铺参考图」')
      return
    }
    if (jobs.length === 0) {
      alert(colorCardMode ? '请上传一张「正面模特参考图」' : wearMode ? '请至少上传一张「商品图」' : modelFlattenMode ? '请至少上传一张「模特图」' : patternExtractMode ? '请至少上传一张「花色来源图」' : fabricCloseupMode ? '请至少上传一张「局部布样模板」' : '请至少上传一张「要换的图」')
      return
    }

    const queue = jobs.filter((j) => j.status !== 'running')
    if (queue.length === 0) {
      alert('当前没有可执行的任务。')
      return
    }

    cancelRef.current = false
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setIsRunning(true)

    // useEditsApi is always true — always use the edit variants
    const fullPrompt = [
      colorCardMode
        ? ''
        : modelFlattenMode
          ? PROMPT_MODEL_FLATTEN_WITH_REF_EDIT
          : patternExtractMode
            ? PROMPT_PATTERN_EXTRACT
          : colorChangeMode
            ? buildColorChangePrompt(true, selectedColor)
            : wearMode
              ? PROMPT_WEAR_MODE_EDIT
              : separatesDualMode
                ? PROMPT_SEPARATES_DUAL_MODE_EDIT
                : fabricCloseupMode
                  ? PROMPT_FABRIC_CLOSEUP_MODE_EDIT
                  : skirtOnlyMode
                    ? PROMPT_SKIRT_ONLY_EDIT
                    : separatesMode
                      ? PROMPT_SEPARATES_MODE
                      : buildFabricTransferPromptForEdits(queue.length > 1),
      !patternExtractMode && !modelFlattenMode && !colorChangeMode && !separatesDualMode && !fabricCloseupMode && isSolidFabric ? PROMPT_SOLID_FABRIC_EDIT : '',
      promptExtra.trim(),
    ]
      .filter(Boolean)
      .join('\n\n')

    let labeledFabricTopFile: File | undefined
    let labeledFabricBottomFile: File | undefined

    if (separatesDualMode && fabricTop.source && fabricBottom.source) {
      try {
        labeledFabricTopFile = await createLabeledReferenceFile(fabricTop.source.file, 'top')
        labeledFabricBottomFile = await createLabeledReferenceFile(fabricBottom.source.file, 'bottom')
      } catch (e) {
        setIsRunning(false)
        alert(e instanceof Error ? e.message : String(e))
        return
      }
    }

    const runOne = async (job: Job) => {
      if (cancelRef.current || runIdRef.current !== runId) return
      updateJob(job.id, {
        status: 'running',
        error: undefined,
        resultDataUrl: undefined,
        completedAt: undefined,
      })
      const ac = new AbortController()
      abortControllersRef.current.add(ac)
      try {
        let jobAspect = aspectRatio
        let jobSize = sizeForAspect(jobAspect, use2kOutput ? DEFAULT_SIZE_2K : size, use2kOutput)
        if (patternExtractMode) {
          jobAspect = '1:1'
          jobSize = sizeForAspect(jobAspect, use2kOutput ? DEFAULT_SIZE_2K : size, use2kOutput)
        } else if (modelFlattenMode && modelFlattenRef.source) {
          const { width, height } = await getImageDimensions(modelFlattenRef.source.file)
          jobAspect = closestAspectLabel(width, height)
          jobSize = sizeForAspect(jobAspect, use2kOutput ? DEFAULT_SIZE_2K : size, use2kOutput)
        } else if (fabricCloseupMode) {
          // followTargetAspect was always false; only fabricCloseupMode remains
          const { width, height } = await getImageDimensions(job.file)
          jobAspect = closestAspectLabel(width, height)
          jobSize = sizeForAspect(jobAspect, use2kOutput ? DEFAULT_SIZE_2K : size, use2kOutput)
        }

        const jobPromptSuffix = buildPerJobPromptSuffix({
          warnings: job.warnings ?? [],
          isFrontView: !patternExtractMode && !modelFlattenMode && !fabricCloseupMode && standardFrontMode,
          isBackView: patternExtractMode || modelFlattenMode || fabricCloseupMode ? false : colorCardMode ? false : standardBackMode || (!standardFrontMode && job.isBackView === true),
          isStrictFraming: !patternExtractMode && !modelFlattenMode && (fabricCloseupMode || job.isStrictFraming === true),
          forEdits: true,
        })
        const colorCardPrompt =
          colorCardMode && job.colorCardNumber
            ? buildColorCardPromptForEdits(
                job.colorCardNumber,
                job.colorCardView ?? 'front',
                job.colorCardUsesBackReference === true,
              )
            : ''
        const prompt = [
          colorCardPrompt || fullPrompt,
          inFabricMode ? jobPromptSuffix : '',
          colorCardMode ? promptExtra.trim() : '',
        ]
          .filter(Boolean)
          .join('\n\n')

        // useEditsApi is always true
        const result = await postImagesEdits(
          base,
          token,
          {
            model: model.trim() || DEFAULT_MODEL,
            prompt,
            size: jobSize,
            images: colorChangeMode
              ? [job.file]
              : patternExtractMode
                ? [job.file]
              : modelFlattenMode
                ? [modelFlattenRef.source!.file, job.file]
                : colorCardMode
                  ? [job.file, fabric.source!.file]
                  : separatesDualMode
                    ? [job.file, labeledFabricTopFile ?? fabricTop.source!.file, labeledFabricBottomFile ?? fabricBottom.source!.file]
                    : wearMode
                      ? [wearModeRef.source!.file, job.file]
                      : [job.file, fabric.source!.file],
          },
          ac.signal,
        )
        let imageDataUrl = result.imageDataUrl

        if (colorChangeMode && protectNeutralAreas) {
          imageDataUrl = await restoreProtectedLightNeutrals(job.file, imageDataUrl)
        }
        imageDataUrl = await ensureOutputAspect(imageDataUrl, jobAspect)
        if (cancelRef.current || runIdRef.current !== runId) return

        updateJob(job.id, {
          status: 'done',
          resultDataUrl: imageDataUrl,
          completedAt: Date.now(),
        })
      } catch (e) {
        if (cancelRef.current || runIdRef.current !== runId || (e instanceof DOMException && e.name === 'AbortError')) {
          return
        }
        const msg = e instanceof Error ? e.message : String(e)
        updateJob(job.id, { status: 'error', error: msg })
      } finally {
        abortControllersRef.current.delete(ac)
      }
    }

    const n = Math.min(MAX_BATCH_CONCURRENCY, Math.max(1, queue.length))
    let cursor = 0

    const worker = async () => {
      for (;;) {
        if (cancelRef.current || runIdRef.current !== runId) return
        const my = cursor++
        if (my >= queue.length) return
        await runOne(queue[my])
      }
    }

    await Promise.all(Array.from({ length: n }, () => worker()))

    if (runIdRef.current === runId) {
      setIsRunning(false)
    }
  }, [
    apiBase,
    apiToken,
    aspectRatio,
    colorChangeMode,
    colorCardCount,
    colorCardMode,
    encodeImage,
    fabric,
    fabricBottom,
    fabricCloseupMode,
    fabricTop,
    inFabricMode,
    isSolidFabric,
    jobs,
    model,
    modelFlattenMode,
    modelFlattenRef,
    patternExtractMode,
    promptExtra,
    protectNeutralAreas,
    separatesDualMode,
    separatesMode,
    selectedColor,
    size,
    skirtOnlyMode,
    standardBackMode,
    standardFrontMode,
    updateJob,
    use2kOutput,
    wearMode,
    wearModeRef,
  ])

  const displayJobs = useMemo(() => {
    const rank = (s: JobStatus) => (s === 'done' ? 0 : s === 'running' ? 1 : s === 'queued' ? 2 : 3)
    return [...jobs].sort((a, b) => {
      if (colorCardMode) {
        const an = a.colorCardNumber ?? Number.MAX_SAFE_INTEGER
        const bn = b.colorCardNumber ?? Number.MAX_SAFE_INTEGER
        if (an !== bn) return an - bn
        const av = a.colorCardView === 'back' ? 1 : 0
        const bv = b.colorCardView === 'back' ? 1 : 0
        if (av !== bv) return av - bv
        return a.addedSeq - b.addedSeq
      }
      const ra = rank(a.status)
      const rb = rank(b.status)
      if (ra !== rb) return ra - rb
      if (a.status === 'done' && b.status === 'done') {
        return (a.completedAt ?? 0) - (b.completedAt ?? 0)
      }
      return a.addedSeq - b.addedSeq
    })
  }, [colorCardMode, jobs])

  const canStart = useMemo(() => {
    const tokenOk = apiToken.trim().length > 0
    const hasJobs = jobs.length > 0
    if (patternExtractMode || colorChangeMode) return hasJobs && tokenOk
    if (modelFlattenMode) return modelFlattenRef.source !== null && hasJobs && tokenOk
    if (colorCardMode) return fabric.source !== null && hasJobs && tokenOk
    if (wearMode) return wearModeRef.source !== null && hasJobs && tokenOk
    if (separatesDualMode) return fabricTop.source !== null && fabricBottom.source !== null && hasJobs && tokenOk
    return fabric.source !== null && hasJobs && tokenOk
  }, [apiToken, jobs.length, patternExtractMode, modelFlattenMode, colorChangeMode, colorCardMode, wearMode, separatesDualMode, fabric.source, wearModeRef.source, modelFlattenRef.source, fabricTop.source, fabricBottom.source])

  const openImagePreview = (src: string, label: string) => {
    setImagePreview({ src, label })
  }

  const jobDisplayName = (job: Job) => {
    if (job.colorCardNumber) {
      const viewLabel = job.colorCardView === 'back' ? '背面' : '正面'
      return `色卡 ${job.colorCardNumber} · ${viewLabel}`
    }
    return job.file.name
  }

  const jobResultLabel = (job: Job) => {
    if (job.colorCardNumber) {
      const viewLabel = job.colorCardView === 'back' ? '背面图' : '正面图'
      return `色卡 ${job.colorCardNumber} ${viewLabel}`
    }
    if (patternExtractMode) return '无缝印花'
    if (modelFlattenMode) return '平铺商品'
    return '换布后'
  }

  const jobDownloadStem = (job: Job) => {
    if (job.colorCardNumber) {
      const number = String(job.colorCardNumber).padStart(2, '0')
      const view = job.colorCardView === 'back' ? '背面' : '正面'
      return `色卡${number}_${view}`
    }
    return `${safeBaseName(job.file.name.replace(/\.[^.]+$/, ''))}_${patternExtractMode ? '无缝印花' : modelFlattenMode ? '平铺商品' : '换布结果'}`
  }

  const jobReferenceLabel = (job: Job) => {
    if (patternExtractMode) return '来源图'
    if (modelFlattenMode) return '模特图'
    if (!job.colorCardNumber) return '目标图'
    if (job.colorCardView === 'back' && job.colorCardUsesBackReference) return '背面参考'
    return '正面参考'
  }

  const downloadOne = (job: Job) => {
    if (!job.resultDataUrl) return
    const a = document.createElement('a')
    a.href = job.resultDataUrl
    const ext = job.resultDataUrl.startsWith('data:image/png') ? 'png' : extensionFromMime(job.file)
    a.download = `${jobDownloadStem(job)}.${ext}`
    a.click()
  }

  const downloadZip = async () => {
    const done = jobs.filter((j) => j.status === 'done' && j.resultDataUrl)
    if (done.length === 0) {
      alert('还没有生成完成的图片。')
      return
    }
    const zip = new JSZip()
    for (const job of done) {
      const res = await fetch(job.resultDataUrl!)
      const blob = await res.blob()
      zip.file(`${jobDownloadStem(job)}.png`, blob)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    saveAs(out, `${colorCardMode ? '色卡结果' : patternExtractMode ? '无缝印花结果' : modelFlattenMode ? '平铺商品结果' : '换布结果'}-${new Date().toISOString().slice(0, 10)}.zip`)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>服装布料换花</h1>
        <p className="app-tagline">生成一组上架图：让人看出是同一套衣服，只是在不同时间、不同姿势下拍的</p>
      </header>

      <section className="app-toolbar" aria-label="连接设置">
        <div className="toolbar-token">
          <label htmlFor="token" className="toolbar-label">
            API 密钥
          </label>
          <input
            id="token"
            className="toolbar-input"
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="粘贴你的 sk- 密钥"
            autoComplete="off"
          />
          <span className="toolbar-hint">只保存在本机浏览器</span>
        </div>

        <div className="toolbar-aspect field">
          <label htmlFor="aspect">画幅比例</label>
          <select
            id="aspect"
            value={aspectRatio}
            onChange={(e) => {
              const nextAspect = e.target.value
              setAspectRatio(nextAspect)
              setSize(sizeForAspect(nextAspect, use2kOutput ? DEFAULT_SIZE_2K : DEFAULT_SIZE, use2kOutput))
            }}
          >
            {ASPECT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-size field">
          <label htmlFor="size">分辨率{use2kOutput ? ' · 2K' : ''}</label>
          <select
            id="size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            {activeSizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <details ref={advancedDetailsRef} className="settings-advanced toolbar-advanced">
          <summary>高级选项</summary>
          <div className="settings-advanced-body toolbar-advanced-body">
            <div className="toolbar-advanced-grid">
              <div className="field">
                <label htmlFor="base">接口地址</label>
                <input
                  id="base"
                  type="url"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder={PRODUCTION_API_BASE}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="model">模型</label>
                <input
                  id="model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-image-2"
                />
              </div>
              <div className="field field-span2 field-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={use2kOutput}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setUse2kOutput(checked)
                      setSize(sizeForAspect(aspectRatio, checked ? DEFAULT_SIZE_2K : DEFAULT_SIZE, checked))
                    }}
                  />
                  2K 高清输出（更慢、费用更高；若网关不支持会报错）
                </label>
              </div>
              <div className="field field-span2">
                <label htmlFor="extra">补充要求（可选）</label>
                <textarea
                  id="extra"
                  value={promptExtra}
                  onChange={(e) => setPromptExtra(e.target.value)}
                  placeholder="例如：棕褐色叶子印花、白底，颜色与布料图完全一致；不要牛仔拼布。"
                  rows={2}
                />
              </div>
            </div>
            <p className="field-hint">当前中转站接口地址为 https://ai.t8star.org。</p>
            <div className="settings-advanced-footer">
              <button
                type="button"
                className="btn btn-ghost settings-advanced-collapse"
                onClick={() => {
                  if (advancedDetailsRef.current) advancedDetailsRef.current.open = false
                }}
              >
                收起
              </button>
            </div>
          </div>
        </details>
      </section>

      <section className="mode-panel" aria-label="工作模式">
        <div className="mode-panel-section">
          <span className="mode-panel-label">工作模式</span>
          <div className="segment-group" role="radiogroup" aria-label="工作模式">
            {VISIBLE_WORK_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={workMode === opt.id}
                className={`segment-btn${workMode === opt.id ? ' selected' : ''}`}
                disabled={isRunning}
                onClick={() => selectWorkMode(opt.id)}
              >
                <span className="segment-btn-label">{opt.label}</span>
                <span className="segment-btn-hint">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {workMode === 'fabric' && (
          <div className="mode-panel-section mode-panel-sub">
            <span className="mode-panel-label">换布变体</span>
            <div className="segment-group" role="radiogroup" aria-label="换布变体">
              {FABRIC_VARIANT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={fabricVariant === opt.id}
                  className={`segment-btn segment-btn-compact${fabricVariant === opt.id ? ' selected' : ''}`}
                  disabled={isRunning}
                  onClick={() => setFabricVariant(opt.id)}
                >
                  <span className="segment-btn-label">{opt.label}</span>
                  <span className="segment-btn-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {workMode === 'fabric' && skirtOnlyMode && (
          <div className="mode-panel-note" style={{ marginTop: 12, padding: '10px 12px', background: '#fff7e6', border: '1px solid #ffe58f', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#b45309', lineHeight: 1.5 }}>
              <strong> 裙子模式提示：</strong>
              为了获得最佳效果，请上传<strong>仅包含裙子布料</strong>的图片（如裙子平铺图、布料色卡），避免上传完整连衣裙。
              这样 AI 能更准确地识别并只替换下装部分，保持上衣不变。
            </p>
          </div>
        )}

        {workMode === 'fabric' && separatesDualMode && (
          <div className="mode-panel-note" style={{ marginTop: 12, padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8', lineHeight: 1.5 }}>
              <strong> 双参考提示：</strong>
              上衣和下装参考图只提供颜色、花色、图案、纹理，不提供版型。目标图原本是圆领就保持圆领，原本是裙子就保持裙子。
            </p>
          </div>
        )}

        {workMode === 'fabric' && fabricCloseupMode && (
          <div className="mode-panel-note" style={{ marginTop: 12, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
              <strong> 局部布样提示：</strong>
              适合旋转、褶皱、满框布料特写。第 2 步只作为布面构图模板，会自动锁定原裁切和原比例，严禁补成完整衣服或模特图。
            </p>
          </div>
        )}

        {modelFlattenMode && (
          <div className="mode-panel-note" style={{ marginTop: 12, padding: '10px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#5b21b6', lineHeight: 1.5 }}>
              <strong> 展平提示：</strong>
              先上传平铺商品参考图（如俯拍 flat lay 摆拍），再上传模特穿着衣服的照片；生成时会参考参考图的平铺风格、背景和搭配方式，把模特身上的衣服转为同款平铺商品图。
            </p>
          </div>
        )}

        {patternExtractMode && (
          <div className="mode-panel-note" style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
              <strong> 提花色提示：</strong>
              从成衣照片里提取可用于真实面料的自然花色，输出 1:1 方形无缝循环印花；图案应像真实布料花型一样自然衔接，不是生硬裁切原图。
            </p>
          </div>
        )}

        {colorChangeMode && (
          <div className="mode-panel-section mode-panel-sub mode-panel-color">
            <span className="mode-panel-label">目标颜色</span>
            <div className="color-swatch-grid">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  className={`color-swatch${selectedColor === color.hex ? ' selected' : ''}`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                  disabled={isRunning}
                  onClick={() => setSelectedColor(color.hex)}
                />
              ))}
            </div>
            <div className="color-custom-input">
              <label>
                自定义
                <input
                  type="color"
                  value={selectedColor}
                  disabled={isRunning}
                  onChange={(e) => setSelectedColor(e.target.value)}
                />
                <span className="color-hex-display">{selectedColor}</span>
              </label>
            </div>
            <label className="job-back-toggle fabric-solid-toggle">
              <input
                type="checkbox"
                checked={protectNeutralAreas}
                disabled={isRunning}
                onChange={(e) => setProtectNeutralAreas(e.target.checked)}
              />
              保护白底/浅色留白（防止被目标色染色）
            </label>
          </div>
        )}

        {colorCardMode && (
          <div className="mode-panel-note" style={{ marginTop: 12, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
              <strong> 色卡提示：</strong>
              建议只上传一张正面模特参考图，不上传背面参考图；各色号换色时颜色还原更稳定。背面将由模型根据正面自动生成。
            </p>
          </div>
        )}

        {colorCardMode && (
          <div className="mode-panel-section mode-panel-sub mode-panel-color-card">
            <span className="mode-panel-label">色号数量</span>
            <label className="color-card-count-field">
              <input
                type="number"
                min={MIN_COLOR_CARD_COUNT}
                max={MAX_COLOR_CARD_COUNT}
                step={1}
                value={colorCardCountInput}
                disabled={isRunning}
                onChange={(e) => {
                  const nextValue = e.currentTarget.value
                  setColorCardCountInput(nextValue)
                  if (nextValue.trim() === '') return
                  updateColorCardCount(Number(nextValue), false)
                }}
                onBlur={() => setColorCardCountInput(String(colorCardCount))}
              />
              <span>
                {colorCardCount > 0
                  ? `自动生成 1-${colorCardCount} 号，每个色号正面和背面各 1 张`
                  : '当前不展开色号任务'}
              </span>
            </label>
          </div>
        )}
      </section>

      <main className="app-main">
        <div className={`upload-steps-row${colorCardMode || separatesDualMode ? ' compact-upload-row' : ''}`}>
          {!patternExtractMode && !modelFlattenMode && !colorChangeMode && !wearMode && !separatesDualMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${fabric.source ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('fabric')}
            onMouseDown={() => setPasteTarget('fabric')}
            onPaste={(e) => handlePaste(e, 'fabric')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 1 步</span>
              <h2>{colorCardMode ? '上传「编号色卡图」' : fabricCloseupMode ? '上传「新布料图」' : '上传「布料图」'}</h2>
            </div>
            {colorCardMode ? (
              <p className="step-desc">
                上传带编号的格子色卡。生成时会自动读取每个编号对应的格子配色。
              </p>
            ) : fabricCloseupMode ? (
              <p className="step-desc">
                提供要替换进去的颜色、花纹、格纹比例和布料肌理；不取这张图里的衣服版型。
              </p>
            ) : (
              <label className="job-back-toggle fabric-solid-toggle">
                <input
                  type="checkbox"
                  checked={isSolidFabric}
                  disabled={isRunning}
                  onChange={(e) => setIsSolidFabric(e.target.checked)}
                />
                纯色布料（无印花，按颜色 + 肌理替换）
              </label>
            )}

            <div className="upload-card">
              <div className={`preview-box${fabric.source ? '' : ' empty'}`}>
                {fabric.source ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(fabric.source!.previewObjectUrl, colorCardMode ? '编号色卡图' : fabricCloseupMode ? '新布料图' : '布料图')}
                  >
                    <img src={fabric.source!.previewObjectUrl} alt={colorCardMode ? '编号色卡图预览' : fabricCloseupMode ? '新布料图预览' : '布料图预览'} />
                  </button>
                ) : (
                  <span className="preview-placeholder">点击右侧按钮或粘贴图片</span>
                )}
              </div>
              <div className="upload-card-actions">
                <label className="btn btn-secondary">
                  选择图片
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isRunning}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) fabric.setFromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isRunning || !fabric.source}
                  onClick={fabric.clear}
                >
                  重新选择
                </button>
                <p className="upload-tip">
                  先点一下本区域，再按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>V</kbd> 可粘贴截图
                </p>
              </div>
            </div>
          </section>
          )}

          {workMode === 'fabric' && separatesDualMode && (
          <>
            <section
              className={`step-card step-card-upload paste-zone${pasteTarget === 'fabricTop' ? ' paste-zone-active' : ''}${fabricTop.source ? ' step-card-done' : ''}`}
              tabIndex={0}
              onFocus={() => setPasteTarget('fabricTop')}
              onMouseDown={() => setPasteTarget('fabricTop')}
              onPaste={(e) => handlePaste(e, 'fabricTop')}
            >
              <div className="step-card-head">
                <span className="step-badge">第 1 步</span>
                <h2>上传「上衣参考图」</h2>
              </div>
              <p className="step-desc">
                只取上衣的颜色、花色、图案、纹理；不取领型、袖型、衣长、开襟或宽松度。
              </p>

              <div className="upload-card">
                <div className={`preview-box${fabricTop.source ? '' : ' empty'}`}>
                  {fabricTop.source ? (
                    <button
                      type="button"
                      className="preview-image-btn"
                      title="点击查看大图"
                      onClick={() => openImagePreview(fabricTop.source!.previewObjectUrl, '上衣参考图')}
                    >
                      <img src={fabricTop.source!.previewObjectUrl} alt="上衣参考图预览" />
                    </button>
                  ) : (
                    <span className="preview-placeholder">点击右侧按钮或粘贴图片</span>
                  )}
                </div>
                <div className="upload-card-actions">
                  <label className="btn btn-secondary">
                    选择上衣图
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isRunning}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) fabricTop.setFromFile(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isRunning || !fabricTop.source}
                    onClick={fabricTop.clear}
                  >
                    重新选择
                  </button>
                  <p className="upload-tip">
                    先点一下本区域，再按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>V</kbd> 可粘贴截图
                  </p>
                </div>
              </div>
            </section>

            <section
              className={`step-card step-card-upload paste-zone${pasteTarget === 'fabricBottom' ? ' paste-zone-active' : ''}${fabricBottom.source ? ' step-card-done' : ''}`}
              tabIndex={0}
              onFocus={() => setPasteTarget('fabricBottom')}
              onMouseDown={() => setPasteTarget('fabricBottom')}
              onPaste={(e) => handlePaste(e, 'fabricBottom')}
            >
              <div className="step-card-head">
                <span className="step-badge">第 2 步</span>
                <h2>上传「下装参考图」</h2>
              </div>
              <p className="step-desc">
                只取下装的颜色、花色、图案、纹理；不取裤型、裙型、长短、腰线或廓形。
              </p>

              <div className="upload-card">
                <div className={`preview-box${fabricBottom.source ? '' : ' empty'}`}>
                  {fabricBottom.source ? (
                    <button
                      type="button"
                      className="preview-image-btn"
                      title="点击查看大图"
                      onClick={() => openImagePreview(fabricBottom.source!.previewObjectUrl, '下装参考图')}
                    >
                      <img src={fabricBottom.source!.previewObjectUrl} alt="下装参考图预览" />
                    </button>
                  ) : (
                    <span className="preview-placeholder">点击右侧按钮或粘贴图片</span>
                  )}
                </div>
                <div className="upload-card-actions">
                  <label className="btn btn-secondary">
                    选择下装图
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isRunning}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) fabricBottom.setFromFile(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isRunning || !fabricBottom.source}
                    onClick={fabricBottom.clear}
                  >
                    重新选择
                  </button>
                  <p className="upload-tip">
                    先点一下本区域，再按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>V</kbd> 可粘贴截图
                  </p>
                </div>
              </div>
            </section>
          </>
          )}

          {modelFlattenMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${modelFlattenRef.source ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('fabric')}
            onMouseDown={() => setPasteTarget('fabric')}
            onPaste={(e) => handlePaste(e, 'fabric')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 1 步</span>
              <h2>上传「平铺参考图」</h2>
            </div>
            <p className="step-desc">
              上传期望的平铺商品参考图（俯拍 flat lay，如整套衣服平铺在木地板/背景上），生成时会参考其俯拍角度、背景、搭配摆放和整体构图。
            </p>

            <div className="upload-card">
              <div className={`preview-box${modelFlattenRef.source ? '' : ' empty'}`}>
                {modelFlattenRef.source ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(modelFlattenRef.source!.previewObjectUrl, '平铺参考图')}
                  >
                    <img src={modelFlattenRef.source!.previewObjectUrl} alt="平铺参考图预览" />
                  </button>
                ) : (
                  <span className="preview-placeholder">点击右侧按钮或粘贴图片</span>
                )}
              </div>
              <div className="upload-card-actions">
                <label className="btn btn-secondary">
                  选择图片
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isRunning}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) modelFlattenRef.setFromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isRunning || !modelFlattenRef.source}
                  onClick={modelFlattenRef.clear}
                >
                  重新选择
                </button>
                <p className="upload-tip">
                  先点一下本区域，再按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>V</kbd> 可粘贴截图
                </p>
              </div>
            </div>
          </section>
          )}

          {wearMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${wearModeRef.source ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('fabric')}
            onMouseDown={() => setPasteTarget('fabric')}
            onPaste={(e) => handlePaste(e, 'fabric')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 1 步</span>
              <h2>上传「模特参考图」</h2>
            </div>
            <p className="step-desc">
              只参考模特的姿势、场景、配饰、背景和构图；不参考模特图里原衣服的版型、颜色或花色。
            </p>

            <div className="upload-card">
              <div className={`preview-box${wearModeRef.source ? '' : ' empty'}`}>
                {wearModeRef.source ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(wearModeRef.source!.previewObjectUrl, '模特参考图')}
                  >
                    <img src={wearModeRef.source!.previewObjectUrl} alt="模特参考图预览" />
                  </button>
                ) : (
                  <span className="preview-placeholder">点击右侧按钮或粘贴图片</span>
                )}
              </div>
              <div className="upload-card-actions">
                <label className="btn btn-secondary">
                  选择图片
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isRunning}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) wearModeRef.setFromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isRunning || !wearModeRef.source}
                  onClick={wearModeRef.clear}
                >
                  重新选择
                </button>
                <p className="upload-tip">
                  先点一下本区域，再按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>V</kbd> 可粘贴截图
                </p>
              </div>
            </div>
          </section>
          )}

          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'target' ? ' paste-zone-active' : ''}${jobs.length > 0 ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('target')}
            onMouseDown={() => setPasteTarget('target')}
            onPaste={(e) => handlePaste(e, 'target')}
          >
            <div className="step-card-head">
              <span className="step-badge">{colorChangeMode || patternExtractMode ? '最后一步' : modelFlattenMode || wearMode ? '第 2 步' : separatesDualMode ? '第 3 步' : '第 2 步'}</span>
              <h2>{colorCardMode ? '上传「正面模特参考图」' : wearMode ? '上传「商品图」' : modelFlattenMode ? '上传「模特图」' : patternExtractMode ? '上传「花色来源图」' : fabricCloseupMode ? '上传「局部布样模板」' : '上传「要换的图」'}</h2>
            </div>
            <p className="step-desc">
              {colorCardMode ? (
                <>
                  必传。按当前色号数量生成正面任务，并配套背面任务。
                </>
              ) : wearMode ? (
                <>
                  请传<strong>平铺/挂拍商品图</strong>（要严格保留的衣服），会保留商品的版型、颜色、花色、图案和细节。
                </>
              ) : modelFlattenMode ? (
                <>
                  请传<strong>模特穿着衣服的照片</strong>。系统会参考第 1 步的平铺参考图，把模特身上的衣服转为同款俯拍平铺商品图，保留款式花色和搭配，去除模特身体。
                </>
              ) : patternExtractMode ? (
                <>
                  请传<strong>带花色的成衣或布料照片</strong>。系统会提取图案、颜色和重复关系，生成可上下左右平铺的方形无缝印花。
                </>
              ) : fabricCloseupMode ? (
                <>
                  请传<strong>布料局部特写</strong>（旋转/褶皱/满框布样）。系统会保留这张图的裁切、角度、褶皱和光影，只换表面花色。
                </>
              ) : (
                <>
                  请传<strong>完整商品图</strong>（平铺/模特/挂拍），勿传布样特写。可多张上传；标准模式请先选正面或背面；其他变体若是<strong>背面图</strong>请在卡片上勾选；局部图等风险会自动提示。
                </>
              )}
            </p>

            <div
              className={`dropzone${targetDragOver ? ' drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setTargetDragOver(true)
              }}
              onDragLeave={() => setTargetDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setTargetDragOver(false)
                if (e.dataTransfer.files?.length) addTargetFiles(e.dataTransfer.files)
              }}
            >
              <p className="dropzone-title">拖入图片，或点击选择</p>
              <p className="dropzone-sub">{colorCardMode ? '只取第一张 · 粘贴前请先点一下本区域' : '支持多选 · 粘贴前请先点一下本区域'}</p>
              <label className="btn btn-secondary dropzone-btn">
                {colorCardMode ? '选择正面图' : modelFlattenMode ? '选择模特图' : patternExtractMode ? '选择来源图' : fabricCloseupMode ? '选择局部图' : '选择多张图片'}
                <input
                  type="file"
                  accept="image/*"
                  multiple={!colorCardMode}
                  disabled={isRunning}
                  onChange={(e) => {
                    if (e.target.files?.length) addTargetFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>

            {jobs.length > 0 ? (
              <p className="target-count">
                {colorCardMode
                  ? `已展开 ${jobs.length} 个生成任务（${colorCardCount} 个色号 × 正背面；${colorCardBack.source ? '背面使用参考图' : '背面由模型生成'}）`
                  : modelFlattenMode
                    ? `已添加 ${jobs.length} 张模特图`
                  : patternExtractMode
                    ? `已添加 ${jobs.length} 张花色来源图`
                  : `已添加 ${jobs.length} 张`}
              </p>
            ) : null}
          </section>

          {colorCardMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'colorCardBack' ? ' paste-zone-active' : ''}${colorCardBack.source ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('colorCardBack')}
            onMouseDown={() => setPasteTarget('colorCardBack')}
            onPaste={(e) => handlePaste(e, 'colorCardBack')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 3 步</span>
              <h2>上传「背面模特参考图」</h2>
            </div>
            <p className="step-desc">
              可选。上传后按背面图换色；不上传则由模型生成背面。
            </p>

            <div className="upload-card">
              <div className={`preview-box${colorCardBack.source ? '' : ' empty'}`}>
                {colorCardBack.source ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(colorCardBack.source!.previewObjectUrl, '背面模特参考图')}
                  >
                    <img src={colorCardBack.source!.previewObjectUrl} alt="背面模特参考图预览" />
                  </button>
                ) : (
                  <span className="preview-placeholder">可不上传，背面将由模型生成</span>
                )}
              </div>
              <div className="upload-card-actions">
                <label className="btn btn-secondary">
                  选择背面图
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isRunning}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) setColorCardBackFromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isRunning || !colorCardBack.source}
                  onClick={clearColorCardBackSource}
                >
                  不使用背面图
                </button>
                <p className="upload-tip">
                  先点一下本区域，再按 <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>V</kbd> 可粘贴截图
                </p>
              </div>
            </div>
          </section>
          )}
        </div>

        <section className="step-card step-card-action">
            <div className="step-card-head">
              <span className="step-badge step-badge-accent">{colorCardMode || separatesDualMode ? '第 4 步' : colorChangeMode || patternExtractMode ? '第 2 步' : modelFlattenMode || wearMode ? '第 3 步' : '第 3 步'}</span>
              <h2>{colorCardMode ? '按色卡批量生成正面和背面' : modelFlattenMode ? '生成平铺商品图' : patternExtractMode ? '生成无缝印花图' : '生成同一套衣服的多张图'}</h2>
            </div>

            <div className="action-row">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={isRunning || !canStart}
                onClick={() => void runBatch()}
              >
                {isRunning ? '正在生成…' : '开始生成'}
              </button>
              {isRunning ? (
                <button type="button" className="btn btn-ghost" onClick={stopRun}>
                  停止
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isRunning || jobStats.done === 0}
                onClick={() => void downloadZip()}
              >
                打包下载（{jobStats.done}）
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={isRunning || jobs.length === 0}
                onClick={clearJobs}
              >
                {colorCardMode ? '清空全部色卡任务' : modelFlattenMode ? '清空全部模特图' : patternExtractMode ? '清空全部来源图' : '清空全部目标图'}
              </button>
            </div>

            {!canStart && !isRunning ? (
              <p className="action-hint">
                {!apiToken.trim()
                  ? '请先在顶部填写 API 密钥'
                  : colorCardMode && !fabric.source
                    ? '请先上传编号色卡图'
                    : separatesDualMode && (!fabricTop.source || !fabricBottom.source)
                      ? '请先上传上衣参考图和下装参考图'
                    : wearMode && !wearModeRef.source
                    ? '请先上传模特参考图'
                    : modelFlattenMode && !modelFlattenRef.source
                    ? '请先上传平铺参考图'
                    : !patternExtractMode && !modelFlattenMode && !wearMode && !colorChangeMode && !separatesDualMode && !fabric.source
                      ? '请先完成第 1 步'
                      : jobs.length === 0
                        ? colorCardMode
                          ? '请上传正面模特参考图'
                          : wearMode
                          ? '请上传商品图'
                          : modelFlattenMode
                          ? '请上传模特图'
                          : patternExtractMode
                          ? '请上传花色来源图'
                          : '请上传要换的图'
                        : '请完成上述步骤'}
              </p>
            ) : null}

            {isRunning && jobs.length > 0 ? (
              <p className="progress-line">
                进度：已完成 {jobStats.done} / {jobStats.total}
                {jobStats.running > 0 ? `，进行中 ${jobStats.running}` : ''}
                {jobStats.error > 0 ? `，失败 ${jobStats.error}` : ''}
              </p>
            ) : null}
          </section>

          {jobs.length > 0 ? (
            <section className="results-section">
              <h2 className="results-heading">生成结果</h2>
              {colorCardMode ? (
                <p className="results-subheading">按色卡编号排序，每个色号正面图后紧跟背面图。</p>
              ) : null}
              <div className="job-grid">
                {displayJobs.map((job) => (
                  <article
                    key={job.id}
                    className={`job-card${job.warnings?.length ? ' job-card-warn' : ''}`}
                  >
                    <div className="job-card-head">
                      <span className="job-name" title={jobDisplayName(job)}>
                        {jobDisplayName(job)}
                      </span>
                      <span className={`status status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
                    </div>
                    {!patternExtractMode && !modelFlattenMode && !fabricCloseupMode && !colorCardMode && !standardFrontMode && !standardBackMode ? (
                      <label className="job-back-toggle">
                        <input
                          type="checkbox"
                          checked={job.isBackView === true}
                          disabled={isRunning}
                          onChange={(e) => updateJob(job.id, { isBackView: e.target.checked })}
                        />
                        背面图（禁止翻正面）
                      </label>
                    ) : null}
                    {!patternExtractMode && !modelFlattenMode ? (
                      <label className="job-back-toggle">
                        <input
                          type="checkbox"
                          checked={fabricCloseupMode || job.isStrictFraming === true}
                          disabled={isRunning || fabricCloseupMode}
                          onChange={(e) => updateJob(job.id, { isStrictFraming: e.target.checked })}
                        />
                        {fabricCloseupMode ? '局部布样（自动锁构图）' : '局部/特写（严格锁构图）'}
                      </label>
                    ) : null}
                    <div className="job-images">
                      <figure>
                        <button
                          type="button"
                          className="job-image-btn"
                          title="点击查看大图"
                          onClick={() => openImagePreview(job.previewObjectUrl, `${jobReferenceLabel(job)} — ${jobDisplayName(job)}`)}
                        >
                          <img src={job.previewObjectUrl} alt={jobReferenceLabel(job)} />
                        </button>
                        <figcaption>{jobReferenceLabel(job)}</figcaption>
                      </figure>
                      <figure>
                        {job.resultDataUrl ? (
                          <button
                            type="button"
                            className="job-image-btn"
                            title="点击查看大图"
                            onClick={() => openImagePreview(job.resultDataUrl!, jobResultLabel(job))}
                          >
                            <img src={job.resultDataUrl} alt={jobResultLabel(job)} />
                          </button>
                        ) : (
                          <span className="result-placeholder">
                            {job.status === 'running' ? '生成中…' : job.status === 'error' ? '生成失败' : '等待生成'}
                          </span>
                        )}
                        <figcaption>{jobResultLabel(job)}</figcaption>
                      </figure>
                    </div>
                    {job.warnings && job.warnings.length > 0 ? (
                      <ul className="job-warnings">
                        {job.warnings.map((w) => (
                          <li key={w.code}>{w.message}</li>
                        ))}
                      </ul>
                    ) : null}
                    {job.error ? <div className="job-error">{job.error}</div> : null}
                    <div className="job-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!job.resultDataUrl}
                        onClick={() => downloadOne(job)}
                      >
                        下载
                      </button>
                      <button type="button" className="btn btn-ghost" disabled={isRunning} onClick={() => removeJob(job.id)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
      </main>

      {imagePreview ? (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.label}
          onClick={() => setImagePreview(null)}
        >
          <div className="image-lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <div className="image-lightbox-head">
              <span className="image-lightbox-title">{imagePreview.label}</span>
              <button type="button" className="btn btn-ghost image-lightbox-close" onClick={() => setImagePreview(null)}>
                关闭
              </button>
            </div>
            <img src={imagePreview.src} alt={imagePreview.label} className="image-lightbox-img" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
