
/* ==========================================================================
   door.js — chọn điểm đến và camera lao xuyên qua cánh cửa
   ========================================================================== */

const world = $("#world");
const dest = $("#dest");
const door = $("#door");

/* Đổi ngẫu nhiên tông ánh sáng */
function randomizeDoor() {
  state.hue = pick([18, 24, 30, 350]);
  state.hueDir = pick([1, -1]);
  document.documentElement.style.setProperty("--h", state.hue);
}


/* =========================================================
   LẤY ĐỊA ĐIỂM TỪ MONGODB THÔNG QUA API
   ========================================================= */

/* Địa điểm đang hiển thị (cuốn sách du lịch và nút yêu thích dùng chung) */
window.currentDestination = null;

/* Gọi API random, tránh trùng với địa điểm vừa xem */
async function pickDestination() {
  const query = state.lastId ? `?exclude=${encodeURIComponent(state.lastId)}` : "";
  const data = await api(`/api/destinations/random${query}`);
  return prepareDestination(data);
}

/* Lấy chi tiết một địa điểm được chọn từ database */
async function fetchDestination(id) {
  const data = await api(`/api/destinations/${encodeURIComponent(id)}?track=1`);
  return prepareDestination(data);
}

/* Danh sách thư mục và định dạng ảnh dự phòng */
const IMAGE_FOLDERS = [
  "assets/images/",
  "images/",
  "assets/"
];

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif"
];
/* Tạo danh sách đường dẫn ảnh có thể đúng */
function imageCandidates(paths) {
  const rows = [];

  for (const path of paths) {
    const file = path.split("/").pop();
    const folder = path.slice(0, path.length - file.length);
    const [, base, ext = ""] =
      file.match(/^(.*?)(\.[A-Za-z0-9]+)?$/);

    const names = new Set([
      base,
      base.normalize("NFC"),
      base.normalize("NFD")
    ]);

    const folders = new Set([folder, ...IMAGE_FOLDERS]);

    const exts = [
      ...new Set([ext, ...IMAGE_EXTENSIONS].filter(Boolean))
    ];

    exts.forEach((extension, rank) => {
      for (const dir of folders) {
        for (const name of names) {
          rows.push({
            rank,
            url: dir + name + extension
          });
        }
      }
    });
  }

  rows.sort((a, b) => a.rank - b.rank);

  return [...new Set(rows.map((item) => item.url))];
}

/* Cảnh SVG dự phòng nếu không tải được ảnh */
function safeScene(destination) {
  try {
    return renderScene(destination);
  } catch (err) {
    console.warn(
      "Không vẽ được phong cảnh dự phòng:",
      destination.name,
      err
    );

    return `
      <div style="
        width:100%;
        height:100%;
        background:linear-gradient(#4f7191,#f5c7a5);
      "></div>
    `;
  }
}

/* Thời gian tối đa để tải ảnh */
const PHOTO_TIMEOUT = 5000;

/* Tải ảnh điểm đến */
function loadPhoto(destination) {
  const sources = imageCandidates(
    [].concat(destination.image || [])
  );

  if (sources.length === 0) {
    return Promise.resolve(null);
  }

  const attempt = new Promise((resolve) => {
    const probe = new Image();
    let tried = 0;
    let finished = false;

    function finish(value) {
      if (finished) return;
      finished = true;
      resolve(value);
    }

    probe.onload = async () => {
      try {
        await probe.decode();
      } catch (err) {
        // Trình duyệt vẫn có thể hiển thị ảnh.
      }

      finish(probe.src);
    };

    probe.onerror = () => {
      tried += 1;

      if (tried < sources.length) {
        probe.src = encodeURI(sources[tried]);
      } else {
        console.warn(
          `Không tìm thấy ảnh "${destination.name}".`,
          sources.slice(0, 3)
        );

        finish(null);
      }
    };

    probe.src = encodeURI(sources[0]);
  });

  const giveUp = new Promise((resolve) => {
    setTimeout(() => {
      console.warn(
        `Ảnh "${destination.name}" tải quá thời gian.`
      );

      resolve(null);
    }, PHOTO_TIMEOUT);
  });

  return Promise.race([attempt, giveUp]);
}

/* Đưa ảnh hoặc cảnh SVG vào khung */
function mountScene(container, destination, photoUrl) {
  container.innerHTML = "";
  delete container.dataset.zoom;

  if (!photoUrl) {
    container.innerHTML = safeScene(destination);
    return;
  }

  const photo = new Image();

  photo.className = "photo";
  photo.alt = destination.name;
  photo.draggable = false;

  photo.style.cssText = `
    display: block;
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: cover;
    object-position: center;
  `;

  photo.onerror = () => {
    delete container.dataset.zoom;
    container.innerHTML = safeScene(destination);
  };

  photo.src = photoUrl;
  container.appendChild(photo);
}

