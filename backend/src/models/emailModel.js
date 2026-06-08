const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String,
});

module.exports = mongoose.model("Email", emailSchema);
