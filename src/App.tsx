import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { postImagesGenerations, type GenerationsBody } from './api/imagesGenerations'
import {
  ASPECT_OPTIONS,
  buildFabricTransferPrompt,
  DEFAULT_PROMPT_SUFFIX,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  MAX_BATCH_CONCURRENCY,
  SIZE_OPTIONS,
  STORAGE_KEY_ASPECT,
  STORAGE_KEY_BASE,
  STORAGE_KEY_PROMPT,
  STORAGE_KEY_SIZE,
  STORAGE_KEY_TOKEN,
} from './lib/constants'
import { getImageFilesFromDataTransfer, readFileAsDataURL } from './lib/files'
import './App.css'

type JobStatus = 'queued' | 'running' | 'done' | 'error'
type PasteTarget = 'fabric' | 'target'

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
  const [size, setSize] = useState(() => localStorage.getItem(STORAGE_KEY_SIZE) ?? '1024x1024')
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem(STORAGE_KEY_ASPECT) ?? '1:1')

  const [fabricSource, setFabricSource] = useState<FabricSource | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const addedSeqRef = useRef(0)
  const [isRunning, setIsRunning] = useState(false)
  const [targetDragOver, setTargetDragOver] = useState(false)
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>('fabric')

  const cancelRef = useRef(false)
  const pasteTargetRef = useRef<PasteTarget>('fabric')
  const abortRef = useRef<AbortController | null>(null)

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
    pasteTargetRef.current = pasteTarget
  }, [pasteTarget])

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

  const addTargetFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) => /^image\//.test(f.type))
    if (arr.length === 0) return
    setJobs((prev) => {
      const next: Job[] = [...prev]
      for (const file of arr) {
        next.push({
          id: crypto.randomUUID(),
          file,
          previewObjectUrl: URL.createObjectURL(file),
          status: 'queued',
          addedSeq: addedSeqRef.current++,
        })
      }
      return next
    })
  }, [])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent | ClipboardEvent, target: PasteTarget) => {
      if (isRunning) return
      const dt = e.clipboardData
      if (!dt) return
      const files = getImageFilesFromDataTransfer(dt)
      if (files.length === 0) return
      e.preventDefault()
      if (target === 'fabric') setFabricFromFile(files[0])
      else addTargetFiles(files)
    },
    [addTargetFiles, isRunning, setFabricFromFile],
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
    if (!fabricSource) {
      alert('请先上传「布料图」（第 1 步）。')
      return
    }
    if (jobs.length === 0) {
      alert('请至少上传一张「要换布的照片」（第 2 步）。')
      return
    }

    const queue = jobs.filter((j) => j.status !== 'running')
    if (queue.length === 0) {
      alert('当前没有可执行的任务。')
      return
    }

    cancelRef.current = false
    setIsRunning(true)

    const fullPrompt = [
      buildFabricTransferPrompt(queue.length > 1),
      DEFAULT_PROMPT_SUFFIX,
      promptExtra.trim(),
    ]
      .filter(Boolean)
      .join('\n\n')

    let fabricPayload: string
    try {
      fabricPayload = await encodeImage(fabricSource.file)
    } catch (e) {
      setIsRunning(false)
      alert(e instanceof Error ? e.message : String(e))
      return
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
        const targetPayload = await encodeImage(job.file)

        const genBody: GenerationsBody = {
          model: model.trim() || DEFAULT_MODEL,
          prompt: fullPrompt,
          size,
          aspect_ratio: aspectRatio,
          image: [fabricPayload, targetPayload],
        }

        const { imageDataUrl } = await postImagesGenerations(base, token, genBody, ac.signal)

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
    fabricSource,
    jobs,
    model,
    promptExtra,
    size,
    updateJob,
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

  const canStart = Boolean(fabricSource && jobs.length > 0 && apiToken.trim())

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

      <ol className="steps-overview" aria-label="使用步骤">
        <li className={apiToken.trim() ? 'done' : ''}>
          <span className="step-num">1</span>
          <span>填写密钥</span>
        </li>
        <li className={fabricSource ? 'done' : ''}>
          <span className="step-num">2</span>
          <span>上传布料图</span>
        </li>
        <li className={jobs.length > 0 ? 'done' : ''}>
          <span className="step-num">3</span>
          <span>上传要换的图</span>
        </li>
        <li>
          <span className="step-num">4</span>
          <span>生成同款图</span>
        </li>
      </ol>

      <div className="app-body">
        <aside className="panel panel-settings">
          <h2 className="panel-heading">连接设置</h2>
          <div className="field">
            <label htmlFor="token">API 密钥</label>
            <input
              id="token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="粘贴你的 sk- 密钥"
              autoComplete="off"
            />
            <p className="field-hint">只保存在本机浏览器，勿在公共电脑使用。</p>
          </div>

          <details className="settings-advanced">
            <summary>高级选项（一般不用改）</summary>
            <div className="settings-advanced-body">
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
                <p className="field-hint">本地若报跨域，可填 http://localhost:5173/t8proxy</p>
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
              <div className="row2">
                <div className="field">
                  <label htmlFor="size">输出尺寸</label>
                  <select id="size" value={size} onChange={(e) => setSize(e.target.value)}>
                    {SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="aspect">画面比例</label>
                  <select id="aspect" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                    {ASPECT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="extra">补充要求（可选）</label>
                <textarea
                  id="extra"
                  value={promptExtra}
                  onChange={(e) => setPromptExtra(e.target.value)}
                  placeholder="例如：棕褐色叶子印花、白底，颜色与布料图完全一致；不要牛仔拼布。"
                  rows={3}
                />
              </div>
            </div>
          </details>
        </aside>

        <main className="panel-main">
          <section
            className={`step-card paste-zone${pasteTarget === 'fabric' ? ' paste-zone-active' : ''}${fabricSource ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('fabric')}
            onMouseDown={() => setPasteTarget('fabric')}
            onPaste={(e) => handlePaste(e, 'fabric')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 1 步</span>
              <h2>上传「布料图」</h2>
            </div>
            <p className="step-desc">
              这一张定义「这一套衣服」长什么样：<strong>花纹 + 颜色</strong>固定不变，后面所有模特图都穿同一款布。推荐平铺布料/衣服特写。
            </p>
            <ul className="tip-list">
              <li>换另一款布时，先点「重新选择」换掉布料图，并建议清空下方目标图后重传</li>
              <li>目标图里原来的碎花、牛仔拼布等会被替换，不会保留</li>
            </ul>

            <div className="upload-card">
              <div className={`preview-box${fabricSource ? '' : ' empty'}`}>
                {fabricSource ? (
                  <img src={fabricSource.previewObjectUrl} alt="布料图预览" />
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

          <section
            className={`step-card paste-zone${pasteTarget === 'target' ? ' paste-zone-active' : ''}${jobs.length > 0 ? ' step-card-done' : ''}`}
            tabIndex={0}
            onFocus={() => setPasteTarget('target')}
            onMouseDown={() => setPasteTarget('target')}
            onPaste={(e) => handlePaste(e, 'target')}
          >
            <div className="step-card-head">
              <span className="step-badge">第 2 步</span>
              <h2>上传「要换布的照片」</h2>
            </div>
            <p className="step-desc">
              可一次传多张（不同姿势、不同场景）。每张只换布，效果要像<strong>同一套衣服隔几天又拍了一张</strong>——看花色的客人不会觉得是两件货。
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

          <section className="step-card step-card-action">
            <div className="step-card-head">
              <span className="step-badge step-badge-accent">第 3 步</span>
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
                  ? '请先在左侧填写 API 密钥'
                  : !fabricSource
                    ? '请先完成第 1 步'
                    : '请先完成第 2 步'}
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
                  <article key={job.id} className="job-card">
                    <div className="job-card-head">
                      <span className="job-name" title={job.file.name}>
                        {job.file.name}
                      </span>
                      <span className={`status status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
                    </div>
                    <div className="job-images">
                      <figure>
                        <img src={job.previewObjectUrl} alt="原图" />
                        <figcaption>原图</figcaption>
                      </figure>
                      <figure>
                        {job.resultDataUrl ? (
                          <img src={job.resultDataUrl} alt="换布后" />
                        ) : (
                          <span className="result-placeholder">
                            {job.status === 'running' ? '生成中…' : job.status === 'error' ? '生成失败' : '等待生成'}
                          </span>
                        )}
                        <figcaption>换布后</figcaption>
                      </figure>
                    </div>
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
      </div>
    </div>
  )
}
