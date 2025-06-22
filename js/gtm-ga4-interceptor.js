/*
*   --- GA4 Network Hit Interceptor Script ---
*   Version: 2025-06-22-C (Placeholder preserved, newest event first)
*/

window.capturedGa4EventNames = window.capturedGa4EventNames || [];
const MAX_DISPLAYED_EVENTS_IN_CONSOLE = 3;
const MAX_STORED_EVENTS_IN_MEMORY = 20; // How many to keep in memory overall
let networkInterceptorInitialized = false;

function updateCustomConsoleDisplayFromNetwork() {
    const eventDisplaySpan = document.getElementById('console-message-gtm');
    if (!eventDisplaySpan) { return; }

    // --- TWEAK 1: Only update if we have captured events ---
    if (window.capturedGa4EventNames.length > 0) {
        // Take the first MAX_DISPLAYED_EVENTS_IN_CONSOLE items (which are the newest)
        eventDisplaySpan.textContent = window.capturedGa4EventNames.slice(0, MAX_DISPLAYED_EVENTS_IN_CONSOLE).join(', ');
    }
    // If length is 0, we don't touch eventDisplaySpan.textContent, preserving initial HTML placeholder
}

function recordGa4EventFromNetwork(eventName, source, details) { 
    if (typeof eventName !== 'string' || !eventName) return;
    console.log(`%c[NetworkInterceptor] GA4 Event from Hit: "${eventName}" (Source: ${source})`, "color: #008080; font-weight: bold;", details);
    
    // --- TWEAK 2: Add to the beginning of the array (newest first) ---
    window.capturedGa4EventNames.unshift(eventName); 

    // Keep the array from growing indefinitely
    if (window.capturedGa4EventNames.length > MAX_STORED_EVENTS_IN_MEMORY) {
        window.capturedGa4EventNames.pop(); // Remove the oldest from the end
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

    if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype && XMLHttpRequest.prototype.send) {
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        const xhrUrlSymbol = Symbol ? Symbol('xhrUrl') : '__xhrUrl';
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

    if (typeof window.fetch === 'function') {
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
            let urlString = ''; let requestBody = null; let method = 'GET';
            if (typeof input === 'string') { urlString = input; } 
            else if (input instanceof URL) { urlString = input.toString(); } 
            else if (input instanceof Request) { urlString = input.url; method = input.method; }
            if (init) { if(init.method) method = init.method; if(init.body) requestBody = init.body; }
            parseAndLogGa4HitParameters(urlString, requestBody, 'Fetch');
            return originalFetch.apply(this, arguments);
        };
        console.log('[NetworkInterceptor] Fetch wrapped.');
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
        console.log('[NetworkInterceptor] navigator.sendBeacon wrapped.');
    } else { console.warn('[NetworkInterceptor] navigator.sendBeacon not available for wrapping.'); }

    // --- TWEAK 1: Don't call update on init if placeholder is desired ---
    // updateCustomConsoleDisplayFromNetwork(); // This would overwrite placeholder if called before any events
}

if (document.readyState === 'loading') { initializeNetworkInterceptor(); } 
else { initializeNetworkInterceptor(); }

document.addEventListener('DOMContentLoaded', () => {
    // --- TWEAK 1: Call here to ensure span exists, but it will only update if events were already captured ---
    updateCustomConsoleDisplayFromNetwork(); 
});
