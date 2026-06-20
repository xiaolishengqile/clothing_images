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

const PROMPT_BACK_VIEW_LOCK = `目标图是背面，结果也必须保持背面。
只显示衣服背面结构，不要翻成正面或镜像出正面。`

const PROMPT_FRONT_VIEW_LOCK = `目标图是正面，结果也必须保持正面。
只显示衣服正面结构，不要翻成背面或把背面结构当正面。`

const PROMPT_STRICT_FRAMING = `保持目标图原裁切、比例、主体大小和可见范围。
不要扩图、补全身体或衣服，不要新增鞋、包、首饰、道具或背景元素。`

const PROMPT_STRICT_FIT = `保持目标图原有衣服外轮廓、腰宽、松量和垂坠。
不要收腰、修身、改宽松度或美化版型，只替换布面。`

export interface BuildPerJobPromptOptions {
  warnings: TargetImageWarning[]
  isFrontView?: boolean
  isBackView?: boolean
  isStrictFraming?: boolean
  /** 编辑接口：第一张=目标，第二张=布 */
  forEdits?: boolean
}

/** 按检测结果为单张任务追加简短中文约束 */
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

  const targetLabel = forEdits ? '第一张目标图' : '目标图'
  const fabricLabel = forEdits ? '第二张参考图' : '参考图'

  if (warnings.some((w) => w.code === 'possible_swatch')) {
    parts.push(
      `${targetLabel}像布样或局部图；只把${fabricLabel}布面换到已有衣服/布面区域，不要生成新衣服、模特或新布局。`,
    )
  }
  if (warnings.some((w) => w.code === 'partial_crop' || w.code === 'tight_crop')) {
    parts.push(
      `保持${targetLabel}原裁切和构图，不要扩图、补全局部衣服或新增鞋包配饰。`,
    )
    parts.push(
      `保持${targetLabel}原版型、松量、腰宽和外轮廓，不要收腰、修身或美化轮廓。`,
    )
  }
  if (warnings.some((w) => w.code === 'low_resolution')) {
    parts.push(`保持${targetLabel}清晰自然，不要凭空增加细节。`)
  }
  return parts.join('\n\n')
}
