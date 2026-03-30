// Simple Payment Platform JavaScript
// Using Flutterwave API for payments with clean error handling

let PUBLIC_KEY = '';
let BASE_CURRENCY = '';

async function loadConfig() {
    const response = await fetch('/api/config');
    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error('Failed to load app config');
    }
    return data.config;
}

async function ensureAppConfig() {
    if (PUBLIC_KEY && BASE_CURRENCY) return;

    const config = await loadConfig();
    PUBLIC_KEY = config.flutterwavePublicKeyValue || '';
    BASE_CURRENCY = config.baseCurrency || 'RWF';
}

// Helper function to show/hide elements
function showElement(elementId) {
    document.getElementById(elementId).classList.remove('hidden');
}

function hideElement(elementId) {
    document.getElementById(elementId).classList.add('hidden');
}

// Clear all error messages
function clearErrors() {
    const errorElements = ['nameError', 'emailError', 'phoneError', 'amountError'];
    errorElements.forEach(id => {
        document.getElementById(id).textContent = '';
    });
    hideElement('errorMessage');
    hideElement('successMessage'); 
}

// Validate form data
function validateForm(name, email, phone, amount) {
    let isValid = true;
    clearErrors();

    // Validate name
    if (!name || name.trim().length < 2) {
        document.getElementById('nameError').textContent = 'Please enter a valid full name';
        isValid = false;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        document.getElementById('emailError').textContent = 'Please enter a valid email address';
        isValid = false;
    }

    // Validate phone number (Rwandan format - more flexible)
    const phoneRegex = /^(\+?25)?07[2389]\d{7}$/;
    const cleanPhone = phone.replace(/[\s-+]/g, '');
    if (!phone || !phoneRegex.test(cleanPhone)) {
        document.getElementById('phoneError').textContent = 'Please enter a valid Rwandan phone number (078XXXXXXX, 079XXXXXXX, 072XXXXXXX, or 073XXXXXXX)';
        isValid = false;
    }

    // Validate amount
    if (!amount || amount < 100) {
        document.getElementById('amountError').textContent = 'Amount must be at least 100 RWF';
        isValid = false;
    }

    return isValid;
}

// Save payment to database
async function savePaymentToDatabase(paymentData) {
    try {
        const response = await fetch('/api/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentData)
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message);
        }
        
        return result;
    } catch (error) {
        console.error('Error saving payment:', error);
        throw error;
    }
}

// Update payment status after verification
async function updatePaymentStatus(tx_ref, transaction_id, status) {
    try {
        const response = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tx_ref,
                transaction_id,
                status
            })
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message);
        }
        
        return result;
    } catch (error) {
        console.error('Error updating payment status:', error);
        throw error;
    }
}

