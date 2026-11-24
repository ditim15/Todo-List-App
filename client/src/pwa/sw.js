// DoneYet's service worker: makes the site installable and quick to open from the home
// screen. It only handles requests to this site (the front end). API calls go to a
// different origin and are never touched, so tasks, notes and account data are never
// stored here: they always come fresh from the server.
//
// - Page loads: network first; with no connection, the cached app shell opens instead,
//   so the app still starts and can say it's offline.
// - Built files (/assets/*, fonts, icons): cache first. Vite gives them content-hashed
//   names, so a cached copy is never stale; a new deploy brings new names.
//
// This file is a template. The build (the doneyet-service-worker plugin in
// vite.config.js) fills in the two placeholders below and writes it to dist/sw.js:
// the list of every built file, so all pages (even ones loaded on demand, like Notes)
// work offline after the first visit, and a version that changes with each build, so a
// deploy installs a fresh worker and drops the old caches. It isn't used in development.
const CACHE_VERSION = '__SW_VERSION__';
const BUILD_ASSETS = '__SW_PRECACHE__';
const SHELL_CACHE = `doneyet-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `doneyet-assets-${CACHE_VERSION}`;
const SHELL_URL = '/index.html';
// Files from public/, which aren't part of the build output list.
const PUBLIC_ASSETS = [
    '/manifest.webmanifest',
    '/favicon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_URL)),
            caches.open(ASSET_CACHE).then((cache) => cache.addAll([...PUBLIC_ASSETS, ...BUILD_ASSETS])),
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('doneyet-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

function isStaticAsset(url) {
    return url.pathname.startsWith('/assets/')
        || url.pathname.startsWith('/icons/')
        || /\.(?:woff2?|svg|png|webmanifest)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Every route is the same single-page app, so any page load can fall back to the
    // cached shell. A successful load refreshes it.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(SHELL_URL, { ignoreVary: true }))
        );
        return;
    }

    // ignoreVary: these files are the same for everyone, and a server that sends "Vary:
    // Origin" would otherwise stop a module script request (which carries an Origin
    // header) from matching the copy cached at install (which didn't).
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            }))
        );
    }
});
