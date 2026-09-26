import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = (await readdir(root)).filter((f) => f.endsWith(".html"));
const html = (await Promise.all(pages.map((f) => readFile(path.join(root, f), "utf8")))).join("\n");

const placeIdFrom = (s) => {
  const m = String(s).match(/games\/(\d+)/) || String(s).match(/^(\d+)$/);
  return m ? m[1] : null;
};
const idFrom = (s) => (String(s).match(/^\s*(\d+)\s*$/) || [])[1] || null;
const collect = (attr, parse) => [
  ...new Set([...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, "g"))].map((m) => parse(m[1])).filter(Boolean)),
];

const placeIds = collect("data-roblox", placeIdFrom);
const groupIds = collect("data-roblox-group", idFrom);
const userIds = collect("data-discord-user", idFrom);
const guildIds = collect("data-discord-guild", idFrom);

const dataDir = path.join(root, "data");
const imgDir = path.join(root, "assets", "img", "live");
await mkdir(dataDir, { recursive: true });
await mkdir(imgDir, { recursive: true });

let prev = {};
try {
  prev = JSON.parse(await readFile(path.join(dataDir, "snapshot.json"), "utf8"));
} catch {}
const was = (key) => prev[key] || {};
const pick = (from, ids) => Object.fromEntries(ids.filter((id) => from[id]).map((id) => [id, from[id]]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: { accept: "application/json", ...headers } });
    if (r.ok) return r.json();
    const retry = r.status === 429 || r.status >= 500;
    if (!retry || attempt >= 4) throw new Error(`${r.status} ${url.split("?")[0]}`);
    const after = Number(r.headers.get("retry-after"));
    await sleep(after > 0 ? after * 1000 : 1000 * 2 ** attempt);
  }
}

const settle = (promise, label) =>
  promise.catch((e) => {
    console.warn(`${label}: ${e.message}`);
    return { data: [] };
  });

async function keep(label, fn, fallback) {
  try {
    return (await fn()) ?? fallback;
  } catch (e) {
    console.warn(`${label}: ${e.message}`);
    return fallback;
  }
}

const byId = (list, key) => Object.fromEntries((list || []).map((x) => [String(x[key]), x]));
const ready = (t) => (t && t.state === "Completed" && t.imageUrl) || null;
const exists = (f) => access(f).then(() => true, () => false);

async function mirror(url, name, prevUrl) {
  if (!url) return null;
  const file = path.join(imgDir, name);
  if (url !== prevUrl || !(await exists(file))) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
  }
  return `assets/img/live/${name}`;
}

async function robloxGames() {
  const old = was("games");
  const out = {};
  if (!placeIds.length) return out;

  const universeOf = {};
  for (const p of placeIds) {
    universeOf[p] = await keep(
      `universe for ${p}`,
      async () => (await getJson(`https://apis.roblox.com/universes/v1/places/${p}/universe`)).universeId,
      old[p]?.universeId ?? null,
    );
  }
  const ids = [...new Set(Object.values(universeOf).filter(Boolean))].join(",");
  if (!ids) return pick(old, placeIds);

  const [info, votes, icons, thumbs] = await Promise.all([
    settle(getJson(`https://games.roblox.com/v1/games?universeIds=${ids}`), "games"),
    settle(getJson(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`), "votes"),
    settle(getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=512x512&format=Png&isCircular=false`), "icons"),
    settle(getJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids}&size=768x432&format=Png&countPerUniverse=1`), "thumbnails"),
  ]);
  const infoBy = byId(info.data, "id");
  const voteBy = byId(votes.data, "id");
  const iconBy = byId(icons.data, "targetId");
  const thumbBy = byId(thumbs.data, "universeId");

  for (const p of placeIds) {
    const u = universeOf[p];
    const g = infoBy[u];
    const o = old[p];
    if (!g) {
      if (o) out[p] = o;
      console.warn(`no game data for place ${p}`);
      continue;
    }
    const v = voteBy[u];
    const iconUrl = ready(iconBy[u]) || o?.iconUrl || null;
    const thumbUrl = ready(thumbBy[u]?.thumbnails?.[0]) || o?.thumbUrl || null;
    out[p] = {
      placeId: Number(p),
      universeId: u,
      name: g.name.trim(),
      description: g.description || "",
      creator: g.creator?.name || "",
      genre: g.genre || "",
      maxPlayers: g.maxPlayers ?? null,
      playing: g.playing ?? 0,
      visits: g.visits ?? 0,
      favorites: g.favoritedCount ?? 0,
      upVotes: v ? v.upVotes : o?.upVotes ?? null,
      downVotes: v ? v.downVotes : o?.downVotes ?? null,
      created: g.created,
      updated: g.updated,
      icon: await keep(`icon for ${p}`, () => mirror(iconUrl, `game-${p}-icon.png`, o?.iconUrl), o?.icon ?? null),
      thumbnail: await keep(`thumbnail for ${p}`, () => mirror(thumbUrl, `game-${p}-thumb.png`, o?.thumbUrl), o?.thumbnail ?? null),
      iconUrl,
      thumbUrl,
      url: `https://www.roblox.com/games/${p}`,
    };
    console.log(`game     ${p}  ${out[p].name}`);
  }
  return out;
}

