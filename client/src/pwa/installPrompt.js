import { useEffect, useState } from 'react';

// "Install app": Chrome, Edge and Android browsers fire `beforeinstallprompt` when the
// site can be installed; we keep that event and show it when the person asks (from the
// account menu), instead of the browser's own banner. Safari on iPhone and iPad has no
// such event, so there we explain Share > Add to Home Screen instead.

let deferredPrompt = null;
const listeners = new Set();

function notify() {
    listeners.forEach((listener) => listener());
}

export function listenForInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        notify();
    });
}

// Already opened from the home screen (or as an installed desktop app).
export function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// iPhone or iPad (iPadOS reports itself as a Mac, but with touch).
export function isIOS() {
    const ua = window.navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1);
}

// { mode: 'prompt' | 'ios' | null, install() }. `prompt`: the browser can install it in
// one step. `ios`: show the Add to Home Screen steps. null: already installed or the
// browser can't install it, so the menu item stays hidden.
export function useInstallPrompt() {
    const [, setVersion] = useState(0);
    useEffect(() => {
        const listener = () => setVersion((v) => v + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, []);

    let mode = null;
    if (!isStandalone()) {
        if (deferredPrompt) mode = 'prompt';
        else if (isIOS()) mode = 'ios';
    }

    async function install() {
        if (!deferredPrompt) return;
        const event = deferredPrompt;
        deferredPrompt = null; // each event can only be shown once
        notify();
        await event.prompt();
    }

    return { mode, install };
}
