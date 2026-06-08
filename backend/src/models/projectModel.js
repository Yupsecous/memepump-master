const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
    name: String,
    token: {
        address: String,
        name: String,
        symbol: String,
        decimals: String,
        totalSupply: String,
    },
    poolInfo: {
        type: Object,
    },
    zombie: String,
    wallets: [
        {
            address: String,
            initialTokenAmount: String,
            initialSolAmount: String,
            sim: {
                enabled: Boolean,
                disperseAmount: String,
                buy: {
                    tokenAmount: String,
                    solAmount: String,
                },
                xfer: {
                    fromAddress: String,
                    tokenAmount: String,
                }
            }
        }
    ],
    teamWallets: [
        {
            address: String,
            initialTokenAmount: String,
            sim: {
                disperseAmount: String,
                buy: {
                    tokenAmount: String,
                    solAmount: String,
                },
                xfer: {
                    fromAddress: String,
                    tokenAmount: String,
                }
            }
        }
    ],
    extraWallets: [
        {
            address: String,
            initialTokenAmount: String,
            sim: {
                disperseAmount: String,
                buy: {
                    tokenAmount: String,
                    solAmount: String,
                },
                xfer: {
                    fromAddress: String,
                    tokenAmount: String,
                }
            }
        }
    ],
    status: String,
    depositWallet: {
        address: String,
        expireTime: Date
    },
    userId: {
        type: String,
        required: [true, "Please Enter User Id"],
    },
    userName: String,
});

module.exports = mongoose.model("Project", projectSchema);
