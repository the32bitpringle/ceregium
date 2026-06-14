// End-to-end check of the web interface against a running server.
// Usage: node tests/e2e-website.mjs   (requires the app on http://localhost:3000)
// On success prints PAIRING_TOKEN=... for the extension test to reuse.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const email = `e2e-${Date.now()}@example.com`;
const password = "Sup3r-secret-pass!";

const browser = await chromium.launch();
const page = await browser.newPage();
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

try {
  await page.goto(BASE, { waitUntil: "networkidle" });

  // Default screen is sign-in; switch to create-account.
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.locator('form input').nth(0).fill("E2E Student");        // Name
  await page.locator('form input[type="date"]').fill("2006-01-01");   // Date of birth
  await page.locator('form input[type="email"]').fill(email);
  await page.locator('form input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  await check("reached the authenticated app after signup", async () => {
    await page.getByRole("button", { name: "Workload", exact: true }).waitFor({ timeout: 8000 });
  });

  // --- Workload view ---
  await page.getByRole("button", { name: "Workload", exact: true }).click();
  await page.getByRole("heading", { name: "Workload", exact: true }).waitFor({ timeout: 5000 });
  await check("workload heading present", async () => {
    assert.equal(await page.getByRole("heading", { name: "Workload", exact: true }).count(), 1);
  });

  // Add a manual high-impact assignment.
  await page.getByRole("button", { name: "Add assignment" }).click();
  await page.locator("form.manual-workload-form").waitFor();
  await page.locator("form.manual-workload-form input").nth(0).fill("Final Exam Review");
  const due = new Date(Date.now() + 36 * 3600 * 1000);
  const dueLocal = new Date(due.getTime() - due.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await page.locator('form.manual-workload-form input[type="datetime-local"]').fill(dueLocal);
  await page.getByRole("button", { name: "Save assignment" }).click();
  await page.waitForTimeout(800);
  await check("manual assignment appears in the list", async () => {
    assert.ok((await page.getByText("Final Exam Review").count()) > 0);
  });
  await check("workload strain badge renders", async () => {
    assert.ok((await page.locator(".strain-badge").count()) > 0);
  });

  // --- Integrations: create a pairing key ---
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await page.getByRole("heading", { name: "Integrations", exact: true }).waitFor();
  await check("base integrations are listed", async () => {
    assert.ok((await page.getByText("Browser companion").count()) > 0);
    assert.ok((await page.getByText("Manual entry").count()) > 0);
  });
  await page.getByRole("button", { name: "Create pairing key" }).click();
  await page.locator(".pairing-token input").waitFor({ timeout: 5000 });
  const token = await page.locator(".pairing-token input").inputValue();
  await check("pairing key was generated", () => assert.ok(token && token.length > 10));

  await page.screenshot({ path: "tests/e2e-website.png", fullPage: true }).catch(() => {});
  if (token) console.log(`PAIRING_TOKEN=${token}`);
} catch (error) {
  failures.push(`fatal: ${error.message}`);
  await page.screenshot({ path: "tests/e2e-website-error.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nwebsite e2e passed");
