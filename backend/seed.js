/* Đưa dữ liệu địa điểm + cẩm nang từ website cũ vào MongoDB.

   node seed.js           Chỉ thêm địa điểm còn thiếu (không ghi đè dữ liệu admin đã sửa)
   node seed.js --force   Ghi đè lại toàn bộ địa điểm mẫu bằng dữ liệu gốc

   Nếu .env có ADMIN_EMAIL và ADMIN_PASSWORD, script sẽ tạo tài khoản admin (nếu chưa có). */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Destination = require("./models/Destination");
const User = require("./models/User");
const { hashPassword, passwordProblem } = require("./utils/password");

const destinations = require("./data/destinations");
const TRAVEL_GUIDE = require("./data/travel-guide");
const { streetViewsFor } = require("./data/street-views");

const FORCE = process.argv.includes("--force");

// Thông tin bổ sung cho từng địa điểm
const EXTRA = {
    "Hà Nội":     { country: "Việt Nam",     lat: 21.0285, lng: 105.8542 },
    "Tokyo":      { country: "Nhật Bản",     lat: 35.6762, lng: 139.6503, featured: true },
    "London":     { country: "Anh",          lat: 51.5072, lng: -0.1276 },
    "Thượng Hải": { country: "Trung Quốc",   lat: 31.2304, lng: 121.4737 },
    "Hàng Châu":  { country: "Trung Quốc",   lat: 30.2741, lng: 120.1551 },
    "Thụy Sĩ":    { country: "Thụy Sĩ",      lat: 46.8182, lng: 8.2275, featured: true },
    "Paris":      { country: "Pháp",         lat: 48.8566, lng: 2.3522, featured: true, guideKey: "Pháp" },
    "Ai Cập":     { country: "Ai Cập",       lat: 29.9792, lng: 31.1342 },
    "Bắc Cực":    { country: "Vùng Bắc Cực", lat: 78.2232, lng: 15.6267, guideKey: "Bắc cực" },
    "Bangkok":    { country: "Thái Lan",     lat: 13.7563, lng: 100.5018 },
    "Canada":     { country: "Canada",       lat: 51.1784, lng: -115.5708 },
    "Đà Lạt":     { country: "Việt Nam",     lat: 11.9404, lng: 108.4583, featured: true },
    "Đà Nẵng":    { country: "Việt Nam",     lat: 16.0544, lng: 108.2022, featured: true },
    "Hà Giang":   { country: "Việt Nam",     lat: 22.8233, lng: 104.9836 },
    "Úc":         { country: "Úc",           lat: -33.8568, lng: 151.2153 },
    "Seoul":      { country: "Hàn Quốc",     lat: 37.5665, lng: 126.9780 },
    "Berlin":     { country: "Đức",          lat: 52.5200, lng: 13.4050 },
    "Mỹ":         { country: "Hoa Kỳ",       lat: 40.7128, lng: -74.0060 },
    "Singapore":  { country: "Singapore",    lat: 1.2834,  lng: 103.8607 },
    "Hong Kong":  { country: "Hong Kong",    lat: 22.3193, lng: 114.1694, guideKey: "HongKong" }
};

// Điểm xem 360° đẹp gần địa danh nổi tiếng: [vĩ độ, kinh độ, hướng nhìn]
const STREET_VIEW = {
    "Hà Nội":     [21.0288, 105.8522, 90],    // Hồ Hoàn Kiếm
    "Tokyo":      [35.6595, 139.7005, 300],   // Giao lộ Shibuya
    "London":     [51.5008, -0.1218, 300],    // Big Ben từ cầu Westminster
    "Thượng Hải": [31.2401, 121.4905, 90],    // Bến Thượng Hải nhìn sang Phố Đông
    "Hàng Châu":  [30.2587, 120.1490, 270],   // Tây Hồ
    "Thụy Sĩ":    [47.0517, 8.3080, 270],     // Cầu Chapel, Lucerne
    "Paris":      [48.8606, 2.2930, 140],     // Tháp Eiffel từ Trocadéro
    "Ai Cập":     [29.9765, 31.1313, 230],    // Kim tự tháp Giza
    "Bắc Cực":    [78.2232, 15.6267, 0],      // Longyearbyen, Svalbard
    "Bangkok":    [13.7500, 100.4925, 270],   // Cung điện Hoàng gia
    "Canada":     [51.1781, -115.5719, 180],  // Thị trấn Banff
    "Đà Lạt":     [11.9420, 108.4386, 90],    // Hồ Xuân Hương
    "Đà Nẵng":    [16.0612, 108.2270, 90],    // Cầu Rồng
    "Hà Giang":   [23.2493, 105.4067, 0],     // Đèo Mã Pí Lèng
    "Úc":         [-33.8610, 151.2108, 60],   // Nhà hát Opera Sydney
    "Seoul":      [37.5759, 126.9768, 0],     // Cung Gyeongbokgung
    "Berlin":     [52.5163, 13.3790, 270],    // Cổng Brandenburg
    "Mỹ":         [40.7580, -73.9855, 0],     // Quảng trường Times Square
    "Singapore":  [1.2868, 103.8545, 120],    // Marina Bay
    "Hong Kong":  [22.2935, 114.1700, 0]      // Cảng Victoria nhìn sang đảo Hong Kong
};

