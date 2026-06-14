const ACTIVITY_KEY = "activityDays";
const STATE_KEY = "monitorState";
const SCANNED_KEY = "scannedPages";
const SERVICES_KEY = "reportedServices";
const TICK_ALARM = "ceregium-activity-tick";
const SYNC_MINUTES = 30;
let operation = Promise.resolve();

function enqueue(task) {
  operation = operation.then(task).catch((error) => console.error("Ceregium companion", error));
  return operation;
}

const categories = {
  education: [
    "canvas", "classroom", "blackboard", "schoology", "moodle", "instructure",
    "collegeboard", "khanacademy", "quizlet", "desmos", "edpuzzle",
  ],
  productivity: [
    "docs.google", "drive.google", "notion", "slack", "github", "figma",
    "office", "microsoft", "dropbox", "calendar.google",
  ],
  social: [
    "discord", "instagram", "tiktok", "snapchat", "reddit", "x.com",
    "twitter", "facebook", "threads", "whatsapp", "messenger",
  ],
  entertainment: [
    "youtube", "netflix", "twitch", "spotify", "hulu", "max.com",
    "disneyplus", "primevideo", "soundcloud",
  ],
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyDay(date = localDate()) {
  return {
    localDate: date,
    activeMinutes: 0,
    educationMinutes: 0,
    productivityMinutes: 0,
    socialMinutes: 0,
    entertainmentMinutes: 0,
    otherMinutes: 0,
    lateNightMinutes: 0,
    longestSessionMinutes: 0,
    tabSwitches: 0,
    breakCount: 0,
  };
}

function hostnameOf(url) {
  if (!url || !url.startsWith("http")) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function categorize(url) {
  const hostname = hostnameOf(url);
  if (!hostname) return "other";
  for (const [category, fragments] of Object.entries(categories)) {
    if (fragments.some((fragment) => hostname.includes(fragment))) return category;
  }
  return "other";
}

// The recognized service "slug" is the matched fragment itself. Only education and
// productivity services map to integrations; social/entertainment do not. Only the
// slug (e.g. "canvas") is ever sent — never the full hostname, URL, or path.
function matchedService(url) {
  const hostname = hostnameOf(url);
  if (!hostname) return null;
  for (const group of [categories.education, categories.productivity]) {
    const fragment = group.find((value) => hostname.includes(value));
    if (fragment) return fragment;
  }
  return null;
}

// Injected into the active tab. Self-contained: reads only assignment-like
// headings paired with a parseable due date. Returns metadata, never page text.
function assignmentScanFunction() {
  const datePattern = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i;
  const candidates = [...document.querySelectorAll("article, li, tr, [role=row], .assignment, .coursework")];
  return candidates.slice(0, 200).map((element, index) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
    const date = text.match(datePattern)?.[0];
    const heading = element.querySelector("h1,h2,h3,h4,a,strong,[role=heading]")?.textContent?.trim();
    if (!date || !heading || heading.length > 160) return null;
    // "Dec 5, 2026 at 11:59 PM" is not parseable by Date; drop the "at" so the
    // captured due time is kept.
    const parsed = new Date(date.replace(/\s+at\s+/i, " "));
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      externalId: `${location.hostname}-${index}-${heading.slice(0, 40)}`,
      title: heading,
      source: location.hostname,
      course: document.title.slice(0, 120),
      dueAt: parsed.toISOString(),
    };
  }).filter(Boolean).slice(0, 100);
}

async function readStorage() {
  const saved = await chrome.storage.local.get([
    ACTIVITY_KEY,
    STATE_KEY,
    "monitorEnabled",
    "lastSyncAt",
  ]);
  return {
    days: saved[ACTIVITY_KEY] || {},
    state: saved[STATE_KEY] || {},
    enabled: saved.monitorEnabled === true,
    lastSyncAt: saved.lastSyncAt || 0,
  };
}

async function activeTab() {
  const window = await chrome.windows.getLastFocused();
  if (!window || !window.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
  return tab || null;
}

async function connectionConfig() {
  const saved = await chrome.storage.local.get(["appUrl", "token"]);
  if (!saved.appUrl || !saved.token) return null;
  return { appUrl: saved.appUrl.replace(/\/$/, ""), token: saved.token };
}

// Report a recognized service once per day. Sends only the slug, never the URL.
async function reportService(url, connection) {
  const slug = matchedService(url);
  if (!slug) return;
  const date = localDate();
  const saved = await chrome.storage.local.get(SERVICES_KEY);
  const reported = saved[SERVICES_KEY] || {};
  const key = `${slug}|${date}`;
  if (reported[key]) return;
  try {
    const response = await fetch(`${connection.appUrl}/api/browser/services`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ services: [slug] }),
    });
    if (!response.ok) return;
  } catch {
    return;
  }
  reported[key] = true;
  const retained = Object.fromEntries(Object.keys(reported).sort().slice(-200).map((k) => [k, true]));
  await chrome.storage.local.set({ [SERVICES_KEY]: retained });
}

