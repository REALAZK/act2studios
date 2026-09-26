"use strict";

(function live() {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const snap = window.SNAPSHOT || {};
  const state = {
    games: { ...snap.games },
    groups: { ...snap.groups },
    users: { ...snap.discordUsers },
    guilds: { ...snap.discordGuilds },
    synced: Date.parse(snap.updated) || 0,
  };

  const RP = {
    apis: "https://apis.roproxy.com",
    games: "https://games.roproxy.com",
    thumbs: "https://thumbnails.roproxy.com",
    groups: "https://groups.roproxy.com",
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const placeIdFrom = (s) => {
    const m = String(s).match(/games\/(\d+)/) || String(s).match(/^(\d+)$/);
    return m ? m[1] : null;
  };

  function compact(n) {
    if (n == null || !Number.isFinite(n)) return "–";
    const a = Math.abs(n);
    const [div, suffix] = a >= 999.5e6 ? [1e9, "B"] : a >= 999.5e3 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : [1, ""];
    if (div === 1) return String(Math.round(n));
    const v = n / div;
    return (v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, "")) + suffix;
  }

  const full = (n) => (n == null || !Number.isFinite(n) ? "–" : Math.round(n).toLocaleString("en-US"));
  const format = (n, kind) => (kind === "full" ? full(n) : compact(n));

  const counted = new WeakSet();
  const countIO = "IntersectionObserver" in window && !reducedMotion
    ? new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        countIO.unobserve(en.target);
        counted.add(en.target);
        countUp(en.target);
      }
    }, { threshold: 0.35 })
    : null;

  function countUp(el) {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min((now - t0) / 1300, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = format(Number(el.dataset.value) * eased, el.dataset.kind);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function tick(el) {
    el.classList.remove("is-tick");
    void el.offsetWidth;
    el.classList.add("is-tick");
  }

  function setNumber(el, value, kind = el && el.dataset.format) {
    if (!el) return;
    el.dataset.kind = kind || "compact";
    if (value == null || !Number.isFinite(Number(value))) {
      delete el.dataset.value;
      el.textContent = "–";
      return;
    }
    const before = el.dataset.value;
    el.dataset.value = String(value);
    if (!counted.has(el)) {
      if (countIO) {
        if (!el.dataset.waiting) {
          el.dataset.waiting = "1";
          el.textContent = format(0, el.dataset.kind);
          countIO.observe(el);
        }
        return;
      }
      counted.add(el);
    }
    const text = format(Number(value), el.dataset.kind);
    if (el.textContent === text) return;
    el.textContent = text;
    if (before != null && before !== String(value)) tick(el);
  }

  function setImage(holder, src) {
    if (!holder || !src) return;
    let img = $("img", holder);
    if (img && img.getAttribute("src") === src) return;
    if (!img) {
      img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.remove();
        holder.classList.remove("has-image");
      });
      holder.append(img);
    }
    img.src = src;
    holder.classList.add("has-image");
  }

  function totals() {
    const games = Object.values(state.games);
    const groups = Object.values(state.groups);
    const sum = (list, key) => list.reduce((a, x) => a + (Number(x[key]) || 0), 0);
    const has = games.length > 0;
    return {
      titles: has ? games.length : null,
      visits: has ? sum(games, "visits") : null,
      playing: has ? sum(games, "playing") : null,
      favorites: has ? sum(games, "favorites") : null,
      members: groups.length ? sum(groups, "memberCount") : null,
    };
  }

  function paintStats() {
    const t = totals();
    for (const el of $$("[data-live-stat]")) setNumber(el, t[el.dataset.liveStat]);
  }

  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 15) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  function paintSync() {
    const text = state.synced ? `Synced with Roblox ${ago(state.synced)}` : "Connecting to Roblox";
    for (const el of $$("[data-live-sync]")) el.textContent = text;
  }

  const svg = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

  function rating(g) {
    const total = (g.upVotes || 0) + (g.downVotes || 0);
    return total ? Math.round((g.upVotes / total) * 100) : null;
  }

  const blurb = (text) => String(text || "").split("\n").map((s) => s.trim()).find(Boolean) || "";

  function render(card, g) {
    const pct = rating(g);
    const genre = g.genre && g.genre !== "All" ? g.genre : "Roblox experience";
    card.classList.remove("is-loading", "is-error");
    card.classList.add("is-ready");
    card.dataset.universe = g.universeId;
    card.innerHTML = `
      <div class="gcard__media">
        <span class="badge"><span class="live-dot"></span><span data-field="playing">0</span> playing</span>
        ${g.thumbnail ? `<img src="${esc(g.thumbnail)}" alt="" loading="lazy" decoding="async">` : ""}
      </div>
      <div class="gcard__body">
        <div class="gcard__head">
          <span class="gcard__icon">${g.icon ? `<img src="${esc(g.icon)}" alt="" loading="lazy" decoding="async">` : ""}</span>
          <div>
            <h3 class="gcard__title">${esc(g.name)}</h3>
            <span class="gcard__creator">by ${esc(g.creator)}</span>
          </div>
        </div>
        <div class="gcard__stats">
          <div class="gstat"><b data-field="visits">0</b><small>Visits</small></div>
          <div class="gstat"><b data-field="favorites">0</b><small>Favorites</small></div>
          <div class="gstat"><b data-field="rating">${pct == null ? "–" : `${pct}%`}</b><small>Rating</small></div>
        </div>
        <div class="meter" aria-hidden="true"><i data-field="bar" style="--pct:${pct ?? 0}%"></i></div>
        <p class="gcard__desc">${esc(blurb(g.description))}</p>
        <div class="gcard__foot">
          <a class="btn btn--primary btn--sm" href="${esc(g.url)}" target="_blank" rel="noopener" aria-label="Play ${esc(g.name)} on Roblox">Play ${svg("ic-play")}</a>
          <span class="gcard__genre">${esc(genre)}</span>
        </div>
      </div>`;
    for (const img of $$("img", card)) img.addEventListener("error", () => img.remove(), { once: true });
    paintCard(card, g);
  }

  function paintCard(card, g) {
    setNumber($('[data-field="playing"]', card), g.playing, "full");
    setNumber($('[data-field="visits"]', card), g.visits, "compact");
    setNumber($('[data-field="favorites"]', card), g.favorites, "compact");
    const pct = rating(g);
    const label = $('[data-field="rating"]', card);
    const text = pct == null ? "–" : `${pct}%`;
    if (label && label.textContent !== text) label.textContent = text;
    const bar = $('[data-field="bar"]', card);
    if (bar) bar.style.setProperty("--pct", `${pct ?? 0}%`);
  }

  function skeleton(card) {
    card.classList.add("is-loading");
    card.innerHTML = `
      <div class="gcard__media"></div>
      <div class="gcard__body">
        <div class="gcard__head"><span class="gcard__icon"></span><div class="grow"><span class="sk" style="width:70%"></span><span class="sk" style="width:40%"></span></div></div>
        <div class="gcard__stats"><span class="sk sk--box"></span><span class="sk sk--box"></span><span class="sk sk--box"></span></div>
        <div><span class="sk"></span><span class="sk" style="width:80%"></span></div>
      </div>`;
  }

  function renderError(card, message) {
    card.classList.remove("is-loading");
    card.classList.add("is-error");
    card.innerHTML = `<div class="gcard__media"><p class="gcard__error">${esc(message)}</p></div>`;
  }

  function paintGroup(el, g) {
    if (el.tagName === "A" && g.url) el.href = g.url;
    el.classList.add("has-data");
    for (const f of $$("[data-group-field]", el)) {
      const key = f.dataset.groupField;
      if (key === "members") setNumber(f, g.memberCount);
      else if (key === "name") f.textContent = g.name;
      else if (key === "icon") setImage(f, g.icon);
    }
  }

  function paintGuild(el, g) {
    el.classList.add("has-data");
    for (const f of $$("[data-guild-field]", el)) {
      const key = f.dataset.guildField;
      if (key === "members") setNumber(f, g.members);
      else if (key === "online") setNumber(f, g.online);
      else if (key === "name") f.textContent = g.name;
      else if (key === "icon") setImage(f, g.icon);
    }
  }

  function paintUsers() {
    for (const el of $$("[data-discord-user]")) {
      const u = state.users[el.dataset.discordUser];
      if (u) setImage($(".member__avatar", el), u.avatar);
    }
  }

  function paintAll() {
    for (const card of $$(".gcard.is-ready[data-place]")) {
      const g = state.games[card.dataset.place];
      if (g) paintCard(card, g);
    }
    for (const el of $$("[data-roblox-group]")) {
      const g = state.groups[el.dataset.robloxGroup];
      if (g) paintGroup(el, g);
    }
    for (const el of $$("[data-discord-guild]")) {
      const g = state.guilds[el.dataset.discordGuild];
      if (g) paintGuild(el, g);
    }
    paintUsers();
    paintStats();
    paintSync();
  }

  async function getJson(url, signal) {
    const r = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  async function fetchGame(placeId) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 9000);
    const none = () => ({ data: [] });
    try {
      const { universeId } = await getJson(`${RP.apis}/universes/v1/places/${placeId}/universe`, ac.signal);
      const [games, icons, thumbs] = await Promise.all([
        getJson(`${RP.games}/v1/games?universeIds=${universeId}`, ac.signal),
        getJson(`${RP.thumbs}/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`, ac.signal).catch(none),
        getJson(`${RP.thumbs}/v1/games/multiget/thumbnails?universeIds=${universeId}&size=768x432&format=Png&countPerUniverse=1`, ac.signal).catch(none),
      ]);
      const g = games.data && games.data[0];
      if (!g) throw new Error("missing");
      return {
        placeId: Number(placeId),
        universeId,
        name: g.name.trim(),
        description: g.description || "",
        creator: g.creator?.name || "",
        genre: g.genre || "",
        playing: g.playing ?? 0,
        visits: g.visits ?? 0,
        favorites: g.favoritedCount ?? 0,
        upVotes: null,
        downVotes: null,
        icon: icons.data?.[0]?.imageUrl || null,
        thumbnail: thumbs.data?.[0]?.thumbnails?.[0]?.imageUrl || null,
        url: `https://www.roblox.com/games/${placeId}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchGroup(id) {
    const [g, icons] = await Promise.all([
      getJson(`${RP.groups}/v1/groups/${id}`),
      getJson(`${RP.thumbs}/v1/groups/icons?groupIds=${id}&size=150x150&format=Png&isCircular=false`).catch(() => ({ data: [] })),
    ]);
    return {
      groupId: Number(id),
      name: g.name,
      memberCount: g.memberCount ?? 0,
      icon: icons.data?.[0]?.imageUrl || null,
      url: `https://www.roblox.com/communities/${id}`,
    };
  }

  const inflight = {};
  const once = (key, fn) => (inflight[key] ||= fn());

  const poll = { timer: 0, interval: 60000, base: 60000, max: 300000 };

  async function pollGames() {
    const games = Object.values(state.games);
    const ids = [...new Set(games.map((g) => g.universeId).filter(Boolean))];
    if (!ids.length) return;
    try {
      const { data } = await getJson(`${RP.games}/v1/games?universeIds=${ids.join(",")}`);
      for (const d of data) {
        for (const g of games) {
          if (g.universeId !== d.id) continue;
          g.playing = d.playing ?? g.playing;
          g.visits = d.visits ?? g.visits;
          g.favorites = d.favoritedCount ?? g.favorites;
        }
      }
      state.synced = Date.now();
      poll.interval = poll.base;
      paintAll();
    } catch {
      poll.interval = Math.min(poll.interval * 2, poll.max);
    }
  }

  async function refreshSnapshot() {
    try {
      const next = await getJson(`data/snapshot.json?t=${Date.now()}`);
      const at = Date.parse(next.updated) || 0;
      for (const [id, g] of Object.entries(next.games || {})) {
        const cur = state.games[id];
        if (!cur) {
          state.games[id] = g;
          continue;
        }
        cur.upVotes = g.upVotes;
        cur.downVotes = g.downVotes;
        if (at > state.synced) {
          cur.playing = g.playing;
          cur.visits = g.visits;
          cur.favorites = g.favorites;
        }
      }
      Object.assign(state.groups, next.groups);
      Object.assign(state.users, next.discordUsers);
      Object.assign(state.guilds, next.discordGuilds);
      if (at > state.synced) state.synced = at;
      paintAll();
    } catch {}
  }

  function schedule() {
    clearTimeout(poll.timer);
    if (document.hidden) return;
    poll.timer = setTimeout(async () => {
      await pollGames();
      schedule();
    }, poll.interval);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(poll.timer);
      return;
    }
    if (Date.now() - state.synced > 30000) pollGames().then(schedule);
    else schedule();
  });

  const jobs = [];

  for (const card of $$("[data-roblox]")) {
    const id = placeIdFrom(card.dataset.roblox);
    if (!id) {
      renderError(card, "Not a Roblox game link");
      continue;
    }
    card.dataset.place = id;
    if (state.games[id]) {
      render(card, state.games[id]);
      continue;
    }
    skeleton(card);
    jobs.push(once(`game:${id}`, () => fetchGame(id)).then(
      (g) => {
        state.games[id] = state.games[id] || g;
        render(card, state.games[id]);
      },
      () => renderError(card, "Couldn't reach Roblox for this game"),
    ));
  }

  for (const el of $$("[data-roblox-group]")) {
    const id = el.dataset.robloxGroup;
    if (state.groups[id]) {
      paintGroup(el, state.groups[id]);
      continue;
    }
    jobs.push(once(`group:${id}`, () => fetchGroup(id)).then(
      (g) => {
        state.groups[id] = state.groups[id] || g;
        paintGroup(el, state.groups[id]);
      },
      () => {},
    ));
  }

  for (const el of $$("[data-discord-guild]")) {
    const g = state.guilds[el.dataset.discordGuild];
    if (g) paintGuild(el, g);
  }

  paintUsers();
  paintStats();
  paintSync();

  Promise.allSettled(jobs).then(() => {
    paintStats();
    pollGames().then(schedule);
  });

  setInterval(paintSync, 15000);
  setInterval(() => {
    if (!document.hidden) refreshSnapshot();
  }, 300000);
})();
