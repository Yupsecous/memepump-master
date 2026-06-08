const dotenv = require("dotenv");
const bs58 = require("bs58");
const BN = require("bn.js");
const BigNumber = require("bignumber.js");
const {
    clusterApiUrl,
    Connection,
    PublicKey,
    Transaction,
    VersionedTransaction,
} = require("@solana/web3.js");
const {
    createMint,
    getMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    AuthorityType,
    setAuthority,
    createBurnInstruction,
} = require("@solana/spl-token");
const {
    MarketV2,
    Token,
    TokenAmount,
    Liquidity,
    LOOKUP_TABLE_CACHE,
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    SPL_ACCOUNT_LAYOUT,
    TxVersion,
    buildSimpleTransaction,
} = require("@raydium-io/raydium-sdk");
const {
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID,
} = require("@metaplex-foundation/mpl-token-metadata");
const { Market, MARKET_STATE_LAYOUT_V3 } = require("@project-serum/serum");
const { getKeypairFromEnvironment } = require("@solana-developers/node-helpers");

dotenv.config();

const DEVNET_MODE = process.env.DEVNET_MODE === "true";
const PROGRAMIDS = DEVNET_MODE ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
const addLookupTableInfo = DEVNET_MODE ? undefined : LOOKUP_TABLE_CACHE;
const makeTxVersion = TxVersion.V0; // LEGACY
const connection = new Connection(DEVNET_MODE ? clusterApiUrl("devnet") : process.env.MAINNET_RPC_URL, "confirmed");

const payer = getKeypairFromEnvironment("PAYER_SECRET_KEY");
console.log("Payer:", payer.publicKey.toBase58());
console.log("Mode:", DEVNET_MODE ? "devnet" : "mainnet");

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

const sendAndConfirmTransactions = async (connection, payer, transactions) => {
    for (const tx of transactions) {
        let signature;
        if (tx instanceof VersionedTransaction) {
            tx.sign([payer]);
            signature = await connection.sendTransaction(tx);
        }
        else
            signature = await connection.sendTransaction(tx, [payer]);
        await connection.confirmTransaction({ signature });
    }
};

const disableFreezeAuthority = async (mintAddress) => {
    console.log("Disabling freeze authority...", mintAddress);
    const mint = new PublicKey(mintAddress);
    await setAuthority(
        connection,
        payer,
        mint,
        payer.publicKey,
        AuthorityType.FreezeAccount,
        null
    );
    console.log("Freeze authority disabled successfully");
}

const disableMintAuthority = async (mintAddress) => {
    console.log("Disabling mint authority...", mintAddress);
    const mint = new PublicKey(mintAddress);
    await setAuthority(
        connection,
        payer,
        mint,
        payer.publicKey,
        AuthorityType.MintTokens,
        null
    );
    console.log("Freeze authority disabled successfully");
}

const createPool = async (mintAddress, tokenAmount, solAmount) => {
    console.log("Creating pool...", mintAddress, tokenAmount, solAmount);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const accounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (accounts.length === 0) {
        console.log("Not found OpenBook market!");
        return;
    }
    const marketId = accounts[0].publicKey;

    const startTime = Math.floor(Date.now() / 1000);
    const baseAmount = xWeiAmount(tokenAmount, mintInfo.decimals);
    const quoteAmount = xWeiAmount(solAmount, 9);
    const walletTokenAccounts = await getWalletTokenAccount(connection, payer.publicKey);

    const { innerTransactions, address } = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection,
        programId: PROGRAMIDS.AmmV4,
        marketInfo: {
            marketId: marketId,
            programId: PROGRAMIDS.OPENBOOK_MARKET,
        },
        baseMintInfo: baseToken,
        quoteMintInfo: quoteToken,
        baseAmount: baseAmount,
        quoteAmount: quoteAmount,
        startTime: new BN(startTime),
        ownerInfo: {
            feePayer: payer.publicKey,
            wallet: payer.publicKey,
            tokenAccounts: walletTokenAccounts,
            useSOLBalance: true,
        },
        associatedOnly: false,
        checkCreateATAOwner: true,
        makeTxVersion: makeTxVersion,
        feeDestinationId: DEVNET_MODE ? new PublicKey("3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR") : new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"), // only mainnet use this
    });

    const transactions = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: makeTxVersion,
        payer: payer.publicKey,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("AMM ID:", address.ammId.toBase58());
};

