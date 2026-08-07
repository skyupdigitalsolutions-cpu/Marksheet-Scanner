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
