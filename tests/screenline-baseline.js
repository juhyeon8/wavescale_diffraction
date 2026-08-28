// §37 E5 회귀 기준선 — 변경 전 캡처 dataURL을 파일로 저장한다.
//   node tests/screenline-baseline.js <출력경로>
// 기준 조건: H=150mm, L=100mm, λ=12cm, 위상 0°, 카메라 1:1, 구도 정사각, 프리셋 s
const fs = require("fs");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

const OUT = process.argv[2];
const READY = 120000;

(async function main() {
  const srv = await start(0);
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.port}/capture.html`);
  await page.waitForFunction(() => window.__captureTool && window.__captureTool.ready(), { timeout: READY });
  await page.waitForFunction(() => !document.getElementById("busy").classList.contains("show"), { timeout: READY });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__captureTool.applyFontScale(1.5, false));

  const out = await page.evaluate(() => {
    const a = window.__captureTool.api();
    const r = { params: a.params(), layout: a.layout(), urls: {}, metas: {} };
    ['plot', 'inc', 'sc', 'total'].forEach((k) => {
      r.urls[k] = a.dataURL(k, 's');
      r.metas[k] = JSON.parse(JSON.stringify(a.meta));
    });
    return r;
  });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("기준선 저장:", OUT);
  console.log("params:", JSON.stringify(out.params));
  Object.keys(out.urls).forEach((k) => console.log(k, "len:", out.urls[k].length));
  await browser.close();
  srv.server.close();
})();
