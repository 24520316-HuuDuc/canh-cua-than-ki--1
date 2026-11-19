/* ==========================================================================
   app-ui.js — điểm đến nổi bật, khám phá, đăng nhập, tài khoản cá nhân
   (dữ liệu lấy hoàn toàn từ API / MongoDB)
   ========================================================================== */
(() => {
  "use strict";

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ---------------- Ảnh thu nhỏ ---------------- */

  /* Thử lần lượt các đường dẫn ảnh, hết thì hiện ký hiệu thay thế */
  function setThumb(img, image, fallbackText = "✧") {
    const list = imageCandidates([].concat(image || []).filter(Boolean));
    let index = 0;

    const giveUp = () => {
      const span = document.createElement("span");
      span.className = "thumb-fallback";
      span.textContent = fallbackText;
      img.replaceWith(span);
    };

    img.onerror = () => {
      index += 1;
      if (index < list.length) img.src = encodeURI(list[index]);
      else giveUp();
    };

    if (list.length) img.src = encodeURI(list[0]);
    else giveUp();
  }

  function thumb(image, alt, fallback) {
    const img = document.createElement("img");
    img.alt = alt || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    setThumb(img, image, fallback);
    return img;
  }

  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /* ---------------- Cửa sổ (modal) ---------------- */

  let lastFocus = null;

  function openModal(id) {
    const modal = q(`#${id}`);
    if (!modal) return;
    qa(".ui-modal.open").forEach((m) => m !== modal && closeModal(m.id, false));
    lastFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("ui-modal-open");
    setTimeout(() => {
      const first = q("[data-autofocus]", modal) || q("input, button:not(.ui-close)", modal);
      first?.focus();
    }, 60);
  }

  function closeModal(id, restoreFocus = true) {
    const modal = q(`#${id}`);
    if (!modal || !modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    if (!q(".ui-modal.open")) document.body.classList.remove("ui-modal-open");
    if (restoreFocus && lastFocus?.focus) lastFocus.focus();
  }

  function closeAllModals() {
    qa(".ui-modal.open").forEach((m) => closeModal(m.id, false));
  }

  document.addEventListener("click", (event) => {
    const closer = event.target.closest("[data-close]");
    if (closer) closeModal(closer.closest(".ui-modal")?.id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const open = qa(".ui-modal.open").pop();
      if (open) closeModal(open.id);
    }
  });

  /* Chọn một địa điểm: đóng cửa sổ, mở cánh cửa tới đúng địa điểm đó */
  function chooseDestination(id) {
    closeAllModals();
    goToDestination(id);
  }

  /* ---------------- Yêu thích ---------------- */

  async function toggleFavorite(id, name = "") {
    if (!Auth.loggedIn) {
      openAuth("login", "Đăng nhập để lưu địa điểm yêu thích của bạn.");
      return;
    }

    const wasFavorite = Auth.isFavorite(id);
    try {
      const result = await api(`/api/me/favorites/${id}`, { method: wasFavorite ? "DELETE" : "POST" });
      Auth.setFavorites(result.favorites);
      toast(wasFavorite ? `Đã bỏ "${name || "địa điểm"}" khỏi yêu thích` : `Đã lưu "${name || "địa điểm"}" vào yêu thích ♥`, "success");
      if (q("#account-modal.open") && accountTab === "favorites") loadFavorites();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function heartButton(destination) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "heart-btn";
    button.dataset.favId = destination._id;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(destination._id, destination.name);
    });
    paintHeart(button);
    return button;
  }

  function paintHeart(button) {
    const on = Auth.isFavorite(button.dataset.favId);
    button.classList.toggle("on", on);
    button.textContent = on ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Bỏ yêu thích" : "Thêm vào yêu thích");
  }

  function paintAllHearts() {
    qa(".heart-btn").forEach(paintHeart);

    const destFav = q("#fav-toggle");
    const current = window.currentDestination;
    if (destFav && current) {
      const on = Auth.isFavorite(current._id);
      destFav.classList.toggle("on", on);
      destFav.textContent = on ? "♥ Đã yêu thích" : "♡ Yêu thích";
      destFav.setAttribute("aria-pressed", String(on));
    }
  }

  q("#fav-toggle")?.addEventListener("click", () => {
    const current = window.currentDestination;
    if (current?._id) toggleFavorite(current._id, current.name);
  });

  document.addEventListener("destination:change", paintAllHearts);

  /* ---------------- Điểm đến nổi bật (trang chủ) ---------------- */

  function featuredCard(destination) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "featured-card";
    card.title = `Mở cánh cửa tới ${destination.name}`;

    const art = document.createElement("span");
    art.className = "featured-card-art";
    art.setAttribute("aria-hidden", "true");
    art.appendChild(thumb(destination.image, "", "✧"));

    const name = document.createElement("span");
    name.className = "featured-card-name";
    name.textContent = destination.name;

    const meta = document.createElement("span");
    meta.className = "featured-card-meta";
    meta.textContent = String(destination.country || "").toUpperCase();

    card.append(art, name, meta);
    card.addEventListener("click", () => chooseDestination(destination._id));
    return card;
  }

  async function loadFeatured() {
    const list = q(".featured-list");
    if (!list) return;

    try {
      let { items } = await api("/api/destinations?featured=true&limit=5");
      if (!items.length) ({ items } = await api("/api/destinations?sort=popular&limit=5"));

      list.replaceChildren(...items.map(prepareDestination).map(featuredCard));
      list.classList.remove("is-loading");
    } catch (error) {
      list.classList.remove("is-loading");
      list.innerHTML = `<div class="featured-error">⚠ ${escapeHtml(error.message)}</div>`;
    }
  }

  /* ---------------- Khám phá tất cả điểm đến ---------------- */

  let exploreTimer = null;
  let exploreLoadedCountries = false;

  function destinationTile(destination) {
    const tile = document.createElement("article");
    tile.className = "dest-tile";
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");
    tile.setAttribute("aria-label", `Mở cánh cửa tới ${destination.name}`);

    const media = document.createElement("div");
    media.className = "dest-tile-media";
    media.appendChild(thumb(destination.image, destination.name, "✧"));

    const body = document.createElement("div");
    body.className = "dest-tile-body";
    body.innerHTML = `
      <small>${escapeHtml(destination.place || destination.country)}</small>
      <h3>${escapeHtml(destination.name)}</h3>
      <p>${escapeHtml(destination.desc || destination.description || "")}</p>`;

    tile.append(media, body, heartButton(destination));

    const open = () => chooseDestination(destination._id);
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    return tile;
  }

  async function loadExplore() {
    const grid = q("#explore-grid");
    const count = q("#explore-count");
    const search = q("#explore-search").value.trim();
    const country = q("#explore-country").value;

    grid.innerHTML = `<div class="ui-empty">Đang tải điểm đến…</div>`;

    if (!exploreLoadedCountries) {
      try {
        const countries = await api("/api/destinations/countries");
        const select = q("#explore-country");
        countries.forEach((name) => select.add(new Option(name, name)));
        exploreLoadedCountries = true;
      } catch {
        // Không có danh sách quốc gia vẫn tìm kiếm được
      }
    }

    try {
      const params = new URLSearchParams({ limit: "200", sort: q("#explore-sort").value });
      if (search) params.set("q", search);
      if (country) params.set("country", country);

      const { items, total } = await api(`/api/destinations?${params}`);
      count.textContent = `${total} điểm đến`;

      if (!items.length) {
        grid.innerHTML = `<div class="ui-empty">Không tìm thấy điểm đến phù hợp.</div>`;
        return;
      }

      grid.replaceChildren(...items.map(prepareDestination).map(destinationTile));
    } catch (error) {
      grid.innerHTML = `<div class="ui-empty error">⚠ ${escapeHtml(error.message)}</div>`;
    }
  }

  function openExplore() {
    openModal("explore-modal");
    loadExplore();
  }

  q("#explore-btn")?.addEventListener("click", openExplore);
  q("#featured-more")?.addEventListener("click", openExplore);
  q("#explore-search")?.addEventListener("input", () => {
    clearTimeout(exploreTimer);
    exploreTimer = setTimeout(loadExplore, 250);
  });
  q("#explore-country")?.addEventListener("change", loadExplore);
  q("#explore-sort")?.addEventListener("change", loadExplore);

  /* ---------------- Đăng nhập / Đăng ký ---------------- */

  function setAuthTab(tab) {
    qa("[data-auth-tab]").forEach((button) => {
      const on = button.dataset.authTab === tab;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", String(on));
    });
    q("#login-form").hidden = tab !== "login";
    q("#register-form").hidden = tab !== "register";
    q("#auth-error").textContent = "";
  }

  function openAuth(tab = "login", note = "") {
    setAuthTab(tab);
    q("#auth-note").textContent = note;
    q("#auth-note").hidden = !note;
    openModal("auth-modal");
    setTimeout(() => q(tab === "login" ? "#login-email" : "#register-name")?.focus(), 80);
  }

  qa("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => setAuthTab(button.dataset.authTab));
  });

  async function submitForm(form, action) {
    const button = q("button[type=submit]", form);
    const error = q("#auth-error");
    error.textContent = "";
    button.disabled = true;
    try {
      await action();
      form.reset();
      closeModal("auth-modal");
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }

  q("#login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    submitForm(form, async () => {
      const user = await Auth.login(q("#login-email").value, q("#login-password").value);
      toast(`Chào mừng trở lại, ${user.name}!`, "success");
    });
  });

  q("#register-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (q("#register-password").value !== q("#register-confirm").value) {
      q("#auth-error").textContent = "Mật khẩu nhập lại không khớp.";
      return;
    }
    submitForm(form, async () => {
      const user = await Auth.register(
        q("#register-name").value,
        q("#register-email").value,
        q("#register-password").value
      );
      toast(`Tạo tài khoản thành công. Xin chào ${user.name}!`, "success");
    });
  });

  /* ---------------- Tài khoản cá nhân ---------------- */

  let accountTab = "favorites";

  function avatarNode(user, size = "") {
    const box = document.createElement("span");
    box.className = `avatar ${size}`;
    if (user?.avatar) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = resolveAsset(user.avatar);
      img.onerror = () => {
        img.remove();
        box.textContent = (user.name || "?").trim().charAt(0).toUpperCase();
      };
      box.appendChild(img);
    } else {
      box.textContent = (user?.name || "?").trim().charAt(0).toUpperCase();
    }
    return box;
  }

  function renderAccountHeader() {
    const user = Auth.user;
    if (!user) return;
    const head = q("#account-user");
    head.replaceChildren(avatarNode(user, "lg"));
    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${escapeHtml(user.name)}</strong>
      <span>${escapeHtml(user.email)}</span>
      <em class="role-badge ${user.role}">${user.role === "admin" ? "Quản trị viên" : "Thành viên"}</em>`;
    head.appendChild(info);
    q("#admin-link").hidden = user.role !== "admin";
  }

  function setAccountTab(tab) {
    accountTab = tab;
    qa("[data-account-tab]").forEach((button) => {
      const on = button.dataset.accountTab === tab;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", String(on));
    });
    qa("[data-account-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.accountPane !== tab;
    });

    if (tab === "favorites") loadFavorites();
    if (tab === "history") loadHistory();
    if (tab === "profile") fillProfile();
  }

  qa("[data-account-tab]").forEach((button) => {
    button.addEventListener("click", () => setAccountTab(button.dataset.accountTab));
  });

  function openAccount(tab = accountTab) {
    if (!Auth.loggedIn) {
      openAuth("login");
      return;
    }
    renderAccountHeader();
    openModal("account-modal");
    setAccountTab(tab);
  }

  async function loadFavorites() {
    const grid = q("#favorites-grid");
    grid.innerHTML = `<div class="ui-empty">Đang tải…</div>`;
    try {
      const items = await api("/api/me/favorites");
      if (!items.length) {
        grid.innerHTML = `<div class="ui-empty">Bạn chưa lưu địa điểm nào. Hãy mở cánh cửa và bấm ♡ để lưu nhé!</div>`;
        return;
      }
      grid.replaceChildren(...items.map(prepareDestination).map(destinationTile));
    } catch (error) {
      grid.innerHTML = `<div class="ui-empty error">⚠ ${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadHistory() {
    const list = q("#history-list");
    list.innerHTML = `<li class="ui-empty">Đang tải…</li>`;
    try {
      const { items, total } = await api("/api/me/history?limit=100");
      q("#history-count").textContent = total ? `${total} lần khám phá` : "";
      q("#history-clear").hidden = !items.length;

      if (!items.length) {
        list.innerHTML = `<li class="ui-empty">Chưa có lịch sử. Mỗi lần bạn mở cánh cửa sẽ được ghi lại ở đây.</li>`;
        return;
      }

      list.replaceChildren(...items.map((entry) => {
        const destination = prepareDestination(entry.destination);
        const li = document.createElement("li");
        li.className = "history-item";

        const media = document.createElement("span");
        media.className = "history-thumb";
        media.appendChild(thumb(destination.image, "", "✧"));

        const info = document.createElement("button");
        info.type = "button";
        info.className = "history-info";
        info.innerHTML = `
          <strong>${escapeHtml(destination.name)}</strong>
          <small>${escapeHtml(destination.country)} · ${formatDate(entry.visitedAt)}</small>`;
        info.addEventListener("click", () => chooseDestination(destination._id));

        const badge = document.createElement("em");
        badge.className = `source-badge ${entry.source}`;
        badge.textContent = entry.source === "select" ? "Tự chọn" : "Ngẫu nhiên";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-btn";
        remove.setAttribute("aria-label", "Xóa khỏi lịch sử");
        remove.textContent = "✕";
        remove.addEventListener("click", async () => {
          try {
            await api(`/api/me/history/${entry._id}`, { method: "DELETE" });
            li.remove();
            if (!q(".history-item", list)) loadHistory();
          } catch (error) {
            toast(error.message, "error");
          }
        });

        li.append(media, info, badge, remove);
        return li;
      }));
    } catch (error) {
      list.innerHTML = `<li class="ui-empty error">⚠ ${escapeHtml(error.message)}</li>`;
    }
  }

  q("#history-clear")?.addEventListener("click", async () => {
    if (!confirm("Xóa toàn bộ lịch sử khám phá?")) return;
    try {
      await api("/api/me/history", { method: "DELETE" });
      toast("Đã xóa lịch sử khám phá.", "success");
      loadHistory();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  function fillProfile() {
    const user = Auth.user;
    if (!user) return;
    q("#profile-name").value = user.name || "";
    q("#profile-email").value = user.email || "";
    q("#profile-avatar").value = user.avatar || "";
    q("#profile-bio").value = user.bio || "";
    q("#profile-joined").textContent = user.createdAt ? `Tham gia từ ${formatDate(user.createdAt)}` : "";
    q("#profile-msg").textContent = "";
  }

  q("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const msg = q("#profile-msg");
    const button = q("button[type=submit]", event.currentTarget);
    msg.className = "form-msg";
    button.disabled = true;
    try {
      const user = await api("/api/me", {
        method: "PUT",
        body: {
          name: q("#profile-name").value,
          email: q("#profile-email").value,
          avatar: q("#profile-avatar").value,
          bio: q("#profile-bio").value
        }
      });
      Auth.setUser(user);
      renderAccountHeader();
      msg.textContent = "Đã lưu thông tin tài khoản.";
      msg.classList.add("ok");
    } catch (error) {
      msg.textContent = error.message;
      msg.classList.add("error");
    } finally {
      button.disabled = false;
    }
  });

  q("#password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const msg = q("#password-msg");
    msg.className = "form-msg";

    if (q("#password-new").value !== q("#password-confirm").value) {
      msg.textContent = "Mật khẩu mới nhập lại không khớp.";
      msg.classList.add("error");
      return;
    }

    const button = q("button[type=submit]", form);
    button.disabled = true;
    try {
      await api("/api/me/password", {
        method: "PUT",
        body: { currentPassword: q("#password-current").value, newPassword: q("#password-new").value }
      });
      form.reset();
      msg.textContent = "Đã đổi mật khẩu.";
      msg.classList.add("ok");
    } catch (error) {
      msg.textContent = error.message;
      msg.classList.add("error");
    } finally {
      button.disabled = false;
    }
  });

  q("#logout-btn")?.addEventListener("click", () => {
    Auth.logout();
    closeModal("account-modal");
    toast("Đã đăng xuất.", "info");
  });

  /* ---------------- Nút tài khoản trên thanh điều hướng ---------------- */

  function renderAccountButton() {
    const button = q("#account-btn");
    if (!button) return;
    const user = Auth.user;
    button.replaceChildren();

    if (user) {
      button.appendChild(avatarNode(user));
      const label = document.createElement("span");
      label.className = "account-label";
      label.textContent = user.name.split(" ").slice(-1)[0];
      button.appendChild(label);
      button.setAttribute("aria-label", `Tài khoản của ${user.name}`);
    } else {
      const label = document.createElement("span");
      label.className = "account-label";
      label.textContent = "Đăng nhập";
      button.append("👤 ", label);
      button.setAttribute("aria-label", "Đăng nhập hoặc đăng ký");
    }
  }

  q("#account-btn")?.addEventListener("click", () => {
    if (Auth.loggedIn) openAccount();
    else openAuth("login");
  });

  Auth.onChange(() => {
    renderAccountButton();
    paintAllHearts();
    if (!Auth.loggedIn) closeModal("account-modal", false);
  });

  /* ---------------- Khởi động ---------------- */

  renderAccountButton();
  loadFeatured();
  Auth.refresh();

  window.MagicUI = { openAuth, openAccount, openExplore, toggleFavorite };
})();
