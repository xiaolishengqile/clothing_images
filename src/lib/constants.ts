export const LEGACY_PRODUCTION_API_BASE = 'https://ai.t8star.cn'
export const PRODUCTION_API_BASE = 'https://ai.t8star.org'
export const DEV_PROXY_API_BASE = '/t8proxy'
export const DEFAULT_API_BASE = PRODUCTION_API_BASE

/** 批量生成时最多同时发起的请求数（与当前待处理张数取较小值） */
export const MAX_BATCH_CONCURRENCY = 30

export const DEFAULT_MODEL = 'gpt-image-2'

/** 印花自然呈现：提取与转移共用的真实成衣原则 */
export const PROMPT_PRINT_NATURAL_REALISM = `印花必须符合真实成衣特点：像同一匹布自然裁切、缝制、穿着后在立体衣身上呈现的效果，而不是把参考图平面图案死搬硬套。
图案应随布面走向、立体结构、拼接线和视觉透视合理延续，比例协调、前后连贯、边缘自然，整体流畅不杂乱。`

/** 换布通用规则：只作为各模式内的短说明，不再全局追加 */
export const PROMPT_SEAMLESS_PRINT_TRANSFER = `从布料参考图提取花色风格：颜色、图案类型、比例尺度和整体节奏以参考图为准，再自然适配到目标衣服的立体衣身。
参考图只提供图案元素与配色，不提供在衣服上的具体排版；印花位置、走向和透视由目标衣服的版型与结构决定。
禁止贴块、硬切、断叶断花、缩小后重复平铺、明显拼接边、马赛克式碎块、多方向混叠、图案密度突变或机械复制布样构图。`

/** 换布印花洁净度：颜色干净，布局随衣身自然变化 */
export const PROMPT_PRINT_SURFACE_QUALITY = `印花颜色对齐参考图的花色体系：该白处干净纯白，该纯色处均匀饱满、对比清晰；但图案在衣身上的分布要符合自然穿着效果。
彻底清除目标图原有印花和旧色残留，不允许发灰、发脏、混色或若隐若现的原图案。
结果应像真实印在花衣上的连贯布面，可随立体轮廓产生自然视觉延续，不要被旧图脏污弄糊，也不要生硬照搬布样平面布局。`

/** 换布印花规则合集（自然 + 无缝 + 洁净） */
export const PROMPT_FABRIC_PRINT_RULES = [PROMPT_PRINT_NATURAL_REALISM, PROMPT_SEAMLESS_PRINT_TRANSFER, PROMPT_PRINT_SURFACE_QUALITY].join('\n')

/** 构图提示：仅供局部任务按需引用 */
export const PROMPT_FRAMING_LOCK = `保持目标图原裁切、比例、主体大小和可见范围。
不要扩图、补全身体或衣服，不要新增鞋、包、首饰、道具或背景元素。`

const PROMPT_STRUCTURE_PRESERVE = `保留目标图的衣服版型、领型、袖型、长度、松量、腰线、缝线、纽扣、口袋、下摆和穿着姿态；印花随立体衣身自然流转，不要被旧图脏污或阴影污染。`

const PROMPT_SCENE_PRESERVE = `只改衣服布面；人物、皮肤、头发、配饰、道具、背景、光线和构图保持不变。`

/** 编辑接口专用提示词（第一张=目标图，第二张=布料图） */
export function buildFabricTransferPromptForEdits(multiTarget = false): string {
  return [
    '第一张是目标图，第二张是布料/花色参考图。',
    '把第一张图中所有衣服布面换成第二张的花色风格、颜色和质感；参考图只提供图案元素与配色，不提供在衣服上的具体排版。',
    '第二张只提供花色、图案风格、颜色和质感，不提供版型和在衣身上的摆放位置；第一张提供衣服区域、版型、立体结构和构图，印花应自然适配第一张。',
    '去掉第一张衣服原有花纹、图案和旧颜色，不要保留或改色原印花；白色印花区域必须是参考图的纯白色，不能发灰发脏。',
    PROMPT_FABRIC_PRINT_RULES,
    PROMPT_STRUCTURE_PRESERVE,
    PROMPT_SCENE_PRESERVE,
    multiTarget ? '批量生成时，所有目标图都使用同一张布料/花色参考，印花风格须自然一致、连贯流畅。' : '',
  ].filter(Boolean).join('\n')
}

