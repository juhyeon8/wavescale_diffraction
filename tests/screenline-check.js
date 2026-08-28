// §37 스크린 위치선 강조 — 수용 기준 E1~E14 검증.
//   node tests/screenline-check.js <baseline.json> [PNG출력폴더]
// 기준 조건: H=150mm, L=100mm, λ=12cm, 위상 0°, 카메라 1:1, 구도 정사각, 프리셋 s
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const { start } = require("./static-server.js");

const BASELINE = process.argv[2];
const OUTDIR = process.argv[3] || null;
const READY = 120000;
const ROOT = path.resolve(__dirname, "..");

const results = [];
function report(id, item, pass, detail) {
  results.push({ id: id, item: item, pass: pass, detail: detail });
  console.log((pass ? "PASS" : "FAIL") + "  " + id + "  " + item + " — " + detail);
}

// ---------------------------------------------------------------- E1 / E2 (git)
function checkGit() {
  const numstat = execSync("git diff --numstat -- index.html style.css", { cwd: ROOT }).toString().trim();
  report("E1", "원본 무결성", numstat === "",
    numstat === "" ? "index.html·style.css 변경 0줄(diff 비어 있음)" : "변경 감지: " + numstat);

  const head = execSync("git show HEAD:script.js", { cwd: ROOT, maxBuffer: 1 << 26 }).toString();
  const cur = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
  const names = ["besselJ0", "besselY0", "hankel0", "solveComplex", "evalFields",
    "screenIntensity", "recompute"];
  // autocrlf 때문에 원문 그대로 해시하면 거짓 실패 — 줄바꿈을 정규화한 뒤 중괄호 균형으로
  // 함수 본문을 잘라 해시한다.
  function bodyOf(src, name) {
    const norm = src.replace(/\r\n/g, "\n");
    const i = norm.indexOf("function " + name + "(");
    if (i < 0) return null;
    let depth = 0, k = norm.indexOf("{", i);
    for (; k < norm.length; k++) {
      if (norm[k] === "{") depth++;
      else if (norm[k] === "}") { depth--; if (depth === 0) { k++; break; } }
    }
    return norm.slice(i, k);
  }
  const rows = names.map(function (n) {
    const a = bodyOf(head, n), b = bodyOf(cur, n);
    const ha = a === null ? "(없음)" : crypto.createHash("sha256").update(a).digest("hex").slice(0, 12);
    const hb = b === null ? "(없음)" : crypto.createHash("sha256").update(b).digest("hex").slice(0, 12);
    return { n: n, ha: ha, hb: hb, same: a !== null && ha === hb };
  });
  rows.forEach(function (r) { console.log("       " + r.n + ": HEAD " + r.ha + " / 현재 " + r.hb); });
  const bad = rows.filter(function (r) { return !r.same; });
  report("E2", "물리 함수 불변", bad.length === 0,
    bad.length === 0 ? "7개 함수 SHA-256 전부 동일" : "불일치: " + bad.map(function (r) { return r.n; }).join(", "));
}

// ---------------------------------------------------------------- 페이지 헬퍼
async function bootPage(ctx, opts) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", function (e) { errors.push(String(e)); });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  await page.goto(opts.url);
  await page.waitForFunction(function () {
    return window.__captureTool && window.__captureTool.ready();
  }, { timeout: READY });
  await page.waitForFunction(function () {
    return !document.getElementById("busy").classList.contains("show");
  }, { timeout: READY });
  await page.waitForTimeout(200);
  await page.evaluate(function () { window.__captureTool.applyFontScale(1.5, false); });
  return { page: page, errors: errors };
}

// 브라우저 안에서 쓰는 유틸 — dataURL을 캔버스에 그려 픽셀을 읽는다.
function pageUtils() {
  window.__t = {
    grab: function (emph, screenLine) {
      const a = window.__captureTool.api();
      window.__captureTool.applyOptions();
      a.options.screenLine = screenLine;
      a.options.screenLineEmph = emph;
      const out = { urls: {}, metas: {} };
      ['inc', 'sc', 'total'].forEach(function (k) {
        out.urls[k] = a.dataURL(k, 's');
        out.metas[k] = JSON.parse(JSON.stringify(a.meta));
      });
      a.options.screenLine = true;
      a.options.screenLineEmph = window.__captureTool.ui.screenLineEmph;
      return out;
    },
    pixels: function (url) {
      return new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () {
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const c = cv.getContext('2d');
          c.drawImage(img, 0, 0);
          const d = c.getImageData(0, 0, cv.width, cv.height);
          resolve({ w: cv.width, h: cv.height, data: d.data });
        };
        img.onerror = reject;
        img.src = url;
      });
    },
  };
}

