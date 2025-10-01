// src/utils/device.js
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac; detect via touchpoints
  const iPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || iPadOS;
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent || '');
}

export function isMobileDevice() {
  // Prefer UA-CH when available (Chromium)
  const uaMobile = !!navigator.userAgentData?.mobile;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const touch = (navigator.maxTouchPoints || 0) > 1;
  return uaMobile || isIOS() || isAndroid() || coarse || touch;
}

export function isDesktopDevice() {
  return !isMobileDevice();
}

export function isInstallPromptSupported() {
  // Only Chromium-based browsers fire beforeinstallprompt
  // Safari (iOS/macOS) never fires it; Firefox desktop/mobile doesn’t either.
  const ua = navigator.userAgent || '';
  const isChromium =
    /Chrome|CriOS|Edg|OPR/i.test(ua) && !/Brave/i.test(ua);
  return isChromium;
}
