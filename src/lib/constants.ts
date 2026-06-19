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
- Map image 1 textile onto image 2 like a fixed swatch: warp for necessary garment drape and perspective only.
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

/** 局部布样模式 — 布料特写/旋转/褶皱模板，只换表面花色，不生成衣服 */
export const PROMPT_FABRIC_CLOSEUP_MODE = `FABRIC CLOSE-UP MODE — textile surface replacement only (mandatory):
- Image 1 is the new textile appearance source. Read only cloth color, print, motif scale, weave, and material feel.
- Image 2 is a fabric close-up / swatch crop template, NOT a garment product photo. It defines the exact crop, rotation, folds, wrinkle flow, lighting, perspective, and cloth surface geometry.
- Replace the visible fabric surface in Image 2 with Image 1's textile appearance.
- Preserve Image 2's composition exactly: same crop, same zoom, same rotation angle, same swirl/fold layout, same shadows and highlights, same visible boundaries.
- Forbidden: generating a shirt, dress, pants, model, body, hanger, mannequin, product layout, collar, sleeve, hem, buttons, accessories, or background scene.
- Forbidden: outpainting, zooming out, completing a garment, straightening the fabric, changing the fold structure, or importing garment shape from Image 1.
- If Image 1 is solid/tonal, apply its exact color and subtle texture to the fabric surface while preserving Image 2 folds and light.

中文要求：这是布料局部特写换花，不是衣服商品图换布。只把图片1的颜色/花纹/纹理换到图片2已有布面上；图片2的裁切、旋转角度、褶皱漩涡、光影和透视必须保持。严禁生成模特、上衣、裙子、裤子、领口、袖子、吊牌、配饰或完整商品图。`

/** 局部布样模式 — 编辑接口（第一张=局部模板，第二张=新布料） */
export const PROMPT_FABRIC_CLOSEUP_MODE_EDIT = `FABRIC CLOSE-UP MODE — textile surface replacement only (mandatory):
- FIRST image is a fabric close-up / swatch crop template, NOT a garment product photo. It defines the exact crop, rotation, folds, wrinkle flow, lighting, perspective, and cloth surface geometry.
- SECOND image is the new textile appearance source. Read only cloth color, print, motif scale, weave, and material feel.
- Replace the visible fabric surface in the FIRST image with the SECOND image's textile appearance.
- Preserve the FIRST image composition exactly: same crop, same zoom, same rotation angle, same swirl/fold layout, same shadows and highlights, same visible boundaries.
- Forbidden: generating a shirt, dress, pants, model, body, hanger, mannequin, product layout, collar, sleeve, hem, buttons, accessories, or background scene.
- Forbidden: outpainting, zooming out, completing a garment, straightening the fabric, changing the fold structure, or importing garment shape from the SECOND image.
- If the SECOND image is solid/tonal, apply its exact color and subtle texture to the FIRST image fabric surface while preserving the FIRST image folds and light.

中文要求：这是布料局部特写换花，不是衣服商品图换布。只把图片2的颜色/花纹/纹理换到图片1已有布面上；图片1的裁切、旋转角度、褶皱漩涡、光影和透视必须保持。严禁生成模特、上衣、裙子、裤子、领口、袖子、吊牌、配饰或完整商品图。`

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
- NON-SWAPPABLE ASSIGNMENT LOCK: Image 1 -> TOP area ONLY; Image 2 -> BOTTOM area ONLY. This mapping is fixed by image order, not by visual similarity, color harmony, or where the pattern would look better.
- Build two internal masks before editing: TOP_MASK = bodice / blouse / shirt / upper torso cloth in Image 3; BOTTOM_MASK = skirt / pants / lower garment cloth in Image 3. Apply Image 1 only inside TOP_MASK and Image 2 only inside BOTTOM_MASK.
- If Image 3 is a one-piece dress, split it by the original waist seam or natural waist boundary: bodice/chest/upper part = TOP_MASK, skirt below waist = BOTTOM_MASK. The dress remains one piece, but the two fabric references must not be swapped.
- Critical failure examples: using Image 2's print on the bodice/top is wrong; using Image 1's print/color on the skirt/bottom is wrong; making the entire outfit use only one reference is wrong.
- Ignore every structural feature from Image 1 and Image 2: garment category, silhouette, neckline, collar, placket, opening shape, sleeve style, sleeve length, waist, leg shape, skirt shape, hem, pockets, buttons, trims, closure layout, and overall pattern-making.
- Category lock: if Image 3's top is not V-neck, do NOT make it V-neck even when Image 1 is V-neck. If Image 3's bottom is a skirt, it MUST remain a skirt even when Image 2 is pants. If Image 3's bottom is pants, it MUST remain pants even when Image 2 is a skirt.
- Preserve Image 3 garment categories and boundaries: top stays top, bottom stays bottom; never turn a skirt into pants, pants into skirt, separates into a dress/jumpsuit, or a dress into separates.
- Forbidden: copying garment silhouettes or cut from reference images; changing neckline, sleeve type, waistline, hem, length, fit, looseness, drape, category, pose, body shape, accessories, or background.
- Keep Image 3 background, model identity, face, hair, pose, accessories, lighting, crop, garment shape, fit, and drape unchanged.

