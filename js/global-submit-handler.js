// global-submit-handler.js
document.addEventListener('DOMContentLoaded', function() {
    // Listen for submit events on the document (bubbling phase)
    document.addEventListener('submit', function(event) {
        const form = event.target; // The form that was submitted

        // Ensure it's a form element
        if (form && typeof form.querySelectorAll === 'function') {
            // Find <input type="submit"> elements within the submitted form
            const submitInputs = form.querySelectorAll('input[type="submit"]');
            submitInputs.forEach(input => {
                input.disabled = true;
                input.value = 'Submitting...'; // Change value for input elements
            });

            // Find <button type="submit"> elements within the submitted form
            const submitButtons = form.querySelectorAll('button[type="submit"]');
            submitButtons.forEach(button => {
                button.disabled = true;
                button.textContent = 'Submitting...'; // Change textContent for button elements
            });
        }
    });
});