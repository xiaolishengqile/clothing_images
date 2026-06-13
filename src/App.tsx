import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { postImagesGenerations, type GenerationsBody } from './api/imagesGenerations'
import { postImagesEdits } from './api/imagesEdits'
import {
  ASPECT_OPTIONS,
  buildFabricTransferPrompt,
  buildFabricTransferPromptForEdits,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_PROMPT_SUFFIX,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DEFAULT_SIZE_2K,
  MAX_BATCH_CONCURRENCY,
  PROMPT_COLOR_CHANGE,
  PROMPT_SEPARATES_MODE,
  PROMPT_SEPARATES_MODE_EDIT,
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
  STORAGE_KEY_FOLLOW_TARGET_ASPECT,
  STORAGE_KEY_PROMPT,
  STORAGE_KEY_SIZE,
  STORAGE_KEY_SOLID_FABRIC,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USE_2K,
  STORAGE_KEY_USE_EDITS,
  STORAGE_KEY_SKIRT_ONLY,
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
type PasteTarget = 'fabric' | 'target'
/** 主工作模式：换布（默认）、一键换色、上身展示 */
type WorkMode = 'fabric' | 'colorChange' | 'wear'
/** 换布变体：标准 / 裙子 / 上下装分离 */
type FabricVariant = 'standard' | 'skirtOnly' | 'separates'

const WORK_MODE_OPTIONS: { id: WorkMode; label: string; hint: string }[] = [
  { id: 'fabric', label: '换布', hint: '布料图替换花纹' },
  { id: 'colorChange', label: '换色', hint: '选色替换，无需布料图' },
  { id: 'wear', label: '上身', hint: '商品穿到模特参考图' },
]

const FABRIC_VARIANT_OPTIONS: { id: FabricVariant; label: string; hint: string }[] = [
  { id: 'standard', label: '标准', hint: '整件替换（默认）' },
  { id: 'skirtOnly', label: '裙子模式', hint: '只换下装，上衣不变' },
  { id: 'separates', label: '上下装分离', hint: '上衣、下装分别替换' },
]

function loadWorkMode(): WorkMode {
  if (localStorage.getItem(STORAGE_KEY_WEAR_MODE) === '1') return 'wear'
  if (localStorage.getItem(STORAGE_KEY_COLOR_CHANGE) === '1') return 'colorChange'
  return 'fabric'
}

function loadFabricVariant(workMode: WorkMode): FabricVariant {
  if (workMode !== 'fabric') return 'standard'
  if (localStorage.getItem(STORAGE_KEY_SKIRT_ONLY) === '1') return 'skirtOnly'
  if (localStorage.getItem(STORAGE_KEY_SEPARATES_MODE) === '1') return 'separates'
  return 'standard'
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
  const colorChangeMode = workMode === 'colorChange'
  const wearMode = workMode === 'wear'
  const skirtOnlyMode = fabricVariant === 'skirtOnly'
  const separatesMode = fabricVariant === 'separates'
  /** 换色模式选中的颜色 (hex) */
  const [selectedColor, setSelectedColor] = useState<string>('#FF6B6B')
  /** 上身展示模式的参考图 */
  const [wearModeRefSource, setWearModeRefSource] = useState<FabricSource | null>(null)

  const activeSizeOptions = use2kOutput ? SIZE_OPTIONS_2K : SIZE_OPTIONS

  const [fabricSource, setFabricSource] = useState<FabricSource | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const addedSeqRef = useRef(0)
  const [isRunning, setIsRunning] = useState(false)
  const [targetDragOver, setTargetDragOver] = useState(false)
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>('fabric')

  const cancelRef = useRef(false)
  const pasteTargetRef = useRef<PasteTarget>('fabric')
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
  }, [fabricVariant])
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLOR_CHANGE, workMode === 'colorChange' ? '1' : '0')
    localStorage.setItem(STORAGE_KEY_WEAR_MODE, workMode === 'wear' ? '1' : '0')
  }, [workMode])

  const selectWorkMode = useCallback((mode: WorkMode) => {
    setWorkMode(mode)
  }, [])
  useEffect(() => {
    const opts = use2kOutput ? SIZE_OPTIONS_2K : SIZE_OPTIONS
    const defaultSize = use2kOutput ? DEFAULT_SIZE_2K : DEFAULT_SIZE
    setSize((prev) => (opts.includes(prev) ? prev : defaultSize))
  }, [use2kOutput])
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

  const addTargetFiles = useCallback(
    (list: FileList | File[]) => {
      const arr = Array.from(list).filter((f) => /^image\//.test(f.type))
      if (arr.length === 0) return
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
    [updateJob],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent | ClipboardEvent, target: PasteTarget) => {
      if (isRunning) return
      const dt = e.clipboardData
      if (!dt) return
      const files = getImageFilesFromDataTransfer(dt)
      if (files.length === 0) return
      e.preventDefault()
      if (target === 'fabric') {
        if (workMode === 'wear') setWearModeRefFromFile(files[0])
        else setFabricFromFile(files[0])
      } else addTargetFiles(files)
    },
    [addTargetFiles, isRunning, setFabricFromFile, setWearModeRefFromFile, workMode],
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
      if (j?.previewObjectUrl) URL.revokeObjectURL(j.previewObjectUrl)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clearJobs = useCallback(() => {
    setJobs((prev) => {
      for (const j of prev) {
        if (j.previewObjectUrl) URL.revokeObjectURL(j.previewObjectUrl)
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
    if (!colorChangeMode && !wearMode && !fabricSource) {
      alert('请先上传「布料图」或「商品图」')
      return
    }
    if (wearMode && !wearModeRefSource) {
      alert('请先上传「模特参考图」')
      return
    }
    if (jobs.length === 0) {
      alert(wearMode ? '请至少上传一张「商品图」' : '请至少上传一张「要换的图」')
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

    const fullPrompt = [
      wearMode ? (useEditsApi ? PROMPT_WEAR_MODE_EDIT : PROMPT_WEAR_MODE) : buildPrompt(queue.length > 1),
      wearMode ? '' : DEFAULT_PROMPT_SUFFIX,
      isSolidFabric ? solidPrompt : '',
      skirtOnlyMode ? skirtOnlyPrompt : '',
      separatesMode ? separatesPrompt : '',
      colorChangeMode ? PROMPT_COLOR_CHANGE : '',
      colorChangeMode ? `Target color: ${selectedColor}` : '',
      promptExtra.trim(),
    ]
      .filter(Boolean)
      .join('\n\n')

    let fabricPayload: string | undefined
    let wearRefPayload: string | undefined
    if (!useEditsApi && !colorChangeMode && !wearMode && fabricSource) {
      try {
        fabricPayload = await encodeImage(fabricSource.file)
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
          isBackView: job.isBackView === true,
          isStrictFraming: job.isStrictFraming === true,
          forEdits: useEditsApi,
        })
        const prompt = [fullPrompt, jobPromptSuffix].filter(Boolean).join('\n\n')

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
            image: wearMode ? [garmentPayload, wearRefPayload!] : [fabricPayload!, garmentPayload],
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
    encodeImage,
    workMode,
    fabricSource,
    followTargetAspect,
    isSolidFabric,
    jobs,
    model,
    promptExtra,
    fabricVariant,
    selectedColor,
    size,
    updateJob,
    use2kOutput,
    useEditsApi,
    wearModeRefSource,
  ])

  const displayJobs = useMemo(() => {
    const rank = (s: JobStatus) => (s === 'done' ? 0 : s === 'running' ? 1 : s === 'queued' ? 2 : 3)
    return [...jobs].sort((a, b) => {
      const ra = rank(a.status)
      const rb = rank(b.status)
      if (ra !== rb) return ra - rb
      if (a.status === 'done' && b.status === 'done') {
        return (a.completedAt ?? 0) - (b.completedAt ?? 0)
      }
      return a.addedSeq - b.addedSeq
    })
  }, [jobs])

  const canStart = colorChangeMode
    ? Boolean(jobs.length > 0 && apiToken.trim())
    : wearMode
      ? Boolean(wearModeRefSource && jobs.length > 0 && apiToken.trim())
      : Boolean(fabricSource && jobs.length > 0 && apiToken.trim())

  const openImagePreview = (src: string, label: string) => {
    setImagePreview({ src, label })
  }

  const downloadOne = (job: Job) => {
    if (!job.resultDataUrl) return
    const a = document.createElement('a')
    a.href = job.resultDataUrl
    const stem = safeBaseName(job.file.name.replace(/\.[^.]+$/, ''))
    const ext = job.resultDataUrl.startsWith('data:image/png') ? 'png' : extensionFromMime(job.file)
    a.download = `${stem}_换布结果.${ext}`
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
      const stem = safeBaseName(job.file.name.replace(/\.[^.]+$/, ''))
      zip.file(`${stem}_换布结果.png`, blob)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    saveAs(out, `换布结果-${new Date().toISOString().slice(0, 10)}.zip`)
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
                    onChange={(e) => setUse2kOutput(e.target.checked)}
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
      </section>

      <main className="app-main">
        <div className="upload-steps-row">
          {!colorChangeMode && !wearMode && (
          <section
            className={`step-card step-card-upload paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${fabricSource ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('fabric')}
            onMouseDown={() => setPasteTarget('fabric')}
            onPaste={(e) => handlePaste(e, 'fabric')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 1 步</span>
              <h2>上传「布料图」</h2>
            </div>
            <label className="job-back-toggle fabric-solid-toggle">
              <input
                type="checkbox"
                checked={isSolidFabric}
                disabled={isRunning}
                onChange={(e) => setIsSolidFabric(e.target.checked)}
              />
              纯色布料（无印花，按颜色 + 肌理替换）
            </label>

            <div className="upload-card">
              <div className={`preview-box${fabricSource ? '' : ' empty'}`}>
                {fabricSource ? (
                  <button
                    type="button"
                    className="preview-image-btn"
                    title="点击查看大图"
                    onClick={() => openImagePreview(fabricSource.previewObjectUrl, '布料图')}
                  >
                    <img src={fabricSource.previewObjectUrl} alt="布料图预览" />
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
              上传一张<strong>模特展示参考图</strong>（姿势、场景、配饰等展示效果），所有商品将穿到这位模特身上。
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
              <span className="step-badge">{colorChangeMode ? '最后一步' : wearMode ? '第 2 步' : '第 2 步'}</span>
              <h2>{wearMode ? '上传「商品图」' : '上传「要换的图」'}</h2>
            </div>
            <p className="step-desc">
              {wearMode ? (
                <>
                  请传<strong>平铺/挂拍商品图</strong>（要上身展示的衣服），可多张批量；每张会分别穿到模特参考图上。
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
              <p className="dropzone-sub">支持多选 · 粘贴前请先点一下本区域</p>
              <label className="btn btn-secondary dropzone-btn">
                选择多张图片
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={isRunning}
                  onChange={(e) => {
                    if (e.target.files?.length) addTargetFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>

            {jobs.length > 0 ? (
              <p className="target-count">已添加 {jobs.length} 张</p>
            ) : null}
          </section>
        </div>

        <section className="step-card step-card-action">
            <div className="step-card-head">
              <span className="step-badge step-badge-accent">{wearMode ? '第 3 步' : '第 3 步'}</span>
              <h2>生成同一套衣服的多张图</h2>
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
            </div>

            {!canStart && !isRunning ? (
              <p className="action-hint">
                {!apiToken.trim()
                  ? '请先在顶部填写 API 密钥'
                  : wearMode && !wearModeRefSource
                    ? '请先上传模特参考图'
                    : !wearMode && !colorChangeMode && !fabricSource
                      ? '请先完成第 1 步'
                      : jobs.length === 0
                        ? wearMode
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
              <div className="job-grid">
                {displayJobs.map((job) => (
                  <article
                    key={job.id}
                    className={`job-card${job.warnings?.length ? ' job-card-warn' : ''}`}
                  >
                    <div className="job-card-head">
                      <span className="job-name" title={job.file.name}>
                        {job.file.name}
                      </span>
                      <span className={`status status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
                    </div>
                    <label className="job-back-toggle">
                      <input
                        type="checkbox"
                        checked={job.isBackView === true}
                        disabled={isRunning}
                        onChange={(e) => updateJob(job.id, { isBackView: e.target.checked })}
                      />
                      背面图（禁止翻正面）
                    </label>
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
                          onClick={() => openImagePreview(job.previewObjectUrl, `目标图 — ${job.file.name}`)}
                        >
                          <img src={job.previewObjectUrl} alt="目标图" />
                        </button>
                        <figcaption>目标图</figcaption>
                      </figure>
                      <figure>
                        {job.resultDataUrl ? (
                          <button
                            type="button"
                            className="job-image-btn"
                            title="点击查看大图"
                            onClick={() => openImagePreview(job.resultDataUrl!, `换布后 — ${job.file.name}`)}
                          >
                            <img src={job.resultDataUrl} alt="换布后" />
                          </button>
                        ) : (
                          <span className="result-placeholder">
                            {job.status === 'running' ? '生成中…' : job.status === 'error' ? '生成失败' : '等待生成'}
                          </span>
                        )}
                        <figcaption>换布后</figcaption>
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
              <div className="results-footer">
                <button type="button" className="btn btn-ghost" disabled={isRunning} onClick={clearJobs}>
                  清空全部目标图
                </button>
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
