export const DEFAULT_API_BASE = 'https://ai.t8star.cn'

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

/** 电商白底 + 幽灵人体效果，可按需微调 */
export const DEFAULT_PROMPT = `Professional e-commerce product photography of the clothing shown in the reference image.
Style: invisible ghost mannequin / hollow mannequin — garment keeps natural 3D volume, no visible mannequin, no neck cap, no metal stand or fixtures.
Preserve the exact garment: same print, colors, neckline, straps, twist or gathers at bust, fit and proportions.
Viewpoint (critical): match the reference photo's camera angle and which side of the garment is visible. If the reference shows the back, output the back view; if left/right profile or three-quarter, keep that same orientation and framing. Do not rotate to a canonical front view or invent a new angle — the output must read as the same shot angle as the upload, only cleaned onto white with ghost mannequin treatment.
Lighting: bright, soft commercial studio light with gentle shadows inside folds only; no harsh cast shadow on background.
Background: pure seamless white #FFFFFF, full frame, catalog-ready.
Composition: garment centered in frame, same eye level and crop scale as the reference where sensible, high resolution, sharp fabric texture and pattern edges.`

export const STORAGE_KEY_TOKEN = 'clothing_tool_api_token'
export const STORAGE_KEY_BASE = 'clothing_tool_api_base'
export const STORAGE_KEY_PROMPT = 'clothing_tool_prompt_extra'
export const STORAGE_KEY_SIZE = 'clothing_tool_size'
export const STORAGE_KEY_ASPECT = 'clothing_tool_aspect_ratio'
export const STORAGE_KEY_ENCODE = 'clothing_tool_encode_mode'

export const SIZE_OPTIONS = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1792x1024',
  '1024x1792',
]

export const ASPECT_OPTIONS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9']
