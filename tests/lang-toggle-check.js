// L1~L14 — 그래프 축 이름 한/영 전환 수용 기준 검증.
//   node tests/lang-toggle-check.js <기준선JSON>
// 기준선은 변경 전 커밋 상태에서 tests/lang-baseline.js로 미리 뽑아 둔다(L5).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "captures-sample", "lang");
const BASE = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const READY = 120000;
const HANGUL = /[가-힣㄰-㆏ᄀ-ᇿ]/;

const rows = [];
function rec(id, name, measured, pass) {
  rows.push({ id: id, name: name, measured: measured, pass: pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + id + "  " + name + "\n      " + measured);
}

// ---- L2: 물리 엔진 함수 7개를 소스에서 잘라내 해시 비교
const PHYS = ["besselJ0", "besselY0", "hankel0", "solveComplex", "evalFields",
  "screenIntensity", "recompute"];
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
// 커밋된 blob은 LF, 작업본은 CRLF(autocrlf)라 줄바꿈을 맞춘 뒤 해시한다.
function sha(t) {
  const norm = t.split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));
  return crypto.createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 12);
}

function api(page, fn, arg) {
  return page.evaluate(new Function("arg",
    "const a = window.__captureTool.api(); return (" + fn + ")(a, arg);"), arg);
}
async function waitBoot(page) {
  await page.waitForFunction(() => window.__captureTool && window.__captureTool.ready(), { timeout: READY });
  await page.waitForFunction(() => !document.getElementById("busy").classList.contains("show"), { timeout: READY });
  await page.waitForTimeout(200);
}