// Main payment function
async function makePayment() {
    // Get form values
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);

    // Validate form
    if (!validateForm(name, email, phone, amount)) {
        return;
    }

    // Generate unique transaction reference
    const tx_ref = 'RW-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    try {
        if (!PUBLIC_KEY) {
            // IMPORTANT: Don't hardcode keys in frontend. Load from server runtime.
            const config = await loadConfig();
            PUBLIC_KEY = config.flutterwavePublicKeyValue || '';

            if (!PUBLIC_KEY) {
                hideElement('loadingMessage');
                showElement('errorMessage');
                document.getElementById('errorMessage').textContent =
                    'Flutterwave public key is missing. Ask the developer to set FLUTTERWAVE_PUBLIC_KEY before testing payments.';
                return;
            }
        }

        // Show loading state
        showElement('loadingMessage');
        document.getElementById('payButton').disabled = true;
        document.getElementById('payButton').textContent = 'Processing...';

        // Save payment to database first
        await savePaymentToDatabase({
            name,
            email,
            phone,
            amount,
            tx_ref
        });

        // Reduce browser console a11y warning: don't open modal with a focused button
        const activeEl = document.activeElement;
        if (activeEl && typeof activeEl.blur === 'function') {
            activeEl.blur();
        }

        // Initialize Flutterwave payment
        FlutterwaveCheckout({
            public_key: PUBLIC_KEY,
            tx_ref: tx_ref,
            amount: amount,
            currency: "RWF",
            payment_options: "card, mobilemoney, ussd",
            customer: {
                email: email,
                phone_number: phone,
                name: name,
            },
            customizations: {
                title: "Simple Payment Platform",
                description: "Payment for services",
                logo: "https://cdn.pixabay.com/photo/2016/08/15/18/22/currency-1596062_1280.png",
            },
            callback: async function(response) {
                hideElement('loadingMessage');
                
                if (response.status === "successful") {
                    try {
                        // Update payment status in database
                        await updatePaymentStatus(tx_ref, response.transaction_id, 'successful');
                        
                        // Show success message
                        showElement('successMessage');
                        document.getElementById('successMessage').innerHTML = `
                            <h3>Payment Successful!</h3>
                            <p>Transaction ID: ${response.transaction_id}</p>
                            <p>Reference: ${tx_ref}</p>
                        `;
                        
                        // Clear form
                        document.getElementById('paymentForm').reset();
                        
                    } catch (error) {
                        console.error('Error updating payment status:', error);
                        showElement('errorMessage');
                        document.getElementById('errorMessage').textContent = 'Payment completed but failed to update records.';
                    }
                } else {
                    // Payment failed
                    try {
                        await updatePaymentStatus(tx_ref, response.transaction_id || '', 'failed');
                    } catch (error) {
                        console.error('Error updating failed payment status:', error);
                    }
                    
                    showElement('errorMessage');
                    document.getElementById('errorMessage').textContent = 'Payment failed. Please try again.';
                }
                
                // Re-enable button
                document.getElementById('payButton').disabled = false;
                document.getElementById('payButton').textContent = 'Pay Now';
            },
            onclose: function() {
                // Handle when payment modal is closed without completion
                hideElement('loadingMessage');
                document.getElementById('payButton').disabled = false;
                document.getElementById('payButton').textContent = 'Pay Now';
            }
        });

    } catch (error) {
        console.error('Payment initialization error:', error);
        hideElement('loadingMessage');
        showElement('errorMessage');
        document.getElementById('errorMessage').textContent = error?.message || 'Failed to initialize payment. Please try again.';
        
        // Re-enable button
        document.getElementById('payButton').disabled = false;
        document.getElementById('payButton').textContent = 'Pay Now';
    }
}

async function fetchExchangeRate(from, to) {
    const url = `/api/exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const response = await fetch(url);
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || !data.success) {
        throw new Error(data?.message || 'Failed to fetch exchange rate');
    }
    return data;
}

function clearConversionMessages() {
    hideElement('conversionError');
    hideElement('conversionResult');
    hideElement('conversionStatus');
}

async function convertCurrencyToBase() {
    const fromCurrency = document.getElementById('fromCurrency')?.value;
    const rawAmount = document.getElementById('convertAmount')?.value;
    const amountNumber = parseFloat(rawAmount);

    if (!fromCurrency || !/^[A-Z]{3}$/.test(fromCurrency)) {
        return;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        hideElement('conversionResult');
        showElement('conversionError');
        document.getElementById('conversionError').textContent = 'Enter a valid amount to convert.';
        return;
    }

    try {
        clearConversionMessages();
        showElement('conversionStatus');

        await ensureAppConfig();

        const exchange = await fetchExchangeRate(fromCurrency, BASE_CURRENCY);
        const rate = exchange.rate;
        const converted = amountNumber * rate;
        const rounded = Math.round(converted);

        document.getElementById('amount').value = rounded;

        hideElement('conversionStatus');
        showElement('conversionResult');
        document.getElementById('conversionResult').textContent =
            `${amountNumber} ${fromCurrency} ≈ ${rounded} ${BASE_CURRENCY} (rate: ${rate})`;

        // Reset any previous validation message for amount
        const amountInput = document.getElementById('amount');
        if (amountInput) {
            amountInput.reportValidity?.();
        }
    } catch (error) {
        console.error('Conversion error:', error);
        hideElement('conversionStatus');
        showElement('conversionError');
        document.getElementById('conversionError').textContent =
            error?.message || 'Failed to convert currency. Please try again.';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const convertBtn = document.getElementById('convertBtn');
    if (convertBtn) {
        convertBtn.addEventListener('click', convertCurrencyToBase);
    }
});

// Add CSS for hidden class if not already present
if (!document.querySelector('style[data-hidden-class]')) {
    const style = document.createElement('style');
    style.setAttribute('data-hidden-class', 'true');
    style.textContent = `.hidden { display: none !important; }`;
    document.head.appendChild(style);
}
