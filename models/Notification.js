const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    // Who sent it
    sentBy:      { type: String, default: 'SkyUp Digital' },

    // Content
    title:       { type: String, required: true, trim: true },
    body:        { type: String, required: true, trim: true },
    imageUrl:    { type: String, default: null },   // optional banner image
    actionUrl:   { type: String, default: null },   // deep link (e.g. app update URL)
    type:        {
        type: String,
        enum: ['update', 'promotion', 'announcement', 'maintenance', 'general'],
        default: 'general'
    },

    // Target
    target:      { type: String, enum: ['all', 'role', 'user'], default: 'all' },
    targetRole:  { type: String, default: null },   // if target='role'
    targetUserId:{ type: mongoose.Schema.Types.ObjectId, default: null },

    // Stats
    sentCount:   { type: Number, default: 0 },
    failCount:   { type: Number, default: 0 },

    sentAt:      { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
