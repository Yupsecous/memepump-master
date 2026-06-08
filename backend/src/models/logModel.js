const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    time: Date,
    level: String,
    title: String,
    description: String,
});

module.exports = mongoose.model("Log", logSchema);
