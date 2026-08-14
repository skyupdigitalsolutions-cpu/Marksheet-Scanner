/**
 * routes/payments.js
 *
 * Flow:
 *   1. App calls POST /api/payments/create-order { amountRupees }
 *      -> backend creates a Razorpay order, saves a Payment doc (status: created)
 *   2. App opens Razorpay Checkout (Android SDK) using the returned order id
 *   3. On success, app calls POST /api/payments/verify with the payment id,
 *      order id and signature Razorpay gave it
 *   4. Backend verifies the signature with RAZORPAY_KEY_SECRET (never trust the
 *      client), marks the Payment as paid, and credits scanCredits to the user
 *
 * Minimum recharge is enforced server-side (MIN_RECHARGE_RUPEES, default 100)
 * regardless of what the client sends.
 */
const express  = require('express');
const crypto   = require('crypto');
const authMW   = require('../middleware/auth');
const User     = require('../models/User');
const Payment  = require('../models/Payment');
const { getRazorpay } = require('../config/razorpay');

const router = express.Router();
router.use(authMW);

const MIN_RECHARGE_RUPEES = parseInt(process.env.MIN_RECHARGE_RUPEES || '100', 10);
// How many scan credits ₹100 buys. Override via env RS_PER_100_CREDITS.
const CREDITS_PER_100_RUPEES = parseInt(process.env.CREDITS_PER_100_RUPEES || '50', 10);

function creditsForAmount(amountRupees) {
    return Math.floor((amountRupees / 100) * CREDITS_PER_100_RUPEES);
}

// POST /api/payments/create-order
router.post('/create-order', async (req, res) => {
    try {
        const razorpay = getRazorpay();
        if (!razorpay) {
            return res.status(500).json({ success: false, message: 'Payments not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.' });
        }

        let amountRupees = parseInt(req.body.amountRupees, 10);
        if (!amountRupees || isNaN(amountRupees)) amountRupees = MIN_RECHARGE_RUPEES;
        if (amountRupees < MIN_RECHARGE_RUPEES) {
            return res.status(400).json({
                success: false,
                message: `Minimum recharge is ₹${MIN_RECHARGE_RUPEES}`
            });
        }

        const amountPaise = amountRupees * 100;
        const order = await razorpay.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: `ms_${req.user._id}_${Date.now()}`,
            notes: { userId: String(req.user._id), username: req.user.username }
        });

        await Payment.create({
            userId:          req.user._id,
            username:        req.user.username,
            razorpayOrderId: order.id,
            amount:          amountPaise,
            currency:        'INR',
            creditsGranted:  creditsForAmount(amountRupees),
            status:          'created'
        });

        res.json({
            success: true,
            orderId:  order.id,
            amount:   amountPaise,
            currency: 'INR',
            keyId:    process.env.RAZORPAY_KEY_ID,
            credits:  creditsForAmount(amountRupees)
        });
    } catch (err) {
        console.error('create-order error:', err);
        res.status(500).json({ success: false, message: 'Could not create payment order' });
    }
});

// POST /api/payments/verify
router.post('/verify', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
        }

        const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id, userId: req.user._id });
        if (!payment) return res.status(404).json({ success: false, message: 'Order not found' });
        if (payment.status === 'paid') {
            // Already processed (e.g. duplicate callback) — just return current state
            const user = await User.findById(req.user._id);
            return res.json({ success: true, message: 'Already verified', scanCredits: user.scanCredits });
        }

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            payment.status = 'failed';
            await payment.save();
            return res.status(400).json({ success: false, message: 'Payment verification failed — signature mismatch' });
        }

        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;
        payment.status     = 'paid';
        payment.verifiedAt = new Date();
        await payment.save();

        const user = await User.findById(req.user._id);
        user.scanCredits = (user.scanCredits || 0) + payment.creditsGranted;
        user.totalPaid   = (user.totalPaid || 0) + payment.amount;
        user.lowCreditsNotified = false; // reset so they get pinged again next time they run low
        await user.save();

        res.json({
            success: true,
            message: `Payment verified. ${payment.creditsGranted} scan credits added.`,
            scanCredits: user.scanCredits,
            creditsGranted: payment.creditsGranted
        });
    } catch (err) {
        console.error('verify payment error:', err);
        res.status(500).json({ success: false, message: 'Server error verifying payment' });
    }
});

// GET /api/payments/history  — current user's own payment history
router.get('/history', async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, payments });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