中文要求：图片1和图片2只作为“布面外观参考”，只取颜色、花色、图案、纹理、材质感；严禁参考它们的版型。映射绝对不能弄反：图片1永远只贴到目标图的上衣/上半身/连衣裙上半身区域；图片2永远只贴到目标图的下装/裙摆/裤子区域。如果目标图是连衣裙，按原腰线或自然腰线分成上半身和裙摆，图片1贴上半身，图片2贴裙摆。把图片2花色贴到上半身是错误；把图片1花色贴到裙摆是错误。最终衣服的领型、袖型、衣长、腰线、裙型/裤型、松量、轮廓全部以图片3为准。图片1是V领也不能把目标上衣改成V领；图片2是裤子也不能把目标裙子改成裤子。只在目标图原有衣服表面换颜色和花纹。`

/** 上下装双参考模式 — 编辑接口（第一张=目标图，第二张=上衣表面参考，第三张=下装表面参考） */
export const PROMPT_SEPARATES_DUAL_MODE_EDIT = `SEPARATES DUAL-REFERENCE FABRIC SURFACE MODE — transfer surface appearance only (mandatory):
- FIRST image is the only authority for the final outfit structure: scene, person, pose, framing, garment categories, cut, fit, folds, shadows, construction, and all garment boundaries.
- SECOND image is the TOP SURFACE reference only. Read only cloth color palette, print / motif / flower pattern, pattern scale, weave, material feel, and surface texture for the TOP area.
- THIRD image is the BOTTOM SURFACE reference only. Read only cloth color palette, print / motif / flower pattern, pattern scale, weave, material feel, and surface texture for the BOTTOM area.
- Apply the SECOND image's surface appearance ONLY onto the existing TOP cloth surfaces in the FIRST image, warped to the FIRST image's original folds and seams.
- Apply the THIRD image's surface appearance ONLY onto the existing BOTTOM cloth surfaces in the FIRST image, warped to the FIRST image's original folds and seams.
- NON-SWAPPABLE ASSIGNMENT LOCK: SECOND image -> TOP area ONLY; THIRD image -> BOTTOM area ONLY. This mapping is fixed by image order, not by visual similarity, color harmony, or where the pattern would look better.
- Build two internal masks before editing: TOP_MASK = bodice / blouse / shirt / upper torso cloth in the FIRST image; BOTTOM_MASK = skirt / pants / lower garment cloth in the FIRST image. Apply the SECOND image only inside TOP_MASK and the THIRD image only inside BOTTOM_MASK.
- If the FIRST image is a one-piece dress, split it by the original waist seam or natural waist boundary: bodice/chest/upper part = TOP_MASK, skirt below waist = BOTTOM_MASK. The dress remains one piece, but the two fabric references must not be swapped.
- Critical failure examples: using the THIRD image's print on the bodice/top is wrong; using the SECOND image's print/color on the skirt/bottom is wrong; making the entire outfit use only one reference is wrong.
- Ignore every structural feature from the SECOND and THIRD images: garment category, silhouette, neckline, collar, placket, opening shape, sleeve style, sleeve length, waist, leg shape, skirt shape, hem, pockets, buttons, trims, closure layout, and overall pattern-making.
- Category lock: if the FIRST image's top is not V-neck, do NOT make it V-neck even when the SECOND image is V-neck. If the FIRST image's bottom is a skirt, it MUST remain a skirt even when the THIRD image is pants. If the FIRST image's bottom is pants, it MUST remain pants even when the THIRD image is a skirt.
- Preserve FIRST image garment categories and boundaries: top stays top, bottom stays bottom; never turn a skirt into pants, pants into skirt, separates into a dress/jumpsuit, or a dress into separates.
- Forbidden: copying garment silhouettes or cut from reference images; changing neckline, sleeve type, waistline, hem, length, fit, looseness, drape, category, pose, body shape, accessories, or background.
- Keep FIRST image background, model identity, face, hair, pose, accessories, lighting, crop, garment shape, fit, and drape unchanged.

