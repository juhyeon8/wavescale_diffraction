// C5 ko 회귀 기준선 — 변경 전 compare-print PNG를 스크래치에 저장한다.
//   node tests/compare-lang-baseline.js <출력디렉터리>
// 저장 PNG는 다운로드를 가로채 바이트 그대로 받는다(내보내기 경로를 실제로 태운다).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

const OUT = process.argv[2];
const READY = 180000;
const RES = "2400x1400";

function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

async function grabExport(page, buttonId) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: READY }),
    page.click("#" + buttonId),
  ]);
  const tmp = await download.path();
  return { name: download.suggestedFilename(), buf: fs.readFileSync(tmp) };
}

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await start(0);
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:" + srv.port + "/compare-print.html");
  await page.waitForFunction(() => {
    const c = document.getElementById("mainCanvas");
    return c && c.width > 0 && document.getElementById("infoBox").textContent.length > 0;
  }, { timeout: READY });
  await page.selectOption("#resSelect", RES);

  const out = { res: RES, main: {}, screen: {}, sweep: null };

  const presets = [["preset1Btn", "lam2"], ["preset2Btn", "lam5"], ["preset3Btn", "lam20"]];
  for (const [btn, key] of presets) {
    await page.click("#" + btn);
    await page.waitForTimeout(1200);
    out.screen[key] = await page.evaluate(() =>
      document.getElementById("mainCanvas").toDataURL("image/png"));
    const g = await grabExport(page, "exportPngBtn");
    fs.writeFileSync(path.join(OUT, g.name), g.buf);
    out.main[key] = { name: g.name, sha: sha(g.buf), bytes: g.buf.length };
    console.log("메인 " + key + ": " + g.name + "  " + g.buf.length + "B  " + out.main[key].sha.slice(0, 16));
  }

  // λ 스윕 — 완료되면 저장 버튼이 활성화된다.
  await page.click("#sweepBtn");
  await page.waitForFunction(() => !document.getElementById("exportSweepPngBtn").disabled,
    { timeout: READY });
  await page.waitForTimeout(500);
  out.sweepScreen = await page.evaluate(() =>
    document.getElementById("sweepCanvas").toDataURL("image/png"));
  out.sweepResult = await page.evaluate(() => document.getElementById("sweepResult").textContent);
  const gs = await grabExport(page, "exportSweepPngBtn");
  fs.writeFileSync(path.join(OUT, gs.name), gs.buf);
  out.sweep = { name: gs.name, sha: sha(gs.buf), bytes: gs.buf.length };
  console.log("스윕: " + gs.name + "  " + gs.buf.length + "B  " + out.sweep.sha.slice(0, 16));
  console.log("스윕 결과 문구: " + out.sweepResult);

  fs.writeFileSync(path.join(OUT, "baseline.json"), JSON.stringify(out));
  console.log("기준선 저장 완료: " + path.join(OUT, "baseline.json"));
  await browser.close();
  srv.server.close();
})();
