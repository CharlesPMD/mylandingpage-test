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
     * Replaces dataLayer.push to listen for future changes.
     */
    function installDataLayerListener() {
        // Ensure dataLayer exists before trying to override it
        if (!window.dataLayer) {
            console.warn('[ConsentReader] dataLayer not found, creating empty array');
            window.dataLayer = [];
        }
        
        // Ensure dataLayer has a push method
        if (typeof window.dataLayer.push !== 'function') {
            console.warn('[ConsentReader] dataLayer.push is not a function, cannot install listener');
            return;
        }
        
        const originalPush = window.dataLayer.push;
        window.dataLayer.push = function(...args) {
            let consentWasUpdated = false;
            args.forEach(pushedItem => {
                if (Array.isArray(pushedItem) && pushedItem[0] === 'consent' && typeof pushedItem[2] === 'object') {
                    if (processConsentObject(pushedItem[2])) {
                        consentWasUpdated = true;
                    }
                } else {
                    if (processConsentObject(pushedItem)) {
                        consentWasUpdated = true;
                    }
                }
            });

            // Only repaint the UI if a relevant update was found.
            if (consentWasUpdated) {
                paintConsent();
            }

            return originalPush.apply(window.dataLayer, args);
        };
    }

    // ------------------------------------------------------------
    // INITIALISATION
    // ------------------------------------------------------------

    // 0. Install the listener AS EARLY AS POSSIBLE so we don't miss anything
    installDataLayerListener();

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