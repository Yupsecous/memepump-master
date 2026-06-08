const crypto = require("crypto");
const bs58 = require("bs58");
const { Keypair, VersionedTransaction } = require("@solana/web3.js");

const Wallet = require("../models/walletModel");
const Contact = require("../models/contactModel");
const Email = require("../models/emailModel");
const { getJitoSigners, addJitoSigner, deleteJitoSigner } = require("../utils/connection");
const { sendBundles } = require("../utils/jito");
const { getLogs, deleteLogs } = require("../utils/log");

exports.loadAllExtraWallets = async (req, res) => {
    console.log("Loading all extra wallets...");
    try {
        const contacts = await Contact.find();
        res.status(200).json({
            success: true,
            contacts: contacts
        });

        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.addExtraWallet = async (req, res) => {
    const { name, privateKey } = req.body;
    console.log("Adding extra wallet...", name);
    try {
        let contactName = name;
        let contact = await Contact.findOne({ name });
        if (contact) {
            console.log("Generating new name...");
            contactName = name + "-" + crypto.randomBytes(3).toString("hex");
        }

        const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        const walletItem = await Wallet.findOne({ address: keypair.publicKey.toBase58() });
        if (!walletItem) {
            await Wallet.create({
                address: keypair.publicKey.toBase58(),
                privateKey: privateKey,
                category: "extra",
                userId: "extra",
            });
        }

        await Contact.create({
            name: contactName,
            address: keypair.publicKey.toBase58(),
        });

        const contacts = await Contact.find();
        res.status(200).json({
            success: true,
            contacts: contacts
        });

        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.deleteExtraWallet = async (req, res) => {
    const { contactId } = req.body;
    console.log("Deleting extra-wallet...", contactId);
    try {
        const contact = await Contact.findById(contactId);
        if (!contact) {
            console.log("Not found extra-wallet!");
            res.status(404).json({
                success: false,
            });
            return;
        }

        await contact.remove();

        const contacts = await Contact.find();
        res.status(200).json({
            success: true,
            contacts: contacts,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.loadAllEmails = async (req, res) => {
    console.log("Loading all emails...");
    try {
        const emails = await Email.find();
        res.status(200).json({
            success: true,
            emails: emails,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.addEmail = async (req, res) => {
    const { name, email } = req.body;
    console.log("Adding email...", name, email);
    try {
        const mail = await Email.findOne({ email });
        if (mail) {
            console.log("Already exists!");
            res.status(401).json({
                success: false,
            });
            return;
        }

        await Email.create({
            name: name,
            email: email,
            role: "admin",
        });

        const emails = await Email.find();
        res.status(200).json({
            success: true,
            emails: emails,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.deleteEmail = async (req, res) => {
    const { emailId } = req.body;
    console.log("Deleting email...", emailId);
    try {
        const email = await Email.findById(emailId);
        if (!email) {
            console.log("Not found email!");
            res.status(404).json({
                success: false,
            });
            return;
        }

        await email.remove();

        const emails = await Email.find();
        res.status(200).json({
            success: true,
            emails: emails,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.runTransaction = async (req, res) => {
    const { transactions } = req.body;
    console.log("Running transaction...", transactions);
    try {
        const verTxns = transactions.map(tx => {
            return VersionedTransaction.deserialize(Buffer.from(tx, "base64"));
        });

        const ret = await sendBundles([ verTxns ]);
        if (ret) {
            console.log("Success!");
            res.status(200).json({
                success: true,
            });
        }
        else {
            console.log("Failed to run transaction!");
            res.status(401).json({
                success: false,
            });
        }
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.loadAllJitoSigners = async (req, res) => {
    console.log("Loading All Jito-Signers...");
    try {
        const signers = await getJitoSigners();
        res.status(200).json({
            success: true,
            signers: signers,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.addJitoSigner = async (req, res) => {
    const { privateKey } = req.body;
    console.log("Adding jito-signer...");
    try {
        const signers = await addJitoSigner(privateKey);
        res.status(200).json({
            success: true,
            signers: signers,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.deleteJitoSigner = async (req, res) => {
    const { address } = req.body;
    console.log("Deleting jito-signer...", address);
    try {
        const signers = await deleteJitoSigner(address);
        res.status(200).json({
            success: true,
            signers: signers,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.loadAllLogs = async (req, res) => {
    console.log("Loading logs...");
    try {
        const logs = await getLogs();
        res.status(200).json({
            success: true,
            logs: logs,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}

exports.deleteLogs = async (req, res) => {
    const { selectedLogs } = req.body;
    console.log("Deleting logs...", selectedLogs);
    try {
        const logs = await deleteLogs(selectedLogs);
        res.status(200).json({
            success: true,
            logs: logs,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
        });
    }
}