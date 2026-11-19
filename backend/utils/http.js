const mongoose = require("mongoose");

const isId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));

/* Bọc route async để lỗi được chuyển tới error handler */
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* Lỗi có mã HTTP */
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/* Thoát ký tự đặc biệt để dùng trong RegExp tìm kiếm */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toBool = (value) => value === true || value === "true" || value === "1" || value === 1;

module.exports = { isId, asyncRoute, HttpError, escapeRegex, toBool };
