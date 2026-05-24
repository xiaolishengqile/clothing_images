export const DEFAULT_API_BASE = 'https://ai.t8star.cn'

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

/** 换布任务（最高优先级，放在最前） */
const PROMPT_PRIMARY_TASK = `TASK — garment fabric replacement (mandatory):
Replace ALL visible garment cloth in image 2 with the textile from image 1.
Image 1 = sole authority for cloth color, print, and surface texture.
Image 2 = scene template; ONLY garment cloth pixels may change.
Output must clearly show image 2's garments wearing image 1's fabric.
Keeping image 2's original print or colors on cloth is incorrect.`

const PROMPT_IMAGE_ROLES = `Image order:
1. FIRST image — master fabric / SKU swatch. Read cloth ONLY from garment surfaces in this image (ignore face, skin, body, background, props, lighting, and garment silhouette/cut).
2. SECOND image — product photo to edit. Defines scene, model presence, pose, framing, and garment construction.`

const PROMPT_FABRIC_RULES = `Fabric from image 1 (including solid / low-print cloth):
- Printed fabric: copy exact motif layout, repeat, and color palette onto image 2 cloth.
- Solid, tonal, heather, or texture-only fabric: copy exact hue, brightness, and surface texture; image 2 cloth becomes that solid/tonal look — still a full replacement, not a subtle tint.
- If image 1 is a full-outfit flat lay: sample textile from the main top/shirt cloth only; do NOT import image 1's pants, layout, or garment shape.
- Map image 1 textile onto image 2 like a fixed swatch: warp for folds and perspective only.
- Forbidden: keeping or blending image 2's old print; "no pattern in image 1" is NOT a reason to keep image 2's pattern.`

const PROMPT_PRESERVE = `Preserve from image 2 (everything except garment cloth):
- Background, props, accessories, shadows, crop, aspect ratio, and composition.
- Model rule: no person in image 2 → no person in output; if a person exists → same identity, face, hair, pose (unchanged except cloth).
- View rule: same angle and orientation (front/back/flat lay); never flip back to front.`

/** 构图锁定：防止局部图补全为全身、加配饰、改取景 */
export const PROMPT_FRAMING_LOCK = `FRAMING LOCK — image 2 canvas is sacred (mandatory):
- Output MUST match image 2 pixel-for-pixel in layout: same crop, zoom, margins, subject scale, and visible body parts.
- If image 2 shows only upper torso / partial garment / close-up — output stays that exact partial view. Forbidden: outpainting, zooming out, completing missing limbs, or turning partial into full-body.
- Forbidden: adding shoes, bags, jewelry, extra props, or background elements not in image 2.
- Forbidden: changing camera distance or reframing. Only garment cloth texture/color may change.`

const PROMPT_EDIT_IMAGE_ROLES = `Edit mode — image order:
1. FIRST image — product photo to edit (base canvas). Defines scene, pose, framing, and garment construction. Preserve this layout exactly.
2. SECOND image — master fabric / SKU swatch. Read cloth color, print, and texture ONLY from garment surfaces in this image.`

/** 编辑接口专用提示词（第一张=目标图，第二张=布料图） */
export function buildFabricTransferPromptForEdits(multiTarget = false): string {
  const primaryTask = `TASK — garment fabric replacement on the base image (mandatory):
Replace ALL visible garment cloth in the FIRST image with the textile from the SECOND image.
The SECOND image = sole authority for cloth color, print, and surface texture.
The FIRST image = scene template; ONLY garment cloth pixels may change.
Output must clearly show the FIRST image's garments wearing the SECOND image's fabric.
Keeping the FIRST image's original print or colors on cloth is incorrect.`

  const fabricRules = PROMPT_FABRIC_RULES.replace(/image 1/g, 'the SECOND image').replace(
    /image 2/g,
    'the FIRST image',
  )
  const structureLock = PROMPT_GARMENT_STRUCTURE_LOCK.replace(/image 2/g, 'the FIRST image').replace(
    /image 1/g,
    'the SECOND image',
  )
  const fitLock = PROMPT_GARMENT_FIT_LOCK.replace(/image 2/g, 'the FIRST image')
  const framingLock = PROMPT_FRAMING_LOCK.replace(/image 2/g, 'the FIRST image')
  const preserve = PROMPT_PRESERVE.replace(/image 2/g, 'the FIRST image').replace(
    /image 1/g,
    'the SECOND image',
  )

  const parts = [
    primaryTask,
    PROMPT_EDIT_IMAGE_ROLES,
    fabricRules,
    structureLock,
    fitLock,
    framingLock,
    preserve,
  ]
  if (multiTarget) {
    parts.push('Batch mode: the SECOND image fabric is shared — every output must show the identical textile.')
  }
  return parts.join('\n\n')
}

/** 纯色模式 — 编辑接口 */
export const PROMPT_SOLID_FABRIC_EDIT = `SOLID FABRIC MODE — the SECOND image has little or no visible print:
- Treat the SECOND image as a solid/tonal color swatch plus subtle weave or texture only.
- Replace ALL garment cloth in the FIRST image with that exact solid color field; remove every print from the FIRST image cloth.
- Still obey GARMENT STRUCTURE LOCK, FIT LOCK, and FRAMING LOCK. Non-fabric pixels stay unchanged.`

