const Log = require("../models/logModel");
const { getWebSocketClientList } = require("./websocket");

exports.addLog = async (level, title, description) => {
    try {
        const log = await Log.create({
            time: Date.now(),
            level,
            title,
            description,
        });
        const clients = getWebSocketClientList();
        const adminClients = clients.filter(item => item.user.role === "admin");
        for (let i = 0; i < adminClients.length; i++) {
            adminClients[i].emit("ADD_LOG", JSON.stringify(log));
        }
    }
    catch (err) {
        console.log(err);
    }
}

exports.deleteLogs = async (selectedIds) => {
    for (let i = 0; i < selectedIds.length; i++) {
        const log = await Log.findById(selectedIds[i]);
        await log.remove();
    }

    const logs = await Log.find();
    return logs;
}

exports.getLogs = async () => {
    const logs = await Log.find();
    return logs;
}
