// Lightweight pub/sub to cache and broadcast the beforeinstallprompt event

const subs = new Set();

export const onDeferredPrompt = (fn) => {
    subs.add(fn);
    return () => subs.delete(fn);
};

export const getDeferredPrompt = () =>
    typeof window !== 'undefined' ? (window.__deferredPrompt || null) : null;

function notify(e) {
    subs.forEach((fn) => {
        try { fn(e); } catch { }
    });
}

// Attach ASAP on the client
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();                // keep control; don’t auto-prompt
        window.__deferredPrompt = e;       // cache globally
        notify(e);                         // notify subscribers (late components)
    });

    window.addEventListener('appinstalled', () => {
        window.__deferredPrompt = null;    // clear after install
        notify(null);
    });
}