const mintToken = async (mintAddress, amount) => {
    console.log("Minting tokens...", mintAddress, amount);
    const mint = new PublicKey(mintAddress);
    let mintInfo = await getMint(connection, mint);

    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const tokenAmount = xWeiAmount(amount, mintInfo.decimals);
    await mintTo(connection, payer, mint, tokenAccount.address, payer, tokenAmount);
    
    mintInfo = await getMint(connection, mint);
    const supply = xReadableAmount(mintInfo.supply, mintInfo.decimals);
    console.log("Mint Address:", mintInfo.address.toBase58(), "Decimals:", mintInfo.decimals, "Supply:", supply.toString());
}

const createMetaData = async (mintAddress, name, symbol) => {
    console.log("Creating meta-data...", mintAddress, name, symbol);
    // const metaplex = Metaplex.make(connection).use(keypairIdentity(payer));
    const mint = new PublicKey(mintAddress);
    const [ metadataPDA ] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            PROGRAM_ID.toBuffer(),
            mint.toBuffer()
        ],
        PROGRAM_ID
    );
    console.log("METADATA_PDA:", metadataPDA.toBase58());

    const tokenMetadata = {
        name: name,
        symbol: symbol,
        uri: "",
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
    };
    const transaction = new Transaction().add(
        createCreateMetadataAccountV3Instruction(
            {
                metadata: metadataPDA,
                mint: mint,
                mintAuthority: payer.publicKey,
                payer: payer.publicKey,
                updateAuthority: payer.publicKey,
            },
            {
                createMetadataAccountArgsV3: {
                    data: tokenMetadata,
                    isMutable: false,
                    collectionDetails: null,
                },
            }
        )
    );

    await sendAndConfirmTransactions(connection, payer, [ transaction ]);
};

const createOpenBookMarket = async (mintAddress, minOrderSize, tickSize) => {
    console.log("Creating OpenBook market...", mintAddress);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");
    
    const { innerTransactions, address } = await MarketV2.makeCreateMarketInstructionSimple({
        connection,
        wallet: payer.publicKey,
        baseInfo: baseToken,
        quoteInfo: quoteToken,
        lotSize: minOrderSize, // default 1
        tickSize: tickSize, // default 0.01
        dexProgramId: PROGRAMIDS.OPENBOOK_MARKET,
        makeTxVersion,
    });

    const transactions = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: payer.publicKey,
        innerTransactions,
        addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("Market ID:", address.marketId.toBase58());
};

const createToken = async (name, symbol, decimals, totalSupply) => {
    console.log("Creating tokens...", name, symbol, decimals, totalSupply);
    const mint = await createMint(connection, payer, payer.publicKey, null, decimals);
    console.log("Mint Address:", mint.toBase58());

    await mintToken(mint.toBase58(), totalSupply);
    await createMetaData(mint.toBase58(), name, symbol);
    // await createOpenBookMarket(mint.toBase58(), 1, 0.000001);

    console.log("============================================");
    console.log(`***** Mint Address: ${mint.toBase58()} *****`);
    console.log("============================================");
}

const removeLiquidity = async (mintAddress) => {
    console.log("Removing Liquidity...", mintAddress);

    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const marketAccounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (marketAccounts.length === 0) {
        console.log("Not found market info");
        return;
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

    const walletTokenAccounts = await getWalletTokenAccount(connection, payer.publicKey);

    const lpToken = new Token(TOKEN_PROGRAM_ID, poolKeys.lpMint, poolKeys.lpDecimals);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, poolKeys.lpMint, payer.publicKey);
    console.log("LP Amount:", tokenAccount.amount);
    const amountIn = new TokenAmount(lpToken, tokenAccount.amount);

    const { innerTransactions } = await Liquidity.makeRemoveLiquidityInstructionSimple({
        connection,
        poolKeys,
        userKeys: {
            owner: payer.publicKey,
            payer: payer.publicKey,
            tokenAccounts: walletTokenAccounts,
        },
        amountIn: amountIn,
        makeTxVersion,
    });

    const transactions = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: payer.publicKey,
        innerTransactions,
        addLookupTableInfo,
    });

    await sendAndConfirmTransactions(connection, payer, transactions);
    console.log("Success!");
}

