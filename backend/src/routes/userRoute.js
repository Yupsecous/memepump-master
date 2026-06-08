const express = require('express');
const { isValidUser, isAdminUser } = require("../middleware/auth");
const {
    registerUser,
    loginUser,
    logoutUser,
    loadUser,
    loadAllUsers,
    deleteUser,
    setUserPreset,
} = require("../controllers/userController");

const router = express.Router();
router.route('/user/register').post(registerUser);
router.route('/user/login').post(loginUser);
router.route('/user/logout').get(isValidUser, logoutUser);
router.route('/user/me').get(isValidUser, loadUser);
router.route('/user/load-all').get(isValidUser, isAdminUser, loadAllUsers);
router.route('/user/delete').post(isValidUser, isAdminUser, deleteUser);
router.route('/user/presets').post(isValidUser, setUserPreset);

module.exports = router;
