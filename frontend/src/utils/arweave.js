
import Arweave from "arweave";
import { key } from "./key";

const arweave = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
    timeout: 20000,
    logging: false,
});

export const uploadFile = async ( file) => {

    const fileType = file.type || "application/octet-stream"; // Default type if not available
    let transaction;

    console.log(`fileType: ${fileType}, file: ${file}`)

    try {
        const buffer = await file.arrayBuffer();
        transaction = await arweave.createTransaction({ data: buffer });
        transaction.addTag("Content-Type", fileType);
        await arweave.transactions.sign(transaction, key);
    } catch (err) {
        console.log("create & sign transaction error:", err);
        throw new Error("Failed to create & sign transaction!");
    }

    let imageUrl = "";
    try {
        const response = await arweave.transactions.post(transaction);
        console.log(response);

        if(response.status === 200 && response.statusText === "OK") {
            const id = transaction.id;
            imageUrl = id ? `https://arweave.net/${id}` : "";
            // console.log("imageUrl:", imageUrl);
            return imageUrl;
        } else {
            console.error("Failed to upload file to Arweave!");
            throw new Error("Failed to upload file to Arweave!");
        }
        
        // console.log("imageUrl", imageUrl);
    } catch (err) {
        console.error("uploadLogo error: ", err);
        throw "Failed to upload file to Arweave!";
    }
}

export const uploadMetadata = async (_metadata) => {
    // Upload metadata to Arweave
    const metadata = {
        name: _metadata.name,
        symbol: _metadata.symbol,
        description: _metadata.description,
        image: _metadata.image,
        website: _metadata.website,
        twitter: _metadata.twitter,
        telegram: _metadata.telegram
    };
    const metadataRequest = JSON.stringify(metadata);

    const metadataTransaction = await arweave.createTransaction({
        data: metadataRequest,
    });
    metadataTransaction.addTag("Content-Type", "application/json");

    let metadataURL = "";
    try {
        await arweave.transactions.sign(metadataTransaction, key);
        await arweave.transactions.post(metadataTransaction);

        metadataURL = metadataTransaction.id ? `https://arweave.net/${metadataTransaction.id}` : "";
        // console.log("metadataURL:", metadataURL);
        return metadataURL;

    } catch (err) {
        console.error("Upload metadata error: ", err);
        return ""
    }
}