/** 纯色布料模式 */
export const PROMPT_SOLID_FABRIC_EDIT = `第二张作为纯色或低花纹布样参考。
把第一张所有衣服布面改成第二张的颜色和细微质感，去掉第一张原有印花。
${PROMPT_STRUCTURE_PRESERVE}
${PROMPT_SCENE_PRESERVE}`

/** 局部布样模式 — 生成接口（图1=新布料，图2=局部模板） */
export const PROMPT_FABRIC_CLOSEUP_MODE = `图一是新布料/花色参考，图二是局部布样模板。
只把图一的花色风格、颜色、比例和质感自然换到图二已有布面上，保持图案连贯流畅，不要碎块拼贴。
保持图二原裁切、旋转角度、褶皱走向、光影、透视和边界。
不要生成衣服、模特、领口、袖子、纽扣、吊牌、完整商品图或新背景。
${PROMPT_FABRIC_PRINT_RULES}`

/** 局部布样模式 — 编辑接口（第一张=局部模板，第二张=新布料） */
export const PROMPT_FABRIC_CLOSEUP_MODE_EDIT = `第一张是局部布样模板，第二张是新布料/花色参考。
只把第二张的花色风格、颜色、比例和质感自然换到第一张已有布面上，保持图案连贯流畅，不要碎块拼贴。
保持第一张原裁切、旋转角度、褶皱走向、光影、透视和边界。
不要生成衣服、模特、领口、袖子、纽扣、吊牌、完整商品图或新背景。
${PROMPT_FABRIC_PRINT_RULES}`

/** 裙子模式 — 只换裙子，上衣保持不变 */
export const PROMPT_SKIRT_ONLY = `图一是下装布料/花色参考，图二是目标图。
只替换图二的裙子、裤子或下半身布面，使用图一的花色风格自然延续。
上衣、胸部以上区域、人物、背景和配饰保持不变。
如果是连衣裙，只改腰线以下裙摆；腰线以上不变。
${PROMPT_FABRIC_PRINT_RULES}`

/** 裙子模式 — 编辑接口专用 */
export const PROMPT_SKIRT_ONLY_EDIT = `第一张是目标图，第二张是下装布料/花色参考。
只替换第一张的裙子、裤子或下半身布面，使用第二张的花色风格自然延续。
上衣、胸部以上区域、人物、背景和配饰保持不变。
如果是连衣裙，只改腰线以下裙摆；腰线以上不变。
${PROMPT_FABRIC_PRINT_RULES}`

/** 仅换上装模式 — 只替换上衣，下装保持不变 */
export const PROMPT_SEPARATES_MODE = `第一张是目标图，第二张是上装布料/花色参考。
只把第一张的上衣、上半身或连衣裙上半身换成第二张的花色风格、颜色和质感，印花随衣身自然流转。
下装、裙摆、裤子和腰线以下区域保持原样。
第二张只提供布面外观，不提供领型、袖型、衣长或版型。
${PROMPT_FABRIC_PRINT_RULES}
${PROMPT_STRUCTURE_PRESERVE}
${PROMPT_SCENE_PRESERVE}`

/** 仅换上装模式 — 编辑接口专用（第一张=目标图，第二张=上装参考图） */
export const PROMPT_SEPARATES_MODE_EDIT = PROMPT_SEPARATES_MODE

/** 上下装双参考模式 — 生成接口（图1=上衣表面参考，图2=下装表面参考，图3=目标图） */
export const PROMPT_SEPARATES_DUAL_MODE = `图一是上衣布面参考，图二是下装布面参考，图三是目标图。
图一只能用于上衣、上半身或连衣裙上半身；图二只能用于裙摆、裤子或腰线以下区域。
每张参考图都提供各自区域的花色风格，印花随对应衣身区域自然延续，不要碎块拼贴或杂乱混叠。
图三只提供人物、场景、构图、衣服区域、版型和立体轮廓；不要保留或改色图三原有印花。
如果图三是连衣裙，按原腰线分区：上半身用图一，裙摆用图二。
参考图上的文字、边框或标记只用于识别，不要画进结果。
${PROMPT_FABRIC_PRINT_RULES}
${PROMPT_STRUCTURE_PRESERVE}
${PROMPT_SCENE_PRESERVE}`

