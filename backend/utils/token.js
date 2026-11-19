/* JSON Web Token (HS256) viết bằng crypto có sẵn của Node.js */
const crypto = require("crypto");

const DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 ngày

function secret() {
    const value = process.env.JWT_SECRET;
    if (!value || value.length < 16) {
        throw new Error("JWT_SECRET trong .env chưa có hoặc quá ngắn (cần ít nhất 16 ký tự).");
    }
    return value;
}

const b64url = (input) => Buffer.from(input).toString("base64url");

function sign(payload, ttlSeconds = Number(process.env.JWT_TTL) || DEFAULT_TTL) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
    const signature = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
    return `${header}.${body}.${signature}`;
}

/* Trả về payload nếu token hợp lệ, ngược lại trả về null */
function verify(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expected = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest();
    const given = Buffer.from(signature, "base64url");

    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

module.exports = { sign, verify };
