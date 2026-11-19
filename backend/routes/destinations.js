const express = require("express");
const router = express.Router();

const Destination = require("../models/Destination");
const User = require("../models/User");
const { optionalAuth, requireAuth, requireAdmin, isAdmin } = require("../middleware/auth");
const { isId, asyncRoute, HttpError, escapeRegex, toBool } = require("../utils/http");
const { recordVisit } = require("../utils/history");

/* Các trường được phép gửi lên khi thêm / sửa */
const EDITABLE = [
    "name", "country", "place", "description", "image", "gallery",
    "season", "activity", "guide", "latitude", "longitude",
    "streetViewAvailable", "streetView", "streetViews", "featured", "active"
];

/* Trường nhẹ cho danh sách (bỏ nội dung cẩm nang dài) */
const LIST_FIELDS = "-guide -__v";

function pickEditable(body = {}) {
    const data = {};

    for (const key of EDITABLE) {
        if (body[key] !== undefined) data[key] = body[key];
    }

    for (const key of ["name", "country", "place", "description", "season", "activity"]) {
        if (typeof data[key] === "string") data[key] = data[key].trim();
    }

    // Cẩm nang có thể gửi dạng chuỗi nhiều dòng hoặc mảng
    if (typeof data.guide === "string") {
        data.guide = data.guide.split(/\r?\n/);
    }
    if (Array.isArray(data.guide)) {
        data.guide = data.guide.map((line) => String(line ?? "").trim()).filter(Boolean);
    }

    if (typeof data.gallery === "string") {
        data.gallery = data.gallery.split(/\r?\n|,/);
    }
    if (Array.isArray(data.gallery)) {
        data.gallery = data.gallery.map((line) => String(line ?? "").trim()).filter(Boolean);
    }

    for (const key of ["latitude", "longitude"]) {
        if (data[key] === "" || data[key] === null) data[key] = null;
        else if (data[key] !== undefined) {
            const number = Number(data[key]);
            if (!Number.isFinite(number)) throw new HttpError(400, `${key} phải là số.`);
            data[key] = number;
        }
    }

    const num = (value, name, min, max, fallback) => {
        if (value === "" || value === null || value === undefined) return fallback;
        const number = Number(value);
        if (!Number.isFinite(number) || number < min || number > max) {
            throw new HttpError(400, `${name} phải là số từ ${min} đến ${max}.`);
        }
        return number;
    };

    if (data.streetViews !== undefined) {
        if (!Array.isArray(data.streetViews)) throw new HttpError(400, "Danh sách góc 360° không hợp lệ.");
        if (data.streetViews.length > 15) throw new HttpError(400, "Tối đa 15 góc 360° cho mỗi địa điểm.");
        data.streetViews = data.streetViews.map((sv, index) => {
            const label = `Góc 360° thứ ${index + 1}`;
            const lat = num(sv?.lat, `${label}: vĩ độ`, -90, 90, null);
            const lng = num(sv?.lng, `${label}: kinh độ`, -180, 180, null);
            if (lat === null || lng === null) throw new HttpError(400, `${label}: cần nhập vĩ độ và kinh độ.`);
            return {
                name: String(sv.name || "").trim().slice(0, 120) || label,
                lat,
                lng,
                heading: num(sv.heading, `${label}: hướng nhìn`, 0, 360, 0),
                pitch: num(sv.pitch, `${label}: góc ngước`, -90, 90, 0),
                pano: String(sv.pano || "").trim().slice(0, 200)
            };
        });
    }

    if (data.streetView !== undefined) {
        const sv = data.streetView && typeof data.streetView === "object" ? data.streetView : {};
        data.streetView = {
            lat: num(sv.lat, "Vĩ độ 360°", -90, 90, null),
            lng: num(sv.lng, "Kinh độ 360°", -180, 180, null),
            heading: num(sv.heading, "Hướng nhìn", 0, 360, 0),
            pitch: num(sv.pitch, "Góc ngước", -90, 90, 0),
            pano: String(sv.pano || "").trim().slice(0, 200)
        };
    }

    for (const key of ["streetViewAvailable", "featured", "active"]) {
        if (data[key] !== undefined) data[key] = toBool(data[key]);
    }

    return data;
}

/* Tìm địa điểm theo id hoặc theo tên */
async function findDestination(idOrName, { includeInactive = false, lean = true } = {}) {
    const filter = isId(idOrName)
        ? { _id: idOrName }
        : { name: new RegExp(`^${escapeRegex(idOrName)}$`, "i") };

    if (!includeInactive) filter.active = true;

    const query = Destination.findOne(filter).select("-__v");
    return lean ? query.lean() : query;
}

function friendlyError(error) {
    if (error && error.code === 11000) {
        return new HttpError(409, "Đã có địa điểm trùng tên.");
    }
    if (error && error.name === "ValidationError") {
        const first = Object.values(error.errors)[0];
        return new HttpError(400, first ? first.message : "Dữ liệu không hợp lệ.");
    }
    return error;
}

/* ===========================================================
   GET /api/destinations
   Lấy danh sách địa điểm
   Query: q, country, featured, page, limit, sort (name|newest|popular),
          full=1 (kèm cẩm nang), includeInactive=1 (chỉ admin)
   =========================================================== */
