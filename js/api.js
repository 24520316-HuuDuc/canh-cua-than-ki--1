/* ==========================================================================
   api.js — kết nối Backend (MongoDB) + trạng thái đăng nhập dùng chung
   ========================================================================== */

/* Địa chỉ API:
   - Mở web qua backend (http://localhost:3000) → dùng cùng địa chỉ.
   - Mở bằng Live Server / file trực tiếp → gọi http://localhost:3000.
   - Muốn đổi: đặt window.MAGIC_DOOR_API = "https://..." trước khi nạp file này. */
const API_BASE = (() => {
  if (typeof window.MAGIC_DOOR_API === "string") {
    return window.MAGIC_DOOR_API.replace(/\/$/, "");
  }

  return "https://canh-cua-than-ki.onrender.com";
})();

/* Ảnh tải lên nằm trên server API */
function resolveAsset(path) {
  const value = String(path || "").trim();
  if (value.startsWith("/uploads/")) return API_BASE + value;
  return value;
}

/* Gọi API, tự gắn token và trả lỗi tiếng Việt dễ hiểu */
async function api(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const options = { method, headers: { ...headers } };
  const token = Auth.token;

  if (token) options.headers.Authorization = `Bearer ${token}`;

  if (body !== undefined) {
    if (raw) {
      options.body = body;
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(API_BASE + path, options);
  } catch (error) {
    const err = new Error("Không kết nối được máy chủ. Hãy chạy Backend (npm start trong thư mục backend).");
    err.status = 0;
    throw err;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // Token hết hạn hoặc tài khoản bị khóa → đăng xuất
    if ((response.status === 401 || response.status === 403) && token && /phiên|khóa|đăng nhập/i.test(data?.message || "")) {
      Auth.clear();
    }
    const err = new Error(data?.message || `Lỗi ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

/* Chuẩn hóa dữ liệu địa điểm từ MongoDB sang cấu trúc giao diện đang dùng */
function prepareDestination(item) {
  const images = [].concat(item.image || []).map(resolveAsset).filter(Boolean);
  return {
    ...item,
    image: images.length > 1 ? images : images[0] || "",
    gallery: (item.gallery || []).map(resolveAsset),
    desc: item.description || "",
    place: item.place || item.country || ""
  };
}

/* ---------------- Trạng thái đăng nhập ---------------- */

const Auth = (() => {
  const TOKEN_KEY = "magic-door-token";
  const listeners = new Set();
  let token = "";
  let user = null;

  try {
    token = localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    token = "";
  }

  function emit() {
    listeners.forEach((fn) => {
      try { fn(user); } catch (error) { console.error(error); }
    });
  }

  function save(nextToken, nextUser) {
    token = nextToken || "";
    user = nextUser || null;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Trình duyệt chặn localStorage: vẫn đăng nhập được trong phiên hiện tại
    }
    emit();
  }

  return {
    get token() { return token; },
    get user() { return user; },
    get loggedIn() { return Boolean(user); },
    get isAdmin() { return user?.role === "admin"; },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async login(email, password) {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      save(data.token, data.user);
      return data.user;
    },

    async register(name, email, password) {
      const data = await api("/api/auth/register", { method: "POST", body: { name, email, password } });
      save(data.token, data.user);
      return data.user;
    },

    /* Lấy lại thông tin tài khoản khi tải trang */
    async refresh() {
      if (!token) {
        emit();
        return null;
      }
      try {
        user = await api("/api/me");
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          save("", null);
          return null;
        }
        console.warn("Không tải được tài khoản:", error.message);
      }
      emit();
      return user;
    },

    setUser(nextUser) {
      user = nextUser;
      emit();
    },

    setFavorites(ids) {
      if (!user) return;
      user = { ...user, favorites: ids };
      emit();
    },

    isFavorite(id) {
      return Boolean(user && (user.favorites || []).includes(String(id)));
    },

    clear() {
      save("", null);
    },

    logout() {
      save("", null);
    }
  };
})();

/* ---------------- Thông báo nhỏ ---------------- */

function toast(message, type = "info") {
  let box = document.querySelector("#toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  box.appendChild(item);

  setTimeout(() => item.classList.add("hide"), 3200);
  setTimeout(() => item.remove(), 3700);
}

/* Thoát HTML khi chèn chữ vào innerHTML */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
