const express = require('express');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User    = require('../models/User');
const authMW  = require('../middleware/auth');

const router = express.Router();
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

// POST /api/auth/signup
router.post('/signup', [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('username').trim().isLength({ min: 3 }).matches(/^[a-z0-9_]+$/).withMessage('Username: lowercase letters, numbers, underscore only'),
    body('institution').trim().notEmpty().withMessage('Institution required'),
    body('role').isIn(['Teacher','Admin','Staff','Principal']).withMessage('Invalid role'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
        const { name, email, username, institution, role, password } = req.body;
        if (await User.findOne({ email })) return res.status(409).json({ success: false, message: 'Email already registered' });
        if (await User.findOne({ username })) return res.status(409).json({ success: false, message: 'Username already taken' });
        const user  = await User.create({ name, email, username, institution, role, password });
        const token = signToken(user._id);
        res.status(201).json({ success: true, message: 'Account created', token, user: user.toJSON() });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/auth/login
router.post('/login', [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password)))
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
        const token = signToken(user._id);
        res.json({ success: true, message: 'Login successful', token, user: user.toJSON() });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/auth/me  (FIX: was missing)
router.get('/me', authMW, (req, res) => {
    res.json({ success: true, user: req.user });
});

// PUT /api/auth/profile  (FIX: was missing)
router.put('/profile', authMW, async (req, res) => {
    try {
        const allowed = {};
        if (req.body.name)        allowed.name        = req.body.name.trim();
        if (req.body.institution) allowed.institution = req.body.institution.trim();
        const user = await User.findByIdAndUpdate(req.user._id, allowed, { new: true }).select('-password');
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/auth/change-password  (FIX: was missing)
router.post('/change-password', authMW, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!(await user.comparePassword(req.body.currentPassword)))
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        user.password = req.body.newPassword;
        await user.save();
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
