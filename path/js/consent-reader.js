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

// Instead, install a lightweight poller to catch *every* dataLayer.push
let lastDLIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    // do an initial scan after GTM has initialized
    setTimeout(() => {
        buildInitialStateFromDataLayer();
        lastDLIndex = (window.dataLayer || []).length;
    }, 100);
});

// every 200ms, look for new entries in dataLayer
setInterval(() => {
    const dl = window.dataLayer || [];
    let changed = false;
    for (let i = lastDLIndex; i < dl.length; i++) {
        const item = dl[i];
        if (Array.isArray(item) && item[0] === 'consent' && typeof item[2] === 'object') {
            if (processConsentObject(item[2])) changed = true;
        } else if (processConsentObject(item)) {
            changed = true;
        }
    }
    if (changed) paintConsent();
    lastDLIndex = dl.length;
}, 200);

// Leave your Axeptio event‐listeners as they are:
['axeptio_consent_update', 'axeptio_widget_loaded'].forEach(evt =>
    window.addEventListener(evt, e => {
        try {
            if (e?.detail?.google_consent) {
                if (processConsentObject(e.detail.google_consent)) paintConsent();
            }
        } catch (error) {
            console.error('[ConsentReader] Error processing Axeptio event:', error);
        }
    })
);

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
        // log the raw update payload
        console.log('[ConsentReader] Consent update received:', obj);
        currentConsentState = { ...currentConsentState, ...obj };
        // now log each key's new status
        CONSENT_KEYS.forEach(key => {
            const state = currentConsentState[key] === 'granted' ? 'granted' : 'denied';
            console.log(`[ConsentReader] ${key}: ${state}`);
        });
        return true;
    }
    return false;
} 