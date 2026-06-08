const socket = require("socket.io");
const User = require("../models/userModel");

var io = null;
var clients = [];

exports.startWebSocketServer = (server, connectDone, disconnectDone) => {
    io = socket(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on("connection", function (socket) {
        socket.on("NEW_USER", async (userId) => {
            // console.log(`Connected websocket! User=${userId}`);
            const user = await User.findById(userId);
            if (user) {
                socket.user = user;

                clients = [
                    ...clients,
                    socket
                ];
                if (connectDone)
                    connectDone(socket);
            }
        });

        socket.on("disconnect", () => {
            const userId = socket.user ? socket.user._id.toString() : "UNKNOWN_USER";
            // console.log(`Disconnected websocket! user=${userId}`);
            clients = clients.filter(client => client !== socket);
            if (disconnectDone)
                disconnectDone(userId);
        });
    });
}

exports.getWebSocketClientList = () => {
    return clients;
}
