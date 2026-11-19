/* Trang quản trị: thống kê, hình ảnh, người dùng.
   (Thêm / sửa / xóa địa điểm nằm trong routes/destinations.js, cũng chỉ admin dùng được.) */
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const router = express.Router();

const User = require("../models/User");
const Destination = require("../models/Destination");
const Image = require("../models/Image");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { hashPassword, passwordProblem } = require("../utils/password");
const bookImages = require("./book-images");
const { isId, asyncRoute, HttpError, escapeRegex, toBool } = require("../utils/http");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const SITE_ROOT = path.join(__dirname, "..", "..");
const ASSET_FOLDERS = ["assets/images", "assets/Camnagdulich"];
const MAX_UPLOAD = 8 * 1024 * 1024;

router.use(requireAuth, requireAdmin);

/* ---------------- Thống kê ---------------- */

router.get("/stats", asyncRoute(async (req, res) => {
    const [destinations, activeDestinations, featured, users, admins, locked, images, popular] = await Promise.all([
        Destination.countDocuments({}),
        Destination.countDocuments({ active: true }),
        Destination.countDocuments({ featured: true, active: true }),
        User.countDocuments({}),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ locked: true }),
        Image.countDocuments({}),
        Destination.find({}).select("name country viewCount").sort({ viewCount: -1 }).limit(5).lean()
    ]);

    const newestUsers = await User.find({}).select("name email role createdAt").sort({ createdAt: -1 }).limit(5).lean();

    res.json({
        destinations, activeDestinations, featured,
        users, admins, locked, images,
        popular, newestUsers
    });
}));

/* ---------------- Hình ảnh ---------------- */

/* Nhận diện định dạng ảnh qua các byte đầu tiên (không tin vào tên file) */
function detectImage(buffer) {
    if (buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: ".jpg", mime: "image/jpeg" };
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: ".png", mime: "image/png" };
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { ext: ".webp", mime: "image/webp" };
    if (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a") return { ext: ".gif", mime: "image/gif" };
    if (buffer.toString("ascii", 4, 12) === "ftypavif") return { ext: ".avif", mime: "image/avif" };
    return null;
}

/* Tìm các địa điểm đang dùng một đường dẫn ảnh */
async function destinationsUsing(url) {
    return Destination.find({
        $or: [{ image: url }, { image: { $elemMatch: { $eq: url } } }, { gallery: url }]
    }).select("name").lean();
}

/* GET /api/admin/images — ảnh đã tải lên. ?source=assets để xem ảnh có sẵn trong thư mục assets */
router.get("/images", asyncRoute(async (req, res) => {
    if (req.query.source === "assets") {
        const items = [];
        for (const folder of ASSET_FOLDERS) {
            let files = [];
            try {
                files = await fs.readdir(path.join(SITE_ROOT, folder));
            } catch {
                continue;
            }
            for (const file of files) {
                if (/\.(png|jpe?g|webp|avif|gif)$/i.test(file)) {
                    items.push({ url: `${folder}/${file}`, filename: file, folder, builtin: true });
                }
            }
        }
        items.sort((a, b) => a.url.localeCompare(b.url, "vi"));
        return res.json(items);
    }

    const filter = {};
    if (req.query.q) {
        const pattern = new RegExp(escapeRegex(req.query.q), "i");
        filter.$or = [{ originalName: pattern }, { alt: pattern }, { filename: pattern }];
    }

    const images = await Image.find(filter).sort({ createdAt: -1 }).populate("uploadedBy", "name").lean();

    // Đánh dấu ảnh đang được địa điểm nào sử dụng
    const destinations = await Destination.find({}).select("name image gallery").lean();
    for (const image of images) {
        image.usedBy = destinations
            .filter((d) => [].concat(d.image || []).includes(image.url) || (d.gallery || []).includes(image.url))
            .map((d) => d.name);
    }

    res.json(images);
}));

/* POST /api/admin/images — tải ảnh lên.
   Gửi file trực tiếp trong body (Content-Type: image/...), tên gốc trong header X-Filename. */
