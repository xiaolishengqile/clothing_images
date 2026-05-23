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
- View rule: same angle and orientation (front/back/flat lay); never flip back to front.
- Garment structure: same category, neckline, sleeves, hem, buttons, seams, and piece count — only the cloth surface material changes.`

const PROMPT_MULTI_TARGET = `Batch mode: image 1 fabric is shared — every output must show the identical textile (same colors and print).`

/** 默认追加说明（简短中文，强化「必须换布」） */
export const DEFAULT_PROMPT_SUFFIX =
  '【必做】第1张图的布面颜色/花纹/肌理必须完整替换第2张图所有衣服布面；保留目标图原印花是错误的。第1张若无印花则按纯色/肌理替换。除衣服布面外，目标图其余内容保持不变。'

/** 布料换花主提示词；可与用户附加说明拼接 */
export function buildFabricTransferPrompt(multiTarget = false): string {
  const parts = [PROMPT_PRIMARY_TASK, PROMPT_IMAGE_ROLES, PROMPT_FABRIC_RULES, PROMPT_PRESERVE]
  if (multiTarget) parts.push(PROMPT_MULTI_TARGET)
  return parts.join('\n\n')
}

export const STORAGE_KEY_TOKEN = 'clothing_tool_api_token'
export const STORAGE_KEY_BASE = 'clothing_tool_api_base'
export const STORAGE_KEY_PROMPT = 'clothing_tool_prompt_extra'
export const STORAGE_KEY_SIZE = 'clothing_tool_size'
export const STORAGE_KEY_ASPECT = 'clothing_tool_aspect_ratio'
export const STORAGE_KEY_FOLLOW_TARGET_ASPECT = 'clothing_tool_follow_target_aspect'

/** 默认竖版上架图比例（多数模特图为 3:4） */
export const DEFAULT_ASPECT_RATIO = '3:4'
export const DEFAULT_SIZE = '1024x1536'

export const SIZE_OPTIONS = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1792x1024',
  '1024x1792',
]

export const ASPECT_OPTIONS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9']
