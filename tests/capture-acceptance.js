/* §7 수용 기준 A1~A22 자동 검증 + 샘플 캡처 저장
 *
 *   node tests/capture-acceptance.js
 *
 * 판정은 모두 캡처 이미지의 픽셀 또는 __capture 훅의 실측값 기준이며, 창 크기·폰트
 * 메트릭에 의존하지 않는다. recompute가 도는 항목(A11)은 맨 마지막에 배치한다.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

const OUT = path.resolve(__dirname, "..", "captures-sample");
const READY = 90000;                    // 1:1 모드 recompute는 30초를 넘기도 한다
const results = [];
let recomputeLogs = 0;
let assertFails = [];
let pageErrors = [];
let warnLogs = [];
let notFound = [];

function rec(id, item, measured, ok, note) {
  results.push({ id, item, measured, ok, note: note || "" });
  const mark = ok === null ? "  –  " : (ok ? " 통과 " : " 실패 ");
  console.log(`[${id}]${mark} ${item} → ${measured}${note ? "  (" + note + ")" : ""}`);
}

// ---------------------------------------------------------------- 페이지 헬퍼
// 잉크 검출기 — 중립 어두운 픽셀(글자·치수선). 필드색(채도 높은 적/청)과 스크린선은
// |r-g|가 커서 걸리지 않고, 테두리(#c8c8ce)·중심선(#9aa0aa)은 밝아서 걸리지 않는다.
const HELPERS = `
window.__t = {
  load(url) {
    return new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
  },
  async pixels(url) {
    const im = await window.__t.load(url);
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
    return { w: im.width, h: im.height, data: c.getImageData(0, 0, im.width, im.height).data };
  },
  isInk(r, g, b) { return Math.abs(r - g) <= 18 && Math.abs(g - b) <= 18 && r <= 140; },
  // 보완 검출기 — 지시서의 isInk는 |g−b|≤18 때문에 1:1 모드 제목색 #10193a(남색)를
  // 놓친다. |r−g|≤18 && r≤140 만 남기면 남색 글자도 잡으면서 필드색은 여전히 제외된다
  // (필드 빨강은 r>140, 필드 파랑은 |r−g|가 크다).
  isInk2(r, g, b) { return Math.abs(r - g) <= 18 && r <= 140; },
  async countInk(url, x0, y0, x1, y1) {
    const p = await window.__t.pixels(url);
    const ax = Math.max(0, Math.round(x0 * p.w)), bx = Math.min(p.w, Math.round(x1 * p.w));
    const ay = Math.max(0, Math.round(y0 * p.h)), by = Math.min(p.h, Math.round(y1 * p.h));
    let n = 0, n2 = 0;
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
      const i = (y * p.w + x) * 4;
      const r = p.data[i], g = p.data[i+1], b = p.data[i+2];
      if (window.__t.isInk(r, g, b)) n++;
      if (window.__t.isInk2(r, g, b)) n2++;
    }
    return { ink: n, ink2: n2, w: p.w, h: p.h, box: [ax, ay, bx, by] };
  },
  async colorCount(url) {
    const p = await window.__t.pixels(url);
    let red = 0, dark = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      const r = p.data[i], g = p.data[i+1], b = p.data[i+2];
      if (r > 150 && g < 110 && b < 110) red++;
      if (window.__t.isInk(r, g, b)) dark++;
    }
    return { red, dark, w: p.w, h: p.h };
  },
  // 회색 음영 띠(rgba(0,0,0,0.08) → 약 235,235,235)의 가로 픽셀 폭
  async bandWidth(url, yFrac) {
    const p = await window.__t.pixels(url);
    const y = Math.round(p.h * yFrac);
    let n = 0;
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      const r = p.data[i], g = p.data[i+1], b = p.data[i+2];
      if (Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2 && r >= 228 && r <= 242) n++;
    }
    return n;
  }
};
`;

function api(page, fn, arg) {
  return page.evaluate(new Function("arg", `const a = window.__captureTool.api(); return (${fn})(a, arg);`), arg);
}

async function waitIdle(page) {
  await page.waitForFunction(() => !document.getElementById("busy").classList.contains("show"),
    { timeout: READY });
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------- 본 검증
(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await start(0);
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 },
    deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();

  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[성능] recompute()")) recomputeLogs++;
    if (m.type() === "warning" && t.includes("[캡처 경고]")) warnLogs.push(t);
    if (m.type() === "assert" || /Assertion failed/i.test(t)) assertFails.push(t);
    if (m.type() === "error" && !/404/.test(t)) pageErrors.push(t);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => { if (r.status() === 404) notFound.push(r.url()); });

  await page.goto(`http://127.0.0.1:${srv.port}/capture.html`);
  await page.addScriptTag({ content: HELPERS });
  await page.waitForFunction(() => window.__captureTool && window.__captureTool.ready(), { timeout: READY });
  await waitIdle(page);
  console.log("\n=== 준비 완료: 구도 sq(1275×820) · 카메라 1:1 · 위상 0° · 일시정지 ===\n");

  const layoutSq = await api(page, "(a) => a.layout()");
  const paramsSq = await api(page, "(a) => a.params()");
  console.log("초기 상태:", JSON.stringify(paramsSq), JSON.stringify(layoutSq), "\n");

  // ---- A15~A17 측정 시작점 (ready() 이후) ----
  const stateBefore = JSON.stringify(await api(page, "(a) => [a.params(), a.layout()]"));
  const sumBefore = JSON.stringify(await api(page, "(a) => a.gridChecksum(10)"));
  const recomputeBefore = recomputeLogs;

  // ---------------- A1 프리셋 폭
  const widths = {};
  for (const k of ["xs", "s", "m"]) {
    const u = await api(page, "(a, k) => a.dataURL('total', k)", k);
    const p = await page.evaluate((url) => window.__t.pixels(url).then((q) => [q.w, q.h]), u);
    widths[k] = p;
  }
  rec("A1", "프리셋 폭 xs/s/m", `${widths.xs[0]} / ${widths.s[0]} / ${widths.m[0]}`,
    widths.xs[0] === 640 && widths.s[0] === 1200 && widths.m[0] === 1920);

  // ---------------- A2 종횡비
  const aspect = layoutSq.bandH1to1 / layoutSq.bandW;
  const expectH = Math.round(1200 * aspect);
  rec("A2", "필드 캡처 높이 = round(폭×밴드 종횡비)",
    `${widths.s[1]} px (기대 ${expectH}, 종횡비 ${aspect.toFixed(6)})`,
    Math.abs(widths.s[1] - expectH) <= 1);

  // 기준 이미지(작음, ③중첩)
  const totalURL = await api(page, "(a) => a.dataURL('total', 's')");
  const metaTotal = await api(page, "(a) => a.meta");

  // ---------------- A3 화살표·"입사파 진행" 제거
  let r = await page.evaluate((u) => window.__t.countInk(u, 0, 0, 0.30, 0.10), totalURL);
  rec("A3", "좌상단 (0,0)–(0.30,0.10) 잉크", `${r.ink} px (보완 검출기 ${r.ink2} px)`,
    r.ink === 0 && r.ink2 === 0);

  // ---------------- A4 밴드 제목 제거
  r = await page.evaluate((u) => window.__t.countInk(u, 0, 0.86, 0.70, 1.00), totalURL);
  rec("A4", "좌하단 (0,0.86)–(0.70,1.00) 잉크", `${r.ink} px (보완 검출기 ${r.ink2} px)`,
    r.ink === 0 && r.ink2 === 0);

  // ---------------- A5 "스크린" 라벨 제거
  const xScreen = (paramsSq.L_mm / 1000 - metaTotal.xMin) / (metaTotal.xMax - metaTotal.xMin);
  r = await page.evaluate(([u, x]) => window.__t.countInk(u, x - 0.06, 0, x + 0.06, 0.08),
    [totalURL, xScreen]);
  rec("A5", `스크린선 x=${xScreen.toFixed(3)}W ±0.06W, y∈(0,0.08) 잉크`,
    `${r.ink} px (보완 검출기 ${r.ink2} px)`, r.ink === 0 && r.ink2 === 0);

  // ---------------- A6 H 치수선 제거
  const xBar = (0 - metaTotal.xMin) / (metaTotal.xMax - metaTotal.xMin);
  r = await page.evaluate(([u, x]) => window.__t.countInk(u, x - 0.05, 0, x - 0.012, 1),
    [totalURL, xBar]);
  rec("A6", `막대 x=${xBar.toFixed(3)}W 왼쪽 [−0.05W,−0.012W] 전체 높이 잉크`,
    `${r.ink} px (보완 검출기 ${r.ink2} px)`, r.ink === 0 && r.ink2 === 0);

  // ---------------- A7 화면은 그대로(회귀)
  const liveURL = await page.evaluate(() => {
    const d = document.getElementById("sim").contentDocument;
    return d.getElementById("canvas").toDataURL("image/png");
  });
  const liveBand = await page.evaluate(() => {
    const w = document.getElementById("sim").contentWindow;
    const L = w.__capture.layout();
    const c = w.document.getElementById("canvas");
    // 좌표는 CSS 크기가 아니라 canvas.width/height 기준으로 잡는다(dpr 영향 차단)
    const sx = c.width / L.cssW, sy = c.height / L.cssH;
    return { bx: 12 * sx, by: 10 * sy, bw: L.bandW * sx, bh: L.bandH1to1 * sy,
      cw: c.width, ch: c.height, dpr: w.devicePixelRatio };
  });
  const bandFrac = (fx0, fy0, fx1, fy1) => [
    (liveBand.bx + fx0 * liveBand.bw) / liveBand.cw, (liveBand.by + fy0 * liveBand.bh) / liveBand.ch,
    (liveBand.bx + fx1 * liveBand.bw) / liveBand.cw, (liveBand.by + fy1 * liveBand.bh) / liveBand.ch];
  const liveTop = await page.evaluate(([u, b]) => window.__t.countInk(u, b[0], b[1], b[2], b[3]),
    [liveURL, bandFrac(0, 0, 0.30, 0.10)]);
  const liveBot = await page.evaluate(([u, b]) => window.__t.countInk(u, b[0], b[1], b[2], b[3]),
    [liveURL, bandFrac(0, 0.86, 0.70, 1.00)]);
  rec("A7", "라이브 캔버스 A3·A4 대응 영역 잉크(>50이어야 함)",
    `좌상단 ${liveTop.ink2} px / 좌하단 ${liveBot.ink2} px`
    + ` (지시서 검출기로는 ${liveTop.ink} / ${liveBot.ink} px)`,
    liveTop.ink2 > 50 && liveBot.ink2 > 50,
    `1:1 모드 제목색 #10193a는 지시서 isInk의 |g−b|≤18에 걸리지 않아 보완 검출기로 판정`);

  // ---------------- A8 스크린선·막대는 남아 있음
  const cc = await page.evaluate((u) => window.__t.colorCount(u), totalURL);
  const redMin = 0.002 * cc.h;
  rec("A8", "캡처의 스크린선(적색)·막대(중립 어두움) 픽셀",
    `적색 ${cc.red} px (하한 ${redMin.toFixed(1)}), 어두움 ${cc.dark} px`,
    cc.red > redMin && cc.dark > 0);

  // ---------------- A9 · A10 · A12 그래프
  const plotURL = await api(page, "(a) => a.dataURL('plot', 's')");
  const metaPlot = await api(page, "(a) => a.meta");
  const pts = metaPlot.points;
  let mono = true;
  for (let i = 1; i < pts.length; i++) if (!(pts[i][0] > pts[i - 1][0])) mono = false;
  rec("A9", "그래프 축 방향(첫 x<0<끝 x, 단조 증가)",
    `첫 ${pts[0][0].toFixed(2)} cm, 끝 ${pts[pts.length - 1][0].toFixed(2)} cm, 단조=${mono}`,
    pts[0][0] < 0 && pts[pts.length - 1][0] > 0 && mono);

  let asym = 0;
  for (let i = 0; i < pts.length / 2; i++)
    asym = Math.max(asym, Math.abs(pts[i][1] - pts[pts.length - 1 - i][1]));
  rec("A10", "그래프 좌우 대칭 max|I(y)−I(−y)|", asym.toExponential(2), asym < 1e-6);

  const yMaxCheck = await api(page,
    "(a) => { const m = a.meta; return { yMax: m.yMax, Imax: m.Imax, pxAtImax: m.pxAtImax, box: m.box }; }");
  // 곡선 최고점의 실제 픽셀 y를 이미지에서 찾는다(빨간 곡선의 최상단)
  const curveTop = await page.evaluate(async (u) => {
    const p = await window.__t.pixels(u);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (p.data[i] > 140 && p.data[i + 1] < 90 && p.data[i + 2] < 90) return y;
    }
    return -1;
  }, plotURL);
  rec("A12", "세로축=세기 (곡선 최고점 픽셀 y vs Y(Imax))",
    `실측 ${curveTop} px, 기대 ${yMaxCheck.pxAtImax.toFixed(1)} px, yMax=${yMaxCheck.yMax}`,
    Math.abs(curveTop - yMaxCheck.pxAtImax) <= 2 + 1);   // 곡선 두께 2s의 절반 여유

  // ---------------- A13 저해상도 폰트 하한 — 코드 확인
  const src = fs.readFileSync(path.resolve(__dirname, "..", "script.js"), "utf8");
  const tickLine = /const tickFont = Math\.max\(9, Math\.round\(12 \* s\)\);/.test(src);
  const labLine = /const labFont = Math\.max\(10, Math\.round\(13 \* s\)\);/.test(src);
  const xsFont = Math.max(9, Math.round(12 * (640 / 1000)));
  rec("A13", "저해상도 폰트 하한(코드 확인)",
    `tickFont=Math.max(9,…) ${tickLine ? "있음" : "없음"}, labFont=Math.max(10,…) ${labLine ? "있음" : "없음"}; `
    + `640px에서 눈금 ${xsFont}px`, tickLine && labLine && xsFont >= 9, "픽셀 검사 대신 코드 확인");

  // ---------------- A14 용량 순서
  const sizes = {};
  for (const k of ["xs", "s", "m"]) sizes[k] = await api(page, "(a, k) => a.blobSize('total', k)", k);
  rec("A14", "용량 순서 xs < s < m",
    `${(sizes.xs / 1024).toFixed(0)} < ${(sizes.s / 1024).toFixed(0)} < ${(sizes.m / 1024).toFixed(0)} KB`,
    sizes.xs < sizes.s && sizes.s < sizes.m);

  // ---------------- A19 등방성
  const anisoSq = await api(page, "(a) => a.anisotropy('s')");
  rec("A19", "1:1+정사각 pxPerMm_x vs pxPerMm_y 차이",
    `${(anisoSq.aniso * 100).toFixed(4)} % (x=${anisoSq.pxPerMm_x.toFixed(4)}, y=${anisoSq.pxPerMm_y.toFixed(4)})`,
    anisoSq.aniso < 0.005);

  // ---------------- A21 gridColsUsed (sq)
  const gridCols = {};
  for (const k of ["xs", "s", "m"]) {
    await api(page, "(a, k) => a.dataURL('total', k)", k);
    const m = await api(page, "(a) => a.meta");
    gridCols["sq/" + k] = m.gridColsUsed;
  }

  // ---------------- A15~A17 (캡처 5회 전후)
  await api(page, "(a) => { ['inc','sc','total','plot'].forEach(k => a.dataURL(k, 's')); a.dataURL('total','m'); }");
  const stateAfter = JSON.stringify(await api(page, "(a) => [a.params(), a.layout()]"));
  const sumAfter = JSON.stringify(await api(page, "(a) => a.gridChecksum(10)"));
  rec("A15", "캡처 5회 전후 상태 불변", stateAfter === stateBefore ? "동일" : "달라짐",
    stateAfter === stateBefore);
  rec("A16", "캡처 구간 recompute 로그 증가", `${recomputeLogs - recomputeBefore} 회`,
    recomputeLogs - recomputeBefore === 0);
  rec("A17", "격자 체크섬(incRe/scRe 앞 10개) 불변", sumAfter === sumBefore ? "동일" : "달라짐",
    sumAfter === sumBefore, sumBefore);

  // ---------------- 샘플 저장 (정사각 12장) — A11 이전에 수행
  console.log("\n--- 샘플 캡처 저장 ---");
  const saved = [];
  async function savePNG(kind, presetKey, viewPreset) {
    const [url, name] = await page.evaluate(([k, p, v]) => {
      const a = window.__captureTool.api();
      const u = a.dataURL(k, p);
      const q = a.params();
      return [u, a.fileName(k, a.meta.W, q.H_mm, q.L_mm, q.lam_cm, q.phaseDeg, v)];
    }, [kind, presetKey, viewPreset]);
    const buf = Buffer.from(url.split(",")[1], "base64");
    fs.writeFileSync(path.join(OUT, name), buf);
    saved.push({ name, kb: Math.round(buf.length / 1024) });
    return name;
  }
  for (const kind of ["inc", "sc", "total", "plot"])
    for (const p of ["xs", "s", "m"]) await savePNG(kind, p, "sq");
  console.log(`정사각 ${saved.length}장 저장`);

  // ---------------- A22 · A21 (구도 프리셋 실측)
  console.log("\n--- 구도 프리셋 실측 ---");
  const bandMeas = [];
  async function measurePreset(key) {
    await page.evaluate((k) => window.__captureTool.applyViewPreset(k), key);
    await waitIdle(page);
    const L = await api(page, "(a) => a.layout()");
    const vp = (await page.evaluate(() => window.__captureTool.presets)).find((p) => p.key === key);
    for (const k of ["xs", "s", "m"]) {
      await api(page, "(a, k) => a.dataURL('total', k)", k);
      const m = await api(page, "(a) => a.meta");
      gridCols[key + "/" + k] = m.gridColsUsed;
    }
    const pm = await api(page, "(a) => { a.dataURL('plot','s'); return a.meta; }");
    bandMeas.push({
      key, iframe: `${vp.w}×${vp.h}`, target: `${vp.targetBand[0]}×${vp.targetBand[1]}`,
      measured: `${L.bandW.toFixed(0)}×${L.bandH1to1.toFixed(0)}`,
      dW: L.bandW - vp.targetBand[0], dH: L.bandH1to1 - vp.targetBand[1],
      yRangeCm: (pm.Yw_m * 100),
    });
    return L;
  }
  await measurePreset("sq");
  await measurePreset("wide");
  await savePNG("total", "s", "wide");
  await savePNG("plot", "s", "wide");
  console.log("와이드 2장 저장");
  await measurePreset("sqtall");
  await measurePreset("sq");
  const okA22 = bandMeas.every((b) => Math.abs(b.dW) <= 2 && Math.abs(b.dH) <= 2);
  rec("A22", "구도 프리셋 밴드 실측 vs 목표 (±2 px)",
    bandMeas.map((b) => `${b.key}: ${b.measured} (목표 ${b.target}, Δ${b.dW}/${b.dH})`).join(" | "), okA22);
  rec("A21", "gridColsUsed (프리셋별)",
    Object.entries(gridCols).map(([k, v]) => `${k}=${v}`).join(", "), null,
    Object.values(gridCols).some((v) => v < 300) ? "300열 미만 있음" : "모두 300열 이상");

  // ---------------- A20 3분할 경고
  console.log("\n--- A20 3분할 경고 ---");
  const warnBefore = warnLogs.length;
  await page.evaluate(() => window.__captureTool.applyCamera("3band"));
  await waitIdle(page);
  const aniso3 = await api(page, "(a) => a.anisotropy('s')");
  await api(page, "(a) => a.dataURL('total','s')");
  const banner = await page.evaluate(() => window.__captureTool.bannerText());
  rec("A20", "3분할 캡처 시 비등방 경고",
    `콘솔경고 ${warnLogs.length - warnBefore}건, 배너 ${banner ? "표시" : "없음"}, `
    + `세로:가로 축척 ×${aniso3.scaleRatio.toFixed(2)} (view.scaleRatio=${aniso3.viewScaleRatio.toFixed(2)})`,
    warnLogs.length - warnBefore > 0 && !!banner && !aniso3.isotropic);
  await page.evaluate(() => window.__captureTool.applyCamera("1to1"));
  await waitIdle(page);

  // ---------------- A11 (마지막) H 150 → 60
  console.log("\n--- A11 H 150→60 mm 재캡처 (recompute 발생, 마지막 순서) ---");
  const w150 = await page.evaluate((u) => window.__t.bandWidth(u, 0.5),
    await api(page, "(a) => a.dataURL('plot','s')"));
  const meta150 = await api(page, "(a) => a.meta");
  await page.evaluate(() => {
    const t = window.__captureTool;
    t.ui.H_mm = 60;
    document.getElementById("hSlider").value = "60";
    document.getElementById("hVal").textContent = "60 mm";
    return t.applyParams();
  });
  await waitIdle(page);
  const w60 = await page.evaluate((u) => window.__t.bandWidth(u, 0.5),
    await api(page, "(a) => a.dataURL('plot','s')"));
  const meta60 = await api(page, "(a) => a.meta");
  // 음영 띠는 |y|≤H/2 이므로 픽셀 폭 비율이 H 비율과 같아야 한다(가로축=위치의 실증).
  // 단, 가로축 범위 base.Yw 자체가 H에 의존하므로 두 캡처의 y범위 차이를 보정한다.
  const ratioRaw = w60 / w150;
  const ratioScaled = (w60 * meta60.Yw_m) / (w150 * meta150.Yw_m);
  rec("A11", "가로축=위치 실증 (음영 띠 폭 비율, H 60/150=0.40)",
    `원시 ${ratioRaw.toFixed(3)} (${w60}/${w150} px), y범위 보정 ${ratioScaled.toFixed(3)}`
    + ` — Yw ${(meta150.Yw_m * 100).toFixed(2)}→${(meta60.Yw_m * 100).toFixed(2)} cm`,
    Math.abs(ratioScaled - 0.4) <= 0.03,
    Math.abs(ratioRaw - 0.4) <= 0.03 ? "" : "원시 비율은 Yw 변화 때문에 0.40이 아님 — 보정값으로 판정");

  // H 복원
  await page.evaluate(() => {
    const t = window.__captureTool;
    t.ui.H_mm = 150;
    document.getElementById("hSlider").value = "150";
    document.getElementById("hVal").textContent = "150 mm";
    return t.applyParams();
  });
  await waitIdle(page);
  const paramsEnd = await api(page, "(a) => a.params()");
  const restored = Math.round(paramsEnd.H_mm) === 150 && paramsEnd.L_mm === 100 && paramsEnd.lam_cm === 12;
  rec("A11b", "A11 이후 H 복원 및 상태 확인",
    `H=${paramsEnd.H_mm.toFixed(0)}mm, L=${paramsEnd.L_mm}mm, λ=${paramsEnd.lam_cm}cm, `
    + `위상=${paramsEnd.phaseDeg.toFixed(0)}°, 재생=${paramsEnd.playing}`, restored);

  // ---------------- A18 자가검증
  rec("A18", "console.assert 실패 · 페이지 에러",
    `단언 실패 ${assertFails.length}건, 에러 ${pageErrors.length}건`,
    assertFails.length === 0 && pageErrors.length === 0,
    notFound.length ? "404: " + [...new Set(notFound)].join(", ") : "404 없음");

  // ---------------- 요약
  console.log("\n=== 요약 ===");
  const fail = results.filter((x) => x.ok === false);
  console.log(`총 ${results.length}항목 · 통과 ${results.filter((x) => x.ok === true).length}`
    + ` · 실패 ${fail.length} · 참고 ${results.filter((x) => x.ok === null).length}`);
  if (fail.length) fail.forEach((f) => console.log("  실패:", f.id, f.item, "→", f.measured));
  console.log("\n샘플 파일:", saved.length, "장");
  saved.forEach((s) => console.log("  " + s.name + "  " + s.kb + "KB"));
  console.log("\n밴드 실측:", JSON.stringify(bandMeas, null, 1));
  console.log("그래프 y범위(cm):", bandMeas.map((b) => `${b.key}=±${b.yRangeCm.toFixed(2)}`).join(", "));
  console.log("용량(KB):", JSON.stringify(Object.fromEntries(
    Object.entries(sizes).map(([k, v]) => [k, Math.round(v / 1024)]))));

  fs.writeFileSync(path.join(OUT, "_acceptance.json"),
    JSON.stringify({ results, bandMeas, gridCols, sizes, saved, notFound: [...new Set(notFound)] }, null, 1));

  await browser.close();
  srv.server.close();
  process.exit(fail.length ? 1 : 0);
})();
