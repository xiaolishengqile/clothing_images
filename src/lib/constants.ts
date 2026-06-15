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

/** 裙子模式 — 只换裙子，上衣保持不变 */
export const PROMPT_SKIRT_ONLY = `SKIRT ONLY MODE — replace ONLY the skirt/lower garment, keep the top unchanged (mandatory):
- Replace ONLY the skirt or lower garment in image 2 with the textile from image 1.
- The TOP / BLOUSE / SHIRT in image 2 MUST remain 100% unchanged — original color, original print, original everything.
- If the outfit is a dress (one-piece), treat only the skirt portion (below waist/bust line) as the replacement area; keep the bodice/top half unchanged.
- Critical: Draw an imaginary horizontal line at the waist/bust boundary. ONLY change pixels BELOW this line. Everything ABOVE stays original.
- Forbidden: changing any part of the top, blouse, or upper garment.
- Only the skirt/lower portion should show image 1's fabric.
- If image 1 shows a full dress, sample ONLY the lower skirt portion's fabric — do NOT import the bodice/top part's color or pattern.`

/** 裙子模式 — 编辑接口专用 */
export const PROMPT_SKIRT_ONLY_EDIT = `SKIRT ONLY MODE — replace ONLY the skirt/lower garment, keep the top unchanged (mandatory):
- Replace ONLY the skirt or lower garment in the FIRST image with the textile from the SECOND image.
- The TOP / BLOUSE / SHIRT in the FIRST image MUST remain 100% unchanged — original color, original print, original everything.
- If the outfit is a dress (one-piece), treat only the skirt portion (below waist/bust line) as the replacement area; keep the bodice/top half unchanged.
- Critical: Draw an imaginary horizontal line at the waist/bust boundary. ONLY change pixels BELOW this line. Everything ABOVE stays original.
- Forbidden: changing any part of the top, blouse, or upper garment.
- Only the skirt/lower portion should show the SECOND image's fabric.
- If the SECOND image shows a full dress, sample ONLY the lower skirt portion's fabric — do NOT import the bodice/top part's color or pattern.`

/** 上下装分离模式 — 上衣对上衣，裤子对裤子分别替换 */
export const PROMPT_SEPARATES_MODE = `SEPARATES MODE — replace top and bottom separately (mandatory):
- Image 1 contains BOTH a top garment AND a bottom garment (skirt/pants) as separate flat lay pieces.
- Sample the TOP fabric from image 1's upper garment ONLY, and apply it to the TOP in image 2.
- Sample the BOTTOM fabric from image 1's lower garment ONLY, and apply it to the BOTTOM (skirt/pants) in image 2.
- The top and bottom fabrics from image 1 are DIFFERENT — do NOT mix them up.
- Preserve image 2's garment structure: top stays top, bottom stays bottom, each keeps its own cut and fit.
- Forbidden: applying the top fabric to the bottom, or the bottom fabric to the top.
- Forbidden: blending the two fabrics together or treating image 1 as a single textile source.`

/** 上下装分离模式 — 编辑接口专用（第一张=目标图，第二张=参考图） */
export const PROMPT_SEPARATES_MODE_EDIT = `SEPARATES MODE — replace top and bottom separately (mandatory):
- The SECOND image contains BOTH a top garment AND a bottom garment (skirt/pants) as separate flat lay pieces.
- Sample the TOP fabric from the SECOND image's upper garment ONLY, and apply it to the TOP in the FIRST image.
- Sample the BOTTOM fabric from the SECOND image's lower garment ONLY, and apply it to the BOTTOM (skirt/pants) in the FIRST image.
- The top and bottom fabrics from the SECOND image are DIFFERENT — do NOT mix them up.
- Preserve the FIRST image's garment structure: top stays top, bottom stays bottom, each keeps its own cut and fit.
- Forbidden: applying the top fabric to the bottom, or the bottom fabric to the top.
- Forbidden: blending the two fabrics together or treating the SECOND image as a single textile source.`

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

