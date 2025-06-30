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

    // Holds the merged, most-up-to-date consent state.
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
     * Merges a consent update into state and logs it.
     * @param {Object} obj
     * @returns {boolean} True if it was a consent update.
     */
    function processConsentObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return false;
        }

        const hasAnyConsentKey = CONSENT_KEYS.some(key => key in obj);
        if (!hasAnyConsentKey) return false;

        // 1) Log the raw payload
        console.log('[ConsentReader] Consent update received:', obj);

        // 2) Merge
        currentConsentState = { ...currentConsentState, ...obj };

        // 3) Log each key’s new status
        CONSENT_KEYS.forEach(key => {
            const state = currentConsentState[key] === 'granted' ? 'granted' : 'denied';
            console.log(`[ConsentReader] ${key}: ${state}`);
        });

        return true;
    }

    /**
     * Detects a gtag('consent','update',…) command, whether pushed
     * as a true Array or as an arguments-style object.
     */
    function isConsentCommand(item) {
        return item != null
            && typeof item === 'object'
            && item[0] === 'consent'
            && item[1] === 'update'
            && typeof item[2] === 'object';
    }

    /**
     * Scans the entire dataLayer from the start and paints the merged result.
     */
    function buildInitialStateFromDataLayer() {
        const dl = window.dataLayer || [];
        dl.forEach(entry => {
            if (isConsentCommand(entry)) {
                processConsentObject(entry[2]);
            } else {
                processConsentObject(entry);
            }
        });
        paintConsent();
    }

    // ────────────────────────────────────────────────────────────────
    // Lightweight poller to catch every new dataLayer entry
    // ────────────────────────────────────────────────────────────────
    let lastDLIndex = 0;

    document.addEventListener('DOMContentLoaded', () => {
        // Initial scan after GTM bootstraps
        setTimeout(() => {
            buildInitialStateFromDataLayer();
            lastDLIndex = (window.dataLayer || []).length;
        }, 100);
    });

    // Every 200ms, process only the new items
    setInterval(() => {
        const dl = window.dataLayer || [];
        let changed = false;
        for (let i = lastDLIndex; i < dl.length; i++) {
            const item = dl[i];
            if (isConsentCommand(item)) {
                if (processConsentObject(item[2])) changed = true;
            } else if (processConsentObject(item)) {
                changed = true;
            }
        }
        if (changed) paintConsent();
        lastDLIndex = dl.length;
    }, 200);

    // ────────────────────────────────────────────────────────────────
    // Axeptio event listeners (with logging)
    // ────────────────────────────────────────────────────────────────
    ['axeptio_consent_update', 'axeptio_widget_loaded'].forEach(evt =>
        window.addEventListener(evt, e => {
            console.log('[ConsentReader] Axeptio event fired:', evt, 'detail:', e.detail);
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

})();