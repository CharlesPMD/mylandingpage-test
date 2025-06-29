/**
 * Read-only helper that shows the current Consent-Mode status
 * (ad_storage, analytics_storage, ad_user_data, ad_personalization)
 * in the #console-consent-gtm area.
 *
 * - never pushes to dataLayer
 * - never calls gtag('consent', …)
 * - never sets cookies or blocks tags
 */

(function() {
    'use strict';

    const CONSENT_KEYS = [
        'ad_storage',
        'analytics_storage',
        'ad_user_data',
        'ad_personalization'
    ];

    // This object will hold the merged, most-up-to-date consent state.
    let currentConsentState = {};

    /**
     * Renders the current state stored in `currentConsentState` to the UI.
     */
    function paintConsent() {
        const root = document.getElementById('console-consent-gtm');
        if (!root) {
            console.warn('[ConsentReader] Element #console-consent-gtm not found');
            return;
        }

        console.log('[ConsentReader] Painting consent state:', currentConsentState);

        CONSENT_KEYS.forEach(key => {
            const el = root.querySelector(`[data-consent="${key}"]`);
            if (!el) {
                console.warn(`[ConsentReader] Element [data-consent="${key}"] not found`);
                return;
            }
            
            const state = currentConsentState[key] || 'denied';
            el.classList.remove('highlight-green', 'highlight-red');
            el.classList.add(state === 'granted' ? 'highlight-green' : 'highlight-red');
        });
    }

    /**
     * Checks if an object contains at least one consent key and merges it into the state.
     * @param {Object} obj The object to process.
     * @returns {boolean} True if the object was a consent update, false otherwise.
     */
    function processConsentObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return false;
        }

        const hasAnyConsentKey = CONSENT_KEYS.some(key => key in obj);

        if (hasAnyConsentKey) {
            currentConsentState = { ...currentConsentState, ...obj };
            return true;
        }
        return false;
    }

    /**
     * Builds the initial state by scanning the entire dataLayer from the beginning.
     */
    function buildInitialStateFromDataLayer() {
        const dl = window.dataLayer || [];
        dl.forEach(pushedItem => {
            if (Array.isArray(pushedItem) && pushedItem[0] === 'consent' && typeof pushedItem[2] === 'object') {
                processConsentObject(pushedItem[2]);
            } 
            else {
                processConsentObject(pushedItem);
            }
        });
        paintConsent();
    }

    /**
     * Installs a recursion-proof wrapper around dataLayer.push that is
     * resilient to re-assignment by third-party scripts like GTM.
     */
    function guardDataLayerPush() {
        if (!window.dataLayer) window.dataLayer = [];

        // The real implementation we will delegate to (e.g., GTM's push).
        let _delegate = window.dataLayer.push;
        
        // The original, native push function for arrays.
        const nativePush = Array.prototype.push;

        // A flag to detect and prevent infinite recursion.
        let isRunning = false;

        function wrappedPush(...args) {
            // If we are already running, it means this is a recursive call from GTM.
            // We must break the loop by using the native array push, which just adds
            // the item to the dataLayer without re-triggering GTM's logic.
            if (isRunning) {
                return nativePush.apply(window.dataLayer, args);
            }

            isRunning = true;

            try {
                let consentChanged = false;
                args.forEach(item => {
                    if (Array.isArray(item) && item[0] === 'consent' && typeof item[2] === 'object') {
                        if (processConsentObject(item[2])) consentChanged = true;
                    } else if (processConsentObject(item)) {
                        consentChanged = true;
                    }
                });
                
                // Call the real GTM push function.
                const result = _delegate.apply(window.dataLayer, args);

                if (consentChanged) {
                    paintConsent();
                }
                
                return result;

            } finally {
                // IMPORTANT: Reset the flag for the next top-level call.
                isRunning = false;
            }
        }

        // Intercept any future assignments to `dataLayer.push`.
        Object.defineProperty(window.dataLayer, 'push', {
            configurable: true,
            enumerable: false,
            get() {
                return wrappedPush;
            },
            set(newFn) {
                // When GTM or another script replaces `push`, we save the new function
                // as our delegate, ensuring we always call the latest version.
                _delegate = newFn;
            }
        });
    }

    // --- INITIALIZATION ---

    // 1. Guard `dataLayer.push` immediately on script load.
    guardDataLayerPush();

    // 2. Listen for Axeptio's custom events.
    ['axeptio_consent_update', 'axeptio_widget_loaded'].forEach(evt =>
        window.addEventListener(evt, e => {
            try {
                if (e?.detail?.google_consent) {
                    if (processConsentObject(e.detail.google_consent)) {
                        paintConsent();
                    }
                }
            } catch (error) {
                console.error('[ConsentReader] Error processing Axeptio event:', error);
            }
        })
    );
    
    // 3. When the DOM is ready, scan the dataLayer for any initial state.
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            try {
                buildInitialStateFromDataLayer();
            } catch (error) {
                console.error('[ConsentReader] Error during initial scan:', error);
            }
        }, 100);
    });

})();