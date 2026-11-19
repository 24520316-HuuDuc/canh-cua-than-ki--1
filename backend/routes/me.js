/* Chức năng cá nhân: hồ sơ, đổi mật khẩu, yêu thích, lịch sử khám phá */
const express = require("express");
const router = express.Router();

const User = require("../models/User");
const Destination = require("../models/Destination");
const { requireAuth } = require("../middleware/auth");
const { hashPassword, verifyPassword, passwordProblem } = require("../utils/password");
const { isId, asyncRoute, HttpError } = require("../utils/http");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CARD_FIELDS = "name country place image description featured active";

router.use(requireAuth);

/* GET /api/me — thông tin tài khoản */
router.get("/", (req, res) => {
    res.json(req.user.toPublic());
});

/* PUT /api/me — cập nhật tên, email, ảnh đại diện, giới thiệu */
router.put("/", asyncRoute(async (req, res) => {
    const user = req.user;
    const { name, email, avatar, bio } = req.body;

    if (name !== undefined) {
        const value = String(name).trim();
        if (value.length < 2 || value.length > 60) throw new HttpError(400, "Tên cần từ 2 đến 60 ký tự.");
        user.name = value;
    }

    if (email !== undefined) {
        const value = String(email).trim().toLowerCase();
        if (!EMAIL_RE.test(value)) throw new HttpError(400, "Email không hợp lệ.");
        if (value !== user.email && await User.exists({ email: value, _id: { $ne: user._id } })) {
            throw new HttpError(409, "Email này đã được dùng cho tài khoản khác.");
        }
        user.email = value;
    }

    if (avatar !== undefined) {
        const value = String(avatar).trim();
        if (value && !/^(https?:\/\/|\/uploads\/|assets\/)/.test(value)) {
            throw new HttpError(400, "Ảnh đại diện phải là đường dẫn http(s), /uploads/... hoặc assets/...");
        }
        user.avatar = value;
    }

    if (bio !== undefined) {
        const value = String(bio).trim();
        if (value.length > 300) throw new HttpError(400, "Giới thiệu tối đa 300 ký tự.");
        user.bio = value;
    }

    await user.save();
    res.json(user.toPublic());
}));

/* PUT /api/me/password — đổi mật khẩu */
router.put("/password", asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!(await verifyPassword(currentPassword || "", user.passwordHash))) {
        throw new HttpError(400, "Mật khẩu hiện tại không đúng.");
    }

    const problem = passwordProblem(newPassword);
    if (problem) throw new HttpError(400, problem);

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    res.json({ message: "Đã đổi mật khẩu." });
}));

/* ---------------- Yêu thích ---------------- */

/* GET /api/me/favorites — danh sách địa điểm yêu thích */
router.get("/favorites", asyncRoute(async (req, res) => {
    const ids = req.user.favorites || [];
    const found = await Destination.find({ _id: { $in: ids }, active: true }).select(CARD_FIELDS).lean();

    // Giữ đúng thứ tự: mới thêm nằm trên cùng
    const byId = new Map(found.map((item) => [String(item._id), item]));
    const items = ids.map((id) => byId.get(String(id))).filter(Boolean).reverse();

    res.json(items);
}));

/* POST /api/me/favorites/:id — thêm vào yêu thích */
router.post("/favorites/:id", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã địa điểm không hợp lệ.");
    if (!(await Destination.exists({ _id: req.params.id, active: true }))) {
        throw new HttpError(404, "Không tìm thấy địa điểm.");
    }

    await User.updateOne({ _id: req.user._id }, { $addToSet: { favorites: req.params.id } });
    const user = await User.findById(req.user._id);

    res.status(201).json({ favorites: user.toPublic().favorites });
}));

/* DELETE /api/me/favorites/:id — bỏ yêu thích */
router.delete("/favorites/:id", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã địa điểm không hợp lệ.");

    await User.updateOne({ _id: req.user._id }, { $pull: { favorites: req.params.id } });
    const user = await User.findById(req.user._id);

    res.json({ favorites: user.toPublic().favorites });
}));

/* ---------------- Lịch sử khám phá ---------------- */

/* GET /api/me/history?limit=50 — mới nhất trước */
router.get("/history", asyncRoute(async (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const entries = (req.user.history || []).slice(-limit).reverse();

    const ids = [...new Set(entries.map((entry) => String(entry.destination)))];
    const found = await Destination.find({ _id: { $in: ids } }).select(CARD_FIELDS).lean();
    const byId = new Map(found.map((item) => [String(item._id), item]));

    const items = entries
        .map((entry) => ({
            _id: entry._id,
            source: entry.source,
            visitedAt: entry.visitedAt,
            destination: byId.get(String(entry.destination)) || null
        }))
        .filter((entry) => entry.destination);

    res.json({ items, total: (req.user.history || []).length });
}));

/* DELETE /api/me/history — xóa toàn bộ lịch sử */
router.delete("/history", asyncRoute(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $set: { history: [] } });
    res.json({ message: "Đã xóa lịch sử khám phá." });
}));

/* DELETE /api/me/history/:entryId — xóa một mục lịch sử */
router.delete("/history/:entryId", asyncRoute(async (req, res) => {
    if (!isId(req.params.entryId)) throw new HttpError(400, "Mã lịch sử không hợp lệ.");
    await User.updateOne({ _id: req.user._id }, { $pull: { history: { _id: req.params.entryId } } });
    res.json({ message: "Đã xóa mục lịch sử." });
}));

module.exports = router;
