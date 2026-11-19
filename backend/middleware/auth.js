const User = require("../models/User");
const { verify } = require("../utils/token");

function readToken(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function loadUser(req) {
    const token = readToken(req);
    if (!token) return { user: null, reason: "missing" };

    const payload = verify(token);
    if (!payload || !payload.sub) return { user: null, reason: "invalid" };

    const user = await User.findById(payload.sub);
    if (!user) return { user: null, reason: "invalid" };
    if (user.locked) return { user: null, reason: "locked" };

    return { user, reason: null };
}

const MESSAGES = {
    missing: "Bạn cần đăng nhập để dùng chức năng này.",
    invalid: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.",
    locked: "Tài khoản của bạn đã bị khóa."
};

/* Bắt buộc đăng nhập */
async function requireAuth(req, res, next) {
    try {
        const { user, reason } = await loadUser(req);
        if (!user) {
            return res.status(reason === "locked" ? 403 : 401).json({ message: MESSAGES[reason] });
        }
        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

/* Không bắt buộc: nếu có token hợp lệ thì gắn req.user */
async function optionalAuth(req, res, next) {
    try {
        const { user } = await loadUser(req);
        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

/* Chỉ admin (dùng sau requireAuth) */
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Chỉ quản trị viên mới được dùng chức năng này." });
    }
    next();
}

const isAdmin = (req) => Boolean(req.user && req.user.role === "admin");

module.exports = { requireAuth, optionalAuth, requireAdmin, isAdmin };
