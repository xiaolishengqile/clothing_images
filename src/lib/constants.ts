export const DEFAULT_API_BASE = 'https://ai.t8star.cn'

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

const PROMPT_FABRIC_TRANSFER = `Fashion fabric texture transfer (virtual swatch onto existing garment photo).

Reference image order (strict):
1. FIRST image — fabric source only: use its textile print, color palette, weave and material surface appearance. Ignore the cut, pose, background and framing of this image; only the cloth pattern/texture matters.
2. SECOND image — scene and garment template: this is the master composition. Preserve its background, environment, props, model, skin, hair, accessories, camera angle, lighting, shadows, garment silhouette, neckline, sleeves, buttons, seams, pleats, wrinkles, fit and every structural detail exactly.

Task: Re-render only the clothing fabric on the garment in the SECOND image so it looks like it is made from the textile in the FIRST image. Map the pattern realistically across folds and curved surfaces; respect existing highlights and shadows on the garment.

Do NOT change: background, floor, walls, model pose, face, limbs, jewelry, belt, shoes, bag, crop, scale or any non-garment pixels.
DO change: garment surface print, colors and fabric texture only.

Output: one photorealistic image matching the second image's scene, with the new fabric applied.`

/** 布料换花主提示词；可与用户附加说明拼接 */
export function buildFabricTransferPrompt(): string {
  return PROMPT_FABRIC_TRANSFER
}

export const STORAGE_KEY_TOKEN = 'clothing_tool_api_token'
export const STORAGE_KEY_BASE = 'clothing_tool_api_base'
export const STORAGE_KEY_PROMPT = 'clothing_tool_prompt_extra'
export const STORAGE_KEY_SIZE = 'clothing_tool_size'
export const STORAGE_KEY_ASPECT = 'clothing_tool_aspect_ratio'
export const SIZE_OPTIONS = [
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '1792x1024',
  '1024x1792',
]

export const ASPECT_OPTIONS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9']
