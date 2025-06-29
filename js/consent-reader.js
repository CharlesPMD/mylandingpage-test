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

        // Check if the object contains at least one of our keys. This is the key change.
        const hasAnyConsentKey = CONSENT_KEYS.some(key => key in obj);

        if (hasAnyConsentKey) {
            // Merge the new data into our persistent state object.
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
            // Handle gtag('consent', 'update', { ... }) calls
            if (Array.isArray(pushedItem) && pushedItem[0] === 'consent' && typeof pushedItem[2] === 'object') {
                processConsentObject(pushedItem[2]);
            } 
            // Handle plain { ... } objects pushed to the dataLayer
            else {
                processConsentObject(pushedItem);
            }
        });
        // After scanning everything, paint the final, merged state.
        paintConsent();
    }

    /**
     * Installs a recursion-proof wrapper around dataLayer.push
     * that survives later re-assignments by GTM or other scripts.
     */
    function guardDataLayerPush() {
        if (!window.dataLayer) window.dataLayer = [];

        // The real implementation we delegate to.
        let _delegate = window.dataLayer.push.bind(window.dataLayer);
        
        // A flag to prevent re-entrant calls from causing an infinite loop.
        let isRunning = false;

        function wrappedPush(...args) {
            // If we're already in the middle of a push, it's a recursive call.
            // Pass it directly to the real implementation to avoid a stack overflow.
            if (isRunning) {
                return _delegate.apply(window.dataLayer, args);
            }

            isRunning = true;

            try {
                // 1. Process arguments to see if this is a consent update
                let consentChanged = false;
                args.forEach(item => {
                    if (Array.isArray(item) && item[0] === 'consent' && typeof item[2] === 'object') {
                        if (processConsentObject(item[2])) consentChanged = true;
                    } else if (processConsentObject(item)) {
                        consentChanged = true;
                    }
                });

                // 2. Call the original GTM push function.
                // Any internal calls to `dataLayer.push` will be caught by the `isRunning`
                // check above and will not trigger our processing logic again.
                const result = _delegate.apply(window.dataLayer, args);

                // 3. After the full chain of pushes is complete, paint the UI if needed.
                // This is done *after* the delegate call to ensure we have the final state.
                if (consentChanged) {
                    paintConsent();
                }

                return result;

            } finally {
                // Reset the flag for the next top-level push.
                isRunning = false;
            }
        }

        // Use a getter/setter to intercept any future assignments to `dataLayer.push`.
        // This makes our wrapper resilient to GTM's own script loading and re-assigning it.
        Object.defineProperty(window.dataLayer, 'push', {
            configurable: true,
            enumerable: false, // Hide it from for...in loops
            get() {
                return wrappedPush;
            },
            set(newFn) {
                // When GTM replaces push, we capture the new function as our delegate.
                _delegate = newFn.bind(window.dataLayer);
            }
        });
    }

    // ------------------------------------------------------------
    // INITIALISATION
    // ------------------------------------------------------------

    // 0. Guard `push` immediately
    guardDataLayerPush();

    // 1. Listen for Axeptio's specific events.
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

    // 2. When the DOM is ready, just build the initial state
    //    (listener is already installed, so we don't reinstall it here)
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