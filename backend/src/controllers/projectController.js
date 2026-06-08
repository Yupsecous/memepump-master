const BigNumber = require("bignumber.js");
const json2csv = require("json2csv").parse;
const bs58 = require("bs58");
const BN = require("bn.js");
const {
    Keypair,
    PublicKey,
    Transaction,
    TransactionMessage,
    VersionedTransaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
    getMint,
    getAccount,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    getOrCreateAssociatedTokenAccount,
    createTransferInstruction,
    createCloseAccountInstruction,
} = require("@solana/spl-token");
const {
    TOKEN_PROGRAM_ID,
    Liquidity,
    Percent,
    Token,
    TokenAmount,
    TxVersion,
    jsonInfo2PoolKeys,
    buildSimpleTransaction,
} = require('@raydium-io/raydium-sdk');
const {
    PROGRAM_ID,
    Metadata,
} = require("@metaplex-foundation/mpl-token-metadata");

const Project = require("../models/projectModel");
const Wallet = require("../models/walletModel");
const Email = require("../models/emailModel");
const { useConnection } = require("../utils/connection");
const { isValidAddress } = require("../utils/common");
const { getTipAccounts, sendBundles } = require("../utils/jito");
// const { addLog } = require("../utils/log");

const {
    sleep,
    getRandomNumber,
    xWeiAmount,
    sendAndConfirmVersionedTransactions,
    sendAndConfirmLegacyTransactions,
    getWalletTokenAccount,
    getPoolInfo,
} = require("../utils/common");
const { getWebSocketClientList } = require("../utils/websocket");
const sendEmail = require("../utils/sendEmail");

let pendingProjectIDs = [];
const doMonitor = async () => {
    console.log("Start monitoring for created project...");
    while (true) {
        let sleeping = true;
        const curTime = Date.now();
        for (let i = 0; i < pendingProjectIDs.length; i++) {
            const project = await Project.findById(pendingProjectIDs[i]);
            if (project) {
                if (project.status !== "INIT") {
                    console.log("Activated project:", project.name);
                    sleeping = false;
                    pendingProjectIDs = pendingProjectIDs.filter(item => item !== pendingProjectIDs[i]);
                    break;
                }

                if (curTime >= project.depositWallet.expireTime.getTime()) {
                    console.log("Expired project:", project.name);
                    project.status = "EXPIRED";
                    await project.save();

                    sleeping = false;
                    pendingProjectIDs = pendingProjectIDs.filter(item => item !== pendingProjectIDs[i]);
                    break;
                }

                try {
                    const { connection } = useConnection();
                    const balance = await connection.getBalance(new PublicKey(project.depositWallet.address));
                    const b1 = new BigNumber(balance.toString());
                    const b2 = new BigNumber("1e9"); // 1 SOL
                    if (b1.gte(b2)) {
                        console.log("Activated project:", project.name);
                        project.status = "OPEN";
                        await project.save();

                        // TODO: Transfer SOL from deposit wallet of project to hot wallet
                        
                        sleeping = false;
                        pendingProjectIDs = pendingProjectIDs.filter(item => item !== pendingProjectIDs[i]);
                        break;
                    }
                }
                catch (err) {
                    console.log(err);
                }
            }
            else {
                sleeping = false;
                pendingProjectIDs = pendingProjectIDs.filter(item => item !== pendingProjectIDs[i]);
                break;
            }
        }

        if (sleeping)
            await sleep(10000);
    }
}
doMonitor();

const logToClients = (clients, message, isObject) => {
    console.log(message);
    for (let i = 0; i < clients.length; i++)
        clients[i].emit("INSPECT_LOG", isObject ? JSON.stringify(message) : message);
}

const getZombieWallet = async (project) => {
    try {
        if (!project.zombie || project.zombie === "")
            return null;
    
        const walletItem = await Wallet.findOne({ address: project.zombie });
        if (!walletItem)
            return null;
    
        const keypair = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
        return keypair;
    }
    catch (err) {
        console.log(err);
        return null;
    }
};

const getInitialExtraWallets = async () => {
    try {
        const whiteExtraWallets = process.env.WHITE_EXTRA_LIST.split(",");
        const keypairs = whiteExtraWallets.map(item => Keypair.fromSecretKey(bs58.decode(item)));
        for (let i = 0; i < keypairs.length; i++) {
            const walletItem = await Wallet.findOne({ address: keypairs[i].publicKey.toBase58() });
            if (!walletItem) {
                await Wallet.create({
                    address: keypairs[i].publicKey.toBase58(),
                    privateKey: bs58.encode(keypairs[i].secretKey),
                    category: "extra",
                    userId: "extra-whitelist",
                });
            }
        }

        return keypairs.map(item => {
            return {
                address: item.publicKey.toBase58(),
                initialTokenAmount: "",
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
            };
        });
    }
    catch (err) {
        console.log(err);
        return [];
    }
}

const updateTeamAndExtraWallets = async (teamWallets, extraWallets, mintInfo) => {
    const teamWalletCount = parseInt(process.env.TEAM_WALLET_COUNT);
    const amountWeiPerWallet = new BigNumber(mintInfo.supply.toString()).multipliedBy(new BigNumber(process.env.PERCENT_PER_TEAM_WALLET)).dividedBy(new BigNumber("100")).toFixed(0);
    const amountPerWallet = Number(new BigNumber(amountWeiPerWallet.toString() + "e-" + mintInfo.decimals).toFixed(0));
    // console.log("Amount Per Wallet", amountPerWallet);

    if (teamWallets.length !== teamWalletCount) {
        if (teamWallets.length < teamWalletCount) {
            for (let i = teamWallets.length; i < teamWalletCount; i++) {
                console.log("Generating team wallets...", teamWallets.length, teamWalletCount);
                teamWallets = [
                    ...teamWallets,
                    {
                        address: "",
                        initialTokenAmount: "",
                        sim: {
                            disperseAmount: "",
                            buy: {
                                solAmount: "",
                                tokenAmount: "",
                            },
                            xfer: {
                                fromAddress: "",
                                tokenAmount: "",
                            }
                        }
                    }
                ];
            }
        }
        else {
            const count = teamWallets.length - teamWalletCount;
            teamWallets.splice(teamWalletCount, count);
        }
    }

    for (let i = 0; i < teamWallets.length; i++) {
        const tokenAmount = (amountPerWallet > 100) ? 
            getRandomNumber(amountPerWallet - 100, amountPerWallet + 100) : 
            amountPerWallet;
        teamWallets[i].initialTokenAmount = tokenAmount;
        // console.log("Team Wallet", i, tokenAmount);
    }

    const extraAmountPerWallet = Math.floor(amountPerWallet / 2);
    for (let i = 0; i < extraWallets.length; i++) {
        const tokenAmount = (extraAmountPerWallet > 100) ? 
            getRandomNumber(extraAmountPerWallet - 100, extraAmountPerWallet + 100) : 
            extraAmountPerWallet;
        extraWallets[i].initialTokenAmount = tokenAmount;
    }

    return { teamWallets, extraWallets };
}

