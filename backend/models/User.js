const mongoose = require("mongoose");

const historySchema = new mongoose.Schema({
    destination: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Destination",
        required: true
    },
    // "random" = mở cửa ngẫu nhiên, "select" = tự chọn địa điểm
    source: {
        type: String,
        enum: ["random", "select"],
        default: "random"
    },
    visitedAt: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Tên là bắt buộc"],
        trim: true,
        maxlength: 60
    },
    email: {
        type: String,
        required: [true, "Email là bắt buộc"],
        trim: true,
        lowercase: true,
        unique: true
    },
    passwordHash: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 300 },
    locked: { type: Boolean, default: false },
    favorites: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Destination"
    }],
    history: {
        type: [historySchema],
        default: []
    },
    lastLoginAt: { type: Date, default: null }
}, {
    timestamps: true
});

/* Dữ liệu an toàn để trả về cho client (không có mật khẩu) */
userSchema.methods.toPublic = function () {
    return {
        _id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        avatar: this.avatar,
        bio: this.bio,
        locked: this.locked,
        favorites: (this.favorites || []).map((id) => String(id._id || id)),
        historyCount: (this.history || []).length,
        lastLoginAt: this.lastLoginAt,
        createdAt: this.createdAt
    };
};

module.exports = mongoose.model("User", userSchema);
