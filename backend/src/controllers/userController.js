const crypto = require("crypto");

const User = require("../models/userModel");
const Email = require("../models/emailModel");
const sendEmail = require("../utils/sendEmail");

exports.registerUser = async (req, res) => {
    const { name, password, referral } = req.body;
    console.log("Register user...", name, referral);

    try {
        const generalUser = await User.findOne({ name: name, role: "user" });
        const adminUser = await User.findOne({ name: name, role: "admin" });
        if (generalUser || adminUser) {
            res.status(401).json({
                success: false,
                error: "User already exists",
            });
            return;
        }
       
        /*const user =*/ await User.create({
            name, 
            password,
            role: "user",
            code: crypto.randomBytes(8).toString("hex"),
            referral: referral ? referral : "",
            presets: {
                jitoTip: 0.005,
            }
        });
        // console.log("User Info:", user);
    
        const refUser = referral ? await User.findOne({ code: referral }) : null;
        const html = `<p>Name: "${name}"</p><p>Password: "${password}"</p><p>Referral: ${refUser ? refUser.name : ""}</p>`;
        const mails = await Email.find();
        let pendings = [];
        for (let i = 0; i < mails.length; i++) {
            pendings = [
                ...pendings,
                sendEmail({
                    to: mails[i].email,
                    subject: process.env.SUBJECT_FOR_REGISTER_USER,
                    html: html
                }, async (err, data) => {
                    if (err || data.startsWith("Error")) {
                        console.log(err);
                        return;
                    }
        
                    console.log('Mail sent successfully with data: ' + data);
                })
            ];
        }
        await Promise.all(pendings);
    
        res.status(200).json({
            success: true,
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.loginUser = async (req, res) => {
    const { name, password } = req.body;
    console.log("Login user...", name);

    try {
        if (!name || !password) {
            console.log("Invalid user name or password!");
            res.status(404).json({
                success: false,
            });
            return;
        }

        let user = await User.findOne({ name: name, role: "user" }).select("+password");
        if (!user) {
            user = await User.findOne({ name: name, role: "admin" }).select("+password");
            if (!user) {
                console.log("Invalid user name or password!");
                res.status(404).json({
                    success: false,
                });
                return;
            }
        }
        
        const isPasswordMatched = await user.comparePassword(password);
        if (!isPasswordMatched) {
            console.log("Invalid password!");
            res.status(404).json({
                success: false,
            });
            return;
        }

        user = await User.findOne({ name: name, role: user.role }).select("-password");
        if (!user.presets || !user.presets.jitoTip) {
            user.presets = {
                jitoTip: 0.005,
            };
            await user.save();
        }
        console.log("User Info:", user);

        res.status(200).json({
            success: true,
            user: user,
            accessToken: user.getJWTToken(),
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.logoutUser = async (req, res) => {
    try {
        console.log("Logout user...", req.user.name);

        //const origin = req.get('origin');
        //res.header("Access-Control-Allow-Origin", origin);
        //res.header("Access-Control-Allow-Credentials", "true");
        //res.cookie("token", null, {
        //    expires: new Date(Date.now()),
        //    httpOnly: true,
        //});
    
        res.status(200).json({
            success: true,
            message: "Logged Out",
        });
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.loadUser = async (req, res) => {
    console.log("Loading user...", req.user.name);
    const user = await User.findById(req.user.id).select("-password");
    if (!user.presets || !user.presets.jitoTip) {
        user.presets = {
            jitoTip: 0.005,
        };
        await user.save();
    }
    console.log("User Info:", user);
    //const origin = req.get('origin');
    //res.header("Access-Control-Allow-Origin", origin);
    //res.header("Access-Control-Allow-Credentials", "true");
    res.status(200).json({
        success: true,
        user,
    });
}

exports.loadAllUsers = async (req, res) => {
    console.log("Lading all users...");
    try {
        const users = await User.find({ role: { "$ne": "admin" }});
        res.status(200).json({
            success: true,
            users: users,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.deleteUser = async (req, res) => {
    const { userId } = req.body;
    console.log("Deleting user...", userId);
    try {
        const user = await User.findById(userId);
        if (!user) {
            console.log("Not found user!");
            res.status(404).json({
                success: false,
            });
            return;
        }

        await user.remove();

        const users = await User.find({ role: { "$ne": "admin" }});
        res.status(200).json({
            success: true,
            users: users,
        });
        console.log("Success");
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success: false,
        });
    }
}

exports.setUserPreset = async (req, res) => {
    const { jitoTip } = req.body;
    console.log("Setting preset...", req.user.name, jitoTip);
    try {
        const user = await User.findById(req.user.id).select("-password");
        user.presets = {
            jitoTip
        };
        await user.save();

        res.status(200).json({
            success: true,
            user: user,
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
