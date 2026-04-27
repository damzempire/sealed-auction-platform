class PWAManager {
    constructor() {
        this.deferredPrompt = null;
        this.swRegistration = null;
        this.isOnline = navigator.onLine;
        this.installPromptShown = false;
        
        this.init();
    }
    
    async init() {
        this.setupServiceWorker();
        this.setupInstallPrompt();
        this.setupOnlineStatus();
        this.setupMessageListeners();
        this.setupBackgroundSync();
        this.setupPushNotifications();
        this.createOfflineIndicator();
    }
    
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('[PWA] Service Worker registered:', registration);
                    this.swRegistration = registration;
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                this.showUpdateAvailable();
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.error('[PWA] Service Worker registration failed:', error);
                });
        } else {
            console.warn('[PWA] Service Worker not supported');
        }
    }
    
    setupInstallPrompt() {
        // Listen for beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[PWA] Install prompt triggered');
            e.preventDefault();
            this.deferredPrompt = e;
            
            // Show install banner after a delay
            setTimeout(() => {
                if (!this.installPromptShown) {
                    this.showInstallBanner();
                }
            }, 5000);
        });
        
        // Listen for app installed event
        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed successfully');
            this.deferredPrompt = null;
            this.hideInstallBanner();
            this.showInstallSuccess();
        });
    }
    
    setupOnlineStatus() {
        window.addEventListener('online', () => {
            console.log('[PWA] Connection restored');
            this.isOnline = true;
            this.updateOnlineStatus(true);
            this.syncOfflineActions();
        });
        
        window.addEventListener('offline', () => {
            console.log('[PWA] Connection lost');
            this.isOnline = false;
            this.updateOnlineStatus(false);
        });
    }
    
    setupMessageListeners() {
        // Listen for messages from service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'SYNC_COMPLETED':
                        this.handleSyncCompleted(data);
                        break;
                    case 'CACHE_UPDATED':
                        this.handleCacheUpdated(data);
                        break;
                    case 'OFFLINE_ACTION_QUEUED':
                        this.handleOfflineActionQueued(data);
                        break;
                }
            });
        }
    }
    
    setupBackgroundSync() {
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            // Register background sync for different types of data
            this.registerBackgroundSync('background-sync-auctions');
            this.registerBackgroundSync('background-sync-bookmarks');
            this.registerBackgroundSync('background-sync-bids');
        }
    }
    
    async registerBackgroundSync(tag) {
        try {
            await this.swRegistration.sync.register(tag);
            console.log('[PWA] Background sync registered:', tag);
        } catch (error) {
            console.error('[PWA] Background sync registration failed:', error);
        }
    }
    
    setupPushNotifications() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            // Request notification permission
            this.requestNotificationPermission();
            
            // Subscribe to push notifications
            this.subscribeToPushNotifications();
        }
    }
    
    async requestNotificationPermission() {
        try {
            const permission = await Notification.requestPermission();
            console.log('[PWA] Notification permission:', permission);
            
            if (permission === 'granted') {
                this.enablePushNotifications();
            }
        } catch (error) {
            console.error('[PWA] Notification permission error:', error);
        }
    }
    
    async subscribeToPushNotifications() {
        try {
            if (!this.swRegistration) return;
            
            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(this.getVapidPublicKey())
            });
            
            console.log('[PWA] Push subscription:', subscription);
            
            // Send subscription to server
            await this.sendPushSubscriptionToServer(subscription);
        } catch (error) {
            console.error('[PWA] Push subscription error:', error);
        }
    }
    
    getVapidPublicKey() {
        // This should be provided by your server
        return 'BMvT8w8lFvXJZP3xQ2rYw8lFvXJZP3xQ2rYw8lFvXJZP3xQ2rYw8lFvXJZP3xQ2';
    }
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        
        return outputArray;
    }
    
    async sendPushSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription)
            });
            
            if (response.ok) {
                console.log('[PWA] Push subscription sent to server');
            }
        } catch (error) {
            console.error('[PWA] Error sending push subscription:', error);
        }
    }
    
    createInstallBanner() {
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.className = 'fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50 transform transition-transform duration-300 translate-y-full';
        banner.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas fa-download mr-3"></i>
                    <div>
                        <div class="font-semibold">Install App</div>
                        <div class="text-sm opacity-90">Get the full experience</div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button id="pwa-install-dismiss" class="text-white hover:text-gray-200">
                        <i class="fas fa-times"></i>
                    </button>
                    <button id="pwa-install-accept" class="bg-white text-blue-600 px-3 py-1 rounded text-sm font-semibold hover:bg-gray-100">
                        Install
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Add event listeners
        document.getElementById('pwa-install-accept').addEventListener('click', () => {
            this.installApp();
        });
        
        document.getElementById('pwa-install-dismiss').addEventListener('click', () => {
            this.hideInstallBanner();
        });
    }
    
    showInstallBanner() {
        if (!document.getElementById('pwa-install-banner')) {
            this.createInstallBanner();
        }
        
        setTimeout(() => {
            const banner = document.getElementById('pwa-install-banner');
            if (banner) {
                banner.classList.remove('translate-y-full');
                this.installPromptShown = true;
            }
        }, 100);
    }
    
    hideInstallBanner() {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) {
            banner.classList.add('translate-y-full');
            setTimeout(() => {
                banner.remove();
            }, 300);
        }
    }
    
    async installApp() {
        if (!this.deferredPrompt) {
            console.log('[PWA] Install prompt not available');
            return;
        }
        
        try {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            console.log('[PWA] Install outcome:', outcome);
            
            if (outcome === 'accepted') {
                console.log('[PWA] User accepted install');
            } else {
                console.log('[PWA] User dismissed install');
            }
            
            this.deferredPrompt = null;
            this.hideInstallBanner();
        } catch (error) {
            console.error('[PWA] Install error:', error);
        }
    }
    
    showInstallSuccess() {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-x-full';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-3"></i>
                <div>
                    <div class="font-semibold">App Installed!</div>
                    <div class="text-sm opacity-90">You can now launch from your home screen</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 5000);
    }
    
    showUpdateAvailable() {
        const updateBanner = document.createElement('div');
        updateBanner.id = 'pwa-update-banner';
        updateBanner.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50 transform transition-transform duration-300 translate-x-full';
        updateBanner.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas fa-sync-alt mr-3"></i>
                    <div>
                        <div class="font-semibold">Update Available</div>
                        <div class="text-sm opacity-90">A new version is ready</div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button id="pwa-update-dismiss" class="text-white hover:text-gray-200">
                        <i class="fas fa-times"></i>
                    </button>
                    <button id="pwa-update-accept" class="bg-white text-green-600 px-3 py-1 rounded text-sm font-semibold hover:bg-gray-100">
                        Update
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(updateBanner);
        
        document.getElementById('pwa-update-accept').addEventListener('click', () => {
            this.applyUpdate();
        });
        
        document.getElementById('pwa-update-dismiss').addEventListener('click', () => {
            this.hideUpdateBanner();
        });
        
        setTimeout(() => {
            updateBanner.classList.remove('translate-x-full');
        }, 100);
    }
    
    hideUpdateBanner() {
        const banner = document.getElementById('pwa-update-banner');
        if (banner) {
            banner.classList.add('translate-x-full');
            setTimeout(() => {
                banner.remove();
            }, 300);
        }
    }
    
    applyUpdate() {
        if (this.swRegistration && this.swRegistration.waiting) {
            this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
            this.hideUpdateBanner();
            
            // Reload the page to apply the update
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    }
    
    createOfflineIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'pwa-offline-indicator';
        indicator.className = 'fixed top-4 left-4 bg-orange-600 text-white p-3 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-x-full';
        indicator.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-wifi-slash mr-2"></i>
                <div>
                    <div class="font-semibold text-sm">Offline Mode</div>
                    <div class="text-xs opacity-90">Some features may be limited</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(indicator);
        
        // Initially hide if online
        if (this.isOnline) {
            indicator.classList.add('translate-x-full');
        }
    }
    
    updateOnlineStatus(isOnline) {
        const indicator = document.getElementById('pwa-offline-indicator');
        
        if (isOnline) {
            // Hide offline indicator
            if (indicator) {
                indicator.classList.add('translate-x-full');
            }
            
            // Show online notification
            this.showOnlineNotification();
        } else {
            // Show offline indicator
            if (indicator) {
                indicator.classList.remove('translate-x-full');
            }
            
            // Show offline notification
            this.showOfflineNotification();
        }
    }
    
    showOnlineNotification() {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 left-4 bg-green-600 text-white p-3 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-y-full';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-wifi mr-2"></i>
                <div class="text-sm font-semibold">Connection Restored</div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('translate-y-full');
        }, 100);
        
        setTimeout(() => {
            notification.classList.add('translate-y-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    showOfflineNotification() {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 left-4 bg-orange-600 text-white p-3 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-y-full';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-wifi-slash mr-2"></i>
                <div class="text-sm font-semibold">Offline Mode</div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('translate-y-full');
        }, 100);
        
        setTimeout(() => {
            notification.classList.add('translate-y-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    async syncOfflineActions() {
        try {
            // Register background sync for all types
            if (this.swRegistration && 'sync' in this.swRegistration) {
                await this.registerBackgroundSync('background-sync-auctions');
                await this.registerBackgroundSync('background-sync-bookmarks');
                await this.registerBackgroundSync('background-sync-bids');
            }
        } catch (error) {
            console.error('[PWA] Error registering sync:', error);
        }
    }
    
    handleSyncCompleted(data) {
        console.log('[PWA] Sync completed:', data);
        
        // Show notification for completed sync
        this.showSyncNotification(data);
        
        // Update UI if needed
        if (data.type === 'auctions') {
            // Refresh auction data
            this.refreshAuctionData();
        } else if (data.type === 'bookmarks') {
            // Refresh bookmark data
            this.refreshBookmarkData();
        }
    }
    
    showSyncNotification(data) {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 bg-blue-600 text-white p-3 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-y-full';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-sync-alt mr-2"></i>
                <div class="text-sm font-semibold">${data.type} synced</div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('translate-y-full');
        }, 100);
        
        setTimeout(() => {
            notification.classList.add('translate-y-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    refreshAuctionData() {
        // Trigger auction data refresh
        if (typeof window.refreshAuctions === 'function') {
            window.refreshAuctions();
        }
    }
    
    refreshBookmarkData() {
        // Trigger bookmark data refresh
        if (typeof window.bookmarkManager && window.bookmarkManager.loadBookmarks) {
            window.bookmarkManager.loadBookmarks();
        }
    }
    
    handleCacheUpdated(data) {
        console.log('[PWA] Cache updated:', data);
    }
    
    handleOfflineActionQueued(data) {
        console.log('[PWA] Offline action queued:', data);
        
        // Show notification that action was saved for later
        this.showOfflineActionNotification(data);
    }
    
    showOfflineActionNotification(data) {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 bg-yellow-600 text-white p-3 rounded-lg shadow-lg z-50 transform transition-transform duration-300 translate-y-full';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-clock mr-2"></i>
                <div class="text-sm font-semibold">Action saved for when online</div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.remove('translate-y-full');
        }, 100);
        
        setTimeout(() => {
            notification.classList.add('translate-y-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    // Public methods for external use
    async enablePushNotifications() {
        try {
            await this.subscribeToPushNotifications();
            return true;
        } catch (error) {
            console.error('[PWA] Error enabling push notifications:', error);
            return false;
        }
    }
    
    async disablePushNotifications() {
        try {
            if (this.swRegistration) {
                const subscription = await this.swRegistration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                    await this.sendPushUnsubscriptionToServer(subscription);
                }
            }
            return true;
        } catch (error) {
            console.error('[PWA] Error disabling push notifications:', error);
            return false;
        }
    }
    
    async sendPushUnsubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(subscription)
            });
            
            if (response.ok) {
                console.log('[PWA] Push unsubscription sent to server');
            }
        } catch (error) {
            console.error('[PWA] Error sending push unsubscription:', error);
        }
    }
    
    isAppInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone ||
               document.referrer.includes('android-app://');
    }
    
    getInstallStatus() {
        return {
            isInstalled: this.isAppInstalled(),
            isInstallable: !!this.deferredPrompt,
            isOnline: this.isOnline,
            hasServiceWorker: !!this.swRegistration,
            hasBackgroundSync: 'sync' in (window.ServiceWorkerRegistration.prototype || {}),
            hasPushNotifications: 'PushManager' in window
        };
    }
}

// Initialize PWA manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pwaManager = new PWAManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}