/** 上下装双参考模式 — 编辑接口（第一张=目标图，第二张=上衣表面参考，第三张=下装表面参考） */
export const PROMPT_SEPARATES_DUAL_MODE_EDIT = `第一张是目标图，第二张是上衣布面参考，第三张是下装布面参考。
第二张只能用于上衣、上半身或连衣裙上半身；第三张只能用于裙摆、裤子或腰线以下区域。
每张参考图都提供各自区域的花色风格，印花随对应衣身区域自然延续，不要碎块拼贴或杂乱混叠。
第一张只提供人物、场景、构图、衣服区域、版型和立体轮廓；不要保留或改色第一张原有印花。
如果第一张是连衣裙，按原腰线分区：上半身用第二张，裙摆用第三张。
参考图上的文字、边框或标记只用于识别，不要画进结果。
${PROMPT_FABRIC_PRINT_RULES}
${PROMPT_STRUCTURE_PRESERVE}
${PROMPT_SCENE_PRESERVE}`

/** 兼容旧生成接口 */
export const PROMPT_GARMENT_FIT_LOCK = `保持目标图原有版型、松量、腰宽、外轮廓和垂坠，只替换布面颜色、印花或质感。`

/** 用户勾选「纯色布料」时追加 */
export const PROMPT_SOLID_FABRIC = `把目标衣服布面改成参考图的纯色或低花纹质感。
去掉目标图原有花纹、图案和旧颜色。
${PROMPT_STRUCTURE_PRESERVE}
${PROMPT_SCENE_PRESERVE}`

/** 一键换色模式 — 整件衣服改成用户选择的纯色 */
const PROMPT_COLOR_CHANGE_CORE = `把第一张图中所有衣服布料完全改成用户选中的纯色，整块布面颜色均匀一致。
必须彻底清除原有花纹、格纹、条纹、印花、logo、波点、刺绣图案和一切旧颜色，不允许任何残留或若隐若现的原图案。
包括褶皱内、阴影处、高光处、边缘过渡和原图里的白色/浅色格子区域，全部都要变成目标色或其自然明暗变化，不能看见原来的图案结构。
结果必须是干净的真实照片换色，不是叠色、半透明改色或保留底纹。
保留衣服版型、褶皱形状、缝线走向、纽扣、人物、姿势、背景和光线；只替换布面颜色，不改变版型轮廓。
皮肤、头发、首饰、包、道具和背景保持原样，不要改色。`

/** 一键换色模式 — 完整提示词（单图，无布料参考） */
export function buildColorChangePrompt(forEdits: boolean, targetColor: string): string {
  return [
    PROMPT_COLOR_CHANGE_CORE,
    forEdits
      ? '以第一张图为原图。'
      : '以输入图为原图。',
    `目标颜色：${targetColor}`,
  ].join('\n\n')
}

/** @deprecated 使用 buildColorChangePrompt；保留导出以免外部引用报错 */
export const PROMPT_COLOR_CHANGE = PROMPT_COLOR_CHANGE_CORE

type ColorCardView = 'front' | 'back'

function colorCardViewPrompt(view: ColorCardView, baseImageLabel: string, hasBackReference = false): string {
  if (view === 'front') {
    return `保持${baseImageLabel}的正面构图、姿势、人物、裤子、配饰、背景、光线、裁切和镜头角度。
只改变上衣/衬衫布料配色。`
  }

  if (hasBackReference) {
    return `保持${baseImageLabel}的背面构图、姿势、人物、裤子、配饰、背景、光线、裁切和镜头角度。
只改变背面上衣/衬衫布料配色，不要翻成正面。`
  }

  return `生成同一模特穿同一件上衣的真实背面图。
上衣版型、领口/门襟逻辑、袖型、长度、松量、下摆宽度、垂坠、格纹比例和质感要与正面参考一致。
裤子、体型、背景风格和光线保持一致，不要让模特面向镜头。`
}

