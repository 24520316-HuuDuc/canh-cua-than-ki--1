/* Mã hóa mật khẩu bằng scrypt (có sẵn trong Node.js, không cần cài thêm).
   Chuỗi lưu trong DB có dạng: scrypt$<salt>$<hash> */
const crypto = require("crypto");

const KEY_LENGTH = 64;

function scrypt(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }, (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const key = await scrypt(String(password), salt);
    return `scrypt$${salt}$${key.toString("hex")}`;
}

async function verifyPassword(password, stored) {
    const [algo, salt, hash] = String(stored || "").split("$");
    if (algo !== "scrypt" || !salt || !hash) return false;

    const key = await scrypt(String(password), salt);
    const expected = Buffer.from(hash, "hex");

    return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

/* Quy tắc mật khẩu: ít nhất 6 ký tự, có chữ và số */
function passwordProblem(password) {
    const value = String(password || "");
    if (value.length < 6) return "Mật khẩu cần ít nhất 6 ký tự.";
    if (value.length > 100) return "Mật khẩu quá dài.";
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Mật khẩu cần có cả chữ và số.";
    return null;
}

module.exports = { hashPassword, verifyPassword, passwordProblem };