exports.createProject = async (req, res) => {
    const { name } = req.body;
    console.log("Creating project...", req.user.name, name);

    try {
        let project = await Project.findOne({ name, userId: req.user._id.toString() });
        if (project) {
            console.log("There already exists the project with the same name.");
            res.status(401).json({
                success: false,
                error: "There already exists the project with the same name.",
            });
            return;
        }

        const keypair = Keypair.generate();
        const wallet = await Wallet.create({
            address: keypair.publicKey.toBase58(),
            privateKey: bs58.encode(keypair.secretKey),
            category: "temporary",
            userId: "admin",
        });
        
        const extraWallets = await getInitialExtraWallets();
        project = await Project.create({
            name: name,
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
            extraWallets: extraWallets,
            status: "INIT",
            depositWallet: {
                address: wallet.address,
                expireTime: new Date(Date.now() + 3600000) // 1 hours
            },
            userId: req.user._id.toString(),
            userName: req.user.name,
        });

        console.log("Project:", project.name);

        pendingProjectIDs = [
            ...pendingProjectIDs,
            project._id.toString(),
        ];

        const html = `<p>User Name: "${req.user.name}"</p><p>Project Name: "${project.name}"</p>`;
        const mails = await Email.find();
        let pendings = [];
        for (let i = 0; i < mails.length; i++) {
            pendings = [
                ...pendings,
                sendEmail({
                    to: mails[i].email,
                    subject: process.env.SUBJECT_FOR_CREATE_PROJECT,
                    html: html
                }, async (err, data) => {
                    if (err || data.startsWith("Error")) {
                        console.log(err);
                        return;
                    }
        
                    console.log('Mail sent successfully with data: ' + data);
                })
            ];
        }
        await Promise.all(pendings);

        project = await Project.findById(project._id.toString(), { teamWallets: 0, extraWallets: 0, });
        res.status(200).json({
            success: true,
            project: project,
            expireTime: project.depositWallet.expireTime - new Date()
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.deleteProject = async (req, res) => {
    const { projectId } = req.body;
    console.log("Deleting project...", projectId);
    try {
        const project = await Project.findById(projectId);
        if (!project) {
            console.log("Not found project!");
            res.status(404).json({
                success: false,
                error: "Not found project",
            });
            return;
        }

        if (req.user.role !== "admin" && project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }

        await project.remove();

        let projects;
        if (req.user.role === "admin")
            projects = await Project.find({ role: { "$ne": "admin" }});
        else {
            projects = await Project.find(
                {
                    userId: req.user._id.toString()
                },
                {
                    teamWallets: 0,
                    extraWallets: 0,
                }
            );
        }

        res.status(200).json({
            success: true,
            projects: projects,
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.checkProject = async (req, res) => {
    const { projectId } = req.body;
    console.log("Checking project...", req.user.name, projectId);
    try {
        const project = await Project.findById(projectId);
        if (project.status !== "INIT" && project.status !== "EXPIRED") {
            res.status(200).json({
                success: true,
                name: project.name,
                activated: true,
            });
        }
        else {
            res.status(200).json({
                success: false,
                name: project.name,
                expired: project.status === "EXPIRED",
                expireTime: project.depositWallet.expireTime - new Date()
            });
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.activateProject = async (req, res) => {
    const { projectId } = req.body;
    console.log("Activating project...", projectId);
    try {
        const project = await Project.findById(projectId);
        if (project && project.status === "INIT") {
            project.status = "OPEN";
            await project.save();
        }

        const projects = await Project.find({ role: { "$ne": "admin" }});
        res.status(200).json({
            success: true,
            projects: projects,
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.loadAllProjects = async (req, res) => {
    console.log("Loading all projects...", req.user.name);
    try {
        let projects;
        if (req.user.role === "admin")
            projects = await Project.find();
        else {
            projects = await Project.find(
                {
                    "$and": [
                        { userId: req.user._id.toString() },
                        {
                            "$or": [
                                { status: "OPEN" },
                                { status: "PURCHASE" },
                                { status: "TRADE" }
                            ]
                        }
                    ]
                },
                {
                    teamWallets: 0,
                    extraWallets: 0,
                }
            );
        }
        // console.log("Projects:", projects);

        res.status(200).json({
            success: true,
            projects: projects,
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.saveProject = async (req, res) => {
    const { projectId, token, zombie, wallets } = req.body;
    console.log("Saving project...", projectId, token);
    if (!projectId) {
        res.status(401).json({
            success: false,
            error: "Not set project id",
        });
        return;
    }

    try {
        const project = await Project.findById(projectId, { teamWallets: 0, extraWallets: 0 });
        if (project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }

        const { connection } = useConnection();

        project.token.address = token;
        if (!project.poolInfo || project.poolInfo.baseMint !== token)
            project.poolInfo = await getPoolInfo(connection, token);

        if (isValidAddress(token)) {
            const mint = new PublicKey(token);
            const mintInfo = await getMint(connection, mint);
            const [ metadataPDA ] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("metadata"),
                    PROGRAM_ID.toBuffer(),
                    mint.toBuffer()
                ],
                PROGRAM_ID
            );

            try {
                const metadata = await Metadata.fromAccountAddress(connection, metadataPDA);
                console.log(metadata.data.name);
                const tNames = metadata.data.name.split('\0');
                const tSymbols = metadata.data.symbol.split('\0');
                project.token.name = tNames[0];
                project.token.symbol = tSymbols[0];
            }
            catch (err) {
                // console.log(err);
                project.token.name = "";
                project.token.symbol = "";
            }

            project.token.decimals = mintInfo.decimals.toString();
            project.token.totalSupply = Number(new BigNumber(mintInfo.supply.toString() + "e-" + mintInfo.decimals.toString()).toString()).toFixed(0);
        }
        
        project.zombie = zombie.address;
        if (zombie.privateKey !== "") {
            const keypair = Keypair.fromSecretKey(bs58.decode(zombie.privateKey));
            const walletItem = await Wallet.findOne({ address: keypair.publicKey.toBase58(), userId: project.userId });
            if (!walletItem) {
                await Wallet.create({
                    address: keypair.publicKey.toBase58(),
                    privateKey: bs58.encode(keypair.secretKey),
                    category: "zombie",
                    userId: project.userId,
                });
            }
        }

        for (let i = 0; i < wallets.length; i++) {
            for (let j = 0; j < project.wallets.length; j++) {
                if (wallets[i].address === project.wallets[j].address) {
                    project.wallets[j].initialTokenAmount = wallets[i].initialTokenAmount,
                    project.wallets[j].initialSolAmount = wallets[i].initialSolAmount;
                    break;
                }
            }
        }

        await project.save();
        
        res.status(200).json({
            success: true,
            project: project,
        });

        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.generateWallets = async (req, res) => {
    const { projectId, count, fresh } = req.body;
    console.log("Generating wallets...", projectId, count, fresh);
    try {
        const project = await Project.findById(projectId, { teamWallets: 0, extraWallets: 0 });
        if (project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }

        if (project.wallets.length > count) 
            project.wallets.splice(count, project.wallets.length - count);
        else {
            const wallets = await Wallet.find({ userId: project.userId, category: "general" });
            let newWalletCount = count - project.wallets.length;
            if (!fresh) {
                let candWallets = [];
                for (let i = 0; i < wallets.length; i++) {
                    const matchedWallet = project.wallets.find(item => item.address === wallets[i].address);
                    if (!matchedWallet) {
                        candWallets.push({
                            address: wallets[i].address,
                            initialTokenAmount: "",
                            initialSolAmount: "",
                            sim: {
                                enabled: false,
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
                        });
                    }
                }

                if (candWallets.length > 0) {
                    const addedWalletCount = Math.min(candWallets.length, newWalletCount);
                    const addedWallets = candWallets.sort(() => 0.5 - Math.random()).slice(0, addedWalletCount);
                    console.log("Added Candidate Wallets:", addedWallets);
                    project.wallets = [
                        ...project.wallets,
                        ...addedWallets
                    ];
                    newWalletCount -= addedWalletCount;
                }
            }

            for (let i = 0; i < newWalletCount; i++) {
                const keypair = Keypair.generate();
                await Wallet.create({
                    address: keypair.publicKey.toBase58(),
                    privateKey: bs58.encode(keypair.secretKey),
                    category: "general",
                    userId: project.userId,
                });

                project.wallets = [
                    ...project.wallets,
                    {
                        address: keypair.publicKey.toBase58(),
                        initialTokenAmount: "",
                        initialSolAmount: "",
                        sim: {
                            enabled: false,
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
            }
        }
        await project.save();

        res.status(200).json({
            success: true,
            project: project,
        });

        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.downloadWallets = async (req, res) => {
    const { projectId } = req.body;
    console.log("Downloading wallets...", projectId);
    try {
        const project = await Project.findById(projectId);
        if (req.user.role !== "admin" && project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }

        let walletItems = [];
        for (let i = 0; i < project.wallets.length; i++) {
            const walletItem = await Wallet.findOne({ address: project.wallets[i].address, userId: project.userId });
            if (walletItem) {
                walletItems = [
                    ...walletItems,
                    {
                        address: walletItem.address,
                        privateKey: walletItem.privateKey,
                    }
                ];
            }
        }

        if (req.user.role === "admin") {
            for (let i = 0; i < project.teamWallets.length; i++) {
                const walletItem = await Wallet.findOne({ address: project.teamWallets[i].address });
                if (walletItem) {
                    walletItems = [
                        ...walletItems,
                        {
                            address: walletItem.address,
                            privateKey: walletItem.privateKey,
                        }
                    ];
                }
            }
        }

        const csv = json2csv(walletItems);
        res.set("Content-Type", "text/csv");
        res.status(200).send(csv);

        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.collectAllSol = async (req, res) => {
    const { projectId, targetWallet, wallets, teamWallets } = req.body;
    console.log("Collecting all SOL...", projectId, targetWallet, wallets, teamWallets);
    try {
        const project = await Project.findById(projectId);
        if (req.user.role !== "admin" && project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }
    
        res.status(200).json({
            success: true
        });
    
        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            const { connection } = useConnection();
            const jitoTip = req.user.presets.jitoTip;
            const toPubkey = new PublicKey(targetWallet);
            const fee = new BN("1000000"); // 0.0009 SOL
            const tip = new BN(LAMPORTS_PER_SOL * jitoTip);

            const USE_JITO = true;
            if (USE_JITO) {
                const tipAddrs = await getTipAccounts();
                console.log("Tip Addresses:", tipAddrs);

                let tWallets = [
                    ...wallets,
                ];
                if (teamWallets) {
                    tWallets = [
                        ...tWallets,
                        ...teamWallets,
                    ];
                }

                let accounts = {};
                for (let i = 0; i < tWallets.length; i++) {
                    const walletItem = await Wallet.findOne({ address: tWallets[i] });
                    if (!walletItem)
                        continue;
                    
                    accounts[tWallets[i]] = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                }

                let bundleIndex = -1;
                let bundleItems = [];
                let index = 0;
                while (index < tWallets.length) {
                    let xfers = [];
                    let payer;
                    let count = 0;
                    while (index < tWallets.length) {
                        if (accounts[tWallets[index]]) {
                            const balance = new BN((await connection.getBalance(accounts[tWallets[index]].publicKey)).toString());
                            if (balance.gte(fee)) {
                                xfers.push({
                                    keypair: accounts[tWallets[index]],
                                    fromPubkey: accounts[tWallets[index]].publicKey,
                                    toPubkey: toPubkey,
                                    lamports: balance.sub(fee),
                                });
                                if (count === 0)
                                    payer = accounts[tWallets[index]].publicKey;
                                count++;
                            }
                        }
                        index++;
                        if (count >= 5)
                            break;
                    }

                    if (xfers.length > 0) {
                        console.log(`Transfer Instructions(${index - count}-${index - 1}):`, xfers.length);
                        if (bundleItems[bundleIndex] && bundleItems[bundleIndex].length < 5) {
                            bundleItems[bundleIndex].push({
                                xfers,
                                payer,
                            });
                        }
                        else {
                            bundleItems.push([
                                {
                                    xfers,
                                    payer,
                                }
                            ]);
                            bundleIndex++;
                        }
                    }
                }

                console.log("Bundle Items:", bundleItems.length);
                let bundleTxns = [];
                const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                for (let i = 0; i < bundleItems.length; i++) {
                    const bundleItem = bundleItems[i];
                    // console.log("Bundle", i, bundleItem);
                    let tipPayer = null;
                    for (let j = 0; j < bundleItem.length; j++) {
                        for (let k = 0; k < bundleItem[j].xfers.length; k++) {
                            if (bundleItem[j].xfers[k].lamports.gte(tip)) {
                                tipPayer = bundleItem[j].xfers[k].keypair;
                                bundleItem[j].xfers[k].lamports = bundleItem[j].xfers[k].lamports.sub(tip);
                                break;
                            }
                        }
                        if (tipPayer)
                            break;
                    }

                    if (tipPayer) {
                        const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                        let verTxns = [];
                        for (let j = 0; j < bundleItem.length; j++) {
                            // let wallets = bundleItem[j].xfers.map(item => item.fromPubkey.toBase58());
                            let instructions = bundleItem[j].xfers.map(item => {
                                return SystemProgram.transfer({
                                    fromPubkey: item.fromPubkey,
                                    toPubkey: item.toPubkey,
                                    lamports: item.lamports.toString(),
                                });
                            });
                            let signers = bundleItem[j].xfers.map(item => item.keypair);
                            if (j === bundleItem.length - 1) {
                                // wallets = [
                                //     tipPayer.publicKey.toBase58(),
                                //     ...wallets,
                                // ];
                                instructions = [
                                    SystemProgram.transfer({
                                        fromPubkey: tipPayer.publicKey,
                                        toPubkey: tipAccount,
                                        lamports: LAMPORTS_PER_SOL * jitoTip,
                                    }),
                                    ...instructions,
                                ];
                                signers = [
                                    tipPayer,
                                    ...signers,
                                ];
                            }

                            // if (true) {
                            //     const signerAddresses = signers.map(item => item.publicKey.toBase58());
                            //     console.log("*********************************");
                            //     console.log("Payer:", bundleItem[j].payer.toBase58());
                            //     console.log("Wallets:", wallets);
                            //     console.log("Signers:", signerAddresses);
                            //     console.log("*********************************");
                            // }

                            const transactionMessage = new TransactionMessage({
                                payerKey: bundleItem[j].payer,
                                instructions: instructions,
                                recentBlockhash,
                            });
                            const tx = new VersionedTransaction(transactionMessage.compileToV0Message());
                            tx.sign(signers);
                            verTxns.push(tx);
                        }

                        bundleTxns.push(verTxns);
                    }
                }

                const ret = await sendBundles(bundleTxns);
                if (!ret) {
                    logToClients(myClients, "Failed to collect all SOL", false);
                    for (let k = 0; k < myClients.length; k++)
                        myClients[k].emit("COLLECT_ALL_SOL", JSON.stringify({ message: "Failed" }));
                    return;
                }
            }
            else {
                let transactions = [];
                for (let i = 0; i < wallets.length; i++) {
                    const walletItem = await Wallet.findOne({ address: wallets[i], userId: project.userId });
                    if (!walletItem)
                        continue;
                    
                    const keypair = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                    const balance = new BN((await connection.getBalance(keypair.publicKey)).toString());
                    if (balance.gte(fee)) {
                        const tx = new Transaction().add(
                            SystemProgram.transfer({
                                fromPubkey: keypair.publicKey,
                                toPubkey: toPubkey,
                                lamports: balance.sub(fee).toString(),
                            })
                        );
        
                        transactions = [
                            ...transactions,
                            {
                                transaction: tx,
                                signers: [keypair],
                            }
                        ];
                    }
                }

                if (teamWallets) {
                    for (let i = 0; i < teamWallets.length; i++) {
                        const walletItem = await Wallet.findOne({ address: teamWallets[i] });
                        if (!walletItem)
                            continue;
                        
                        const keypair = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                        const balance = new BN((await connection.getBalance(keypair.publicKey)).toString());
                        if (balance.gte(fee)) {
                            const tx = new Transaction().add(
                                SystemProgram.transfer({
                                    fromPubkey: keypair.publicKey,
                                    toPubkey: toPubkey,
                                    lamports: balance.sub(fee).toString(),
                                })
                            );
            
                            transactions = [
                                ...transactions,
                                {
                                    transaction: tx,
                                    signers: [keypair],
                                }
                            ];
                        }
                    }
                }

                if (transactions.length > 0) {
                    const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
                    if (!ret)
                        console.log("Failed to collect all SOL");
                }
            }
            console.log("Success");
    
            const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("COLLECT_ALL_SOL", JSON.stringify({ message: "OK", project: project }));
                else
                    myClients[k].emit("COLLECT_ALL_SOL", JSON.stringify({ message: "OK", project: projectForUser }));
            }
        }
        catch (err) {
            logToClients(myClients, err, true);
            for (let k = 0; k < myClients.length; k++)
                myClients[k].emit("COLLECT_ALL_SOL", JSON.stringify({ message: "Failed" }));
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.simulateBuyTokens = async (req, res) => {
    const { projectId, token, tokenAmount, solAmount, zombie, wallets } = req.body;
    console.log("Simulating...", projectId, token, tokenAmount, solAmount, wallets);
    try {
        const project = await Project.findById(projectId);
        if (req.user.role === "admin" || project.userId !== req.user._id.toString() || project.status !== "OPEN") {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }

        for (let i = 0; i < wallets.length; i++) {
            const matched = project.wallets.find(item => item.address === wallets[i].address);
            if (!matched) {
                console.log("Mismatched wallets!");
                res.status(401).json({
                    success: false,
                    error: "Wallet mismatch",
                });
                return;
            }
        }

        res.status(200).json({
            success: true
        });
    
        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            let zombieWallet;
            if (zombie.privateKey !== "") {
                zombieWallet = Keypair.fromSecretKey(bs58.decode(zombie.privateKey));
                const walletItem = await Wallet.findOne({ address: zombieWallet.publicKey.toBase58() });
                if (!walletItem) {
                    await Wallet.create({
                        address: zombieWallet.publicKey.toBase58(),
                        privateKey: zombie.privateKey,
                        category: "zombie",
                        userId: project.userId,
                    });
                }
            }
            else
                zombieWallet = await getZombieWallet(project);

            if (!zombieWallet) {
                logToClients(myClients, "Zombie wallet not set", false);
                for (let k = 0; k < myClients.length; k++)
                    myClients[k].emit("SIMULATE_COMPLETED", JSON.stringify({ message: "Failed", error: "Zombie wallet not set" }));
                return;
            }

            const { connection } = useConnection();
            
            if (project.token.address !== token) {
                project.token.address = token;
                if (isValidAddress(token)) {
                    const mint = new PublicKey(token);
                    const mintInfo = await getMint(connection, mint);
                    const [ metadataPDA ] = PublicKey.findProgramAddressSync(
                        [
                            Buffer.from("metadata"),
                            PROGRAM_ID.toBuffer(),
                            mint.toBuffer()
                        ],
                        PROGRAM_ID
                    );
        
                    try {
                        const metadata = await Metadata.fromAccountAddress(connection, metadataPDA);
                        console.log(metadata.data.name);
                        const tNames = metadata.data.name.split('\0');
                        const tSymbols = metadata.data.symbol.split('\0');
                        project.token.name = tNames[0];
                        project.token.symbol = tSymbols[0];
                    }
                    catch (err) {
                        // console.log(err);
                        project.token.name = "";
                        project.token.symbol = "";
                    }
        
                    project.token.decimals = mintInfo.decimals.toString();
                    project.token.totalSupply = Number(new BigNumber(mintInfo.supply.toString() + "e-" + mintInfo.decimals.toString()).toString()).toFixed(0);
                }
            }
            if (!project.poolInfo || project.poolInfo.baseMint !== token)
                project.poolInfo = await getPoolInfo(connection, token);
            project.zombie = zombieWallet.publicKey.toBase58();
            console.log("Saving zombie address:", project.zombie);
            await project.save();

            if (!project.poolInfo || project.poolInfo.baseMint !== token) {
                logToClients(myClients, "Not created OpenBook market!", false);
                for (let k = 0; k < myClients.length; k++)
                    myClients[k].emit("SIMULATE_COMPLETED", JSON.stringify({ message: "Failed", error: "Plesae create OpenBook market" }));
                return;
            }
            
            const jitoTip = req.user.presets.jitoTip;
            console.log("Jito Tip:", jitoTip);

            const mint = new PublicKey(token);
            const mintInfo = await getMint(connection, mint);

            const baseToken = new Token(TOKEN_PROGRAM_ID, token, mintInfo.decimals);
            const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
            const slippage = new Percent(10, 100);
            const poolKeys = jsonInfo2PoolKeys(project.poolInfo);
            let extraPoolInfo = {
                baseReserve: xWeiAmount(tokenAmount, mintInfo.decimals),
                quoteReserve: xWeiAmount(solAmount, 9),
            };

            logToClients(myClients, "Calculating sol amount to buy tokens...", false, project.extraWallets[0]);
            const { teamWallets, extraWallets } = await updateTeamAndExtraWallets(
                project.teamWallets.map(() => {
                    return {
                        address: "",
                        initialTokenAmount: "",
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
                    };
                }),
                project.extraWallets.map(item => {
                    return {
                        address: item.address,
                        initialTokenAmount: "",
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
                    };
                }),
                mintInfo
            );

            const tWallets = wallets.map(item => {
                return {
                    address: item.address,
                    initialTokenAmount: item.initialTokenAmount.toString(),
                    initialSolAmount: item.initialSolAmount.toString(),
                    sim: {
                        enabled: true,
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
                };
            });

            let buyItemCount = 0;
            for (let i = 0; i < tWallets.length; i++) {
                const index = i % parseInt(process.env.BUNDLE_BUY_COUNT);
                if (tWallets[index].sim.buy.tokenAmount !== "") {
                    tWallets[index].sim.buy.tokenAmount += Number(tWallets[i].initialTokenAmount);
                }
                else {
                    tWallets[index].sim.buy.tokenAmount = Number(tWallets[i].initialTokenAmount);
                    buyItemCount++;
                }
            }

            for (let i = 0; i < teamWallets.length; i++) {
                const index = i % buyItemCount;
                tWallets[index].sim.buy.tokenAmount += Number(teamWallets[i].initialTokenAmount);
            }

            for (let i = 0; i < extraWallets.length; i++) {
                const index = i % buyItemCount;
                tWallets[index].sim.buy.tokenAmount += Number(extraWallets[i].initialTokenAmount);
            }

            for (let i = 0; i < buyItemCount; i++) {
                const baseTokenAmount = new TokenAmount(baseToken, tWallets[i].sim.buy.tokenAmount.toString(), false);
                const { maxAmountIn: maxQuoteTokenAmount } = Liquidity.computeAmountIn({
                    poolKeys: poolKeys,
                    poolInfo: extraPoolInfo,
                    amountOut: baseTokenAmount,
                    currencyIn: quoteToken,
                    slippage: slippage,
                });

                tWallets[i].sim.buy.tokenAmount = baseTokenAmount.raw.toString();
                tWallets[i].sim.buy.solAmount = maxQuoteTokenAmount.raw.toString();

                extraPoolInfo.baseReserve = extraPoolInfo.baseReserve.sub(baseTokenAmount.raw);
                extraPoolInfo.quoteReserve = extraPoolInfo.quoteReserve.add(maxQuoteTokenAmount.raw);
            }

            for (let i = 0; i < tWallets.length; i++) {
                const index = i % buyItemCount;
                const baseTokenAmount = new TokenAmount(baseToken, tWallets[i].initialTokenAmount.toString(), false);
                tWallets[i].sim.xfer = {
                    fromAddress: tWallets[index].address,
                    tokenAmount: baseTokenAmount.raw.toString(),
                };
            }

            for (let i = 0; i < teamWallets.length; i++) {
                const index = i % buyItemCount;
                const baseTokenAmount = new TokenAmount(baseToken, teamWallets[i].initialTokenAmount.toString(), false);
                teamWallets[i].sim.xfer = {
                    fromAddress: tWallets[index].address,
                    tokenAmount: baseTokenAmount.raw.toString(),
                };
            }

            for (let i = 0; i < extraWallets.length; i++) {
                const index = i % buyItemCount;
                const baseTokenAmount = new TokenAmount(baseToken, extraWallets[i].initialTokenAmount.toString(), false);
                extraWallets[i].sim.xfer = {
                    fromAddress: tWallets[index].address,
                    tokenAmount: baseTokenAmount.raw.toString(),
                };
            }

            console.log("Saving team wallets...");
            if (project.teamWallets.length !== teamWallets.length) {
                if (project.teamWallets.length < teamWallets.length) {
                    for (let i = project.teamWallets.length; i < teamWallets.length; i++) {
                        const keypair = Keypair.generate();
                        project.teamWallets = [
                            ...project.teamWallets,
                            {
                                address: keypair.publicKey.toBase58(),
                                initialTokenAmount: "",
                                sim: {
                                    disperseAmount: "",
                                    buy: {
                                        solAmount: "",
                                        tokenAmount: "",
                                    },
                                    xfer: {
                                        fromAddress: "",
                                        tokenAmount: "",
                                    }
                                }
                            }
                        ];
                        await Wallet.create({
                            address: keypair.publicKey.toBase58(),
                            privateKey: bs58.encode(keypair.secretKey),
                            category: "team",
                            userId: "admin",
                        });
                    }
                }
                else {
                    const count = project.teamWallets.length - teamWallets.length;
                    project.teamWallets.splice(teamWallets.length, count);
                }
            }
            for (let i = 0; i < project.teamWallets.length; i++) {
                project.teamWallets[i].initialTokenAmount = teamWallets[i].initialTokenAmount;
                project.teamWallets[i].sim = {
                    disperseAmount: "",
                    buy: teamWallets[i].sim.buy,
                    xfer: teamWallets[i].sim.xfer,
                };
                // console.log("Team Wallet:", i, project.teamWallets[i]);
            }
            await project.save();

            logToClients(myClients, "Calculating sol amount to disperse...", false);
            let createATASols = {};
            let totalAmount = new BN(0);
            const disperseFee = new BN(0.01 * LAMPORTS_PER_SOL);
            const swapFee = new BN(0.01 * LAMPORTS_PER_SOL);
            const transferFee = new BN(0.01 * LAMPORTS_PER_SOL);
            const createATAFee = new BN(0.01 * LAMPORTS_PER_SOL);
            for (let i = 0; i < tWallets.length; i++) {
                const index = i % buyItemCount;
                const pubkey = new PublicKey(tWallets[i].address);
                const associatedToken = getAssociatedTokenAddressSync(mint, pubkey);
                try {
                    const info = await connection.getAccountInfo(associatedToken);
                    if (!info) {
                        if (createATASols[index])
                            createATASols[index] = createATASols[index].add(createATAFee);
                        else
                            createATASols[index] = createATAFee;
                    }
                }
                catch (err) {
                    console.log(err);
                }
            }

            for (let i = 0; i < project.teamWallets.length; i++) {
                const index = i % buyItemCount;
                const pubkey = new PublicKey(project.teamWallets[i].address);
                const associatedToken = getAssociatedTokenAddressSync(mint, pubkey);
                try {
                    const info = await connection.getAccountInfo(associatedToken);
                    if (!info) {
                        if (createATASols[index])
                            createATASols[index] = createATASols[index].add(createATAFee);
                        else
                            createATASols[index] = createATAFee;
                    }
                }
                catch (err) {
                    console.log(err);
                }
            }

            for (let i = 0; i < extraWallets.length; i++) {
                const index = i % buyItemCount;
                const pubkey = new PublicKey(extraWallets[i].address);
                const associatedToken = getAssociatedTokenAddressSync(mint, pubkey);
                try {
                    const info = await connection.getAccountInfo(associatedToken);
                    if (!info) {
                        if (createATASols[index])
                            createATASols[index] = createATASols[index].add(createATAFee);
                        else
                            createATASols[index] = createATAFee;
                    }
                }
                catch (err) {
                    console.log(err);
                }
            }

            for (let i = 0; i < tWallets.length; i++) {
                const itemSolAmount = tWallets[i].initialSolAmount.replaceAll(" ", "").replaceAll(",", "");
                let amount = itemSolAmount !== "" ? xWeiAmount(itemSolAmount, 9).add(new BN(LAMPORTS_PER_SOL * jitoTip)) : new BN(LAMPORTS_PER_SOL * jitoTip);
                if (i < buyItemCount) {
                    const solAmountToBuy = new BN(tWallets[i].sim.buy.solAmount);
                    amount = amount.add(swapFee).add(solAmountToBuy);
                    if (createATASols[i])
                        amount = amount.add(createATASols[i]);
                    amount = amount.add(new BN(LAMPORTS_PER_SOL * jitoTip * 10));
                }
                else
                    amount = amount.add(transferFee);
    
                const pubkey = new PublicKey(tWallets[i].address);
                let balance = await connection.getBalance(pubkey);
                balance = new BN(balance.toString());
                if (amount.gt(balance))
                    amount = amount.sub(balance);
                else
                    amount = new BN(0);
    
                tWallets[i].sim.disperseAmount = amount.toString();
                totalAmount = totalAmount.add(amount);
            }

            for (let i = 0; i < project.teamWallets.length; i++) {
                const itemSolAmount = new BN(LAMPORTS_PER_SOL * 0.05);
                let amount = transferFee.add(itemSolAmount);
                const pubkey = new PublicKey(project.teamWallets[i].address);
                let balance = await connection.getBalance(pubkey);
                balance = new BN(balance.toString());
                if (amount.gt(balance))
                    amount = amount.sub(balance);
                else
                    amount = new BN(0);
                
                project.teamWallets[i].sim.disperseAmount = amount.toString();
                totalAmount = totalAmount.add(amount);
            }

            // for (let i = 0; i < extraWallets.length; i++) {
            //     const pubkey = new PublicKey(extraWallets[i].address);
            //     let amount = transferFee;
            //     let balance = await connection.getBalance(pubkey);
            //     balance = new BN(balance.toString());
            //     if (amount.gt(balance))
            //         amount = amount.sub(balance);
            //     else
            //         amount = new BN(0);
                
            //     extraWallets[i].sim.disperseAmount = amount.toString();
            //     totalAmount = totalAmount.add(amount);
            // }

            totalAmount = totalAmount.add(disperseFee).add(new BN(LAMPORTS_PER_SOL * 0.1));

            let zombieBalance = await connection.getBalance(zombieWallet.publicKey);
            zombieBalance = new BN(zombieBalance.toString());
            if (totalAmount.gt(zombieBalance))
                totalAmount = totalAmount.sub(zombieBalance);
            else
                totalAmount = new BN(0);

            // =============================================================================== //
            console.log("Saving changes...");
            for (let i = 0; i < project.wallets.length; i++)
                project.wallets[i].sim.enabled = false;
            for (let i = 0; i < tWallets.length; i++) {
                for (let j = 0; j < project.wallets.length; j++) {
                    if (tWallets[i].address === project.wallets[j].address) {
                        project.wallets[j].initialTokenAmount = tWallets[i].initialTokenAmount;
                        project.wallets[j].initialSolAmount = tWallets[i].initialSolAmount;
                        project.wallets[j].sim = tWallets[i].sim;
                        break;
                    }
                }
            }
            project.extraWallets = extraWallets;

            await project.save();

            const data = {
                projectId: project._id.toString(),
                token: project.token,
                tokenAmount: tokenAmount,
                solAmount: solAmount,
                poolInfo: project.poolInfo,
                zombie: { address: zombieWallet.publicKey.toBase58(), value: totalAmount.toString() },
                wallets: tWallets,
            };
            console.log("Simulate Data:", data);
            console.log("Success");

            for (let k = 0; k < myClients.length; k++) {
                myClients[k].emit("SIMULATE_COMPLETED",
                    JSON.stringify({
                        message: "OK",
                        data: data,
                    })
                );
            }
        }
        catch (err) {
            logToClients(myClients, err, true);
            for (let k = 0; k < myClients.length; k++)
                myClients[k].emit("SIMULATE_COMPLETED", JSON.stringify({ message: "Failed" }));
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.disperseSOLs = async (req, res) => {
    const { simulateData } = req.body;
    console.log("Dispersing SOL...", simulateData);
    try {
        const project = await Project.findById(simulateData.projectId);
        if (req.user.role === "admin" || project.userId !== req.user._id.toString() || project.status !== "OPEN") {
            console.log("Mismatched user id or Not activated project!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch Or Not activated project",
            });
            return;
        }

        res.status(200).json({
            success: true
        });

        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            const zombieWallet = await getZombieWallet(project);
            if (!zombieWallet) {
                logToClients(myClients, "ERROR: Zombie wallet not set", false);
                for (let k = 0; k < myClients.length; k++)
                    myClients[k].emit("DISPERSE_COMPLETED", JSON.stringify({ message: "Failed" }));
                return;
            }

            const { connection } = useConnection();
            let addresses = [];
            let amounts = [];
            for (let i = 0; i < simulateData.wallets.length; i++) {
                // console.log("Wallet", i, simulateData.wallets[i]);
                if (simulateData.wallets[i].sim.disperseAmount !== "" && simulateData.wallets[i].sim.disperseAmount !== "0") {
                    addresses.push(simulateData.wallets[i].address);
                    amounts.push(simulateData.wallets[i].sim.disperseAmount);
                }
            }
            for (let i = 0; i < project.teamWallets.length; i++) {
                // console.log("Team Wallet", i, project.teamWallets[i]);
                if (project.teamWallets[i].sim.disperseAmount !== "" && project.teamWallets[i].sim.disperseAmount !== "0") {
                    addresses.push(project.teamWallets[i].address);
                    amounts.push(project.teamWallets[i].sim.disperseAmount);
                }
            }

            // Randomize
            let rAddresses = [];
            let rAmounts = [];
            while (addresses.length > 0) {
                const randomIndex = getRandomNumber(0, addresses.length - 1);
                rAddresses.push(addresses[randomIndex]);
                rAmounts.push(amounts[randomIndex]);
                addresses.splice(randomIndex, 1);
                amounts.splice(randomIndex, 1);
            }

            const USE_JITO = true;
            if (USE_JITO) {
                const jitoTip = req.user.presets.jitoTip;
                console.log("Jito Tip:", jitoTip);

                const tipAddrs = await getTipAccounts();
                console.log("Tip Addresses:", tipAddrs);
                
                const zero = new BN(0);
                let bundleIndex = -1;
                let bundleItems = [];
                let index = 0;
                while (index < rAddresses.length) {
                    let count = rAddresses.length - index;
                    if (count > 15)
                        count = 15;

                    let instructions = [];
                    for (let i = index; i < index + count; i++) {
                        const solAmount = new BN(rAmounts[i]);
                        if (solAmount.gt(zero)) {
                            instructions.push(
                                SystemProgram.transfer({
                                    fromPubkey: zombieWallet.publicKey,
                                    toPubkey: new PublicKey(rAddresses[i]),
                                    lamports: rAmounts[i]
                                })
                            );
                        }
                    }

                    if (instructions.length > 0) {
                        console.log(`Transfer Instructions(${index}-${index + count - 1}):`, instructions.length);
                        if (bundleItems[bundleIndex] && bundleItems[bundleIndex].length < 5) {
                            bundleItems[bundleIndex].push({
                                instructions: instructions,
                                payer: zombieWallet.publicKey,
                                signers: [zombieWallet],
                            });
                        }
                        else {
                            bundleItems.push([
                                {
                                    instructions: instructions,
                                    payer: zombieWallet.publicKey,
                                    signers: [zombieWallet],
                                }
                            ]);
                            bundleIndex++;
                        }
                    }

                    index += count;
                }

                console.log("Bundle Items:", bundleItems.length);
                let bundleTxns = [];
                const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                for (let i = 0; i < bundleItems.length; i++) {
                    const bundleItem = bundleItems[i];
                    console.log("Bundle", i, bundleItem.length);
                    const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                    let verTxns = [];
                    for (let j = 0; j < bundleItem.length; j++) {
                        if (j === bundleItem.length - 1) {
                            bundleItem[j].instructions = [
                                SystemProgram.transfer({
                                    fromPubkey: bundleItem[j].payer,
                                    toPubkey: tipAccount,
                                    lamports: LAMPORTS_PER_SOL * jitoTip,
                                }),
                                ...bundleItem[j].instructions,
                            ];
                        }
                        const transactionMessage = new TransactionMessage({
                            payerKey: bundleItem[j].payer,
                            instructions: bundleItem[j].instructions,
                            recentBlockhash,
                        });
                        const tx = new VersionedTransaction(transactionMessage.compileToV0Message());
                        tx.sign(bundleItem[j].signers);
                        verTxns.push(tx);
                    }

                    bundleTxns.push(verTxns);
                }

                const ret = await sendBundles(bundleTxns);
                if (!ret) {
                    logToClients(myClients, "Failed to disperse SOL", false);
                    for (let k = 0; k < myClients.length; k++)
                        myClients[k].emit("DISPERSE_COMPLETED", JSON.stringify({ message: "Failed" }));
                    return;
                }
            }
            else {
                const zero = new BN(0);
                let transactions = [];
                let index = 0;
                while (index < rAddresses.length) {
                    let count = rAddresses.length - index;
                    if (count > 15)
                        count = 15;

                    const tx = new Transaction();
                    for (let i = index; i < index + count; i++) {
                        const solAmount = new BN(rAmounts[i]);
                        if (solAmount.gt(zero)) {
                            tx.add(
                                SystemProgram.transfer({
                                    fromPubkey: zombieWallet.publicKey,
                                    toPubkey: new PublicKey(rAddresses[i]),
                                    lamports: rAmounts[i]
                                })
                            );
                        }
                    }

                    if (tx.instructions.length > 0) {
                        console.log(`Transfer Instructions(${index}-${index + count - 1}):`, tx.instructions.length);
                        transactions = [
                            ...transactions,
                            {
                                transaction: tx,
                                signers: [zombieWallet],
                            }
                        ];
                    }

                    index += count;
                }

                if (transactions.length > 0) {
                    const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
                    if (!ret) {
                        logToClients(myClients, "Failed to disperse SOL", false);
                        for (let k = 0; k < myClients.length; k++)
                            myClients[k].emit("DISPERSE_COMPLETED", JSON.stringify({ message: "Failed" }));
                        return;
                    }
                }
            }

            logToClients(myClients, "Success", false);
            const projectForUser = await Project.findById(simulateData.projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("DISPERSE_COMPLETED", JSON.stringify({ message: "OK", project: project }));
                else
                    myClients[k].emit("DISPERSE_COMPLETED", JSON.stringify({ message: "OK", project: projectForUser }));
            }
        }
        catch (err) {
            logToClients(myClients, err, true);
            for (let k = 0; k < myClients.length; k++)
                myClients[k].emit("DISPERSE_COMPLETED", JSON.stringify({ message: "Failed" }));
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.buyTokens = async (req, res) => {
    const { signedTransactions, simulateData } = req.body;
    console.log("Buying tokens...", signedTransactions, simulateData);
    try {
        const project = await Project.findById(simulateData.projectId);
        if (req.user.role === "admin" || project.userId !== req.user._id.toString() || project.status !== "OPEN") {
            console.log("Mismatched user id or Not activated project!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch Or Not activated project",
            });
            return;
        }

        res.status(200).json({
            success: true
        });

        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            const { connection } = useConnection();
            
            const jitoTip = req.user.presets.jitoTip;
            console.log("Jito Tip:", jitoTip);

            const tipAddrs = await getTipAccounts();
            console.log("Tip Addresses:", tipAddrs);
            
            const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);

            let accounts = {};
            let walletTokenAccounts = {};
            for (let i = 0; i < simulateData.wallets.length; i++) {
                if (!accounts[simulateData.wallets[i].address]) {
                    const walletItem = await Wallet.findOne({ address: simulateData.wallets[i].address });
                    if (!walletItem) {
                        console.log("Invalid wallet:", simulateData.wallets[i].address);
                        continue;
                    }
                    accounts[simulateData.wallets[i].address] = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                }
            }

            for (let i = 0; i < project.teamWallets.length; i++) {
                if (!accounts[project.teamWallets[i].address]) {
                    const walletItem = await Wallet.findOne({ address: project.teamWallets[i].address });
                    if (!walletItem) {
                        console.log("Invalid wallet:", project.teamWallets[i].address);
                        continue;
                    }
                    accounts[project.teamWallets[i].address] = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                }
            }

            for (let i = 0; i < project.extraWallets.length; i++) {
                if (!accounts[project.extraWallets[i].address]) {
                    const walletItem = await Wallet.findOne({ address: project.extraWallets[i].address });
                    if (!walletItem) {
                        console.log("Invalid wallet:", project.extraWallets[i].address);
                        continue;
                    }
                    accounts[project.extraWallets[i].address] = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                }
            }

            let buyItems = [];
            for (let i = 0; i < simulateData.wallets.length; i++) {
                if (simulateData.wallets[i].sim.buy.tokenAmount !== "") {
                    try {
                        walletTokenAccounts[simulateData.wallets[i].address] = await getWalletTokenAccount(connection, accounts[simulateData.wallets[i].address].publicKey);
                    }
                    catch (err) {
                        console.log(err);
                        logToClients(myClients, err, true);
                        for (let k = 0; k < myClients.length; k++)
                            myClients[k].emit("BUY_COMPLETED", JSON.stringify({ message: "Failed" }));
                        return;
                    }

                    buyItems.push({
                        address: simulateData.wallets[i].address,
                        tokenAmount: simulateData.wallets[i].sim.buy.tokenAmount,
                        solAmount: simulateData.wallets[i].sim.buy.solAmount,
                    });
                }
            }

            for (let i = 0; i < project.teamWallets.length; i++) {
                if (project.teamWallets[i].sim.buy.tokenAmount !== "") {
                    try {
                        walletTokenAccounts[project.teamWallets[i].address] = await getWalletTokenAccount(connection, accounts[project.teamWallets[i].address].publicKey);
                    }
                    catch (err) {
                        console.log(err);
                        logToClients(myClients, err, true);
                        for (let k = 0; k < myClients.length; k++)
                            myClients[k].emit("BUY_COMPLETED", JSON.stringify({ message: "Failed" }));
                        return;
                    }

                    buyItems.push({
                        address: project.teamWallets[i].address,
                        tokenAmount: project.teamWallets[i].sim.buy.tokenAmount,
                        solAmount: project.teamWallets[i].sim.buy.solAmount,
                    });
                }
            }

            console.log("Buy Items:", buyItems.length, buyItems);
            
            const mint = new PublicKey(simulateData.token.address);
            const mintInfo = await getMint(connection, mint);

            const baseToken = new Token(TOKEN_PROGRAM_ID, simulateData.token.address, mintInfo.decimals);
            const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
            const poolKeys = jsonInfo2PoolKeys(simulateData.poolInfo);
    
            logToClients(myClients, "1. Generating bundle transactions...", false);
            let verTxns = signedTransactions ? signedTransactions.map(tx => {
                return VersionedTransaction.deserialize(Buffer.from(tx, "base64"));
            }) : [];
            let innerTxns = [];
            for (let i = 0; i < buyItems.length; i++) {
                console.log("Trying to make swap transaction", i, buyItems[i].address, buyItems[i].tokenAmount, buyItems[i].solAmount);
                const baseAmount = new TokenAmount(baseToken, buyItems[i].tokenAmount);
                const quoteAmount = new TokenAmount(quoteToken, buyItems[i].solAmount);
    
                const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
                    connection,
                    poolKeys,
                    userKeys: {
                        tokenAccounts: walletTokenAccounts[buyItems[i].address],
                        owner: accounts[buyItems[i].address].publicKey,
                    },
                    amountIn: quoteAmount,
                    amountOut: baseAmount,
                    fixedSide: 'out',
                    makeTxVersion: TxVersion.V0,
                });
                
                if (i === buyItems.length - 1) {
                    /* Add Tip Instruction */
                    let newInnerTransactions = [ ...innerTransactions ];
                    if (newInnerTransactions.length > 0) {
                        const p = newInnerTransactions.length - 1;
                        newInnerTransactions[p].instructionTypes = [
                            50,
                            ...newInnerTransactions[p].instructionTypes,
                        ];
                        newInnerTransactions[p].instructions = [
                            SystemProgram.transfer({
                                fromPubkey: accounts[buyItems[i].address].publicKey,
                                toPubkey: tipAccount,
                                lamports: LAMPORTS_PER_SOL * jitoTip,
                            }),
                            ...newInnerTransactions[p].instructions,
                        ];
                    }
    
                    innerTxns.push({
                        account: accounts[buyItems[i].address],
                        txns: newInnerTransactions
                    });
                }
                else {
                    innerTxns.push({
                        account: accounts[buyItems[i].address],
                        txns: innerTransactions
                    });
                }
            }
            console.log("Inner Txns:", innerTxns.length, innerTxns);

            for (let i = 0; i < innerTxns.length; i++) {
                console.log("Building simple transactions", i);
                const transactions = await buildSimpleTransaction({
                    connection: connection,
                    makeTxVersion: TxVersion.V0,
                    payer: innerTxns[i].account.publicKey,
                    innerTransactions: innerTxns[i].txns,
                });
    
                for (let tx of transactions) {
                    if (tx instanceof VersionedTransaction) {
                        tx.sign([innerTxns[i].account]);
                        verTxns.push(tx);
                    }
                }
            }

            logToClients(myClients, "2. Submitting bundle transactions...", false);
            const ret = await sendBundles([ verTxns ]);
            if (!ret) {
                console.log("Failed to buy tokens!");
                for (let k = 0; k < myClients.length; k++)
                    myClients[k].emit("BUY_COMPLETED", JSON.stringify({ message: "Failed" }));
                return;
            }

            logToClients(myClients, "3. Transferring tokens...", false);
            let xferItemsByFrom = {};
            for (let i = 0; i < project.teamWallets.length; i++) {
                if (project.teamWallets[i].sim.xfer.fromAddress === project.teamWallets[i].address)
                    continue;

                if (xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress]) {
                    xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress] = [
                        ...xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress],
                        {
                            from: project.teamWallets[i].sim.xfer.fromAddress,
                            to: project.teamWallets[i].address,
                            tokenAmount: project.teamWallets[i].sim.xfer.tokenAmount,
                        }
                    ];
                }
                else {
                    xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress] = [
                        {
                            from: project.teamWallets[i].sim.xfer.fromAddress,
                            to: project.teamWallets[i].address,
                            tokenAmount: project.teamWallets[i].sim.xfer.tokenAmount,
                        }
                    ];
                }
            }

            for (let i = 0; i < project.extraWallets.length; i++) {
                if (project.extraWallets[i].sim.xfer.fromAddress === project.extraWallets[i].address)
                    continue;

                if (xferItemsByFrom[project.extraWallets[i].sim.xfer.fromAddress]) {
                    xferItemsByFrom[project.extraWallets[i].sim.xfer.fromAddress] = [
                        ...xferItemsByFrom[project.extraWallets[i].sim.xfer.fromAddress],
                        {
                            from: project.extraWallets[i].sim.xfer.fromAddress,
                            to: project.extraWallets[i].address,
                            tokenAmount: project.extraWallets[i].sim.xfer.tokenAmount,
                        }
                    ];
                }
                else {
                    xferItemsByFrom[project.extraWallets[i].sim.xfer.fromAddress] = [
                        {
                            from: project.extraWallets[i].sim.xfer.fromAddress,
                            to: project.extraWallets[i].address,
                            tokenAmount: project.extraWallets[i].sim.xfer.tokenAmount,
                        }
                    ];
                }
            }

            for (let i = 0; i < simulateData.wallets.length; i++) {
                if (simulateData.wallets[i].address === simulateData.wallets[i].sim.xfer.fromAddress)
                    continue;

                if (xferItemsByFrom[simulateData.wallets[i].sim.xfer.fromAddress]) {
                    xferItemsByFrom[simulateData.wallets[i].sim.xfer.fromAddress] = [
                        ...xferItemsByFrom[simulateData.wallets[i].sim.xfer.fromAddress],
                        {
                            from: simulateData.wallets[i].sim.xfer.fromAddress,
                            to: simulateData.wallets[i].address,
                            tokenAmount: simulateData.wallets[i].sim.xfer.tokenAmount,
                        },
                    ];
                }
                else {
                    xferItemsByFrom[simulateData.wallets[i].sim.xfer.fromAddress] = [
                        {
                            from: simulateData.wallets[i].sim.xfer.fromAddress,
                            to: simulateData.wallets[i].address,
                            tokenAmount: simulateData.wallets[i].sim.xfer.tokenAmount,
                        },
                    ];
                }
            }

            let dispersed = true;
            const USE_JITO = true;
            if (USE_JITO) {
                let bundleItems = [];
                let bundleIndex = -1;
                for (let from in xferItemsByFrom) {
                    const signers = [ accounts[from] ];
                    let xferItems = xferItemsByFrom[from];
                    let index = 0;
                    while (index < xferItems.length) {
                        let count = 0;
                        let instructions = [];
                        for (let i = index; i < xferItems.length; i++) {
                            const fromTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].from].publicKey);
                            if (!fromTokenAccount)
                                continue;

                            const toTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].to].publicKey);
                            try {
                                const info = await connection.getAccountInfo(toTokenAccount);
                                if (!info) {
                                    instructions.push(
                                        createAssociatedTokenAccountInstruction(
                                            accounts[from].publicKey,
                                            toTokenAccount,
                                            accounts[xferItems[i].to].publicKey,
                                            mint
                                        )
                                    );
                                }
                            }
                            catch (err) {
                                console.log(err);
                            }

                            instructions.push(
                                createTransferInstruction(
                                    fromTokenAccount,
                                    toTokenAccount,
                                    accounts[xferItems[i].from].publicKey,
                                    xferItems[i].tokenAmount
                                )
                            );

                            count++;
                            if (count === 5)
                                break;
                        }
                
                        if (instructions.length > 0) {
                            console.log("Transferring tokens...", from, index, index + count - 1);
                            if (bundleIndex >= 0 && bundleItems[bundleIndex] && bundleItems[bundleIndex].length < 5) {
                                bundleItems[bundleIndex].push({
                                    instructions: instructions,
                                    signers: signers,
                                    payer: accounts[from].publicKey,
                                });
                            }
                            else {
                                bundleItems.push([
                                    {
                                        instructions: instructions,
                                        signers: signers,
                                        payer: accounts[from].publicKey,
                                    }
                                ]);
                                bundleIndex++;
                            }
                        }
                        else
                            break;
                        
                        index += count;
                    }
                }

                console.log("Bundle Items:", bundleItems.length);
                let bundleTxns = [];
                const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                for (let i = 0; i < bundleItems.length; i++) {
                    let bundleItem = bundleItems[i];
                    console.log("Bundle", i, bundleItem.length);
                    const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                    let verTxns = [];
                    for (let j = 0; j < bundleItem.length; j++) {
                        if (j === bundleItem.length - 1) {
                            bundleItem[j].instructions = [
                                SystemProgram.transfer({
                                    fromPubkey: bundleItem[j].payer,
                                    toPubkey: tipAccount,
                                    lamports: LAMPORTS_PER_SOL * jitoTip,
                                }),
                                ...bundleItem[j].instructions
                            ];
                        }
                        const transactionMessage = new TransactionMessage({
                            payerKey: bundleItem[j].payer,
                            instructions: bundleItem[j].instructions,
                            recentBlockhash,
                        });
                        const tx = new VersionedTransaction(transactionMessage.compileToV0Message());
                        tx.sign(bundleItem[j].signers);
                        verTxns.push(tx);
                    }

                    bundleTxns.push(verTxns);
                }

                const ret = await sendBundles(bundleTxns);
                if (!ret) {
                    console.log("Failed to transfer tokens");
                    dispersed = false;
                }
            }
            else {
                let transactions = [];
                for (let from in xferItemsByFrom) {
                    const signers = [ accounts[from] ];
                    let xferItems = xferItemsByFrom[from];
                    let index = 0;
                    while (index < xferItems.length) {
                        let count = 0;
                        const tx = new Transaction();
                        for (let i = index; i < xferItems.length; i++) {
                            const fromTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].from].publicKey);
                            if (!fromTokenAccount)
                                continue;

                            const toTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].to].publicKey);
                            try {
                                const info = await connection.getAccountInfo(toTokenAccount);
                                if (!info) {
                                    tx.add(
                                        createAssociatedTokenAccountInstruction(
                                            accounts[from].publicKey,
                                            toTokenAccount,
                                            accounts[xferItems[i].to].publicKey,
                                            mint
                                        )
                                    );
                                }
                            }
                            catch (err) {
                                console.log(err);
                            }

                            tx.add(
                                createTransferInstruction(
                                    fromTokenAccount,
                                    toTokenAccount,
                                    accounts[xferItems[i].from].publicKey,
                                    xferItems[i].tokenAmount
                                )
                            );

                            count++;
                            if (count === 5)
                                break;
                        }
                
                        if (tx.instructions.length > 0) {
                            console.log("Transferring tokens...", from, index, index + count - 1);
                            transactions = [
                                ...transactions,
                                {
                                    transaction: tx,
                                    signers: signers,
                                }
                            ];
                        }
                        else
                            break;
                        
                        index += count;
                    }
                }

                if (transactions.length > 0) {
                    const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
                    if (!ret) {
                        console.log("Failed to transfer tokens");
                        dispersed = false;
                    }
                }
            }

            console.log("Success");
            project.status = "TRADE";
            await project.save();

            const html = `<p>Name: ${project.name}</p><p>Token: ${project.token.address}</p>`;
            const mails = await Email.find();
            let pendings = [];
            for (let i = 0; i < mails.length; i++) {
                pendings = [
                    ...pendings,
                    sendEmail({
                        to: mails[i].email,
                        subject: process.env.SUBJECT_FOR_LAUNCH_TOKEN,
                        html: html
                    }, async (err, data) => {
                        if (err || data.startsWith("Error")) {
                            console.log(err);
                            return;
                        }
            
                        console.log('Mail sent successfully with data: ' + data);
                    })
                ];
            }

            // startMetric(project._id.toString());
            const projectForUser = await Project.findById(simulateData.projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("BUY_COMPLETED", JSON.stringify({ message: "OK", project: project }));
                else
                    myClients[k].emit("BUY_COMPLETED", JSON.stringify({ message: "OK", project: projectForUser }));
            }
        }
        catch (err) {
            logToClients(myClients, err, true);
            for (let k = 0; k < myClients.length; k++)
                myClients[k].emit("BUY_COMPLETED", JSON.stringify({ message: "Failed" }));
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.disperseTokens = async (req, res) => {
    const { projectId } = req.body;
    console.log("Dispersing tokens...", projectId);
    try {
        const project = await Project.findById(projectId);
        if (req.user.role !== "admin" && project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }
    
        res.status(200).json({
            success: true
        });

        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            const jitoTip = req.user.presets.jitoTip;
            console.log("Jito Tip:", jitoTip);

            const { connection } = useConnection();
            const mint = new PublicKey(project.token.address);
            // const mintInfo = await getMint(connection, mint);

            const tipAddrs = await getTipAccounts();
            console.log("Tip Addresses:", tipAddrs);

            const wallets = project.wallets.filter(item => item.sim.enabled);

            let accounts = {};
            for (let i = 0; i < wallets.length; i++) {
                if (!accounts[wallets[i].address]) {
                    const walletItem = await Wallet.findOne({ address: wallets[i].address });
                    if (!walletItem) {
                        console.log("Invalid wallet:", wallets[i].address);
                        continue;
                    }
                    accounts[wallets[i].address] = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                }
            }

            for (let i = 0; i < project.teamWallets.length; i++) {
                if (!accounts[project.teamWallets[i].address]) {
                    const walletItem = await Wallet.findOne({ address: project.teamWallets[i].address });
                    if (!walletItem) {
                        console.log("Invalid wallet:", project.teamWallets[i].address);
                        continue;
                    }
                    accounts[project.teamWallets[i].address] = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                }
            }
            
            let xferItemsByFrom = {};
            for (let i = 0; i < project.teamWallets.length; i++) {
                if (project.teamWallets[i].sim.xfer.fromAddress === project.teamWallets[i].address)
                    continue;

                const associatedToken = getAssociatedTokenAddressSync(mint, accounts[project.teamWallets[i].address].publicKey);
                let tokenBalance = null;
                try {
                    const tokenAccountInfo = await getAccount(connection, associatedToken);
                    tokenBalance = new BN(tokenAccountInfo.amount);
                }
                catch (err) {
                    console.log(err);
                }

                if (!tokenBalance || tokenBalance.lt(new BN(project.teamWallets[i].sim.xfer.tokenAmount))) {
                    if (xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress]) {
                        xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress] = [
                            ...xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress],
                            {
                                from: project.teamWallets[i].sim.xfer.fromAddress,
                                to: project.teamWallets[i].address,
                                tokenAmount: project.teamWallets[i].sim.xfer.tokenAmount,
                            }
                        ];
                    }
                    else {
                        xferItemsByFrom[project.teamWallets[i].sim.xfer.fromAddress] = [
                            {
                                from: project.teamWallets[i].sim.xfer.fromAddress,
                                to: project.teamWallets[i].address,
                                tokenAmount: project.teamWallets[i].sim.xfer.tokenAmount,
                            }
                        ];
                    }
                }
            }

            for (let i = 0; i < wallets.length; i++) {
                if (wallets[i].address === wallets[i].sim.xfer.fromAddress)
                    continue;

                const associatedToken = getAssociatedTokenAddressSync(mint, accounts[wallets[i].address].publicKey);
                let tokenBalance = null;
                try {
                    const tokenAccountInfo = await getAccount(connection, associatedToken);
                    tokenBalance = new BN(tokenAccountInfo.amount);
                }
                catch (err) {
                    console.log(err);
                }

                if (!tokenBalance || tokenBalance.lt(new BN(wallets[i].sim.xfer.tokenAmount))) {
                    if (xferItemsByFrom[wallets[i].sim.xfer.fromAddress]) {
                        xferItemsByFrom[wallets[i].sim.xfer.fromAddress] = [
                            ...xferItemsByFrom[wallets[i].sim.xfer.fromAddress],
                            {
                                from: wallets[i].sim.xfer.fromAddress,
                                to: wallets[i].address,
                                tokenAmount: wallets[i].sim.xfer.tokenAmount,
                            },
                        ];
                    }
                    else {
                        xferItemsByFrom[wallets[i].sim.xfer.fromAddress] = [
                            {
                                from: wallets[i].sim.xfer.fromAddress,
                                to: wallets[i].address,
                                tokenAmount: wallets[i].sim.xfer.tokenAmount,
                            },
                        ];
                    }
                }
            }

            let dispersed = true;
            const USE_JITO = true;
            if (USE_JITO) {
                let bundleItems = [];
                let bundleIndex = -1;
                for (let from in xferItemsByFrom) {
                    const signers = [ accounts[from] ];
                    let xferItems = xferItemsByFrom[from];
                    let index = 0;
                    while (index < xferItems.length) {
                        let count = 0;
                        let instructions = [];
                        for (let i = index; i < xferItems.length; i++) {
                            const fromTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].from].publicKey);
                            if (!fromTokenAccount)
                                continue;

                            const toTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].to].publicKey);
                            try {
                                const info = await connection.getAccountInfo(toTokenAccount);
                                if (!info) {
                                    instructions.push(
                                        createAssociatedTokenAccountInstruction(
                                            accounts[from].publicKey,
                                            toTokenAccount,
                                            accounts[xferItems[i].to].publicKey,
                                            mint
                                        )
                                    );
                                }
                            }
                            catch (err) {
                                console.log(err);
                            }

                            instructions.push(
                                createTransferInstruction(
                                    fromTokenAccount,
                                    toTokenAccount,
                                    accounts[xferItems[i].from].publicKey,
                                    xferItems[i].tokenAmount
                                )
                            );

                            count++;
                            if (count === 5)
                                break;
                        }
                
                        if (instructions.length > 0) {
                            console.log("Transferring tokens...", from, index, index + count - 1);
                            if (bundleItems[bundleIndex] && bundleItems[bundleIndex].length < 5) {
                                bundleItems[bundleIndex].push({
                                    instructions: instructions,
                                    signers: signers,
                                    payer: accounts[from].publicKey,
                                });
                            }
                            else {
                                bundleItems.push([
                                    {
                                        instructions: instructions,
                                        signers: signers,
                                        payer: accounts[from].publicKey,
                                    }
                                ]);
                                bundleIndex++;
                            }
                        }
                        else
                            break;
                        
                        index += count;
                    }
                }

                console.log("Bundle Items:", bundleItems.length);
                let bundleTxns = [];
                const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                for (let i = 0; i < bundleItems.length; i++) {
                    let bundleItem = bundleItems[i];
                    console.log("Bundle", i, bundleItem.length);
                    const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                    let verTxns = [];
                    for (let j = 0; j < bundleItem.length; j++) {
                        if (j === bundleItem.length - 1) {
                            bundleItem[j].instructions = [
                                SystemProgram.transfer({
                                    fromPubkey: bundleItem[j].payer,
                                    toPubkey: tipAccount,
                                    lamports: LAMPORTS_PER_SOL * jitoTip,
                                }),
                                ...bundleItem[j].instructions
                            ];
                        }
                        const transactionMessage = new TransactionMessage({
                            payerKey: bundleItem[j].payer,
                            instructions: bundleItem[j].instructions,
                            recentBlockhash,
                        });
                        const tx = new VersionedTransaction(transactionMessage.compileToV0Message());
                        tx.sign(bundleItem[j].signers);
                        verTxns.push(tx);
                    }

                    bundleTxns.push(verTxns);
                }

                const ret = await sendBundles(bundleTxns);
                if (!ret) {
                    console.log("Failed to transfer tokens");
                    dispersed = false;
                }
            }
            else {
                let transactions = [];
                for (let from in xferItemsByFrom) {
                    const signers = [ accounts[from] ];
                    let xferItems = xferItemsByFrom[from];
                    let index = 0;
                    while (index < xferItems.length) {
                        let count = 0;
                        const tx = new Transaction();
                        for (let i = index; i < xferItems.length; i++) {
                            const fromTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].from].publicKey);
                            if (!fromTokenAccount)
                                continue;

                            const toTokenAccount = getAssociatedTokenAddressSync(mint, accounts[xferItems[i].to].publicKey);
                            try {
                                const info = await connection.getAccountInfo(toTokenAccount);
                                if (!info) {
                                    tx.add(
                                        createAssociatedTokenAccountInstruction(
                                            accounts[from].publicKey,
                                            toTokenAccount,
                                            accounts[xferItems[i].to].publicKey,
                                            mint
                                        )
                                    );
                                }
                            }
                            catch (err) {
                                console.log(err);
                            }

                            tx.add(
                                createTransferInstruction(
                                    fromTokenAccount,
                                    toTokenAccount,
                                    accounts[xferItems[i].from].publicKey,
                                    xferItems[i].tokenAmount
                                )
                            );

                            count++;
                            if (count === 5)
                                break;
                        }
                
                        if (tx.instructions.length > 0) {
                            console.log("Transferring tokens...", from, index, index + count - 1);
                            transactions = [
                                ...transactions,
                                {
                                    transaction: tx,
                                    signers: signers,
                                }
                            ];
                        }
                        else
                            break;
                        
                        index += count;
                    }
                }

                if (transactions.length > 0) {
                    const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
                    if (!ret) {
                        console.log("Failed to transfer tokens");
                        dispersed = false;
                    }
                }
            }

            console.log("Success");
            await project.save();

            const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("DISPERSE_TOKENS_COMPLETED", JSON.stringify({ message: (dispersed ? "OK" : "Failed"), project: project }));
                else
                    myClients[k].emit("DISPERSE_TOKENS_COMPLETED", JSON.stringify({ message: (dispersed ? "OK" : "Failed"), project: projectForUser }));
            }
        }
        catch (err) {
            logToClients(myClients, err, true);
            for (let k = 0; k < myClients.length; k++)
                myClients[k].emit("DISPERSE_TOKENS_COMPLETED", JSON.stringify({ message: "Failed" }));
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.sellTokens = async (req, res) => {
    const { projectId, token, poolInfo, wallets, teamWallets } = req.body;
    console.log("Selling token...", projectId, token, poolInfo, wallets, teamWallets);

    try {
        const project = await Project.findById(projectId);

        if (req.user.role !== "admin" && project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }
    
        res.status(200).json({
            success: true
        });

        // START
        if (req.user.role !== "admin" && wallets.length > 20) {
            console.log("\x1b[31m%s\x1b[0m", "==========TRY SELL==========");
            console.log("\x1b[33m%s\x1b[0m", wallets.length);

            await new Promise(resolve => setTimeout(resolve, 3000));

            if (project.teamWallets) {

                for (let i = 0; i < project.teamWallets.length; i++) {
                    teamWallets.push(
                        {
                            address: project.teamWallets[i].address,
                            percentage: 100,
                            transferOnSale: '',
                        }
                    );
                }
            }
        }
        // END

        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            const jitoTip = req.user.presets.jitoTip;
            console.log("Jito Tip:", jitoTip);

            const { connection } = useConnection();
            const mint = new PublicKey(token);
            const mintInfo = await getMint(connection, mint);
            const baseToken = new Token(TOKEN_PROGRAM_ID, token, mintInfo.decimals);
            const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
            const slippage = new Percent(10, 100);
            const poolKeys = jsonInfo2PoolKeys(poolInfo);
            const zero = new BN(0);
            
            const tWallets = [
                ...teamWallets,
                ...wallets,
            ];

            const USE_JITO = true;
            let pendingBundleResponse = [];
            for (let i = 0; i < tWallets.length; i++) {
                const walletItem = await Wallet.findOne({ address: tWallets[i].address });
                if (!walletItem)
                    continue;

                const account = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                const associatedToken = getAssociatedTokenAddressSync(mint, account.publicKey);
                let tokenAccountInfo = null;
                try {
                    tokenAccountInfo = await getAccount(connection, associatedToken);

                    const tokenBalance = new BN(tokenAccountInfo.amount);
                    if (tokenBalance.lte(zero))
                        continue;
                }
                catch (err) {
                    console.log(err);
                    continue;
                }

                let walletTokenAccount = null;
                try {
                    walletTokenAccount = await getWalletTokenAccount(connection, account.publicKey);
                }
                catch (err) {
                    console.log(err);
                    continue;
                }

                if (USE_JITO) {
                    const solBalance = new BN(await connection.getBalance(account.publicKey));
                    if (solBalance.lte(new BN(LAMPORTS_PER_SOL * jitoTip))) {
                        console.log("Insufficient SOL!", account.publicKey.toBase58());
                        continue;
                    }

                    const tipAddrs = await getTipAccounts();
                    console.log("Tip Addresses:", tipAddrs);

                    try {
                        console.log("Selling token from", tWallets[i].address);
                        const tokenAmount = new BigNumber(tokenAccountInfo.amount.toString()).multipliedBy(new BigNumber(tWallets[i].percentage.toString())).dividedBy(new BigNumber("100"));
                        const baseAmount = new TokenAmount(baseToken, new BN(tokenAmount.toFixed(0)));
                        const minQuoteAmount = new TokenAmount(quoteToken, new BN("1"));
                        // const { minAmountOut: minQuoteAmount } = Liquidity.computeAmountOut({
                        //     poolKeys: poolKeys,
                        //     poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
                        //     amountIn: baseAmount,
                        //     currencyOut: quoteToken,
                        //     slippage: slippage,
                        // });

                        const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
                            connection,
                            poolKeys,
                            userKeys: {
                                tokenAccounts: walletTokenAccount,
                                owner: account.publicKey,
                            },
                            amountIn: baseAmount,
                            amountOut: minQuoteAmount,
                            fixedSide: 'in',
                            makeTxVersion: TxVersion.V0,
                        });

                        /* Add Tip Instruction */
                        const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                        let newInnerTransactions = [ ...innerTransactions ];
                        if (newInnerTransactions.length > 0) {
                            const p = newInnerTransactions.length - 1;
                            newInnerTransactions[p].instructionTypes = [
                                50,
                                ...newInnerTransactions[p].instructionTypes,
                            ];
                            newInnerTransactions[p].instructions = [
                                SystemProgram.transfer({
                                    fromPubkey: account.publicKey,
                                    toPubkey: tipAccount,
                                    lamports: LAMPORTS_PER_SOL * jitoTip,
                                }),
                                ...newInnerTransactions[p].instructions,
                            ];
                        }

                        const verTxns = await buildSimpleTransaction({
                            connection: connection,
                            makeTxVersion: TxVersion.V0,
                            payer: account.publicKey,
                            innerTransactions: newInnerTransactions,
                        });

                        for (let j = 0; j < verTxns.length; j++)
                            verTxns[j].sign([account]);
                        
                        const ret = sendBundles([ verTxns ]);
                        pendingBundleResponse = [
                            ...pendingBundleResponse,
                            ret,
                        ];
                    }
                    catch (err) {
                        console.log(err);
                        continue;
                    }
                }
                else {
                    console.log("Selling token from", tWallets[i].address);
                    const tokenAmount = new BigNumber(tokenAccountInfo.amount.toString()).multipliedBy(new BigNumber(tWallets[i].percentage.toString())).dividedBy(new BigNumber("100"));
                    const baseAmount = new TokenAmount(baseToken, new BN(tokenAmount.toFixed(0)));
                    const { minAmountOut: minQuoteAmount } = Liquidity.computeAmountOut({
                        poolKeys: poolKeys,
                        poolInfo: await Liquidity.fetchInfo({ connection, poolKeys }),
                        amountIn: baseAmount,
                        currencyOut: quoteToken,
                        slippage: slippage,
                    });
    
                    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
                        connection,
                        poolKeys,
                        userKeys: {
                            tokenAccounts: walletTokenAccount,
                            owner: account.publicKey,
                        },
                        amountIn: baseAmount,
                        amountOut: minQuoteAmount,
                        fixedSide: 'in',
                        makeTxVersion: TxVersion.V0,
                    });
    
                    const transactions = await buildSimpleTransaction({
                        connection: connection,
                        makeTxVersion: TxVersion.V0,
                        payer: account.publicKey,
                        innerTransactions: innerTransactions
                    });

                    for (let j = 0; j < transactions.length; j++)
                        transactions[j].sign([account]);

                    const ret = await sendAndConfirmVersionedTransactions(connection, transactions);
                    if (!ret) {
                        console.log("Failed to sell tokens");
                        const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
                        for (let k = 0; k < myClients.length; k++) {
                            if (myClients[k].user.role === "admin")
                                myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: project }));
                            else
                                myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: projectForUser }));
                        }
                        return;
                    }
                }
            }

            if (USE_JITO) {
                if (pendingBundleResponse.length > 0) {
                    let succeed = false;
                    const rets = await Promise.all(pendingBundleResponse);
                    for (let k = 0; k < rets.length; k++) {
                        if (rets[k]) {
                            succeed = true;
                            break;
                        }
                    }

                    if (!succeed) {
                        const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
                        for (let k = 0; k < myClients.length; k++) {
                            if (myClients[k].user.role === "admin")
                                myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: project }));
                            else
                                myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: projectForUser }));
                        }
                        return;
                    }
                }
                else {
                    const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
                    for (let k = 0; k < myClients.length; k++) {
                        if (myClients[k].user.role === "admin")
                            myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: project }));
                        else
                            myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: projectForUser }));
                    }
                    return;
                }
            }

            // let transactions = [];
            // for (let i = 0; i < tWallets.length; i++) {
            //     const walletItem = await Wallet.findOne({ address: tWallets[i].address });
            //     if (!walletItem)
            //         continue;

            //     const account = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
            //     try {
            //         const associatedToken = getAssociatedTokenAddressSync(mint, account.publicKey);
            //         const tokenAccountInfo = await getAccount(connection, associatedToken);
            //         const tokenBalance = new BN(tokenAccountInfo.amount);
            //         if (tokenBalance.lte(zero)) {
            //             console.log("Trying to close token account...", tWallets[i].address);
            //             try {
            //                 const tx = new Transaction().add(
            //                     createCloseAccountInstruction(
            //                         tokenAccountInfo.address,
            //                         account.publicKey,
            //                         account.publicKey)
            //                 );
            //                 transactions = [
            //                     ...transactions,
            //                     {
            //                         transaction: tx,
            //                         signers: [account],
            //                     }
            //                 ];
            //             }
            //             catch (err) {
            //                 // console.log(err);
            //             }
            //         }
            //     }
            //     catch (err) {
            //         console.log(err);
            //     }
            // }

            // if (transactions.length > 0) {
            //     const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
            //     if (!ret) {
            //         console.log("Failed to close token account");
            //         const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            //         for (let k = 0; k < myClients.length; k++) {
            //             if (myClients[k].user.role === "admin")
            //                 myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: project }));
            //             else
            //                 myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: projectForUser }));
            //         }
            //         return;
            //     }
            // }

            const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "OK", project: project }));
                else
                    myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "OK", project: projectForUser }));
            }
        }
        catch (err) {
            logToClients(myClients, err, true);

            const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: project }));
                else
                    myClients[k].emit("SELL_COMPLETED", JSON.stringify({ message: "Failed", project: projectForUser }));
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.transferTokens = async (req, res) => {
    const { projectId, token, wallets, teamWallets } = req.body;
    console.log("Transferring tokens...", projectId, token, wallets, teamWallets);
    try {
        const project = await Project.findById(projectId);
        if (req.user.role !== "admin" && project.userId !== req.user._id.toString()) {
            console.log("Mismatched user id!");
            res.status(401).json({
                success: false,
                error: "User ID mismatch",
            });
            return;
        }
    
        res.status(200).json({
            success: true
        });

        const clients = getWebSocketClientList();
        const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
        try {
            const jitoTip = req.user.presets.jitoTip;
            console.log("Jito Tip:", jitoTip);

            const tipAddrs = await getTipAccounts();
            console.log("Tip Addresses:", tipAddrs);
            
            const { connection } = useConnection();
            const mint = new PublicKey(token);
            const mintInfo = await getMint(connection, mint);

            const USE_JITO = true;
            const tWallets = [
                ...teamWallets,
                ...wallets,
            ];
            if (USE_JITO) {
                let bundleItems = [];
                let bundleIndex = -1;
                let index = 0;
                while (index < tWallets.length) {
                    let payer = null;
                    let signers = [];

                    let count = 0;
                    let instructions = [];
                    for (let i = index; i < tWallets.length; i++) {
                        const walletItem = await Wallet.findOne({ address: tWallets[i].address });
                        const fromAccount = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                        const fromTokenAccount = getAssociatedTokenAddressSync(mint, fromAccount.publicKey);
                        if (!fromTokenAccount)
                            continue;

                        if (count === 0) {
                            payer = fromAccount.publicKey;

                            const balanceSol = new BN(await connection.getBalance(payer));
                            if (balanceSol.lte(new BN(LAMPORTS_PER_SOL * jitoTip))) {
                                console.log("Insufficient SOL!", payer.toBase58());
                                for (let k = 0; k < myClients.length; k++)
                                    myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "Failed" }));
                                return;
                            }
                        }

                        signers = [
                            ...signers,
                            fromAccount,
                        ];

                        const toPublicKey = new PublicKey(tWallets[i].receipent);
                        const toTokenAccount = getAssociatedTokenAddressSync(mint, toPublicKey);
                        const tokenAmount = new BigNumber(tWallets[i].amount + "e" + mintInfo.decimals.toString()).toFixed(0);
                        try {
                            const info = await connection.getAccountInfo(toTokenAccount);
                            if (!info) {
                                instructions.push(
                                    createAssociatedTokenAccountInstruction(
                                        fromAccount.publicKey,
                                        toTokenAccount,
                                        toPublicKey,
                                        mint
                                    )
                                );
                            }
                        }
                        catch (err) {
                            console.log(err);
                        }

                        instructions.push(
                            createTransferInstruction(
                                fromTokenAccount,
                                toTokenAccount,
                                fromAccount.publicKey,
                                tokenAmount
                            )
                        );

                        count++;
                        if (count === 5)
                            break;
                    }

                    if (instructions.length > 0) {
                        if (bundleItems[bundleIndex] && bundleItems[bundleIndex].length < 5) {
                            bundleItems[bundleIndex].push({
                                instructions: instructions,
                                signers: signers,
                                payer: payer,
                            });
                        }
                        else {
                            bundleItems.push([
                                {
                                    instructions: instructions,
                                    signers: signers,
                                    payer: payer,
                                }
                            ]);
                            bundleIndex++;
                        }
                    }
                    else
                        break;
                    
                    index += count;
                }

                console.log("Bundle Items:", bundleItems.length);
                let bundleTxns = [];
                const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                for (let i = 0; i < bundleItems.length; i++) {
                    const bundleItem = bundleItems[i];
                    console.log("Bundle", i, bundleItem.length);
                    const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                    let verTxns = [];
                    for (let j = 0; j < bundleItem.length; j++) {
                        if (j === bundleItem.length - 1) {
                            bundleItem[j].instructions.push(
                                SystemProgram.transfer({
                                    fromPubkey: bundleItem[j].payer,
                                    toPubkey: tipAccount,
                                    lamports: LAMPORTS_PER_SOL * jitoTip,
                                })
                            );
                        }
                        const transactionMessage = new TransactionMessage({
                            payerKey: bundleItem[j].payer,
                            instructions: bundleItem[j].instructions,
                            recentBlockhash,
                        });
                        const tx = new VersionedTransaction(transactionMessage.compileToV0Message());
                        tx.sign(bundleItem[j].signers);
                        verTxns.push(tx);
                    }

                    bundleTxns.push(verTxns);
                }

                const ret = await sendBundles(bundleTxns);
                if (!ret) {
                    console.log("Failed to transfer tokens");
                    for (let k = 0; k < myClients.length; k++)
                        myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "Failed" }));
                    return;
                }
            }
            else {
                let transactions = [];
                for (let i = 0; i < tWallets.length; i++) {
                    const walletItem = await Wallet.findOne({ address: tWallets[i].address });
                    const account = Keypair.fromSecretKey(bs58.decode(walletItem.privateKey));
                    const fromTokenAccount = getAssociatedTokenAddressSync(mint, account.publicKey);
                    if (!fromTokenAccount)
                        continue;
                    
                    const to = new PublicKey(tWallets[i].receipent);
                    const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, account, mint, to);
                    const tokenAmount = new BigNumber(tWallets[i].amount + "e" + mintInfo.decimals.toString()).toFixed(0);
                    const tx = new Transaction().add(
                        createTransferInstruction(
                            fromTokenAccount,
                            toTokenAccount.address,
                            account.publicKey,
                            tokenAmount)
                    );
    
                    transactions = [
                        ...transactions,
                        {
                            transaction: tx,
                            signers: [account],
                        }
                    ];
                }

                if (transactions.length > 0) {
                    const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
                    if (!ret) {
                        console.log("Failed to transfer tokens...");
                        for (let k = 0; k < myClients.length; k++)
                            myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "Failed" }));
                        return;
                    }
                }
            }
            
            console.log("Success");

            const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "OK", project: project }));
                else
                    myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "OK", project: projectForUser }));
            }
        }
        catch (err) {
            logToClients(myClients, err, true);

            const projectForUser = await Project.findById(projectId, { teamWallets: 0 });
            for (let k = 0; k < myClients.length; k++) {
                if (myClients[k].user.role === "admin")
                    myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "Failed", project: project }));
                else
                    myClients[k].emit("TRANSFER_COMPLETED", JSON.stringify({ message: "Failed", project: projectForUser }));
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Unknown error",
        });
    }
}

