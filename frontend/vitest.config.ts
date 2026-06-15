import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./src/__tests__/support/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**'],
        exclude: [
          'src/**/__tests__/**',
          'src/main.ts', // app bootstrap; exercised by e2e, not unit tests
          'src/**/*.d.ts',
          // Google-Maps / media-upload heavy UI — covered by Cypress e2e, where
          // a real browser + backend make them testable without heavy mocking.
          'src/components/locations/**',
          'src/components/media/**',
          'src/views/EventDetailView.vue',
        ],
      },
    },
  }),
)
