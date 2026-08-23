// C1~C15 — compare-print 축·범례 한/영 전환 수용 기준 검증.
//   node tests/compare-lang-check.js <기준선디렉터리>
// 기준선은 변경 전 커밋 상태에서 tests/compare-lang-baseline.js로 미리 뽑아 둔다(C5).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

const ROOT = path.resolve(__dirname, "..");
const BASE_DIR = process.argv[2];
const BASE = JSON.parse(fs.readFileSync(path.join(BASE_DIR, "baseline.json"), "utf8"));
const OUT = path.join(ROOT, "captures-sample", "compare-lang");
const READY = 180000;
const RES = "2400x1400";
const HANGUL = /[가-힣㄰-㆏ᄀ-ᇿ]/;
const DASHES = /[–—]/;

const rows = [];
function rec(id, name, measured, pass) {
  rows.push({ id: id, name: name, measured: measured, pass: pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + id + "  " + name + "\n      " + measured);
}
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

// ---- 계산 함수 24개(지시서 §1-1)
const CALC = ["besselJ0", "besselY0", "hankel0", "solveComplex", "fresnelCS", "kFactor",
  "totalAmplitude", "fresnelIntensity", "computeDiscretization", "sampleYs_mm",
  "evalFieldsAtPoint", "screenIntensityAt", "shadowFillRatioFromSamples",
  "computeShadowFillRatioMoM", "recomputeMoM", "computeShadowFillRatioHuygens",
  "recomputeHuygens", "fresnelNumber", "logSpace", "sbarPairAt", "findSignChanges",
  "refineCrossing", "findCrossings", "buildSweepCsv"];

function extractFn(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") { depth++; started = true; }
    else if (ch === "}") { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
// 커밋된 blob은 LF, 작업본은 CRLF(autocrlf)이므로 줄바꿈을 맞춘 뒤 해시한다.
function shaSrc(t) {
  const norm = t.split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));
  return crypto.createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 12);
}

// ---- 소스에서 실제 PLOT_LABELS 테이블을 꺼낸다(테스트가 값을 따로 적어 두지 않도록).
function readLabelTable() {
  const src = fs.readFileSync(path.join(ROOT, "compare-print.js"), "utf8");
  const i = src.indexOf("const LABEL_MOM =");
  const j = src.indexOf("function normLang");
  if (i < 0 || j < 0) throw new Error("PLOT_LABELS 블록을 찾지 못함");
  const block = src.slice(i, j);
  return new Function(block + "\nreturn { PLOT_LABELS: PLOT_LABELS, LABEL_MOM: LABEL_MOM, LABEL_HUY: LABEL_HUY };")();
}

async function grabExport(page, buttonId) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: READY }),
    page.click("#" + buttonId),
  ]);
  return { name: download.suggestedFilename(), buf: fs.readFileSync(await download.path()) };
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById("mainCanvas");
    return c && c.width > 0 && document.getElementById("infoBox").textContent.length > 0;
  }, { timeout: READY });
}

