import { blobToDataURL } from '../lib/files'

function stripTrailingSlash(u: string): string {
  return u.replace(/\/$/, '')
}

function pickHostedUrl(data: unknown): string {
  if (typeof data === 'string' && /^https?:\/\//i.test(data)) {
    return data
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const k of ['url', 'file_url', 'fileUrl', 'link']) {
      const v = o[k]
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
    }
  }
  throw new Error(`上传返回 data 无法解析为公网 URL：${JSON.stringify(data).slice(0, 160)}`)
}

/**
 * 302.AI Upload-File：multipart 上传，返回可公网访问的 URL（用于 Removebg 的 image_url）。
 * @see https://doc-en.302.ai/232502112e0
 */
export async function uploadFile302(
  baseUrl: string,
  bearerToken: string,
  file: Blob,
  filename: string,
  signal?: AbortSignal,
): Promise<string> {
  const base = stripTrailingSlash(baseUrl)
  const url = `${base}/upload-file`
  const fd = new FormData()
  fd.append('file', file, filename)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
    body: fd,
    signal,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`上传响应不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`)
  }

  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message?: unknown }).message)
        : text.slice(0, 300)
    throw new Error(`上传失败 HTTP ${res.status}: ${msg}`)
  }

  if (!json || typeof json !== 'object') {
    throw new Error('上传响应格式异常')
  }
  const o = json as Record<string, unknown>
  const code = o.code
  if (typeof code === 'number' && code !== 0 && code !== 200) {
    throw new Error(`上传业务错误 code=${code}: ${String(o.message ?? '')}`)
  }
  return pickHostedUrl(o.data)
}

export interface RemovebgV3Response {
  rawJson: unknown
  resultDataUrl: string
}

/**
 * 302.AI Removebg-V3：根据公网 image_url 去背，返回透明图 data URL。
 * @see https://doc.302.ai/api-300431514
 */
export async function postRemovebgV3(
  baseUrl: string,
  bearerToken: string,
  imageUrl: string,
  signal?: AbortSignal,
): Promise<RemovebgV3Response> {
  const base = stripTrailingSlash(baseUrl)
  const url = `${base}/302/submit/removebg-v3`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
    body: JSON.stringify({ image_url: imageUrl }),
    signal,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Removebg 响应不是 JSON（HTTP ${res.status}）：${text.slice(0, 280)}`)
  }

  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'detail' in json
        ? String((json as { detail?: unknown }).detail)
        : text.slice(0, 400)
    throw new Error(`Removebg HTTP ${res.status}: ${msg}`)
  }

  if (!json || typeof json !== 'object') {
    throw new Error('Removebg 响应不是对象')
  }
  const root = json as Record<string, unknown>
  const img = root.image
  if (!img || typeof img !== 'object') {
    throw new Error('Removebg 响应缺少 image 字段')
  }
  const outUrl = (img as Record<string, unknown>).url
  if (typeof outUrl !== 'string' || !outUrl.startsWith('http')) {
    throw new Error('Removebg 响应 image.url 无效')
  }

  const imgRes = await fetch(outUrl, { signal })
  if (!imgRes.ok) {
    throw new Error(`下载去背图失败 HTTP ${imgRes.status}`)
  }
  const blob = await imgRes.blob()
  const resultDataUrl = await blobToDataURL(blob)
  return { rawJson: json, resultDataUrl }
}

/** 上传本地生成图 → Removebg → 透明 data URL；任一步失败则抛错由调用方降级 */
export async function removeBackgroundFromDataUrl(
  base302: string,
  bearerToken: string,
  sourceDataUrl: string,
  signal?: AbortSignal,
): Promise<RemovebgV3Response> {
  const sourceRes = await fetch(sourceDataUrl)
  const blob = await sourceRes.blob()
  const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
  const hosted = await uploadFile302(base302, bearerToken, blob, `gen.${ext}`, signal)
  return postRemovebgV3(base302, bearerToken, hosted, signal)
}