const PROMPT_GARMENT_STRUCTURE_LOCK = `GARMENT STRUCTURE LOCK — image 2 is the only authority for cut (mandatory):
- Match image 2 exactly: garment category, silhouette, neckline, collar, placket, button count and placement, sleeve length, sleeve type (e.g. short puff sleeves stay short puff — NOT slim bell or elbow unless image 2 has them), hem, seams, layers, and piece count.
- Forbidden: redesigning or beautifying the garment; changing sleeve style or length; changing neckline or hem; importing cut, neckline, or silhouette from image 1.
- Image 1 supplies textile (color/print/texture) ONLY — never garment pattern-making or sleeve shape from image 1.`

/** 版型锁：松量、轮廓、腰线 — 只换布面纹理，不改穿着效果 */
export const PROMPT_GARMENT_FIT_LOCK = `FIT / SILHOUETTE LOCK — image 2 is the only authority for fit and volume (mandatory):
- Preserve EXACT fit from image 2: same ease, looseness, boxy vs fitted vs oversized, waist width, side-seam shape, shoulder width, bust/chest volume, garment length, hem width, and outer contour.
- If image 2 is relaxed, loose, or boxy — output MUST stay equally relaxed/loose/boxy. If slightly fitted — stay only slightly fitted. Never "upgrade" the fit.
- Forbidden: slimming, tapering the waist, cinching, narrowing sides, reducing volume, making the garment more tailored, more editorial, or more body-hugging.
- Garment outline and drape must match image 2; ONLY cloth surface (color, print, weave) may change — not the shape the garment makes on the body or flat lay.`

const PROMPT_MULTI_TARGET = `Batch mode: image 1 fabric is shared — every output must show the identical textile (same colors and print).`

/** 用户勾选「纯色布料」时追加 */
export const PROMPT_SOLID_FABRIC = `SOLID FABRIC MODE — image 1 has little or no visible print:
- Treat image 1 as a solid/tonal color swatch plus subtle weave or texture only.
- Replace ALL garment cloth in image 2 with that exact solid color field; remove every print, floral, stripe, and motif from image 2 cloth completely.
- Forbidden: keeping any pattern from image 2; "matching" image 2's old print; partial tint while leaving motifs visible.
- Still obey GARMENT STRUCTURE LOCK and FIT LOCK: change color/texture on cloth only — do NOT change sleeve type, neckline, hem, silhouette, or fit.
- Non-fabric pixels in image 2 stay unchanged.`

/** 默认追加说明（简短中文，强化「必须换布」） */
export const DEFAULT_PROMPT_SUFFIX =
  '【必做】第1张图的布面颜色/花纹/肌理必须完整替换第2张图所有衣服布面；保留目标图原印花是错误的。第1张若无印花则按纯色/肌理替换。版型、松量、腰线、轮廓必须与目标图完全一致，禁止收腰修身、禁止改变宽松度，只换布面。袖型、领型、裁剪亦须与目标图一致。除衣服布面外，目标图其余内容保持不变。'

/** 布料换花主提示词；可与用户附加说明拼接 */
export function buildFabricTransferPrompt(multiTarget = false): string {
  const parts = [
    PROMPT_PRIMARY_TASK,
    PROMPT_IMAGE_ROLES,
    PROMPT_FABRIC_RULES,
    PROMPT_GARMENT_STRUCTURE_LOCK,
    PROMPT_GARMENT_FIT_LOCK,
    PROMPT_FRAMING_LOCK,
    PROMPT_PRESERVE,
  ]
  if (multiTarget) parts.push(PROMPT_MULTI_TARGET)
  return parts.join('\n\n')
}

export const STORAGE_KEY_TOKEN = 'clothing_tool_api_token'
export const STORAGE_KEY_BASE = 'clothing_tool_api_base'
export const STORAGE_KEY_PROMPT = 'clothing_tool_prompt_extra'
export const STORAGE_KEY_SIZE = 'clothing_tool_size'
export const STORAGE_KEY_ASPECT = 'clothing_tool_aspect_ratio'
export const STORAGE_KEY_FOLLOW_TARGET_ASPECT = 'clothing_tool_follow_target_aspect'
export const STORAGE_KEY_SOLID_FABRIC = 'clothing_tool_solid_fabric'
export const STORAGE_KEY_USE_2K = 'clothing_tool_use_2k'
/** 默认开启：编辑接口更利于保构图 */
export const STORAGE_KEY_USE_EDITS = 'clothing_tool_use_edits'

/** 默认竖版上架图比例（多数模特图为 3:4） */
export const DEFAULT_ASPECT_RATIO = '3:4'
export const DEFAULT_SIZE = '1024x1536'
export const DEFAULT_SIZE_2K = '2048x3072'

export const SIZE_OPTIONS = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1792x1024',
  '1024x1792',
]

/** 2K 输出尺寸（需网关支持；约为 1K 的 2 倍边长） */
export const SIZE_OPTIONS_2K = [
  '2048x2048',
  '2048x3072',
  '3072x2048',
  '3584x2048',
  '2048x3584',
]

export const ASPECT_OPTIONS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9']
