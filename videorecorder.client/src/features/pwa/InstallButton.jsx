import { useEffect, useState, useCallback } from 'react'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'

export default function InstallButton() {
    const [canInstall, setCanInstall] = useState(false)
    const [isStandalone, setIsStandalone] = useState(false)

    // detect "already installed"
    useEffect(() => {
        const standalone =
            window.matchMedia?.('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
        setIsStandalone(standalone)
    }, [])

    // react to prompt availability + install
    useEffect(() => {
        const onAvailable = () => setCanInstall(!!window.deferredInstallPrompt)
        const onInstalled = () => {
            notifications.show({ title: 'Installed', message: 'App installed successfully.' })
            setCanInstall(false)
        }

        // initialize current state
        onAvailable()

        window.addEventListener('pwa:beforeinstallprompt', onAvailable)
        window.addEventListener('pwa:installed', onInstalled)

        return () => {
            window.removeEventListener('pwa:beforeinstallprompt', onAvailable)
            window.removeEventListener('pwa:installed', onInstalled)
        }
    }, [])

    const onClick = useCallback(async () => {
        const promptEvent = window.deferredInstallPrompt
        if (!promptEvent) {
            notifications.show({
                color: 'yellow',
                title: 'Not ready yet',
                message: 'Still preparing install… try again in a moment.',
            })
            return
        }

        try {
            await promptEvent.prompt()
            const { outcome } = await promptEvent.userChoice
            if (outcome === 'accepted') {
                notifications.show({ title: 'Installing…', message: 'Completing install…' })
            } else {
                notifications.show({ color: 'gray', title: 'Install dismissed', message: 'You can install later.' })
            }
        } catch (err) {
            notifications.show({ color: 'red', title: 'Install failed', message: String(err) })
        } finally {
            // the saved event can only be used once
            window.deferredInstallPrompt = null
            setCanInstall(false)
        }
    }, [])

    // Hide if already installed, or if the prompt isn't available
    if (isStandalone || !canInstall) return null

    return (
        <Button onClick={onClick} variant="filled">
            Install app
        </Button>
    )
}