function panelTexts(page) {
  return page.evaluate(() => ({
    infoBox: document.getElementById("infoBox").textContent,
    sweepResult: document.getElementById("sweepResult").textContent,
    exportStatus: document.getElementById("exportStatus").textContent,
    hints: Array.from(document.querySelectorAll(".hint")).map((n) => n.textContent).join("|"),
    subs: Array.from(document.querySelectorAll(".sub")).map((n) => n.textContent).join("|"),
    sweepBtn: document.getElementById("sweepBtn").textContent,
  }));
}

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const T = readLabelTable();

  // ---------------- C1 원본 무결성
  const numstat = execSync("git diff --numstat", { cwd: ROOT }).toString().trim();
  const touched = numstat.split("\n").filter(Boolean).map((l) => l.split("\t"));
  const FROZEN = ["index.html", "style.css", "script.js", "capture.js", "capture.html"];
  const bad = touched.filter((t) => FROZEN.indexOf(t[2]) >= 0);
  rec("C1", "index/style/script/capture 무변경",
    "변경 파일: " + touched.map((t) => t[2] + "(+" + t[0] + "/-" + t[1] + ")").join(", "),
    bad.length === 0);

  // ---------------- C2 계산 함수 불변
  const headSrc = execSync("git show HEAD:compare-print.js", { cwd: ROOT, maxBuffer: 8e7 }).toString();
  const curSrc = fs.readFileSync(path.join(ROOT, "compare-print.js"), "utf8");
  const c2 = CALC.map((n) => {
    const a = extractFn(headSrc, n), b = extractFn(curSrc, n);
    return { n: n, ok: !!a && !!b && shaSrc(a) === shaSrc(b), h: a ? shaSrc(a) : "없음" };
  });
  const c2bad = c2.filter((x) => !x.ok);
  rec("C2", "계산 함수 24개 SHA-256 동일(줄바꿈 정규화)",
    "동일 " + (c2.length - c2bad.length) + "/" + c2.length
    + (c2bad.length ? " · 불일치: " + c2bad.map((x) => x.n).join(",") : "")
    + " · 예: besselJ0=" + c2[0].h + ", recomputeMoM="
    + c2.find((x) => x.n === "recomputeMoM").h + ", buildSweepCsv="
    + c2.find((x) => x.n === "buildSweepCsv").h,
    c2bad.length === 0);

  // ---------------- C4 / C15(대시) — 소스 테이블 직접 검사
  const enVals = Object.values(T.PLOT_LABELS.en);
  const enJoined = enVals.join("");
  rec("C4", "영문 라벨에 한글 0자 · 키 8개",
    "키 " + Object.keys(T.PLOT_LABELS.en).length + "개 · 한글 "
    + (enJoined.match(/[가-힣㄰-㆏ᄀ-ᇿ]/g) || []).length + "자 · ko.mom==LABEL_MOM: "
    + (T.PLOT_LABELS.ko.mom === T.LABEL_MOM) + " · en 값: " + enVals.join(" / "),
    !HANGUL.test(enJoined) && Object.keys(T.PLOT_LABELS.en).length === 8
    && T.PLOT_LABELS.ko.mom === T.LABEL_MOM);

  const srv = await start(0);
  const browser = await chromium.launch({ channel: "chrome" });

  // ================= 메인 컨텍스트 =================
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1, acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const assertFails = [], pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "assert" || /Assertion failed/i.test(m.text())) assertFails.push(m.text());
    if (m.type() === "error" && !/404/.test(m.text())) pageErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("http://127.0.0.1:" + srv.port + "/compare-print.html");
  await waitReady(page);
  await page.selectOption("#resSelect", RES);

  // ---------------- C3 기본값
  const c3 = await page.evaluate(() => ({
    checked: document.getElementById("langEnCheck").checked,
    stored: (function () { try { return window.localStorage.getItem("comparePrint.lang"); }
      catch (e) { return "(접근불가)"; } })(),
  }));
  rec("C3", "기본값 ko · 체크박스 해제",
    "#langEnCheck.checked=" + c3.checked + " · localStorage['comparePrint.lang']=" + c3.stored,
    c3.checked === false && c3.stored === null);

  // ---------------- C5 ko 회귀 (메인 3프리셋)
  const presets = [["preset1Btn", "lam2"], ["preset2Btn", "lam5"], ["preset3Btn", "lam20"]];
  const koShots = {};
  const c5main = [];
  for (const pr of presets) {
    await page.click("#" + pr[0]);
    await page.waitForTimeout(1200);
    koShots[pr[1]] = await page.evaluate(() =>
      document.getElementById("mainCanvas").toDataURL("image/png"));
    const g = await grabExport(page, "exportPngBtn");
    const b = BASE.main[pr[1]];
    c5main.push({ key: pr[1], name: g.name, same: sha(g.buf) === b.sha && g.name === b.name,
      bytes: g.buf.length, bbytes: b.bytes });
  }

  // 스윕 실행 후 ko 스윕 PNG
  await page.click("#sweepBtn");
  await page.waitForFunction(() => !document.getElementById("exportSweepPngBtn").disabled,
    { timeout: READY });
  await page.waitForTimeout(500);
  const koSweepShot = await page.evaluate(() =>
    document.getElementById("sweepCanvas").toDataURL("image/png"));
  const gSweepKo = await grabExport(page, "exportSweepPngBtn");
  const c5sweep = { name: gSweepKo.name, same: sha(gSweepKo.buf) === BASE.sweep.sha
    && gSweepKo.name === BASE.sweep.name, bytes: gSweepKo.buf.length };

  rec("C5", "ko PNG 변경 전후 완전 동일(메인 3장 + 스윕 1장)",
    c5main.map((x) => x.key + ":" + (x.same ? "동일" : "다름") + "(" + x.bbytes + "→" + x.bytes + "B)").join(" ")
    + " · sweep:" + (c5sweep.same ? "동일" : "다름") + "(" + BASE.sweep.bytes + "→" + c5sweep.bytes + "B)",
    c5main.every((x) => x.same) && c5sweep.same);

  // ---------------- C9/C14 전 상태 스냅샷
  const panelBefore = await panelTexts(page);
  const csvBefore = await page.evaluate(async () => {
    document.getElementById("csvCopyBtn").click();
    await new Promise((r) => setTimeout(r, 200));
    return navigator.clipboard.readText();
  });

  // ---------------- C8 재계산 없음 (DOM 뮤테이션 프록시 + 시간)
  // compare-print.js에는 테스트 훅이 없어 함수 스파이를 걸 수 없다. recomputeBoth()는
  // 반드시 #infoBox를, runSweep()은 #sweepProgress를 다시 쓰므로 두 노드를 감시하면
  // 세 계산 함수 호출 여부를 빠짐없이 관측할 수 있다.
  await page.evaluate(() => {
    window.__mut = { info: 0, prog: 0 };
    new MutationObserver(() => { window.__mut.info++; })
      .observe(document.getElementById("infoBox"), { childList: true, subtree: true, characterData: true });
    new MutationObserver(() => { window.__mut.prog++; })
      .observe(document.getElementById("sweepProgress"), { childList: true, subtree: true, characterData: true });
  });
  const t0 = Date.now();
  await page.click("#langEnCheck");
  const dtMs = Date.now() - t0;
  await page.waitForTimeout(120);
  const mut = await page.evaluate(() => window.__mut);
  rec("C8", "언어 토글이 재계산을 부르지 않음",
    "#infoBox 변경 " + mut.info + "회 · #sweepProgress 변경 " + mut.prog + "회 · 소요 " + dtMs + "ms",
    mut.info === 0 && mut.prog === 0 && dtMs < 100);

  // ---------------- C14 패널 DOM 불변
  const panelAfter = await panelTexts(page);
  const c14keys = Object.keys(panelBefore);
  const c14diff = c14keys.filter((k) => panelBefore[k] !== panelAfter[k]);
  rec("C14", "패널 DOM 텍스트 한국어 유지",
    "검사 " + c14keys.length + "개 노드군(infoBox/sweepResult/exportStatus/hint/sub/sweepBtn) · 차이 "
    + c14diff.length + "개" + (c14diff.length ? " → " + c14diff.join(",") : "")
    + " · infoBox 앞 40자: \"" + panelAfter.infoBox.slice(0, 40).replace(/\s+/g, " ") + "\"",
    c14diff.length === 0 && HANGUL.test(panelAfter.infoBox));

  // ---------------- C9 스윕 스냅샷 보존
  const csvAfter = await page.evaluate(async () => {
    document.getElementById("csvCopyBtn").click();
    await new Promise((r) => setTimeout(r, 200));
    return navigator.clipboard.readText();
  });
  const enSweepShot = await page.evaluate(() =>
    document.getElementById("sweepCanvas").toDataURL("image/png"));
  rec("C9", "스윕 스냅샷·CSV 불변, 차트만 다시 그려짐",
    "CSV " + (csvBefore === csvAfter ? "동일" : "다름") + "(" + csvBefore.length + "자, "
    + csvBefore.split("\n").length + "행) · 결과 문구 "
    + (panelBefore.sweepResult === panelAfter.sweepResult ? "동일" : "다름")
    + " · 스윕 캔버스 " + (koSweepShot !== enSweepShot ? "다시 그려짐" : "그대로")
    + "(" + koSweepShot.length + "B → " + enSweepShot.length + "B)",
    csvBefore === csvAfter && csvBefore.length > 0
    && panelBefore.sweepResult === panelAfter.sweepResult && koSweepShot !== enSweepShot);

  // ---------------- C6 en 렌더 + 산출 PNG
  const c6 = [];
  for (const pr of presets) {
    await page.click("#" + pr[0]);
    await page.waitForTimeout(1200);
    const shot = await page.evaluate(() =>
      document.getElementById("mainCanvas").toDataURL("image/png"));
    const g = await grabExport(page, "exportPngBtn");
    fs.writeFileSync(path.join(OUT, g.name), g.buf);
    c6.push({ key: pr[1], name: g.name, bytes: g.buf.length,
      koBytes: BASE.main[pr[1]].bytes, diff: shot !== koShots[pr[1]] });
  }
  const gSweepEn = await grabExport(page, "exportSweepPngBtn");
  fs.writeFileSync(path.join(OUT, gSweepEn.name), gSweepEn.buf);
  const canvasSize = await page.evaluate(() => {
    const a = document.getElementById("mainCanvas"), b = document.getElementById("sweepCanvas");
    return { main: a.width + "×" + a.height, sweep: b.width + "×" + b.height };
  });
  rec("C6", "en ≠ ko · 크기 동일",
    c6.map((x) => x.key + ": ko " + x.koBytes + "B → en " + x.bytes + "B "
      + (x.diff ? "(화면도 달라짐)" : "(동일 — 이상)")).join(" · ")
    + " · sweep en " + gSweepEn.buf.length + "B(ko " + BASE.sweep.bytes + "B)"
    + " · 화면 캔버스 main " + canvasSize.main + ", sweep " + canvasSize.sweep
    + " · 저장 해상도 " + RES,
    c6.every((x) => x.diff && x.bytes !== x.koBytes) && gSweepEn.buf.length !== BASE.sweep.bytes);

  // ---------------- C10 파일명
  await page.evaluate(() => {
    const s = document.getElementById("lamSlider");
    s.value = "2.5";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  const gFrac = await grabExport(page, "exportPngBtn");
  const c10ok = c6.every((x) => /_en\.png$/.test(x.name))
    && /_en\.png$/.test(gSweepEn.name)
    && c5main.every((x) => !/_en\.png$/.test(x.name))
    && !/_en\.png$/.test(c5sweep.name)
    && gFrac.name === "diffraction_H100_L300_lam2p5_2400x1400_en.png";
  rec("C10", "en에 _en 접미사 · 소수 λ 표기 유지",
    "en 메인: " + c6.map((x) => x.name).join(", ") + " · en 스윕: " + gSweepEn.name
    + " · ko 메인: " + c5main[0].name + " · ko 스윕: " + c5sweep.name
    + " · λ=2.5 → " + gFrac.name,
    c10ok);

  // ---------------- C7 텍스트 넘침 (두 차트 × lang × fontScale × 해상도)
  const c7 = await page.evaluate((tbl) => {
    const cv = document.createElement("canvas");
    const c = cv.getContext("2d");
    const out = [];
    // drawMainPlot / drawSweepChart와 동일한 여백·폰트 규칙
    const CHART = {
      main: { axis: 20, legend: 18 },
      sweep: { axis: 20, legend: 18 },
    };
    [[1200, 700], [2400, 1400]].forEach((res) => {
      [1.0, 2.0].forEach((fs) => {
        ["ko", "en"].forEach((lang) => {
          const w = res[0], h = res[1];
          const scale = w / 1200;
          const ts = scale * fs;
          const m = { left: 76 * ts, right: 24 * scale, top: 24 * scale, bottom: 58 * ts };
          const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
          const L = tbl[lang];
          ["main", "sweep"].forEach((chart) => {
            const f = CHART[chart];
            c.font = (f.axis * ts) + "px sans-serif";
            const yTitle = (chart === "main") ? L.mainY : L.sweepY;
            const xTitle = (chart === "main") ? L.mainX : L.sweepX;
            const yW = c.measureText(yTitle).width;
            const xW = c.measureText(xTitle).width;
            c.font = (f.legend * ts) + "px sans-serif";
            const legTexts = (chart === "main") ? [L.mom, L.huy] : [L.momSolid, L.huyDashed];
            const legW = Math.max.apply(null, legTexts.map((t) => c.measureText(t).width));
            const legRight = m.left + 50 * ts + legW;
            // 회전된 y축 제목은 (m.top + plotH/2)를 중심으로 그려지며 여백 위로 넘어가도
            // 된다. 실제 잘림 경계는 plotH가 아니라 캔버스 가장자리이므로 둘 다 잰다.
            const yCenter = m.top + plotH / 2;
            const yTop = yCenter - yW / 2, yBot = yCenter + yW / 2;
            out.push({
              chart: chart, lang: lang, fs: fs, res: w + "×" + h,
              yW: yW, plotH: plotH, yFitsPlot: yW <= plotH,
              yMargin: Math.min(yTop, h - yBot), yOk: yTop >= 0 && yBot <= h,
              legRight: legRight, legLimit: m.left + plotW, legOk: legRight <= m.left + plotW,
              xW: xW, xLimit: w - 2 * m.right, xOk: xW <= w - 2 * m.right,
            });
          });
        });
      });
    });
    return out;
  }, T.PLOT_LABELS);

  console.log("\n  C7 텍스트 실측 (px) — y제목은 회전 후 캔버스 가장자리까지의 여유가 잘림 판정 기준");
  console.log("  차트    lang  배율  해상도      y제목폭  캔버스여유  (plotH대비)  범례우끝/한계     x제목폭/한계");
  c7.forEach((r) => console.log("  " + r.chart.padEnd(6) + "  " + r.lang.padEnd(4) + "  "
    + r.fs.toFixed(1) + "  " + r.res.padEnd(10) + "  "
    + r.yW.toFixed(0).padEnd(7) + " " + (r.yMargin.toFixed(0) + "px").padEnd(8)
    + (r.yOk ? "OK  " : "잘림") + "  " + (r.yFitsPlot ? "박스내  " : "박스밖  ") + "   "
    + (r.legRight.toFixed(0) + "/" + r.legLimit.toFixed(0)).padEnd(12) + (r.legOk ? "OK" : "넘침")
    + "  " + (r.xW.toFixed(0) + "/" + r.xLimit.toFixed(0)).padEnd(12) + (r.xOk ? "OK" : "넘침")));
  const c7bad = c7.filter((r) => !(r.yOk && r.legOk && r.xOk));
  const c7outside = c7.filter((r) => !r.yFitsPlot);
  rec("C7", "16조합(2차트×2언어×2배율×2해상도) 잘림 없음",
    "잘림 " + c7bad.length + "건"
    + (c7bad.length ? " → " + c7bad.map((r) => r.chart + "/" + r.lang + "/×" + r.fs + "/" + r.res).join(", ") : "")
    + " · 최악 여유: y제목 " + Math.min.apply(null, c7.map((r) => r.yMargin)).toFixed(0)
    + "px, 범례 " + Math.min.apply(null, c7.map((r) => r.legLimit - r.legRight)).toFixed(0)
    + "px, x제목 " + Math.min.apply(null, c7.map((r) => r.xLimit - r.xW)).toFixed(0) + "px"
    + " · 참고: y제목이 플롯 박스 높이를 넘는 조합 " + c7outside.length + "건(여백 위로 그려지므로 잘림 아님)",
    c7bad.length === 0);

  // ---------------- C15 글리프 렌더
  const c15 = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    const c = cv.getContext("2d");
    c.font = "40px sans-serif";
    const tofu = c.measureText("").width;   // 사용자 정의 영역 = 반드시 대체 글리프
    const chars = { "Ī(U+012A)": "Ī", "ₛ(U+209B)": "ₛ", "₀(U+2080)": "₀", "λ(U+03BB)": "λ" };
    const r = {};
    Object.keys(chars).forEach((k) => {
      const wd = c.measureText(chars[k]).width;
      r[k] = { w: wd, ok: wd > 0 && Math.abs(wd - tofu) > 0.5 };
    });
    return { tofu: tofu, chars: r };
  });
  const c15ok = Object.keys(c15.chars).every((k) => c15.chars[k].ok) && !DASHES.test(enJoined);
  rec("C15", "특수 글리프 렌더 · en에 en/em dash 없음",
    "대체글리프(U+E000) 폭 " + c15.tofu.toFixed(1) + "px 대비 — "
    + Object.keys(c15.chars).map((k) => k + " " + c15.chars[k].w.toFixed(1) + "px"
      + (c15.chars[k].ok ? "" : "(두부 의심)")).join(", ")
    + " · U+2013/2014 " + (enJoined.match(/[–—]/g) || []).length + "자",
    c15ok);

  // ---------------- C12 지속성
  const storedEn = await page.evaluate(() => window.localStorage.getItem("comparePrint.lang"));
  await page.reload();
  await waitReady(page);
  const c12 = await page.evaluate(() => document.getElementById("langEnCheck").checked);
  await page.selectOption("#resSelect", RES);
  await page.click("#preset1Btn");
  await page.waitForTimeout(1200);
  const gAfterReload = await grabExport(page, "exportPngBtn");
  rec("C12", "en 저장 → 새로고침 후 복원",
    "localStorage='" + storedEn + "' · 새로고침 후 checked=" + c12
    + " · 저장 파일명 " + gAfterReload.name
    + " · 바이트 " + gAfterReload.buf.length + "B(ko 기준 " + BASE.main.lam2.bytes + "B)",
    storedEn === "en" && c12 === true && /_en\.png$/.test(gAfterReload.name)
    && sha(gAfterReload.buf) !== BASE.main.lam2.sha);

  rec("C11-a", "콘솔 assert 실패·페이지 오류 0건",
    "assert 실패 " + assertFails.length + "건 · 페이지 오류 " + pageErrors.length + "건 "
    + pageErrors.slice(0, 2).join(" | "),
    assertFails.length === 0 && pageErrors.length === 0);

  await ctx.close();

  // ================= C13 URL 우선 =================
  const ctx3 = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page3 = await ctx3.newPage();
  await page3.goto("http://127.0.0.1:" + srv.port + "/compare-print.html");
  await waitReady(page3);
  await page3.evaluate(() => window.localStorage.setItem("comparePrint.lang", "ko"));
  await page3.goto("http://127.0.0.1:" + srv.port + "/compare-print.html?lang=en");
  await waitReady(page3);
  const urlEn = await page3.evaluate(() => document.getElementById("langEnCheck").checked);
  await page3.goto("http://127.0.0.1:" + srv.port + "/compare-print.html?lang=zz");
  await waitReady(page3);
  const urlZz = await page3.evaluate(() => document.getElementById("langEnCheck").checked);
  await page3.evaluate(() => window.localStorage.setItem("comparePrint.lang", "en"));
  await page3.goto("http://127.0.0.1:" + srv.port + "/compare-print.html?lang=ko");
  await waitReady(page3);
  const urlKoOverride = await page3.evaluate(() => document.getElementById("langEnCheck").checked);
  rec("C13", "?lang이 저장값보다 우선 · 잘못된 값은 ko",
    "저장 ko + ?lang=en → checked=" + urlEn + " · ?lang=zz → checked=" + urlZz
    + " · 저장 en + ?lang=ko → checked=" + urlKoOverride,
    urlEn === true && urlZz === false && urlKoOverride === false);
  await ctx3.close();

  // ================= C11 저장소 예외 =================
  const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errs2 = [];
  await ctx2.addInitScript(() => {
    const boom = () => { throw new Error("localStorage 차단(테스트 스텁)"); };
    try {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: function () { return { getItem: boom, setItem: boom, removeItem: boom }; },
      });
    } catch (e) { /* 무시 */ }
  });
  const page2 = await ctx2.newPage();
  page2.on("pageerror", (e) => errs2.push(String(e)));
  page2.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs2.push(m.text()); });
  await page2.goto("http://127.0.0.1:" + srv.port + "/compare-print.html");
  let bootOk = true;
  try { await waitReady(page2); } catch (e) { bootOk = false; }
  const c11 = await page2.evaluate(() => ({
    checked: document.getElementById("langEnCheck").checked,
    info: document.getElementById("infoBox").textContent.length,
  })).catch(() => ({ checked: "?", info: 0 }));
  // 토글도 예외 없이 동작해야 한다(saveLang의 try/catch)
  let toggleOk = true;
  try { await page2.click("#langEnCheck"); await page2.waitForTimeout(200); }
  catch (e) { toggleOk = false; }
  const c11after = await page2.evaluate(() => document.getElementById("langEnCheck").checked);
  rec("C11", "localStorage throw 시에도 부팅·토글 성공",
    "부팅 " + (bootOk ? "성공" : "실패") + " · 초기 checked=" + c11.checked
    + " · infoBox " + c11.info + "자 · 토글 후 checked=" + c11after
    + " · 미처리 오류 " + errs2.length + "건 " + errs2.slice(0, 2).join(" | "),
    bootOk && c11.checked === false && c11.info > 0 && toggleOk && c11after === true
    && errs2.length === 0);

  await ctx2.close();
  await browser.close();

  console.log("\n  산출 PNG: captures-sample/compare-lang/");
  fs.readdirSync(OUT).forEach((f) =>
    console.log("    " + f + "  " + (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + "KB"));

  console.log("\n=== 요약 ===");
  rows.forEach((r) => console.log((r.pass ? "PASS" : "FAIL") + "  " + r.id + "  " + r.name));
  const failed = rows.filter((r) => !r.pass);
  console.log("\n" + rows.length + "개 중 통과 " + (rows.length - failed.length)
    + " / 실패 " + failed.length);
  process.exit(failed.length ? 1 : 0);
})();
