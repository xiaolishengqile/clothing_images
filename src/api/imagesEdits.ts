import { parseGenerationImage } from './imagesGenerations'
import { extractErrorMessage } from '../lib/extractErrorMessage'

export interface EditsBody {
  model: string
  prompt: string
  size: string
  /** 第一张为待编辑目标图，第二张为布料参考 */
  images: File[]
}

export async function postImagesEdits(
  baseUrl: string,
  bearerToken: string,
  body: EditsBody,
  signal?: AbortSignal,
): Promise<{ imageDataUrl: string; rawJson: unknown }> {
  const base = baseUrl.replace(/\/$/, '')
  const url = `${base}/v1/images/edits`

  const form = new FormData()
  form.append('model', body.model)
  form.append('prompt', body.prompt)
  form.append('size', body.size)
  for (const file of body.images) {
    form.append('image', file, file.name)
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
    body: form,
    signal,
  })

  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`响应不是合法 JSON（HTTP ${res.status}）：${text.slice(0, 280)}`)
  }

  if (!res.ok) {
    const hint = extractErrorMessage(json) ?? text.slice(0, 400)
    throw new Error(`HTTP ${res.status}: ${hint}`)
  }

  const imageDataUrl = await parseGenerationImage(json)
  return { imageDataUrl, rawJson: json }
}