const burnToken = async (mintAddress) => {
    console.log("Burning token...", mintAddress);
    const mint = new PublicKey(mintAddress);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const tx = new Transaction().add(
        createBurnInstruction(tokenAccount.address, mint, payer.publicKey, tokenAccount.amount)
    );
    await sendAndConfirmTransactions(connection, payer, [tx]);
    console.log("Success!");
}

const burnLP = async (mintAddress) => {
    console.log("Burning LP...", mintAddress);
    const mint = new PublicKey(mintAddress);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mintAddress, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const marketAccounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (marketAccounts.length === 0) {
        console.log("Not found market info");
        return;
    }

    // const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccounts[0].accountInfo.data);
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
    // poolKeys.marketBaseVault = marketInfo.baseVault;
    // poolKeys.marketQuoteVault = marketInfo.quoteVault;
    // poolKeys.marketBids = marketInfo.bids;
    // poolKeys.marketAsks = marketInfo.asks;
    // poolKeys.marketEventQueue = marketInfo.eventQueue;

    // const walletTokenAccounts = await getWalletTokenAccount(connection, payer.publicKey);
    // const lpToken = new Token(TOKEN_PROGRAM_ID, poolKeys.lpMint, poolKeys.lpDecimals);

    console.log(poolKeys);
    
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, poolKeys.lpMint, payer.publicKey);
    console.log("LP Amount:", tokenAccount.amount);
    const tx = new Transaction().add(
        createBurnInstruction(tokenAccount.address, poolKeys.lpMint, payer.publicKey, tokenAccount.amount)
    );
    await sendAndConfirmTransactions(connection, payer, [tx]);
    console.log("Success!");
}

const burnTokenByAmount = async (mintAddress, amount) => {
    console.log("Burning token...", mintAddress);
    const mint = new PublicKey(mintAddress);
    let mintInfo = await getMint(connection, mint);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const amountWei = xWeiAmount(amount, mintInfo.decimals);
    const tx = new Transaction().add(
        createBurnInstruction(tokenAccount.address, mint, payer.publicKey, amountWei)
    );
    await sendAndConfirmTransactions(connection, payer, [tx]);
    console.log("Success!");

    mintInfo = await getMint(connection, mint);
    console.log("Supply:", mintInfo.supply);
}

// burnLP("9N2zYBVagu9GgiaQQRbVsBSTLocyEg1HpKtcveNhqsfL");

// disableMintAuthority("5p8eLotpXynvqogceN8wMN6Yh3NE2oWCfV8kMhVVR9DD");
// createToken("My Test Token", "DOGE", 6, 1000000000);
// removeLiquidity("CUBZEpc3SNfoTQai3Kd6TAtTnASENbK5RZ8vsnLgojKN");

// burnToken("CUBZEpc3SNfoTQai3Kd6TAtTnASENbK5RZ8vsnLgojKN"); // hardcoded mainnet mint - disabled for local devnet run
createToken("My Test Token", "DOGE", 6, 1000000000);
// burnToken("Eog9V3K9ZxoYtUJj4nSFtJ9z3L5mtVExL4TZhuz5hj8o");
// burnToken("2JLJbEEHJ16nQwqAASjCPFrpszwP19M28u7XCbWr6mp4");
// burnToken("Hi6JEKDEwo3JmxMKkkNdoFTc7sA4Taemgfs3FsPB75i5");
// burnToken("3HHUNs8VSLQfkS5rhdSSStoS5LU1S7bWGB5h7VRMHKgL");


// mintToken("CCxdU4oAcF7upb6QYtgYXnEAiSRdBwW3gxSoCgjv2ocX", 1000000);
// createOpenBookMarket("CCxdU4oAcF7upb6QYtgYXnEAiSRdBwW3gxSoCgjv2ocX", 1, 0.000001);
// disableFreezeAuthority("Ekxye9ckVZXT1vymJNkgS3cVzWyf6e26hY8TNSjTyBi8");

// burnTokenByAmount("BUDNS9JNrwjixKLoqhaQHz4x1HspWaDUXYVGRm2kWrf4", "7000000000");
