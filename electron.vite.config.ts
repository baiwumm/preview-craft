import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') };

export default defineConfig({
  // electron-store 为纯 ESM 包，主进程输出 CJS，需排除外部化改为随包打包
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store'] })],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    // 固定非常用端口，避免与本机其他 dev server 冲突
    server: { port: 5188, strictPort: true },
    resolve: {
      alias: {
        ...sharedAlias,
        '@': resolve(__dirname, 'src/renderer/src'),
        '@templates': resolve(__dirname, 'src/renderer/templates')
      }
    }
  }
});
