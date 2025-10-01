// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

if (import.meta.env.PROD) {
    // Workbox/VitePWA SW (full PWA)
    const updateSW = registerSW({
        immediate: true,
        onOfflineReady() {
            notifications.show({ title: 'Offline ready', message: 'You can use the app without a network.' })
        },
        onNeedRefresh() {
            const id = 'pwa-update'
            notifications.show({ id, title: 'Update available', message: 'A new version is ready.', autoClose: false, withCloseButton: true })
            const onClick = () => {
                document.removeEventListener('click', onClick)
                notifications.update({ id, title: 'Updating…', message: 'Reloading…' })
                updateSW()
                window.location.reload()
            }
            document.addEventListener('click', onClick, { once: true })
        },
    })
} else {
    // DEV ONLY: minimal SW with fetch handler so beforeinstallprompt can fire
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/dev-sw.js', { scope: '/' })
    }
}

const colorSchemeManager = localStorageColorSchemeManager({ key: 'mantine-color-scheme' })

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <MantineProvider defaultColorScheme="auto" colorSchemeManager={colorSchemeManager}>
            <Notifications />
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </MantineProvider>
    </React.StrictMode>
)
