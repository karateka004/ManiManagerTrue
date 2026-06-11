import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    server: {
        port: 5173,
        host: true,
        // Allow Cloudflare/ngrok tunnel hostnames (they change every run).
        // Dev-only: lets the Telegram Mini App reach Vite through the tunnel.
        allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
    },
    build: {
        target: 'es2020',
        outDir: 'dist',
        rollupOptions: {
            output: {
                // Делим вендоры на отдельные чанки: кэшируются между релизами
                // и парсятся параллельно, ускоряя первый запуск.
                manualChunks: {
                    react: ['react', 'react-dom'],
                    vendor: ['dayjs', 'zustand', 'clsx', 'lucide-react'],
                },
            },
        },
    },
});
