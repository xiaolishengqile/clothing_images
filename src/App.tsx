import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { postImagesGenerations, type GenerationsBody } from './api/imagesGenerations'
import { postImagesEdits } from './api/imagesEdits'
import {
  ASPECT_OPTIONS,
  buildColorCardPrompt,
  buildColorCardPromptForEdits,
  buildFabricTransferPrompt,
  buildFabricTransferPromptForEdits,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_PROMPT_SUFFIX,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DEFAULT_SIZE_2K,
  MAX_BATCH_CONCURRENCY,
  buildColorChangePrompt,
  PROMPT_SEPARATES_MODE,
  PROMPT_SEPARATES_MODE_EDIT,
  PROMPT_SEPARATES_DUAL_MODE,
  PROMPT_SEPARATES_DUAL_MODE_EDIT,
  PROMPT_SOLID_FABRIC,
  PROMPT_SOLID_FABRIC_EDIT,
  PROMPT_SKIRT_ONLY,
  PROMPT_SKIRT_ONLY_EDIT,
  PROMPT_WEAR_MODE,
  PROMPT_WEAR_MODE_EDIT,
  SIZE_OPTIONS,
  SIZE_OPTIONS_2K,
  STORAGE_KEY_ASPECT,
  STORAGE_KEY_BASE,
  STORAGE_KEY_COLOR_CHANGE,
  STORAGE_KEY_COLOR_CARD_COUNT,
  STORAGE_KEY_COLOR_CARD_MODE,
  STORAGE_KEY_FOLLOW_TARGET_ASPECT,
  STORAGE_KEY_PROMPT,
  STORAGE_KEY_SIZE,
  STORAGE_KEY_SOLID_FABRIC,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USE_2K,
  STORAGE_KEY_USE_EDITS,
  STORAGE_KEY_SKIRT_ONLY,
  STORAGE_KEY_SEPARATES_DUAL_MODE,
  STORAGE_KEY_SEPARATES_MODE,
  STORAGE_KEY_WEAR_MODE,
} from './lib/constants'
import { getImageFilesFromDataTransfer, readFileAsDataURL } from './lib/files'
import { closestAspectLabel, getImageDimensions, sizeForAspect } from './lib/imageAspect'
import {
  buildPerJobPromptSuffix,
  checkTargetImage,
  type TargetImageWarning,
} from './lib/targetImageCheck'
import './App.css'

type JobStatus = 'queued' | 'running' | 'done' | 'error'
type PasteTarget = 'fabric' | 'fabricTop' | 'fabricBottom' | 'target' | 'colorCardBack'
/** 主工作模式：换布（默认）、一键换色、上身展示、色卡 */
type WorkMode = 'fabric' | 'colorChange' | 'wear' | 'colorCard'
type ColorCardView = 'front' | 'back'
/** 换布变体：标准 / 裙子 / 上下装分离 / 上下装双参考 */
type FabricVariant = 'standard' | 'skirtOnly' | 'separates' | 'separatesDual'

const WORK_MODE_OPTIONS: { id: WorkMode; label: string; hint: string }[] = [
  { id: 'fabric', label: '换布', hint: '布料图替换花纹' },
  { id: 'colorChange', label: '换色', hint: '选色替换，无需布料图' },
  { id: 'wear', label: '上身', hint: '保商品版型花色' },
  { id: 'colorCard', label: '色卡', hint: '编号色卡批量正背面' },
]

const DEFAULT_COLOR_CARD_COUNT = 18
const MIN_COLOR_CARD_COUNT = 0
const MAX_COLOR_CARD_COUNT = 99

const FABRIC_VARIANT_OPTIONS: { id: FabricVariant; label: string; hint: string }[] = [
  { id: 'standard', label: '标准', hint: '整件替换（默认）' },
  { id: 'skirtOnly', label: '裙子模式', hint: '只换下装，上衣不变' },
  { id: 'separates', label: '上下装分离', hint: '上衣、下装分别替换' },
  { id: 'separatesDual', label: '双参考', hint: '只取花色，不取版型' },
]

