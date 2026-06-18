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

/** 上下装双参考模式 — 生成接口（图1=上衣表面参考，图2=下装表面参考，图3=目标图） */
export const PROMPT_SEPARATES_DUAL_MODE = `SEPARATES DUAL-REFERENCE FABRIC SURFACE MODE — transfer surface appearance only (mandatory):
- Image 1 is the TOP SURFACE reference only. Read only cloth color palette, print / motif / flower pattern, pattern scale, weave, material feel, and surface texture for the TOP area.
- Image 2 is the BOTTOM SURFACE reference only. Read only cloth color palette, print / motif / flower pattern, pattern scale, weave, material feel, and surface texture for the BOTTOM area.
- Image 3 is the only authority for the final outfit structure: scene, person, pose, framing, garment categories, cut, fit, folds, shadows, construction, and all garment boundaries.
- Apply Image 1's surface appearance ONLY onto the existing TOP cloth surfaces in Image 3, warped to Image 3's original folds and seams.
- Apply Image 2's surface appearance ONLY onto the existing BOTTOM cloth surfaces in Image 3, warped to Image 3's original folds and seams.
- Ignore every structural feature from Image 1 and Image 2: garment category, silhouette, neckline, collar, placket, opening shape, sleeve style, sleeve length, waist, leg shape, skirt shape, hem, pockets, buttons, trims, closure layout, and overall pattern-making.
- Category lock: if Image 3's top is not V-neck, do NOT make it V-neck even when Image 1 is V-neck. If Image 3's bottom is a skirt, it MUST remain a skirt even when Image 2 is pants. If Image 3's bottom is pants, it MUST remain pants even when Image 2 is a skirt.
- Preserve Image 3 garment categories and boundaries: top stays top, bottom stays bottom; never turn a skirt into pants, pants into skirt, separates into a dress/jumpsuit, or a dress into separates.
- Forbidden: copying garment silhouettes or cut from reference images; changing neckline, sleeve type, waistline, hem, length, fit, looseness, drape, category, pose, body shape, accessories, or background.
- Keep Image 3 background, model identity, face, hair, pose, accessories, lighting, crop, garment shape, fit, and drape unchanged.

中文要求：图片1和图片2只作为“布面外观参考”，只取颜色、花色、图案、纹理、材质感；严禁参考它们的版型。最终衣服的领型、袖型、衣长、腰线、裙型/裤型、松量、轮廓全部以图片3为准。图片1是V领也不能把目标上衣改成V领；图片2是裤子也不能把目标裙子改成裤子。只在目标图原有衣服表面换颜色和花纹。`

/** 上下装双参考模式 — 编辑接口（第一张=目标图，第二张=上衣表面参考，第三张=下装表面参考） */
export const PROMPT_SEPARATES_DUAL_MODE_EDIT = `SEPARATES DUAL-REFERENCE FABRIC SURFACE MODE — transfer surface appearance only (mandatory):
- FIRST image is the only authority for the final outfit structure: scene, person, pose, framing, garment categories, cut, fit, folds, shadows, construction, and all garment boundaries.
- SECOND image is the TOP SURFACE reference only. Read only cloth color palette, print / motif / flower pattern, pattern scale, weave, material feel, and surface texture for the TOP area.
- THIRD image is the BOTTOM SURFACE reference only. Read only cloth color palette, print / motif / flower pattern, pattern scale, weave, material feel, and surface texture for the BOTTOM area.
- Apply the SECOND image's surface appearance ONLY onto the existing TOP cloth surfaces in the FIRST image, warped to the FIRST image's original folds and seams.
- Apply the THIRD image's surface appearance ONLY onto the existing BOTTOM cloth surfaces in the FIRST image, warped to the FIRST image's original folds and seams.
- Ignore every structural feature from the SECOND and THIRD images: garment category, silhouette, neckline, collar, placket, opening shape, sleeve style, sleeve length, waist, leg shape, skirt shape, hem, pockets, buttons, trims, closure layout, and overall pattern-making.
- Category lock: if the FIRST image's top is not V-neck, do NOT make it V-neck even when the SECOND image is V-neck. If the FIRST image's bottom is a skirt, it MUST remain a skirt even when the THIRD image is pants. If the FIRST image's bottom is pants, it MUST remain pants even when the THIRD image is a skirt.
- Preserve FIRST image garment categories and boundaries: top stays top, bottom stays bottom; never turn a skirt into pants, pants into skirt, separates into a dress/jumpsuit, or a dress into separates.
- Forbidden: copying garment silhouettes or cut from reference images; changing neckline, sleeve type, waistline, hem, length, fit, looseness, drape, category, pose, body shape, accessories, or background.
- Keep FIRST image background, model identity, face, hair, pose, accessories, lighting, crop, garment shape, fit, and drape unchanged.

中文要求：图片2和图片3只作为“布面外观参考”，只取颜色、花色、图案、纹理、材质感；严禁参考它们的版型。最终衣服的领型、袖型、衣长、腰线、裙型/裤型、松量、轮廓全部以图片1为准。图片2是V领也不能把目标上衣改成V领；图片3是裤子也不能把目标裙子改成裤子。只在目标图原有衣服表面换颜色和花纹。`

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

