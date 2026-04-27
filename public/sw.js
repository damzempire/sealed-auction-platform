const CACHE_NAME = 'sealed-auction-v1';
const STATIC_CACHE_NAME = 'sealed-auction-static-v1';
const DYNAMIC_CACHE_NAME = 'sealed-auction-dynamic-v1';
const API_CACHE_NAME = 'sealed-auction-api-v1';

// Assets to cache for offline functionality
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/bookmarks.html',
    '/app.js',
    '/dashboard.js',
    '/bookmarks.js',
    '/smart-contract-ui.js',
    '/blockchain-ui.js',
    '/stellar-wallet.js',
    '/ai-recommendations.js',
    '/ar-preview.js',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/stellar-sdk@11.0.0/dist/stellar-sdk.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/date-fns@2.30.0/index.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js',
    '/socket.io/socket.io.js'
];

// API endpoints that can be cached
const CACHEABLE_API_PATTERNS = [
    '/api/auctions',
    '/api/bookmarks',
    '/api/dashboard/data'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE_NAME && 
                            cacheName !== DYNAMIC_CACHE_NAME && 
                            cacheName !== API_CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
            .catch((error) => {
                console.error('[SW] Error during activation:', error);
            })
    );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Handle different types of requests
    if (url.origin === self.location.origin) {
        // Same origin requests
        if (url.pathname.startsWith('/api/')) {
            // API requests - network first with cache fallback
            event.respondWith(handleApiRequest(request));
        } else {
            // Static assets - cache first with network fallback
            event.respondWith(handleStaticRequest(request));
        }
    } else {
        // Cross-origin requests (CDN, etc.) - stale while revalidate
        event.respondWith(handleCrossOriginRequest(request));
    }
});

// Handle API requests with network-first strategy
async function handleApiRequest(request) {
    const url = new URL(request.url);
    const isCacheable = CACHEABLE_API_PATTERNS.some(pattern => 
        url.pathname.startsWith(pattern)
    );
    
    if (!isCacheable) {
        // Non-cacheable API requests - network only
        try {
            return await fetch(request);
        } catch (error) {
            console.error('[SW] Network request failed:', error);
            return new Response(JSON.stringify({
                error: 'Network unavailable',
                message: 'This feature requires an internet connection'
            }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    
    try {
        // Try network first
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the successful response
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        
        // Fallback to cache
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline response for API requests
        return new Response(JSON.stringify({
            error: 'Offline',
            message: 'No cached data available',
            cached: false
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            // Update cache in background
            updateCacheInBackground(request);
            return cachedResponse;
        }
        
        // Fallback to network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the response
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Static request failed:', error);
        
        // Return offline page for HTML requests
        if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html') || new Response('Offline', {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        throw error;
    }
}

// Handle cross-origin requests with stale-while-revalidate
async function handleCrossOriginRequest(request) {
    try {
        // Try cache first
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            // Update cache in background
            updateCacheInBackground(request);
            return cachedResponse;
        }
        
        // Fallback to network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the response
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cross-origin request failed:', error);
        throw error;
    }
}

// Update cache in background
async function updateCacheInBackground(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse);
        }
    } catch (error) {
        console.log('[SW] Background update failed:', error);
    }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync event:', event.tag);
    
    if (event.tag === 'background-sync-auctions') {
        event.waitUntil(syncAuctionsData());
    } else if (event.tag === 'background-sync-bookmarks') {
        event.waitUntil(syncBookmarksData());
    } else if (event.tag === 'background-sync-bids') {
        event.waitUntil(syncBidsData());
    }
});

// Sync auctions data
async function syncAuctionsData() {
    try {
        console.log('[SW] Syncing auctions data...');
        
        // Get offline actions from IndexedDB
        const offlineActions = await getOfflineActions('auctions');
        
        for (const action of offlineActions) {
            try {
                const response = await fetch(action.url, {
                    method: action.method,
                    headers: action.headers,
                    body: action.body
                });
                
                if (response.ok) {
                    // Remove successful action from offline storage
                    await removeOfflineAction(action.id);
                    console.log('[SW] Synced auction action:', action.id);
                }
            } catch (error) {
                console.error('[SW] Failed to sync auction action:', error);
            }
        }
        
        // Notify clients about sync completion
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETED',
                data: { type: 'auctions', timestamp: Date.now() }
            });
        });
        
    } catch (error) {
        console.error('[SW] Auction sync failed:', error);
    }
}

