// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { AppShell, Burger, Group, NavLink, Title, Button, Container } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import Recorder from './features/recorder/Recorder.js'
import Library from './features/library/Library.js'
import ThemeToggle from './features/theme/ThemeToggle.js'

type BeforeInstallPromptEvent = Event & {
    readonly platforms?: string[];
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallabilityState = {
    manifestHref: string;
    manifestOk: boolean;
    manifestText: string;
    swSupported: boolean;
    swReady: boolean;
    swController: boolean;
    secure: boolean;
    displayModeStandalone: boolean;
    deferredPresent: boolean;
};

// ---------- PWA install capture (module-level, ASAP) ----------
let __deferredPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault()
        __deferredPrompt = e as BeforeInstallPromptEvent
        window.dispatchEvent(new CustomEvent('pwa:deferredprompt'))
    })

    window.addEventListener('appinstalled', () => {
        __deferredPrompt = null
        window.dispatchEvent(new CustomEvent('pwa:installed'))
        try { localStorage.setItem('pwa-installed', '1') } catch { }
        notifications.show({ title: 'Installed', message: 'The app was added to your device.' })
    })
}

// ---------- helpers ----------
function isFirefoxAndroid() {
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes('android') && ua.includes('firefox')
}
function isIOSSafari() {
    const ua = navigator.userAgent
    return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
}
function getStandalone() {
    return (
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true    
    )
}
async function getInstallabilityState():Promise < InstallabilityState > {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const manifestHref = link?.href || '(none)'
    let manifestOk = false, manifestText = ''
    try {
        const r = await fetch(manifestHref, { cache: 'no-store' })
        manifestOk = r.ok
        manifestText = r.ok ? await r.text() : `${r.status} ${r.statusText}`
    } catch (e) {
        manifestText = String(e)
    }

    const swSupported = 'serviceWorker' in navigator
    let swReady = false, swController = false
    try {
        if (swSupported) {
            const reg = await navigator.serviceWorker.ready
            swReady = !!reg
            swController = !!navigator.serviceWorker.controller
        }
    } catch { }

    const secure = window.isSecureContext === true
    const displayModeStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    return {
        manifestHref, manifestOk, manifestText,
        swSupported, swReady, swController,
        secure, displayModeStandalone,
        deferredPresent: __deferredPrompt != null,
    }
}

export default function App() {
    const [opened, { toggle }] = useDisclosure()
    const { pathname } = useLocation()

    // install button + debug state
    const [canInstall, setCanInstall] = useState(() => __deferredPrompt != null)
    const [isStandalone, setIsStandalone] = useState(() => getStandalone())
    const [installDbg, setInstallDbg] = useState<InstallabilityState | null>(null)

    useEffect(() => {
        ; (async () => {
            const s = await getInstallabilityState()
            console.table(s)
            setInstallDbg(s)
        })()

        const onDP = async () => {
            setCanInstall(__deferredPrompt != null)
            setInstallDbg(await getInstallabilityState())
        }
        window.addEventListener('pwa:deferredprompt', onDP)

        const onInstalled = () => setCanInstall(false)
        window.addEventListener('pwa:installed', onInstalled)

        navigator.serviceWorker?.ready?.then(async () =>
            setInstallDbg(await getInstallabilityState())
        )

        const mql = window.matchMedia?.('(display-mode: standalone)')
        const onModeChange = () => setIsStandalone(getStandalone())
        mql?.addEventListener?.('change', onModeChange)

        return () => {
            window.removeEventListener('pwa:deferredprompt', onDP)
            window.removeEventListener('pwa:installed', onInstalled)
            mql?.removeEventListener?.('change', onModeChange)
        }
    }, [])

    const showInstall = useMemo(() => !isStandalone, [isStandalone])

    const handleInstallClick = async () => {
        if (__deferredPrompt) {
            try {
                __deferredPrompt.prompt()
                await __deferredPrompt.userChoice
            } finally {
                __deferredPrompt = null
                setCanInstall(false)
            }
            return
        }
        if (isFirefoxAndroid()) {
            notifications.show({
                title: 'Install on Firefox',
                message: 'Tap the ⋮ menu → Add to Home screen.',
            })
            return
        }
        if (isIOSSafari()) {
            notifications.show({
                title: 'Install on iOS',
                message: 'Tap Share → Add to Home Screen.',
            })
            return
        }
        notifications.show({
            title: 'Install',
            message: 'Use your browser menu to install / add to home screen.',
        })
    }

    return (
        <center>
            <AppShell
                header={{ height: 56 }}
                navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
                padding="md"
                //align="center"
                //grow
            >
                <AppShell.Header>
                    <Group h="100%" px="md" justify="space-between">
                        <Group>
                            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                            <Title order={3}>Video Recorder</Title>
                        </Group>

                        {/* Right-side header actions */}
                        <Group>
                            <ThemeToggle />

                            {showInstall && (
                                <Button
                                    variant="light"
                                    onClick={handleInstallClick}
                                    disabled={!canInstall && !isFirefoxAndroid() && !isIOSSafari()}
                                >
                                    {canInstall ? 'Install app' : 'How to install'}
                                </Button>
                            )}

                            {/* Debug pill – why install prompt isn't firing */}
                            {installDbg && (
                                <div
                                    style={{
                                        fontSize: 12,
                                        opacity: 0.8,
                                        padding: '2px 6px',
                                        borderRadius: 8,
                                        border: '1px solid var(--mantine-color-gray-5)',
                                    }}
                                >
                                    <span>manifest:{installDbg.manifestOk ? '✓' : '✗'} </span>
                                    <span>
                                        sw:{installDbg.swController ? '✓' : (installDbg.swReady ? '~' : '✗')}{' '}
                                    </span>
                                    <span>https:{installDbg.secure ? '✓' : '✗'} </span>
                                    <span>bip:{installDbg.deferredPresent ? '✓' : '–'}</span>
                                </div>
                            )}
                        </Group>
                    </Group>
                </AppShell.Header>

                <AppShell.Navbar p="md">
                    <NavLink
                        component={Link}
                        to="/record"
                        label="Record"
                        active={pathname.startsWith('/record')}
                    />
                    <NavLink
                        component={Link}
                        to="/library"
                        label="Library"
                        active={pathname.startsWith('/library')}
                    />
                </AppShell.Navbar>

                <AppShell.Main>
                    <Container size="md" mx="auto">
                    <Routes>
                        <Route path="/" element={<Navigate to="/record" replace />} />
                        <Route path="/record" element={<Recorder />} />
                        <Route path="/library" element={<Library />} />
                        </Routes>
                    </Container>
                </AppShell.Main>
            </AppShell>
        </center>
    )
}
