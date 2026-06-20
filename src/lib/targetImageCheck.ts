import { getImageDimensions } from './imageAspect'

export type TargetImageWarningCode =
  | 'possible_swatch'
  | 'partial_crop'
  | 'tight_crop'
  | 'low_resolution'

export interface TargetImageWarning {
  code: TargetImageWarningCode
  message: string
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
      reject(new Error('无法分析图片'))
    }
    img.src = url
  })
}

function isBackgroundPixel(r: number, g: number, b: number): boolean {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum > 235) return true
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min < 18 && lum > 200
}

/** 四边是否几乎被布料/印花填满（像布样特写而非白底商品图） */
async function looksLikeEdgeToEdgeFabric(file: File): Promise<boolean> {
  const img = await loadImageElement(file)
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  let borderTotal = 0
  let borderFabric = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x > 2 && x < size - 3 && y > 2 && y < size - 3) continue
      const i = (y * size + x) * 4
      borderTotal++
      if (!isBackgroundPixel(data[i], data[i + 1], data[i + 2])) borderFabric++
    }
  }
  if (borderTotal === 0) return false
  return borderFabric / borderTotal > 0.82
}

/** 主体是否贴近画面边缘（局部/特写构图，易被模型补全） */
async function looksLikeTightCrop(file: File): Promise<boolean> {
  const img = await loadImageElement(file)
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  const edgeBand = 4
  let edgeTotal = 0
  let edgeSubject = 0
  let centerTotal = 0
  let centerSubject = 0

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const isBg = isBackgroundPixel(data[i], data[i + 1], data[i + 2])
      const onEdge =
        x < edgeBand || x >= size - edgeBand || y < edgeBand || y >= size - edgeBand
      if (onEdge) {
        edgeTotal++
        if (!isBg) edgeSubject++
      } else {
        centerTotal++
        if (!isBg) centerSubject++
      }
    }
  }
  if (edgeTotal === 0 || centerTotal === 0) return false

  const edgeFill = edgeSubject / edgeTotal
  const centerFill = centerSubject / centerTotal
  // 边缘也有大量主体 + 中心主体占比高 → 特写/裁切构图
  return edgeFill > 0.38 && centerFill > 0.42 && edgeFill > centerFill * 0.55
}

export interface TargetImageCheckResult {
  warnings: TargetImageWarning[]
}

export async function checkTargetImage(file: File): Promise<TargetImageCheckResult> {
  const warnings: TargetImageWarning[] = []
  const { width, height } = await getImageDimensions(file)
  const minSide = Math.min(width, height)
  const maxSide = Math.max(width, height)
  const ratio = width / height

  if (minSide < 480) {
    warnings.push({
      code: 'low_resolution',
      message: '分辨率偏低，易被放大重绘',
    })
  }

  if (maxSide / minSide > 2.15) {
    warnings.push({
      code: 'partial_crop',
      message: '窄条/局部构图，模型可能补全为全图',
    })
  } else if (maxSide / minSide > 1.65 && minSide < 900) {
    warnings.push({
      code: 'partial_crop',
      message: '非标准商品构图，请尽量用完整平铺或模特图',
    })
  }

  const nearSquare = ratio >= 0.82 && ratio <= 1.22
  if (nearSquare && maxSide < 1500) {
    warnings.push({
      code: 'possible_swatch',
      message: '可能为布样特写，应放在第1步布料图',
    })
  }

  try {
    if (nearSquare && (await looksLikeEdgeToEdgeFabric(file))) {
      const has = warnings.some((w) => w.code === 'possible_swatch')
      if (!has) {
        warnings.push({
          code: 'possible_swatch',
          message: '画面像布样满框拍摄，勿作为目标图',
        })
      }
    }

    if (!warnings.some((w) => w.code === 'partial_crop') && (await looksLikeTightCrop(file))) {
      warnings.push({
        code: 'tight_crop',
        message: '特写/裁切构图，模型可能补全为全身、加配饰或改变版型',
      })
    }
  } catch {
    /* 分析失败时仅依赖尺寸启发 */
  }

  return { warnings }
}

const PROMPT_BACK_VIEW_LOCK = `The target image is a back view, and the result must stay a back view.
Show only the back garment structure. Do not flip it to the front or mirror front details as the back.`

const PROMPT_FRONT_VIEW_LOCK = `The target image is a front view, and the result must stay a front view.
Show only the front garment structure. Do not flip it to the back or treat back structure as the front.`

const PROMPT_STRICT_FRAMING = `Keep the target image's original crop, aspect ratio, subject size, and visible area.
Do not expand the frame, complete missing body or garment parts, or add shoes, bags, jewelry, props, or background elements.`

const PROMPT_STRICT_FIT = `Keep the target garment's original outer silhouette, waist width, ease, and drape.
Do not slim the waist, tighten the fit, change looseness, or beautify the silhouette. Replace only the fabric surface.`

export interface BuildPerJobPromptOptions {
  warnings: TargetImageWarning[]
  isFrontView?: boolean
  isBackView?: boolean
  isStrictFraming?: boolean
  /** 编辑接口：第一张=目标，第二张=布 */
  forEdits?: boolean
}

/** Append short per-job constraints based on image checks */
export function buildPerJobPromptSuffix(
  warningsOrOptions: TargetImageWarning[] | BuildPerJobPromptOptions,
  isBackViewLegacy = false,
): string {
  const opts: BuildPerJobPromptOptions = Array.isArray(warningsOrOptions)
    ? { warnings: warningsOrOptions, isBackView: isBackViewLegacy }
    : warningsOrOptions
  const { warnings, isFrontView = false, isBackView = false, isStrictFraming = false, forEdits = false } = opts

  const parts: string[] = []
  if (isFrontView) {
    parts.push(PROMPT_FRONT_VIEW_LOCK)
  }
  if (isBackView) {
    parts.push(PROMPT_BACK_VIEW_LOCK)
  }
  if (isStrictFraming) {
    parts.push(PROMPT_STRICT_FRAMING)
    parts.push(PROMPT_STRICT_FIT)
  }

  const targetLabel = forEdits ? 'the first target image' : 'the target image'
  const fabricLabel = forEdits ? 'the second reference image' : 'the reference image'

  if (warnings.some((w) => w.code === 'possible_swatch')) {
    parts.push(
      `${targetLabel} looks like a fabric swatch or close-up. Apply only the fabric surface from ${fabricLabel} to the existing garment/fabric area. Do not generate a new garment, model, or layout.`,
    )
  }
  if (warnings.some((w) => w.code === 'partial_crop' || w.code === 'tight_crop')) {
    parts.push(
      `Keep the original crop and composition of ${targetLabel}. Do not expand the frame, complete partial garment areas, or add shoes, bags, or accessories.`,
    )
    parts.push(
      `Keep the original fit, ease, waist width, and outer silhouette of ${targetLabel}. Do not slim, tighten, or beautify the silhouette.`,
    )
  }
  if (warnings.some((w) => w.code === 'low_resolution')) {
    parts.push(`Keep ${targetLabel} clear and natural. Do not invent extra detail.`)
  }
  return parts.join('\n\n')
}