/* Đổ dữ liệu điểm đến vào giao diện */
function fillDestination(destination, photoUrl) {
  mountScene($("#pscene"), destination, photoUrl);
  mountScene($("#dscene"), destination, photoUrl);

  $("#dn").textContent = destination.name;
  $("#dc").textContent = destination.place || "";
  $("#dd").textContent = destination.desc;

  const chips = [];

  if (destination.season) {
    chips.push(`<span>🗓 ${destination.season}</span>`);
  }

  if (destination.activity) {
    chips.push(`<span>✦ ${destination.activity}</span>`);
  }

  $("#dch").innerHTML = chips.join("");

  window.currentDestination = destination;
  state.lastId = destination._id || null;
  document.dispatchEvent(new CustomEvent("destination:change", { detail: destination }));
}

/* =========================================================
   CAMERA TRANSITION — LAO XUYÊN QUA CÁNH CỬA
   ========================================================= */

const CAMERA_DURATION = 1800;

/* Đang ở trang điểm đến thì quay về cửa rồi mở địa điểm mới */
async function goToDestination(id) {
  if (dest.classList.contains("on")) {
    resetDoor();
    await wait(60);
  }
  if (state.busy) return;
  openDoor(id);
}

/* Mở cửa và đưa camera xuyên qua.
   destinationId: bỏ trống = ngẫu nhiên, có giá trị = mở đúng địa điểm đó */
async function openDoor(destinationId) {
  if (state.busy) return;

  state.busy = true;
  document.body.classList.add("door-loading");

  let destination;

  try {
    destination = typeof destinationId === "string" && destinationId
      ? await fetchDestination(destinationId)
      : await pickDestination();
  } catch (err) {
    console.error("Lỗi lấy địa điểm từ MongoDB:", err);
    toast(err.message || "Không thể tải điểm đến. Hãy kiểm tra Backend MongoDB!", "error");

    state.busy = false;
    document.body.classList.remove("door-loading");
    return;
  }

  document.body.classList.remove("door-loading");

  document.body.classList.add("opening");


  // Chuẩn bị ảnh điểm đến trong lúc cửa mở
  const photoReady = loadPhoto(destination)
    .then((url) => {
      fillDestination(destination, url);
    })
    .catch((err) => {
      console.error("Không chuẩn bị được điểm đến:", err);
      fillDestination(destination, null);
    });

  // Mở hai cánh cửa
  door.classList.add("open");

  // Chờ cửa mở và ảnh tải xong
  await Promise.all([
    wait(1150),
    photoReady
  ]);

  // Lấy tâm cổng
  const portal = $(".portal");
  const rect = portal.getBoundingClientRect();

  world.style.transformOrigin =
    `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;

  // Camera lao xuyên qua cổng
  document.body.classList.add("camera-warp");

  const camera = world.animate(
    [
      {
        transform: "scale(1)",
        filter: "blur(0px)"
      },
      {
        transform: "scale(1.8)",
        filter: "blur(1px)",
        offset: .35
      },
      {
        transform: "scale(5)",
        filter: "blur(4px)",
        offset: .75
      },
      {
        transform: "scale(10)",
        filter: "blur(12px)"
      }
    ],
    {
      duration: CAMERA_DURATION,
      easing: "cubic-bezier(.55, 0, .9, .35)",
      fill: "forwards"
    }
  );

  try {
    await camera.finished;
  } catch (err) {
    // Bỏ qua nếu animation bị hủy
  }

  camera.cancel();

  world.style.transform = "scale(10)";
  world.style.filter = "blur(12px)";

  // Hiện trang điểm đến
  dest.classList.add("on");
  world.style.visibility = "hidden";

  document.body.classList.remove(
    "camera-warp",
    "opening"
  );

  state.pull = false;
}


function resetDoor() {
  if (!state.busy) return;

  document.body.classList.add("instant");

  // Ẩn trang điểm đến
  dest.classList.remove("on");

  // Đóng lại hai cánh cửa
  door.classList.remove("open");

  // Khôi phục thế giới
  world.style.visibility = "";
  world.style.transform = "";
  world.style.filter = "";
  world.style.transformOrigin = "";

  // Xóa trạng thái hiệu ứng
  document.body.classList.remove(
    "opening",
    "diving",
    "camera-warp"
  );

  randomizeDoor();

  // Buộc trình duyệt cập nhật trạng thái
  void world.offsetWidth;

  requestAnimationFrame(() => {
    document.body.classList.remove("instant");
    state.busy = false;
  });
}
