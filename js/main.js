"use strict";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

(function nav() {
  const nav = $("[data-nav]");
  if (!nav) return;
  const toggle = $(".nav__toggle", nav);
  const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 12);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => {
    if (e.target.closest(".nav__links a")) setOpen(false);
  });
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
})();

(function reveal() {
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add("is-in");
      io.unobserve(en.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
})();

(function stage() {
  const el = $("[data-stage]");
  if (!el || reducedMotion) return;
  const canvas = $(".stage__dust", el);
  const ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;

  const aim = { target: 0, cur: 0, applied: 0 };
  if (finePointer) {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      aim.target = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      el.classList.add("is-aimed");
    });
    el.addEventListener("pointerleave", () => {
      aim.target = 0;
    });
  }

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const pts = [];
  let w = 0, h = 0, raf = 0, last = 0, running = false, visible = false;

  const spawn = (anywhere) => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 4,
    r: 0.5 + Math.random() * 1.5,
    vx: (Math.random() - 0.5) * 6,
    vy: -(5 + Math.random() * 14),
    ph: Math.random() * Math.PI * 2,
    tw: 0.5 + Math.random() * 1.4,
  });

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(120, (w * h) / 2400));
    while (pts.length < n) pts.push(spawn(true));
    pts.length = n;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    aim.cur += (aim.target - aim.cur) * Math.min(1, dt * 4);
    if (Math.abs(aim.cur - aim.applied) > 0.002) {
      aim.applied = aim.cur;
      el.style.setProperty("--sway", `${(-aim.applied * 14).toFixed(2)}deg`);
      el.style.setProperty("--aim", (aim.applied * 18).toFixed(2));
    }

    const tilt = Math.tan((aim.applied * 14 * Math.PI) / 180);
    const top = -0.06 * h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#d6e7ff";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.ph += dt * p.tw;
      p.x += (p.vx + Math.sin(p.ph) * 4) * dt;
      p.y += p.vy * dt;
      if (p.y < -4 || p.x < -4 || p.x > w + 4) {
        pts[i] = spawn(false);
        continue;
      }
      const depth = (p.y - top) / h;
      const center = w / 2 + tilt * (p.y - top);
      const half = w * (0.05 + 0.42 * depth);
      const inBeam = Math.max(0, 1 - Math.abs(p.x - center) / half);
      ctx.globalAlpha = (0.08 + 0.9 * inBeam) * (0.55 + 0.45 * Math.sin(p.ph * 2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  new ResizeObserver(resize).observe(el);
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) start();
    else stop();
  }).observe(el);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
})();

(function openings() {
  const chips = $$("[data-filter]");
  const jobs = $$(".job[data-team]");
  if (!jobs.length) return;
  const count = $("[data-job-count]");
  for (const el of $$("[data-job-total]")) el.textContent = String(jobs.length);

  function apply(team) {
    let shown = 0;
    for (const job of jobs) {
      const on = team === "all" || job.dataset.team === team;
      job.hidden = !on;
      if (on) shown++;
    }
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === team)));
    if (count) count.textContent = `${shown} open ${shown === 1 ? "role" : "roles"}`;
  }

  chips.forEach((c) => c.addEventListener("click", () => apply(c.dataset.filter)));
  apply("all");
})();
