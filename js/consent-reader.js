/**
 * Read-only helper that shows the current Consent-Mode status
 * (ad_storage, analytics_storage, ad_user_data, ad_personalization)
 * in the #console-consent-gtm area.
 *
 * - never pushes to dataLayer
 * - never calls gtag('consent', …)
 * - never sets cookies or blocks tags
 */

/* ---------------- 1.  Utilities ---------------- */

const CONSENT_KEYS = [
    'ad_storage',
    'analytics_storage',
    'ad_user_data',
    'ad_personalization'
  ];
  
  /**
   * Render one consent object in the UI.
   * @param {Object} consent – keys above with value 'granted' | 'denied'
   */
  function paintConsent(consent = {}) {
    const root = document.getElementById('console-consent-gtm');
    if (!root) return;
  
    CONSENT_KEYS.forEach(key => {
      const el = root.querySelector(`[data-consent="${key}"]`);
      if (!el) return;
      const state = consent[key] || 'denied';
  
      el.classList.toggle('highlight-green', state === 'granted');
      el.classList.toggle('highlight-red',   state !== 'granted');
    });
  }
  
  /* ---------------- 2.  Current state at page-load ---------------- */
  
  function findLatestConsentInDL() {
    const dl = window.dataLayer || [];
    // iterate from the end => last overwrite wins
    for (let i = dl.length - 1; i >= 0; i--) {
      const obj = dl[i];
      if (obj && CONSENT_KEYS.every(k => k in obj)) {
        return obj;
      }
    }
    // nothing pushed yet → assume denied
    return {};
  }
  
  /* ---------------- 3.  Listen for future changes ---------------- */
  
  function installDLListener() {
    const originalPush = window.dataLayer.push;
    window.dataLayer.push = function () {
      // handle all arguments passed to push
      Array.from(arguments).forEach(obj => {
        if (obj && CONSENT_KEYS.every(k => k in obj)) {
          paintConsent(obj);
        }
      });
      return originalPush.apply(this, arguments);
    };
  }
  
  /* ---------------- 4.  Initialise once DOM is ready ------------- */
  
  document.addEventListener('DOMContentLoaded', () => {
    // 4.1 paint the best info we can find right now
    paintConsent(findLatestConsentInDL());
  
    // 4.2 start listening for subsequent consent updates
    installDLListener();
  });
  
  /* ---------------- 5.  Also react to Axeptio events ------------- */
  /* Axeptio sometimes fires dedicated events. They contain a
     `detail.google_consent` object with exactly our four keys.   */
  
  ['axeptio_consent_update', 'axeptio_widget_loaded'].forEach(evt =>
    window.addEventListener(evt, e => {
      if (e?.detail?.google_consent) {
        paintConsent(e.detail.google_consent);
      }
    })
  );