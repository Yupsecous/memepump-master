const dotenv = require("dotenv");
const bs58 = require("bs58");
const BN = require("bn.js");
const BigNumber = require("bignumber.js");
const {
    clusterApiUrl,
    Connection,
    PublicKey,
    Transaction,
    Keypair,
    SystemProgram,
    LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
    getOrCreateAssociatedTokenAccount,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
} = require("@solana/spl-token");
const {
    // MarketV2,
    // Token,
    // TokenAmount,
    // Liquidity,
    // LOOKUP_TABLE_CACHE,
    // MAINNET_PROGRAM_ID,
    // DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    SPL_ACCOUNT_LAYOUT,
    // TxVersion,
    // buildSimpleTransaction,
} = require("@raydium-io/raydium-sdk");
// const {
//     createCreateMetadataAccountV3Instruction,
//     PROGRAM_ID,
// } = require("@metaplex-foundation/mpl-token-metadata");
// const { Market, MARKET_STATE_LAYOUT_V3 } = require("@project-serum/serum");
const { getKeypairFromEnvironment } = require("@solana-developers/node-helpers");

dotenv.config();

const DEVNET_MODE = process.env.DEVNET_MODE === "true";
// const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
// const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
// const makeTxVersion = TxVersion.V0; // LEGACY
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : process.env.MAINNET_RPC_URL, "confirmed");

const payer = getKeypairFromEnvironment("PAYER_SECRET_KEY");
console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const xWeiAmount = (amount, decimals) => {
    return new BN(new BigNumber(amount.toString() + "e" + decimals.toString()).toFixed(0));
};

const xReadableAmount = (amount, decimals) => {
    return new BN(new BigNumber(amount.toString() + "e-" + decimals.toString()).toFixed(0));
};

const getWalletTokenAccount = async (connection, wallet) => {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
};

