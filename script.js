/**
 * Aurelia — Premium Landing Page
 * Particles · Navbar · Reveal · Ripple · CTA toasts
 */

(() => {
  "use strict";

  /* ---------- Year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Sticky navbar glass on scroll ---------- */
  const navbar = document.getElementById("navbar");
  let ticking = false;

  const onScroll = () => {
    if (!navbar) return;
    if (window.scrollY > 24) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
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

  /* ---------- Smooth scroll for anchor links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const offset = navbar ? navbar.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset + 8;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  /* ---------- Reveal on load / intersection ---------- */
  const revealEls = document.querySelectorAll(".reveal");

  const showReveal = (el) => {
    const delay = Number(el.dataset.delay || 0);
    setTimeout(() => el.classList.add("visible"), delay);
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            showReveal(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach(showReveal);
  }

  /* ---------- Button ripple ---------- */
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

  /* ---------- Toast ---------- */
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  let toastTimer;

  const showToast = (message) => {
    if (!toast || !toastText) return;
    toastText.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.hidden = true;
      }, 450);
    }, 2800);
  };

  const btnSubscribe = document.getElementById("btn-subscribe");
  const btnServices = document.getElementById("btn-services");

  if (btnSubscribe) {
    btnSubscribe.addEventListener("click", () => {
      showToast("Premium Subscribe — coming soon. Thank you for your interest.");
    });
  }

  if (btnServices) {
    btnServices.addEventListener("click", () => {
      showToast("Buy Services — curated packages launching shortly.");
    });
  }

  /* ---------- Particle canvas ---------- */
  const canvas = document.getElementById("particles");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let particles = [];
  let animId = null;
  let w = 0;
  let h = 0;
  let dpr = 1;

  const config = {
    count: reducedMotion ? 18 : 55,
    maxR: 2.2,
    minR: 0.4,
    speed: reducedMotion ? 0.15 : 0.35,
    connectDist: 110,
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
      ctx.fillStyle = `rgba(167, 139, 250, ${p.a})`;
      ctx.fill();
    }

    // Soft connection lines
    if (!reducedMotion) {
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
            ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
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
})();
