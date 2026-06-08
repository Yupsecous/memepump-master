const axios = require("axios");
const bs58 = require("bs58");
const {
    bundle: { Bundle },
} = require("jito-ts");

const JITO_TIMEOUT = 150000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

exports.getTipAccounts = async () => {
    try {
        const { data } = await axios.post(`https://${process.env.JITO_MAINNET_URL}/api/v1/bundles`,
            {
                jsonrpc: "2.0",
                id: 1,
                method: "getTipAccounts",
                params: [],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return data.result;
    }
    catch (err) {
        console.log(err);
    }
    return [];
}

exports.getTipAccountsWithSDK = async (client) => {
    try {
        return client.getTipAccounts();
    }
    catch (err) {
        console.log(err);
        return [];
    }
}

exports.sendBundles = async (transactions) => {
    try {
        if (transactions.length === 0)
            return;
        
        console.log("Sending bundles...", transactions.length);
        let bundleIds = [];
        for (let i = 0; i < transactions.length; i++) {
            const rawTransactions = transactions[i].map(item => bs58.encode(item.serialize()));
            const { data } = await axios.post(`https://${process.env.JITO_MAINNET_URL}/api/v1/bundles`,
                {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "sendBundle",
                    params: [
                        rawTransactions
                    ],
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
            if (data) {
                console.log(data);
                bundleIds = [
                    ...bundleIds,
                    data.result,
                ];
            }
        }

        console.log("Checking bundle's status...", bundleIds);
        const sentTime = Date.now();
        while (Date.now() - sentTime < JITO_TIMEOUT) {
            try {
                const { data } = await axios.post(`https://${process.env.JITO_MAINNET_URL}/api/v1/bundles`,
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "getBundleStatuses",
                        params: [
                            bundleIds
                        ],
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (data) {
                    const bundleStatuses = data.result.value;
                    console.log("Bundle Statuses:", bundleStatuses);
                    let success = true;
                    for (let i = 0; i < bundleIds.length; i++) {
                        const matched = bundleStatuses.find(item => item && item.bundle_id === bundleIds[i]);
                        if (!matched || matched.confirmation_status !== "finalized") {
                            success = false;
                            break;
                        }
                    }

                    if (success)
                        return true;
                }
            }
            catch (err) {
                // console.log(err);
            }
            
            await sleep(1000);
        }
    }
    catch (err) {
        // console.log(err);
    }
    return false;
}

exports.sendBundlesWithSDK = async (client, transactions) => {
    try {
        console.log("Sending bundles...", transactions.length);
        let promiseBundleIds = [];
        for (let i = 0; i < transactions.length; i++) {
            const bundle = new Bundle(transactions[i], transactions[i].length);
            promiseBundleIds.push(client.sendBundle(bundle));
        }

        let code = {};
        let bundleIds = await Promise.all(promiseBundleIds);
        client.onBundleResult(
            (result) => {
                console.log("received bundle result:", result);
                let foundIndex = -1;
                for (let i = 0; i < bundleIds.length; i++) {
                    if (result.bundleId === bundleIds[i]) {
                        foundIndex = i;
                        break;
                    }
                }
                if (foundIndex < 0 || code[foundIndex] === 1)
                    return;

                // if (log)
                //     addLog("DEBUG", log.title, log.description + ": " + JSON.stringify(result));
                // else
                //     addLog("DEBUG", "Jito Execution", JSON.stringify(result));
                if (result.finalized || result.accepted)
                    code[foundIndex] = 1; // SUCCESS
                else if (result.rejected && !result.rejected.simulationFailure && !result.rejected.internalError && result.rejected.droppedBundle)
                    code[foundIndex] = 1; // SUCCESS
                else if (result.rejected && result.rejected.simulationFailure && result.rejected.simulationFailure.msg.includes("error=This transaction has already been processed"))
                    code[foundIndex] = 1; // SUCCESS
            },
            (err) => {
                console.log(err);
            }
        );

        const sentTime = Date.now();
        let success = false;
        while (!success) {
            success = true;
            for (let i = 0; i < bundleIds.length; i++) {
                if (!code[i]) {
                    success = false;
                    break;
                }
            }

            if (Date.now() - sentTime >= JITO_TIMEOUT)
                break;
            await sleep(1000);
        }

        return success;
    }
    catch (err) {
        console.log(err);
    }

    return false;
}
