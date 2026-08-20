// §8 회귀 앵커 — Task A(renderField 추출) 전후로 라이브 캔버스가 픽셀 단위로
// 동일한지 확인한다.  사용법:
//   node tests/regression-anchor.js before   → 스냅샷 저장
//   node tests/regression-anchor.js after    → 저장본과 비교, 다른 픽셀 비율 출력
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

// 앵커 스냅샷은 커밋하지 않는다(작업 산출물).
const WORK = path.resolve(__dirname, "..", "captures-sample", "_anchor");
const VIEWPORT = { width: 1275, height: 820 };   // 정사각 프리셋과 동일 조건

async function snapshot(page) {
  // 3분할 뷰(로드 직후 기본값)
  const band3 = await page.evaluate(() => document.getElementById("canvas").toDataURL("image/png"));
  // 1:1 관찰 모드
  await page.click("#viewMode1to1Btn");
  await page.waitForTimeout(2500);            // recompute + 재렌더 여유
  const one = await page.evaluate(() => document.getElementById("canvas").toDataURL("image/png"));
  return { band3, one };
}

// 두 dataURL을 브라우저 안에서 디코드해 픽셀 차이 비율을 구한다(node에 PNG 디코더 불필요).
async function diffRatio(page, aURL, bURL) {
  return await page.evaluate(async ([a, b]) => {
    const load = (u) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true,
      a: [ia.width, ia.height], b: [ib.width, ib.height] };
    const ca = document.createElement("canvas"); ca.width = ia.width; ca.height = ia.height;
    const cb = document.createElement("canvas"); cb.width = ib.width; cb.height = ib.height;
    ca.getContext("2d").drawImage(ia, 0, 0);
    cb.getContext("2d").drawImage(ib, 0, 0);
    const da = ca.getContext("2d").getImageData(0, 0, ia.width, ia.height).data;
    const db = cb.getContext("2d").getImageData(0, 0, ib.width, ib.height).data;
    let diff = 0, maxDelta = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i+1] - db[i+1]), Math.abs(da[i+2] - db[i+2]));
      if (d > 0) diff++;
      if (d > maxDelta) maxDelta = d;
    }
    const total = da.length / 4;
    return { diff, total, ratio: diff / total, maxDelta, w: ia.width, h: ia.height };
  }, [aURL, bURL]);
}

(async function main() {
  const phase = (process.argv[2] || "before").toLowerCase();
  fs.mkdirSync(WORK, { recursive: true });

  const srv = await start(0);
  const url = `http://127.0.0.1:${srv.port}/index.html?mode=solid&H=150&L=100&lam=12`;
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  let selfCheckDone = false, errors = [];
  page.on("console", (m) => {
    if (m.text().includes("그림자 채움률")) selfCheckDone = true;
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(url);
  for (let i = 0; i < 100 && !selfCheckDone; i++) await page.waitForTimeout(100);

  await page.click("#playBtn");                                  // 일시정지
  await page.evaluate(() => {
    const s = document.getElementById("phaseSlider");
    s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  const shot = await snapshot(page);
  const layout = await page.evaluate(() => {
    const c = document.getElementById("canvas");
    return { canvasW: c.width, canvasH: c.height, dpr: window.devicePixelRatio };
  });

  if (phase === "before") {
    fs.writeFileSync(path.join(WORK, "before_3band.txt"), shot.band3);
    fs.writeFileSync(path.join(WORK, "before_1to1.txt"), shot.one);
    console.log("[앵커] 저장 완료:", WORK);
    console.log("[앵커] 캔버스", layout.canvasW + "×" + layout.canvasH, "dpr=" + layout.dpr);
  } else {
    const b3 = fs.readFileSync(path.join(WORK, "before_3band.txt"), "utf8");
    const b1 = fs.readFileSync(path.join(WORK, "before_1to1.txt"), "utf8");
    const d3 = await diffRatio(page, b3, shot.band3);
    const d1 = await diffRatio(page, b1, shot.one);
    console.log("[앵커] 3분할  ", JSON.stringify(d3));
    console.log("[앵커] 1:1    ", JSON.stringify(d1));
    console.log("[앵커] 판정 3분할:", d3.ratio < 0.001 ? "통과" : "실패",
                "/ 1:1:", d1.ratio < 0.001 ? "통과" : "실패");
  }
  console.log("[앵커] 콘솔 에러:", errors.length, errors.slice(0, 5));

  await browser.close();
  srv.server.close();
})();
