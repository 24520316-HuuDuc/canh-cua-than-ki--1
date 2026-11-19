const mongoose = require("mongoose");

const destinationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Tên địa điểm là bắt buộc"],
        trim: true,
        unique: true
    },
    country: {
        type: String,
        required: [true, "Quốc gia là bắt buộc"],
        trim: true
    },
    // Dòng nhỏ dưới tên, vd "Quảng Ninh · Việt Nam". Để trống sẽ dùng country.
    place: {
        type: String,
        default: "",
        trim: true
    },
    description: {
        type: String,
        default: ""
    },
    // Đường dẫn ảnh chính: "assets/images/tokyo" (không cần đuôi) hoặc "/uploads/abc.jpg".
    // Có thể là một mảng đường dẫn để thử lần lượt.
    image: {
        type: mongoose.Schema.Types.Mixed,
        default: ""
    },
    // Các ảnh bổ sung cho địa điểm
    gallery: {
        type: [String],
        default: []
    },
    season: { type: String, default: "" },
    activity: { type: String, default: "" },
    // Nội dung cẩm nang du lịch: mỗi phần tử là một đoạn / tiêu đề
    guide: {
        type: [String],
        default: []
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    streetViewAvailable: { type: Boolean, default: false },
    // Điểm xem 360° (Google Street View). Bỏ trống lat/lng sẽ dùng latitude/longitude ở trên.
    streetView: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        heading: { type: Number, default: 0 },   // hướng nhìn 0–360 (0 = Bắc)
        pitch: { type: Number, default: 0 },     // ngước lên / cúi xuống -90..90
        pano: { type: String, default: "" }      // Pano ID nếu muốn cố định đúng 1 ảnh 360°
    },
    // Nhiều góc xem 360° tại các danh thắng của địa điểm (ưu tiên dùng thay cho streetView)
    streetViews: {
        type: [{
            _id: false,
            name: { type: String, trim: true, default: "" },
            lat: { type: Number, required: true },
            lng: { type: Number, required: true },
            heading: { type: Number, default: 0 },
            pitch: { type: Number, default: 0 },
            pano: { type: String, default: "" }
        }],
        default: []
    },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    viewCount: { type: Number, default: 0 },
    // Chuỗi không dấu để tìm kiếm (tự tạo khi lưu)
    searchKey: { type: String, default: "", select: false }
}, {
    timestamps: true
});

destinationSchema.index({ active: 1, featured: 1 });

/* Bỏ dấu tiếng Việt: "Đà Lạt" -> "da lat" */
function plain(value) {
    return String(value || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d").toLowerCase().trim();
}

destinationSchema.pre("validate", function () {
    this.searchKey = [this.name, this.country, this.place].map(plain).join(" ");
});

destinationSchema.statics.plain = plain;

module.exports = mongoose.model("Destination", destinationSchema);
