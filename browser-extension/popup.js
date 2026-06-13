let detected = [];

const appUrl = document.querySelector("#appUrl");
const token = document.querySelector("#token");
const items = document.querySelector("#items");
const status = document.querySelector("#status");
const importButton = document.querySelector("#import");

chrome.storage.local.get(["appUrl", "token"], (saved) => {
  if (saved.appUrl) appUrl.value = saved.appUrl;
  if (saved.token) token.value = saved.token;
});

document.querySelector("#save").addEventListener("click", () => {
  chrome.storage.local.set({ appUrl: appUrl.value.replace(/\/$/, ""), token: token.value });
  status.textContent = "Connection saved locally in this browser.";
});

document.querySelector("#scan").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const datePattern = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i;
      const candidates = [...document.querySelectorAll("article, li, tr, [role=row], .assignment, .coursework")];
      return candidates.slice(0, 200).map((element, index) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
        const date = text.match(datePattern)?.[0];
        const heading = element.querySelector("h1,h2,h3,h4,a,strong,[role=heading]")?.textContent?.trim();
        if (!date || !heading || heading.length > 160) return null;
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return null;
        return {
          externalId: `${location.hostname}-${index}-${heading.slice(0, 40)}`,
          title: heading,
          source: location.hostname,
          course: document.title.slice(0, 120),
          dueAt: parsed.toISOString()
        };
      }).filter(Boolean).slice(0, 100);
    }
  });
  detected = result.result || [];
  items.replaceChildren();
  detected.forEach((item, index) => {
    const row = document.createElement("label");
    row.className = "item";
    row.innerHTML = `<input type="checkbox" data-index="${index}" checked><span><strong></strong><br><small></small></span>`;
    row.querySelector("strong").textContent = item.title;
    row.querySelector("small").textContent = new Date(item.dueAt).toLocaleString();
    items.append(row);
  });
  importButton.disabled = detected.length === 0;
  status.textContent = detected.length ? `Review ${detected.length} detected items.` : "No assignment-like items were detected.";
});

importButton.addEventListener("click", async () => {
  const selected = [...items.querySelectorAll("input:checked")].map(
    (input) => detected[Number(input.dataset.index)]
  );
  const response = await fetch(`${appUrl.value.replace(/\/$/, "")}/api/browser/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: selected })
  });
  const result = await response.json();
  status.textContent = response.ok ? `Imported ${result.imported} assignments.` : result.error;
});
