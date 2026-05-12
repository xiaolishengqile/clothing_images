import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { postImagesGenerations } from './api/imagesGenerations'
import {
  ASPECT_OPTIONS,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  MAX_BATCH_CONCURRENCY,
  SIZE_OPTIONS,
  STORAGE_KEY_ASPECT,
  STORAGE_KEY_BASE,
  STORAGE_KEY_ENCODE,
  STORAGE_KEY_PROMPT,
  STORAGE_KEY_SIZE,
  STORAGE_KEY_TOKEN,
} from './lib/constants'
import { dataURLToRawBase64, readFileAsDataURL } from './lib/files'
import './App.css'

type JobStatus = 'queued' | 'running' | 'done' | 'error'

interface Job {
  id: string
  file: File
  previewObjectUrl: string
  status: JobStatus
  error?: string
  resultDataUrl?: string
  rawJson?: unknown
  /** 加入列表顺序，用于未完成任务排序 */
  addedSeq: number
  /** 完成时间戳，用于「先完成的先显示」 */
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
  const [encodeMode, setEncodeMode] = useState<'dataurl' | 'raw'>(() =>
    (localStorage.getItem(STORAGE_KEY_ENCODE) as 'dataurl' | 'raw') === 'raw' ? 'raw' : 'dataurl',
  )