/** 一键换色模式 — 用户指定颜色，替换衣服颜色 */
export const PROMPT_COLOR_CHANGE = `COLOR CHANGE MODE — change garment color to the specified color (mandatory):
- Replace ALL garment cloth color with the target color specified by user.
- Preserve all shadows, highlights, folds, and fabric texture — ONLY change the hue/color value.
- The garment should look like the same photo, just dyed in a different color.
- Keep realistic shading: darker areas stay darker, highlights stay bright, maintain depth and dimension.
- Forbidden: changing garment style, cut, or fit. Forbidden: flattening shadows or losing texture detail.
- Background, model, pose, accessories remain 100% unchanged.`

/** 上身展示模式 — 生成接口（图1=商品，图2=模特参考） */
export const PROMPT_WEAR_MODE = `WEAR MODE — transfer garment from product photo onto model reference (mandatory):
- Image 1: flat lay or hung product photo — garment(s) to wear; sole authority for design, pattern, color, cut, and details.
- Image 2: model reference photo — desired pose, styling, accessories, scene, and composition (base presentation).
- Put the garment(s) from Image 1 onto the model in Image 2.
- CRITICAL — Preserve Image 1's garment 100% exactly: design, pattern, color, cut, neckline shape, collar style, sleeve length and style, hem shape, all details (embroidery, prints, buttons, trims, pockets, seams), piece count, and overall silhouette. Every motif and detail must match Image 1 pixel-perfectly — do NOT redraw, reinterpret, or redesign any part of the garment.
- Preserve Image 2's presentation: model pose, body type, face, hair, accessories, background, lighting, and composition.
- The output should look like Image 1's actual garment (not a redesigned version) is being worn by Image 2's model in Image 2's scene.
- Forbidden: changing Image 1's garment design in any way — no altering neckline, no changing sleeve style, no moving or redrawing prints/embroidery, no "improving" or "stylizing" the garment. The garment from Image 1 must be copied exactly as-is.
- If Image 1 shows a top + bottom outfit, both must be transferred to Image 2.`

/** 上身展示模式 — 编辑接口（图1=模特参考底图，图2=商品） */
export const PROMPT_WEAR_MODE_EDIT = `WEAR MODE — transfer garment onto model reference (mandatory):
- FIRST image — model reference (base canvas). Preserve pose, body, face, hair, accessories, background, lighting, and composition exactly.
- SECOND image — flat lay or hung product photo — garment(s) to wear; sole authority for design, pattern, color, cut, and details.
- Put the garment from the SECOND image onto the model in the FIRST image.
- CRITICAL — Preserve the SECOND image's garment 100% exactly: design, pattern, color, cut, neckline shape, collar style, sleeve length and style, hem shape, all details (embroidery, prints, buttons, trims, pockets, seams), piece count, and overall silhouette. Every motif and detail must match the SECOND image pixel-perfectly — do NOT redraw, reinterpret, or redesign any part of the garment.
- Preserve the FIRST image's scene and model presentation.
- Forbidden: changing the garment design from the SECOND image in any way — no altering neckline, no changing sleeve style, no moving or redrawing prints/embroidery, no "improving" or "stylizing" the garment. The garment from the SECOND image must be copied exactly as-is.
- If the SECOND image shows a top + bottom outfit, both must be transferred.`

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
/** 裙子模式：只换裙子，上衣不变 */
export const STORAGE_KEY_SKIRT_ONLY = 'clothing_tool_skirt_only'
/** 上下装分离模式：上衣对上衣，裤子对裤子分别替换 */
export const STORAGE_KEY_SEPARATES_MODE = 'clothing_tool_separates_mode'
/** 一键换色模式：用户指定颜色替换衣服颜色 */
export const STORAGE_KEY_COLOR_CHANGE = 'clothing_tool_color_change'
/** 上身展示模式：商品平铺图穿到参考图模特身上 */
export const STORAGE_KEY_WEAR_MODE = 'clothing_tool_wear_mode'

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
