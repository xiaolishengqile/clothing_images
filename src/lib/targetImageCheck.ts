import { getImageDimensions } from './imageAspect'

export type TargetImageWarningCode =
  | 'possible_swatch'
  | 'partial_crop'
  | 'low_resolution'
  | 'back_view'

const BACK_VIEW_NAME_RE = /背面|后背|后面|后片|back|rear|behind/i

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

function isSkinLike(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 15) return false
  return r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 12
}

/** 文件名是否暗示背面图 */
export function guessBackViewFromFileName(name: string): boolean {
  return BACK_VIEW_NAME_RE.test(name)
}

/**
 * 启发式：画面上方中心少见肤色、以服装为主 → 可能是背面/无正脸
 */
async function looksLikeBackGarmentShot(file: File): Promise<boolean> {
  const img = await loadImageElement(file)
  const w = 80
  const h = Math.round(80 * (img.naturalHeight / img.naturalWidth))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  let topSkin = 0
  let topFabric = 0
  let topTotal = 0
  const topEnd = Math.floor(h * 0.42)
  const xStart = Math.floor(w * 0.22)
  const xEnd = Math.floor(w * 0.78)

  for (let y = 0; y < topEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * w + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      topTotal++
      if (isSkinLike(r, g, b)) topSkin++
      else if (!isBackgroundPixel(r, g, b)) topFabric++
    }
  }
  if (topTotal === 0) return false
  const skinRatio = topSkin / topTotal
  const fabricRatio = topFabric / topTotal
  return skinRatio < 0.012 && fabricRatio > 0.28
}

export interface TargetImageCheckResult {
  warnings: TargetImageWarning[]
  /** 建议按背面图生成（可用户在卡片上取消勾选） */
  suggestBackView: boolean
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

  let suggestBackView = guessBackViewFromFileName(file.name)
  if (!suggestBackView) {
    try {
      suggestBackView = await looksLikeBackGarmentShot(file)
    } catch {
      suggestBackView = false
    }
  }

  if (suggestBackView) {
    warnings.push({
      code: 'back_view',
      message: '背面图：已锁定背面视角',
    })
  }

  return { warnings, suggestBackView }
}

const PROMPT_BACK_VIEW_LOCK = `BACK VIEW MANDATORY — image 2 is a BACK-FACING product shot:
- Output MUST keep the EXACT same back-facing camera angle, pose, and framing as image 2.
- Show ONLY the back of the garment: back neckline, back yoke, back seams, back of sleeves — exactly as in image 2.
- Forbidden: rotating to front view, showing front V-neck, front buttons, front-facing flat lay, or any front garment details not visible in image 2.
- Forbidden: mirroring/flipping to reveal the front. The customer must still see the BACK of the product.
- Change ONLY fabric print/colors on back surfaces visible in image 2; all other pixels unchanged.`

/** 按检测结果为单张任务追加英文约束 */
export function buildPerJobPromptSuffix(
  warnings: TargetImageWarning[],
  isBackView = false,
): string {
  const parts: string[] = []
  if (isBackView || warnings.some((w) => w.code === 'back_view')) {
    parts.push(PROMPT_BACK_VIEW_LOCK)
  }
  if (warnings.length === 0 && parts.length === 0) return ''
  if (warnings.some((w) => w.code === 'possible_swatch')) {
    parts.push(
      'SWATCH TARGET: Image 2 is fabric-only or swatch-like. Forbidden: inventing flat-lay outfits, extra garments, models, or new layouts. Only apply image 1 textile to cloth already visible in image 2 — if image 2 is only a swatch, change ONLY that swatch surface.',
    )
  }
  if (warnings.some((w) => w.code === 'partial_crop')) {
    parts.push(
      'CROP LOCK: Identical crop, zoom, and framing as image 2. Forbidden: outpainting, zooming out, completing partial garment to full garment, adding missing sleeves/hem/body.',
    )
  }
  if (warnings.some((w) => w.code === 'low_resolution')) {
    parts.push(
      'No upscaling reinterpretation: preserve image 2 sharpness and detail level; do not hallucinate new fine detail.',
    )
  }
  return parts.join('\n\n')
}