// Scan an education page at most once per host per day and import what it finds.
async function autoScanPage(tab, connection) {
  if (categorize(tab.url) !== "education") return;
  const host = hostnameOf(tab.url);
  if (!host) return;
  const date = localDate();
  const key = `${host}|${date}`;
  const saved = await chrome.storage.local.get(SCANNED_KEY);
  const scanned = saved[SCANNED_KEY] || {};
  if (scanned[key]) return;
  let items = [];
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: assignmentScanFunction,
    });
    items = result?.result || [];
  } catch {
    return;
  }
  if (items.length) {
    try {
      const response = await fetch(`${connection.appUrl}/api/browser/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) return;
    } catch {
      return;
    }
  }
  scanned[key] = true;
  const retained = Object.fromEntries(Object.keys(scanned).sort().slice(-200).map((k) => [k, true]));
  await chrome.storage.local.set({ [SCANNED_KEY]: retained });
}

async function tick() {
  const saved = await readStorage();
  const now = Date.now();

  const idleState = await chrome.idle.queryState(60);
  const tab = idleState === "active" ? await activeTab() : null;

  // Auto-detection runs whenever a connection is saved, independent of the
  // activity-monitoring toggle.
  if (tab) {
    const connection = await connectionConfig();
    if (connection) {
      await reportService(tab.url, connection);
      await autoScanPage(tab, connection);
    }
  }

  if (!saved.enabled) {
    await chrome.storage.local.set({ [STATE_KEY]: { lastTickAt: now } });
    return;
  }

  const date = localDate();
  const day = saved.days[date] || emptyDay(date);
  const state = saved.state;
  const elapsedMinutes = state.lastTickAt
    ? Math.max(1, Math.min(5, Math.round((now - state.lastTickAt) / 60000)))
    : 1;

  if (!tab) {
    if (!state.idleSince) state.idleSince = now;
    state.currentSessionMinutes = 0;
  } else {
    if (state.idleSince && now - state.idleSince >= 5 * 60000) day.breakCount += 1;
    state.idleSince = null;
    const category = categorize(tab.url);
    day.activeMinutes += elapsedMinutes;
    day[`${category}Minutes`] += elapsedMinutes;
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) day.lateNightMinutes += elapsedMinutes;
    state.lastTabId = tab.id;
    state.currentSessionMinutes = (state.currentSessionMinutes || 0) + elapsedMinutes;
    day.longestSessionMinutes = Math.max(
      day.longestSessionMinutes,
      state.currentSessionMinutes,
    );
  }

  state.lastTickAt = now;
  saved.days[date] = day;
  const retainedDates = Object.keys(saved.days).sort().slice(-14);
  const retainedDays = Object.fromEntries(retainedDates.map((key) => [key, saved.days[key]]));
  await chrome.storage.local.set({
    [ACTIVITY_KEY]: retainedDays,
    [STATE_KEY]: state,
  });

  if (now - saved.lastSyncAt >= SYNC_MINUTES * 60000) await syncActivity();
  await updateBadge(day);
}

async function recordTabSwitch(tabId) {
  const saved = await readStorage();
  if (!saved.enabled || saved.state.lastTabId === tabId) return;
  const date = localDate();
  const day = saved.days[date] || emptyDay(date);
  day.tabSwitches += 1;
  saved.state.lastTabId = tabId;
  saved.days[date] = day;
  await chrome.storage.local.set({
    [ACTIVITY_KEY]: saved.days,
    [STATE_KEY]: saved.state,
  });
}

async function syncActivity() {
  const saved = await chrome.storage.local.get([
    ACTIVITY_KEY,
    "appUrl",
    "token",
    "monitorEnabled",
  ]);
  if (saved.monitorEnabled !== true || !saved.appUrl || !saved.token) {
    return { ok: false, error: "Save a connection and enable monitoring first." };
  }
  const days = Object.values(saved[ACTIVITY_KEY] || {});
  if (!days.length) return { ok: false, error: "No activity summary is available yet." };
  const summary = days.sort((a, b) => a.localDate.localeCompare(b.localDate)).at(-1);
  try {
    const response = await fetch(
      `${saved.appUrl.replace(/\/$/, "")}/api/browser/signals`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${saved.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(summary),
      },
    );
    const result = await response.json();
    if (!response.ok) return { ok: false, error: result.error || "Sync failed." };
    await chrome.storage.local.set({ lastSyncAt: Date.now() });
    return { ok: true };
  } catch {
    return { ok: false, error: "Ceregium is not reachable." };
  }
}

async function updateBadge(day) {
  const strained =
    day.lateNightMinutes >= 45 ||
    day.longestSessionMinutes >= 120 ||
    (day.activeMinutes >= 180 && day.breakCount <= 1);
  await chrome.action.setBadgeText({ text: strained ? "!" : "" });
  if (strained) await chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  const saved = await chrome.storage.local.get("monitorEnabled");
  if (saved.monitorEnabled === undefined) {
    await chrome.storage.local.set({ monitorEnabled: false });
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) enqueue(tick);
});

chrome.tabs.onActivated.addListener(({ tabId }) => enqueue(() => recordTabSwitch(tabId)));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "syncActivity") {
    syncActivity().then(sendResponse);
    return true;
  }
  if (message.type === "refreshActivity") {
    enqueue(tick).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
