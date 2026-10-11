import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_DIR } from "../helpers/stitch-fixtures";
import { BUILT_IN_WORKFLOWS } from "@/core/workflows/recipes";
import { WORKFLOW_GUIDES } from "@/config/workflow-guides";

/** Four distinct screenshots with distinct names (the workspace de-duplicates identical drops). */
const SHOT = (name: string, path: string) => ({ name, mimeType: "image/png", buffer: readFileSync(join(FIXTURE_DIR, path)) });
const ONE = SHOT("first.png", "chat-light/a.png");
const TWO = SHOT("second.png", "chat-light/b.png");
const THREE = SHOT("third.png", "chat-dark/a.png");
const FOUR = SHOT("fourth.png", "chat-dark/b.png");

const CAPTURE = !!process.env.CAPTURE_V2_UX;
const SHOTS = join(process.cwd(), "docs/v2-workflows-ux/screenshots");
async function shot(page: Page, testInfo: TestInfo, name: string) {
  if (!CAPTURE || testInfo.project.name !== "chromium") return;
  mkdirSync(SHOTS, { recursive: true });
  // Previews are drawn after decode; give them a moment so the capture shows real thumbnails.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, name), fullPage: false });
}

const inputs = (page: Page) => page.getByTestId("workflow-inputs");
const used = (page: Page) => inputs(page).getByTestId("workflow-input");

async function open(page: Page, name: string) {
  await page.goto("/workflows");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("workflow-start")).toBeVisible();
}

/** Every visible element inside the runner fits the viewport — catches clipped content too. */
async function nothingPastViewport(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll("[data-testid=workflow-runner] *")].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > window.innerWidth + 1;
  }).length);
}

test.describe("Workflows explain themselves", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("the landing answers what each workflow is for and what it produces", async ({ page }, testInfo) => {
    await page.goto("/workflows");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What do you want to do with your screenshot?");
    for (const recipe of BUILT_IN_WORKFLOWS) {
      const card = page.getByRole("heading", { level: 2, name: recipe.name, exact: true }).locator("xpath=ancestor::article");
      await expect(card).toContainText(WORKFLOW_GUIDES[recipe.id].outcome);
      await expect(card.getByTestId("workflow-card-output")).toContainText("You get");
      await expect(card).toContainText(WORKFLOW_GUIDES[recipe.id].output.formats);
      await expect(card.getByRole("list", { name: "Main steps" })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: "One guided job instead of several tools" })).toBeVisible();
    await shot(page, testInfo, "01-workflows-landing.png");
  });

  test("an opened workflow explains every step and the output before anything runs", async ({ page }, testInfo) => {
    await open(page, "Safe Share");
    await expect(page.getByTestId("workflow-intro")).toContainText("Shotexa will help you");
    await expect(page.getByTestId("workflow-intro")).toContainText("Your screenshots stay on this device");
    const plan = page.getByTestId("workflow-plan");
    for (const step of BUILT_IN_WORKFLOWS[0].steps) {
      await expect(plan.getByRole("heading", { level: 3, name: new RegExp(step.name) })).toBeVisible();
      await expect(plan).toContainText(step.description);
    }
    await expect(page.getByTestId("workflow-output-expectation")).toContainText("A cleaned copy of your screenshot");
    await expect(page.getByRole("button", { name: "Start Safe Share" })).toBeDisabled();
    await shot(page, testInfo, "02-safe-share-start.png");
  });

  test("start screens, for visual review", async ({ page }, testInfo) => {
    test.skip(!CAPTURE, "Only captures screenshots for review.");
    const starts: [string, Parameters<Page["setInputFiles"]>[1], string][] = [
      ["Product Screenshot", [ONE, TWO, THREE], "02b-product-screenshot-start.png"],
      ["Bug Report", ONE, "02c-bug-report-start.png"],
      ["Documentation Pack", [ONE, TWO, THREE], "02d-documentation-pack-start.png"],
      ["Visual QA Report", [ONE, TWO], "02e-visual-qa-start.png"],
    ];
    for (const [name, files, file] of starts) {
      await open(page, name);
      await page.getByTestId("file-input").setInputFiles(files);
      await expect(page.getByRole("button", { name: `Start ${name}` })).toBeEnabled();
      await shot(page, testInfo, file);
    }
  });

  test("a link from a tool page opens the workflow directly", async ({ page }) => {
    await page.goto("/workflows?workflow=bug-report");
    await expect(page.getByRole("heading", { level: 1, name: "Bug Report" })).toBeVisible();
    await page.getByRole("button", { name: "Workflows", exact: true }).click();
    await expect(page.getByTestId("workflows-landing")).toBeVisible();
    await expect(page).toHaveURL(/\/workflows$/);
  });
});

