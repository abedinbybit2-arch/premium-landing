/**
 * AndroGRAM — Landing page
 * Redirects authenticated users to Dashboard; particles + UI polish.
 */
import { waitForAuth, DASHBOARD_PATH } from "./auth.js";

const loader = document.getElementById("page-loader");
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

// Session restore → skip landing if already signed in
waitForAuth().then((user) => {
  if (user) {
    window.location.replace(DASHBOARD_PATH);
    return;
  }
  loader?.classList.add("hidden");
  initLandingUI();
});

function initLandingUI() {
  /* Sticky navbar */
  const navbar = document.getElementById("navbar");
  let ticking = false;
  const onScroll = () => {
    if (!navbar) return;
    navbar.classList.toggle("scrolled", window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    },
    { passive: true }
  );
  onScroll();

  /* Reveal */
  const revealEls = document.querySelectorAll(".reveal");
  const show = (el) => {
    const delay = Number(el.dataset.delay || 0);
    setTimeout(() => el.classList.add("visible"), delay);
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            show(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach(show);
  }

  /* Ripple on buttons */
  document.querySelectorAll("[data-ripple]").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      this.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });
  });

  initParticles();
}

function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let particles = [];
  let animId = null;
  let w = 0;
  let h = 0;
  let dpr = 1;

  const config = {
    count: reduced ? 16 : 52,
    maxR: 2.1,
    minR: 0.4,
    speed: reduced ? 0.12 : 0.32,
    connectDist: 105,
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createParticles() {
    const n = Math.min(config.count, Math.floor((w * h) / 18000));
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: config.minR + Math.random() * (config.maxR - config.minR),
      vx: (Math.random() - 0.5) * config.speed,
      vy: (Math.random() - 0.5) * config.speed,
      a: 0.25 + Math.random() * 0.45,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      else if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      else if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(61, 220, 132, ${p.a})`;
      ctx.fill();
    }
    if (!reduced) {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < config.connectDist) {
            const alpha = (1 - dist / config.connectDist) * 0.12;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    }
    animId = requestAnimationFrame(draw);
  }

  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        createParticles();
      }, 120);
    },
    { passive: true }
  );

  resize();
  createParticles();
  draw();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (animId) cancelAnimationFrame(animId);
      animId = null;
    } else if (!animId) {
      draw();
    }
  });
}
