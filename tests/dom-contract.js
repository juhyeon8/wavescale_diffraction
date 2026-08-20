/* A24 — DOM 계약 검사 (브라우저 불필요, 순수 텍스트 검사)
 *
 *   node tests/dom-contract.js
 *
 * script.js는 조작 패널의 id를 하드코딩해서 찾는다. capture.html은 iframe 없이
 * script.js를 직접 로드하므로 그 id를 전부 갖고 있어야 한다. index.html을 고치면서
 * id를 바꾸거나 늘리면 capture.html이 조용히 깨지는데, 이 검사가 그것을 잡는다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// script.js가 요구하는 id — 직접 호출 + 문자열 인자로 넘기는 간접 참조
function requiredIds(src) {
  const ids = new Set();
  for (const m of src.matchAll(/getElementById\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g)) ids.add(m[1]);
  // bindSlider("nSlider", …) / bindWireSlider("dSlider", …) 처럼 id를 인자로 넘기는 경우
  for (const m of src.matchAll(/bind(?:Wire)?Slider\(\s*["']([A-Za-z0-9_-]+)["']/g)) ids.add(m[1]);
  return ids;
}

function documentIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\sid\s*=\s*["']([A-Za-z0-9_-]+)["']/g)) ids.add(m[1]);
  return ids;
}

function duplicateIds(html) {
  const seen = new Map();
  for (const m of html.matchAll(/\sid\s*=\s*["']([A-Za-z0-9_-]+)["']/g))
    seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

const script = read("script.js");
const need = requiredIds(script);
const inIndex = documentIds(read("index.html"));
const inCapture = documentIds(read("capture.html"));

const missingCapture = [...need].filter((id) => !inCapture.has(id)).sort();
const missingIndex = [...need].filter((id) => !inIndex.has(id)).sort();
const dupCapture = duplicateIds(read("capture.html"));

// script.js가 querySelector류로 DOM을 찾으면 이 검사가 무의미해지므로 함께 확인한다.
const usesQuery = /querySelector|getElementsByClassName|getElementsByTagName/.test(script);

console.log(`script.js가 요구하는 id: ${need.size}개`);
console.log(`  index.html   보유: ${need.size - missingIndex.length}개`
  + (missingIndex.length ? `  누락 ${missingIndex.length}: ${missingIndex.join(", ")}` : "  누락 없음"));
console.log(`  capture.html 보유: ${need.size - missingCapture.length}개`
  + (missingCapture.length ? `  누락 ${missingCapture.length}: ${missingCapture.join(", ")}` : "  누락 없음"));
console.log(`  capture.html 중복 id: ${dupCapture.length ? dupCapture.join(", ") : "없음"}`);
console.log(`  script.js의 querySelector류 사용: ${usesQuery ? "있음(주의)" : "없음"}`);
console.log("  요구 id 전체:", [...need].sort().join(" "));

const ok = missingCapture.length === 0 && missingIndex.length === 0
  && dupCapture.length === 0 && !usesQuery;
console.log(ok ? "\n[A24] 통과 — capture.html이 script.js의 DOM 계약을 모두 만족합니다."
  : "\n[A24] 실패 — 위 누락/중복을 해결하세요.");
process.exit(ok ? 0 : 1);