(async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // ---------------- L1 원본 무결성
  const numstat = execSync("git diff --numstat", { cwd: ROOT }).toString().trim();
  const touched = numstat.split("\n").filter(Boolean).map((l) => l.split("\t"));
  const bad = touched.filter((t) => t[2] === "index.html" || t[2] === "style.css");
  rec("L1", "index.html·style.css 무변경",
    "변경 파일: " + touched.map((t) => t[2] + "(+" + t[0] + "/-" + t[1] + ")").join(", "),
    bad.length === 0);

  // ---------------- L2 물리 함수 불변
  const headSrc = execSync("git show HEAD:script.js", { cwd: ROOT, maxBuffer: 8e7 }).toString();
  const curSrc = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
  const l2 = PHYS.map((n) => {
    const a = extractFn(headSrc, n), b = extractFn(curSrc, n);
    return { n: n, ok: !!a && !!b && sha(a) === sha(b), h: a ? sha(a) : "없음" };
  });
  rec("L2", "물리 함수 7개 SHA-256 동일",
    l2.map((x) => x.n + ":" + x.h + (x.ok ? "=" : "≠")).join(" "),
    l2.every((x) => x.ok));

  const srv = await start(0);
  const browser = await chromium.launch({ channel: "chrome" });

  // ================= 메인 컨텍스트 (빈 저장소) =================
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let recomputeLogs = 0; const assertFails = []; const pageErrors = [];
  page.on("console", (m) => {
    const t = m.text();
    if (t.indexOf("[성능] recompute()") >= 0) recomputeLogs++;
    if (m.type() === "assert" || /Assertion failed/i.test(t)) assertFails.push(t);
    if (m.type() === "error" && !/404/.test(t)) pageErrors.push(t);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("http://127.0.0.1:" + srv.port + "/capture.html");
  await waitBoot(page);

  // ---------------- L3 기본값
  const l3 = await page.evaluate(() => ({
    lang: window.__capture.options.lang,
    checked: document.getElementById("capLangEn").checked,
    uiLang: window.__captureTool.ui.lang,
  }));
  rec("L3", "기본값 ko · 체크박스 해제",
    "options.lang='" + l3.lang + "' · #capLangEn.checked=" + l3.checked + " · ui.lang='" + l3.uiLang + "'",
    l3.lang === "ko" && l3.checked === false && l3.uiLang === "ko");

  // ---------------- L4 영문 라벨에 한글 없음
  const labs = await page.evaluate(() => ({
    en: window.__capture.labels("en"),
    ko: window.__capture.labels("ko"),
    zz: window.__capture.labels("zz"),
  }));
  const zzFallback = JSON.stringify(labs.zz) === JSON.stringify(labs.ko);
  rec("L4", "labels('en')에 한글 없음",
    "en.xName=\"" + labs.en.xName + "\" · en.yName=\"" + labs.en.yName
    + "\" · labels('zz')=" + (zzFallback ? "ko 폴백" : "폴백 실패"),
    !HANGUL.test(labs.en.xName + labs.en.yName) && zzFallback);

  // ---------------- L9 재계산 없음 (측정 시작)
  const sumBefore = JSON.stringify(await api(page, "(a) => a.gridChecksum(10)"));
  const layBefore = JSON.stringify(await api(page, "(a) => a.layout()"));
  const parBefore = JSON.stringify(await api(page, "(a) => a.params()"));
  const recBefore = recomputeLogs;
  const liveBefore = await page.evaluate(() => document.getElementById("canvas").toDataURL("image/png"));

  // ---------------- L5 ko 회귀 (변경 전 dataURL과 문자열 완전 동일)
  const koNow = await page.evaluate(() => {
    const a = window.__capture, r = { urls: {}, metas: {} };
    ["plot", "inc", "sc", "total"].forEach((k) => {
      r.urls[k] = a.dataURL(k, "xs");
      r.metas[k] = JSON.parse(JSON.stringify(a.meta));
    });
    return r;
  });
  const kinds = ["plot", "inc", "sc", "total"];
  const l5 = kinds.map((k) => ({
    k: k, same: koNow.urls[k] === BASE.urls[k],
    len: koNow.urls[k].length, blen: BASE.urls[k].length,
  }));
  rec("L5", "ko dataURL 변경 전후 완전 동일",
    l5.map((x) => x.k + ":" + (x.same ? "동일" : "다름") + "(" + x.blen + "→" + x.len + "B)").join(" "),
    l5.every((x) => x.same));

  const metaKo = koNow.metas.plot;

  // ---------------- 언어 전환 (여기서 시간 측정)
  const t0 = Date.now();
  await page.evaluate(() => window.__captureTool.applyLang("en", false));
  const dtMs = Date.now() - t0;

  const enURL = await page.evaluate(() => window.__capture.dataURL("plot", "xs"));
  const metaEn = await page.evaluate(() => JSON.parse(JSON.stringify(window.__capture.meta)));

  // ---------------- L6 en 렌더
  rec("L6", "en ≠ ko · 크기 동일 · meta.lang='en'",
    "ko길이=" + koNow.urls.plot.length + "B en길이=" + enURL.length
    + "B · ko " + metaKo.W + "×" + metaKo.H + " / en " + metaEn.W + "×" + metaEn.H
    + " · meta.lang='" + metaEn.lang + "'(ko쪽 '" + metaKo.lang + "')",
    enURL !== koNow.urls.plot && metaEn.W === metaKo.W && metaEn.H === metaKo.H
    && metaEn.lang === "en" && metaKo.lang === "ko");

  // ---------------- L9 재계산 없음 (측정 종료)
  const sumAfter = JSON.stringify(await api(page, "(a) => a.gridChecksum(10)"));
  const layAfter = JSON.stringify(await api(page, "(a) => a.layout()"));
  const parAfter = JSON.stringify(await api(page, "(a) => a.params()"));
  rec("L9", "applyLang이 상태를 바꾸지 않음",
    "gridChecksum " + (sumBefore === sumAfter ? "동일" : "변함")
    + " · layout " + (layBefore === layAfter ? "동일" : "변함")
    + " · params " + (parBefore === parAfter ? "동일" : "변함")
    + " · " + dtMs + "ms · recompute 로그 " + (recomputeLogs - recBefore) + "건",
    sumBefore === sumAfter && layBefore === layAfter && parBefore === parAfter
    && dtMs < 300 && recomputeLogs === recBefore);

  // ---------------- L14 라이브 화면 불변
  const liveAfter = await page.evaluate(() => document.getElementById("canvas").toDataURL("image/png"));
  rec("L14", "라이브 캔버스 픽셀 동일",
    "길이 " + liveBefore.length + "B → " + liveAfter.length + "B · "
    + (liveBefore === liveAfter ? "완전 동일" : "다름"),
    liveBefore === liveAfter);

  // ---------------- L7 레이아웃 건전성 (현재 en 상태)
  const l7 = await page.evaluate(() => {
    const a = window.__capture, m = a.meta;
    const cw = m.W;
    const pad = Math.round(6 * (cw / 1000) * a.options.fontScale);
    const cv = document.createElement("canvas");
    const c = cv.getContext("2d");
    c.font = m.axisPx + "px sans-serif";
    const L = a.labels(m.lang);
    return {
      box: m.box, cw: cw, pad: pad, avail: cw - 2 * pad,
      xNameW: c.measureText(L.xName + " (" + m.unit + ")").width,
      yNameW: c.measureText(L.yName).width,
    };
  });
  const fracDiff = Math.abs(metaEn.plotAreaFrac - metaKo.plotAreaFrac);
  rec("L7", "en 박스 건전 · x축 이름 폭 ≤ cw−2·pad · 플롯 영역 차이",
    "box=" + JSON.stringify(l7.box) + " (l<r:" + (l7.box.l < l7.box.r) + ", t<b:" + (l7.box.t < l7.box.b) + ")"
    + " · xName폭 " + l7.xNameW.toFixed(1) + "px ≤ " + l7.avail + "px"
    + " · plotAreaFrac ko=" + metaKo.plotAreaFrac.toFixed(4) + " en=" + metaEn.plotAreaFrac.toFixed(4)
    + " 차이=" + fracDiff.toFixed(4)
    + " · box.l ko=" + metaKo.box.l + " en=" + metaEn.box.l,
    l7.box.l < l7.box.r && l7.box.t < l7.box.b && l7.xNameW <= l7.avail && fracDiff <= 0.10);

  // ---------------- L8 배율 × 언어 6조합
  const combos = [];
  const scales = [0.8, 1.5, 3.0];
  for (let i = 0; i < scales.length; i++) {
    for (const lg of ["ko", "en"]) {
      const r = await page.evaluate((arg) => {
        const a = window.__capture;
        a.options.fontScale = arg[0]; a.options.lang = arg[1];
        try {
          const u = a.dataURL("plot", "xs");
          const m = a.meta;
          return { ok: true, len: u.length, tickPx: m.tickPx, axisPx: m.axisPx,
            frac: m.plotAreaFrac, warn: !!m.boxWarn, lang: m.lang };
        } catch (e) { return { ok: false, err: String(e) }; }
      }, [scales[i], lg]);
      r.fs = scales[i]; r.lang = lg;
      combos.push(r);
    }
  }
  console.log("\n  배율×언어 표");
  console.log("  fontScale  lang  tickPx  axisPx  plotAreaFrac  boxWarn");
  combos.forEach((c) => console.log("  " + String(c.fs).padEnd(9) + "  " + c.lang.padEnd(4)
    + "  " + String(c.tickPx).padEnd(6) + "  " + String(c.axisPx).padEnd(6)
    + "  " + (c.frac !== undefined ? c.frac.toFixed(4) : "-").padEnd(12) + "  " + c.warn));
  rec("L8", "배율×언어 6조합 예외 없음",
    combos.map((c) => c.fs + "/" + c.lang + ":" + (c.ok ? "ok" : "예외 " + c.err)).join(" "),
    combos.every((c) => c.ok));

  // 배율 복원
  await page.evaluate(() => { window.__capture.options.fontScale = 1.5; });

  // ---------------- L10 단위 조합
  const l10 = await page.evaluate(() => {
    const a = window.__capture;
    a.options.lang = "en"; a.options.unit = "mm";
    a.dataURL("plot", "xs");
    const m = a.meta;
    const built = a.labels(m.lang).xName + " (" + a.options.unit + ")";
    a.options.unit = "cm";               // 원복
    a.dataURL("plot", "xs");
    const m2 = a.meta;
    return { built: built, unitMm: m.unit, unitCm: m2.unit,
      builtCm: a.labels("en").xName + " (" + a.options.unit + ")" };
  });
  rec("L10", "unit='mm'에서 en x축 조립",
    "\"" + l10.built + "\" (meta.unit='" + l10.unitMm + "') · 원복 후 \""
    + l10.builtCm + "\" (meta.unit='" + l10.unitCm + "')",
    l10.built === "Position on screen y (mm)" && l10.unitMm === "mm"
    && l10.builtCm === "Position on screen y (cm)" && l10.unitCm === "cm");

  // ---------------- L11 파일명
  const l11 = await page.evaluate(() => {
    const f = window.__capture.fileName;
    return {
      plotEn: f("plot", 1200, 150, 100, 12, 0, "sq", "en"),
      plotKo: f("plot", 1200, 150, 100, 12, 0, "sq", "ko"),
      plotUndef: f("plot", 1200, 150, 100, 12, 0, "sq"),
      total: f("total", 1200, 150, 100, 12, 0, "sq", "en"),
      inc: f("inc", 1200, 150, 100, 12, 0, "sq", "en"),
      sc: f("sc", 1200, 150, 100, 12, 0, "sq", "en"),
    };
  });
  const l11ok = l11.plotEn === "diff_plot_H150mm_L100mm_lam12cm_ph000_w1200_sq_en.png"
    && l11.plotKo === "diff_plot_H150mm_L100mm_lam12cm_ph000_w1200_sq.png"
    && l11.plotUndef === l11.plotKo
    && !/_en\.png$/.test(l11.total) && !/_en\.png$/.test(l11.inc) && !/_en\.png$/.test(l11.sc)
    && assertFails.length === 0;
  rec("L11", "파일명 _en · selfCheck assert 실패 0",
    "plot/en=" + l11.plotEn + " · plot/ko=" + l11.plotKo
    + " · lang생략=" + (l11.plotUndef === l11.plotKo ? "ko와 동일" : "다름")
    + " · total/en=" + l11.total + " · inc/en=" + l11.inc + " · sc/en=" + l11.sc
    + " · assert 실패 " + assertFails.length + "건 · 페이지 오류 " + pageErrors.length + "건",
    l11ok);

  // ---------------- 산출물: ko/en PNG (preset s)
  for (const lg of ["ko", "en"]) {
    const u = await page.evaluate((l) => {
      window.__capture.options.lang = l;
      return window.__capture.dataURL("plot", "s");
    }, lg);
    const m = await page.evaluate(() => JSON.parse(JSON.stringify(window.__capture.meta)));
    const name = await page.evaluate((l) =>
      window.__capture.fileName("plot", 1200, 150, 100, 12, 0, "sq", l), lg);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(u.slice(u.indexOf(",") + 1), "base64"));
    console.log("\n  저장: captures-sample/lang/" + name + "  " + m.W + "×" + m.H
      + " box=" + JSON.stringify(m.box) + " frac=" + m.plotAreaFrac.toFixed(4));
  }

  // ---------------- L13 지속성 (체크박스 → 새로고침)
  await page.evaluate(() => {
    const el = document.getElementById("capLangEn");
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const stored = await page.evaluate(() => window.localStorage.getItem("capture.lang"));
  await page.reload();
  await waitBoot(page);
  const l13 = await page.evaluate(() => ({
    checked: document.getElementById("capLangEn").checked,
    lang: window.__capture.options.lang,
    info: document.getElementById("plotPreviewInfo").textContent,
  }));
  const l13prev = await page.evaluate(() => {
    const a = window.__capture; a.dataURL("plot", "xs");
    return { metaLang: a.meta.lang, x: a.labels(a.meta.lang).xName };
  });
  rec("L13", "en 저장 → 새로고침 후 복원",
    "localStorage['capture.lang']='" + stored + "' · 새로고침 후 checked=" + l13.checked
    + " · options.lang='" + l13.lang + "' · 미리보기 meta.lang='" + l13prev.metaLang
    + "' x축=\"" + l13prev.x + "\" · 안내문 \"" + l13.info + "\"",
    stored === "en" && l13.checked === true && l13.lang === "en"
    && l13prev.metaLang === "en" && !HANGUL.test(l13prev.x));

  await ctx.close();

  // ================= L12 저장소 예외 컨텍스트 =================
  const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
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
  await page2.goto("http://127.0.0.1:" + srv.port + "/capture.html");
  let bootOk = true;
  try { await waitBoot(page2); } catch (e) { bootOk = false; }
  const l12 = await page2.evaluate(() => ({
    lang: window.__capture.options.lang,
    fontScale: window.__capture.options.fontScale,
    checked: document.getElementById("capLangEn").checked,
  })).catch(() => ({ lang: "?", fontScale: "?", checked: "?" }));
  rec("L12", "localStorage throw 시에도 부팅",
    "부팅 " + (bootOk ? "성공" : "실패") + " · lang='" + l12.lang + "' · fontScale=" + l12.fontScale
    + " · checked=" + l12.checked + " · 미처리 오류 " + errs2.length + "건 "
    + errs2.slice(0, 2).join(" | "),
    bootOk && l12.lang === "ko" && l12.checked === false && errs2.length === 0);

  await ctx2.close();
  await browser.close();

  console.log("\n=== 요약 ===");
  rows.forEach((r) => console.log((r.pass ? "PASS" : "FAIL") + "  " + r.id + "  " + r.name));
  const failed = rows.filter((r) => !r.pass);
  console.log("\n" + rows.length + "개 중 통과 " + (rows.length - failed.length)
    + " / 실패 " + failed.length);
  process.exit(failed.length ? 1 : 0);
})();
