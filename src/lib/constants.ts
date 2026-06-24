export const LEGACY_PRODUCTION_API_BASE = 'https://ai.t8star.cn'
export const PRODUCTION_API_BASE = 'https://ai.t8star.org'
export const DEV_PROXY_API_BASE = '/t8proxy'
export const DEFAULT_API_BASE = PRODUCTION_API_BASE

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

/** Shared print aesthetic for fabric transfer modes */
export const PROMPT_PRINT_AESTHETIC = `Keep the print clean and flowing, with complete motifs and clear negative space. No fragmented leaves, patchy tiles, dense repeats, or cluttered stacking.`

/** Shared fabric-surface handling for fabric transfer modes */
const PROMPT_PRINT_FABRIC_SURFACE = `Change only the relevant fabric areas and remove the original print. Keep the fabric as smooth as possible with a natural, continuous print.`

/** Framing lock — used for close-up / partial tasks when needed */
export const PROMPT_FRAMING_LOCK = `Keep the target image's original crop, aspect ratio, subject size, and visible area.
Do not expand the frame, complete missing body or garment parts, or add shoes, bags, jewelry, props, or background elements.`

/** Edit API prompt (first image = target, second image = fabric) */
export function buildFabricTransferPromptForEdits(multiTarget = false): string {
  return [
    'The first image is the target. The second image is the fabric reference.',
    'Apply the pattern from the second image to all garment fabric areas in the first image. Keep the person, background, accessories, and composition unchanged.',
    PROMPT_PRINT_FABRIC_SURFACE,
    PROMPT_PRINT_AESTHETIC,
    multiTarget ? 'Use the same fabric reference for every image in the batch. Keep the print style consistent.' : '',
  ].filter(Boolean).join('\n')
}

/** Solid fabric mode */
export const PROMPT_SOLID_FABRIC_EDIT = `The first image is the target. The second image is the fabric reference.
Change all garment fabric in the first image to the solid color and texture of the second image. Keep the person, background, and composition unchanged.
Remove the original print.`

/** Fabric close-up mode — generation API (image 1 = fabric, image 2 = close-up template) */
export const PROMPT_FABRIC_CLOSEUP_MODE = `Image 1 is the fabric reference. Image 2 is the fabric close-up template.
Apply the pattern from image 1 to the existing fabric surface in image 2. Keep image 2's original crop, angle, folds, lighting, and boundaries unchanged.
Change only the fabric color/print and remove the original print. Keep the pattern natural and continuous.
${PROMPT_PRINT_AESTHETIC}
Do not generate a garment, model, or new background.`

/** Fabric close-up mode — edit API (first image = template, second image = fabric) */
export const PROMPT_FABRIC_CLOSEUP_MODE_EDIT = `The first image is the fabric close-up template. The second image is the fabric reference.
Apply the pattern from the second image to the existing fabric surface in the first image. Keep the original crop, angle, folds, lighting, and boundaries unchanged.
Change only the fabric color/print and remove the original print. Keep the pattern natural and continuous.
${PROMPT_PRINT_AESTHETIC}
Do not generate a garment, model, or new background.`

/** Skirt mode — generation API (image 1 = fabric, image 2 = target) */
export const PROMPT_SKIRT_ONLY = `Image 1 is the fabric reference. Image 2 is the target.
Apply the pattern from image 1 to the bottom garment (skirt/pants) in image 2. Keep the top, background, person, and composition unchanged.
Change only the bottom fabric and remove the original bottom print. Keep the fabric as smooth as possible with a natural, continuous print. For dresses, change only the skirt below the waistline.
${PROMPT_PRINT_AESTHETIC}`

/** Skirt mode — edit API */
export const PROMPT_SKIRT_ONLY_EDIT = `The first image is the target. The second image is the fabric reference.
Apply the pattern from the second image to the bottom garment (skirt/pants) in the first image. Keep the top, background, person, and composition unchanged.
Change only the bottom fabric and remove the original bottom print. Keep the fabric as smooth as possible with a natural, continuous print. For dresses, change only the skirt below the waistline.
${PROMPT_PRINT_AESTHETIC}`

