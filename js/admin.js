/* ==========================================================================
   admin.js — Trang quản trị: tổng quan, địa điểm, hình ảnh, người dùng
   ========================================================================== */
(() => {
  "use strict";

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

  const fmtDate = (value, withTime = false) => {
    if (!value) return "—";
    const date = new Date(value);
    return date.toLocaleString("vi-VN", withTime
      ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const fmtSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  /* Ảnh thu nhỏ: thử đường dẫn gốc rồi các đuôi file phổ biến */
  function thumb(path, alt = "") {
    const raw = String([].concat(path || [])[0] || "").trim();
    const img = document.createElement("img");
    img.alt = alt;
    img.loading = "lazy";

    if (!raw) {
      const span = document.createElement("span");
      span.className = "no-img";
      span.textContent = "✧";
      return span;
    }

    const base = resolveAsset(raw);
    const hasExt = /\.[a-z0-9]{3,4}$/i.test(base);
    const list = hasExt ? [base] : EXTENSIONS.map((ext) => base + ext);
    let index = 0;

    img.onerror = () => {
      index += 1;
      if (index < list.length) img.src = encodeURI(list[index]);
      else {
        const span = document.createElement("span");
        span.className = "no-img";
        span.textContent = "✧";
        img.replaceWith(span);
      }
    };
    img.src = encodeURI(list[0]);
    return img;
  }

  /* ---------------- Cửa sổ ---------------- */

  function openModal(id) {
    const modal = q(`#${id}`);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    const modal = q(`#${id}`);
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  document.addEventListener("click", (event) => {
    const closer = event.target.closest("[data-close]");
    if (closer) closeModal(closer.closest(".modal").id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = qa(".modal.open").pop();
    if (open) closeModal(open.id);
  });

  /* ---------------- Đăng nhập & phân quyền ---------------- */

  function showGate(denied = false) {
    q("#app").hidden = true;
    q("#gate").hidden = false;
    q("#gate-login").hidden = denied;
    q("#gate-denied").hidden = !denied;
    if (denied) q("#gate-who").textContent = Auth.user?.email || "";
    else setTimeout(() => q("#gate-email").focus(), 50);
  }

  function showApp() {
    q("#gate").hidden = true;
    q("#app").hidden = false;
    const user = Auth.user;
    q("#me-box").innerHTML = `
      <span class="avatar">${escapeHtml((user.name || "?").charAt(0).toUpperCase())}</span>
      <div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div>`;
    showView(location.hash.slice(1) || "overview");
  }

  function route() {
    if (!Auth.loggedIn) return showGate(false);
    if (!Auth.isAdmin) return showGate(true);
    return showApp();
  }

  q("#gate-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = q("button[type=submit]", event.currentTarget);
    q("#gate-error").textContent = "";
    button.disabled = true;
    try {
      await Auth.login(q("#gate-email").value, q("#gate-password").value);
      route();
    } catch (error) {
      q("#gate-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  q("#gate-logout").addEventListener("click", () => {
    Auth.logout();
    showGate(false);
  });

  q("#logout").addEventListener("click", () => {
    Auth.logout();
    showGate(false);
  });

  /* ---------------- Điều hướng ---------------- */

  const loaders = {
    overview: loadOverview,
    destinations: loadDestinations,
    images: loadImages,
    users: loadUsers
  };

  function showView(view) {
    if (!loaders[view]) view = "overview";
    qa("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    qa("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== view; });
    if (location.hash.slice(1) !== view) history.replaceState(null, "", `#${view}`);
    loaders[view]();
  }

  qa("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  /* Lỗi quyền giữa chừng (bị khóa, hết hạn) → quay về màn hình đăng nhập */
  function handleError(error) {
    toast(error.message, "error");
    if (error.status === 401 || error.status === 403) route();
  }

  /* ---------------- Tổng quan ---------------- */

  async function loadOverview() {
    try {
      const health = await api("/api/health").catch((e) => e.data || { database: "lỗi" });
      const pill = q("#db-status");
      pill.textContent = health.database === "connected" ? "● MongoDB đã kết nối" : `● MongoDB: ${health.database}`;
      pill.classList.toggle("ok", health.database === "connected");

      const s = await api("/api/admin/stats");
      const cards = [
        ["Địa điểm", s.destinations, `${s.activeDestinations} đang hiển thị · ${s.featured} nổi bật`, "destinations"],
        ["Người dùng", s.users, `${s.admins} quản trị viên · ${s.locked} bị khóa`, "users"],
        ["Ảnh đã tải lên", s.images, "Thư viện hình ảnh", "images"]
      ];
      q("#stat-cards").innerHTML = cards.map(([label, value, sub, view]) => `
        <button class="stat-card" type="button" data-goto="${view}">
          <small>${label}</small><strong>${value}</strong><span>${sub}</span>
        </button>`).join("");
      qa("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));

      q("#stat-popular").innerHTML = s.popular.length
        ? s.popular.map((d) => `<li><span>${escapeHtml(d.name)} <small>${escapeHtml(d.country)}</small></span><b>${d.viewCount || 0} lượt</b></li>`).join("")
        : `<li class="muted">Chưa có dữ liệu</li>`;

      q("#stat-users").innerHTML = s.newestUsers.length
        ? s.newestUsers.map((u) => `<li><span>${escapeHtml(u.name)} <small>${escapeHtml(u.email)}</small></span><em class="badge ${u.role}">${u.role === "admin" ? "Admin" : "Thành viên"}</em></li>`).join("")
        : `<li class="muted">Chưa có thành viên</li>`;
    } catch (error) {
      handleError(error);
    }
  }

  /* ---------------- Địa điểm ---------------- */

  let destinations = [];
  let editingId = null;

  async function loadDestinations() {
    const tbody = q("#dest-rows");
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Đang tải…</td></tr>`;
    try {
      const params = new URLSearchParams({ includeInactive: "1", limit: "200", full: "1" });
      const search = q("#dest-search").value.trim();
      if (search) params.set("q", search);
      const data = await api(`/api/destinations?${params}`);
      destinations = data.items;

      const countries = [...new Set(destinations.map((d) => d.country))].sort((a, b) => a.localeCompare(b, "vi"));
      q("#country-list").innerHTML = countries.map((c) => `<option value="${escapeHtml(c)}">`).join("");

      renderDestinations();
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty error">${escapeHtml(error.message)}</td></tr>`;
      handleError(error);
    }
  }

  function renderDestinations() {
    const filter = q("#dest-filter").value;
    const rows = destinations.filter((d) =>
      filter === "active" ? d.active
        : filter === "hidden" ? !d.active
          : filter === "featured" ? d.featured
            : true);

    q("#dest-count").textContent = `${rows.length} / ${destinations.length} địa điểm`;
    const tbody = q("#dest-rows");

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">Không có địa điểm phù hợp.</td></tr>`;
      return;
    }

    tbody.replaceChildren(...rows.map((d) => {
      const tr = document.createElement("tr");
      if (!d.active) tr.classList.add("dim");
      tr.innerHTML = `
        <td class="cell-thumb"></td>
        <td><strong>${escapeHtml(d.name)}</strong><small class="sub">${escapeHtml(d.place || "")}</small></td>
        <td>${escapeHtml(d.country)}</td>
        <td><button type="button" class="star ${d.featured ? "on" : ""}" data-act="featured" aria-label="Nổi bật" aria-pressed="${d.featured}">★</button></td>
        <td><label class="switch"><input type="checkbox" data-act="active" ${d.active ? "checked" : ""} aria-label="Hiển thị"><span></span></label></td>
        <td>${(d.guide || []).length ? `${d.guide.length} đoạn` : `<span class="warn">Trống</span>`}</td>
        <td>${d.viewCount || 0}</td>
        <td class="actions">
          <button type="button" class="btn small" data-act="edit">Sửa</button>
          <button type="button" class="btn small danger" data-act="delete">Xóa</button>
        </td>`;
      q(".cell-thumb", tr).appendChild(thumb(d.image, d.name));

      q("[data-act=featured]", tr).addEventListener("click", () => quickUpdate(d, { featured: !d.featured }));
      q("[data-act=active]", tr).addEventListener("change", (e) => quickUpdate(d, { active: e.target.checked }));
      q("[data-act=edit]", tr).addEventListener("click", () => openEditor(d));
      q("[data-act=delete]", tr).addEventListener("click", () => deleteDestination(d));
      return tr;
    }));
  }

  async function quickUpdate(destination, patch) {
    try {
      const updated = await api(`/api/destinations/${destination._id}`, { method: "PATCH", body: patch });
      Object.assign(destination, updated);
      renderDestinations();
      toast(`Đã cập nhật "${destination.name}"`, "success");
    } catch (error) {
      handleError(error);
      renderDestinations();
    }
  }

  async function deleteDestination(destination) {
    if (!confirm(`Xóa vĩnh viễn "${destination.name}"?\nĐịa điểm cũng sẽ bị gỡ khỏi danh sách yêu thích và lịch sử của người dùng.\n\n(Muốn tạm ẩn thì tắt "Hiển thị" thay vì xóa.)`)) return;
    try {
      const result = await api(`/api/destinations/${destination._id}`, { method: "DELETE" });
      toast(result.message, "success");
      loadDestinations();
    } catch (error) {
      handleError(error);
    }
  }

  const form = q("#dest-form");

  function updateImagePreview() {
    const box = q("#dest-image-preview");
    const value = form.elements.image.value.trim();
    box.replaceChildren(value ? thumb(value) : Object.assign(document.createElement("span"), { textContent: "Chưa có ảnh" }));
  }

  function updateGuideCount() {
    const lines = form.elements.guide.value.split(/\r?\n/).filter((l) => l.trim()).length;
    q("#guide-count").textContent = lines ? `(${lines} đoạn)` : "";
  }

  function openEditor(destination = null) {
    editingId = destination?._id || null;
    form.reset();
    q("#dest-form-msg").textContent = "";
    q("#dest-form-title").textContent = destination ? `Sửa: ${destination.name}` : "Thêm địa điểm";

    const d = destination || { active: true };
    const el = form.elements;
    for (const key of ["name", "country", "place", "description", "season", "activity"]) el[key].value = d[key] || "";
    el.image.value = [].concat(d.image || []).join(", ");
    el.gallery.value = (d.gallery || []).join("\n");
    el.latitude.value = d.latitude ?? "";
    el.longitude.value = d.longitude ?? "";
    el.active.checked = d.active !== false;
    el.featured.checked = Boolean(d.featured);
    el.streetViewAvailable.checked = Boolean(d.streetViewAvailable);
    el.guide.value = (d.guide || []).join("\n");
    const views = (d.streetViews || []).length
      ? d.streetViews
      : (d.streetView && d.streetView.lat != null ? [{ name: d.name, ...d.streetView }] : []);
    renderSvRows(views);

    updateImagePreview();
    updateGuideCount();
    openModal("dest-modal");
    setTimeout(() => el.name.focus(), 50);
  }

  /* ---------- Danh sách góc 360° trong form địa điểm ---------- */

  function svLink(v) {
    const params = new URLSearchParams({
      api: "1", map_action: "pano", viewpoint: `${v.lat},${v.lng}`,
      heading: String(v.heading || 0), pitch: String(v.pitch || 0)
    });
    if (v.pano) params.set("pano", v.pano);
    return `https://www.google.com/maps/@?${params}`;
  }

  function svRow(v = {}) {
    const row = document.createElement("div");
    row.className = "sv-row";
    row.innerHTML = `
      <span class="sv-handle" title="Thứ tự">⋮⋮</span>
      <input data-k="name" placeholder="Tên góc nhìn (vd: Tháp Eiffel từ Trocadéro)" value="${escapeHtml(v.name || "")}">
      <input data-k="lat" placeholder="Vĩ độ" inputmode="decimal" value="${v.lat ?? ""}">
      <input data-k="lng" placeholder="Kinh độ" inputmode="decimal" value="${v.lng ?? ""}">
      <input data-k="heading" placeholder="Hướng" title="Hướng nhìn 0–360° (0 = Bắc, 90 = Đông)" inputmode="decimal" value="${v.heading ?? ""}">
      <input data-k="pitch" placeholder="Ngước" title="Góc ngước -90–90°" inputmode="decimal" value="${v.pitch || ""}">
      <input data-k="pano" type="hidden" value="${escapeHtml(v.pano || "")}">
      <a class="btn small" data-act="preview" target="_blank" rel="noopener" title="Xem thử trên Google Maps">↗</a>
      <button type="button" class="btn small" data-act="up" title="Đưa lên">↑</button>
      <button type="button" class="btn small danger" data-act="remove" title="Xóa góc này">✕</button>`;

    const refresh = () => {
      const data = rowData(row);
      const link = q("[data-act=preview]", row);
      if (data.lat !== "" && data.lng !== "") {
        link.href = svLink(data);
        link.classList.remove("disabled");
      } else {
        link.removeAttribute("href");
        link.classList.add("disabled");
      }
    };
    row.addEventListener("input", refresh);
    q("[data-act=remove]", row).addEventListener("click", () => {
      row.remove();
      updateSvCount();
    });
    q("[data-act=up]", row).addEventListener("click", () => {
      if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    });
    refresh();
    return row;
  }

  function rowData(row) {
    const data = {};
    row.querySelectorAll("[data-k]").forEach((input) => { data[input.dataset.k] = input.value.trim(); });
    return data;
  }

  function renderSvRows(views) {
    q("#sv-rows").replaceChildren(...views.map(svRow));
    q("#sv-paste").value = "";
    updateSvCount();
  }

  function readSvRows() {
    return [...q("#sv-rows").children]
      .map(rowData)
      .filter((v) => v.lat !== "" || v.lng !== "" || v.name !== "");
  }

  function updateSvCount() {
    const n = q("#sv-rows").children.length;
    q("#sv-count-label").textContent = n ? `— ${n} góc` : "— chưa có góc nào (sẽ dùng vĩ độ / kinh độ ở trên)";
  }

  /* Đọc link Google Maps: …/@lat,lng,3a,75y,140h,90t/… hoặc ?viewpoint=lat,lng&heading=..&pitch=.. */
  function parseMapsLink(text) {
    const value = decodeURIComponent(String(text || ""));
    const at = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)((?:,[^/?]*)*)/);
    if (at) {
      const extra = at[3] || "";
      const heading = extra.match(/,(-?\d+(?:\.\d+)?)h/);
      const tilt = extra.match(/,(-?\d+(?:\.\d+)?)t/);
      const pano = value.match(/!1s([A-Za-z0-9_-]{10,})!/);
      return {
        lat: Number(at[1]).toFixed(6) * 1,
        lng: Number(at[2]).toFixed(6) * 1,
        heading: heading ? Math.round(((Number(heading[1]) % 360) + 360) % 360) : 0,
        pitch: tilt ? Math.round(Math.max(-90, Math.min(90, Number(tilt[1]) - 90))) : 0,
        pano: pano && !pano[1].startsWith("AF1Q") ? pano[1] : ""
      };
    }
    const vp = value.match(/viewpoint=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (vp) {
      const heading = value.match(/heading=(-?\d+(?:\.\d+)?)/);
      const pitch = value.match(/pitch=(-?\d+(?:\.\d+)?)/);
      return {
        lat: Number(vp[1]), lng: Number(vp[2]),
        heading: heading ? Math.round(Number(heading[1])) : 0,
        pitch: pitch ? Math.round(Number(pitch[1])) : 0,
        pano: ""
      };
    }
    const plain = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]), heading: 0, pitch: 0, pano: "" };
    return null;
  }

  q("#sv-paste").addEventListener("input", (event) => {
    const parsed = parseMapsLink(event.target.value);
    if (!parsed) return;
    const row = svRow(parsed);
    q("#sv-rows").appendChild(row);
    event.target.value = "";
    updateSvCount();
    toast("Đã thêm góc 360°. Hãy đặt tên cho góc nhìn này.", "success");
    q("[data-k=name]", row).focus();
  });

  q("#sv-add").addEventListener("click", () => {
    const row = svRow();
    q("#sv-rows").appendChild(row);
    updateSvCount();
    q("[data-k=name]", row).focus();
  });

  /* Form thường bị gửi khi nhấn Enter trong ô nhập góc 360° → chặn lại */
  q("#sv-rows").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });

  q("#dest-add").addEventListener("click", () => openEditor());
  form.elements.image.addEventListener("input", updateImagePreview);
  form.elements.guide.addEventListener("input", updateGuideCount);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const el = form.elements;
    const msg = q("#dest-form-msg");
    msg.textContent = "";

    if (!el.name.value.trim() || !el.country.value.trim()) {
      msg.textContent = "Hãy nhập tên địa điểm và quốc gia.";
      return;
    }

    const images = el.image.value.split(",").map((s) => s.trim()).filter(Boolean);
    const body = {
      name: el.name.value,
      country: el.country.value,
      place: el.place.value,
      description: el.description.value,
      image: images.length > 1 ? images : images[0] || "",
      gallery: el.gallery.value,
      season: el.season.value,
      activity: el.activity.value,
      latitude: el.latitude.value.trim(),
      longitude: el.longitude.value.trim(),
      active: el.active.checked,
      featured: el.featured.checked,
      streetViewAvailable: el.streetViewAvailable.checked,
      guide: el.guide.value,
      streetViews: readSvRows()
    };

    const button = q("button[type=submit]", form);
    button.disabled = true;
    try {
      const saved = await api(editingId ? `/api/destinations/${editingId}` : "/api/destinations", {
        method: editingId ? "PUT" : "POST",
        body
      });
      toast(editingId ? `Đã lưu "${saved.name}"` : `Đã thêm "${saved.name}"`, "success");
      closeModal("dest-modal");
      loadDestinations();
    } catch (error) {
      msg.textContent = error.message;
      if (error.status === 401 || error.status === 403) handleError(error);
    } finally {
      button.disabled = false;
    }
  });

  let searchTimer = null;
  q("#dest-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadDestinations, 250);
  });
  q("#dest-filter").addEventListener("change", renderDestinations);

  /* ---------------- Tải ảnh lên ---------------- */

  async function uploadFiles(files) {
    const uploaded = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast(`"${file.name}" không phải ảnh.`, "error");
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast(`"${file.name}" lớn hơn 8MB.`, "error");
        continue;
      }
      try {
        const image = await api("/api/admin/images", {
          method: "POST",
          raw: true,
          body: file,
          headers: { "Content-Type": file.type, "X-Filename": encodeURIComponent(file.name) }
        });
        uploaded.push(image);
      } catch (error) {
        handleError(error);
      }
    }
    if (uploaded.length) toast(`Đã tải lên ${uploaded.length} ảnh.`, "success");
    return uploaded;
  }

  /* ---------------- Hình ảnh ---------------- */

  let imageSource = "uploads";
  let imageItems = [];

  async function fetchImages(source) {
    return api(source === "assets" ? "/api/admin/images?source=assets" : "/api/admin/images");
  }

  async function loadImages() {
    const grid = q("#img-grid");
    grid.innerHTML = `<p class="empty">Đang tải…</p>`;
    try {
      imageItems = await fetchImages(imageSource);
      renderImages();
    } catch (error) {
      grid.innerHTML = `<p class="empty error">${escapeHtml(error.message)}</p>`;
      handleError(error);
    }
  }

  function renderImages() {
    const grid = q("#img-grid");
    const term = q("#img-search").value.trim().toLowerCase();
    const items = imageItems.filter((img) =>
      !term || [img.url, img.originalName, img.alt, img.filename].some((v) => String(v || "").toLowerCase().includes(term)));

    q("#img-count").textContent = `${items.length} ảnh`;

    if (!items.length) {
      grid.innerHTML = `<p class="empty">${imageSource === "uploads" ? "Chưa có ảnh nào được tải lên. Bấm “Tải ảnh lên” hoặc kéo thả ảnh vào khung phía trên." : "Không có ảnh phù hợp."}</p>`;
      return;
    }

    grid.replaceChildren(...items.map((img) => {
      const card = document.createElement("figure");
      card.className = "img-card";
      const media = document.createElement("div");
      media.className = "img-media";
      media.appendChild(thumb(img.url, img.alt || img.filename));
      card.appendChild(media);

      const caption = document.createElement("figcaption");
      if (img.builtin) {
        caption.innerHTML = `
          <strong title="${escapeHtml(img.url)}">${escapeHtml(img.filename)}</strong>
          <small>${escapeHtml(img.folder)}</small>
          <div class="row"><button type="button" class="btn small" data-act="copy">Sao chép đường dẫn</button></div>`;
      } else {
        caption.innerHTML = `
          <input class="alt-input" value="${escapeHtml(img.alt || "")}" placeholder="Mô tả ảnh" aria-label="Mô tả ảnh">
          <small>${escapeHtml(img.originalName || img.filename)} · ${fmtSize(img.size)} · ${fmtDate(img.createdAt)}</small>
          <small class="${img.usedBy?.length ? "used" : "muted"}">${img.usedBy?.length ? `Đang dùng: ${escapeHtml(img.usedBy.join(", "))}` : "Chưa được dùng"}</small>
          <div class="row">
            <button type="button" class="btn small" data-act="copy">Sao chép</button>
            <button type="button" class="btn small danger" data-act="delete">Xóa</button>
          </div>`;

        const alt = q(".alt-input", caption);
        alt.addEventListener("change", async () => {
          try {
            await api(`/api/admin/images/${img._id}`, { method: "PUT", body: { alt: alt.value } });
            img.alt = alt.value;
            toast("Đã lưu mô tả ảnh.", "success");
          } catch (error) {
            handleError(error);
          }
        });

        q("[data-act=delete]", caption).addEventListener("click", () => deleteImage(img));
      }

      q("[data-act=copy]", caption).addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(img.url);
          toast(`Đã sao chép: ${img.url}`, "success");
        } catch {
          prompt("Sao chép đường dẫn ảnh:", img.url);
        }
      });

      card.appendChild(caption);
      return card;
    }));
  }

  async function deleteImage(img, force = false) {
    if (!force && !confirm(`Xóa ảnh "${img.originalName || img.filename}"?`)) return;
    try {
      await api(`/api/admin/images/${img._id}${force ? "?force=1" : ""}`, { method: "DELETE" });
      toast("Đã xóa ảnh.", "success");
      loadImages();
    } catch (error) {
      if (error.status === 409 && confirm(`${error.message}\nVẫn xóa? Ảnh sẽ được gỡ khỏi các địa điểm đó.`)) {
        deleteImage(img, true);
      } else if (error.status !== 409) {
        handleError(error);
      }
    }
  }

  qa("[data-img-source]").forEach((button) => {
    button.addEventListener("click", () => {
      imageSource = button.dataset.imgSource;
      qa("[data-img-source]").forEach((b) => b.classList.toggle("active", b === button));
      loadImages();
    });
  });

  q("#img-search").addEventListener("input", renderImages);

  q("#img-input").addEventListener("change", async (event) => {
    await uploadFiles([...event.target.files]);
    event.target.value = "";
    imageSource = "uploads";
    qa("[data-img-source]").forEach((b) => b.classList.toggle("active", b.dataset.imgSource === "uploads"));
    loadImages();
  });

  const dropzone = q("#dropzone");
  ["dragenter", "dragover"].forEach((type) => dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove("over")));
  dropzone.addEventListener("drop", async (event) => {
    event.preventDefault();
    await uploadFiles([...event.dataTransfer.files]);
    loadImages();
  });

  /* ---------------- Chọn ảnh cho địa điểm ---------------- */

  let pickerTarget = "main";
  let pickerSource = "uploads";
  let pickerItems = [];

  async function openPicker(target) {
    pickerTarget = target;
    q("#picker-title").textContent = target === "main" ? "Chọn ảnh chính" : "Thêm ảnh bổ sung";
    openModal("picker-modal");
    await loadPicker();
  }

  async function loadPicker() {
    const grid = q("#picker-grid");
    grid.innerHTML = `<p class="empty">Đang tải…</p>`;
    try {
      pickerItems = await fetchImages(pickerSource);
      renderPicker();
    } catch (error) {
      grid.innerHTML = `<p class="empty error">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderPicker() {
    const term = q("#picker-search").value.trim().toLowerCase();
    const items = pickerItems.filter((img) =>
      !term || [img.url, img.originalName, img.alt].some((v) => String(v || "").toLowerCase().includes(term)));
    const grid = q("#picker-grid");

    if (!items.length) {
      grid.innerHTML = `<p class="empty">Không có ảnh. Bạn có thể tải ảnh mới lên.</p>`;
      return;
    }

    grid.replaceChildren(...items.map((img) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "img-card pick";
      button.title = img.url;
      const media = document.createElement("div");
      media.className = "img-media";
      media.appendChild(thumb(img.url));
      const label = document.createElement("small");
      label.textContent = img.originalName || img.filename;
      button.append(media, label);
      button.addEventListener("click", () => choose(img.url));
      return button;
    }));
  }

  function choose(url) {
    const el = form.elements;
    if (pickerTarget === "main") {
      el.image.value = url;
      updateImagePreview();
    } else {
      const lines = el.gallery.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (!lines.includes(url)) lines.push(url);
      el.gallery.value = lines.join("\n");
    }
    closeModal("picker-modal");
  }

  q("#pick-main").addEventListener("click", () => openPicker("main"));
  q("#pick-gallery").addEventListener("click", () => openPicker("gallery"));
  q("#picker-search").addEventListener("input", renderPicker);
  qa("[data-picker-source]").forEach((button) => {
    button.addEventListener("click", () => {
      pickerSource = button.dataset.pickerSource;
      qa("[data-picker-source]").forEach((b) => b.classList.toggle("active", b === button));
      loadPicker();
    });
  });
  q("#picker-upload").addEventListener("change", async (event) => {
    const [image] = await uploadFiles([...event.target.files]);
    event.target.value = "";
    if (image) choose(image.url);
  });

  /* ---------------- Người dùng ---------------- */

  async function loadUsers() {
    const tbody = q("#user-rows");
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Đang tải…</td></tr>`;
    try {
      const params = new URLSearchParams({ limit: "100" });
      const search = q("#user-search").value.trim();
      const role = q("#user-role").value;
      if (search) params.set("q", search);
      if (role) params.set("role", role);

      const { items, total } = await api(`/api/admin/users?${params}`);
      q("#user-count").textContent = `${total} người dùng`;

      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty">Không có người dùng phù hợp.</td></tr>`;
        return;
      }

      const myId = Auth.user?._id;
      tbody.replaceChildren(...items.map((u) => {
        const self = u._id === myId;
        const tr = document.createElement("tr");
        if (u.locked) tr.classList.add("dim");
        tr.innerHTML = `
          <td>
            <div class="user-cell">
              <span class="avatar">${escapeHtml((u.name || "?").charAt(0).toUpperCase())}</span>
              <div><strong>${escapeHtml(u.name)}${self ? ' <em class="badge">Bạn</em>' : ""}</strong><small class="sub">${escapeHtml(u.email)}</small></div>
            </div>
          </td>
          <td>
            <select data-act="role" ${self ? "disabled" : ""} aria-label="Quyền">
              <option value="user" ${u.role === "user" ? "selected" : ""}>Thành viên</option>
              <option value="admin" ${u.role === "admin" ? "selected" : ""}>Quản trị viên</option>
            </select>
          </td>
          <td><label class="switch lock"><input type="checkbox" data-act="lock" ${u.locked ? "checked" : ""} ${self ? "disabled" : ""} aria-label="Khóa tài khoản"><span></span></label> <small>${u.locked ? "Đã khóa" : "Hoạt động"}</small></td>
          <td>${(u.favorites || []).length}</td>
          <td>${u.historyCount || 0}</td>
          <td>${fmtDate(u.createdAt)}</td>
          <td>${fmtDate(u.lastLoginAt, true)}</td>
          <td class="actions">
            <button type="button" class="btn small" data-act="password">Đặt lại mật khẩu</button>
            <button type="button" class="btn small danger" data-act="delete" ${self ? "disabled" : ""}>Xóa</button>
          </td>`;

        q("[data-act=role]", tr).addEventListener("change", (e) => updateUser(u, { role: e.target.value }));
        q("[data-act=lock]", tr).addEventListener("change", (e) => updateUser(u, { locked: e.target.checked }));
        q("[data-act=password]", tr).addEventListener("click", () => resetPassword(u));
        q("[data-act=delete]", tr).addEventListener("click", () => deleteUser(u));
        return tr;
      }));
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty error">${escapeHtml(error.message)}</td></tr>`;
      handleError(error);
    }
  }

  async function updateUser(user, patch) {
    try {
      await api(`/api/admin/users/${user._id}`, { method: "PUT", body: patch });
      toast(`Đã cập nhật ${user.email}`, "success");
    } catch (error) {
      handleError(error);
    }
    loadUsers();
  }

  async function resetPassword(user) {
    const value = prompt(`Mật khẩu mới cho ${user.email} (ít nhất 6 ký tự, có chữ và số):`);
    if (!value) return;
    try {
      const result = await api(`/api/admin/users/${user._id}/password`, { method: "PUT", body: { newPassword: value } });
      toast(result.message, "success");
    } catch (error) {
      handleError(error);
    }
  }

  async function deleteUser(user) {
    if (!confirm(`Xóa tài khoản ${user.email}? Danh sách yêu thích và lịch sử của người này cũng bị xóa.`)) return;
    try {
      const result = await api(`/api/admin/users/${user._id}`, { method: "DELETE" });
      toast(result.message, "success");
      loadUsers();
    } catch (error) {
      handleError(error);
    }
  }

  let userTimer = null;
  q("#user-search").addEventListener("input", () => {
    clearTimeout(userTimer);
    userTimer = setTimeout(loadUsers, 250);
  });
  q("#user-role").addEventListener("change", loadUsers);

  /* ---------------- Khởi động ---------------- */

  Auth.refresh().then(route);
})();
