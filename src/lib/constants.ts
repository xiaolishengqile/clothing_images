export const DEFAULT_API_BASE = 'https://ai.t8star.cn'

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

const PROMPT_CATALOG_GOAL = `Overall goal — one product, many photos (what the customer must see):
- Every output must look like the SAME physical garment / same SKU, shot at different times or poses for one listing — not different similar dresses.
- A shopper flipping through images should think: same cloth, same print, same colors, same factory piece — only model, angle, lighting or background changed.
- All results must feel like one wardrobe item photographed on different days, not a mix of variants.`

const PROMPT_FABRIC_TRANSFER = `E-commerce garment fabric replacement — ONE fixed SKU textile onto catalog model photos.

Reference image order (strict):
1. FIRST image — MASTER FABRIC / SKU (only authority for cloth). Defines the ONLY allowed: print motifs, layout, repeat, AND exact colors (every hue, white/base, contrast). If a person wears the garment in this image, read fabric ONLY from the main dress/top/skirt surface — ignore model face, skin, hair, background, props, shoes, bag, and scene lighting.
2. SECOND image — scene template. Keep background, model, pose, camera, lighting, shadows, garment silhouette, neckline, sleeves, ruffles, tiers, buttons, seams and fit exactly.

CRITICAL — same print AND same colors (not similar):
- Output cloth = EXACT textile from image 1: same pattern arrangement AND same color palette (e.g. brown/tan motifs on white ground must stay brown/tan on white — never become blue denim, multicolor patchwork, or the old floral from image 2).
- Forbidden: keeping or blending the SECOND image's original print; inventing patchwork/floral/denim/tie-dye; color shift, hue change, saturation change, or "stylistic match" to the scene.
- Forbidden: re-shuffling patches/blocks, new motif design, or "inspired by" the source.
- Map image 1 textile onto the garment like a fixed fabric file: warp for folds/perspective only; do NOT redesign layout or recolor.

Color fidelity (mandatory):
- Match image 1 fabric colors precisely: same brown, blue, green, red, black, white/off-white base, and same contrast between motif and ground.
- Do not adopt colors from image 2's old garment or from image 2's environment.

Task: Replace ONLY the garment fabric in image 2 with image 1's exact print + exact colors. Keep cloth highlights/shadows from image 2.

Do NOT change: background, model, pose, accessories, crop, non-garment pixels.
DO change: garment surface pattern and colors only.

Output: photorealistic — image 2 scene + cut, fabric = image 1 SKU (pattern + colors).`

const PROMPT_MULTI_TARGET = `Multiple target photos (same listing batch):
- Image 1 fabric is shared by ALL outputs. Every photo must show the identical garment textile — same print layout, same colors — as if the model wore the same dress/shirt in each shoot.
- Forbidden: one result keeping the old floral, another turning into denim patchwork; any per-image fabric variant breaks the "same outfit, different time" illusion.`

/** 默认追加说明（始终拼接） */
export const DEFAULT_PROMPT_SUFFIX =
  '总体要求：生成的每一张图，都要让人一眼看出是同一套衣服在不同时间/姿势下拍的；花纹、底色、印花颜色完全一致，像同一商品的多张上架图，不能每张布都不一样。'

/** 布料换花主提示词；可与用户附加说明拼接 */
export function buildFabricTransferPrompt(multiTarget = false): string {
  const parts = [PROMPT_CATALOG_GOAL, PROMPT_FABRIC_TRANSFER]
  if (multiTarget) parts.push(PROMPT_MULTI_TARGET)
  return parts.join('\n\n')
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
