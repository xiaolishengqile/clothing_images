export const DEFAULT_API_BASE = 'https://ai.t8star.cn'

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

const PROMPT_CATALOG_GOAL = `Overall goal — fabric color/pattern transfer only (one SKU textile onto many product photos):
- Extract print motifs + colors from image 1; apply ONLY onto garment cloth areas in image 2.
- Every output must show the SAME textile (same print layout, same colors) when image 1 is shared across a batch.
- Image 2 may be a model photo, flat lay, hanger shot, mannequin, or garment-only — never invent content image 2 does not have.`

const PROMPT_FABRIC_TRANSFER = `E-commerce garment fabric replacement — ONE fixed SKU textile onto catalog / product photos.

Reference image order (strict):
1. FIRST image — MASTER FABRIC / SKU (only authority for cloth). Defines the ONLY allowed: print motifs, layout, repeat, AND exact colors (every hue, white/base, contrast). If a person wears the garment in this image, read fabric ONLY from the garment cloth surface — ignore any face, skin, hair, body, background, props, and scene lighting. Do NOT copy image 1's garment cut onto image 2. Never import a person from image 1 into the output.
2. SECOND image — scene template (absolute master). Defines whether a person exists, background, props, framing, and garment construction. Output must match image 2's content class: if image 2 has no human, output has no human.

NO-MODEL / GARMENT-ONLY TARGETS (critical when image 2 has no person):
- If image 2 is flat lay, hanger, mannequin without visible face, ghost mannequin, product-on-table, or any shot with NO real human model: output must also have NO person.
- Forbidden: adding a model, mannequin with face, hands, legs, or any human body part that is not in image 2.
- Forbidden: copying the model/person from image 1 into image 2.
- Forbidden: if image 2 is ONLY a fabric swatch or cloth close-up (no garment product shot), do NOT generate flat-lay outfits, mannequins, or new garments — only change the textile pattern on that swatch surface.
- Only replace the print/colors on the garment surfaces that already exist in image 2; keep background, shadows, folds, and composition identical.

IDENTITY & SCENE LOCK when image 2 contains a person (mandatory — image 2 wins for all non-fabric pixels):
- Preserve the EXACT same person: identical face identity, eyes, nose, mouth, expression, skin tone, makeup, hair style and color, body shape, hands, legs, pose, and every non-garment-cloth pixel.
- Forbidden: face swap, different model, beautification, age change, hair change, or any "similar looking" person.
- Forbidden: blur, softening, smearing, or detail loss on face, skin, hair, or background — sharpness must match image 2.

VIEW & FRAMING LOCK (mandatory):
- Same camera angle and garment orientation as image 2: back view MUST stay back view — show the back neckline and back of sleeves only; front stays front; 3/4 stays 3/4; top-down flat lay stays top-down.
- Forbidden: flipping back to front, rotating to "standard" catalog front pose, showing front V-neck when image 2 shows the back, or mirroring to reveal the garment front.
- If image 2 is a model photographed from behind, output MUST still be from behind — never rotate the product or model to a front-facing pose.
- Identical crop, zoom level, and canvas framing — no zooming out, no outpainting, no completing a partial garment into a full outfit photo.

GARMENT STRUCTURE LOCK (mandatory — only cloth texture changes):
- Keep image 2's garment TYPE and construction exactly: same category (dress stays dress, blouse stays blouse, pants stay pants, two-piece stays two-piece), same neckline, sleeve length, hem, silhouette, layers, seams, buttons, and number of pieces.
- Forbidden: turning blouse+trousers into a one-piece dress, adding/removing sleeves, changing hem length, or importing the dress/shirt shape from image 1.
- Image 1 supplies ONLY repeating textile (print + colors), NOT garment pattern-making from image 1.

CRITICAL — same print AND same colors (not similar):
- Output cloth = EXACT textile from image 1: same pattern arrangement AND same color palette (e.g. blue/white floral on white ground must stay blue/white — never become brown floral, denim patchwork, or the old print from image 2).
- Forbidden: keeping or blending image 2's original print; inventing patchwork/denim/tie-dye; color shift, hue change, saturation change, or "stylistic match" to the scene.
- Forbidden: re-shuffling patches/blocks, new motif design, or "inspired by" either image.
- Map image 1 textile onto image 2's garment like a fixed fabric swatch: warp for folds/perspective only; do NOT redesign layout or recolor.

Color fidelity (mandatory):
- Match image 1 fabric colors precisely: same blues, browns, greens, reds, black, white/off-white base, and same contrast between motif and ground.
- Do not adopt colors from image 2's old garment or from image 2's environment.

Task: Replace ONLY the visible garment fabric surfaces in image 2 with image 1's exact print + exact colors. Keep cloth highlights/shadows from image 2.

Do NOT change: background, presence/absence of people, props, pose, accessories, crop, aspect ratio, any non-garment-cloth pixels, garment category or cut.
DO change: garment surface pattern and colors only.

Output: photorealistic — image 2 scene faithfully preserved; fabric on garments = image 1 SKU (pattern + colors). Same output aspect ratio and framing as image 2. If image 2 had no model, output has no model.`

const PROMPT_MULTI_TARGET = `Multiple target photos (same listing batch):
- Image 1 fabric is shared by ALL outputs. Every photo must show the identical garment textile — same print layout, same colors.
- Per image 2: preserve whether that shot has a model or is garment-only — never add people to no-model shots.
- Forbidden: one result keeping the old floral, another turning into denim patchwork; any per-image fabric variant.`

/** 默认追加说明（始终拼接） */
export const DEFAULT_PROMPT_SUFFIX =
  '总体要求：只从布料图提取花色（花纹+颜色），替换到目标图衣服的布面上；除衣服布面外，目标图一切细节必须保持原样。背面必须仍是背面，禁止翻成正面；局部特写禁止补全为全件平铺。布样/印花特写只能放在第1步布料图，不要放在第2步目标图。若目标图没有模特，结果也不能出现模特。若有模特，须是同一人且清晰。花纹、底色与布料图一致。输出比例、构图、裁剪与原图一致。'

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
