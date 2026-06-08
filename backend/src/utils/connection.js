const bs58 = require("bs58");
const {
    Connection,
    Keypair,
    clusterApiUrl,
} = require("@solana/web3.js");
// const { HttpProvider } = require("@bloxroute/solana-trader-client-ts");
const {
    searcher: { searcherClient },
} = require("jito-ts");
const JitoSigner = require("../models/jitoSignerModel");

var connection = null;
// var provider = null;
var jitoClients = [];

exports.initConnections = async () => {
    console.log("Initializing connection...");
    
    const devnetMode = process.env.DEVNET_MODE === "true";
    console.log(`Mode: ${devnetMode ? "devnet" : "mainnet"}`);

    const rpcURL = devnetMode ? clusterApiUrl("devnet") : process.env.SOLANA_RPC_URL;
    connection = new Connection(rpcURL, "finalized");

    // provider = new HttpProvider(process.env.BLOXROUTE_AUTH_HEADER, undefined, process.env.BLOXROUTE_SERVER_URL);
    
    const jitoSigners = await JitoSigner.find();
    for (let i = 0; i < jitoSigners.length; i++) {
        const keypair = Keypair.fromSecretKey(bs58.decode(jitoSigners[i].privateKey));
        console.log("Jito-Signer", i, keypair.publicKey.toBase58());
        const client = searcherClient(devnetMode ? process.env.JITO_DEVNET_URL : process.env.JITO_MAINNET_URL, keypair);
        jitoClients.push({
            locked: false,
            count: 0,
            address: keypair.publicKey.toBase58(),
            client: client,
        });
    }
}

exports.useConnection = () => {
    return {
        connection
    };
}

exports.tryLockJitoClient = () => {
    // console.log("Trying to lock jito-client...");
    let minIndex = -1;
    let minCount = -1;
    for (let i = 0; i < jitoClients.length; i++) {
        if (!jitoClients[i].locked && (minIndex === -1 || minCount > jitoClients[i].count)) {
            minIndex = i;
            minCount = jitoClients[i].count;
        }
    }

    if (minIndex >= 0) {
        jitoClients[minIndex].locked = true;
        jitoClients[minIndex].count++;
        return jitoClients[minIndex];
    }
    
    // console.log("Not found unlocked jito-client!");
    return null;
}

exports.unlockJitoClient = (jitoClient) => {
    // console.log("Unlocking jito-client...", jitoClient.address);
    jitoClient.locked = false;
    // console.log("Success");
}

exports.addJitoSigner = async (privateKey) => {
    try {
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        const jitoSigner = await JitoSigner.findOne({ address: keypair.publicKey.toBase58() });
        if (!jitoSigner) {
            const devnetMode = process.env.DEVNET_MODE === "true";
            console.log(`Mode: ${devnetMode ? "devnet" : "mainnet"}`);
            
            const client = searcherClient(devnetMode ? process.env.JITO_DEVNET_URL : process.env.JITO_MAINNET_URL, keypair);
            // if (true) {
            //     // Test Account
            //     const tipAccounts = await client.getTipAccounts();
            //     console.log("Tip Accounts:", tipAccounts);
            // }

            jitoClients.push({
                locked: false,
                count: 0,
                address: keypair.publicKey.toBase58(),
                client: client,
            });

            await JitoSigner.create({
                address: keypair.publicKey.toBase58(),
                privateKey: privateKey,
            });
        }
        
        const jitoSigners = await JitoSigner.find();
        return jitoSigners.map(item => item.address);
    }
    catch (err) {
        console.log(err);
        return null;
    }
}

exports.deleteJitoSigner = async (address) => {
    try {
        const jitoSigner = await JitoSigner.findOne({ address: address });
        if (jitoSigner) {
            await jitoSigner.remove();

            for (let i = 0; i < jitoClients.length; i++) {
                if (jitoClients[i].address === address) {
                    jitoClients.splice(i, 1);
                    break;
                }
            }
        }
        
        const jitoSigners = await JitoSigner.find();
        return jitoSigners.map(item => item.address);
    }
    catch (err) {
        console.log(err);
        return [];
    }
}

exports.getJitoSigners = async () => {
    try {
        const jitoSigners = await JitoSigner.find();
        const signerAddresses = jitoSigners.map(item => item.address);
        return signerAddresses;
    }
    catch (err) {
        console.log(err);
        return [];
    }
}

// exports.useBloXrouteProvider = () => {
//     return {
//         provider
//     };
// }
// {
//     if (useBloxroute) {
//         logToClients(myClients, "2. Generating batch transactions...", false);
//         const skipPreFlight = false;
//         let entries = signedTransactions ? signedTransactions.map(txn => {
//             return {
//                 transaction: {
//                     content: txn,
//                     isCleanup: false,
//                 },
//                 skipPreFlight: skipPreFlight,
//             };
//         }) : [];
//         let innerTxns = [];
//         for (let i = 0; i < items.length; i++) {
//             console.log("Trying to make swap transaction", i);
//             const baseAmount = new TokenAmount(baseToken, items[i].tokenAmount);
//             const quoteAmount = new TokenAmount(quoteToken, items[i].solAmount);
//             const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
//                 connection,
//                 poolKeys,
//                 userKeys: {
//                     tokenAccounts: walletTokenAccounts[i],
//                     owner: accounts[i].publicKey,
//                 },
//                 amountIn: quoteAmount,
//                 amountOut: baseAmount,
//                 fixedSide: 'out',
//                 makeTxVersion: TxVersion.V0,
//             });
//             innerTxns.push(innerTransactions);
//         }
//         for (let i = 0; i < items.length; i++) {
//             console.log("Building simple transactions", i);
//             const transactions = await buildSimpleTransaction({
//                 connection: connection,
//                 makeTxVersion: TxVersion.V0,
//                 payer: accounts[i].publicKey,
//                 innerTransactions: innerTxns[i],
//             });
//             for (let tx of transactions) {
//                 if (tx instanceof VersionedTransaction) {
//                     tx.sign([accounts[i]]);
//                     entries.push({
//                         transaction: {
//                             content: Buffer.from(tx.serialize()).toString("base64"),
//                             isCleanup: false,
//                         },
//                         skipPreFlight: skipPreFlight,
//                     });
//                 }
//             }
//         }
//         logToClients(myClients, "3. Submiting batch transactions...", false);
//         const { provider } = useBloXrouteProvider();
//         const { transactions } = await provider.postSubmitBatch({
//             entries: entries,
//             submitStrategy: "P_SUBMIT_ALL",
//         });
//         let error = false;
//         for (let txn of transactions) {
//             if (txn.error) {
//                 error = true;
//                 break;
//             }
//         }
//         if (error)
//             console.log(transactions);
//     }
// }
// {
//     const rawTransactions = signedTransactions.map(item => Buffer.from(item, "base64"));
//     for (let tx of rawTransactions) {
//         const signature = await connection.sendRawTransaction(tx);
//         await connection.confirmTransaction({ signature });
//     }
//     logToClients(myClients, "Success", false);
// }