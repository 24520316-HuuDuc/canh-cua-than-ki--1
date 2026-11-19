
/* ==========================================================================
   main.js — khởi động trang chủ và hiệu ứng parallax
   ========================================================================== */

const layers = {
  bg: $("#bg"),
  mistNear: $(".m1"),
  mistFar: $(".m2"),
  doorTilt: $("#tilt"),
  destScene: $("#dscene")
};

const pointer = {
  x: 0,
  y: 0
};

const smooth = {
  x: 0,
  y: 0
};

/* Theo dõi vị trí chuột */
addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = (event.clientY / innerHeight) * 2 - 1;
});

/* Chuyển động nền theo chuột */
function animate() {
  const opening =
    document.body.classList.contains("opening");

  const cameraWarp =
    document.body.classList.contains("camera-warp");

  if (!document.hidden && !opening && !cameraWarp) {
    smooth.x += (pointer.x - smooth.x) * 0.06;
    smooth.y += (pointer.y - smooth.y) * 0.06;

    const { x, y } = smooth;

    if (layers.bg) {
      layers.bg.style.transform =
        `translate3d(${-x * 30}px, ${-y * 18}px, 0) scale(1.1)`;
    }

    if (layers.mistNear) {
      layers.mistNear.style.transform =
        `translate3d(${-x * 45}px, ${-y * 8}px, 0)`;
    }

    if (layers.mistFar) {
      layers.mistFar.style.transform =
        `translate3d(${-x * 80}px, ${-y * 12}px, 0)`;
    }

    if (layers.doorTilt) {
      layers.doorTilt.style.transform =
        `perspective(1300px) rotateY(${x * 8}deg) rotateX(${-y * 5}deg) translate3d(${x * 10}px, ${y * 6}px, 0)`;
    }

    if (layers.destScene) {
      const zoom = layers.destScene.dataset.zoom || 1.08;

      layers.destScene.style.transform =
        `translate3d(${-x * 26}px, ${-y * 16}px, 0) scale(${zoom})`;
    }
  }

  /* Hạt sáng nền */
  if (
    !document.hidden &&
    !opening &&
    !cameraWarp &&
    typeof drawParticles === "function"
  ) {
    drawParticles(smooth.x);
  }

  requestAnimationFrame(animate);
}

/* Nút mở cửa và quay lại */
$("#open").addEventListener("click", () => openDoor());
$("#again").addEventListener("click", resetDoor);

/* Khi thay đổi kích thước cửa sổ */
addEventListener("resize", resizeCanvas);

/* Khởi động */
resizeCanvas();
randomizeDoor();
animate();
