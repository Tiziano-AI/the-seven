import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Page, type TestInfo } from "@playwright/test";

export const proofViewports = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "tablet", width: 820, height: 1100 },
  { label: "mobile", width: 390, height: 844 },
] as const;

const proofStates = [
  "locked",
  "demo-receipt",
  "demo-composer",
  "byok-composer",
  "submitted-workbench",
  "archive",
  "processing-run",
  "completed-verdict",
  "provider-record",
  "failed-recovery",
  "council-editor",
] as const;
const focusedMobileStates = [
  "demo-receipt",
  "submitted-workbench",
  "processing-run",
  "completed-verdict",
  "provider-record",
  "failed-recovery",
] as const;

const proofDirectory = process.env.SEVEN_RENDER_PROOF_DIR?.trim() ?? "";
const screenshotOnlyStyle = `
  .skip-link:not(:focus) {
    visibility: hidden !important;
  }
`;

function safeProofDirectory(input: string): string {
  if (!input) {
    throw new Error("SEVEN_RENDER_PROOF_DIR is required for rendered proof.");
  }
  const resolved = path.resolve(input);
  const repoProofRoot = path.resolve(process.cwd(), "tmp", "render-proof");
  const tmpProofPattern = new RegExp(
    `^${path.sep}tmp${path.sep}seven-[^${path.sep}]*proof[^${path.sep}]*$`,
    "u",
  );
  if (resolved === repoProofRoot || tmpProofPattern.test(resolved)) {
    return resolved;
  }
  throw new Error(
    `SEVEN_RENDER_PROOF_DIR must be repo tmp/render-proof or a bounded /tmp/seven-*proof* directory; got ${resolved}`,
  );
}

const safeRenderProofDirectory = safeProofDirectory(proofDirectory);

function expectedProofPngs(): string[] {
  const expected = proofViewports.flatMap((viewport) =>
    proofStates.map((state) => `${viewport.label}-${state}.png`),
  );
  expected.push(...focusedMobileStates.map((state) => `mobile-${state}-viewport.png`));
  return expected.sort((left, right) => left.localeCompare(right));
}

async function buildProofManifest(files: readonly string[]) {
  const manifestFiles = await Promise.all(
    [...files, "contact-sheet.jpg"].map(async (file) => {
      const absolutePath = path.join(safeRenderProofDirectory, file);
      const body = await readFile(absolutePath);
      const fileStat = await stat(absolutePath);
      return {
        name: file,
        bytes: fileStat.size,
        sha256: createHash("sha256").update(body).digest("hex"),
      };
    }),
  );
  await writeFile(
    path.join(safeRenderProofDirectory, "render-proof-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        assertions: [
          "document and visible elements have no horizontal overflow before capture",
          "proof states have no visible transient toast overlays before capture",
          "focused targets are visible in the active viewport before focused capture",
          "screenshots decode to nonblank raster output with color and luminance variance",
          "contact sheet is generated after all PNG captures",
        ],
        files: manifestFiles,
      },
      null,
      2,
    )}\n`,
  );
}

/** Clears the bounded rendered-proof artifact directory before a fresh visual proof. */
export async function resetRenderProofDirectory() {
  await rm(safeRenderProofDirectory, { recursive: true, force: true });
  await mkdir(safeRenderProofDirectory, { recursive: true });
}

/** Creates the contact sheet and manifest after all visual-state captures are written. */
export async function generateContactSheet() {
  const files = (await readdir(safeRenderProofDirectory))
    .filter((file) => file.endsWith(".png"))
    .sort((left, right) => left.localeCompare(right));
  expect(files).toEqual(expectedProofPngs());
  if (files.length === 0) {
    throw new Error("Rendered proof contact sheet requires at least one PNG capture.");
  }

  const imageCards = await Promise.all(
    files.map(async (file) => {
      const absolutePath = path.join(safeRenderProofDirectory, file);
      const body = await readFile(absolutePath);
      return `<figure><img src="data:image/png;base64,${body.toString("base64")}" alt="${file}"><figcaption>${file}</figcaption></figure>`;
    }),
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 2400 } });
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 24px; background: #1f1a14; color: #efe4ce; font: 12px Georgia, serif; }
            main { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
            figure { margin: 0; border: 1px solid #7d6849; background: #2a241c; padding: 10px; }
            img { width: 100%; display: block; background: #120f0b; }
            figcaption { margin-top: 8px; color: #c9b68b; overflow-wrap: anywhere; }
          </style>
        </head>
        <body><main>${imageCards.join("")}</main></body>
      </html>`);
    const contentHeight = await page.locator("main").evaluate((node) => node.scrollHeight);
    await page.setViewportSize({ width: 1600, height: Math.min(10_000, contentHeight + 48) });
    await page.screenshot({
      path: path.join(safeRenderProofDirectory, "contact-sheet.jpg"),
      type: "jpeg",
      quality: 86,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }

  const contactSheet = await stat(path.join(safeRenderProofDirectory, "contact-sheet.jpg"));
  const pngStats = await Promise.all(
    files.map((file) => stat(path.join(safeRenderProofDirectory, file))),
  );
  if (pngStats.some((png) => png.mtimeMs > contactSheet.mtimeMs)) {
    throw new Error("Rendered proof contact sheet is stale relative to the PNG captures.");
  }
  await buildProofManifest(files);
}

