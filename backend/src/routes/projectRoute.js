const express = require("express");
const { isValidUser, isAdminUser } = require("../middleware/auth");
const {
    createProject,
    deleteProject,
    checkProject,
    activateProject,
    loadAllProjects,
    saveProject,
    generateWallets,
    downloadWallets,
    simulateBuyTokens,
    disperseSOLs,
    buyTokens,
    disperseTokens,
    sellTokens,
    transferTokens,
    collectAllSol,
    collectAllFee,
} = require("../controllers/projectController");

const router = express.Router();
router.route('/project/create').post(isValidUser, createProject);
router.route('/project/delete').post(isValidUser, deleteProject);
router.route('/project/check-status').post(isValidUser, checkProject);
router.route('/project/activate').post(isValidUser, isAdminUser, activateProject);
router.route('/project/load-all').get(isValidUser, loadAllProjects);
router.route('/project/save').post(isValidUser, saveProject);
router.route('/project/generate-wallets').post(isValidUser, generateWallets);
router.route('/project/download-wallets').post(isValidUser, downloadWallets);
router.route('/project/collect-all-sol').post(isValidUser, collectAllSol);
router.route('/project/simulate').post(isValidUser, simulateBuyTokens);
router.route('/project/disperse').post(isValidUser, disperseSOLs);
router.route('/project/buy').post(isValidUser, buyTokens);
router.route('/project/disperse-tokens').post(isValidUser, disperseTokens);
router.route('/project/sell').post(isValidUser, sellTokens);
router.route('/project/transfer').post(isValidUser, transferTokens);

router.route('/project/collect-fee').post(isValidUser, isAdminUser, collectAllFee);

module.exports = router;