const sendAndConfirmLegacyTransaction = async (connection, transaction, signers) => {
    let retries = 50;

    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    if (signers.length > 0)
        transaction.sign(...signers);

    const rawTransaction = transaction.serialize();
    while (retries > 0) {
        try {
            const signature = await connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
                maxRetries: 1,
            });

            const sentTime = Date.now();
            while (Date.now() - sentTime <= 1000) {
                const ret = await connection.getParsedTransaction(signature);
                if (ret)
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

const sendAndConfirmVersionedTransactions = async (connection, transactions) => {
    let retries = 50;

    const rawTransactions = transactions.map(item => item.serialize());
    while (retries > 0) {
        try {
            let signatures = {};
            for (let i = 0; i < rawTransactions.length; i++) {
                signatures[i] = await connection.sendRawTransaction(rawTransactions[i], {
                    skipPreflight: true,
                    maxRetries: 1,
                });
            }
            
            const sentTime = Date.now();
            while (Date.now() - sentTime <= 1000) {
                let ret = {};
                for (let i = 0; i < rawTransactions.length; i++) {
                    ret[i] = await connection.getParsedTransaction(signatures[i], {
                        maxSupportedTransactionVersion: 0,
                    });
                }

                let done = true;
                for (let i = 0; i < rawTransactions.length; i++) {
                    if (!ret[i]) {
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

const disperseSOL = async (connection, zombieWallet, walletAddresses, solAmounts) => {
    console.log("Dispersing SOL:", walletAddresses);
    const zero = new BN(0);
    let index = 0;
    while (index < walletAddresses.length) {
        let count = walletAddresses.length - index;
        if (count > 15)
            count = 15;

        const tx = new Transaction();
        for (let i = index; i < index + count; i++) {
            const solAmount = new BN(solAmounts[i]);
            if (solAmount.gt(zero)) {
                tx.add(
                    SystemProgram.transfer({
                        fromPubkey: zombieWallet.publicKey,
                        toPubkey: new PublicKey(walletAddresses[i]),
                        lamports: solAmounts[i]
                    })
                );
            }
        }

        if (tx.instructions.length > 0) {
            console.log(`Transfer Instructions(${index}-${index + count - 1}):`, tx.instructions.length);
            const ret = await sendAndConfirmLegacyTransaction(connection, tx, [zombieWallet]);
            if (!ret) {
                console.log("Failed to disperse SOL", false);
                return;
            }
        }

        index += count;
    }
}

const createTokenAccounts = async (connection, mintAddress, zombieWallet, keypairs) => {
    console.log("Creating token account...", mintAddress);
    const mint = new PublicKey(mintAddress);
    let index = 0;
    while (index < keypairs.length) {
        let count = 0;
        let signers = [ zombieWallet ];
        const tx = new Transaction();
        for (let i = index; i < keypairs.length; i++) {
            const associatedToken = getAssociatedTokenAddressSync(mint, keypairs[i].publicKey);
            try {
                const info = await connection.getAccountInfo(associatedToken);
                if (!info) {
                    tx.add(
                        createAssociatedTokenAccountInstruction(
                            keypairs[i].publicKey,
                            associatedToken,
                            keypairs[i].publicKey,
                            mint
                        )
                    );
                    signers = [
                        ...signers,
                        keypairs[i],
                    ];

                    count++;
                    if (count === 7)
                        break;
                }
            }
            catch (err) {
                console.log(err);
            }
        }

        if (tx.instructions.length > 0) {
            console.log("Creating token account", index, index + count - 1);
            const ret = await sendAndConfirmLegacyTransaction(connection, tx, signers);
            if (!ret) {
                console.log("Failed to create token account!");
                break;
            }
        }
        else
            break;

        index += count;
    }
    console.log("Success!");
}

const transferTokens = async (connection, mintAddress, zombieWallet, transferItems) => {
    console.log("Transferring tokens...", transferItems);

    const signers = [ zombieWallet ];
    const mint = new PublicKey(mintAddress);
    let index = 0;
    while (index < transferItems.length) {
        let count = 0;
        const tx = new Transaction();
        for (let i = index; i < transferItems.length; i++) {
            if (transferItems[i].from === transferItems[i].to)
                continue;

            const from = new PublicKey(transferItems[i].from);
            const fromTokenAccount = getAssociatedTokenAddressSync(mint, from);
            if (!fromTokenAccount)
                continue;

            const to = new PublicKey(transferItems[i].to);
            const toTokenAccount = getAssociatedTokenAddressSync(mint, to);
            try {
                const info = await connection.getAccountInfo(toTokenAccount);
                if (!info) {
                    tx.add(
                        createAssociatedTokenAccountInstruction(
                            from,
                            toTokenAccount,
                            to,
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
                    from,
                    transferItems[i].tokenAmount
                )
            );

            count++;
            if (count === 5)
                break;
        }

        if (tx.instructions.length > 0) {
            console.log("Transferring tokens", index, index + count - 1);
            const ret = await sendAndConfirmLegacyTransaction(connection, tx, signers);
            if (!ret) {
                console.log("Failed to transfer tokens!");
                break;
            }
        }
        else
            break;

        index += count;
    }
    console.log("Success");
}

const test = async () => {
    const publicKeys = [
        "CuSETpnCXc92d8BN7koNMXR7KHWYXVKinocMjgtmn1Q",
        "Ca8GSrLHuXTodfLb81cmDKCh8oe1CQEJZhM7VR7nkJEW",
        "J71F2oywihXMhYSsKZmYaQ3uUMAPmcG3TEwPBCnFhAJN",
        "HZyYYgaxEGpeB8VYkX8YeLsvfdc6SdH6oig3ekG1sbyG",
        "9T2jggJR2m8Jf1YZAzEEZ6GXizLBLCNKwofAWrhH9HxL",
        "2nbKmpMbkqA7fphVLQd5sZtZpXTfrTntU6bUNvjN1b7z",
        "3LFvixkvSHEQSFenxQinsmmtKceM59NyLXAd3XKL8Zkv",
        "66PguiYb1qbHRuiQEHzUNpcZLYYYcW14bwCSyPFSqCcd",
        "DXVJfDzv8YtTKfW64VhNjbtZCw7V7xToxXubhCpgJsn8",
        "GRVTmL1uzypsspW8M9SBNQ4Qv2KeQZMf8i1QZJMgZCix",
        "7491zkw1BdF27NtgxEPjrVb2bxpRT36DbLE2mNqBW8bK",
        "FRwo6MJdaZdk5sUtcmNW9jT6j2pHTSPExQF7xyW8AB5m",
        "3TYyD3GGxJva22c1Nd6sE7AAbfM452VYzNj9md1mgehE",
        "H5t3KVHctrVr8rmSPDcBLAJZxC958HF8orxp9eiAVPwL",
        "GRnjJ1EaipnHf2LDkTYqeg78xcWQmS1HKnYvk9VNcF3q",
        "CY9JvHqVrUaHCW5wA9oUso9iqe3qdKzSCtFmUgHNPpMW",
        "64RHNphxQTtfgnsPbT7NgfCHsRbFERs6mXcMDfKE6JfN",
        "Gzt83yZmuH58hxkkWgX2AzczYUcQHhbSeyctD5MkYdG6",
        "FiL88TRZsGQZAyD8Bzw3YxCUp6nUYxiFiBRivqLKjNCs",
        "A1MYyZ2jCeRdy8Gqw4cFmo8myprndDyf5KJGpWjKqQhE",
        "5AQdcDEVi72bpWJ7uJdava5HYsZ3Mci4b11C6YhTYVo3",
        "8E6haG3xqnj2gfbRf23AhHK9MqANiZZNJb8obFKGJ8zc",
        "CmqFtdmxf2kxWHXFrUVtWzzNdebYEQGHDJ1FQ6pAx3Xk",
        "8PUnZL2Zpj5VbxdXTWoToGg9QBxDkGLsZiJRdyUrePMT",
    ];
    // const createATAFee = new BN(0.006 * LAMPORTS_PER_SOL);
    // const walletAddresses = keypairs.map(item => item.publicKey.toBase58());
    // const solAmounts = keypairs.map(item => createATAFee);
    // await disperseSOL(connection, payer, walletAddresses, solAmounts);
    // await createTokenAccounts(connection, "JBvoPaBwV6dstSYumhp42UegHMNW8dSnMFqhwJF6SqKB", payer, keypairs);
    const transferItems = publicKeys.map(item => {
        return {
            from: payer.publicKey.toBase58(),
            to: item,
            tokenAmount: "10000000000000",
        };
    });
    await transferTokens(connection, "JBvoPaBwV6dstSYumhp42UegHMNW8dSnMFqhwJF6SqKB", payer, transferItems);
}

test();
