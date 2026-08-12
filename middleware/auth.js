/**
 * FIX: Original checked user.isActive but User model had no isActive field
 *      -> every authenticated request returned 401 "User not found or inactive"
 */
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer '))
            return res.status(401).json({ success: false, message: 'No token provided' });

        const token   = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password');
        if (!user)
            return res.status(401).json({ success: false, message: 'User not found' });

        // Now safe because User model has isActive field
        if (!user.isActive)
            return res.status(401).json({ success: false, message: 'Account deactivated' });

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError')
            return res.status(401).json({ success: false, message: 'Token expired — please log in again' });
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};