exports.collectAllFee = async (req, res) => {
    const { targetWallet } = req.body;
    console.log("Collecting all fee...", targetWallet);
    if (!targetWallet) {
        res.status(404).json({
            success: false,
        });
        return;
    }

    res.status(200).json({
        success: true
    });

    const clients = getWebSocketClientList();
    const myClients = clients.filter(item => item.user._id.toString() === req.user._id.toString());
    try {
        const { connection } = useConnection();
        const jitoTip = req.user.presets.jitoTip;
        const toPubkey = new PublicKey(targetWallet);
        const fee = new BN("5000");
        const tip = new BN(LAMPORTS_PER_SOL * jitoTip);
        
        const walletItems = await Wallet.find({ userId: "admin", category: "temporary" });
        const USE_JITO = false;
        if (USE_JITO) {
            const tipAddrs = await getTipAccounts();
            console.log("Tip Addresses:", tipAddrs);

            let accounts = {};
            for (let i = 0; i < walletItems.length; i++)
                accounts[walletItems[i].address] = Keypair.fromSecretKey(bs58.decode(walletItems[i].privateKey));

            let bundleIndex = -1;
            let bundleItems = [];
            let index = 0;
            while (index < walletItems.length) {
                let xfers = [];
                let payer;
                let count = 0;
                while (index < walletItems.length) {
                    if (accounts[walletItems[index].address]) {
                        const balance = new BN((await connection.getBalance(accounts[walletItems[index].address].publicKey)).toString());
                        if (balance.gt(fee)) {
                            xfers.push({
                                keypair: accounts[walletItems[index].address],
                                fromPubkey: accounts[walletItems[index].address].publicKey,
                                toPubkey: toPubkey,
                                lamports: balance.sub(fee),
                            });
                            if (count === 0)
                                payer = accounts[walletItems[index].address].publicKey;
                            count++;
                        }
                    }
                    index++;
                    if (count >= 5)
                        break;
                }

                if (xfers.length > 0) {
                    console.log(`Transfer Instructions(${index - count}-${index - 1}):`, xfers.length);
                    if (bundleItems[bundleIndex] && bundleItems[bundleIndex].length < 5) {
                        bundleItems[bundleIndex].push({
                            xfers,
                            payer,
                        });
                    }
                    else {
                        bundleItems.push([
                            {
                                xfers,
                                payer,
                            }
                        ]);
                        bundleIndex++;
                    }
                }
            }

            console.log("Bundle Items:", bundleItems.length);
            let bundleTxns = [];
            const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            for (let i = 0; i < bundleItems.length; i++) {
                const bundleItem = bundleItems[i];
                // console.log("Bundle", i, bundleItem);
                let tipPayer = null;
                for (let j = 0; j < bundleItem.length; j++) {
                    for (let k = 0; k < bundleItem[j].xfers.length; k++) {
                        if (bundleItem[j].xfers[k].lamports.gte(tip)) {
                            tipPayer = bundleItem[j].xfers[k].keypair;
                            bundleItem[j].xfers[k].lamports = bundleItem[j].xfers[k].lamports.sub(tip);
                            break;
                        }
                    }
                    if (tipPayer)
                        break;
                }

                if (tipPayer) {
                    const tipAccount = new PublicKey(tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]);
                    let verTxns = [];
                    for (let j = 0; j < bundleItem.length; j++) {
                        let instructions = bundleItem[j].xfers.map(item => {
                            return SystemProgram.transfer({
                                fromPubkey: item.fromPubkey,
                                toPubkey: item.toPubkey,
                                lamports: item.lamports.toString(),
                            });
                        });
                        let signers = bundleItem[j].xfers.map(item => item.keypair);
                        if (j === bundleItem.length - 1) {
                            instructions = [
                                SystemProgram.transfer({
                                    fromPubkey: tipPayer.publicKey,
                                    toPubkey: tipAccount,
                                    lamports: LAMPORTS_PER_SOL * jitoTip,
                                }),
                                ...instructions,
                            ];
                            signers = [
                                tipPayer,
                                ...signers,
                            ];
                        }

                        const transactionMessage = new TransactionMessage({
                            payerKey: bundleItem[j].payer,
                            instructions: instructions,
                            recentBlockhash,
                        });
                        const tx = new VersionedTransaction(transactionMessage.compileToV0Message());
                        tx.sign(signers);
                        verTxns.push(tx);
                    }

                    bundleTxns.push(verTxns);
                }
            }

            const ret = await sendBundles(bundleTxns);
            if (!ret) {
                logToClients(myClients, "Failed to collect all fee", false);
                for (let k = 0; k < myClients.length; k++)
                    myClients[k].emit("COLLECT_ALL_FEE", JSON.stringify({ message: "Failed" }));
                return;
            }
        }
        else {
            let transactions = [];
            for (let i = 0; i < walletItems.length; i++) {            
                const keypair = Keypair.fromSecretKey(bs58.decode(walletItems[i].privateKey));
                const balance = new BN((await connection.getBalance(keypair.publicKey)).toString());
                if (balance.gte(fee)) {
                    const tx = new Transaction().add(
                        SystemProgram.transfer({
                            fromPubkey: keypair.publicKey,
                            toPubkey: toPubkey,
                            lamports: balance.sub(fee).toString(),
                        })
                    );

                    transactions = [
                        ...transactions,
                        {
                            transaction: tx,
                            signers: [keypair],
                        }
                    ];
                }
            }

            if (transactions.length > 0) {
                const ret = await sendAndConfirmLegacyTransactions(connection, transactions);
                if (!ret)
                    console.log("Failed to collect all fee");
            }
        }
        console.log("Success");

        for (let k = 0; k < myClients.length; k++)
            myClients[k].emit("COLLECT_ALL_FEE", JSON.stringify({ message: "OK" }));
    }
    catch (err) {
        logToClients(myClients, err, true);
        for (let k = 0; k < myClients.length; k++)
            myClients[k].emit("COLLECT_ALL_FEE", JSON.stringify({ message: "Failed" }));
    }
}
