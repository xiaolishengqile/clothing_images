import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /** 本地开发绕过浏览器 CORS：将界面里 API Base 设为 `http://localhost:5173/t8proxy`（端口以终端为准） */
  server: {
    proxy: {
      '/t8proxy': {
        target: 'https://ai.t8star.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/t8proxy/, ''),
      },
      /** 本地开发绕过 CORS：302 API Base 设为 `http://localhost:5173/302proxy` */
      '/302proxy': {
        target: 'https://api.302ai.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/302proxy/, ''),
      },
    },
  },
})