async function robloxGroups() {
  const old = was("groups");
  const out = {};
  if (!groupIds.length) return out;

  const icons = await settle(
    getJson(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupIds.join(",")}&size=150x150&format=Png&isCircular=false`),
    "group icons",
  );
  const iconBy = byId(icons.data, "targetId");

  for (const id of groupIds) {
    const o = old[id];
    const g = await keep(`group ${id}`, () => getJson(`https://groups.roblox.com/v1/groups/${id}`), null);
    if (!g) {
      if (o) out[id] = o;
      continue;
    }
    const iconUrl = ready(iconBy[id]) || o?.iconUrl || null;
    out[id] = {
      groupId: Number(id),
      name: g.name,
      memberCount: g.memberCount ?? 0,
      icon: await keep(`icon for group ${id}`, () => mirror(iconUrl, `group-${id}.png`, o?.iconUrl), o?.icon ?? null),
      iconUrl,
      url: `https://www.roblox.com/communities/${id}`,
    };
    console.log(`group    ${id}  ${g.name}  ${out[id].memberCount} members`);
  }
  return out;
}

const token = (process.env.DISCORD_BOT_TOKEN || "").trim();
const discordHeaders = {
  authorization: `Bot ${token}`,
  "user-agent": "DiscordBot (https://act2studios.co, 1.0)",
};

function defaultAvatar(id, discriminator) {
  const n = discriminator && discriminator !== "0" ? Number(discriminator) % 5 : Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}

async function discordUsers() {
  const old = was("discordUsers");
  if (!userIds.length) return {};
  if (!token) return pick(old, userIds);

  const out = {};
  for (const id of userIds) {
    const o = old[id];
    const u = await keep(`discord user ${id}`, () => getJson(`https://discord.com/api/v10/users/${id}`, discordHeaders), null);
    if (!u) {
      if (o) out[id] = o;
      continue;
    }
    const avatarUrl = u.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=256` : defaultAvatar(id, u.discriminator);
    out[id] = {
      id,
      avatar: await keep(`avatar for ${id}`, () => mirror(avatarUrl, `discord-${id}.png`, o?.avatarUrl), o?.avatar ?? null),
      avatarUrl,
    };
    console.log(`discord  ${id}  ${u.global_name || u.username}`);
  }
  return out;
}

async function discordGuilds() {
  const old = was("discordGuilds");
  if (!guildIds.length) return {};
  if (!token) return pick(old, guildIds);

  const out = {};
  for (const id of guildIds) {
    const o = old[id];
    const g = await keep(`discord server ${id}`, () => getJson(`https://discord.com/api/v10/guilds/${id}?with_counts=true`, discordHeaders), null);
    if (!g) {
      if (o) out[id] = o;
      continue;
    }
    const iconUrl = g.icon ? `https://cdn.discordapp.com/icons/${id}/${g.icon}.png?size=256` : null;
    out[id] = {
      id,
      name: g.name,
      members: g.approximate_member_count ?? null,
      online: g.approximate_presence_count ?? null,
      icon: await keep(`icon for server ${id}`, () => mirror(iconUrl, `discord-server-${id}.png`, o?.iconUrl), o?.icon ?? null),
      iconUrl,
    };
    console.log(`server   ${id}  ${g.name}  ${out[id].members} members, ${out[id].online} online`);
  }
  return out;
}

if (!token && (userIds.length || guildIds.length)) {
  console.warn("DISCORD_BOT_TOKEN is not set, keeping the previous Discord avatars and server counts");
}

const snapshot = {
  games: await robloxGames(),
  groups: await robloxGroups(),
  discordUsers: await discordUsers(),
  discordGuilds: await discordGuilds(),
};

const unchanged =
  JSON.stringify(snapshot) ===
  JSON.stringify({ games: was("games"), groups: was("groups"), discordUsers: was("discordUsers"), discordGuilds: was("discordGuilds") });
const body = JSON.stringify({ updated: unchanged && prev.updated ? prev.updated : new Date().toISOString(), ...snapshot }, null, 2);

await writeFile(path.join(dataDir, "snapshot.json"), `${body}\n`);
await writeFile(path.join(dataDir, "snapshot.js"), `window.SNAPSHOT = ${body};\n`);

const count = (o) => Object.keys(o).length;
console.log(
  `wrote data/snapshot.json: ${count(snapshot.games)} games, ${count(snapshot.groups)} groups, ${count(snapshot.discordUsers)} Discord users, ${count(snapshot.discordGuilds)} Discord servers`,
);
