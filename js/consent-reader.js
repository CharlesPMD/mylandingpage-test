/**
 * A read-only script to display the current Google Consent Mode state
 * managed by a Consent Management Platform (like Axeptio).
 * This script does NOT write, update, or set any consent state.
 */

function refreshConsentDisplay() {
    // Your GTM container ID from index.html
    const GTM_ID = 'GTM-WLSQB5SF';

    const consentContainer = document.getElementById('console-consent-gtm');
    if (!consentContainer) {
        console.log('Consent display container not found.');
        return;
    }

    // This is an undocumented GTM helper function to read the current consent state.
    const getConsentState = () => {
        if (window.google_tag_manager && window.google_tag_manager[GTM_ID]) {
            const gtmConsentState = window.google_tag_manager[GTM_ID].getGlobalConsentState();
            if (gtmConsentState) {
                return gtmConsentState;
            }
        }
        // Return a default "denied" view if GTM isn't ready.
        return {
            ad_storage: 'denied',
            analytics_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
        };
    };

    const currentConsent = getConsentState();
    console.log('Read consent state:', currentConsent);

    const consentTypes = [
        'ad_storage',
        'analytics_storage',
        'ad_user_data',
        'ad_personalization'
    ];

    // Update the class for each consent type span.
    consentTypes.forEach(type => {
        const element = consentContainer.querySelector(`[data-consent="${type}"]`);
        if (element) {
            const state = currentConsent[type] || 'denied';
            element.classList.remove('highlight-red', 'highlight-green');
            element.classList.add(state === 'granted' ? 'highlight-green' : 'highlight-red');
        }
    });
}

// Axeptio fires custom events when the widget is loaded or consent is updated.
// We listen for these events to know when to refresh our display.

// Fired when the user makes or changes their consent choices.
window.addEventListener('axeptio_consent_update', refreshConsentDisplay);

// Fired when the Axeptio widget is fully loaded and has set the initial consent state.
window.addEventListener('axeptio_widget_loaded', refreshConsentDisplay);

// Also, run once when the DOM is ready, as a fallback in case the Axeptio
// events have already fired.
document.addEventListener('DOMContentLoaded', () => {
    // A small delay can help ensure the CMP has initialized.
    setTimeout(refreshConsentDisplay, 500);
});