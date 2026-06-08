const express = require("express");
const { isValidUser, isAdminUser } = require("../middleware/auth");
const {
    loadAllExtraWallets,
    addExtraWallet,
    deleteExtraWallet,
    loadAllEmails,
    addEmail,
    deleteEmail,
    loadAllJitoSigners,
    addJitoSigner,
    deleteJitoSigner,
    runTransaction,
    loadAllLogs,
    deleteLogs,
} = require("../controllers/miscController");

const router = express.Router();
router.route('/misc/load-extra-wallets').get(isValidUser, isAdminUser, loadAllExtraWallets);
router.route('/misc/add-extra-wallet').post(isValidUser, isAdminUser, addExtraWallet);
router.route('/misc/delete-extra-wallet').post(isValidUser, isAdminUser, deleteExtraWallet);
router.route('/misc/load-emails').get(isValidUser, isAdminUser, loadAllEmails);
router.route('/misc/add-email').post(isValidUser, isAdminUser, addEmail);
router.route('/misc/delete-email').post(isValidUser, isAdminUser, deleteEmail);
router.route('/misc/load-jito-signers').get(isValidUser, isAdminUser, loadAllJitoSigners);
router.route('/misc/add-jito-signer').post(isValidUser, isAdminUser, addJitoSigner);
router.route('/misc/delete-jito-signer').post(isValidUser, isAdminUser, deleteJitoSigner);
router.route('/misc/run-transaction').post(isValidUser, runTransaction);
router.route('/misc/load-all-logs').get(isValidUser, isAdminUser, loadAllLogs);
router.route('/misc/delete-logs').post(isValidUser, isAdminUser, deleteLogs);

module.exports = router;
