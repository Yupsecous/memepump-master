const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

exports.connectDatabase = (callback) => {
    console.log("Connecting database...", MONGO_URI);
    mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log("Mongoose Connected");
        if (callback)
            callback();
    });
}
