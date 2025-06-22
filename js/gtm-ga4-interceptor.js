// js/gtm-ga4-interceptor.js
// Version: 2025-06-22-F (Styled event names, localStorage, placeholder, newest first)

(function() { // Self-invoking function to keep scope clean
    const LOCAL_STORAGE_KEY = 'ga4CapturedEventNames';
    const MAX_DISPLAYED_EVENTS_IN_CONSOLE = 5; 
    const MAX_STORED_EVENTS_IN_MEMORY_AND_STORAGE = 20; 
    let networkInterceptorInitialized = false;
    
    let capturedGa4EventNames = [];
    try {
        const storedEvents = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedEvents) {
            const parsedEvents = JSON.parse(storedEvents);
            if (Array.isArray(parsedEvents)) {
                capturedGa4EventNames = parsedEvents;
            }
        }
    } catch (e) {
        console.error('[NetworkInterceptor] Error loading events from localStorage:', e);
    }

    function updateCustomConsoleDisplayFromNetwork() {
        const eventDisplaySpan = document.getElementById('console-message-gtm');
        if (!eventDisplaySpan) { return; }

        if (capturedGa4EventNames.length > 0) {
            const eventsToDisplay = capturedGa4EventNames.slice(0, MAX_DISPLAYED_EVENTS_IN_CONSOLE);
            // --- MODIFICATION START: Wrap each event in a styled span ---
            const styledEventsHtml = eventsToDisplay.map(eventName => {
                // Escape HTML special characters in eventName to prevent XSS if event names could contain them
                // A simple escaper; for very robust needs, a library might be better.
                const escapedEventName = eventName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
                return `<span class="highlight-green">${escapedEventName}</span>`;
            }).join(', '); // Join with comma and space
            
            eventDisplaySpan.innerHTML = styledEventsHtml; // Use innerHTML because we are setting HTML
            // --- MODIFICATION END ---
        }
        // If length is 0, the original HTML placeholder (e.g., "Listening...") remains.
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
            const url = new URL(urlString, window.location.origin);
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
        } else { console.warn('[NetworkInterceptor] XMLHttpRequest not available for wrapping.'); }

        if (typeof window.fetch === 'function') {
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
                let urlString = ''; let requestBody = null;
                if (typeof input === 'string') { urlString = input; } 
                else if (input instanceof URL) { urlString = input.toString(); } 
                else if (input instanceof Request) { urlString = input.url; }
                if (init) { if(init.body) requestBody = init.body; }
                parseAndLogGa4HitParameters(urlString, requestBody, 'Fetch');
                return originalFetch.apply(this, arguments);
            };
        } else { console.warn('[NetworkInterceptor] Fetch not available for wrapping.'); }

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
        } else { console.warn('[NetworkInterceptor] navigator.sendBeacon not available for wrapping.'); }

        updateCustomConsoleDisplayFromNetwork(); 
    }

    if (document.readyState === 'loading') { 
        document.addEventListener('DOMContentLoaded', initializeNetworkInterceptor);
    } else { 
        initializeNetworkInterceptor();
    }
    document.addEventListener('DOMContentLoaded', () => {
        updateCustomConsoleDisplayFromNetwork();
    });

})();