test.describe("Workflow screenshots can be seen, removed, changed and added", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("single-screenshot workflow: remove keeps the file in the workspace, Use and Change swap it", async ({ page }, testInfo) => {
    await open(page, "Safe Share");
    await page.getByTestId("file-input").setInputFiles([ONE, TWO]);
    await expect(inputs(page).getByTestId("workflow-input-count")).toHaveText("1 of 1");
    await expect(used(page)).toHaveCount(1);
    await expect(used(page)).toContainText("1170 × 2532");
    const workspace = page.getByTestId("workflow-workspace-files");
    await expect(workspace.getByRole("listitem")).toHaveCount(1);
    await shot(page, testInfo, "03-input-management.png");

    const first = (await used(page).getByTestId("workflow-input-name").textContent())!;
    await page.getByRole("button", { name: `Remove ${first} from workflow` }).click();
    await expect(used(page)).toHaveCount(0);
    await expect(inputs(page).getByTestId("workflow-input-count")).toHaveText("0 of 1");
    await expect(page.getByRole("button", { name: "Start Safe Share" })).toBeDisabled();
    // Removed from the workflow, not deleted: both files are still in the workspace.
    await expect(workspace.getByRole("listitem")).toHaveCount(2);

    await page.getByRole("button", { name: "Use second.png in this workflow" }).click();
    await expect(used(page)).toContainText("second.png");
    await expect(page.getByRole("button", { name: "Start Safe Share" })).toBeEnabled();

    // Change: a new file from the workflow's own picker replaces the current one.
    await page.getByTestId("workflow-file-input").setInputFiles(THREE);
    await expect(used(page)).toHaveCount(1);
    await expect(used(page)).toContainText("third.png");
    await expect(workspace.getByRole("listitem")).toHaveCount(2);
  });

  test("multi-screenshot workflow: reorder, remove one, add more up to the limit", async ({ page }) => {
    await open(page, "Product Screenshot");
    await page.getByTestId("file-input").setInputFiles([ONE, TWO, THREE, FOUR]);
    await expect(inputs(page).getByTestId("workflow-input-count")).toHaveText("3 of 3");
    await expect(page.getByRole("button", { name: "Add screenshot" })).toBeDisabled();
    await expect(inputs(page)).toContainText("uses up to 3 screenshots");

    const names = async () => used(page).getByTestId("workflow-input-name").allTextContents();
    const before = await names();
    await page.getByRole("button", { name: `Move ${before[0]} later` }).click();
    await expect.poll(names).toEqual([before[1], before[0], before[2]]);
    await expect(used(page).first()).toContainText("Main image");

    await page.getByRole("button", { name: `Remove ${before[2]} from workflow` }).click();
    await expect(used(page)).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Add screenshot" })).toBeEnabled();
    await page.getByRole("button", { name: /^Use .* in this workflow$/ }).first().click();
    await expect(used(page)).toHaveCount(3);
  });

  test("optional steps can be switched off before starting and show as skipped", async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, "Product Screenshot");
    await page.getByTestId("file-input").setInputFiles(ONE);
    await page.getByLabel("Include Remove the background").uncheck();
    await expect(page.getByTestId("workflow-plan")).toContainText("Switched off — this step will be skipped.");
    await page.getByRole("button", { name: "Start Product Screenshot" }).click();
    await expect(page.getByTestId("beautify-stage")).toBeVisible({ timeout: 120_000 });
    const steps = page.getByTestId("workflow-stepper").getByTestId("workflow-step");
    await expect(steps.nth(1)).toHaveAttribute("data-status", "skipped");
    await expect(steps.nth(1)).toContainText("Skipped");
  });
});

