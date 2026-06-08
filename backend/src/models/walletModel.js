const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    address: String,
    privateKey: String,
    category: String,
    userId: String,
});

module.exports = mongoose.model("Wallet", walletSchema);