/** Top-only mode — edit API (first image = target, second image = fabric) */
export const PROMPT_SEPARATES_MODE = `The first image is the target. The second image is the fabric reference.
Apply the pattern from the second image to the top/upper garment in the first image. Keep the bottom, background, person, and composition unchanged.
Change only the top fabric and remove the original top print. Keep the fabric as smooth as possible with a natural, continuous print.
${PROMPT_PRINT_AESTHETIC}`

/** Top-only mode — edit API alias */
export const PROMPT_SEPARATES_MODE_EDIT = PROMPT_SEPARATES_MODE

/** Dual-reference mode — generation API (image 1 = top fabric, image 2 = bottom fabric, image 3 = target) */
export const PROMPT_SEPARATES_DUAL_MODE = `Image 1 is the top fabric reference. Image 2 is the bottom fabric reference. Image 3 is the target.
Apply image 1 to the top/upper area of image 3 and image 2 to the bottom area of image 3. Keep the person, background, accessories, and composition unchanged.
For dresses, split at the waistline: use image 1 for the bodice and image 2 for the skirt.
Change only the corresponding fabric areas and remove the original print. Keep the fabric as smooth as possible with a natural, continuous print.
${PROMPT_PRINT_AESTHETIC}`

/** Dual-reference mode — edit API (first = target, second = top fabric, third = bottom fabric) */
export const PROMPT_SEPARATES_DUAL_MODE_EDIT = `The first image is the target. The second image is the top fabric reference. The third image is the bottom fabric reference.
Apply the second image to the top/upper area of the first image and the third image to the bottom area of the first image. Keep the person, background, accessories, and composition unchanged.
For dresses, split at the waistline: use the second image for the bodice and the third image for the skirt.
Change only the corresponding fabric areas and remove the original print. Keep the fabric as smooth as possible with a natural, continuous print.
${PROMPT_PRINT_AESTHETIC}`

/** Legacy generation API helper */
export const PROMPT_GARMENT_FIT_LOCK = `Preserve the target garment's original fit, ease, waist width, outer silhouette, and drape. Replace only the fabric color, print, or texture.`

/** Appended when the user selects solid fabric */
export const PROMPT_SOLID_FABRIC = `Image 1 is the fabric reference. Image 2 is the target.
Change all garment fabric in image 2 to the solid color and texture of image 1. Keep the person, background, and composition unchanged.
Remove the original print.`

/** Color-change mode — replace garment with a user-selected solid color */
const PROMPT_COLOR_CHANGE_CORE = `将图中的衣服改为纯色，颜色为：
彻底清除衣服上的原有印花、图案、格子、条纹和 logo，不得有任何残留或透影。
布面必须是均匀纯色，禁止出现新的花纹、图案、叶子、波点等装饰。
褶皱与明暗可体现目标色的自然深浅，但不得保留原有图案结构。
保持人物、背景、配饰、姿态和光线不变，只改衣服颜色；不要改皮肤、头发和背景。`

/** Color-change mode — full prompt (single image, no fabric reference) */
export function buildColorChangePrompt(forEdits: boolean, targetColor: string): string {
  const lines = PROMPT_COLOR_CHANGE_CORE.split('\n')
  lines[0] = `${lines[0]}${targetColor}`
  if (forEdits) {
    lines.unshift('第一张为待换色的模特图。')
  }
  return lines.join('\n')
}

/** @deprecated Use buildColorChangePrompt; kept for external imports */
export const PROMPT_COLOR_CHANGE = PROMPT_COLOR_CHANGE_CORE

type ColorCardView = 'front' | 'back'

function colorCardViewPrompt(view: ColorCardView, baseImageLabel: string, hasBackReference = false): string {
  if (view === 'front') {
    return `Keep the front composition and pose of ${baseImageLabel}. Change only the top colorway.`
  }

  if (hasBackReference) {
    return `Keep the back composition of ${baseImageLabel}. Change only the back top colorway. Do not flip it to the front.`
  }

  return `Generate the back view of the same top, with the same check pattern as the front. The model must not face the camera.`
}

