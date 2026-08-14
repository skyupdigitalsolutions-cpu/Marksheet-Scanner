/**
 * models/Payment.js
 *
 * Logs every Razorpay order created and its verification result.
 * One document per order (created -> paid/failed).
 */
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username:       { type: String, required: true },

    razorpayOrderId:   { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },

    amount:         { type: Number, required: true },   // in paise (e.g. 10000 = ₹100)
    currency:       { type: String, default: 'INR' },
    creditsGranted: { type: Number, default: 0 },        // scan credits added on successful verify

    status:         { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },

    createdAt:      { type: Date, default: Date.now },
    verifiedAt:     { type: Date, default: null }
});

paymentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
