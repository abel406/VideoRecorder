import { useEffect, useState } from 'react';
import { getDeferredPrompt, onDeferredPrompt } from './installPromptBus';

export function useInstallPrompt() {
    const [deferred, setDeferred] = useState(() => getDeferredPrompt());
    const [installed, setInstalled] = useState(false);

    const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches ||
            window.navigator?.standalone === true);

    useEffect(() => {
        const off = onDeferredPrompt(setDeferred);
        const onInstalled = () => { setInstalled(true); setDeferred(null); };
        window.addEventListener('appinstalled', onInstalled);
        return () => { off(); window.removeEventListener('appinstalled', onInstalled); };
    }, []);

    return { deferredPrompt: deferred, installed, isStandalone };
}
