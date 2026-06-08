require("dotenv").config({ path: process.env.env_file });
const https = require("https");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { setGlobalDispatcher, Agent } = require("undici");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const user = require("./routes/userRoute");
const project = require("./routes/projectRoute");
const misc = require("./routes/miscRoute");
const { connectDatabase } = require("./config/database");
const { startWebSocketServer } = require("./utils/websocket");
const { initConnections } = require("./utils/connection");

// let appConsole = {};
// appConsole.log = console.log;
// console.log = function() {
//     appConsole.log(">", ...arguments);
// }

setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }) );
connectDatabase();
initConnections();

const PORT = process.env.PORT || 8443;

const app = express();
app.use(fileUpload());
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

var corsOptions = {
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "Content-Length", "X-Requested-With", "Accept", "Origin", "Access-Control-Allow-Headers"],
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
}
app.options("*", cors());
app.use(cors(corsOptions));

app.use("/api/v1", user);
app.use("/api/v1", project);
app.use("/api/v1", misc);

__dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public")));

if (process.env.NODE_ENV === "production") {
    app.get("*", (req, res) => {
        res.sendFile(path.resolve(__dirname, "public", "index.html"));
    });
}
else {
    app.get("/", (req, res) => {
        res.send("Server is Running! (user)");
    });
}

var server;
if (process.env.SECURE_MODE === "1") {
    const options = {
        key: fs.readFileSync("cert/privkey.pem"),
        cert: fs.readFileSync("cert/fullchain.pem")
    };
    server = https.createServer(options, app).listen(PORT, () => {
        console.log(`HTTPS server running with ${PORT}`);
    });
}
else {
    server = app.listen(PORT, () => {
        console.log(`HTTP Server is running with ${PORT}`);
    });
}

startWebSocketServer(server, async (socket) => {
    socket.emit("HELLO", JSON.stringify({ message: "OK" }));
    // startMetric(socket.user._id.toString());
}, async (userId) => {
    // const clients = getWebSocketClientList();
    // const myClients = clients.filter(item => item.user._id.toString() === userId);
    // if (myClients.length === 0)
    //     stopMetric(userId);
});

// UncaughtException Error
process.on("uncaughtException", (err) => {
    console.log(`Error: ${err.message}`);
    process.exit(1);
});

// Unhandled Promise Rejection
// process.on("unhandledRejection", (err) => {
//     console.log(`Error: ${err.message}`);
//     server.close(() => {
//         process.exit(1);
//     });
// });
