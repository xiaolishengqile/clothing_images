import { getImageDimensions } from './imageAspect'

export type TargetImageWarningCode =
  | 'possible_swatch'
  | 'partial_crop'
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
  } catch {
    /* 分析失败时仅依赖尺寸启发 */
  }

  return { warnings }
}

const PROMPT_BACK_VIEW_LOCK = `BACK VIEW: image 2 is back-facing — output stays back-facing with the same pose and framing.
Show only the back of the garment (back neck, back yoke, back sleeves). Forbidden: flip to front or mirror to reveal the front.
Still replace back cloth with image 1 fabric.`

/** 按检测结果为单张任务追加英文约束 */
export function buildPerJobPromptSuffix(
  warnings: TargetImageWarning[],
  isBackView = false,
): string {
  const parts: string[] = []
  if (isBackView) {
    parts.push(PROMPT_BACK_VIEW_LOCK)
  }
  if (warnings.length === 0 && parts.length === 0) return ''
  if (warnings.some((w) => w.code === 'possible_swatch')) {
    parts.push(
      'Image 2 looks like a swatch: apply image 1 textile only to cloth already visible; do not invent outfits, models, or new layouts.',
    )
  }
  if (warnings.some((w) => w.code === 'partial_crop')) {
    parts.push(
      'Keep identical crop and framing as image 2; no outpainting or completing partial garments.',
    )
  }
  if (warnings.some((w) => w.code === 'low_resolution')) {
    parts.push('Preserve image 2 sharpness; do not upscale or invent fine detail.')
  }
  return parts.join('\n\n')
}