function streetViewFor(name) {
    const sv = STREET_VIEW[name];
    return sv ? { lat: sv[0], lng: sv[1], heading: sv[2], pitch: 0, pano: "" } : null;
}

const normalize = (value) => String(value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

function guideFor(name, guideKey) {
    const keys = Object.keys(TRAVEL_GUIDE);
    const wanted = [guideKey, name].filter(Boolean).map(normalize);
    const key = keys.find((k) => wanted.includes(normalize(k)));
    return key ? TRAVEL_GUIDE[key] : [];
}

async function seedDestinations() {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Dữ liệu cũ chưa có địa điểm nổi bật nào → gắn nổi bật theo danh sách mẫu
    const noFeatured = (await Destination.countDocuments({ featured: true })) === 0;

    for (const item of destinations) {
        const extra = EXTRA[item.name] || {};
        const data = {
            name: item.name,
            country: extra.country || "Chưa xác định",
            place: item.place || "",
            description: item.desc || "",
            image: item.image || "",
            season: item.season || "",
            activity: item.activity || "",
            guide: guideFor(item.name, extra.guideKey),
            latitude: extra.lat ?? null,
            longitude: extra.lng ?? null,
            streetView: streetViewFor(item.name) || undefined,
            streetViews: streetViewsFor(item.name),
            streetViewAvailable: Boolean(STREET_VIEW[item.name]) || streetViewsFor(item.name).length > 0,
            featured: Boolean(extra.featured),
            active: true
        };

        if (data.guide.length === 0) {
            console.warn(`  ! Không tìm thấy cẩm nang cho "${item.name}"`);
        }

        const existing = await Destination.findOne({ name: item.name });

        if (!existing) {
            await Destination.create(data);
            created += 1;
            console.log(`  + Thêm: ${item.name} (${data.guide.length} đoạn cẩm nang)`);
        } else if (FORCE) {
            existing.set(data);
            await existing.save();
            updated += 1;
            console.log(`  ~ Ghi đè: ${item.name}`);
        } else {
            // Không ghi đè, chỉ bổ sung những trường còn trống
            const patch = {};
            if ((!existing.guide || existing.guide.length === 0) && data.guide.length) patch.guide = data.guide;
            if (noFeatured && data.featured) patch.featured = true;
            if ((!existing.country || existing.country === "Chưa xác định") && extra.country) patch.country = extra.country;
            if ((!existing.streetView || existing.streetView.lat == null) && data.streetView) {
                patch.streetView = data.streetView;
                patch.streetViewAvailable = true;
            }
            if ((!existing.streetViews || existing.streetViews.length === 0) && data.streetViews.length) {
                patch.streetViews = data.streetViews;
                patch.streetViewAvailable = true;
            }
            if (existing.latitude == null && data.latitude != null) {
                patch.latitude = data.latitude;
                patch.longitude = data.longitude;
            }

            if (Object.keys(patch).length) {
                await Destination.updateOne({ _id: existing._id }, { $set: patch });
                console.log(`  ~ Bổ sung ${Object.keys(patch).join(", ")}: ${item.name}`);
                updated += 1;
            } else {
                skipped += 1;
            }
        }
    }

    // Tạo chuỗi tìm kiếm không dấu cho dữ liệu cũ (nếu chưa có)
    for (const doc of await Destination.find({}).select("+searchKey")) {
        if (!doc.searchKey) await doc.save();
    }

    console.log(`\nĐịa điểm: thêm ${created}, cập nhật ${updated}, giữ nguyên ${skipped}.`);
    console.log(`Tổng số địa điểm trong MongoDB: ${await Destination.countDocuments()}`);
}

async function seedAdmin() {
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "";

    if (!email || !password) {
        console.log("\n(Bỏ qua tạo admin: chưa đặt ADMIN_EMAIL / ADMIN_PASSWORD trong .env)");
        return;
    }

    const problem = passwordProblem(password);
    if (problem) {
        console.warn(`\nKhông tạo admin: ${problem}`);
        return;
    }

    const user = await User.findOne({ email });
    if (user) {
        if (user.role !== "admin") {
            user.role = "admin";
            await user.save();
            console.log(`\nĐã nâng quyền admin cho ${email}`);
        } else {
            console.log(`\nAdmin ${email} đã tồn tại.`);
        }
        return;
    }

    await User.create({
        name: process.env.ADMIN_NAME || "Quản trị viên",
        email,
        passwordHash: await hashPassword(password),
        role: "admin"
    });
    console.log(`\nĐã tạo tài khoản admin: ${email}`);
}

(async () => {
    try {
        await connectDB();
        await Destination.syncIndexes();
        await User.syncIndexes();
        console.log(FORCE ? "Chế độ --force: ghi đè dữ liệu mẫu\n" : "Thêm địa điểm còn thiếu\n");
        await seedDestinations();
        await seedAdmin();
    } catch (error) {
        console.error("Lỗi khi chuyển dữ liệu:", error);
        process.exitCode = 1;
    } finally {
        mongoose.connection.removeAllListeners("disconnected");
        await mongoose.connection.close();
    }
})();
