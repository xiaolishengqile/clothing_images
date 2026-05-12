# 服装白底商品图 · 批量生成

纯前端（Vite + React + TypeScript）：批量上传实拍图，调用 `https://ai.t8star.cn/v1/images/generations`（如 `gpt-image-2`）生成电商幽灵人体白底商品图。

## 使用

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址，填写 **API Token**，上传多张图片后点击 **开始生成**。

- **并发**：与本次待处理图片张数相同，最多同时 30 路；先从中转站返回的会先显示在列表上方。注意网关限流。
- **参考图编码**：默认 Data URL；若接口不接受可改为「仅 Base64」。
- **下载 ZIP**：打包所有已成功任务的结果图。

## CORS 说明

若直接填写 `https://ai.t8star.cn` 时浏览器控制台出现跨域错误，说明中转站未对浏览器来源放行 CORS。本地调试可在 `npm run dev` 下把 **API Base URL** 改为：

`http://localhost:5173/t8proxy`

（端口以 Vite 输出为准；已在 `vite.config.ts` 配置同名路径代理到 `ai.t8star.cn`。生产静态部署时仍依赖目标站 CORS 或需自行加一层反向代理。）

## 安全

Token 保存在本机 `localStorage`，请勿在公共电脑使用。
