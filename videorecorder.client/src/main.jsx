import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core'
import { Notifications,notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'


// --- PWA install prompt wiring (early) ---
/* global window */
window.deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar and store the event so we can trigger it later
    e.preventDefault();
    window.deferredInstallPrompt = e;
    // tell interested components the prompt is available
    window.dispatchEvent(new Event('pwa:beforeinstallprompt'));
});

window.addEventListener('appinstalled', () => {
    // clear stored prompt once installed
    window.deferredInstallPrompt = null;
    window.dispatchEvent(new Event('pwa:installed'));
});
// -----------------------------------------

void registerSW({ immediate: true })
const colorSchemeManager = localStorageColorSchemeManager({
    key: 'mantine-color-scheme', // any key you like
})

// --- PWA registration & update UX (place this block here) ---
const updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
        notifications.show({
            title: 'Offline ready',
            message: 'The app is cached and will work offline.',
        })
    },
    onNeedRefresh() {
        const id = 'pwa-update'
        notifications.show({
            id,
            title: 'Update available',
            autoClose: false,
            withCloseButton: true,
            message: (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>A new version is ready.</span>
                    <button
                        onClick={() => {
                            notifications.update({ id, title: 'Updating…', message: 'Reloading…' })
                            updateSW()            // apply new SW
                            window.location.reload()
                        }}
                        style={{ padding: '4px 8px', borderRadius: 6 }}
                    >
                        Reload
                    </button>
                </div>
            ),
        })
    },
})
// ------------------------------------------------------------

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <MantineProvider defaultColorScheme="auto" colorSchemeManager={colorSchemeManager}>
            <Notifications />
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </MantineProvider>
    </React.StrictMode>
)
