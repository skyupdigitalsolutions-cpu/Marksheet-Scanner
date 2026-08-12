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
