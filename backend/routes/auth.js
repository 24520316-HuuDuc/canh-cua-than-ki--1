const express = require("express");
const router = express.Router();

const User = require("../models/User");
const { hashPassword, verifyPassword, passwordProblem } = require("../utils/password");
const { sign } = require("../utils/token");
const { asyncRoute, HttpError } = require("../utils/http");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Chống dò mật khẩu: tối đa 10 lần sai / 15 phút cho mỗi IP + email */
const FAIL_LIMIT = 10;
const FAIL_WINDOW = 15 * 60 * 1000;
const failures = new Map();

function failKey(req, email) {
    return `${req.ip}|${email}`;
}

function tooManyFailures(key) {
    const entry = failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > FAIL_WINDOW) {
        failures.delete(key);
        return false;
    }
    return entry.count >= FAIL_LIMIT;
}

function addFailure(key) {
    const entry = failures.get(key);
    if (!entry || Date.now() - entry.first > FAIL_WINDOW) {
        failures.set(key, { count: 1, first: Date.now() });
    } else {
        entry.count += 1;
    }
}

function session(user) {
    return {
        token: sign({ sub: String(user._id), role: user.role }),
        user: user.toPublic()
    };
}

/* POST /api/auth/register — đăng ký tài khoản (luôn là "user") */
router.post("/register", asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2) throw new HttpError(400, "Tên cần ít nhất 2 ký tự.");
    if (name.length > 60) throw new HttpError(400, "Tên tối đa 60 ký tự.");
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Email không hợp lệ.");

    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);

    if (await User.exists({ email })) {
        throw new HttpError(409, "Email này đã được đăng ký.");
    }

    const user = await User.create({
        name,
        email,
        passwordHash: await hashPassword(password),
        role: "user",
        lastLoginAt: new Date()
    });

    res.status(201).json(session(user));
}));

/* POST /api/auth/login — đăng nhập */
router.post("/login", asyncRoute(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) throw new HttpError(400, "Hãy nhập email và mật khẩu.");

    const key = failKey(req, email);
    if (tooManyFailures(key)) {
        throw new HttpError(429, "Bạn đã nhập sai quá nhiều lần. Hãy thử lại sau 15 phút.");
    }

    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        addFailure(key);
        throw new HttpError(401, "Email hoặc mật khẩu không đúng.");
    }

    if (user.locked) throw new HttpError(403, "Tài khoản của bạn đã bị khóa.");

    failures.delete(key);
    user.lastLoginAt = new Date();
    await user.save();

    res.json(session(user));
}));

module.exports = router;