中文要求：图片2和图片3只作为“布面外观参考”，只取颜色、花色、图案、纹理、材质感；严禁参考它们的版型。映射绝对不能弄反：图片2永远只贴到目标图的上衣/上半身/连衣裙上半身区域；图片3永远只贴到目标图的下装/裙摆/裤子区域。如果目标图是连衣裙，按原腰线或自然腰线分成上半身和裙摆，图片2贴上半身，图片3贴裙摆。把图片3花色贴到上半身是错误；把图片2花色贴到裙摆是错误。最终衣服的领型、袖型、衣长、腰线、裙型/裤型、松量、轮廓全部以图片1为准。图片2是V领也不能把目标上衣改成V领；图片3是裤子也不能把目标裙子改成裤子。只在目标图原有衣服表面换颜色和花纹。`

const PROMPT_GARMENT_STRUCTURE_LOCK = `GARMENT STRUCTURE LOCK — image 2 is the only authority for cut (mandatory):
- Match image 2 exactly: garment category, silhouette, neckline, collar, placket, button count and placement, sleeve length, sleeve type (e.g. short puff sleeves stay short puff — NOT slim bell or elbow unless image 2 has them), hem, seams, layers, piece count, trims, binding, ruffles, overlock/serged edges, topstitching, pocket shape, labels, closures, and panel joins.
- Forbidden: redesigning or beautifying the garment; changing sleeve style or length; changing neckline or hem; changing sewing construction or finishing method; importing cut, neckline, silhouette, or workmanship from image 1.
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
- Change ONLY the recolorable colored regions of garment cloth to the user-specified target color. This is a selective dye/recolor on the existing fabric — NOT a redesign, re-texture, or global color filter.
- For printed / patterned garments, recolor only the original colored motif or dominant colored fabric regions. Protect white, off-white, cream, light beige, pale gray, black, and other neutral background / negative-space areas from color contamination.
- The base photo is the sole authority for pattern layout, weave, folds, seams, and every surface detail.
- Output must look like the same photograph with the garment dyed — not a newly rendered outfit.
- Keep realistic shading: darker fold areas stay darker, highlights stay bright; only shift color inside the allowed recolorable regions while preserving original luminance.
- Forbidden: changing garment style, cut, fit, or silhouette. Forbidden: flattening, smoothing, or beautifying the cloth.
- Forbidden: applying a global tint, color cast, or color wash to the whole image or to protected neutral cloth areas.
- Background, model, face, hair, pose, accessories, props, lighting, crop, and composition remain 100% unchanged.`

/** 换色 — 图案/肌理/褶皱/拼接细节锁 */
const PROMPT_COLOR_PATTERN_LOCK = `PATTERN & SURFACE DETAIL LOCK — preserve ALL cloth structure from the base photo (mandatory):
- Preserve exact pattern type and layout: gingham, plaid, check, stripe, floral, or print — same scale, repeat size, grid proportions
- Preserve white, off-white, cream, pale, and neutral base areas exactly as neutral fabric. They must NOT become green, blue, red, yellow, pink, or any target-color tint.
- Preserve contrast squares/lines and their proportions; recolor only the non-white / non-neutral dominant color areas to the target hue.
- Treat white floral backgrounds, white pant bases, white plaid squares, white stripes, white negative space, pale highlights, and neutral thread as a protected mask.
- Preserve weave, crinkle, seersucker ridges, gauze grain, knit texture, and all micro-surface detail — do NOT flatten into a solid color field.
- Preserve natural garment drape, depth, and panel volume, but remove accidental photo wrinkles, press creases, crush marks, and random fabric dents that are not part of the garment design.
- Preserve construction details: seam lines, topstitching, panel joins, placket edges, collar/cuff ruffle layers, buttonholes, buttons, and color-block boundaries — recolor each cloth panel but keep seam geometry and stitching visible.
- Forbidden: removing prints or patterns; inventing new patterns; changing check/plaid scale; erasing seam lines or panel joins; tinting protected white/neutral background areas.
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
- Only allowed recolorable garment regions may change; protected white/neutral pattern areas and non-garment pixels stay unchanged.`
}

const PROMPT_COLOR_CHANGE_SUFFIX_ZH =
  '【必做】仅将衣服布料中原本有颜色的主色/花纹区域改为目标色；白色、米白、浅灰、浅色底布、白色格子、白色花纹留白和高光区域必须保持中性白/原色，禁止被目标色染色或出现整体偏色。必须完整保留原有格纹/印花结构、布料肌理、缝线拼接与所有表面细节；去除非设计本身的临时褶皱、压痕、拍摄折痕和随机皱痕；禁止变成纯色块、禁止改变版型与构图。真实照片效果。'

export const PROMPT_GLOBAL_CLEAN_CRAFT_LOCK = `GLOBAL GARMENT CLEANUP & WORKMANSHIP LOCK — applies to every mode (mandatory):
- Remove accidental photo wrinkles, crush marks, press creases, random folds, storage dents, and old-cloth wrinkle artifacts from the generated garment surface. Keep only natural garment drape needed for realistic fit and lighting.
- Preserve the garment's sewing workmanship exactly from the mode's garment-authority image: seams, overlock/serged edges, binding, piping, ruffles, pleats, gathers, topstitching, buttonholes, buttons, pockets, labels, panel joins, hem finish, placket finish, and trim placement.
- Forbidden: changing the workmanship method, simplifying craft details, redrawing trims, moving seams, changing pocket/label shape, or turning an inside/back construction into a front-facing design unless the selected view mode explicitly asks for it.

