const mongoose = require('mongoose');

var conn1 = mongoose.createConnection('mongodb://127.0.0.1/bbaebi_sol_snipe_db');
var conn2 = mongoose.createConnection('mongodb://127.0.0.1/bbaebi_sol_token_bot_db');
var Session = conn1.model("Session", new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please Enter Name"],
    },
    password: String,
    role: String,
    code: String,
    referral: String,
    depositWallet: {
        address: String,
        expireTime: Date
    },
    status: String,
}));

var Profile = conn1.model("Profile", new mongoose.Schema({
    sessionId: {
        type: String,
        required: [true, "Please Enter Session Id"],
        unique: true,
    },
    token: {
        type: String,
    },
    poolInfo: {
        type: Object,
    },
    poolCreated: {
        type: Boolean,
    },
    wallets: [
        {
            address: String,
            buyAmount: String,
            solAmountToSend: String,
        }
    ],
    adminWallets: [
        {
            address: String,
            buyAmount: String,
            sim: {
                disperseAmount: String,
                buy: {
                    tokenAmount: String,
                    solAmount: String,
                },
                transfer: {
                    from: String,
                    tokenAmount: String,
                }
            }
        }
    ],
    extraWallets: [
        {
            address: String,
            buyAmount: String,
            sim: {
                disperseAmount: String,
                buy: {
                    tokenAmount: String,
                    solAmount: String,
                },
                transfer: {
                    from: String,
                    tokenAmount: String,
                }
            }
        }
    ],
    zombie: {
        type: String,
    }
}));

var Wallet1 = conn1.model("Wallet", new mongoose.Schema({
    address: String,
    privateKey: String,
    sessionId: String,
}));

var User = conn2.model("User", new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please Enter Your Name"],
        unique: true,
    },
    password: {
        type: String,
        required: [true, "Please Enter Your Password"],
        minLength: [8, "Password should have at least 8 chars"],
        select: false,
    },
    role: {
        type: String,
        default: "user",
    },
    code: String,
    referral: String,
    createdAt: {
        type: Date,
        default: Date.now,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
}));

var Project = conn2.model("Project", new mongoose.Schema({
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
}));

var Wallet2 = conn2.model("Wallet", new mongoose.Schema({
    address: String,
    privateKey: String,
    category: String,
    userId: String,
}))

const test = async () => {
    console.log("Testing...");
    // const profiles = await Profile.find();
    // for (let i = 0; i < profiles.length; i++) {
    //     console.log("Profile", i, "Token:", profiles[i].token);
    // }
    const profile = await Profile.findOne({ token: "3ZnbKDSyXdAmCkY36bbGrMstxFa2XFZDgnG7HWeBizUN" });
    if (!profile) {
        console.log("Not found profile!");
        return;
    }

    const project = await Project.findOne({ name: "Pepezilla" });
    if (!project) {
        console.log("Not found project!");
        return;
    }

    project.token.address = profile.token;
    project.zombie = profile.zombie;
    project.poolInfo = profile.poolInfo;

    const oldWalletItem = await Wallet1.findOne({ address: profile.zombie });
    const newWalletItem = await Wallet2.findOne({ address: profile.zombie });
    if (oldWalletItem && !newWalletItem) {
        await Wallet2.create({
            address: oldWalletItem.address,
            privateKey: oldWalletItem.privateKey,
            category: "zombie",
            userId: project.userId,
        });
    }
    
    project.wallets = [];
    for (let i = 0; i < profile.wallets.length; i++) {
        if (profile.wallets[i].address === "")
            continue;

        project.wallets = [
            ...project.wallets,
            {
                address: profile.wallets[i].address,
                initialTokenAmount: profile.wallets[i].buyAmount,
                initialSolAmount: profile.wallets[i].solAmountToSend,
                sim: {
                    disperseAmount: "",
                    buy: {
                        tokenAmount: "",
                        solAmount: "",
                    },
                    xfer: {
                        fromAddress: "",
                        tokenAmount: "",
                    }
                }
            }
        ];

        const oldWalletItem = await Wallet1.findOne({ address: profile.wallets[i].address });
        const newWalletItem = await Wallet2.findOne({ address: profile.wallets[i].address });
        if (oldWalletItem && !newWalletItem) {
            await Wallet2.create({
                address: oldWalletItem.address,
                privateKey: oldWalletItem.privateKey,
                category: "general",
                userId: project.userId,
            });
        }
    }

    project.teamWallets = [];
    for (let i = 0; i < profile.adminWallets.length; i++) {
        project.teamWallets = [
            ...project.teamWallets,
            {
                address: profile.adminWallets[i].address,
                initialTokenAmount: profile.adminWallets[i].buyAmount,
                sim: {
                    disperseAmount: profile.adminWallets[i].sim.disperseAmount,
                    buy: {
                        tokenAmount: profile.adminWallets[i].sim.buy.tokenAmount,
                        solAmount: profile.adminWallets[i].sim.buy.solAmount,
                    },
                    xfer: {
                        fromAddress: profile.adminWallets[i].sim.transfer.from,
                        tokenAmount: profile.adminWallets[i].sim.transfer.tokenAmount,
                    }
                }
            }
        ];

        const oldWalletItem = await Wallet1.findOne({ address: profile.adminWallets[i].address });
        const newWalletItem = await Wallet2.findOne({ address: profile.adminWallets[i].address });
        if (oldWalletItem && !newWalletItem) {
            await Wallet2.create({
                address: oldWalletItem.address,
                privateKey: oldWalletItem.privateKey,
                category: "team",
                userId: "admin",
            });
        }
    }
    project.status = "TRADE";

    await project.save();
    console.log("Success");
}

