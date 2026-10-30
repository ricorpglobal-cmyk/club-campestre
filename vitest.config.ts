import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src'), 'server-only': resolve(__dirname, 'tests/empty.ts') } },
  test: { environment: 'node', fileParallelism: false, testTimeout: 60000, hookTimeout: 120000, globalSetup: ['tests/global-setup.ts'],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5432/club_campestre_test', STORAGE_LOCAL_DIR: './storage-test' } },
});