中文要求：所有模式都必须去掉非设计本身的拍摄褶皱、压痕、折痕和随机皱痕；只保留自然垂坠和光影。工艺必须严格保留：锁边/拷边、包边、荷叶边、褶裥、抽褶、明线、纽扣、口袋、标牌、拼接线、下摆和门襟做法都不能改。`

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
export const PROMPT_WEAR_MODE = `WEAR MODE — put the exact product garment onto the model reference (mandatory):
- Image 1: product garment photo — the ONLY authority for the garment itself.
- Image 2: model reference photo — use ONLY the model pose, body orientation, scene, background, lighting mood, accessories, styling context, camera angle, and composition.
- Put the exact garment(s) from Image 1 onto the model in Image 2.
- PRODUCT GARMENT LOCK: Preserve Image 1 garment 100% exactly: garment category, piece count, silhouette, fit, volume, looseness, neckline, collar, placket, sleeve length and style, shoulder shape, waistline, hem, length, skirt/pants shape, seams, pockets, buttons, trims, embroidery, prints, motifs, pattern scale, color palette, fabric texture, material, and all construction details.
- Ignore Image 2's original clothing completely. Do NOT borrow Image 2 clothing's cut, color, pattern, neckline, sleeve type, length, fit, waist, hem, or styling details.
- The output should look like Image 1's actual product garment, unchanged, is being worn by Image 2's model in Image 2's scene.
- Forbidden: changing Image 1's garment design in any way; recoloring it; changing prints or flower patterns; changing neckline; changing sleeve style; slimming or loosening the fit; moving or redrawing motifs; simplifying details; "improving", beautifying, stylizing, or adapting the garment to match Image 2's outfit.
- Preserve Image 2's presentation only: pose, body type, face, hair, accessories, background, lighting, camera angle, crop, and composition.
- If Image 1 shows a top + bottom outfit, both pieces must be transferred exactly and remain separate unless Image 1 itself is one-piece.

