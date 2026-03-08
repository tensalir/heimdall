import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: [
      'node_modules', '.next', 'dist', 'packages',
      'src/domain/briefingAssistant/datasources.test.ts',
      'src/domain/briefingAssistant/splitEngine.test.ts',
      'src/domain/briefingAssistant/evidence/metaCsvTransform.test.ts',
      'src/integrations/monday/docReaderImages.test.ts',
      'app/api/images/proxy/route.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