// 두 이미지의 스크린선 ±band 열에서 RGB 절대차 합 + 차이가 난 열 범위(footprint)
async function bandDiff(page, urlA, urlB, lineX, band) {
  return await page.evaluate(async function (args) {
    const A = await window.__t.pixels(args.urlA);
    const B = await window.__t.pixels(args.urlB);
    const x0 = Math.max(0, Math.floor(args.lineX - args.band));
    const x1 = Math.min(A.w - 1, Math.ceil(args.lineX + args.band));
    let sum = 0, minX = -1, maxX = -1, cols = 0;
    for (let x = x0; x <= x1; x++) {
      let colDiff = 0;
      for (let y = 0; y < A.h; y++) {
        const i = (y * A.w + x) * 4;
        colDiff += Math.abs(A.data[i] - B.data[i])
          + Math.abs(A.data[i + 1] - B.data[i + 1])
          + Math.abs(A.data[i + 2] - B.data[i + 2]);
      }
      sum += colDiff;
      if (colDiff > 0) { cols++; if (minX < 0) minX = x; maxX = x; }
    }
    return { sum: sum, cols: cols, minX: minX, maxX: maxX,
      footprint: (minX < 0 ? 0 : maxX - minX + 1), w: A.w, h: A.h };
  }, { urlA: urlA, urlB: urlB, lineX: lineX, band: band });
}

function saveURL(dir, name, dataURL) {
  const buf = Buffer.from(dataURL.slice(dataURL.indexOf(",") + 1), "base64");
  fs.writeFileSync(path.join(dir, name), buf);
  return buf.length;
}