中文要求：图片1的商品衣服是唯一服装标准，必须严格保留它的版型、颜色、花色、图案、材质、领型、袖型、衣长、裤型/裙型、松量和所有细节。图片2只参考模特姿势、场景、配饰、背景、光线和构图；严禁参考图片2里原衣服的版型、颜色、花纹或风格。`

/** 上身展示模式 — 编辑接口（图1=模特参考底图，图2=商品） */
export const PROMPT_WEAR_MODE_EDIT = `WEAR MODE — put the exact product garment onto the model reference (mandatory):
- FIRST image — model reference base canvas. Use ONLY its model pose, body orientation, scene, background, lighting mood, accessories, styling context, camera angle, crop, and composition.
- SECOND image — product garment photo. It is the ONLY authority for the garment itself.
- Put the exact garment(s) from the SECOND image onto the model in the FIRST image.
- PRODUCT GARMENT LOCK: Preserve the SECOND image garment 100% exactly: garment category, piece count, silhouette, fit, volume, looseness, neckline, collar, placket, sleeve length and style, shoulder shape, waistline, hem, length, skirt/pants shape, seams, pockets, buttons, trims, embroidery, prints, motifs, pattern scale, color palette, fabric texture, material, and all construction details.
- Ignore the FIRST image's original clothing completely. Do NOT borrow the FIRST image clothing's cut, color, pattern, neckline, sleeve type, length, fit, waist, hem, or styling details.
- The output should look like the SECOND image's actual product garment, unchanged, is being worn by the FIRST image model in the FIRST image scene.
- Forbidden: changing the SECOND image garment design in any way; recoloring it; changing prints or flower patterns; changing neckline; changing sleeve style; slimming or loosening the fit; moving or redrawing motifs; simplifying details; "improving", beautifying, stylizing, or adapting the garment to match the FIRST image outfit.
- Preserve the FIRST image's presentation only: pose, body type, face, hair, accessories, background, lighting, camera angle, crop, and composition.
- If the SECOND image shows a top + bottom outfit, both pieces must be transferred exactly and remain separate unless the SECOND image itself is one-piece.

