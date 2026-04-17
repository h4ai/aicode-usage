// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 3002,
        proxy: {
            '/api': {
                target: 'http://localhost:8002',
                changeOrigin: true,
            },
            '/health': {
                target: 'http://localhost:8002',
                changeOrigin: true,
            },
        },
    },
});