test.describe("Running a workflow", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("the current step is named, described and marked without colour; changing the screenshot restarts what used it", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await open(page, "Web Ready");
    await page.getByTestId("file-input").setInputFiles(ONE);
    await page.getByRole("button", { name: "Start Web Ready" }).click();

    const current = page.getByTestId("workflow-current-step");
    await expect(current).toContainText("Step 3 of 5", { timeout: 120_000 });
    await expect(current).toContainText("Waiting for you");
    await expect(current.getByRole("heading", { level: 2 })).toHaveText("Remove metadata");
    const steps = page.getByTestId("workflow-stepper").getByTestId("workflow-step");
    await expect(steps.nth(0)).toHaveAttribute("data-status", "complete");
    await expect(steps.nth(0)).toContainText("Complete");
    await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(2)).toContainText("Waiting for you");
    await expect(steps.nth(3)).toContainText("Upcoming");
    await expect(page.getByTestId("workflow-input-note")).toContainText("restarts the steps that used it");
    await shot(page, testInfo, "04-active-step.png");

    await page.getByTestId("workflow-file-input").setInputFiles(TWO);
    await expect(page.getByTestId("workflow-input-note")).toContainText("restarted the workflow with the new screenshot", { timeout: 60_000 });
    await expect(used(page)).toContainText("second.png");
    await expect(current).toContainText("Step 3 of 5", { timeout: 120_000 });

    // Removing the only screenshot stops the run and says why.
    await page.getByRole("button", { name: "Remove second.png from workflow" }).click();
    await expect(page.getByTestId("workflow-start")).toBeVisible();
    await expect(page.getByTestId("workflow-start")).toContainText("needs a screenshot");
  });

  test("before/after can be swapped in place while the first step is open", async ({ page }) => {
    await open(page, "Visual QA Report");
    await page.getByTestId("file-input").setInputFiles([ONE, TWO]);
    await page.getByRole("button", { name: "Start Visual QA Report" }).click();
    await expect(page.getByTestId("workflow-current-step")).toContainText("Step 1 of 4");
    await expect(used(page).nth(0)).toContainText("Before");
    const before = await used(page).nth(0).getByTestId("workflow-input-name").textContent();
    await page.getByRole("button", { name: "Swap before and after" }).click();
    await expect(used(page).nth(1).getByTestId("workflow-input-name")).toHaveText(before!);
    await expect(used(page).nth(1)).toContainText("After");
    await expect(page.getByTestId("workflow-current-step")).toContainText("Step 1 of 4");
    await expect(page.getByTestId("workflow-input-note")).toHaveCount(0);
  });

  test("completion lists what was done and each output with its size", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await open(page, "Web Ready");
    await page.getByTestId("file-input").setInputFiles(ONE);
    await page.getByRole("button", { name: "Small File" }).click();
    await page.getByRole("button", { name: "Start Web Ready" }).click();
    await page.getByRole("button", { name: "Skip optional step" }).click({ timeout: 120_000 });
    const done = page.getByTestId("workflow-complete");
    await expect(done).toContainText("What Shotexa completed", { timeout: 120_000 });
    await expect(done).toContainText("File optimised to");
    const output = done.getByTestId("workflow-output");
    await expect(output).toHaveCount(1);
    await expect(output).toContainText("web-ready.webp");
    await expect(output).toContainText(/WebP image · \d+(\.\d)? (KB|MB) · \d+ × \d+ px/);
    await expect(done.getByRole("button", { name: "Run again" })).toBeVisible();
    await expect(done.getByRole("button", { name: "Choose another workflow" })).toBeVisible();
    await expect(page.getByTestId("workflow-stepper").getByTestId("workflow-step").nth(2)).toHaveAttribute("data-status", "skipped");
    await shot(page, testInfo, "05-completion.png");
    const [download] = await Promise.all([page.waitForEvent("download"), done.getByRole("button", { name: "Download output" }).click()]);
    expect(download.suggestedFilename()).toBe("web-ready.webp");
  });

  test("custom workflow builder says what is saved", async ({ page }) => {
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Custom workflow", exact: true }).click();
    await expect(page.getByTestId("custom-recipe-builder")).toContainText("Shotexa remembers the processing steps and settings — not your screenshot files.");
    await expect(page.getByRole("button", { name: "Save workflow" })).toBeDisabled();
  });
});

test.describe("Workflows on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("purpose, inputs with a visible Remove, the current step and Continue are all reachable without hover", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/workflows");
    await shot(page, testInfo, "06-mobile-selection.png");
    await page.getByRole("button", { name: "Bug Report", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Bug Report" })).toBeVisible();
    await expect(page.getByTestId("workflow-intro")).toBeVisible();
    await page.getByTestId("file-input").setInputFiles([ONE, TWO]);
    const remove = page.getByRole("button", { name: /^Remove .* from workflow$/ });
    await expect(remove).toBeVisible();
    const box = (await remove.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(await nothingPastViewport(page)).toBe(0);
    await shot(page, testInfo, "07-mobile-inputs.png");

    await page.getByRole("button", { name: "Start Bug Report" }).click();
    const current = page.getByTestId("workflow-current-step");
    await expect(current).toContainText("Waiting for you", { timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^Remove .* from workflow$/ })).toBeVisible();
    await expect(current.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(current.getByRole("button", { name: "Skip this step" })).toBeVisible();
    expect(await nothingPastViewport(page)).toBe(0);
    await shot(page, testInfo, "08-mobile-active-step.png");

    await page.getByRole("button", { name: "Settings" }).click();
    const sheet = page.getByRole("dialog", { name: "Mark the problem" });
    await expect(sheet.getByTestId("workflow-settings")).toBeVisible();
    await expect(sheet.getByLabel("Report title")).toBeVisible();
    await shot(page, testInfo, "09-mobile-settings.png");
    await sheet.getByRole("button", { name: "Close" }).click();

    await current.getByRole("button", { name: "Skip this step" }).click();
    await expect(current.getByRole("heading", { level: 2 })).toHaveText("Copy the visible text", { timeout: 30_000 });
    await current.getByRole("button", { name: "Skip this step" }).click();
    await expect(current.getByRole("heading", { level: 2 })).toHaveText("Hide private details", { timeout: 30_000 });
    await current.getByRole("button", { name: "Skip this step" }).click();
    await expect(page.getByTestId("workflow-complete")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
    expect(await nothingPastViewport(page)).toBe(0);
    await shot(page, testInfo, "10-mobile-completion.png");
  });
});
