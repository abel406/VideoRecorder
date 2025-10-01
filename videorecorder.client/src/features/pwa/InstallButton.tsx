import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useInstallPrompt } from './useInstallPrompt';

function isFirefoxAndroid() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('android') && ua.includes('firefox');
}
function isIOSSafari() {
    const ua = navigator.userAgent;
    return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

export default function InstallButton() {
    const { deferredPrompt, installed, isStandalone } = useInstallPrompt();
    if (installed || isStandalone) return null;

    const onClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            return;
        }
        if (isFirefoxAndroid()) {
            notifications.show({ title: 'Install on Firefox', message: 'Tap ⋮ → Add to Home screen.' });
        } else if (isIOSSafari()) {
            notifications.show({ title: 'Install on iOS', message: 'Share → Add to Home Screen.' });
        } else {
            notifications.show({ title: 'Install', message: 'Use your browser menu to install.' });
        }
    };

    return (
        <Button variant="light" onClick={onClick}>
            {deferredPrompt ? 'Install app' : 'How to install'}
        </Button>
    );
}
