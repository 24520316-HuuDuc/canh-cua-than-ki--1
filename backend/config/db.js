const mongoose = require("mongoose");

const STATES = ["disconnected", "connected", "connecting", "disconnecting"];

/* Kết nối MongoDB, có thông báo lỗi dễ hiểu và tự báo khi mất kết nối */
const connectDB = async () => {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        console.error("Thiếu MONGO_URI trong file .env");
        process.exit(1);
    }

    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB bị ngắt kết nối.");
    });

    mongoose.connection.on("reconnected", () => {
        console.log("MongoDB đã kết nối lại.");
    });

    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
        const { host, port, name } = mongoose.connection;
        console.log(`MongoDB connected successfully! (${host}:${port}/${name})`);
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        console.error("Hãy kiểm tra MongoDB đã chạy chưa và MONGO_URI trong .env có đúng không.");
        process.exit(1);
    }
};

/* Trạng thái kết nối hiện tại, dùng cho /api/health */
const dbStatus = () => STATES[mongoose.connection.readyState] || "unknown";

module.exports = connectDB;
module.exports.dbStatus = dbStatus;
