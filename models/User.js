/**
 * models/User.js
 *
 * FIXES:
 * 1. Added isActive field — auth middleware referenced it but it didn't exist
 *    causing all authenticated requests to fail with 401
 * 2. Added lastLogin field — updated on each login (used by admin panel)
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true },
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    username:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    institution: { type: String, required: true, trim: true },
    role:        { type: String, enum: ['Teacher','Admin','Staff','Principal'], default: 'Teacher' },
    password:    { type: String, required: true },
    fcmToken:    { type: String, default: null },

    // FIX: these two fields were referenced in code but missing from schema
    isActive:    { type: Boolean, default: true },
    lastLogin:   { type: Date, default: null },

    // ── Admin restriction ────────────────────────────────────────────────
    // isActive = account enabled/disabled entirely (existing field, reused)
    // isBlocked = admin explicitly restricted this user (separate from isActive
    //             so admin panel can show "blocked by admin" vs "inactive")
    isBlocked:      { type: Boolean, default: false },
    blockedReason:  { type: String, default: '' },
    blockedAt:      { type: Date, default: null },

    // ── Scan credits / paywall ───────────────────────────────────────────
    // Every successful scan (detect-fields / scan / scan-universal) consumes
    // 1 credit. Credits are topped up via Razorpay payments (see Payment model).
    scanCredits:    { type: Number, default: 3 },   // 3 free trial scans on signup
    totalScansUsed: { type: Number, default: 0 },
    totalPaid:      { type: Number, default: 0 },   // lifetime amount paid in paise
    unlimitedAccess:{ type: Boolean, default: false }, // admin can grant unlimited access, bypassing credits

    // "Low credits — top up" push already sent for the CURRENT low balance.
    // Reset to false whenever the user recharges, so they get notified again
    // next time they run low. Prevents a push on every single scan below threshold.
    lowCreditsNotified: { type: Boolean, default: false },

    createdAt:   { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
