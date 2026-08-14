/**
 * middleware/adminAuth.js
 * Same check routes/notifications.js already used inline — extracted here so
 * routes/admin.js and routes/payments (admin views) can share it too.
 * Admin panel sends the secret in the 'x-admin-secret' header.
 */
const ADMIN = process.env.ADMIN_SECRET || 'skyup_admin_secret';

module.exports = function adminAuth(req, res, next) {
    if (req.headers['x-admin-secret'] !== ADMIN) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    next();
};
