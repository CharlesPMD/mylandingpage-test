// config.js
// Centralised configuration shared across the site.
//   • MAKE_WEBHOOK – current Make scenario endpoint
//   • (Add future global constants here.)
// Update MAKE_WEBHOOK whenever your Make URL changes. Bump ?v= in the
// <script src> tag so browsers fetch the new version.

const MAKE_WEBHOOK = 'https://hook.eu2.make.com/hwyim1r2lpkcrixyq7dmewb1kdeq22nj';

// Expose globally so any script can access it.
window.MAKE_WEBHOOK = MAKE_WEBHOOK;

// Automatically set the webhook URL on every <form> that declares
// an *empty* action: action="". This keeps markup clean and avoids
// hard‑coding endpoints across pages.
(function attachWebhookToForms() {
  const assignWebhook = () => {
    document.querySelectorAll('form').forEach(form => {
      // getAttribute returns null if the attribute is missing.
      // We only patch forms that explicitly have action="".
      const raw = form.getAttribute('action');
      if (raw !== null && raw.trim() === '') {
        form.setAttribute('action', MAKE_WEBHOOK);
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', assignWebhook);
  } else {
    assignWebhook();
  }
})();