/** 色卡模式 — 编辑接口（第一张=模特参考，第二张=编号色卡） */
export function buildColorCardPromptForEdits(
  swatchNumber: number,
  view: ColorCardView,
  hasBackReference = false,
): string {
  const baseRole =
    view === 'back' && hasBackReference
      ? '第一张是背面模特参考图，提供人物、上衣版型、格纹比例、褶皱、光线和场景。'
      : '第一张是正面模特参考图，提供人物、上衣版型、格纹比例、褶皱、光线和场景。'

  return `色卡模式。
${baseRole}
第二张是编号色卡，请找到编号 ${swatchNumber}，读取该色号的格子配色。
只把模特上衣/衬衫改成编号 ${swatchNumber} 的格子配色。
保留原上衣格纹结构和格距比例，格子配色随立体衣身自然呈现，符合真实穿着效果，不要机械贴图。
保留白色格子、织纹、纽扣、门襟和布料质感；不要改变裤子、配饰、体型、背景和真实照片效果；不要用错色号，不要改成纯色。
${colorCardViewPrompt(view, '第一张', hasBackReference)}`
}

/** 色卡模式 — 生成接口（图1=编号色卡，图2=模特参考） */
export function buildColorCardPrompt(
  swatchNumber: number,
  view: ColorCardView,
  hasBackReference = false,
): string {
  const baseRole =
    view === 'back' && hasBackReference
      ? '图二是背面模特参考图，提供人物、上衣版型、格纹比例、褶皱、光线和场景。'
      : '图二是正面模特参考图，提供人物、上衣版型、格纹比例、褶皱、光线和场景。'

  return `色卡模式。
图一是编号色卡，请找到编号 ${swatchNumber}，读取该色号的格子配色。
${baseRole}
只把模特上衣/衬衫改成编号 ${swatchNumber} 的格子配色。
保留原上衣格纹结构和格距比例，格子配色随立体衣身自然呈现，符合真实穿着效果，不要机械贴图。
保留白色格子、织纹、纽扣、门襟和布料质感；不要改变裤子、配饰、体型、背景和真实照片效果；不要用错色号，不要改成纯色。
${colorCardViewPrompt(view, '图二', hasBackReference)}`
}

/** 上身展示模式 — 生成接口（图1=商品，图2=模特参考） */
export const PROMPT_WEAR_MODE = `图一是商品衣服，图二是模特参考图。
把图一的商品衣服穿到图二模特身上。
衣服以图一为准：版型、颜色、花色、材质、领型、袖型、长度、松量、缝线、纽扣、口袋和所有细节都要保留。
印花和花色要随模特身上的立体结构自然呈现，符合真实穿着效果，不要死搬商品平铺图的排版。
图二只提供模特姿势、体型、脸、头发、配饰、背景、光线、镜头角度和构图。
不要参考图二原衣服的颜色、花纹、版型或风格。`

/** 上身展示模式 — 编辑接口（图1=模特参考底图，图2=商品） */
export const PROMPT_WEAR_MODE_EDIT = `第一张是模特参考图，第二张是商品衣服。
把第二张的商品衣服穿到第一张模特身上。
衣服以第二张为准：版型、颜色、花色、材质、领型、袖型、长度、松量、缝线、纽扣、口袋和所有细节都要保留。
印花和花色要随模特身上的立体结构自然呈现，符合真实穿着效果，不要死搬商品平铺图的排版。
第一张只提供模特姿势、体型、脸、头发、配饰、背景、光线、镜头角度和构图。
不要参考第一张原衣服的颜色、花纹、版型或风格。`

/** 展平模式 — 将模特身上穿着的衣服转为平铺商品图（单图，无参考） */
export const PROMPT_MODEL_FLATTEN = `将模特身上穿着的衣服转为俯拍平铺商品图（flat lay）。
从上传的模特照片中识别整套衣服的款式、颜色、花纹、材质、领型、袖型、长度和所有细节。
把衣服从模特身上取出，平铺在干净背景上，像电商平铺摆拍：俯拍视角、整套搭配自然摆放、保留真实照片质感。
输出必须是真实平铺商品摄影图，不是无缝循环印花，不是面料花型图，不是服装工艺单裁片，不是插画或线稿。
不要保留模特、身体、脸部、头发、皮肤、手、脚；可以保留与参考风格一致的腰带、鞋、包等搭配道具。
衣服要完全平整，像熨烫后平铺，无褶皱、无折痕、无垂坠阴影，清晰适合商品展示。
保留完整衣服外形和穿着搭配关系，不要把衣服拆成裁片，不要把花纹变成连续重复的印花图案。`