(async function main() {
  checkGit();

  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const srv = await start(0);
  const url = "http://127.0.0.1:" + srv.port + "/capture.html";
  const browser = await chromium.launch({ channel: "chrome" });
  const VP = { viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 };

  // ---------- 기본 컨텍스트 (빈 저장소)
  const ctx = await browser.newContext(VP);
  const boot = await bootPage(ctx, { url: url });
  const page = boot.page, errors = boot.errors;
  await page.evaluate(pageUtils);

  // E3 기본값
  const e3 = await page.evaluate(function () {
    return {
      opt: window.__captureTool.api().options.screenLineEmph,
      ui: window.__captureTool.ui.screenLineEmph,
      active: Array.prototype.slice.call(document.querySelectorAll("#screenEmphButtons button"))
        .filter(function (b) { return b.classList.contains("active"); })
        .map(function (b) { return b.dataset.emph; }),
    };
  });
  report("E3", "기본값", e3.opt === 'normal' && e3.ui === 'normal'
    && e3.active.length === 1 && e3.active[0] === 'normal',
    "options=" + e3.opt + ", ui=" + e3.ui + ", active=[" + e3.active.join(",") + "]");

  // 캡처 3종 × 3단계 + screenLine=false
  const shots = {};
  for (const emph of ['normal', 'strong', 'max']) {
    shots[emph] = await page.evaluate(function (e) { return window.__t.grab(e, true); }, emph);
  }
  const off = await page.evaluate(function () { return window.__t.grab('normal', false); });
  const offStrong = await page.evaluate(function () { return window.__t.grab('strong', false); });
  const offMax = await page.evaluate(function () { return window.__t.grab('max', false); });
  const zz = await page.evaluate(function () { return window.__t.grab('zz', true); });

  // E4 폴백
  const e4same = ['inc', 'sc', 'total'].every(function (k) { return zz.urls[k] === shots.normal.urls[k]; });
  report("E4", "폴백", e4same && errors.length === 0,
    "'zz' 캡처 3종이 normal과 동일=" + e4same + ", 미처리 예외=" + errors.length
    + ", meta.screenLineEmph=" + zz.metas.inc.screenLineEmph);

  // E5 기본값 회귀
  const e5 = ['inc', 'sc', 'total'].map(function (k) {
    return [k, shots.normal.urls[k] === base.urls[k]];
  });
  const plotNow = await page.evaluate(function () {
    return window.__captureTool.api().dataURL('plot', 's');
  });
  e5.push(['plot', plotNow === base.urls.plot]);
  report("E5", "기본값 회귀", e5.every(function (r) { return r[1]; }),
    e5.map(function (r) { return r[0] + "=" + (r[1] ? "동일" : "다름"); }).join(", ")
    + " (기준선 dataURL 길이 " + ['inc', 'sc', 'total', 'plot'].map(function (k) {
      return k + " " + base.urls[k].length;
    }).join(", ") + ")");

  // E6 단계 구분
  const e6diff = ['inc', 'sc', 'total'].every(function (k) {
    return shots.normal.urls[k] !== shots.strong.urls[k]
      && shots.strong.urls[k] !== shots.max.urls[k]
      && shots.normal.urls[k] !== shots.max.urls[k];
  });
  const sizes = ['normal', 'strong', 'max'].map(function (e) {
    return shots[e].metas.total.W + "×" + shots[e].metas.total.H;
  });
  const e6size = sizes.every(function (s) { return s === sizes[0]; });
  report("E6", "단계 구분", e6diff && e6size,
    "3단계 dataURL 상이=" + e6diff + ", 캔버스 크기 " + sizes.join(" / "));

  // E7 가시성 정량 — screenLine=false 대비 스크린선 ±20px 띠의 RGB 절대차 합
  const m = shots.normal.metas.total;
  const p = await page.evaluate(function () { return window.__captureTool.api().params(); });
  const lineX = (p.L_mm / 1000 - m.xMin) / (m.xMax - m.xMin) * m.W;
  const e7 = {};
  for (const emph of ['normal', 'strong', 'max']) {
    e7[emph] = {};
    for (const k of ['inc', 'sc', 'total']) {
      e7[emph][k] = await bandDiff(page, shots[emph].urls[k], off.urls[k], lineX, 20);
    }
  }
  console.log("");
  console.log("  [E7] 스크린선 x=" + lineX.toFixed(1) + "px, ±20px 띠 RGB 절대차 합");
  console.log("  " + ["패널", "normal", "strong", "max", "strong/normal", "max/normal"].join("\t"));
  const ratios = [];
  ['inc', 'sc', 'total'].forEach(function (k) {
    const n = e7.normal[k].sum, s = e7.strong[k].sum, x = e7.max[k].sum;
    ratios.push({ k: k, n: n, s: s, x: x, rs: s / n, rx: x / n });
    console.log("  " + [k, n, s, x, (s / n).toFixed(2), (x / n).toFixed(2)].join("\t"));
  });
  const e7mono = ratios.every(function (r) { return r.n < r.s && r.s < r.x; });
  const e7pass = ratios.every(function (r) { return r.rs >= 2.0 && r.rx >= 3.0; }) && e7mono;
  report("E7", "가시성 정량", e7pass,
    "배수 strong " + ratios.map(function (r) { return r.rs.toFixed(2); }).join("/")
    + ", max " + ratios.map(function (r) { return r.rx.toFixed(2); }).join("/")
    + ", 단조 증가=" + e7mono + " (기준 strong≥2.0, max≥3.0)");

  // E8 헤일로 폭 제한
  const fp = ['inc', 'sc', 'total'].map(function (k) { return e7.max[k].footprint; });
  const fpMax = Math.max.apply(null, fp);
  report("E8", "헤일로 폭 제한", fpMax <= 8,
    "max 단계 선+헤일로 footprint " + fp.join("/") + " px (W=" + m.W + " → "
    + (fpMax / m.W * 100).toFixed(2) + "%, 기준 8px 이하)");

  // E9 체크 연동
  const e9 = ['inc', 'sc', 'total'].every(function (k) {
    return off.urls[k] === offStrong.urls[k] && off.urls[k] === offMax.urls[k];
  });
  report("E9", "체크 연동", e9, "screenLine=false에서 3단계 dataURL 동일=" + e9);

  // E10 재계산 없음
  const e10 = await page.evaluate(function () {
    const a = window.__captureTool.api();
    const snap = function () {
      return JSON.stringify(a.gridChecksum(10)) + "|" + JSON.stringify(a.layout())
        + "|" + JSON.stringify(a.params());
    };
    const before = snap();
    const t0 = performance.now();
    window.__captureTool.applyEmph('max', false);
    window.__captureTool.applyEmph('strong', false);
    const ms = performance.now() - t0;
    const after = snap();
    window.__captureTool.applyEmph('normal', false);
    return { same: before === after, ms: ms };
  });
  report("E10", "재계산 없음", e10.same && e10.ms < 300,
    "gridChecksum(10)·layout()·params() JSON 동일=" + e10.same
    + ", 소요 " + e10.ms.toFixed(1) + " ms");

  // E13 라이브 화면 불변
  const e13 = await page.evaluate(function () {
    const cv = document.getElementById("canvas");
    const a = cv.toDataURL();
    window.__captureTool.applyEmph('max', false);
    const b = cv.toDataURL();
    window.__captureTool.applyEmph('normal', false);
    const c = cv.toDataURL();
    return { ab: a === b, ac: a === c };
  });
  report("E13", "라이브 화면 불변", e13.ab && e13.ac,
    "단계 전환 전후 라이브 캔버스 dataURL 동일=" + (e13.ab && e13.ac));

  // ---------- E11 저장소 예외 안전
  const ctx11 = await browser.newContext(VP);
  const b11 = await bootPage(ctx11, {
    url: url,
    initScript: function () {
      window.Storage.prototype.getItem = function () { throw new Error("저장소 차단 스텁"); };
      window.Storage.prototype.setItem = function () { throw new Error("저장소 차단 스텁"); };
    },
  });
  const e11 = await b11.page.evaluate(function () {
    return {
      ready: window.__captureTool.ready(),
      emph: window.__captureTool.api().options.screenLineEmph,
    };
  });
  report("E11", "저장소 예외 안전", e11.ready && e11.emph === 'normal' && b11.errors.length === 0,
    "부팅 성공=" + e11.ready + ", 값=" + e11.emph + ", 미처리 오류=" + b11.errors.length
    + (b11.errors.length ? " (" + b11.errors.join(" | ") + ")" : ""));
  await ctx11.close();

  // ---------- E12 지속성
  const ctx12 = await browser.newContext(VP);
  const b12 = await bootPage(ctx12, { url: url });
  await b12.page.evaluate(function () { window.__captureTool.applyEmph('strong', true); });
  await b12.page.reload();
  await b12.page.waitForFunction(function () {
    return window.__captureTool && window.__captureTool.ready();
  }, { timeout: READY });
  await b12.page.waitForFunction(function () {
    return !document.getElementById("busy").classList.contains("show");
  }, { timeout: READY });
  const e12 = await b12.page.evaluate(function () {
    return {
      emph: window.__captureTool.api().options.screenLineEmph,
      active: Array.prototype.slice.call(document.querySelectorAll("#screenEmphButtons button"))
        .filter(function (b) { return b.classList.contains("active"); })
        .map(function (b) { return b.dataset.emph; }),
    };
  });
  report("E12", "지속성", e12.emph === 'strong'
    && e12.active.length === 1 && e12.active[0] === 'strong',
    "새로고침 후 options=" + e12.emph + ", active=[" + e12.active.join(",") + "]");
  await ctx12.close();

  // ---------- 비교용 PNG 저장
  if (OUTDIR) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    let n = 0;
    ['normal', 'strong', 'max'].forEach(function (emph) {
      ['inc', 'sc', 'total'].forEach(function (k) {
        saveURL(OUTDIR, "lam12_" + k + "_" + emph + ".png", shots[emph].urls[k]); n++;
      });
    });
    // 논문 그림의 두 열 — λ=4cm, λ=20cm에서 strong 3장씩
    for (const lam of [4, 20]) {
      await page.evaluate(function (v) {
        window.__captureTool.ui.lam_cm = v;
        const el = document.getElementById("capLam");
        el.value = String(v);
        return window.__captureTool.applyParam('lam');
      }, lam);
      await page.waitForFunction(function () {
        return !document.getElementById("busy").classList.contains("show");
      }, { timeout: READY });
      const s2 = await page.evaluate(function () { return window.__t.grab('strong', true); });
      ['inc', 'sc', 'total'].forEach(function (k) {
        saveURL(OUTDIR, "lam" + lam + "_" + k + "_strong.png", s2.urls[k]); n++;
      });
    }
    console.log("");
    console.log("  비교용 PNG " + n + "장 저장 → " + OUTDIR);
  }

  console.log("");
  console.log("미처리 페이지 예외(기본 컨텍스트): " + errors.length
    + (errors.length ? " — " + errors.join(" | ") : ""));
  await browser.close();
  srv.server.close();

  const failed = results.filter(function (r) { return !r.pass; });
  console.log("");
  console.log("==== 요약: " + (results.length - failed.length) + "/" + results.length + " 통과 ====");
  if (failed.length) console.log("실패: " + failed.map(function (r) { return r.id; }).join(", "));
})();
