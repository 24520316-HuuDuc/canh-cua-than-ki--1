require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { dbStatus } = require("./config/db");
const destinationRoutes = require("./routes/destinations");
const authRoutes = require("./routes/auth");
const meRoutes = require("./routes/me");
const adminRoutes = require("./routes/admin");
const bookImageRoutes = require("./routes/book-images");

const app = express();
const SITE_ROOT = path.join(__dirname, "..");

app.set("trust proxy", "loopback");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ---------------- API ---------------- */

// Kiểm tra kết nối MongoDB
app.get("/api/health", (req, res) => {
    const db = dbStatus();
    res.status(db === "connected" ? 200 : 503).json({
        status: db === "connected" ? "ok" : "error",
        database: db,
        time: new Date().toISOString()
    });
});

// Cấu hình công khai cho trình duyệt (key Google Maps là key phía trình duyệt,
// hãy giới hạn theo tên miền trong Google Cloud Console)
app.get("/api/config", (req, res) => {
    res.json({ googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || "" });
});

app.use("/api/auth", authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/destinations", destinationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/book-images", bookImageRoutes);

// API không tồn tại
app.use("/api", (req, res) => {
    res.status(404).json({ message: `Không có API ${req.method} ${req.originalUrl}` });
});

/* ---------------- Website ---------------- */

// Ảnh do admin tải lên
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { maxAge: "7d" }));

// Phục vụ luôn giao diện website: mở http://localhost:3000
// (chặn các thư mục không nên công khai như backend/ và .git/)
app.use((req, res, next) => {
    if (/^\/(backend|\.git|node_modules)(\/|$)/i.test(req.path) || /\/\.env/i.test(req.path)) {
        return res.status(404).end();
    }
    next();
});
app.use(express.static(SITE_ROOT, { index: "index.html", dotfiles: "ignore" }));

/* ---------------- Xử lý lỗi ---------------- */

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "Dữ liệu gửi lên quá lớn." });
    }
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Dữ liệu JSON không hợp lệ." });
    }
    if (error.name === "CastError") {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ." });
    }

    const status = error.status || 500;
    if (status >= 500) console.error(error);

    res.status(status).json({
        message: status >= 500 ? "Lỗi máy chủ, vui lòng thử lại sau." : error.message
    });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
        console.log(`Trang quản trị: http://localhost:${PORT}/admin.html`);
    });
};

if (require.main === module) {
    startServer();
}

module.exports = app;
