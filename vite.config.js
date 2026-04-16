import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
    esbuild: {
        // Strip informational logs from production builds. `console.error` and
        // `console.warn` survive so real problems still surface in the field.
        pure: ['console.log', 'console.debug', 'console.info'],
    },
    server: {
        port: 5173,
    },
});