/** Captures one full-page rendered state after overflow and nonblank-image assertions pass. */
export async function captureRenderedProof(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  });
  await assertRenderedSurfaceUsable(page, name);
  const body = await page.screenshot({
    fullPage: true,
    caret: "initial",
    style: screenshotOnlyStyle,
  });
  await assertScreenshotHasVariance(page, body, name);
  await testInfo.attach(name, { body, contentType: "image/png" });
  await mkdir(safeRenderProofDirectory, { recursive: true });
  await writeFile(path.join(safeRenderProofDirectory, `${name}.png`), body);
}

async function assertRenderedSurfaceUsable(page: Page, name: string) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentOverflow =
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - viewportWidth;
    const offenders: string[] = [];
    const visibleToasts: string[] = [];
    for (const toast of Array.from(
      document.body.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
    )) {
      const style = window.getComputedStyle(toast);
      const rect = toast.getBoundingClientRect();
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width >= 1 &&
        rect.height >= 1
      ) {
        visibleToasts.push((toast.textContent ?? "").replace(/\s+/gu, " ").trim().slice(0, 72));
      }
    }
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        style.position === "fixed"
      ) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        continue;
      }
      if (rect.left < -2 || rect.right > viewportWidth + 2) {
        const text = (element.textContent ?? "").replace(/\s+/gu, " ").trim().slice(0, 72);
        offenders.push(`${element.tagName.toLowerCase()}.${element.className}: ${text}`);
      }
      if (offenders.length >= 8) {
        break;
      }
    }
    return {
      documentOverflow,
      offenders,
      textLength: (document.body.innerText ?? "").trim().length,
      visibleToasts,
    };
  });
  expect(result.textLength, `${name} must render meaningful text`).toBeGreaterThan(80);
  expect(
    result.documentOverflow,
    `${name} must not create document horizontal overflow`,
  ).toBeLessThanOrEqual(2);
  expect(result.offenders, `${name} must not have visible element horizontal overflow`).toEqual([]);
  expect(result.visibleToasts, `${name} must not be obscured by transient toasts`).toEqual([]);
}

async function assertScreenshotHasVariance(page: Page, body: Buffer, name: string) {
  const proof = await page.evaluate(async (base64: string) => {
    const image = new Image();
    const decoded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Rendered proof screenshot did not decode."));
    });
    image.src = `data:image/png;base64,${base64}`;
    await decoded;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Rendered proof canvas context is unavailable.");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minLuminance = 255;
    let maxLuminance = 0;
    const colorBuckets = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
      colorBuckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 6}`);
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      colorBucketCount: colorBuckets.size,
      luminanceRange: maxLuminance - minLuminance,
    };
  }, body.toString("base64"));
  expect(proof.width, `${name} screenshot width`).toBeGreaterThan(100);
  expect(proof.height, `${name} screenshot height`).toBeGreaterThan(100);
  expect(proof.colorBucketCount, `${name} screenshot must not be blank`).toBeGreaterThan(8);
  expect(proof.luminanceRange, `${name} screenshot must have visual contrast`).toBeGreaterThan(12);
}

/** Captures a scrolled focused state, with extra viewport capture for mobile review. */
export async function captureFocusedProof(
  page: Page,
  testInfo: TestInfo,
  name: string,
  selector: string,
) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await assertFocusedTargetVisible(page, selector, name);
  await captureRenderedProof(page, testInfo, name);
  if (name.startsWith("mobile-")) {
    const viewportName = `${name}-viewport`;
    const body = await page.screenshot({
      fullPage: false,
      caret: "initial",
      style: screenshotOnlyStyle,
    });
    await assertScreenshotHasVariance(page, body, viewportName);
    await testInfo.attach(viewportName, { body, contentType: "image/png" });
    await writeFile(path.join(safeRenderProofDirectory, `${viewportName}.png`), body);
  }
}

async function assertFocusedTargetVisible(page: Page, selector: string, name: string) {
  const target = await page.locator(selector).first().boundingBox();
  const viewport = page.viewportSize();
  expect(target, `${name} focused target must have a rendered box`).not.toBeNull();
  if (!target || !viewport) {
    return;
  }
  expect(
    target.x + target.width,
    `${name} focused target must enter viewport horizontally`,
  ).toBeGreaterThan(0);
  expect(target.x, `${name} focused target must not start beyond viewport`).toBeLessThan(
    viewport.width,
  );
  expect(
    target.y + target.height,
    `${name} focused target must enter viewport vertically`,
  ).toBeGreaterThan(0);
  expect(target.y, `${name} focused target must not start below viewport`).toBeLessThan(
    viewport.height,
  );
}