/** Color-card mode — edit API (first image = model reference, second image = numbered swatch card) */
export function buildColorCardPromptForEdits(
  swatchNumber: number,
  view: ColorCardView,
  hasBackReference = false,
): string {
  return `The first image is the model reference. The second image is the numbered swatch card.
Change the top to swatch number ${swatchNumber}. Keep the bottom, background, person, and composition unchanged.
Preserve the original check structure and white squares with a natural, continuous colorway. Use the correct swatch number; do not turn it into a solid color.
${PROMPT_PRINT_AESTHETIC}
${colorCardViewPrompt(view, 'the first image', hasBackReference)}`
}

/** Color-card mode — generation API (image 1 = swatch card, image 2 = model reference) */
export function buildColorCardPrompt(
  swatchNumber: number,
  view: ColorCardView,
  hasBackReference = false,
): string {
  return `Image 1 is the numbered swatch card. Image 2 is the model reference.
Change the top to swatch number ${swatchNumber}. Keep the bottom, background, person, and composition unchanged.
Preserve the original check structure and white squares with a natural, continuous colorway. Use the correct swatch number; do not turn it into a solid color.
${PROMPT_PRINT_AESTHETIC}
${colorCardViewPrompt(view, 'image 2', hasBackReference)}`
}

/** Wear mode — generation API (image 1 = product, image 2 = model reference) */
export const PROMPT_WEAR_MODE = `Image 1 is the product garment — the ONLY source for all clothing details.
Image 2 is the model reference — use it ONLY for the person, body, pose, hair, background, lighting, and composition.

Put the garment from image 1 onto the model in image 2.
Copy image 1's garment 1:1: silhouette, fit, color, print/pattern, material, neckline, collar, sleeves, hem, length, buttons, pockets, seams, and every visible detail.
If image 1 shows the back of the garment, reproduce that exact back structure — do not flip to front or borrow clothing from image 2.
If image 1 shows the front, reproduce that exact front structure — do not flip to back.

Completely replace and ignore image 2's original clothing. Do not copy, blend, or reference the model's existing outfit style, color, print, or garment structure in any way.
Keep the print clean, flowing, and continuous on the worn garment. Keep the person, pose, background, and composition unchanged.
${PROMPT_PRINT_AESTHETIC}`

/** Combo mode — edit API (first = model, second = scene, third = garment) */
export const PROMPT_COMBO_MODE_EDIT = `The first image is the model reference — use it for the person, body, pose, hair, and skin tone.
The second image is the scene reference — use it for the background, environment, lighting mood, and overall setting.
The third image is the product garment — the ONLY source for all clothing details.

Composite a fashion photo: dress the model from the first image in the garment from the third image, and place them in the scene from the second image.
Copy the third image's garment 1:1: silhouette, fit, color, print/pattern, material, neckline, collar, sleeves, hem, length, buttons, pockets, seams, and every visible detail.
If the third image shows the back of the garment, reproduce that exact back structure — do not flip to front or borrow clothing from other images.
If the third image shows the front, reproduce that exact front structure — do not flip to back.
Use the second image's background and environmental lighting. Adapt the model's lighting naturally to match the scene.
Completely ignore the original clothing in the first and second images. Do not copy, blend, or reference garment details from the model or scene references.
Keep the person identity and pose from the first image as much as possible.
Keep the print clean, flowing, and continuous on the worn garment.
${PROMPT_PRINT_AESTHETIC}`

/** Wear mode — edit API (first image = model reference, second image = product) */
export const PROMPT_WEAR_MODE_EDIT = `The first image is the model reference — use it ONLY for the person, body, pose, hair, skin tone, background, lighting, and composition.
The second image is the product garment — the ONLY source for all clothing details.

Dress the model from the first image in the garment from the second image.
Copy the second image's garment 1:1: silhouette, fit, color, print/pattern, material, neckline, collar, sleeves, hem, length, buttons, pockets, seams, and every visible detail.
If the second image shows the back of the garment, reproduce that exact back structure in the result — do not flip to front or borrow the first image's outfit.
If the second image shows the front, reproduce that exact front structure — do not flip to back.

Completely replace and ignore the first image's original clothing. Do not copy, blend, or reference the model's existing outfit style, color, print, or garment structure in any way.
Keep the print clean, flowing, and continuous on the worn garment. Keep the person, pose, background, and composition unchanged.
${PROMPT_PRINT_AESTHETIC}`

