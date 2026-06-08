const mongoose = require('mongoose');

const jitoSignerSchema = new mongoose.Schema({
    address: String,
    privateKey: String,
});

module.exports = mongoose.model("JitoSigner", jitoSignerSchema);