  const [jobs, setJobs] = useState<Job[]>([])
  const addedSeqRef = useRef(0)
  const [isRunning, setIsRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [logExpanded, setLogExpanded] = useState(false)

  const cancelRef = useRef(false)
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
    localStorage.setItem(STORAGE_KEY_ENCODE, encodeMode)
  }, [encodeMode])

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }, [])

  const addFiles = useCallback((list: FileList | File[]) => {
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

  const runBatch = useCallback(async () => {
    const token = apiToken.trim()
    if (!token) {
      alert('请填写 API Token（Bearer）。')
      return
    }
    const base = apiBase.trim()
    if (!base) {
      alert('请填写 API 地址。')
      return
    }

    if (jobs.length === 0) {
      alert('请先上传图片。')
      return
    }
    /** 含已完成：不满意时可再次「开始生成」整批重跑；运行中除外 */
    const queue = jobs.filter((j) => j.status !== 'running')
    if (queue.length === 0) {
      alert('当前没有可执行的任务。')
      return
    }

    cancelRef.current = false
    setIsRunning(true)

    const fullPrompt = [DEFAULT_PROMPT, promptExtra.trim()].filter(Boolean).join('\n\n')

    const runOne = async (job: Job) => {
      if (cancelRef.current) return
      updateJob(job.id, {
        status: 'running',
        error: undefined,
        resultDataUrl: undefined,
        rawJson: undefined,
        completedAt: undefined,
      })
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const dataUrl = await readFileAsDataURL(job.file)
        const imagePayload =
          encodeMode === 'raw' ? [dataURLToRawBase64(dataUrl)] : [dataUrl]

        const { imageDataUrl, rawJson } = await postImagesGenerations(
          base,
          token,
          {
            model: model.trim() || DEFAULT_MODEL,
            prompt: fullPrompt,
            size,
            aspect_ratio: aspectRatio,
            image: imagePayload,
          },
          ac.signal,
        )
        updateJob(job.id, {
          status: 'done',
          resultDataUrl: imageDataUrl,
          rawJson,
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

    /** 与待处理张数一致，最多同时 MAX_BATCH_CONCURRENCY 路 */
    const n = Math.min(MAX_BATCH_CONCURRENCY, Math.max(1, queue.length))
    let cursor = 0

    const worker = async () => {
      for (;;) {
        if (cancelRef.current) return
        const my = cursor++
        if (my >= queue.length) return
        const job = queue[my]
        await runOne(job)
      }
    }

    await Promise.all(Array.from({ length: n }, () => worker()))

    abortRef.current = null
    setIsRunning(false)
  }, [apiBase, apiToken, aspectRatio, encodeMode, jobs, model, promptExtra, size, updateJob])

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

  const downloadOne = (job: Job) => {
    if (!job.resultDataUrl) return
    const a = document.createElement('a')
    a.href = job.resultDataUrl
    const stem = safeBaseName(job.file.name.replace(/\.[^.]+$/, ''))
    a.download = `${stem}_product.${extensionFromMime(job.file)}`
    a.click()
  }

  const downloadZip = async () => {
    const done = jobs.filter((j) => j.status === 'done' && j.resultDataUrl)
    if (done.length === 0) {
      alert('没有已完成的图片可打包。')
      return
    }
    const zip = new JSZip()
    for (const job of done) {
      const res = await fetch(job.resultDataUrl!)
      const blob = await res.blob()
      const stem = safeBaseName(job.file.name.replace(/\.[^.]+$/, ''))
      zip.file(`${stem}_product.png`, blob)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    saveAs(out, `product-shots-${new Date().toISOString().slice(0, 10)}.zip`)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>服装白底商品图 · 批量生成</h1>
        <p>
          将模特架实拍图转为电商幽灵人体白底图。调用中转站{' '}
          <code>{DEFAULT_API_BASE}</code> 的 <code>/v1/images/generations</code>（模型如{' '}
          <code>gpt-image-2</code>）。若浏览器报 CORS 错误，需中转站开启跨域或使用可禁用 CORS 的本地插件调试。
        </p>
      </header>

      <div className="app-body">
        <aside className="panel">
          <div className="section-title">接口</div>
          <div className="field">
            <label htmlFor="base">API Base URL</label>
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
            <label htmlFor="token">API Token（Bearer）</label>
            <input
              id="token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
            <p className="field-hint">仅保存在本机浏览器 localStorage，请勿在公共电脑使用。</p>
          </div>
          <div className="field">
            <label htmlFor="model">模型 model</label>
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
              <label htmlFor="size">size</label>
              <select id="size" value={size} onChange={(e) => setSize(e.target.value)}>
                {SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="aspect">aspect_ratio</label>
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
            <label>参考图编码</label>
            <select value={encodeMode} onChange={(e) => setEncodeMode(e.target.value as 'dataurl' | 'raw')}>
              <option value="dataurl">Data URL（推荐，含 data:image/... 前缀）</option>
              <option value="raw">仅 Base64 字符串</option>
            </select>
            <p className="field-hint">若接口报错可切换为「仅 Base64」重试。</p>
          </div>

          <p className="field-hint">
            并发：与当前待生成张数相同，最多同时 {MAX_BATCH_CONCURRENCY} 张；先完成的会排在列表最前。
          </p>

          <div className="section-title">提示词追加</div>
          <div className="field">
            <label htmlFor="extra">附加说明（可选）</label>
            <textarea
              id="extra"
              value={promptExtra}
              onChange={(e) => setPromptExtra(e.target.value)}
              placeholder="例如：保留浅蓝与绿色印花；V 领与胸前扭结结构与参考图一致。"
            />
            <p className="field-hint">
              已在后台拼接英文主提示词（白底、幽灵人体、无支架、保留与上传图相同的拍摄角度：背面/侧面等不强行转正）。此处可写中文或英文补充。
            </p>
          </div>
        </aside>

        <main className="panel-main">
          <div className="toolbar">
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              选择图片
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isRunning}
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" className="btn btn-primary" disabled={isRunning} onClick={() => void runBatch()}>
              开始生成
            </button>
            <button type="button" className="btn btn-ghost" disabled={!isRunning} onClick={stopRun}>
              停止
            </button>
            <button type="button" className="btn btn-secondary" disabled={isRunning || jobs.length === 0} onClick={clearJobs}>
              清空列表
            </button>
            <button type="button" className="btn btn-secondary" disabled={isRunning} onClick={() => void downloadZip()}>
              下载 ZIP（已完成）
            </button>
          </div>

          <div
            className={`dropzone${dragOver ? ' drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
            }}
          >
            <strong>拖拽图片到此处</strong>
            <span>支持多选；仅处理 image/*</span>
          </div>

          {jobs.length === 0 ? (
            <p className="field-hint" style={{ marginTop: '1.5rem' }}>
              上传后每张图会显示原图与生成结果；不满意或失败时，可改提示词或 Token 后再次点击「开始生成」重新生成（含已成功的也会整批重跑）。
            </p>
          ) : (
            <>
              <p className="section-title">任务 {jobs.length} 张（已完成优先按完成顺序显示）</p>
              <div className="job-grid">
                {displayJobs.map((job) => (
                  <article key={job.id} className="job-card">
                    <div className="job-card-head">
                      <span title={job.file.name}>{job.file.name}</span>
                      <span className={`status status-${job.status}`}>{job.status}</span>
                    </div>
                    <div className="job-images">
                      <figure>
                        <img src={job.previewObjectUrl} alt="原图" />
                        <figcaption>原图</figcaption>
                      </figure>
                      <figure>
                        {job.resultDataUrl ? (
                          <img src={job.resultDataUrl} alt="生成" />
                        ) : (
                          <span className="field-hint" style={{ padding: '0.5rem' }}>
                            {job.status === 'running' ? '生成中…' : '—'}
                          </span>
                        )}
                        <figcaption>生成</figcaption>
                      </figure>
                    </div>
                    {job.error ? <div className="job-error">{job.error}</div> : null}
                    <div className="job-actions">
                      <button type="button" className="btn btn-ghost" disabled={isRunning} onClick={() => removeJob(job.id)}>
                        移除
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={!job.resultDataUrl}
                        onClick={() => downloadOne(job)}
                      >
                        下载此张
                      </button>
                      {job.rawJson ? (
                        <details className="raw" style={{ width: '100%' }}>
                          <summary>原始响应 JSON</summary>
                          <pre>{JSON.stringify(job.rawJson, null, 2)}</pre>
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          <div className="section-title">调试</div>
          <button type="button" className="btn btn-ghost" onClick={() => setLogExpanded((v) => !v)}>
            {logExpanded ? '收起' : '展开'}主提示词预览
          </button>
          {logExpanded ? (
            <pre
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: 'var(--input-bg)',
                borderRadius: 8,
                fontSize: '0.75rem',
                overflow: 'auto',
                maxHeight: 200,
              }}
            >
              {DEFAULT_PROMPT}
            </pre>
          ) : null}
        </main>
      </div>
    </div>
  )
}
