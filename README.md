# Cánh Cửa Thần Kì

Website khám phá du lịch: mở cánh cửa để đến một địa điểm ngẫu nhiên, đọc cẩm nang, lưu địa điểm yêu thích.
Frontend HTML/CSS/JS thuần, Backend Node.js + Express + MongoDB.

## Cách chạy

Cần: Node.js 18 trở lên, MongoDB đang chạy (máy cá nhân hoặc MongoDB Atlas).

```bash
cd backend
npm install            # node_modules đã có sẵn thì có thể bỏ qua
npm run seed           # đưa 20 địa điểm + cẩm nang vào MongoDB, tạo tài khoản admin
npm start              # chạy server
```

Mở **http://localhost:3000** (website) và **http://localhost:3000/admin.html** (quản trị).

> Backend phục vụ luôn giao diện, nên mở qua `localhost:3000` là tiện nhất.
> Nếu vẫn dùng Live Server (cổng 5500), trang sẽ tự gọi API ở `http://localhost:3000`.

### File `backend/.env`

| Biến | Ý nghĩa |
|---|---|
| `MONGO_URI` | Chuỗi kết nối MongoDB |
| `PORT` | Cổng server (mặc định 3000) |
| `JWT_SECRET` | Khóa bí mật ký token đăng nhập, chuỗi ngẫu nhiên dài. **Đổi khi đưa lên mạng.** |
| `JWT_TTL` | Thời hạn đăng nhập tính bằng giây (mặc định 7 ngày) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Tài khoản admin đầu tiên do `npm run seed` tạo |

Xem mẫu trong `backend/.env.example`.

### Các lệnh

| Lệnh | Việc làm |
|---|---|
| `npm start` | Chạy server |
| `npm run dev` | Chạy server, tự khởi động lại khi sửa code |
| `npm run seed` | Thêm địa điểm còn thiếu, bổ sung cẩm nang / nổi bật cho dữ liệu cũ. **Không ghi đè** dữ liệu admin đã sửa |
| `npm run seed:force` | Ghi đè 20 địa điểm mẫu về dữ liệu gốc |
| `npm run make-admin -- email@x.com MatKhau123 "Tên"` | Tạo admin mới hoặc nâng quyền admin cho tài khoản đã có |

## Cấu trúc

```
index.html, admin.html
css/            account.css (tài khoản, khám phá), admin.css (quản trị), các file gốc
js/
  api.js        Kết nối API, trạng thái đăng nhập, thông báo
  door.js       Mở cửa: gọi API random / chi tiết địa điểm
  travel-book.js Cuốn sách cẩm nang (nội dung lấy từ DB)
  app-ui.js     Điểm đến nổi bật, khám phá, đăng nhập, tài khoản cá nhân
  admin.js      Trang quản trị
backend/
  server.js     Express: API + phục vụ website + /uploads
  config/db.js  Kết nối MongoDB
  models/       Destination, User, Image
  routes/       destinations, auth, me, admin
  middleware/   auth.js (đăng nhập, phân quyền)
  utils/        password.js (scrypt), token.js (JWT), history.js
  data/         Dữ liệu gốc dùng cho seed (trước đây hardcode trong js/)
  uploads/      Ảnh admin tải lên
```

## API

Đánh dấu: 🔓 công khai · 👤 cần đăng nhập · 🛡 chỉ admin. Token gửi qua header `Authorization: Bearer <token>`.

**Hệ thống**
- 🔓 `GET /api/health` — trạng thái kết nối MongoDB

**Địa điểm**
- 🔓 `GET /api/destinations` — danh sách. Tham số: `q` (tìm kiếm, gõ không dấu được), `country`, `featured`, `sort` (`name` | `popular` | `newest`), `page`, `limit`, `full=1` (kèm cẩm nang), `includeInactive=1` (chỉ admin)
- 🔓 `GET /api/destinations/countries` — danh sách quốc gia
- 🔓 `GET /api/destinations/random?exclude=<id>` — địa điểm ngẫu nhiên kèm cẩm nang (đăng nhập thì được ghi vào lịch sử)
- 🔓 `GET /api/destinations/:id` — chi tiết theo id hoặc tên. `?track=1` để ghi lịch sử
- 🛡 `POST /api/destinations` — thêm
- 🛡 `PUT` / `PATCH /api/destinations/:id` — sửa
- 🛡 `DELETE /api/destinations/:id` — xóa (gỡ luôn khỏi yêu thích và lịch sử của người dùng)

**Tài khoản**
- 🔓 `POST /api/auth/register` — `{ name, email, password }`
- 🔓 `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- 👤 `GET /api/me`, `PUT /api/me` — xem / sửa tên, email, ảnh đại diện, giới thiệu
- 👤 `PUT /api/me/password` — `{ currentPassword, newPassword }`
- 👤 `GET /api/me/favorites`, `POST|DELETE /api/me/favorites/:id`
- 👤 `GET /api/me/history`, `DELETE /api/me/history`, `DELETE /api/me/history/:entryId`

**Quản trị**
- 🛡 `GET /api/admin/stats`
- 🛡 `GET /api/admin/images` (`?source=assets` để xem ảnh có sẵn trong website), `POST /api/admin/images` (gửi file ảnh trong body, header `X-Filename`), `PUT|DELETE /api/admin/images/:id`
- 🛡 `GET /api/admin/users`, `PUT /api/admin/users/:id` (`role`, `locked`, `name`), `PUT /api/admin/users/:id/password`, `DELETE /api/admin/users/:id`

## Bảo mật

- Mật khẩu được mã hóa bằng **scrypt** (có sẵn trong Node.js, mỗi mật khẩu một salt riêng). Không lưu mật khẩu gốc.
- Đăng nhập sai quá 10 lần trong 15 phút sẽ bị tạm chặn.
- Người dùng tự đăng ký luôn có quyền `user`. Chỉ admin mới cấp được quyền admin.
- Admin không thể tự hạ quyền, tự khóa, tự xóa mình; hệ thống luôn giữ ít nhất một admin.
- Ảnh tải lên được kiểm tra định dạng thật qua nội dung file (JPG, PNG, WEBP, GIF, AVIF; tối đa 8MB).
- Server không cho tải `backend/`, `.env`, `.git` qua trình duyệt.