/** 一键换色模式 — 核心：仅改色相，保留图案/肌理/褶皱/缝线 */
const PROMPT_COLOR_CHANGE_CORE = `COLOR CHANGE MODE — recolor garment cloth only (mandatory):
- Change ONLY the hue of garment cloth to the user-specified target color. This is a dye/recolor on the existing fabric — NOT a redesign or re-texture.
- The base photo is the sole authority for pattern layout, weave, folds, seams, and every surface detail.
- Output must look like the same photograph with the garment dyed — not a newly rendered outfit.
- Keep realistic shading: darker fold areas stay darker, highlights stay bright; only shift color inside existing shadow/highlight geometry.
- Forbidden: changing garment style, cut, fit, or silhouette. Forbidden: flattening, smoothing, or beautifying the cloth.
- Background, model, face, hair, pose, accessories, props, lighting, crop, and composition remain 100% unchanged.`

/** 换色 — 图案/肌理/褶皱/拼接细节锁 */
const PROMPT_COLOR_PATTERN_LOCK = `PATTERN & SURFACE DETAIL LOCK — preserve ALL cloth structure from the base photo (mandatory):
- Preserve exact pattern type and layout: gingham, plaid, check, stripe, floral, or print — same scale, repeat size, grid proportions
- Preserve white or contrast squares/lines and their proportions; recolor only the non-white / dominant color areas to the target hue.
- Preserve weave, crinkle, seersucker ridges, gauze grain, knit texture, and all micro-surface detail — do NOT flatten into a solid color field.
- Preserve every fold, wrinkle, crease, drape shadow, and highlight exactly — shadow lines and depth cues must match the original photo.
- Preserve construction details: seam lines, topstitching, panel joins, placket edges, collar/cuff ruffle layers, buttonholes, buttons, and color-block boundaries — recolor each cloth panel but keep seam geometry and stitching visible.
- Forbidden: removing prints or patterns; inventing new patterns; changing check/plaid scale; smoothing wrinkles; erasing seam lines or panel joins.
- If the original cloth is solid (no print), keep it solid in the target color while preserving weave texture and fold shadows.`

function buildColorChangeStructureLock(baseLabel: string): string {
  return `GARMENT STRUCTURE LOCK — ${baseLabel} is the only authority for cut (mandatory):
- Match exactly: garment category, silhouette, neckline, collar, placket, sleeve length and style, ruffles, hem, seams, layers, and piece count.
- Forbidden: redesigning, beautifying, or changing sleeve/neckline/hem style.`
}

function buildColorChangeFitLock(baseLabel: string): string {
  return `FIT / SILHOUETTE LOCK — ${baseLabel} is the only authority for fit (mandatory):
- Preserve exact ease, looseness, waist width, shoulder width, garment length, hem width, and outer contour.
- Forbidden: slimming, tapering, cinching, or reducing volume. Garment outline and drape must match ${baseLabel}.`
}

function buildColorChangeFramingLock(baseLabel: string): string {
  return `FRAMING LOCK — ${baseLabel} canvas is sacred (mandatory):
- Output MUST match ${baseLabel} in crop, zoom, margins, subject scale, and visible body parts.
- Forbidden: outpainting, zooming out, completing partial views, or adding props/accessories not in ${baseLabel}.
- Only garment cloth hue may change.`
}

const PROMPT_COLOR_CHANGE_SUFFIX_ZH =
  '【必做】仅将衣服布料主色改为目标色；必须完整保留原有格纹/印花结构、白色格子、布料肌理、褶皱阴影、缝线拼接与所有表面细节；禁止变成纯色块、禁止抹平褶皱、禁止改变版型与构图。真实照片效果。'

/** 一键换色模式 — 完整提示词（单图，无布料参考） */
export function buildColorChangePrompt(forEdits: boolean, targetColor: string): string {
  const baseLabel = forEdits ? 'the FIRST image' : 'the input image'
  return [
    PROMPT_COLOR_CHANGE_CORE,
    forEdits
      ? `Edit mode — image order:\n1. FIRST image — product photo to recolor (base canvas). Defines scene, pose, framing, garment construction, pattern, and all cloth detail. Preserve this layout exactly.`
      : `Single input image — product photo to recolor. Defines scene, pose, framing, garment construction, pattern, and all cloth detail.`,
    PROMPT_COLOR_PATTERN_LOCK.replace(/the base photo/g, baseLabel).replace(/the original photo/g, baseLabel),
    buildColorChangeStructureLock(baseLabel),
    buildColorChangeFitLock(baseLabel),
    buildColorChangeFramingLock(baseLabel),
    `Target color: ${targetColor}`,
    PROMPT_COLOR_CHANGE_SUFFIX_ZH,
  ].join('\n\n')
}

/** @deprecated 使用 buildColorChangePrompt；保留导出以免外部引用报错 */
export const PROMPT_COLOR_CHANGE = PROMPT_COLOR_CHANGE_CORE

type ColorCardView = 'front' | 'back'

