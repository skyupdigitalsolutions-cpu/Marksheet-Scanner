/**
 * config/razorpay.js
 * Lazily-initialised Razorpay instance. Set RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET in .env (get these from https://dashboard.razorpay.com
 * → Settings → API Keys). Use test keys (rzp_test_...) while developing.
 */
const Razorpay = require('razorpay');

let instance = null;

function getRazorpay() {
    if (instance) return instance;
    const key_id     = process.env.RAZORPAY_KEY_ID;
    const key_secret  = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) return null;
    instance = new Razorpay({ key_id, key_secret });
    return instance;
}

module.exports = { getRazorpay };