router.post(
    "/images",
    express.raw({ type: ["image/*", "application/octet-stream"], limit: MAX_UPLOAD }),
    asyncRoute(async (req, res) => {
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            throw new HttpError(400, "Chưa có dữ liệu ảnh.");
        }

        const type = detectImage(buffer);
        if (!type) throw new HttpError(400, "Chỉ nhận ảnh JPG, PNG, WEBP, GIF hoặc AVIF.");

        let originalName = "";
        try {
            originalName = decodeURIComponent(String(req.headers["x-filename"] || ""));
        } catch {
            originalName = "";
        }
        originalName = path.basename(originalName).slice(0, 150);

        const filename = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${type.ext}`;
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

        const image = await Image.create({
            filename,
            url: `/uploads/${filename}`,
            originalName,
            mimetype: type.mime,
            size: buffer.length,
            alt: String(req.query.alt || originalName.replace(/\.[^.]+$/, "")).slice(0, 150),
            uploadedBy: req.user._id
        });

        bookImages.clearCache();
        res.status(201).json(image);
    })
);

/* PUT /api/admin/images/:id — sửa mô tả ảnh */
router.put("/images/:id", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã ảnh không hợp lệ.");
    const image = await Image.findByIdAndUpdate(
        req.params.id,
        { $set: { alt: String(req.body.alt || "").trim().slice(0, 150) } },
        { returnDocument: "after" }
    );
    if (!image) throw new HttpError(404, "Không tìm thấy ảnh.");
    bookImages.clearCache();
    res.json(image);
}));

/* DELETE /api/admin/images/:id — xóa ảnh. Nếu ảnh đang được dùng, cần ?force=1 */
router.delete("/images/:id", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã ảnh không hợp lệ.");

    const image = await Image.findById(req.params.id);
    if (!image) throw new HttpError(404, "Không tìm thấy ảnh.");

    const usedBy = await destinationsUsing(image.url);
    if (usedBy.length && !toBool(req.query.force)) {
        return res.status(409).json({
            message: `Ảnh đang được dùng cho: ${usedBy.map((d) => d.name).join(", ")}.`,
            usedBy: usedBy.map((d) => d.name)
        });
    }

    if (usedBy.length) {
        await Destination.updateMany({ image: image.url }, { $set: { image: "" } });
        await Destination.updateMany({ image: { $elemMatch: { $eq: image.url } } }, { $pull: { image: image.url } });
        await Destination.updateMany({}, { $pull: { gallery: image.url } });
    }

    await fs.unlink(path.join(UPLOAD_DIR, image.filename)).catch(() => {});
    await image.deleteOne();
    bookImages.clearCache();

    res.json({ message: "Đã xóa ảnh." });
}));

/* ---------------- Người dùng ---------------- */

/* GET /api/admin/users?q=&role=&page=&limit= */
router.get("/users", asyncRoute(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const filter = {};
    if (req.query.role === "user" || req.query.role === "admin") filter.role = req.query.role;
    if (req.query.q) {
        const pattern = new RegExp(escapeRegex(req.query.q), "i");
        filter.$or = [{ name: pattern }, { email: pattern }];
    }

    const [users, total] = await Promise.all([
        User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        User.countDocuments(filter)
    ]);

    res.json({
        items: users.map((user) => user.toPublic()),
        total, page, limit,
        pages: Math.max(1, Math.ceil(total / limit))
    });
}));

async function ensureNotLastAdmin(user) {
    if (user.role === "admin" && (await User.countDocuments({ role: "admin", locked: false })) <= 1) {
        throw new HttpError(400, "Phải còn ít nhất một quản trị viên đang hoạt động.");
    }
}

/* PUT /api/admin/users/:id — đổi quyền, khóa / mở khóa, đổi tên */
router.put("/users/:id", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã người dùng không hợp lệ.");

    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");

    const isSelf = String(user._id) === String(req.user._id);
    const { role, locked, name } = req.body;

    if (role !== undefined && role !== user.role) {
        if (!["user", "admin"].includes(role)) throw new HttpError(400, "Quyền không hợp lệ.");
        if (isSelf) throw new HttpError(400, "Bạn không thể tự đổi quyền của chính mình.");
        if (role === "user") await ensureNotLastAdmin(user);
        user.role = role;
    }

    if (locked !== undefined && toBool(locked) !== user.locked) {
        if (isSelf) throw new HttpError(400, "Bạn không thể tự khóa tài khoản của mình.");
        if (toBool(locked)) await ensureNotLastAdmin(user);
        user.locked = toBool(locked);
    }

    if (name !== undefined) {
        const value = String(name).trim();
        if (value.length < 2 || value.length > 60) throw new HttpError(400, "Tên cần từ 2 đến 60 ký tự.");
        user.name = value;
    }

    await user.save();
    res.json(user.toPublic());
}));

/* PUT /api/admin/users/:id/password — đặt lại mật khẩu cho người dùng */
router.put("/users/:id/password", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã người dùng không hợp lệ.");

    const problem = passwordProblem(req.body.newPassword);
    if (problem) throw new HttpError(400, problem);

    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");

    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();

    res.json({ message: `Đã đặt lại mật khẩu cho ${user.email}.` });
}));

/* DELETE /api/admin/users/:id */
router.delete("/users/:id", asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã người dùng không hợp lệ.");
    if (String(req.params.id) === String(req.user._id)) {
        throw new HttpError(400, "Bạn không thể tự xóa tài khoản của mình.");
    }

    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
    await ensureNotLastAdmin(user);

    await user.deleteOne();
    res.json({ message: `Đã xóa tài khoản ${user.email}.` });
}));

module.exports = router;