/** Flatten mode — turn worn clothes into a flat-lay product photo (single image, no reference) */
export const PROMPT_MODEL_FLATTEN = `Turn the worn outfit in the uploaded photo into a top-down flat-lay product image.
Identify the full outfit's style, colors, print, material, neckline, sleeves, length, and all details from the model photo.
Remove the clothes from the body and lay them flat on a clean background like an e-commerce flat lay: top-down view, natural styling, realistic photo quality.
The output must be a real flat-lay product photo, not a seamless repeat print, fabric swatch, pattern-piece diagram, illustration, or line art.
Do not keep the model, body, face, hair, skin, hands, or feet. Accessories such as belt, shoes, or bag may remain if they match the reference style.
The clothes must be completely flat and ironed, with no wrinkles, creases, or drape shadows, suitable for product display.
Keep the full garment shapes and styling relationship. Do not split the clothes into pattern pieces or turn the print into a repeating tile.`

/** Flatten mode — edit API (first image = flat-lay reference, second image = model photo) */
export const PROMPT_MODEL_FLATTEN_WITH_REF_EDIT = `The first image is a flat-lay product reference showing how an outfit is styled top-down on a background.
The second image is a model wearing the clothes.
Follow the first image's flat-lay style closely: top-down angle, background material, overall composition, crop ratio, styling layout, prop placement, and product-photo look.
Convert the clothes worn in the second image into the same kind of top-down flat-lay product photo.
Take the colors, print, material, neckline, sleeves, hem, buttons, pockets, and all other details from the second image, along with bottom pieces, belt, shoes, bag, and other styling, and apply them in the flat-lay style shown by the first image.
The output must be a real flat-lay product photo for e-commerce, not a seamless repeat print, fabric swatch, pattern-piece diagram, illustration, or line art.
Do not keep the model, body, face, hair, skin, hands, or feet.
If the first reference includes background, belt, shoes, bag, or other styling, keep the same flat-lay styling in the result. If the reference shows only clothes, lay out only the clothes.
The clothes must be completely flat and ironed, with no wrinkles, creases, or drape shadows, suitable for product display.
Keep the full garment shapes and styling relationship. Do not split the clothes into pattern pieces or turn the print into a repeating tile.
The overall look must match the first reference image.`

/** Pattern extract mode — extract a seamless square print from garment/fabric photo */
export const PROMPT_PATTERN_EXTRACT = `Extract a natural print from the first image and generate a 1:1 square seamless repeat tile.
Keep only the colors, motif style, and repeat rhythm. Do not keep garment shape, model, folds, or background.
Make the repeat connect naturally on all sides with continuous elements across the edges.
${PROMPT_PRINT_AESTHETIC}`

/** Legacy fabric-transfer prompt for generation API */
export function buildFabricTransferPrompt(multiTarget = false): string {
  return [
    'Image 1 is the fabric reference. Image 2 is the target.',
    'Apply the pattern from image 1 to all garment fabric areas in image 2. Keep the person, background, accessories, and composition unchanged.',
    PROMPT_PRINT_FABRIC_SURFACE,
    PROMPT_PRINT_AESTHETIC,
    multiTarget ? 'Use the same fabric reference for every image in the batch. Keep the print style consistent.' : '',
  ].filter(Boolean).join('\n')
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
/** 仅换上装模式：只处理上衣，下装不变 */
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
/** 三图组合模式：模特 × 场景 × 衣服 笛卡尔积批量生成 */
export const STORAGE_KEY_COMBO_MODE = 'clothing_tool_combo_mode'
/** 展平模式：模特身上衣服转平铺商品图 */
export const STORAGE_KEY_MODEL_FLATTEN_MODE = 'clothing_tool_model_flatten_mode'
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
