import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.worktrees/**', 'e2e/**'],
  },
})
