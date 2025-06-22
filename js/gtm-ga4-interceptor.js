
// --- GA4 Event Interceptor Script ---
// This script attempts to capture GA4 event names as they are sent.

// Global store for captured GA4 event names
window.capturedGa4EventNames = window.capturedGa4EventNames || [];
const MAX_DISPLAYED_EVENTS_IN_CONSOLE = 3; // How many to show in your custom console span
const MAX_STORED_EVENTS_IN_MEMORY = 20;   // How many to keep in the script's memory

// Function to update your <span id="console-message-gtm">
function updateCustomConsoleDisplay() {
    const eventDisplaySpan = document.getElementById('console-message-gtm');
    if (!eventDisplaySpan) {
        // If DOM isn't ready or span is missing, it will be updated later by DOMContentLoaded.
        return;
    }

    if (window.capturedGa4EventNames.length > 0) {
        eventDisplaySpan.textContent = window.capturedGa4EventNames.slice(-MAX_DISPLAYED_EVENTS_IN_CONSOLE).join(', ');
    } else {
        eventDisplaySpan.textContent = "(No GA4 events captured yet)";
    }
}

// Helper to add event and update display (with basic deduplication for recently added same event name)
function recordGa4Event(eventName) {
    if (typeof eventName !== 'string' || !eventName) return;

    // Basic check to avoid rapid, identical sequential additions if multiple wrappers catch it.
    if (window.capturedGa4EventNames.length > 0 && 
        window.capturedGa4EventNames[window.capturedGa4EventNames.length - 1] === eventName) {
        // console.log(`Event "${eventName}" was already the last recorded. Skipping duplicate addition.`);
        // return; // Skip if it's an immediate duplicate from different wrappers.
        // For now, let's allow it and see the logs to understand if deduplication is truly needed.
    }

    window.capturedGa4EventNames.push(eventName);
    if (window.capturedGa4EventNames.length > MAX_STORED_EVENTS_IN_MEMORY) {
        window.capturedGa4EventNames.shift(); // Remove oldest
    }
    updateCustomConsoleDisplay(); // Update DOM if possible
}

// 1. Wrap dataLayer.push (to catch gtag calls made via GTM's initial stub)
if (window.dataLayer && typeof window.dataLayer.push === 'function') {
    const originalDataLayerPush = window.dataLayer.push;
    window.dataLayer.push = function(...pushedArgs) {
        // Check if this looks like a gtag call: dataLayer.push(arguments) where arguments[0] is 'event'
        if (pushedArgs.length > 0 && pushedArgs[0] && 
            typeof pushedArgs[0] === 'object' && // `arguments` is an object
            typeof pushedArgs[0].length === 'number' && // `arguments` has a length property
            pushedArgs[0][0] === 'event' && typeof pushedArgs[0][1] === 'string') {
            
            const ga4EventNameFromDataLayer = pushedArgs[0][1];
            console.log('[Interceptor] GA4 Event via dataLayer.push (gtag stub):', ga4EventNameFromDataLayer, 'Params:', pushedArgs[0][2] || {});
            recordGa4Event(ga4EventNameFromDataLayer);
        } else {
            // Log other types of dataLayer.push events for general debugging if needed
            // pushedArgs.forEach(arg => {
            //     if (arg && typeof arg.event === 'string') {
            //         console.log('[Interceptor] Standard dataLayer.push event:', arg.event);
            //     }
            // });
        }
        return originalDataLayerPush.apply(window.dataLayer, pushedArgs);
    };
    console.log('[Interceptor] dataLayer.push has been wrapped.');
} else {
    console.warn('[Interceptor] window.dataLayer.push not found or not a function when script ran.');
}

// 2. Poll for and wrap window.gtag directly (for fully loaded gtag.js or other gtag definitions)
let gtagDirectWrapAttempts = 0;
const maxGtagDirectWrapAttempts = 25; // Try for about 12.5 seconds

function attemptDirectGtagWrap() {
    gtagDirectWrapAttempts++;
    if (typeof window.gtag === 'function') {
        // Check if it's already our wrapper to prevent multiple wraps of the same instance
        if (window.gtag.name === 'interceptedGtagFunction') {
                console.log('[Interceptor] window.gtag already wrapped by this script.');
                return;
        }

        const originalGtagFunction = window.gtag;
        console.log('[Interceptor] Found window.gtag. Wrapping it directly.');

        window.gtag = function interceptedGtagFunction(...gtagArgs) {
            if (gtagArgs.length >= 2 && gtagArgs[0] === 'event' && typeof gtagArgs[1] === 'string') {
                const ga4EventNameFromDirectGtag = gtagArgs[1];
                console.log('[Interceptor] GA4 Event via direct window.gtag call:', ga4EventNameFromDirectGtag, 'Parameters:', gtagArgs[2] || {});
                recordGa4Event(ga4EventNameFromDirectGtag);
            }
            return originalGtagFunction.apply(this, gtagArgs);
        };
        console.log('[Interceptor] window.gtag has been wrapped directly.');

    } else if (gtagDirectWrapAttempts < maxGtagDirectWrapAttempts) {
        // console.log(`[Interceptor] window.gtag not a function yet (Attempt ${gtagDirectWrapAttempts}). Retrying...`);
        setTimeout(attemptDirectGtagWrap, 500);
    } else {
        console.warn('[Interceptor] window.gtag did not become a function after multiple attempts. Direct wrapping may have failed or is not needed.');
    }
}
attemptDirectGtagWrap(); // Start the process

// Ensure the display is updated once the DOM is fully loaded,
// using any events captured up to that point.
document.addEventListener('DOMContentLoaded', () => {
    updateCustomConsoleDisplay(); // Initial update for the span on DOM ready
    console.log('[Interceptor] DOMContentLoaded: Custom console display updated.');
});