router.get("/", optionalAuth, asyncRoute(async (req, res) => {
    const { q, country, featured, sort = "name" } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const filter = {};
    if (!(toBool(req.query.includeInactive) && isAdmin(req))) filter.active = true;
    if (featured !== undefined && featured !== "") filter.featured = toBool(featured);
    if (country) filter.country = new RegExp(`^${escapeRegex(country)}$`, "i");
    if (q && String(q).trim()) {
        const pattern = new RegExp(escapeRegex(String(q).trim()), "i");
        const plainPattern = new RegExp(escapeRegex(Destination.plain(q)), "i");
        filter.$or = [
            { name: pattern }, { country: pattern }, { place: pattern },
            { description: pattern }, { searchKey: plainPattern }
        ];
    }

    const sorts = {
        name: { name: 1 },
        newest: { createdAt: -1 },
        popular: { viewCount: -1, name: 1 }
    };

    const [items, total] = await Promise.all([
        Destination.find(filter)
            .select(toBool(req.query.full) ? "-__v" : LIST_FIELDS)
            .sort(sorts[sort] || sorts.name)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Destination.countDocuments(filter)
    ]);

    res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}));

/* GET /api/destinations/countries — danh sách quốc gia (để lọc) */
router.get("/countries", asyncRoute(async (req, res) => {
    const countries = await Destination.distinct("country", { active: true });
    res.json(countries.sort((a, b) => a.localeCompare(b, "vi")));
}));

/* ===========================================================
   GET /api/destinations/random
   Chọn ngẫu nhiên một địa điểm đang hoạt động (kèm cẩm nang)
   Query: exclude=<id> để tránh trùng lần trước
   Nếu đã đăng nhập, lượt mở cửa được lưu vào lịch sử khám phá.
   =========================================================== */
router.get("/random", optionalAuth, asyncRoute(async (req, res) => {
    const filter = { active: true };
    if (isId(req.query.exclude)) filter._id = { $ne: req.query.exclude };

    let total = await Destination.countDocuments(filter);

    // Nếu chỉ còn đúng địa điểm bị loại trừ thì vẫn trả về nó
    if (total === 0 && filter._id) {
        delete filter._id;
        total = await Destination.countDocuments(filter);
    }

    if (total === 0) {
        throw new HttpError(404, "Chưa có địa điểm nào trong cơ sở dữ liệu.");
    }

    const skip = Math.floor(Math.random() * total);
    const destination = await Destination.findOne(filter).select("-__v").skip(skip).lean();

    await Destination.updateOne({ _id: destination._id }, { $inc: { viewCount: 1 } });
    await recordVisit(req.user, destination._id, "random");

    res.json(destination);
}));

/* ===========================================================
   GET /api/destinations/:id
   Chi tiết một địa điểm (id hoặc tên). ?track=1 để lưu vào lịch sử.
   =========================================================== */
router.get("/:id", optionalAuth, asyncRoute(async (req, res) => {
    const destination = await findDestination(req.params.id, { includeInactive: isAdmin(req) });

    if (!destination) throw new HttpError(404, "Không tìm thấy địa điểm.");

    if (toBool(req.query.track)) {
        await Destination.updateOne({ _id: destination._id }, { $inc: { viewCount: 1 } });
        await recordVisit(req.user, destination._id, "select");
    }

    res.json(destination);
}));

/* ===========================================================
   POST /api/destinations — thêm địa điểm (admin)
   =========================================================== */
router.post("/", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    try {
        const destination = await Destination.create(pickEditable(req.body));
        res.status(201).json(destination);
    } catch (error) {
        throw friendlyError(error);
    }
}));

/* ===========================================================
   PUT /api/destinations/:id — sửa địa điểm (admin)
   PATCH cũng được hỗ trợ, chỉ cập nhật các trường được gửi lên.
   =========================================================== */
async function updateDestination(req, res) {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã địa điểm không hợp lệ.");

    const data = pickEditable(req.body);
    if (Object.keys(data).length === 0) throw new HttpError(400, "Không có dữ liệu cần cập nhật.");

    const destination = await Destination.findById(req.params.id).select("-__v");
    if (!destination) throw new HttpError(404, "Không tìm thấy địa điểm.");

    try {
        destination.set(data);
        await destination.save();
        res.json(destination);
    } catch (error) {
        throw friendlyError(error);
    }
}

router.put("/:id", requireAuth, requireAdmin, asyncRoute(updateDestination));
router.patch("/:id", requireAuth, requireAdmin, asyncRoute(updateDestination));

/* ===========================================================
   DELETE /api/destinations/:id — xóa địa điểm (admin)
   Đồng thời gỡ địa điểm khỏi danh sách yêu thích và lịch sử của người dùng.
   =========================================================== */
router.delete("/:id", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(400, "Mã địa điểm không hợp lệ.");

    const destination = await Destination.findByIdAndDelete(req.params.id);
    if (!destination) throw new HttpError(404, "Không tìm thấy địa điểm.");

    await User.updateMany({}, {
        $pull: {
            favorites: destination._id,
            history: { destination: destination._id }
        }
    });

    res.json({ message: `Đã xóa "${destination.name}".`, _id: destination._id });
}));

module.exports = router;
module.exports.findDestination = findDestination;
