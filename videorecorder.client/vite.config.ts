import { fileURLToPath, URL } from 'node:url'
import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { env } from 'process'
import basicSsl from '@vitejs/plugin-basic-ssl';


// ----- base path (set VITE_BASE=/YourApp/ for IIS virtual dir) -----
const appBase = (env.VITE_BASE || '/').replace(/\/?$/, '/')

// ----- optional backend proxy target (your existing logic) -----
const target = env.ASPNETCORE_HTTPS_PORT
    ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}`
    : env.ASPNETCORE_URLS
        ? env.ASPNETCORE_URLS.split(';')[0]
        : 'https://localhost:7068'

// ----- HTTPS cert resolution -----
// 1) Try local mkcert files: certs/dev.pem & certs/dev-key.pem
const CERT_DIR = path.resolve(__dirname, 'certs')
const CERT_PATH = path.join(CERT_DIR, 'dev.pem')
const KEY_PATH = path.join(CERT_DIR, 'dev-key.pem')
const hasLocalCert = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)

// If present, use them; otherwise let Vite create a self-signed cert (https: true)
const httpsOption = hasLocalCert
    ? {
        cert: fs.readFileSync(CERT_PATH),
        key: fs.readFileSync(KEY_PATH),
    }
    : undefined; // fallback: self-signed (untrusted on phones, but fine on desktop dev)

export default defineConfig({
    base: appBase,
    plugins: [
        react(),
        VitePWA({
            injectRegister: null,          // we call registerSW in main.jsx
            registerType: 'autoUpdate',
            devOptions: { enabled: true },
            includeAssets: ['robots.txt', 'favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                name: 'Video Recorder',
                short_name: 'Recorder',
                start_url: appBase,          // must match base
                scope: appBase,              // must match base
                display: 'standalone',
                background_color: '#111827',
                theme_color: '#111827',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                navigateFallback: 'index.html',
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) => request.destination === 'document',
                        handler: 'NetworkFirst',
                        options: { cacheName: 'pages' },
                    },
                    {
                        urlPattern: ({ request }) =>
                            request.destination === 'script' || request.destination === 'style',
                        handler: 'StaleWhileRevalidate',
                        options: { cacheName: 'assets' },
                    },
                    {
                        urlPattern: ({ request }) => ['image', 'font'].includes(request.destination),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'static',
                            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
        host: '0.0.0.0',                     // listen on 0.0.0.0 (LAN)
        port: parseInt(env.DEV_SERVER_PORT || '30151', 10),
        https: httpsOption,             // uses local certs if present; else self-signed
        hmr: {
            host: env.DEV_HOST || undefined, // e.g. '192.168.69.3' if testing from phone
        },
        proxy: {
            '^/weatherforecast': { target, secure: false },
        },
    },
})
