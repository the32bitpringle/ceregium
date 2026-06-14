// End-to-end check of the browser companion extension against a running server.
// Loads the unpacked extension, simulates a Canvas page, triggers the background
// worker, and verifies that auto-import and service detection reach the server and
// surface in the web UI.
// Usage: node tests/e2e-extension.mjs   (requires the app on http://localhost:3000)
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(ROOT, "browser-extension");
const email = `ext-${Date.now()}@example.com`;
const password = "Sup3r-secret-pass!";

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}: ${error.message}`);
  }
}

const MOCK_CANVAS = `<!doctype html><html><head><title>Biology 200</title></head><body>
  <ul>
    <li><h3>Final Project Proposal</h3><span>Due Dec 5, 2026 at 11:59 PM</span></li>
    <li><h3>Weekly Reading Response</h3><span>Due Dec 2, 2026</span></li>
    <li><h3>Lab Report 4</h3><span>Due Dec 8, 2026</span></li>
  </ul>
</body></html>`;

const userDataDir = mkdtempSync(path.join(os.tmpdir(), "ceregium-ext-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--host-resolver-rules=MAP canvas.instructure.com 127.0.0.1",
  ],
});

try {
  // Serve mock Canvas DOM for the (allowlisted) instructure.com host, mapped to
  // localhost by the resolver arg above.
  await context.route(/instructure\.com/, (route) =>
    route.fulfill({ contentType: "text/html", body: MOCK_CANVAS }),
  );

  // Locate the extension service worker.
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(worker.url()).host;
  await check("extension service worker is running", () => assert.ok(extId.length > 10));

  // --- Sign up + create a pairing key through the web UI ---
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator("form input").nth(0).fill("Ext Student");
  await page.locator('form input[type="date"]').fill("2006-01-01");
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Integrations", exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await page.getByRole("button", { name: "Create pairing key" }).click();
  await page.locator(".pairing-token input").waitFor({ timeout: 5000 });
  const token = await page.locator(".pairing-token input").inputValue();
  await check("pairing key created via UI", () => assert.ok(token && token.length > 10));

  // --- Configure the extension with the connection ---
  await worker.evaluate(
    async ({ appUrl, token }) => {
      await chrome.storage.local.set({ appUrl, token, monitorEnabled: false });
    },
    { appUrl: BASE, token },
  );

  // --- Open the mock Canvas page and make it the active tab ---
  const canvas = await context.newPage();
  await canvas.goto("http://canvas.instructure.com:3000/courses/42/assignments", { waitUntil: "domcontentloaded" });
  await canvas.bringToFront();
  await canvas.waitForTimeout(500);

  // --- Trigger the background tick (what the 1-minute alarm would do) ---
  await worker.evaluate(async () => {
    // `tick` is a top-level function in the service-worker global scope.
    await tick();
  });
  await canvas.waitForTimeout(1500);

  // --- Verify auto-import landed: reload so the app refetches server state ---
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Workload", exact: true }).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await page.waitForTimeout(800);
  await check("auto-detected assignment imported", async () => {
    await page.getByText("Final Project Proposal").first().waitFor({ timeout: 6000 });
  });
  await check("a second detected assignment imported", async () => {
    assert.ok((await page.getByText("Lab Report 4").count()) > 0);
  });
  await check("imported high-impact item is not left as Unknown", async () => {
    // Find the row for the final project and read its grade-impact select.
    const row = page.locator("section.workload-list article", { hasText: "Final Project Proposal" });
    const value = await row.locator("select").inputValue();
    assert.equal(value, "high", `expected high, got ${value}`);
  });

  // --- Verify service detection surfaced Canvas as a connected integration ---
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await page.waitForTimeout(800);
  await check("Canvas auto-detected as an integration", async () => {
    await page.getByText("Canvas", { exact: true }).first().waitFor({ timeout: 6000 });
  });

  await page.screenshot({ path: "tests/e2e-extension.png", fullPage: true }).catch(() => {});
} catch (error) {
  failures.push(`fatal: ${error.message}`);
} finally {
  await context.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nextension e2e passed");
