/* Tạo hoặc nâng quyền admin từ dòng lệnh.

   npm run make-admin -- email@example.com MatKhau123 "Tên admin"

   - Nếu email đã có tài khoản: nâng lên admin (mật khẩu chỉ đổi khi bạn nhập mật khẩu).
   - Nếu chưa có: tạo tài khoản admin mới (bắt buộc nhập mật khẩu). */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const { hashPassword, passwordProblem } = require("../utils/password");

(async () => {
    const [emailArg, password, name] = process.argv.slice(2);
    const email = String(emailArg || "").trim().toLowerCase();

    if (!email) {
        console.log('Cách dùng: npm run make-admin -- email@example.com MatKhau123 "Tên admin"');
        process.exit(1);
    }

    if (password) {
        const problem = passwordProblem(password);
        if (problem) {
            console.error(problem);
            process.exit(1);
        }
    }

    try {
        await connectDB();
        let user = await User.findOne({ email });

        if (user) {
            user.role = "admin";
            user.locked = false;
            if (password) user.passwordHash = await hashPassword(password);
            if (name) user.name = name;
            await user.save();
            console.log(`Đã cấp quyền admin cho ${email}`);
        } else {
            if (!password) {
                console.error("Email chưa có tài khoản, hãy nhập thêm mật khẩu để tạo mới.");
                process.exitCode = 1;
                return;
            }
            user = await User.create({
                name: name || "Quản trị viên",
                email,
                passwordHash: await hashPassword(password),
                role: "admin"
            });
            console.log(`Đã tạo tài khoản admin ${email}`);
        }
    } catch (error) {
        console.error("Lỗi:", error.message);
        process.exitCode = 1;
    } finally {
        mongoose.connection.removeAllListeners("disconnected");
        await mongoose.connection.close();
    }
})();