// Sync bookmarks data
async function syncBookmarksData() {
    try {
        console.log('[SW] Syncing bookmarks data...');
        
        const offlineActions = await getOfflineActions('bookmarks');
        
        for (const action of offlineActions) {
            try {
                const response = await fetch(action.url, {
                    method: action.method,
                    headers: action.headers,
                    body: action.body
                });
                
                if (response.ok) {
                    await removeOfflineAction(action.id);
                    console.log('[SW] Synced bookmark action:', action.id);
                }
            } catch (error) {
                console.error('[SW] Failed to sync bookmark action:', error);
            }
        }
        
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETED',
                data: { type: 'bookmarks', timestamp: Date.now() }
            });
        });
        
    } catch (error) {
        console.error('[SW] Bookmark sync failed:', error);
    }
}

// Sync bids data
async function syncBidsData() {
    try {
        console.log('[SW] Syncing bids data...');
        
        const offlineActions = await getOfflineActions('bids');
        
        for (const action of offlineActions) {
            try {
                const response = await fetch(action.url, {
                    method: action.method,
                    headers: action.headers,
                    body: action.body
                });
                
                if (response.ok) {
                    await removeOfflineAction(action.id);
                    console.log('[SW] Synced bid action:', action.id);
                }
            } catch (error) {
                console.error('[SW] Failed to sync bid action:', error);
            }
        }
        
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETED',
                data: { type: 'bids', timestamp: Date.now() }
            });
        });
        
    } catch (error) {
        console.error('[SW] Bid sync failed:', error);
    }
}

// IndexedDB helpers for offline storage
async function getOfflineActions(type) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('offline-actions', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['actions'], 'readonly');
            const store = transaction.objectStore('actions');
            const index = store.index('type');
            const getRequest = index.getAll(type);
            
            getRequest.onsuccess = () => resolve(getRequest.result || []);
            getRequest.onerror = () => reject(getRequest.error);
        };
        
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('actions')) {
                const store = db.createObjectStore('actions', { keyPath: 'id' });
                store.createIndex('type', 'type', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function removeOfflineAction(actionId) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('offline-actions', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['actions'], 'readwrite');
            const store = transaction.objectStore('actions');
            const deleteRequest = store.delete(actionId);
            
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        };
    });
}

// Push notification event
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received:', event);
    
    let notificationData = {
        title: 'Sealed Auction Platform',
        body: 'You have a new notification',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'auction-notification',
        data: {}
    };
    
    if (event.data) {
        try {
            notificationData = { ...notificationData, ...event.data.json() };
        } catch (error) {
            console.error('[SW] Error parsing push data:', error);
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            data: notificationData.data,
            requireInteraction: notificationData.requireInteraction || false,
            actions: notificationData.actions || []
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    
    event.notification.close();
    
    const urlToOpen = event.notification.data.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Focus on existing window if available
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Message event for communication with main app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data && event.data.type === 'CACHE_UPDATE') {
        updateCacheInBackground(new Request(event.data.url));
    } else if (event.data && event.data.type === 'CLEAR_CACHE') {
        clearCache(event.data.cacheName);
    }
});

// Clear specific cache
async function clearCache(cacheName) {
    try {
        await caches.delete(cacheName);
        console.log('[SW] Cache cleared:', cacheName);
    } catch (error) {
        console.error('[SW] Error clearing cache:', error);
    }
}

// Periodic cache cleanup
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Keep only current version caches
                    if (!cacheName.includes('-v1')) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
