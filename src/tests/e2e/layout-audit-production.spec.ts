import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_LIST } from "@/config/tools";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";

/**
 * Layout guard for every page and every tool workspace (with its settings open on phones):
 * no label spilling out of its button, no content silently cut off, nothing past the screen
 * edge, and touch-sized targets on phones. Intentional truncation (ellipsis, line clamp) and
 * screen-reader-only text are allowed.
 */
const img = (name: string, rel: string) => ({ name, mimeType: "image/png", buffer: readFileSync(join(FIXTURE_DIR, rel)) });
const ONE = [img("first.png", "chat-light/a.png")];
const TWO = [img("first.png", "chat-light/a.png"), img("second.png", "chat-light/b.png")];
const PAGES = ["/", "/tools", "/workflows", "/privacy", "/alternatives"];
const TOOLS = TOOL_LIST.filter((tool) => tool.status === "live").map((tool) => [tool.route, tool.minFiles === 2 ? TWO : ONE] as const);

function audit({ scope: selector, phone }: { scope: string | null; phone: boolean }) {
  const scope = selector ? document.querySelector(selector) : document.body;
  if (!scope) return [];
  const out: string[] = [];
  const vw = window.innerWidth;
  const visible = (el: Element) => {
    if (el.closest(".sr-only")) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el: Element) => (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const intentional = (el: Element) => { const cs = getComputedStyle(el); return cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none"; };

  for (const el of scope.querySelectorAll("button,a,label,[role=radio],[role=tab],[role=switch],summary")) {
    if (!visible(el)) continue;
    const box = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let spill = false;
    while (!spill && (node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!node.textContent?.trim() || !parent || !visible(parent) || intentional(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.right > box.right + 1.5 || r.left < box.left - 1.5 || r.bottom > box.bottom + 1.5 || r.top < box.top - 1.5) spill = true;
    }
    if (spill) out.push(`text spills out of "${label(el)}"`);
  }
  for (const el of scope.querySelectorAll("div,ul,ol,section,article,nav,li,a,button,p,span,h1,h2,h3,dt,dd,label")) {
    if (!visible(el) || intentional(el) || !/hidden|clip/.test(getComputedStyle(el).overflowX) || el.querySelector("canvas,img,video")) continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.textContent?.trim()) out.push(`content cut off in <${el.tagName.toLowerCase()}> "${label(el)}"`);
  }
  for (const el of scope.querySelectorAll("*")) {
    if (!visible(el) || el.getBoundingClientRect().right <= vw + 1 || (el.parentElement?.getBoundingClientRect().right ?? 0) > vw + 1) continue;
    let p = el.parentElement;
    let contained = false;
    while (p && p !== document.body) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX) && p.getBoundingClientRect().right <= vw + 1) { contained = true; break; }
      p = p.parentElement;
    }
    if (!contained) out.push(`<${el.tagName.toLowerCase()}> runs past the screen edge: "${label(el)}"`);
  }
  if (phone) for (const el of scope.querySelectorAll("button,a[href],[role=radio],[role=tab],[role=switch],select")) {
    // Inline links in running text and cards opened through a stretched heading button are exempt.
    if (!visible(el) || el.closest("p,dd,h2 button,h3 button") || el.matches("h2 > button, h3 > button")) continue;
    // A switch inside a full-height label row is tapped through the row.
    if (el.matches("[role=switch]") && (el.closest("label")?.getBoundingClientRect().height ?? 0) >= 40) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 32) out.push(`small touch target ${Math.round(r.width)}×${Math.round(r.height)} "${label(el)}"`);
  }
  return [...new Set(out)];
}

async function check(page: Page, scope: string | null, phone: boolean) {
  return page.evaluate(audit, { scope, phone });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1100, height: 800 }]) {
  const phone = viewport.width < 768;
  test.describe(`Layout at ${viewport.width}px`, () => {
    test.use({ viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) });

    test("pages and tool landings", async ({ page }) => {
      test.setTimeout(300_000);
      for (const route of [...PAGES, ...TOOLS.map(([route]) => route)]) {
        await page.goto(route);
        expect(await check(page, null, phone), route).toEqual([]);
      }
    });

    test("tool workspaces and their settings", async ({ page }) => {
      test.setTimeout(480_000);
      for (const [route, files] of TOOLS) {
        await page.goto(route);
        await page.getByTestId("file-input").setInputFiles([...files]);
        await expect(page.getByTestId("workspace-drop-zone")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        expect(await check(page, null, phone), `${route} workspace`).toEqual([]);
        if (phone) {
          await page.getByTestId("mobile-inspector-trigger").click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.waitForTimeout(500);
          expect(await check(page, "[role=dialog]", phone), `${route} settings`).toEqual([]);
          await page.keyboard.press("Escape");
        }
      }
    });
  });
}
