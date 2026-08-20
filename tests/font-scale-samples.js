/* 그래프 캡처 폰트 배율 비교 샘플 만들기
 *
 *   node tests/font-scale-samples.js [배율...]      (기본 1.0 1.5 2.0)
 *
 * captures-sample/_fontscale/ 에 640px plot 캡처를 배율별로 저장하고,
 * 세로로 이어 붙인 비교 이미지도 한 장 만든다.
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "captures-sample", "_fontscale");
const READY = 120000;

(async function main() {
  const scales = process.argv.slice(2).map(Number).filter((n) => isFinite(n));
  const SCALES = scales.length ? scales : [1.0, 1.5, 2.0];
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(ROOT, "capture.html")).href);
  await page.waitForFunction(() => window.__captureTool && window.__captureTool.ready(), { timeout: READY });
  await page.waitForFunction(() => !document.getElementById("busy").classList.contains("show"),
    { timeout: READY });

  const shots = [];
  for (const sc of SCALES) {
    await page.evaluate((v) => window.__captureTool.applyFontScale(v, false), sc);
    const url = await page.evaluate(() => window.__capture.dataURL("plot", "xs"));
    const meta = await page.evaluate(() => {
      const m = window.__capture.meta;
      return { tickPx: m.tickPx, axisPx: m.axisPx, W: m.W, H: m.H,
        areaFrac: m.plotAreaFrac, box: m.box, warn: m.boxWarn };
    });
    const name = "plot_fontscale_" + sc.toFixed(1).replace(".", "p") + "_w640.png";
    fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(",")[1], "base64"));
    shots.push({ sc, url, name, meta });
    console.log(`×${sc.toFixed(1)}  눈금 ${meta.tickPx}px · 축이름 ${meta.axisPx}px · `
      + `플롯영역 ${(meta.areaFrac * 100).toFixed(0)}%  → ${name}`);
  }

  // 세로로 이어 붙인 비교 이미지(라벨 포함)
  const stackURL = await page.evaluate(async (list) => {
    const load = (u) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u;
    });
    const imgs = await Promise.all(list.map((x) => load(x.url)));
    const labelH = 26, padH = 8;
    const w = imgs[0].width;
    const h = imgs.reduce((a, im) => a + im.height + labelH + padH, padH);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d");
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h);
    let y = padH;
    for (let i = 0; i < imgs.length; i++) {
      c.fillStyle = "#1c1c1f";
      c.font = "bold 15px sans-serif"; c.textAlign = "left"; c.textBaseline = "top";
      c.fillText("폰트 배율 ×" + list[i].sc.toFixed(1)
        + "   (눈금 " + list[i].tickPx + "px, 축 이름 " + list[i].axisPx + "px)", 10, y);
      y += labelH;
      c.drawImage(imgs[i], 0, y);
      c.strokeStyle = "#d8d8dc"; c.lineWidth = 1;
      c.strokeRect(0.5, y + 0.5, w - 1, imgs[i].height - 1);
      y += imgs[i].height + padH;
    }
    return cv.toDataURL("image/png");
  }, shots.map((x) => ({ sc: x.sc, url: x.url, tickPx: x.meta.tickPx, axisPx: x.meta.axisPx })));

  const stackName = "plot_fontscale_비교.png";
  fs.writeFileSync(path.join(OUT, stackName), Buffer.from(stackURL.split(",")[1], "base64"));
  console.log("\n비교 이미지:", path.join(OUT, stackName));

  await browser.close();
})();