/** 展平模式 — 编辑接口（第一张=平铺参考图，第二张=模特图） */
export const PROMPT_MODEL_FLATTEN_WITH_REF_EDIT = `第一张是平铺商品参考图，展示了一套衣服俯拍平铺在背景上的摆拍方式。
第二张是模特穿着衣服的照片。
严格参考第一张的平铺风格：俯拍角度、背景材质、整体构图、裁切比例、搭配摆放、道具位置和商品摄影观感。
把第二张模特身上穿着的衣服，按第一张的风格转为同类型的俯拍平铺商品图。
从第二张识别衣服的颜色、花纹、图案、材质、领型、袖型、下摆、纽扣、口袋等所有细节，以及下装、腰带、鞋、包等搭配，应用到第一张所展示的那种平铺摆拍效果中。
输出必须是真实平铺商品摄影图，像电商 flat lay 上架图，不是无缝循环印花，不是面料花型图，不是服装工艺单裁片，不是插画或线稿。
不要保留模特、身体、脸部、头发、皮肤、手、脚。
若第一张参考图包含背景、腰带、鞋、包等搭配，结果也应保持相同风格的平铺搭配；若参考图只有衣服，则只平铺衣服。
衣服要完全平整，像熨烫后平铺，无褶皱、无折痕、无垂坠阴影，清晰适合商品展示。
保留完整衣服外形和搭配关系，不要把衣服拆成裁片，不要把花纹变成连续重复的印花图案。
整体观感与第一张参考图一致。`

/** 提取花色模式 — 从成衣/布面照片生成无缝循环印花图 */
export const PROMPT_PATTERN_EXTRACT = `从上传图片中提取可用于真实面料的自然花色，生成干净的方形无缝循环印花图。
${PROMPT_PRINT_NATURAL_REALISM}
提取时只保留布面的颜色、图案类型、比例尺度和重复节奏；要还原成真实布料上会出现的连续花型，不是生硬裁切成衣照片里的局部或把穿着痕迹带进结果。
不要保留衣服版型、裤腿、裙摆、身体、褶皱、缝线、阴影、高光、背景或拍摄痕迹。
输出必须是平面印花图，像可直接用于成衣印花的连续图案，不是照片编辑，不要生成衣服、模特或场景。
图案上下左右重复平铺时须自然衔接：左边接右边、上边接下边，跨边元素连续，颜色、比例、方向和间距一致，符合真实面料的循环规律。
禁止边框、空白边、硬切痕、碎块拼接、破碎图案、中间裤缝或明显方块边界。
边缘顺滑干净，整体自然流畅，像真实布料的连续花型，而不是死搬原图裁切。`

/** 布料换花主提示词；可与用户附加说明拼接 */
export function buildFabricTransferPrompt(multiTarget = false): string {
  return [
    '图一是布料/花色参考图，图二是目标图。',
    '把图二所有衣服布面换成图一的花色风格、颜色和质感；参考图只提供图案元素与配色，不提供在衣服上的具体排版。',
    '图一只提供花色、图案风格、颜色和质感，不提供版型和在衣身上的摆放位置；图二提供衣服区域、版型、立体结构和构图，印花应自然适配图二。',
    '去掉图二衣服原有花纹、图案和旧颜色，不要保留或改色原印花；白色印花区域必须是参考图的纯白色，不能发灰发脏。',
    PROMPT_FABRIC_PRINT_RULES,
    PROMPT_STRUCTURE_PRESERVE,
    PROMPT_SCENE_PRESERVE,
    multiTarget ? '批量生成时，所有目标图都使用同一张布料/花色参考，印花风格须自然一致、连贯流畅。' : '',
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