中文要求：图片2的商品衣服是唯一服装标准，必须严格保留它的版型、颜色、花色、图案、材质、领型、袖型、衣长、裤型/裙型、松量和所有细节。图片1只参考模特姿势、场景、配饰、背景、光线和构图；严禁参考图片1里原衣服的版型、颜色、花纹或风格。`

/** 提取花色模式 — 从成衣/布面照片生成无缝循环印花图 */
export const PROMPT_PATTERN_EXTRACT = `SEAMLESS PATTERN EXTRACTION MODE — turn the source photo into a tileable textile repeat (mandatory):
- Input image is a garment or fabric photo containing a visible print. Extract ONLY the print design: colors, motifs, motif scale, spacing, repeat direction, and overall textile style.
- This is NOT a photo edit. Do not preserve the input photo canvas, garment shape, folds, seams, or lighting. Redraw the print as new clean artwork using the input only as a visual reference.
- Output a clean flat 2D seamless repeat tile for textile printing. The image must be tileable horizontally and vertically.
- The LEFT edge must connect naturally to the RIGHT edge; the TOP edge must connect naturally to the BOTTOM edge. Motifs crossing an edge must continue on the opposite edge with matching color, scale, direction, and spacing.
- There must be no visible border, frame, cut-off seam, hard edge, broken motif, empty strip, or obvious square boundary when tiled in a grid.
- Distribute motifs so the repeat feels continuous across the whole tile, not like one large centered illustration copied on a square.
- Redraw motifs with smooth continuous curves, crisp clean edges, and vector-like flat color areas. Leaves, stems, petals, and negative spaces must look intentional and flowing, not torn, jagged, wrinkled, melted, or broken.
- Remove all garment/photo artifacts: body shape, pants/skirt legs, seams, waistline, hems, folds, wrinkles, shadows, highlights, perspective distortion, fabric drape, background, props, hands, skin, labels, and lighting gradients.
- Reconstruct the print on a perfectly flat plane with even lighting and no fabric texture unless the print itself requires subtle material grain.
- Preserve the source color relationship accurately, including background color and motif color. Do not swap foreground/background colors.
- Preserve the recognizable motif identity from the source photo. If the photo only shows part of the repeat, infer a plausible continuous repeat from the visible motifs without inventing a different print style.
- Fill the entire square canvas edge-to-edge with the flat repeated pattern. No borders, no mockup, no garment, no perspective, no shadows, no vertical pant-leg seam, no central crease.
- The result should look like a digital seamless textile repeat tile ready to use as a fabric reference image.

中文要求：从用户上传的成衣/布料照片中提取花色，生成干净的“无缝循环/连续印花”方形图案。重点是可以上下左右重复平铺：左边必须能自然接右边，上边必须能自然接下边；图案跨出边缘时要在另一侧连续出现，颜色、比例、方向和间距要对上。不能有边框、断边、硬切痕、空白边、明显方块边界或拼接缝。这不是修原图，不能保留原图的裤腿结构、褶皱、中缝、阴影和高光；必须按参考花型重新绘制成平整的图案文件。只保留颜色、叶子/花朵/几何等图案、图案比例和重复排列；叶片、枝条和留白边缘要顺滑、连续、干净，像矢量印花稿，不要破碎、锯齿、融化、皱巴巴或被裤缝切断。输出必须是满画布平铺的方形无缝循环 tile，不要生成衣服或模特。`

/** 默认追加说明（简短中文，强化「必须换布」） */
export const DEFAULT_PROMPT_SUFFIX =
  '【必做】第1张图的布面颜色/花纹/肌理必须完整替换第2张图所有衣服布面；保留目标图原印花是错误的。第1张若无印花则按纯色/肌理替换。版型、松量、腰线、轮廓必须与目标图完全一致，禁止收腰修身、禁止改变宽松度，只换布面。袖型、领型、裁剪和工艺做法亦须与目标图一致。去除非设计本身的临时褶皱、压痕和拍摄折痕。除衣服布面外，目标图其余内容保持不变。'

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
/** 局部布样模式：布料特写/旋转/褶皱模板 */
export const STORAGE_KEY_FABRIC_CLOSEUP_MODE = 'clothing_tool_fabric_closeup_mode'
/** 标准换布：正面 / 背面视角 */
export const STORAGE_KEY_STANDARD_VIEW = 'clothing_tool_standard_view'
/** 一键换色模式：用户指定颜色替换衣服颜色 */
export const STORAGE_KEY_COLOR_CHANGE = 'clothing_tool_color_change'
/** 换色模式：生成后恢复白底/浅色留白，避免被目标色污染 */
export const STORAGE_KEY_COLOR_CHANGE_PROTECT_NEUTRALS = 'clothing_tool_color_change_protect_neutrals'
/** 上身展示模式：商品平铺图穿到参考图模特身上 */
export const STORAGE_KEY_WEAR_MODE = 'clothing_tool_wear_mode'
/** 提取花色模式：成衣/布面照片转无缝循环印花图 */
export const STORAGE_KEY_PATTERN_EXTRACT_MODE = 'clothing_tool_pattern_extract_mode'
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

export const ASPECT_OPTIONS = ['1:1', '1:2', '2:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']
