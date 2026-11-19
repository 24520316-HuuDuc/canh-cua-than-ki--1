/* ==========================================================================
   streetview.js — xem 360° (Google Street View) của địa điểm đang mở
   - Có GOOGLE_MAPS_API_KEY: dùng Maps JavaScript API, tự tìm điểm 360° gần nhất.
   - Không có key: dùng chế độ nhúng dự phòng của Google Maps.
   ========================================================================== */
(() => {
  "use strict";

  const q = (selector) => document.querySelector(selector);

  const modal = q("#sv-modal");
  const openBtn = q("#sv-open");
  const box = q("#sv-pano");
  const status = q("#sv-status");
  if (!modal || !openBtn || !box) return;

  let configPromise = null;
  let mapsPromise = null;
  let mapsFailed = false;
  let panorama = null;
  let lastFocus = null;

  /* ---------------- Lấy tọa độ xem 360° ---------------- */

  function viewpointOf(destination) {
    if (!destination) return null;
    const sv = destination.streetView || {};
    const lat = Number.isFinite(sv.lat) ? sv.lat : destination.latitude;
    const lng = Number.isFinite(sv.lng) ? sv.lng : destination.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      heading: Number(sv.heading) || 0,
      pitch: Number(sv.pitch) || 0,
      pano: sv.pano || ""
    };
  }

  /* Danh sách góc nhìn: ưu tiên nhiều góc tại các danh thắng, không có thì dùng 1 góc mặc định */
  function viewsOf(destination) {
    if (!destination) return [];
    const list = (destination.streetViews || [])
      .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
      .map((v) => ({
        name: v.name || destination.name,
        lat: v.lat,
        lng: v.lng,
        heading: Number(v.heading) || 0,
        pitch: Number(v.pitch) || 0,
        pano: v.pano || ""
      }));
    if (list.length) return list;
    const single = viewpointOf(destination);
    return single ? [{ name: destination.name, ...single }] : [];
  }

  function canShow(destination) {
    return Boolean(destination && destination.streetViewAvailable !== false && viewsOf(destination).length);
  }

  /* Link mở Street View trên trang Google Maps */
  function mapsLink(view) {
    const params = new URLSearchParams({
      api: "1",
      map_action: "pano",
      viewpoint: `${view.lat},${view.lng}`,
      heading: String(Math.round(view.heading)),
      pitch: String(Math.round(view.pitch))
    });
    if (view.pano) params.set("pano", view.pano);
    return `https://www.google.com/maps/@?${params}`;
  }

  /* ---------------- Nạp Google Maps ---------------- */

  function loadConfig() {
    if (!configPromise) {
      configPromise = api("/api/config").catch(() => ({ googleMapsKey: "" }));
    }
    return configPromise;
  }

  function loadMaps(key) {
    if (window.google?.maps?.StreetViewService) return Promise.resolve(window.google.maps);
    if (mapsPromise) return mapsPromise;

    mapsPromise = new Promise((resolve, reject) => {
      const callback = `__magicDoorMaps${Date.now()}`;
      const timer = setTimeout(() => reject(new Error("Tải Google Maps quá lâu.")), 15000);

      window[callback] = () => {
        clearTimeout(timer);
        delete window[callback];
        resolve(window.google.maps);
      };

      // Google gọi hàm này khi key sai / chưa bật API / chưa cho phép tên miền
      window.gm_authFailure = () => {
        mapsFailed = true;
        showFallback(currentView, "Key Google Maps chưa hợp lệ hoặc chưa bật Maps JavaScript API. Đang dùng chế độ xem dự phòng.");
      };

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=vi&libraries=geometry&loading=async&callback=${callback}`;
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Không tải được Google Maps. Kiểm tra kết nối mạng."));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      mapsPromise = null;
      throw error;
    });

    return mapsPromise;
  }

  /* Tìm ảnh 360° ngoài trời gần nhất, nới rộng bán kính dần */
  function findPanorama(maps, view) {
    const service = new maps.StreetViewService();

    if (view.pano) {
      return service.getPanorama({ pano: view.pano }).then((r) => r.data);
    }

    // Thử ảnh ngoài trời trước, nới rộng bán kính dần; cuối cùng chấp nhận mọi ảnh 360°
    const attempts = [
      [80, "OUTDOOR"], [300, "OUTDOOR"], [1000, "OUTDOOR"],
      [1000, "DEFAULT"], [5000, "DEFAULT"]
    ];
    const tryRadius = (index) => service.getPanorama({
      location: { lat: view.lat, lng: view.lng },
      radius: attempts[index][0],
      preference: maps.StreetViewPreference.NEAREST,
      sources: [maps.StreetViewSource[attempts[index][1]]]
    }).then((r) => r.data).catch((error) => {
      if (index + 1 < attempts.length) return tryRadius(index + 1);
      throw error;
    });

    return tryRadius(0);
  }

  /* ---------------- Hiển thị ---------------- */

  let currentView = null;

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.hidden = !text;
    status.classList.toggle("error", isError);
  }

  function showFallback(view, note = "") {
    if (!view) return;
    panorama = null;
    const iframe = document.createElement("iframe");
    iframe.title = "Xem 360° trên Google Maps";
    iframe.loading = "lazy";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.src = `https://maps.google.com/maps?layer=c&cbll=${view.lat},${view.lng}`
      + `&cbp=12,${Math.round(view.heading)},0,0,${Math.round(-view.pitch)}&output=svembed`;
    box.replaceChildren(iframe);
    setStatus(note);
  }

  let views = [];
  let activeIndex = 0;

  function renderChips() {
    const bar = q("#sv-spots");
    bar.hidden = views.length < 2;
    bar.replaceChildren(...views.map((view, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "sv-chip";
      chip.textContent = view.name;
      chip.setAttribute("aria-pressed", String(index === activeIndex));
      chip.addEventListener("click", () => selectView(index));
      return chip;
    }));
  }

  function selectView(index) {
    if (!views.length) return;
    activeIndex = (index + views.length) % views.length;
    [...q("#sv-spots").children].forEach((chip, i) => {
      chip.setAttribute("aria-pressed", String(i === activeIndex));
      if (i === activeIndex) chip.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
    q("#sv-count").textContent = views.length > 1 ? `${activeIndex + 1} / ${views.length}` : "";
    showView(views[activeIndex]);
  }

  async function showView(view) {
    currentView = view;
    q("#sv-external").href = mapsLink(view);
    q("#sv-spot-name").textContent = view.name;

    if (!navigator.onLine) {
      box.replaceChildren();
      setStatus("Cần kết nối Internet để xem 360°.", true);
      return;
    }

    setStatus("Đang tìm góc nhìn 360°…");

    const { googleMapsKey } = await loadConfig();
    if (currentView !== view) return;
    if (!googleMapsKey || mapsFailed) {
      showFallback(view);
      return;
    }

    try {
      const maps = await loadMaps(googleMapsKey);
      if (currentView !== view || mapsFailed) return;

      const data = await findPanorama(maps, view);
      if (currentView !== view) return;

      const pov = { heading: view.heading, pitch: view.pitch };

      // Dùng lại khung xem cũ để chuyển góc mượt hơn
      if (panorama && box.querySelector(".gm-style")) {
        panorama.setPano(data.location.pano);
        panorama.setPov(pov);
        panorama.setZoom(0);
      } else {
        box.replaceChildren();
        panorama = new maps.StreetViewPanorama(box, {
          pano: data.location.pano,
          pov,
          zoom: 0,
          addressControl: false,
          fullscreenControl: true,
          motionTracking: false,
          motionTrackingControl: false,
          showRoadLabels: false
        });
      }
      q("#sv-external").href = mapsLink({ ...view, pano: data.location.pano });
      setStatus("");
    } catch (error) {
      if (currentView !== view) return;
      console.warn("Street View:", error);
      if (error?.code === "ZERO_RESULTS" || /ZERO_RESULTS/.test(String(error?.message))) {
        panorama = null;
        box.replaceChildren();
        setStatus(`Google chưa có ảnh 360° tại “${view.name}”. Hãy chọn góc khác hoặc bấm “Mở trên Google Maps”.`, true);
      } else {
        showFallback(view);
      }
    }
  }

  function showDestination(destination) {
    views = viewsOf(destination);
    activeIndex = 0;
    panorama = null;
    box.replaceChildren();
    q("#sv-title").textContent = destination.name;
    q("#sv-sub").textContent = destination.place || destination.country || "";
    renderChips();
    selectView(0);
  }

  /* ---------------- Mở / đóng ---------------- */

  function open() {
    const destination = window.currentDestination;
    if (!canShow(destination)) {
      toast("Địa điểm này chưa có tọa độ để xem 360°.", "error");
      return;
    }
    lastFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("sv-viewing");
    q("#sv-close").focus();
    showDestination(destination);
  }

  function close() {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sv-viewing");
    currentView = null;
    panorama = null;
    box.replaceChildren();      // dừng tải ảnh khi đóng
    setStatus("");
    lastFocus?.focus?.();
  }

  openBtn.addEventListener("click", open);
  q("#sv-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-sv-close]")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("open")) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
    // Chuyển góc bằng phím [ và ] (mũi tên trái/phải dành cho xoay ảnh 360°)
    if (event.key === "[") selectView(activeIndex - 1);
    if (event.key === "]") selectView(activeIndex + 1);
  });

  q("#sv-prev")?.addEventListener("click", () => selectView(activeIndex - 1));
  q("#sv-next")?.addEventListener("click", () => selectView(activeIndex + 1));

  /* Ẩn nút khi địa điểm không có tọa độ */
  document.addEventListener("destination:change", (event) => {
    openBtn.hidden = !canShow(event.detail);
  });

  // Tải sẵn cấu hình để bấm nút là mở nhanh
  loadConfig();
})();
