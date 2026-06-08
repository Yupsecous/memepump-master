const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

exports.isValidUser = async (req, res, next) => {
    try {
        const token = req.get('MW-USER-ID');
        if (!token) {
            console.log("Please Login to Access");
            res.status(401).json({
                success: false,
                error: "Please Login to Access"
            });
            return;
        }
    
        const decodedData = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decodedData.id);
        if (!req.user) {
            console.log("Not found user");
            res.status(404).json({
                success: false,
                error: "Not found user"
            });
            return;
        }
        
        next();
    }
    catch (err) {
        console.log(err);
        res.status(401).json({
            success: false,
            error: "Please Login to Access"
        });
    }
};

exports.isAdminUser = async (req, res, next) => {
    try {
        if (req.user.role !== "admin") {
            res.status(404).json({
                success:false,
                error: "Invalid admin"
            });
            return;
        }
    
        next();
    }
    catch (err) {
        console.log(err);
        res.status(404).json({
            success:false,
            error: "Invalid admin"
        });
    }
};
