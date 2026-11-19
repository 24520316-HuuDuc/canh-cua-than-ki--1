/* GET /api/book-images
   Danh sách ảnh cho cuốn sách du lịch: ảnh trong assets/Camnagdulich + ảnh admin tải lên.
   Trình duyệt dùng danh sách này để tìm ảnh theo tên địa điểm ngay lập tức,
   thay vì phải thử hàng trăm đường dẫn. */
const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const router = express.Router();

const Image = require("../models/Image");
const { asyncRoute } = require("../utils/http");

const SITE_ROOT = path.join(__dirname, "..", "..");
const FOLDERS = ["assets/Camnagdulich", "assets/images"];
const IMAGE_RE = /\.(png|jpe?g|webp|avif|gif)$/i;
const CACHE_MS = 30 * 1000;

let cache = null;
let cachedAt = 0;

async function buildList() {
    const items = [];

    // Ảnh admin tải lên được ưu tiên trước (để thay ảnh có sẵn)
    const uploads = await Image.find({}).select("url alt originalName").sort({ createdAt: -1 }).lean();
    for (const image of uploads) {
        for (const name of [image.alt, image.originalName]) {
            const clean = String(name || "").replace(IMAGE_RE, "").trim();
            if (clean) items.push({ name: clean, url: image.url });
        }
    }

    for (const folder of FOLDERS) {
        let files = [];
        try {
            files = await fs.readdir(path.join(SITE_ROOT, folder));
        } catch {
            continue;
        }
        for (const file of files) {
            if (IMAGE_RE.test(file)) {
                items.push({
                    name: file.normalize("NFC").replace(IMAGE_RE, ""),
                    url: `${folder}/${file}`
                });
            }
        }
    }

    return items;
}

router.get("/", asyncRoute(async (req, res) => {
    if (!cache || Date.now() - cachedAt > CACHE_MS) {
        cache = await buildList();
        cachedAt = Date.now();
    }
    res.json(cache);
}));

/* Gọi khi admin tải lên / xóa / đổi tên ảnh để danh sách cập nhật ngay */
router.clearCache = () => {
    cache = null;
};

module.exports = router;
