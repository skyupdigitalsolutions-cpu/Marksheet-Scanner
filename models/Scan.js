const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username:     { type: String, required: true },

    // Booklet header fields
    bookletNo:    { type: String, default: '' },
    studentName:  { type: String, default: '' },
    regNo:        { type: String, default: '' },
    classBranch:  { type: String, default: '' },
    section:      { type: String, default: '' },
    courseName:   { type: String, default: '' },
    courseCode:   { type: String, default: '' },
    semester:     { type: String, default: '' },
    date:         { type: String, default: '' },
    academicYear: { type: String, default: '' },

    // Marks table — Q1
    q1a: { type: Number, default: 0 }, q1b: { type: Number, default: 0 },
    q1c: { type: Number, default: 0 }, q1d: { type: Number, default: 0 },
    q1e: { type: Number, default: 0 }, q1Total: { type: Number, default: 0 },

    // Q2
    q2a: { type: Number, default: 0 }, q2b: { type: Number, default: 0 },
    q2c: { type: Number, default: 0 }, q2d: { type: Number, default: 0 },
    q2e: { type: Number, default: 0 }, q2Total: { type: Number, default: 0 },

    // Q3
    q3a: { type: Number, default: 0 }, q3b: { type: Number, default: 0 },
    q3c: { type: Number, default: 0 }, q3d: { type: Number, default: 0 },
    q3e: { type: Number, default: 0 }, q3Total: { type: Number, default: 0 },

    grandTotal:   { type: Number, default: 0 },

    // Raw extracted data (all fields as key-value)
    rawData:      { type: Map, of: String, default: {} },

    // Metadata
    templateName: { type: String, default: 'SIT_Booklet' },
    provider:     { type: String, default: 'gemini' },   // gemini | openai | azure
    flaggedFields:{ type: [String], default: [] },
    corrections:  { type: String, default: '' },
    exportedToExcel: { type: Boolean, default: false },
    excelFileName:{ type: String, default: '' },

    scannedAt:    { type: Date, default: Date.now, index: true }
});

// Index for fast user history queries
scanSchema.index({ userId: 1, scannedAt: -1 });
scanSchema.index({ userId: 1, regNo: 1 });

module.exports = mongoose.model('Scan', scanSchema);