function loadWorkMode(): WorkMode {
  if (localStorage.getItem(STORAGE_KEY_COLOR_CARD_MODE) === '1') return 'colorCard'
  if (localStorage.getItem(STORAGE_KEY_WEAR_MODE) === '1') return 'wear'
  if (localStorage.getItem(STORAGE_KEY_COLOR_CHANGE) === '1') return 'colorChange'
  return 'fabric'
}

function loadFabricVariant(workMode: WorkMode): FabricVariant {
  if (workMode !== 'fabric') return 'standard'
  if (localStorage.getItem(STORAGE_KEY_SEPARATES_DUAL_MODE) === '1') return 'separatesDual'
  if (localStorage.getItem(STORAGE_KEY_SKIRT_ONLY) === '1') return 'skirtOnly'
  if (localStorage.getItem(STORAGE_KEY_SEPARATES_MODE) === '1') return 'separates'
  return 'standard'
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

interface FabricSource {
  file: File
  previewObjectUrl: string
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

export default function App() {
  const [apiBase, setApiBase] = useState(() => localStorage.getItem(STORAGE_KEY_BASE) ?? DEFAULT_API_BASE)
  const [apiToken, setApiToken] = useState(() => localStorage.getItem(STORAGE_KEY_TOKEN) ?? '')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [promptExtra, setPromptExtra] = useState(() => localStorage.getItem(STORAGE_KEY_PROMPT) ?? '')
  const [size, setSize] = useState(() => localStorage.getItem(STORAGE_KEY_SIZE) ?? DEFAULT_SIZE)
  const [aspectRatio, setAspectRatio] = useState(
    () => localStorage.getItem(STORAGE_KEY_ASPECT) ?? DEFAULT_ASPECT_RATIO,
  )
  const [followTargetAspect, setFollowTargetAspect] = useState(
    () => localStorage.getItem(STORAGE_KEY_FOLLOW_TARGET_ASPECT) !== '0',
  )
  const [isSolidFabric, setIsSolidFabric] = useState(
    () => localStorage.getItem(STORAGE_KEY_SOLID_FABRIC) === '1',
  )
  const [use2kOutput, setUse2kOutput] = useState(() => localStorage.getItem(STORAGE_KEY_USE_2K) === '1')
  const [useEditsApi, setUseEditsApi] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY_USE_EDITS)
    return stored === null ? true : stored === '1'
  })
  const [workMode, setWorkMode] = useState<WorkMode>(() => loadWorkMode())
  const [fabricVariant, setFabricVariant] = useState<FabricVariant>(() => loadFabricVariant(loadWorkMode()))
  const [colorCardCount, setColorCardCount] = useState(() => loadColorCardCount())
  const [colorCardCountInput, setColorCardCountInput] = useState(() => String(loadColorCardCount()))
  const colorChangeMode = workMode === 'colorChange'
  const wearMode = workMode === 'wear'
  const colorCardMode = workMode === 'colorCard'
  const inFabricMode = workMode === 'fabric'
  const skirtOnlyMode = inFabricMode && fabricVariant === 'skirtOnly'
  const separatesMode = inFabricMode && fabricVariant === 'separates'
  const separatesDualMode = inFabricMode && fabricVariant === 'separatesDual'
  /** 换色模式选中的颜色 (hex) */
  const [selectedColor, setSelectedColor] = useState<string>('#FF6B6B')
  /** 上身展示模式的参考图 */
  const [wearModeRefSource, setWearModeRefSource] = useState<FabricSource | null>(null)

  const activeSizeOptions = use2kOutput ? SIZE_OPTIONS_2K : SIZE_OPTIONS

  const [fabricSource, setFabricSource] = useState<FabricSource | null>(null)
  const [fabricTopSource, setFabricTopSource] = useState<FabricSource | null>(null)
  const [fabricBottomSource, setFabricBottomSource] = useState<FabricSource | null>(null)
  const [colorCardBackSource, setColorCardBackSource] = useState<FabricSource | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const addedSeqRef = useRef(0)
  const [isRunning, setIsRunning] = useState(false)
  const [targetDragOver, setTargetDragOver] = useState(false)
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>('fabric')

  const cancelRef = useRef(false)
  const pasteTargetRef = useRef<PasteTarget>('fabric')
  const colorCardSourceFileRef = useRef<File | null>(null)
  const colorCardBackFileRef = useRef<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const advancedDetailsRef = useRef<HTMLDetailsElement>(null)

  // 预设色板
  const PRESET_COLORS = useMemo(() => [
    { name: '珊瑚红', hex: '#FF6B6B' },
    { name: '樱花粉', hex: '#FFB6C1' },
    { name: '薰衣草紫', hex: '#B8A3D9' },
    { name: '天空蓝', hex: '#87CEEB' },
    { name: '薄荷绿', hex: '#98FB98' },
    { name: '柠檬黄', hex: '#FFF44F' },
    { name: '经典黑', hex: '#2D2D2D' },
    { name: '纯白', hex: '#F5F5F5' },
    { name: '海军蓝', hex: '#003366' },
    { name: '橄榄绿', hex: '#6B7F4C' },
    { name: '酒红色', hex: '#722F37' },
    { name: '驼色', hex: '#C69C6D' },
  ], [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BASE, apiBase)
  }, [apiBase])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TOKEN, apiToken)
  }, [apiToken])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROMPT, promptExtra)
  }, [promptExtra])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SIZE, size)
  }, [size])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ASPECT, aspectRatio)
  }, [aspectRatio])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FOLLOW_TARGET_ASPECT, followTargetAspect ? '1' : '0')
  }, [followTargetAspect])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SOLID_FABRIC, isSolidFabric ? '1' : '0')
  }, [isSolidFabric])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USE_2K, use2kOutput ? '1' : '0')
  }, [use2kOutput])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USE_EDITS, useEditsApi ? '1' : '0')
  }, [useEditsApi])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SKIRT_ONLY, fabricVariant === 'skirtOnly' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_SEPARATES_MODE, fabricVariant === 'separates' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_SEPARATES_DUAL_MODE, fabricVariant === 'separatesDual' ? '1' : '0')
  }, [fabricVariant])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLOR_CHANGE, workMode === 'colorChange' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_WEAR_MODE, workMode === 'wear' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_COLOR_CARD_MODE, workMode === 'colorCard' ? '1' : '0')
  }, [workMode])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLOR_CARD_COUNT, String(colorCardCount))
  }, [colorCardCount])

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

  const setFabricFromFile = useCallback((file: File) => {
    if (!/^image\//.test(file.type)) return
    setFabricSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return {
        file,
        previewObjectUrl: URL.createObjectURL(file),
      }
    })
  }, [])

  const clearFabricSource = useCallback(() => {
    setFabricSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return null
    })
  }, [])

  const setFabricTopFromFile = useCallback((file: File) => {
    if (!/^image\//.test(file.type)) return
    setFabricTopSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return {
        file,
        previewObjectUrl: URL.createObjectURL(file),
      }
    })
  }, [])

  const clearFabricTopSource = useCallback(() => {
    setFabricTopSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return null
    })
  }, [])

  const setFabricBottomFromFile = useCallback((file: File) => {
    if (!/^image\//.test(file.type)) return
    setFabricBottomSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return {
        file,
        previewObjectUrl: URL.createObjectURL(file),
      }
    })
  }, [])

  const clearFabricBottomSource = useCallback(() => {
    setFabricBottomSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return null
    })
  }, [])

  const setWearModeRefFromFile = useCallback((file: File) => {
    if (!/^image\//.test(file.type)) return
    setWearModeRefSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return {
        file,
        previewObjectUrl: URL.createObjectURL(file),
      }
    })
  }, [])

  const clearWearModeRefSource = useCallback(() => {
    setWearModeRefSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return null
    })
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
      setColorCardBackSource((prev) => {
        if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
        return {
          file,
          previewObjectUrl: URL.createObjectURL(file),
        }
      })
      const frontFile = colorCardSourceFileRef.current ?? jobs[0]?.file
      if (frontFile) replaceColorCardJobs(frontFile, colorCardCount, file)
      else colorCardBackFileRef.current = file
    },
    [colorCardCount, jobs, replaceColorCardJobs],
  )

  const clearColorCardBackSource = useCallback(() => {
    setColorCardBackSource((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl)
      return null
    })
    colorCardBackFileRef.current = null
    const frontFile = colorCardSourceFileRef.current ?? jobs[0]?.file
    if (frontFile) replaceColorCardJobs(frontFile, colorCardCount, null)
  }, [colorCardCount, jobs, replaceColorCardJobs])

  const updateColorCardCount = useCallback(
    (value: number, syncInput = true) => {
      const nextCount = clampColorCardCount(value)
      setColorCardCount(nextCount)
      if (syncInput) setColorCardCountInput(String(nextCount))
      if (!colorCardMode || isRunning) return
      const sourceFile = colorCardSourceFileRef.current ?? jobs[0]?.file
      if (sourceFile) replaceColorCardJobs(sourceFile, nextCount)
    },
    [colorCardMode, isRunning, jobs, replaceColorCardJobs],
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
      }))
      setJobs((prev) => [...prev, ...newJobs])
      for (const job of newJobs) {
        void checkTargetImage(job.file).then(({ warnings }) => {
          updateJob(job.id, {
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        })
      }
    },
    [colorCardCount, colorCardMode, replaceColorCardJobs, updateJob],
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
        setFabricTopFromFile(files[0])
      } else if (target === 'fabricBottom') {
        setFabricBottomFromFile(files[0])
      } else if (target === 'fabric') {
        if (workMode === 'wear') setWearModeRefFromFile(files[0])
        else setFabricFromFile(files[0])
      } else addTargetFiles(files)
    },
    [
      addTargetFiles,
      isRunning,
      setColorCardBackFromFile,
      setFabricBottomFromFile,
      setFabricFromFile,
      setFabricTopFromFile,
      setWearModeRefFromFile,
      workMode,
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
    abortRef.current?.abort()
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
    if (!colorChangeMode && !wearMode && !colorCardMode && separatesDualMode && (!fabricTopSource || !fabricBottomSource)) {
      alert('请先上传「上衣参考图」和「下装参考图」')
      return
    }
    if (!colorChangeMode && !wearMode && !separatesDualMode && !fabricSource) {
      alert(colorCardMode ? '请先上传「编号色卡图」' : '请先上传「布料图」或「商品图」')
      return
    }
    if (wearMode && !wearModeRefSource) {
      alert('请先上传「模特参考图」')
      return
    }
    if (jobs.length === 0) {
      alert(colorCardMode ? '请上传一张「正面模特参考图」' : wearMode ? '请至少上传一张「商品图」' : '请至少上传一张「要换的图」')
      return
    }

    const queue = jobs.filter((j) => j.status !== 'running')
    if (queue.length === 0) {
      alert('当前没有可执行的任务。')
      return
    }

    cancelRef.current = false
    setIsRunning(true)

    const buildPrompt = useEditsApi ? buildFabricTransferPromptForEdits : buildFabricTransferPrompt
    const solidPrompt = useEditsApi ? PROMPT_SOLID_FABRIC_EDIT : PROMPT_SOLID_FABRIC
    const skirtOnlyPrompt = useEditsApi ? PROMPT_SKIRT_ONLY_EDIT : PROMPT_SKIRT_ONLY
    const separatesPrompt = useEditsApi ? PROMPT_SEPARATES_MODE_EDIT : PROMPT_SEPARATES_MODE
    const separatesDualPrompt = useEditsApi ? PROMPT_SEPARATES_DUAL_MODE_EDIT : PROMPT_SEPARATES_DUAL_MODE

    const fullPrompt = [
      colorCardMode
        ? ''
        : colorChangeMode
          ? buildColorChangePrompt(useEditsApi, selectedColor)
          : wearMode
            ? (useEditsApi ? PROMPT_WEAR_MODE_EDIT : PROMPT_WEAR_MODE)
            : separatesDualMode
              ? separatesDualPrompt
              : buildPrompt(queue.length > 1),
      wearMode || colorCardMode || separatesDualMode || colorChangeMode ? '' : DEFAULT_PROMPT_SUFFIX,
      !colorChangeMode && !separatesDualMode && isSolidFabric ? solidPrompt : '',
      !colorChangeMode && skirtOnlyMode ? skirtOnlyPrompt : '',
      !colorChangeMode && separatesMode ? separatesPrompt : '',
      promptExtra.trim(),
    ]
      .filter(Boolean)
      .join('\n\n')

    let fabricPayload: string | undefined
    let fabricTopPayload: string | undefined
    let fabricBottomPayload: string | undefined
    let wearRefPayload: string | undefined
    if (!useEditsApi && !colorChangeMode && !wearMode && !separatesDualMode && fabricSource) {
      try {
        fabricPayload = await encodeImage(fabricSource.file)
      } catch (e) {
        setIsRunning(false)
        alert(e instanceof Error ? e.message : String(e))
        return
      }
    }
    if (!useEditsApi && separatesDualMode && fabricTopSource && fabricBottomSource) {
      try {
        fabricTopPayload = await encodeImage(fabricTopSource.file)
        fabricBottomPayload = await encodeImage(fabricBottomSource.file)
      } catch (e) {
        setIsRunning(false)
        alert(e instanceof Error ? e.message : String(e))
        return
      }
    }
    if (!useEditsApi && wearMode && wearModeRefSource) {
      try {
        wearRefPayload = await encodeImage(wearModeRefSource.file)
      } catch (e) {
        setIsRunning(false)
        alert(e instanceof Error ? e.message : String(e))
        return
      }
    }

    const runOne = async (job: Job) => {
      if (cancelRef.current) return
      updateJob(job.id, {
        status: 'running',
        error: undefined,
        resultDataUrl: undefined,
        completedAt: undefined,
      })
      const ac = new AbortController()
      abortRef.current = ac
      try {
        let jobAspect = aspectRatio
        let jobSize = size
        if (followTargetAspect) {
          const { width, height } = await getImageDimensions(job.file)
          jobAspect = closestAspectLabel(width, height)
          jobSize = sizeForAspect(jobAspect, use2kOutput ? DEFAULT_SIZE_2K : size, use2kOutput)
        }

        const jobPromptSuffix = buildPerJobPromptSuffix({
          warnings: job.warnings ?? [],
          isBackView: colorCardMode ? false : job.isBackView === true,
          isStrictFraming: job.isStrictFraming === true,
          forEdits: useEditsApi,
        })
        const colorCardPrompt =
          colorCardMode && job.colorCardNumber
            ? useEditsApi
              ? buildColorCardPromptForEdits(
                  job.colorCardNumber,
                  job.colorCardView ?? 'front',
                  job.colorCardUsesBackReference === true,
                )
              : buildColorCardPrompt(
                  job.colorCardNumber,
                  job.colorCardView ?? 'front',
                  job.colorCardUsesBackReference === true,
                )
            : ''
        const prompt = [
          colorCardPrompt || fullPrompt,
          jobPromptSuffix,
          colorCardMode ? promptExtra.trim() : '',
        ]
          .filter(Boolean)
          .join('\n\n')

        let imageDataUrl: string
        if (useEditsApi) {
          const result = await postImagesEdits(
            base,
            token,
            {
              model: model.trim() || DEFAULT_MODEL,
              prompt,
              size: jobSize,
              aspect_ratio: jobAspect,
              images: colorChangeMode
                ? [job.file]
                : colorCardMode
                  ? [job.file, fabricSource!.file]
                  : separatesDualMode
                    ? [job.file, fabricTopSource!.file, fabricBottomSource!.file]
                  : wearMode
                  ? [wearModeRefSource!.file, job.file]
                  : [job.file, fabricSource!.file],
            },
            ac.signal,
          )
          imageDataUrl = result.imageDataUrl
        } else {
          const garmentPayload = await encodeImage(job.file)
          const genBody: GenerationsBody = {
            model: model.trim() || DEFAULT_MODEL,
            prompt,
            size: jobSize,
            aspect_ratio: jobAspect,
            image: colorCardMode
              ? [fabricPayload!, garmentPayload]
              : separatesDualMode
                ? [fabricTopPayload!, fabricBottomPayload!, garmentPayload]
              : wearMode
                ? [garmentPayload, wearRefPayload!]
                : [fabricPayload!, garmentPayload],
          }
          const result = await postImagesGenerations(base, token, genBody, ac.signal)
          imageDataUrl = result.imageDataUrl
        }

        updateJob(job.id, {
          status: 'done',
          resultDataUrl: imageDataUrl,
          completedAt: Date.now(),
        })
      } catch (e) {
        if (cancelRef.current || (e instanceof DOMException && e.name === 'AbortError')) {
          updateJob(job.id, { status: 'queued' })
          return
        }
        const msg = e instanceof Error ? e.message : String(e)
        updateJob(job.id, { status: 'error', error: msg })
      }
    }

    const n = Math.min(MAX_BATCH_CONCURRENCY, Math.max(1, queue.length))
    let cursor = 0

    const worker = async () => {
      for (;;) {
        if (cancelRef.current) return
        const my = cursor++
        if (my >= queue.length) return
        await runOne(queue[my])
      }
    }

    await Promise.all(Array.from({ length: n }, () => worker()))

    abortRef.current = null
    setIsRunning(false)
  }, [
    apiBase,
    apiToken,
    aspectRatio,
    colorChangeMode,
    colorCardMode,
    encodeImage,
    fabricBottomSource,
    fabricSource,
    fabricTopSource,
    followTargetAspect,
    isSolidFabric,
    jobs,
    model,
    promptExtra,
    separatesDualMode,
    separatesMode,
    selectedColor,
    size,
    skirtOnlyMode,
    updateJob,
    use2kOutput,
    useEditsApi,
    wearMode,
    wearModeRefSource,
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

  const canStart = colorChangeMode
    ? Boolean(jobs.length > 0 && apiToken.trim())
    : colorCardMode
      ? Boolean(fabricSource && jobs.length > 0 && apiToken.trim())
      : wearMode
        ? Boolean(wearModeRefSource && jobs.length > 0 && apiToken.trim())
        : separatesDualMode
          ? Boolean(fabricTopSource && fabricBottomSource && jobs.length > 0 && apiToken.trim())
          : Boolean(fabricSource && jobs.length > 0 && apiToken.trim())

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
    return '换布后'
  }

  const jobDownloadStem = (job: Job) => {
    if (job.colorCardNumber) {
      const number = String(job.colorCardNumber).padStart(2, '0')
      const view = job.colorCardView === 'back' ? '背面' : '正面'
      return `色卡${number}_${view}`
    }
    return `${safeBaseName(job.file.name.replace(/\.[^.]+$/, ''))}_换布结果`
  }

  const jobReferenceLabel = (job: Job) => {
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
    saveAs(out, `${colorCardMode ? '色卡结果' : '换布结果'}-${new Date().toISOString().slice(0, 10)}.zip`)
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
                  placeholder="https://ai.t8star.cn"
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
              <div className="field">
                <label htmlFor="size">
                  输出尺寸{followTargetAspect ? '（自动）' : ''}
                  {use2kOutput ? ' · 2K' : ''}
                </label>
                <select
                  id="size"
                  value={size}
                  disabled={followTargetAspect}
                  onChange={(e) => setSize(e.target.value)}
                >
                  {activeSizeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="aspect">画面比例{followTargetAspect ? '（自动）' : ''}</label>
                <select
                  id="aspect"
                  value={aspectRatio}
                  disabled={followTargetAspect}
                  onChange={(e) => setAspectRatio(e.target.value)}
                >
                  {ASPECT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field field-span2 field-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={use2kOutput}
                    onChange={(e) => {
                      const checked = e.target.checked
                      const opts = checked ? SIZE_OPTIONS_2K : SIZE_OPTIONS
                      const defaultSize = checked ? DEFAULT_SIZE_2K : DEFAULT_SIZE
                      setUse2kOutput(checked)
                      setSize((prev) => (opts.includes(prev) ? prev : defaultSize))
                    }}
                  />
                  2K 高清输出（更慢、费用更高；若网关不支持会报错）
                </label>
              </div>
              <div className="field field-span2 field-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={useEditsApi}
                    onChange={(e) => setUseEditsApi(e.target.checked)}
                  />
                  编辑接口（保构图，推荐）— 使用 /v1/images/edits；若网关不支持可关闭改用生成接口
                </label>
              </div>
              <div className="field field-span2 field-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={followTargetAspect}
                    onChange={(e) => setFollowTargetAspect(e.target.checked)}
                  />
                  跟随每张模特图比例（推荐，多为 3:4）
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
            {followTargetAspect ? (
              <p className="field-hint">生成时按每张原图宽高自动选最接近比例（如 3:4、9:16）。本地跨域可填 http://localhost:5173/t8proxy</p>
            ) : (
              <p className="field-hint">本地若报跨域，接口地址可填 http://localhost:5173/t8proxy</p>
            )}
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
            {WORK_MODE_OPTIONS.map((opt) => (
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
          {!colorChangeMode && !wearMode && !separatesDualMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${fabricSource ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('fabric')}
            onMouseDown={() => setPasteTarget('fabric')}
            onPaste={(e) => handlePaste(e, 'fabric')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 1 步</span>
              <h2>{colorCardMode ? '上传「编号色卡图」' : '上传「布料图」'}</h2>
            </div>
            {colorCardMode ? (
              <p className="step-desc">
                上传带编号的格子色卡。生成时会自动读取每个编号对应的格子配色。
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
              <div className={`preview-box${fabricSource ? '' : ' empty'}`}>
                {fabricSource ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(fabricSource.previewObjectUrl, colorCardMode ? '编号色卡图' : '布料图')}
                  >
                    <img src={fabricSource.previewObjectUrl} alt={colorCardMode ? '编号色卡图预览' : '布料图预览'} />
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
                      if (f) setFabricFromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isRunning || !fabricSource}
                  onClick={clearFabricSource}
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
              className={`step-card step-card-upload paste-zone${pasteTarget === 'fabricTop' ? ' paste-zone-active' : ''}${fabricTopSource ? ' step-card-done' : ''}`}
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
                <div className={`preview-box${fabricTopSource ? '' : ' empty'}`}>
                  {fabricTopSource ? (
                    <button
                      type="button"
                      className="preview-image-btn"
                      title="点击查看大图"
                      onClick={() => openImagePreview(fabricTopSource.previewObjectUrl, '上衣参考图')}
                    >
                      <img src={fabricTopSource.previewObjectUrl} alt="上衣参考图预览" />
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
                        if (f) setFabricTopFromFile(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isRunning || !fabricTopSource}
                    onClick={clearFabricTopSource}
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
              className={`step-card step-card-upload paste-zone${pasteTarget === 'fabricBottom' ? ' paste-zone-active' : ''}${fabricBottomSource ? ' step-card-done' : ''}`}
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
                <div className={`preview-box${fabricBottomSource ? '' : ' empty'}`}>
                  {fabricBottomSource ? (
                    <button
                      type="button"
                      className="preview-image-btn"
                      title="点击查看大图"
                      onClick={() => openImagePreview(fabricBottomSource.previewObjectUrl, '下装参考图')}
                    >
                      <img src={fabricBottomSource.previewObjectUrl} alt="下装参考图预览" />
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
                        if (f) setFabricBottomFromFile(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isRunning || !fabricBottomSource}
                    onClick={clearFabricBottomSource}
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

          {wearMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${wearModeRefSource ? ' step-card-done' : ''}`}
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
              <div className={`preview-box${wearModeRefSource ? '' : ' empty'}`}>
                {wearModeRefSource ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(wearModeRefSource.previewObjectUrl, '模特参考图')}
                  >
                    <img src={wearModeRefSource.previewObjectUrl} alt="模特参考图预览" />
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
                      if (f) setWearModeRefFromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isRunning || !wearModeRefSource}
                  onClick={clearWearModeRefSource}
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
              <span className="step-badge">{colorChangeMode ? '最后一步' : separatesDualMode ? '第 3 步' : '第 2 步'}</span>
              <h2>{colorCardMode ? '上传「正面模特参考图」' : wearMode ? '上传「商品图」' : '上传「要换的图」'}</h2>
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
              ) : (
                <>
                  请传<strong>完整商品图</strong>（平铺/模特/挂拍），勿传布样特写。可多张上传；若是<strong>背面图</strong>请在卡片上勾选；局部图等风险会自动提示。
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
                {colorCardMode ? '选择正面图' : '选择多张图片'}
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
                  ? `已展开 ${jobs.length} 个生成任务（${colorCardCount} 个色号 × 正背面；${colorCardBackSource ? '背面使用参考图' : '背面由模型生成'}）`
                  : `已添加 ${jobs.length} 张`}
              </p>
            ) : null}
          </section>

          {colorCardMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'colorCardBack' ? ' paste-zone-active' : ''}${colorCardBackSource ? ' step-card-done' : ''}`}
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
              <div className={`preview-box${colorCardBackSource ? '' : ' empty'}`}>
                {colorCardBackSource ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(colorCardBackSource.previewObjectUrl, '背面模特参考图')}
                  >
                    <img src={colorCardBackSource.previewObjectUrl} alt="背面模特参考图预览" />
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
                  disabled={isRunning || !colorCardBackSource}
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
              <span className="step-badge step-badge-accent">{colorCardMode || separatesDualMode ? '第 4 步' : colorChangeMode ? '第 2 步' : '第 3 步'}</span>
              <h2>{colorCardMode ? '按色卡批量生成正面和背面' : '生成同一套衣服的多张图'}</h2>
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
                {colorCardMode ? '清空全部色卡任务' : '清空全部目标图'}
              </button>
            </div>

            {!canStart && !isRunning ? (
              <p className="action-hint">
                {!apiToken.trim()
                  ? '请先在顶部填写 API 密钥'
                  : colorCardMode && !fabricSource
                    ? '请先上传编号色卡图'
                    : separatesDualMode && (!fabricTopSource || !fabricBottomSource)
                      ? '请先上传上衣参考图和下装参考图'
                    : wearMode && !wearModeRefSource
                    ? '请先上传模特参考图'
                    : !wearMode && !colorChangeMode && !separatesDualMode && !fabricSource
                      ? '请先完成第 1 步'
                      : jobs.length === 0
                        ? colorCardMode
                          ? '请上传正面模特参考图'
                          : wearMode
                          ? '请上传商品图'
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
                    {!colorCardMode ? (
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
                    <label className="job-back-toggle">
                      <input
                        type="checkbox"
                        checked={job.isStrictFraming === true}
                        disabled={isRunning}
                        onChange={(e) => updateJob(job.id, { isStrictFraming: e.target.checked })}
                      />
                      局部/特写（严格锁构图）
                    </label>
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