function colorCardViewPrompt(view: ColorCardView, baseImageLabel: string, hasBackReference = false): string {
  if (view === 'front') {
    return `Output view:
- Keep the ${baseImageLabel} front-facing composition and pose.
- Preserve the same model, pants, accessories, background, lighting, crop, and camera angle.
- Only the top/shirt fabric colorway changes.`
  }

  if (hasBackReference) {
    return `Output view:
- Keep the ${baseImageLabel} back-facing composition and pose.
- Preserve the same model, pants, accessories, background, lighting, crop, and camera angle.
- Only the back view top/shirt fabric colorway changes. Do not turn the model to the front.`
  }

  return `Output view:
- Generate the SAME model wearing the SAME top as a realistic BACK VIEW product photo.
- The top must match the front reference's cut, collar/placket logic, sleeve shape, length, looseness, hem width, fabric drape, plaid scale, and texture.
- Use a natural back-facing pose consistent with the original outfit and scene. Keep pants, body type, background style, and lighting consistent.
- This is a back view inferred from the front reference; do not show the model facing the camera.`
}

/** 色卡模式 — 编辑接口（第一张=模特参考，第二张=编号色卡） */
export function buildColorCardPromptForEdits(
  swatchNumber: number,
  view: ColorCardView,
  hasBackReference = false,
): string {
  const baseRole =
    view === 'back' && hasBackReference
      ? 'FIRST image — back model reference and base garment. It defines the person, outfit styling, top cut, plaid scale, fabric folds, lighting, and scene.'
      : 'FIRST image — front model reference and base garment. It defines the person, outfit styling, top cut, plaid scale, fabric folds, lighting, and scene.'

  return `COLOR CARD MODE — numbered swatch recolor (mandatory):
- ${baseRole}
- SECOND image — numbered color card. Automatically locate swatch number ${swatchNumber} on the color card and read its plaid colorway.
- Recolor ONLY the model's TOP / SHIRT fabric to match swatch number ${swatchNumber}'s plaid colorway from the SECOND image.
- Preserve the original top's plaid proportion, white squares, weave, folds, shadows, highlights, buttons/placket behavior, and fabric texture.
- Preserve all non-top pixels unless the requested output is a back view.
- Do not change pants, accessories, body shape, background, or photo realism.
- Do not invent a different plaid, do not use the wrong numbered swatch, and do not flatten the cloth into a solid color.

${colorCardViewPrompt(view, 'FIRST image', hasBackReference)}

中文要求：参考图片1和图片2。只将模特上衣布料颜色改为色卡编号${swatchNumber}的格子配色；保留原上衣格纹结构、白色格子、褶皱、阴影和布料质感。人物、裤子、饰品、背景尽量保持一致。真实照片效果。`
}

/** 色卡模式 — 生成接口（图1=编号色卡，图2=模特参考） */
export function buildColorCardPrompt(
  swatchNumber: number,
  view: ColorCardView,
  hasBackReference = false,
): string {
  const baseRole =
    view === 'back' && hasBackReference
      ? 'Image 2 — back model reference and base garment. It defines the person, outfit styling, top cut, plaid scale, fabric folds, lighting, and scene.'
      : 'Image 2 — front model reference and base garment. It defines the person, outfit styling, top cut, plaid scale, fabric folds, lighting, and scene.'

  return `COLOR CARD MODE — numbered swatch recolor (mandatory):
- Image 1 — numbered color card. Automatically locate swatch number ${swatchNumber} and read its plaid colorway.
- ${baseRole}
- Recolor ONLY the model's TOP / SHIRT fabric to match swatch number ${swatchNumber}'s plaid colorway from Image 1.
- Preserve the original top's plaid proportion, white squares, weave, folds, shadows, highlights, buttons/placket behavior, and fabric texture.
- Preserve all non-top pixels unless the requested output is a back view.
- Do not change pants, accessories, body shape, background, or photo realism.
- Do not invent a different plaid, do not use the wrong numbered swatch, and do not flatten the cloth into a solid color.

${colorCardViewPrompt(view, 'Image 2', hasBackReference)}

中文要求：参考图片1和图片2。只将模特上衣布料颜色改为色卡编号${swatchNumber}的格子配色；保留原上衣格纹结构、白色格子、褶皱、阴影和布料质感。人物、裤子、饰品、背景尽量保持一致。真实照片效果。`
}

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
/** 上下装双参考模式：上衣参考、下装参考分别上传 */
export const STORAGE_KEY_SEPARATES_DUAL_MODE = 'clothing_tool_separates_dual_mode'
/** 一键换色模式：用户指定颜色替换衣服颜色 */
export const STORAGE_KEY_COLOR_CHANGE = 'clothing_tool_color_change'
/** 上身展示模式：商品平铺图穿到参考图模特身上 */
export const STORAGE_KEY_WEAR_MODE = 'clothing_tool_wear_mode'
/** 色卡模式：一张正面图 + 一张编号色卡批量生成正/背面 */
export const STORAGE_KEY_COLOR_CARD_MODE = 'clothing_tool_color_card_mode'
/** 色卡模式：编号数量，按 1-N 展开 */
export const STORAGE_KEY_COLOR_CARD_COUNT = 'clothing_tool_color_card_count'

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
