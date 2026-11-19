const mongoose = require("mongoose");

/* Ảnh do admin tải lên (file nằm trong backend/uploads) */
const imageSchema = new mongoose.Schema({
    filename: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimetype: { type: String, default: "" },
    size: { type: Number, default: 0 },
    alt: { type: String, default: "" },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Image", imageSchema);
