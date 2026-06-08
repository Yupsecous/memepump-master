const {
    Keypair,
    Connection,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
// const fs = require("fs");
const bs58 = require("bs58");
const {
    searcher: { searcherClient },
    bundle: { Bundle },
} = require("jito-ts");

const MEMO_PROGRAM_ID = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";

const isError = (value) => {
    return value instanceof Error;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const onAccountUpdates = async (
    client/*: SearcherClient*/,
    accounts/*: PublicKey[]*/,
    regions/*: string[]*/,
    bundleTransactionLimit/*: number*/,
    keypair/*: Keypair*/,
    tipAccount/*: PublicKey*/,
    connection/*: Connection*/
) => {
    client.onAccountUpdate(
        accounts,
        regions,
        async (transactions/*: VersionedTransaction[]*/) => {
            console.log(`received ${transactions.length} transactions`);
            const resp = await connection.getLatestBlockhash("processed");
            const bundles = transactions.map(tx => {
                const b = new Bundle([tx], bundleTransactionLimit);
                let maybeBundle = b.addTransactions(buildMemoTransaction(keypair, resp.blockhash));
                if (isError(maybeBundle)) {
                    throw maybeBundle;
                }

                maybeBundle = maybeBundle.addTipTx(
                    keypair,
                    100_000_000,
                    tipAccount,
                    resp.blockhash
                );
                
                if (isError(maybeBundle)) {
                    throw maybeBundle;
                }
                
                return maybeBundle;
            });
  
            bundles.map(async b => {
                try {
                    const resp = await client.sendBundle(b);
                    console.log("resp:", resp);
                }
                catch (e) {
                    console.error("error sending bundle:", e);
                }
            });
        },
        (e/*: Error*/) => {
            throw e;
        }
    );
};

const buildMemoTransaction = (
    keypair/*: Keypair*/,
    recentBlockhash/*: string*/
)/*: VersionedTransaction*/ => {
    const ix = new TransactionInstruction({
        keys: [
            {
                pubkey: keypair.publicKey,
                isSigner: true,
                isWritable: true,
            },
        ],
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from("Jito Backrun"),
    });
    
    const instructions = [ix];
    const messageV0 = new TransactionMessage({
        payerKey: keypair.publicKey,
        recentBlockhash: recentBlockhash,
        instructions,
    }).compileToV0Message();
  
    const tx = new VersionedTransaction(messageV0);
    tx.sign([keypair]);
    
    return tx;
};

const BLOCK_ENGINE_URL = "block-engine.mainnet.frankfurt.jito.wtf";
// const AUTH_PRIV_KEY = "4pEYjBH7LTpRm11GYSJQz4PvUmRKZ1kApymZ1znYnogu9bfx77aSYeCZ5pjBexQcPHsHjngdyXFgN4E2hSH8VhV"; // Allowed
// const AUTH_PRIV_KEY = "2Wbp7TVRRcTrUJNc3DkUtcDQ5seBUM6qSKvA9yuoDCMsojZAGZB3mHVrZwjrtBF1e13VGzB81P4a8XUJb3jQYcyx"; // Allowed
// const AUTH_PRIV_KEY = "mfUPGpCUVhftsJc9KCran2xUhvRbt9C99omrgTrJWesq1tSvfh5q1SsYZiUSdFyaKJJJ3mQ9HykXieHw9zRaDV3"; // Allowed
const ACCOUNTS_OF_INTEREST = "Cx3GHKb8WRdXzyAkzBbH6YdBgrUDBrbEZ6nNWwLVc5Qz";
const BUNDLE_TRANSACTION_LIMIT = 5;
const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=fff6a34b-479e-49e7-9903-b04bddcdc463";

const main = async () => {
    // console.log("BLOCK_ENGINE_URL:", BLOCK_ENGINE_URL);

    // const localKeypair = Keypair.generate();
    // console.log(localKeypair.publicKey.toBase58());
    // console.log(bs58.encode(localKeypair.secretKey));

    const keypair = Keypair.fromSecretKey(bs58.decode("3kveXx1cDCVmM6bajczDmpZgkaxW1TSTFMvzupH42vjYJZ21PzvTocneGrGkGDi23CnMpraUWPpx8BYQyMwGZNiV"));
    console.log("Auth Signer:", keypair.publicKey.toBase58());

    // const _accounts = (ACCOUNTS_OF_INTEREST).split(",");
    // console.log("ACCOUNTS_OF_INTEREST:", _accounts);
    // const accounts = _accounts.map(a => new PublicKey(a));

    const client = searcherClient(BLOCK_ENGINE_URL, keypair);

    // console.log("RPC_URL:", RPC_URL);

    const _tipAccount = (await client.getTipAccounts())[0];
    console.log("Tip Account:", _tipAccount);
    // const tipAccount = new PublicKey(_tipAccount);
    
    // const connection = new Connection(RPC_URL, "confirmed");
    // await onAccountUpdates(
    //     client,
    //     accounts,
    //     [],
    //     BUNDLE_TRANSACTION_LIMIT,
    //     keypair,
    //     tipAccount,
    //     connection
    // );

    // const keypair1 = Keypair.fromSecretKey(bs58.decode("2M5DNyv98yX6ei9nz7P47qbyzDu9EbxA2ScR1W7AqkAmVNkSWc2R6KmpMTJCoxoTbUWjkQoisFRsNk9FusEAaKk3"));
    // // const keypair2 = Keypair.fromSecretKey(bs58.decode("v3dqy3A68TPoA3AMT23EbUcBJVCEHUqeyZyZLMuZjit6erRMN2BoQRPg8shUycJ6iAfXJLHmaTY5Djx44eXA333"));
    // const toPubkey = new PublicKey("322xCwXaF2kDVW2VQQoyqYfoYwU1gVtsCk8FLxtXuiEu");
    // console.log("Keypair 1:", keypair1.publicKey.toBase58());
    // console.log("Keypair 2:", keypair2.publicKey.toBase58());

    // const resp = await connection.getLatestBlockhash("processed");

    // const tx1 = new VersionedTransaction(new TransactionMessage({
    //     payerKey: keypair1.publicKey,
    //     recentBlockhash: resp.blockhash,
    //     instructions: [
    //         SystemProgram.transfer({
    //             fromPubkey: keypair1.publicKey,
    //             toPubkey: tipAccount,
    //             lamports: LAMPORTS_PER_SOL * 0.001,
    //         }),
    //         SystemProgram.transfer({
    //             fromPubkey: keypair1.publicKey,
    //             toPubkey: toPubkey,
    //             lamports: LAMPORTS_PER_SOL * 0.1,
    //         }),
    //     ],
    // }).compileToV0Message());
    // tx1.sign([keypair1]);

    // const tx2 = new VersionedTransaction(new TransactionMessage({
    //     payerKey: keypair1.publicKey,
    //     recentBlockhash: resp.blockhash,
    //     instructions: [
    //         SystemProgram.transfer({
    //             fromPubkey: keypair1.publicKey,
    //             toPubkey: toPubkey,
    //             lamports: LAMPORTS_PER_SOL * 0.2,
    //         })
    //     ],
    // }).compileToV0Message());
    // tx2.sign([keypair1]);

    // let b = new Bundle([tx1, tx2], 5);
    // b = b.addTransactions([]);
    // if (isError(b)) {
    //     console.log("Failed to add transactions", b);
    //     return;
    // }

    // b = b.addTipTx(keypair1, 1000000, tipAccount, resp.blockhash);
    // if (isError(b)) {
    //     console.log("Failed to add tip tx", b);
    //     return;
    // }

    // try {
    //     let code = 0;
    //     const resp = await client.sendBundle(b);
    //     // console.log("response:", resp);
    //     client.onBundleResult(
    //         (result) => {
    //             if (result.bundleId !== resp)
    //                 return;
    //             console.log("received bundle result:", result);
    //             if (result.finalized)
    //                 code = 1; // SUCCESS
    //             else if (result.rejected) {
    //                 if (result.rejected.simulationFailure && result.rejected.simulationFailure.msg.includes("This transaction has already been processed"))
    //                     return;
    //                 code = 2; // FAIL
    //             }
    //         },
    //         (err) => {
    //             console.log(err);
    //         }
    //     );

    //     const sentTime = Date.now();
    //     while (!code) {
    //         const curTime = Date.now();
    //         if (curTime - sentTime >= 30000) // 30s timeout
    //             break;
    //         await sleep(100);
    //     }

    //     if (code === 1)
    //         console.log("Success");
    //     else
    //         console.log("Failed");
    // }
    // catch (e) {
    //     console.log("error sending bundle:", e);
    // }
};

main();
