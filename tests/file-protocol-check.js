/* A23 — file:// 로 직접 열었을 때 동작하는지 확인
 *
 *   node tests/file-protocol-check.js
 *
 * 서버 없이(더블클릭과 같은 조건으로) capture.html을 열어 콘솔 에러가 없고
 * ①②③·그래프 4종이 실제로 저장되는지 본다. 저장은 다운로드 이벤트로 확인한다.
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "captures-sample", "_file_protocol");
const READY = 120000;

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const url = pathToFileURL(path.join(ROOT, "capture.html")).href;
  console.log("여는 주소:", url);

  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 },
    deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();

  const errors = [];
  const assertFails = [];
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") errors.push(t);
    if (m.type() === "assert" || /Assertion failed/i.test(t)) assertFails.push(t);
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  const downloads = [];
  page.on("download", async (d) => {
    const name = d.suggestedFilename();
    const to = path.join(OUT, name);
    try {
      await d.saveAs(to);
      downloads.push({ name, size: fs.statSync(to).size });
    } catch (e) {
      downloads.push({ name, error: String(e.message || e) });
    }
  });

  await page.goto(url);
  await page.waitForFunction(() => window.__captureTool && window.__captureTool.ready(),
    { timeout: READY });
  await page.waitForFunction(() => !document.getElementById("busy").classList.contains("show"),
    { timeout: READY });
  await page.waitForTimeout(300);

  const layout = await page.evaluate(() => window.__capture.layout());
  console.log("레이아웃:", JSON.stringify(layout));

  // 실제 버튼을 눌러 저장 경로 전체를 태운다(dataURL만 뽑는 게 아니라 blob 다운로드까지)
  for (const id of ["capIncBtn", "capScBtn", "capTotalBtn", "capPlotBtn"]) {
    await page.click("#" + id);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);

  const okDownloads = downloads.filter((d) => !d.error);
  console.log(`\n저장된 파일 ${okDownloads.length}개 / 시도 4개`);
  downloads.forEach((d) => console.log("  " + d.name
    + (d.error ? "  ← 실패: " + d.error : "  " + Math.round(d.size / 1024) + "KB")));
  console.log(`콘솔 에러 ${errors.length}건`, errors.slice(0, 5));
  console.log(`단언 실패 ${assertFails.length}건`, assertFails.slice(0, 5));

  const ok = errors.length === 0 && assertFails.length === 0 && okDownloads.length === 4;
  console.log(ok ? "\n[A23] 통과 — file:// 에서 콘솔 에러 0건, 4종 저장 성공."
    : "\n[A23] 실패 — 위 내용을 확인하세요.");

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
