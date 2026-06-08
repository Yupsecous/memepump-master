const BigNumber = require("bignumber.js");
// const json2csv = require("json2csv").parse;
const bs58 = require("bs58");
const BN = require("bn.js");
const {
    PublicKey,
    // Keypair,
    // Transaction,
    // TransactionMessage,
    // VersionedTransaction,
    // SystemProgram,
    // LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
    getMint,
    // getAccount,
    // getAssociatedTokenAddressSync,
    // createAssociatedTokenAccountInstruction,
    // getOrCreateAssociatedTokenAccount,
    // createTransferInstruction,
    // createCloseAccountInstruction,
} = require("@solana/spl-token");
const {
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    SPL_ACCOUNT_LAYOUT,
    Liquidity,
    Token,
    poolKeys2JsonInfo,
} = require('@raydium-io/raydium-sdk');
const { Market, MARKET_STATE_LAYOUT_V3 } = require('@project-serum/serum');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
exports.sleep = sleep;

exports.getRandomNumber = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

exports.isValidAddress = (addr) => {
    try {
        const decodedAddr = bs58.decode(addr);
        if (decodedAddr.length !== 32)
            return false;
        return true;
    }
    catch (err) {
        console.log(err);
        return false;
    }
};

exports.xWeiAmount = (amount, decimals) => {
    return new BN(new BigNumber(amount.toString() + "e" + decimals.toString()).toFixed(0));
};

exports.sendAndConfirmVersionedTransactions = async (connection, transactions) => {
    let retries = 50;
    let passed = {};
    const rawTransactions = transactions.map(item => item.serialize());
    while (retries > 0) {
        try {
            let signatures = {};
            for (let i = 0; i < rawTransactions.length; i++) {
                if (!passed[i]) {
                    signatures[i] = await connection.sendRawTransaction(rawTransactions[i], {
                        skipPreflight: true,
                        maxRetries: 1,
                    });
                }
            }
            
            const sentTime = Date.now();
            while (Date.now() - sentTime <= 1000) {
                for (let i = 0; i < rawTransactions.length; i++) {
                    if (!passed[i]) {
                        const ret = await connection.getParsedTransaction(signatures[i], {
                            commitment: "finalized",
                            maxSupportedTransactionVersion: 0,
                        });
                        if (ret)
                            passed[i] = true;
                    }
                }

                let done = true;
                for (let i = 0; i < rawTransactions.length; i++) {
                    if (!passed[i]) {
                        done = false;
                        break;
                    }
                }

                if (done)
                    return true;

                await sleep(500);
            }
        }
        catch (err) {
            console.log(err);
        }
        retries--;
    }

    return false;
}

exports.sendAndConfirmLegacyTransactions = async (connection, transactions) => {
    let retries = 50;
    let passed = {};
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const rawTransactions = transactions.map(({ transaction, signers }) => {
        transaction.recentBlockhash = recentBlockhash;
        if (signers.length > 0)
            transaction.sign(...signers);
        return transaction.serialize();
    });

    while (retries > 0) {
        try {
            let pendings = {};
            for (let i = 0; i < rawTransactions.length; i++) {
                if (!passed[i]) {
                    pendings[i] = connection.sendRawTransaction(rawTransactions[i], {
                        skipPreflight: true,
                        maxRetries: 0,
                    });
                }
            }

            let signatures = {};
            for (let i = 0; i < rawTransactions.length; i++) {
                if (!passed[i])
                    signatures[i] = await pendings[i];
            }

            const sentTime = Date.now();
            while (Date.now() - sentTime <= 1000) {
                for (let i = 0; i < rawTransactions.length; i++) {
                    if (!passed[i]) {
                        const ret = await connection.getParsedTransaction(signatures[i], {
                            commitment: "finalized",
                            maxSupportedTransactionVersion: 0,
                        });
                        if (ret) {
                            // console.log("Slot:", ret.slot);
                            // if (ret.transaction) {
                            //     console.log("Signatures:", ret.transaction.signatures);
                            //     console.log("Message:", ret.transaction.message);
                            // }
                            const status = await connection.getSignatureStatus(signatures[i]);
                            if (status) {
                                console.log("Context:", status.context, "Value:", status.context.value);
                            }
                            passed[i] = true;
                        }
                    }
                }

                let done = true;
                for (let i = 0; i < rawTransactions.length; i++) {
                    if (!passed[i]) {
                        done = false;
                        break;
                    }
                }

                if (done)
                    return true;

                await sleep(500);
            }
        }
        catch (err) {
            console.log(err);
        }
        retries--;
    }

    return false;
}

exports.getWalletTokenAccount = async (connection, wallet) => {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
}

exports.getPoolInfo = async (connection, token) => {
    console.log("Getting pool info...", token);

    if (!token) {
        console.log("Invalid token address");
        return {};
    }
    
    const mint = new PublicKey(token);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, token, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const PROGRAMIDS = process.env.DEVNET_MODE === "true" ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
    const marketAccounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (marketAccounts.length === 0) {
        console.log("Not found market info");
        return {};
    }

    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccounts[0].accountInfo.data);
    let poolKeys = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 4,
        baseMint: baseToken.mint,
        quoteMint: quoteToken.mint,
        baseDecimals: baseToken.decimals,
        quoteDecimals: quoteToken.decimals,
        marketId: marketAccounts[0].publicKey,
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
    });
    poolKeys.marketBaseVault = marketInfo.baseVault;
    poolKeys.marketQuoteVault = marketInfo.quoteVault;
    poolKeys.marketBids = marketInfo.bids;
    poolKeys.marketAsks = marketInfo.asks;
    poolKeys.marketEventQueue = marketInfo.eventQueue;

    const poolInfo = poolKeys2JsonInfo(poolKeys);
    return poolInfo;
}
