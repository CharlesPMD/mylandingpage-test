// js/gtm-ga4-interceptor.js
// Version: 2025-06-22-D (localStorage persistence, placeholder preserved, newest event first)

(function() { // Self-invoking function to keep scope clean
    const LOCAL_STORAGE_KEY = 'ga4CapturedEventNames';
    const MAX_DISPLAYED_EVENTS_IN_CONSOLE = 5;
    const MAX_STORED_EVENTS_IN_MEMORY_AND_STORAGE = 20; // Max to keep in memory and persist
    let networkInterceptorInitialized = false;
    
    // Load events from localStorage on script initialization
    let capturedGa4EventNames = [];
    try {
        const storedEvents = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedEvents) {
            const parsedEvents = JSON.parse(storedEvents);
            if (Array.isArray(parsedEvents)) {
                capturedGa4EventNames = parsedEvents;
                console.log('[NetworkInterceptor] Loaded events from localStorage:', capturedGa4EventNames);
            }
        }
    } catch (e) {
        console.error('[NetworkInterceptor] Error loading events from localStorage:', e);
    }

    function updateCustomConsoleDisplayFromNetwork() {
        const eventDisplaySpan = document.getElementById('console-message-gtm');
        if (!eventDisplaySpan) { return; }

        if (capturedGa4EventNames.length > 0) {
            eventDisplaySpan.textContent = capturedGa4EventNames.slice(0, MAX_DISPLAYED_EVENTS_IN_CONSOLE).join(', ');
        }
        // If length is 0, the original HTML placeholder (e.g., "Listening...") remains.
        // If you want to explicitly set a "no events yet" message when loaded from empty localStorage:
        // else {
        //     eventDisplaySpan.textContent = "(No GA4 hits captured yet)";
        // }
    }

    function recordGa4EventFromNetwork(eventName, source, details) { 
        if (typeof eventName !== 'string' || !eventName) return;
        console.log(`%c[NetworkInterceptor] GA4 Event from Hit: "${eventName}" (Source: ${source})`, "color: #008080; font-weight: bold;", details);
        
        capturedGa4EventNames.unshift(eventName); 

        if (capturedGa4EventNames.length > MAX_STORED_EVENTS_IN_MEMORY_AND_STORAGE) {
            capturedGa4EventNames.pop(); 
        }

        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(capturedGa4EventNames));
        } catch (e) {
            console.error('[NetworkInterceptor] Error saving events to localStorage:', e);
        }
        updateCustomConsoleDisplayFromNetwork();
    }

    function parseAndLogGa4HitParameters(urlString, requestBody, source) {
        try {
            if (!urlString || typeof urlString !== 'string' || (!urlString.startsWith('http:') && !urlString.startsWith('https:'))) {
                return;
            }
            const url = new URL(urlString, window.location.origin); // Use window.location.origin as base for relative URLs
            if (!url.hostname.endsWith('google-analytics.com') || !url.pathname.includes('/g/collect')) {
                return; 
            }

            let combinedParams = new URLSearchParams(url.search); 
            if (requestBody && typeof requestBody === 'string' && requestBody.trim() !== '') {
                try {
                    const bodyOnlyParams = new URLSearchParams(requestBody);
                    bodyOnlyParams.forEach((value, key) => combinedParams.set(key, value));
                } catch (e) { /* console.warn for body parse error if needed */ }
            } else if (requestBody instanceof URLSearchParams) {
                 requestBody.forEach((value, key) => combinedParams.set(key, value));
            } else if (requestBody instanceof Blob) {
                // console.log(`[NetworkInterceptor] ${source} body is a Blob.`);
            }
            
            const ga4EventName = combinedParams.get('en');
            const measurementId = combinedParams.get('tid');

            if (ga4EventName) {
                recordGa4EventFromNetwork(ga4EventName, source, { tid: measurementId, url: urlString.substring(0, 150) + (urlString.length > 150 ? "..." : "") });
            } else if (measurementId && combinedParams.get('v') === '2') {
                let isLikelyConfigHit = false;
                combinedParams.forEach((value, key) => { if (key.startsWith('_p') || key === 'dl' || key === 'dt' || key === 'sid' || key === 'sct') isLikelyConfigHit = true; });
                if (isLikelyConfigHit && !combinedParams.has('en')) {
                     recordGa4EventFromNetwork('page_view', `${source} (config inferred)`, { tid: measurementId, url: urlString.substring(0, 150) + (urlString.length > 150 ? "..." : "") });
                }
            }
        } catch (e) { console.error('[NetworkInterceptor] Error parsing GA4 hit:', e, "URL:", urlString, "Body:", requestBody); }
    }

    function initializeNetworkInterceptor() {
        if (networkInterceptorInitialized) return;
        networkInterceptorInitialized = true;
        console.log('[NetworkInterceptor] Initializing...');

        // --- Wrap XMLHttpRequest ---
        if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype && XMLHttpRequest.prototype.send) {
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;
            const xhrUrlSymbol = typeof Symbol === 'function' ? Symbol('xhrUrl') : '__xhrUrl';
            XMLHttpRequest.prototype.open = function(method, url, ...restArgs) {
                let urlString = '';
                if (typeof url === 'string') { urlString = url; } 
                else if (url instanceof URL) { urlString = url.toString(); }
                this[xhrUrlSymbol] = urlString;
                return originalXHROpen.apply(this, [method, url, ...restArgs]);
            };
            XMLHttpRequest.prototype.send = function(body) {
                const urlFromOpen = this[xhrUrlSymbol];
                if (urlFromOpen) { parseAndLogGa4HitParameters(urlFromOpen, body, 'XHR'); }
                return originalXHRSend.apply(this, arguments);
            };
            console.log('[NetworkInterceptor] XMLHttpRequest wrapped.');
        } else { console.warn('[NetworkInterceptor] XMLHttpRequest not available for wrapping.'); }

        // --- Wrap fetch ---
        if (typeof window.fetch === 'function') {
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
                let urlString = ''; let requestBody = null; // let method = 'GET'; // method not strictly needed for parsing
                if (typeof input === 'string') { urlString = input; } 
                else if (input instanceof URL) { urlString = input.toString(); } 
                else if (input instanceof Request) { urlString = input.url; /* method = input.method; */ } // Request.body is a stream, harder to access
                if (init) { /* if(init.method) method = init.method; */ if(init.body) requestBody = init.body; }
                parseAndLogGa4HitParameters(urlString, requestBody, 'Fetch');
                return originalFetch.apply(this, arguments);
            };
            console.log('[NetworkInterceptor] Fetch wrapped.');
        } else { console.warn('[NetworkInterceptor] Fetch not available for wrapping.'); }

        // --- Wrap navigator.sendBeacon ---
        if (navigator && typeof navigator.sendBeacon === 'function') {
            const originalSendBeacon = navigator.sendBeacon;
            navigator.sendBeacon = function(url, data) {
                const urlString = (typeof url === 'string') ? url : (url instanceof URL ? url.toString() : '');
                let dataAsString = null;
                if (typeof data === 'string') { dataAsString = data; } 
                else if (data instanceof URLSearchParams) { dataAsString = data.toString(); }
                parseAndLogGa4HitParameters(urlString, dataAsString, 'Beacon');
                return originalSendBeacon.apply(this, arguments);
            };
            console.log('[NetworkInterceptor] navigator.sendBeacon wrapped.');
        } else { console.warn('[NetworkInterceptor] navigator.sendBeacon not available for wrapping.'); }

        // Initial display update from potentially loaded localStorage
        updateCustomConsoleDisplayFromNetwork(); 
    }

    // Initialize based on document state
    if (document.readyState === 'loading') { 
        // If this script is in <head> without defer/async, it might run here.
        // However, for interceptors, it's often better to wait for DOMContentLoaded 
        // OR run immediately if you are 100% sure it's placed after GTM but before other critical scripts.
        // For an external script, DOMContentLoaded is a safer bet for element access.
        document.addEventListener('DOMContentLoaded', initializeNetworkInterceptor);
    } else { 
        // DOM is already interactive or complete
        initializeNetworkInterceptor();
    }

    // Fallback: also ensure display is updated on DOMContentLoaded,
    // in case localStorage was populated but the span wasn't ready during initial load.
    document.addEventListener('DOMContentLoaded', () => {
        updateCustomConsoleDisplayFromNetwork();
    });

})(); // End of self-invoking function