const importSessionToProject = async (userName, oldSessionName, newProjectName) => {
    console.log("Importing sessions...", userName, oldSessionName, newProjectName);

    const user = await User.findOne({ name: userName });
    if (!user) {
        console.log("Not found user!");
        return;
    }

    const session = await Session.findOne({ name: oldSessionName });
    if (!session) {
        console.log("Not found sesssion!");
        return;
    }

    const profile = await Profile.findOne({ sessionId: session._id.toString() });
    if (!profile) {
        console.log("Not found profile!");
        await Project.create({
            name: newProjectName,
            token: {
                address: "",
                name: "",
                symbol: "",
                decimals: "",
                totalSupply: "",
            },
            poolInfo: {},
            zombie: "",
            wallets: [],
            teamWallets: [],
            extraWallets: [],
            status: session.status,
            depositWallet: {
                address: "",
                expireTime: new Date(Date.now())
            },
            userId: user._id.toString(),
            userName: user.name,
        });
        return;
    }

    let project = await Project.findOne({ name: newProjectName, userId: user._id.toString() });
    if (!project) {
        project = await Project.create({
            name: newProjectName,
            token: {
                address: "",
                name: "",
                symbol: "",
                decimals: "",
                totalSupply: "",
            },
            poolInfo: {},
            zombie: "",
            wallets: [],
            teamWallets: [],
            extraWallets: [],
            status: session.status,
            depositWallet: {
                address: "",
                expireTime: new Date(Date.now())
            },
            userId: user._id.toString(),
            userName: user.name,
        });
    }

    project.token.address = profile.token;
    project.zombie = profile.zombie;
    project.poolInfo = profile.poolInfo;

    const oldWalletItem = await Wallet1.findOne({ address: profile.zombie });
    const newWalletItem = await Wallet2.findOne({ address: profile.zombie });
    if (oldWalletItem && !newWalletItem) {
        await Wallet2.create({
            address: oldWalletItem.address,
            privateKey: oldWalletItem.privateKey,
            category: "zombie",
            userId: project.userId,
        });
    }
    
    project.wallets = [];
    for (let i = 0; i < profile.wallets.length; i++) {
        if (profile.wallets[i].address === "")
            continue;

        project.wallets = [
            ...project.wallets,
            {
                address: profile.wallets[i].address,
                initialTokenAmount: profile.wallets[i].buyAmount,
                initialSolAmount: profile.wallets[i].solAmountToSend,
                sim: {
                    disperseAmount: "",
                    buy: {
                        tokenAmount: "",
                        solAmount: "",
                    },
                    xfer: {
                        fromAddress: "",
                        tokenAmount: "",
                    }
                }
            }
        ];

        const oldWalletItem = await Wallet1.findOne({ address: profile.wallets[i].address });
        const newWalletItem = await Wallet2.findOne({ address: profile.wallets[i].address });
        if (oldWalletItem && !newWalletItem) {
            await Wallet2.create({
                address: oldWalletItem.address,
                privateKey: oldWalletItem.privateKey,
                category: "general",
                userId: project.userId,
            });
        }
    }

    project.teamWallets = [];
    for (let i = 0; i < profile.adminWallets.length; i++) {
        project.teamWallets = [
            ...project.teamWallets,
            {
                address: profile.adminWallets[i].address,
                initialTokenAmount: profile.adminWallets[i].buyAmount,
                sim: {
                    disperseAmount: profile.adminWallets[i].sim.disperseAmount,
                    buy: {
                        tokenAmount: profile.adminWallets[i].sim.buy.tokenAmount,
                        solAmount: profile.adminWallets[i].sim.buy.solAmount,
                    },
                    xfer: {
                        fromAddress: profile.adminWallets[i].sim.transfer.from,
                        tokenAmount: profile.adminWallets[i].sim.transfer.tokenAmount,
                    }
                }
            }
        ];

        const oldWalletItem = await Wallet1.findOne({ address: profile.adminWallets[i].address });
        const newWalletItem = await Wallet2.findOne({ address: profile.adminWallets[i].address });
        if (oldWalletItem && !newWalletItem) {
            await Wallet2.create({
                address: oldWalletItem.address,
                privateKey: oldWalletItem.privateKey,
                category: "team",
                userId: "admin",
            });
        }
    }

    await project.save();
    console.log("Success");
}

// test();