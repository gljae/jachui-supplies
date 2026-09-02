import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '자취 생활용품',
        short_name: '생활용품',
        description: '자취 생활용품 구매 기록과 소진 주기를 관리해요.',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fafafa',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            // 런처가 원이나 물방울로 잘라내도 글리프가 살아남는 아이콘
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 앱이 모두 로컬에서 돌아가므로 빌드 산출물을 통째로 미리 받아두면
        // 오프라인에서도 그대로 동작한다. 네트워크로 가져올 데이터가 없다
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // HashRouter라 모든 경로가 index.html 하나로 들어온다
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // 개발 중에도 등록해 설치 흐름을 확인할 수 있게 한다
        enabled: true,
        type: 'module',
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
