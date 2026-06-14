import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("background worker stores only aggregate activity categories", async () => {
  const storage: Record<string, unknown> = {
    monitorEnabled: true,
    activityDays: {},
    monitorState: {},
  };
  let alarmListener: ((alarm: { name: string }) => void) | undefined;
  let tabListener: ((event: { tabId: number }) => void) | undefined;
  const chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.map((key) => [key, storage[key]]));
        },
        set: async (values: Record<string, unknown>) => Object.assign(storage, values),
      },
    },
    idle: { queryState: async () => "active" },
    windows: {
      getLastFocused: async () => ({ id: 1, focused: true }),
      onFocusChanged: { addListener: () => undefined },
    },
    tabs: {
      query: async () => [{ id: 7, url: "https://classroom.google.com/course/secret" }],
      onActivated: {
        addListener: (listener: (event: { tabId: number }) => void) => {
          tabListener = listener;
        },
      },
    },
    action: {
      setBadgeText: async () => undefined,
      setBadgeBackgroundColor: async () => undefined,
    },
    alarms: {
      create: async () => undefined,
      onAlarm: {
        addListener: (listener: (alarm: { name: string }) => void) => {
          alarmListener = listener;
        },
      },
    },
    runtime: {
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      onMessage: { addListener: () => undefined },
    },
  };
  const code = readFileSync("browser-extension/background.js", "utf8");
  vm.runInNewContext(code, {
    chrome,
    console,
    Date,
    URL,
    fetch: async () => {
      throw new Error("No sync should occur without a saved connection.");
    },
    setTimeout,
  });

  assert.ok(alarmListener);
  alarmListener({ name: "ceregium-activity-tick" });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.ok(tabListener);
  tabListener({ tabId: 8 });
  await new Promise((resolve) => setTimeout(resolve, 25));

  const days = storage.activityDays as Record<string, Record<string, unknown>>;
  const summary = Object.values(days)[0];
  assert.equal(summary.activeMinutes, 1);
  assert.equal(summary.educationMinutes, 1);
  assert.equal(summary.tabSwitches, 1);
  assert.equal(JSON.stringify(storage).includes("classroom.google.com"), false);
  assert.equal(JSON.stringify(storage).includes("/course/secret"), false);
});

test("auto-detection reports only service slugs and never the page path", async () => {
  const storage: Record<string, unknown> = {
    monitorEnabled: false,
    appUrl: "http://localhost:3000",
    token: "pairing-key",
    activityDays: {},
    monitorState: {},
  };
  let alarmListener: ((alarm: { name: string }) => void) | undefined;
  const requests: Array<{ url: string; body: string }> = [];
  const chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.map((key) => [key, storage[key]]));
        },
        set: async (values: Record<string, unknown>) => Object.assign(storage, values),
      },
    },
    idle: { queryState: async () => "active" },
    windows: { getLastFocused: async () => ({ id: 1, focused: true }) },
    tabs: {
      query: async () => [{ id: 7, url: "https://classroom.google.com/course/secret" }],
      onActivated: { addListener: () => undefined },
    },
    scripting: {
      executeScript: async () => [
        {
          result: [
            {
              externalId: "classroom.google.com-0-Essay",
              title: "Final Essay",
              source: "classroom.google.com",
              course: "English",
              dueAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
          ],
        },
      ],
    },
    action: { setBadgeText: async () => undefined, setBadgeBackgroundColor: async () => undefined },
    alarms: {
      create: async () => undefined,
      onAlarm: {
        addListener: (listener: (alarm: { name: string }) => void) => {
          alarmListener = listener;
        },
      },
    },
    runtime: {
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      onMessage: { addListener: () => undefined },
    },
  };
  const code = readFileSync("browser-extension/background.js", "utf8");
  vm.runInNewContext(code, {
    chrome,
    console,
    Date,
    URL,
    Set,
    fetch: async (url: string, init: { body: string }) => {
      requests.push({ url, body: init.body });
      return { ok: true, json: async () => ({ stored: 1 }) };
    },
    setTimeout,
  });

  assert.ok(alarmListener);
  alarmListener({ name: "ceregium-activity-tick" });
  await new Promise((resolve) => setTimeout(resolve, 40));

  const services = requests.find((request) => request.url.endsWith("/api/browser/services"));
  assert.ok(services, "expected a service-detection request");
  assert.deepEqual(JSON.parse(services.body), { services: ["classroom"] });

  const importRequest = requests.find((request) => request.url.endsWith("/api/browser/import"));
  assert.ok(importRequest, "expected an auto-import request");

  // The page path must never leave the browser, even during auto-detection.
  for (const request of requests) {
    assert.equal(request.body.includes("/course/secret"), false);
  }
});
