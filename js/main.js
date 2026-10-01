"use strict";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

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
