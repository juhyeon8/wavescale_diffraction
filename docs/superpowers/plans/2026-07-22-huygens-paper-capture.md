# 하위헌스 논문용 캡처 버전(paper.html/css/js) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `huygens/index.html`/`style.css`/`script.js`는 무수정으로 두고, 논문 그림 캡처 전용 복제본 `paper.html`/`paper.css`/`paper.js`를 만든다. ①②③ 패널 개별/일괄 PNG·JPEG 저장(1~4×), 인쇄용 흰 배경, 캔버스 폰트 확대, λ/a/z 직접 입력창을 지원한다.

**Architecture:** `script.js`를 통째로 복제한 `paper.js`에서 `drawMainView`/`drawPhasorArrows`/`drawPhasor`가 대상 캔버스·논리 크기·(메인 뷰는) wavePhase를 인자로 받도록 리팩터링해, 화면 렌더와 오프스크린 고해상도 렌더가 같은 함수를 공유하게 한다. 물리 엔진 8개 함수는 완전히 그대로 둔다.

**Tech Stack:** 순수 Vanilla JS(빌드 도구 없음). 검증은 저장소 관행대로 자동 테스트 러너 없이, 프로젝트 루트에 이미 설치된 `playwright` 패키지를 임시 Node 스크립트(`.mjs`)로 직접 구동해 headless Chromium으로 확인한다.

## Global Constraints

- `huygens/index.html`, `huygens/style.css`, `huygens/script.js`는 **어떤 태스크에서도 수정 금지**. 각 태스크 끝에서 `git status`로 이 3개 파일이 변경 목록에 없는지 확인한다.
- 물리 엔진 8개 함수(`fresnelCS`, `kFactor`, `totalAmplitude`, `fresnelIntensity`, `computePhasorPath`, `computeScale`, `computeFreeHalfHeight`, `niceRulerStep`)와 그 사이의 주석·`V_MAX`·`REF_INTENSITY`를 포함한 원본 script.js의 **59~181번째 줄 블록은 어떤 태스크에서도 건드리지 않는다**(Task 8에서 바이트 단위로 검증).
- 이 저장소에는 자동화 테스트 러너가 없다(`package.json`의 `test`는 placeholder). 각 태스크의 검증은 프로젝트 루트에서 `node <임시스크립트>.mjs`로 Playwright를 직접 구동하는 방식이며, 스크립트는 검증 후 삭제한다(레포에 테스트 인프라를 새로 만들지 않는다).
- 이 작업은 격리된 git worktree에서 진행되며, worktree에는 자체 `node_modules`가 없다(`playwright`는 메인 체크아웃 `C:\dev\04-task(diffraction integrate)\node_modules`에만 설치되어 있음). 모든 검증 스크립트에서 `import { chromium } from 'playwright';` 대신 다음을 쓴다:
  ```js
  import { createRequire } from 'node:module';
  const req = createRequire(import.meta.url);
  const { chromium } = req(req.resolve('playwright', { paths: ['C:/dev/04-task(diffraction integrate)'] }));
  ```
- 새 UI 요소의 id는 전부 `paper-` 접두사(단, 기존 CSS 클래스 재사용을 위한 `.readout`/`.slider-label`/`.control-group` 등 클래스명은 그대로 사용).
- 근거 문서: `docs/superpowers/specs/2026-07-22-huygens-paper-capture-design.md`.

---

## File Structure

- Create: `huygens/paper.html` — `index.html` 클론 + 캡처 버튼 섹션 + 폰트 배율 슬라이더 섹션 + λ/a/z 직접 입력 필드.
- Create: `huygens/paper.css` — `style.css` 클론의 흰 배경 버전 + 새 UI 요소 스타일.
- Create: `huygens/paper.js` — `script.js` 클론. 렌더 함수 시그니처 리팩터링, `THEME` 상수, `fontPx` 헬퍼, 패널 캡처 엔진, 직접 입력 로직 추가. hub 연동 메시지 리스너 삭제.
- 수정 없음: `huygens/index.html`, `huygens/style.css`, `huygens/script.js`.

---

### Task 1: 베이스라인 클론 + hub 연동 코드 제거

**Files:**
- Create: `huygens/paper.html` (← `index.html` 클론)
- Create: `huygens/paper.css` (← `style.css` 클론, 이번 태스크에서는 무수정)
- Create: `huygens/paper.js` (← `script.js` 클론, hub 리스너만 제거)

**Interfaces:** 없음(이후 모든 태스크의 시작점).

- [ ] **Step 1: 클론**

프로젝트 루트에서:

```bash
cd "C:\dev\04-task(diffraction integrate)\huygens"
cp index.html paper.html
cp style.css paper.css
cp script.js paper.js
```

- [ ] **Step 2: `paper.html`의 링크 경로 수정**

`paper.html`의 다음 줄(원본 `index.html:7`):

```html
<link rel="stylesheet" href="style.css">
```

교체:

```html
<link rel="stylesheet" href="paper.css">
```

`paper.html`의 다음 줄(원본 `index.html:126`):

```html
<script src="script.js"></script>
```

교체:

```html
<script src="paper.js"></script>
```

- [ ] **Step 3: `paper.js`에서 hub 연동 메시지 리스너 삭제**

`paper.js` 맨 끝의 다음 블록(원본 `script.js:893-920`) 전체를 삭제한다:

```js
/* =========================================================================
   허브(hub.html) 연동 — ③ 나란히 보기에서 그래프 패널을 먼저 보여주기 위한
   최소 메시지 리스너. 메시지가 없으면 기존 동작과 완전히 동일하다.
   ========================================================================= */
window.addEventListener('message', (e) => {
  try {
    if (e.data === 'scrollToPanelMain') {
      const panel = document.getElementById('panel-main');
      if (panel) panel.scrollIntoView({ block: 'start' });
    } else if (e.data && e.data.type === 'diffhub-setParams') {
      const newA = e.data.H_mm / 1000;
      const newZ = e.data.L_mm / 1000;
      const geometryChanged = (newA !== state.a) || (newZ !== state.z);
      state.a = newA;
      state.z = newZ;
      state.lambda = e.data.lam_cm / 100;
      // 스케일 고정 중 기하(a,z)가 바뀌면 "지금 막 체크박스를 켰다면 잡혔을 값"으로
      // 재고정한다(§30.9) — λ만 바뀔 때는 고정값을 그대로 둔다(같은 자로 비교하는
      // 기능의 존재 이유). 사용자가 앱 안에서 고정을 껐다면(state.scaleLocked===false)
      // 여기서 다시 켜지 않는다.
      if (state.scaleLocked && geometryChanged) {
        state.lockedHalfHeight = computeFreeHalfHeight(state.lambda, state.a, state.z);
      }
      setSlidersFromState();
      scheduleRecompute(0);
    }
  } catch (err) { /* 조용히 무시 */ }
});
```

파일은 그 앞의 `init();` 줄로 끝나야 한다.

- [ ] **Step 4: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 5: 원본 3개 파일 무변경 확인**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
```

Expected: 출력 없음(변경 없음).

- [ ] **Step 6: 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git add huygens/paper.html huygens/paper.css huygens/paper.js
git commit -m "$(cat <<'EOF'
기능(1/8): 하위헌스 논문 캡처판 베이스라인 클론

index.html/style.css/script.js를 그대로 복제해 paper.html/css/js를
만든다. paper.html의 링크만 paper.css/paper.js로 바꾸고, paper.js에서는
hub.html 연동용 메시지 리스너(독립 페이지에는 불필요)만 제거했다.
그 외 로직은 원본과 완전히 동일하다.
EOF
)"
```

---

### Task 2: 렌더 함수를 캔버스/논리크기/wavePhase 인자 방식으로 리팩터링

**Files:**
- Modify: `huygens/paper.js` — `layoutMain`, `drawMainView`, `layoutArrows`, `drawPhasorArrows`, `drawPhasor`, `drawAll`, `attachScreenInteraction`, `rangeSlider`/`mSlider` 리스너, `tick`

**Interfaces:**
- 이후 태스크(4: 캡처 엔진)가 `drawMainView(canvas, logicalW, logicalH, wavePhaseValue)` / `drawPhasorArrows(canvas, logicalW, logicalH)` / `drawPhasor(canvas, logicalW, logicalH, revealFraction)` 시그니처를 그대로 소비한다.
- 화면 렌더링 동작(모양·인터랙션)은 이 태스크 전후로 **완전히 동일**해야 한다(순수 리팩터링).

- [ ] **Step 1: `layoutMain` — 캔버스 대신 논리 크기 인자를 받도록 변경**

현재 코드:

```js
function layoutMain(canvas) {
  const w = canvas.width, h = canvas.height;
  const s = cache.scale;
  const xObstacle = w * 0.40;
  const xScreen = w * 0.82;
  const cy = h * 0.52;
  const pxPerM = (h * 0.40) / s.halfHeight;
  return { w, h, xObstacle, xScreen, cy, pxPerM };
}
```

교체:

```js
function layoutMain(logicalW, logicalH) {
  const w = logicalW, h = logicalH;
  const s = cache.scale;
  const xObstacle = w * 0.40;
  const xScreen = w * 0.82;
  const cy = h * 0.52;
  const pxPerM = (h * 0.40) / s.halfHeight;
  return { w, h, xObstacle, xScreen, cy, pxPerM };
}
```

- [ ] **Step 2: `drawMainView` — canvas/논리크기/wavePhase를 인자로 받도록 변경**

현재 코드(함수 시작부):

```js
function drawMainView() {
  const canvas = el.mainCanvas;
  const ctx = canvas.getContext('2d');
  const s = cache.scale;
  const L = layoutMain(canvas);
  ctx.clearRect(0, 0, L.w, L.h);
```

교체:

```js
function drawMainView(canvas, logicalW, logicalH, wavePhaseValue) {
  const ctx = canvas.getContext('2d');
  const s = cache.scale;
  const L = layoutMain(logicalW, logicalH);
  ctx.clearRect(0, 0, L.w, L.h);
```

같은 함수 안, 입사 평면파 루프의 현재 코드:

```js
  for (let x = -waveSpacing + (wavePhase % waveSpacing); x < L.xObstacle + waveSpacing; x += waveSpacing) {
```

교체(전역 `wavePhase` 대신 인자 사용):

```js
  for (let x = -waveSpacing + (wavePhaseValue % waveSpacing); x < L.xObstacle + waveSpacing; x += waveSpacing) {
```

- [ ] **Step 3: `layoutArrows` / `drawPhasorArrows` 동일하게 변경**

현재 코드:

```js
function layoutArrows(canvas) {
  const w = canvas.width, h = canvas.height;
  const pxPerM = (h * 0.42) / state.fixedRange;
  const cx = w * 0.58;
  const cy = h * 0.5;
  return { w, h, cx, cy, pxPerM };
}
```

교체:

```js
function layoutArrows(logicalW, logicalH) {
  const w = logicalW, h = logicalH;
  const pxPerM = (h * 0.42) / state.fixedRange;
  const cx = w * 0.58;
  const cy = h * 0.5;
  return { w, h, cx, cy, pxPerM };
}
```

현재 코드(함수 시작부):

```js
function drawPhasorArrows() {
  const canvas = el.arrowsCanvas;
  const ctx = canvas.getContext('2d');
  const s = cache.scale;
  if (!s) return;
  const L = layoutArrows(canvas);
  ctx.clearRect(0, 0, L.w, L.h);
```

교체:

```js
function drawPhasorArrows(canvas, logicalW, logicalH) {
  const ctx = canvas.getContext('2d');
  const s = cache.scale;
  if (!s) return;
  const L = layoutArrows(logicalW, logicalH);
  ctx.clearRect(0, 0, L.w, L.h);
```

- [ ] **Step 4: `drawPhasor` 동일하게 변경**

현재 코드(함수 시작부):

```js
function drawPhasor(revealFraction) {
  const canvas = el.phasorCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = cache.scale;
  if (!s) return;
```

교체:

```js
function drawPhasor(canvas, logicalW, logicalH, revealFraction) {
  const ctx = canvas.getContext('2d');
  const w = logicalW, h = logicalH;
  ctx.clearRect(0, 0, w, h);
  const s = cache.scale;
  if (!s) return;
```

- [ ] **Step 5: `drawAll` — 화면 캔버스를 명시적으로 넘기도록 변경**

현재 코드:

```js
function drawAll() {
  drawMainView();
  drawPhasorArrows();
  drawPhasor(1);
}
```

교체:

```js
function drawAll() {
  drawMainView(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height, wavePhase);
  drawPhasorArrows(el.arrowsCanvas, el.arrowsCanvas.width, el.arrowsCanvas.height);
  drawPhasor(el.phasorCanvas, el.phasorCanvas.width, el.phasorCanvas.height, 1);
}
```

- [ ] **Step 6: `attachScreenInteraction` — 내부 호출부 갱신**

현재 코드(함수 전체):

```js
function attachScreenInteraction() {
  const canvas = el.mainCanvas;
  const SCREEN_DRAG_MARGIN = 30; // 스크린 선 근처 이 폭(px) 안에서만 Y 드래그 시작
  const FOCUS_HOVER_MARGIN = 20; // 장애물 오른쪽으로 이만큼(px)까지도 호버 영역으로 인정

  function clientToY(evt) {
    const rect = canvas.getBoundingClientRect();
    const py = (evt.clientY - rect.top);
    const L = layoutMain(canvas);
    const s = cache.scale;
    return Math.max(-s.halfHeight, Math.min(s.halfHeight, (L.cy - py) / L.pxPerM));
  }
  function clientToPx(evt) {
    const rect = canvas.getBoundingClientRect();
    return evt.clientX - rect.left;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const L = layoutMain(canvas);
    if (Math.abs(clientToPx(e) - L.xScreen) <= SCREEN_DRAG_MARGIN) {
      state.dragging = true;
      state.Y = clientToY(e);
      drawMainView();
      drawPhasorArrows();
      drawPhasor(1);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.Y = clientToY(e);
    drawMainView();
    drawPhasorArrows();
    drawPhasor(1);
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });

  canvas.addEventListener('pointermove', (e) => {
    if (state.dragging) return;
    const L = layoutMain(canvas);
    const px = clientToPx(e);
    if (px <= L.xObstacle + FOCUS_HOVER_MARGIN) {
      canvas.style.cursor = 'crosshair';
      state.focusY = clientToY(e);
      drawMainView();
      drawPhasorArrows();
    } else if (Math.abs(px - L.xScreen) <= SCREEN_DRAG_MARGIN) {
      canvas.style.cursor = 'ns-resize';
    } else {
      canvas.style.cursor = 'default';
    }
  });
}
```

교체:

```js
function attachScreenInteraction() {
  const canvas = el.mainCanvas;
  const SCREEN_DRAG_MARGIN = 30; // 스크린 선 근처 이 폭(px) 안에서만 Y 드래그 시작
  const FOCUS_HOVER_MARGIN = 20; // 장애물 오른쪽으로 이만큼(px)까지도 호버 영역으로 인정

  function clientToY(evt) {
    const rect = canvas.getBoundingClientRect();
    const py = (evt.clientY - rect.top);
    const L = layoutMain(canvas.width, canvas.height);
    const s = cache.scale;
    return Math.max(-s.halfHeight, Math.min(s.halfHeight, (L.cy - py) / L.pxPerM));
  }
  function clientToPx(evt) {
    const rect = canvas.getBoundingClientRect();
    return evt.clientX - rect.left;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const L = layoutMain(canvas.width, canvas.height);
    if (Math.abs(clientToPx(e) - L.xScreen) <= SCREEN_DRAG_MARGIN) {
      state.dragging = true;
      state.Y = clientToY(e);
      drawAll();
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.Y = clientToY(e);
    drawAll();
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });

  canvas.addEventListener('pointermove', (e) => {
    if (state.dragging) return;
    const L = layoutMain(canvas.width, canvas.height);
    const px = clientToPx(e);
    if (px <= L.xObstacle + FOCUS_HOVER_MARGIN) {
      canvas.style.cursor = 'crosshair';
      state.focusY = clientToY(e);
      drawMainView(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height, wavePhase);
      drawPhasorArrows(el.arrowsCanvas, el.arrowsCanvas.width, el.arrowsCanvas.height);
    } else if (Math.abs(px - L.xScreen) <= SCREEN_DRAG_MARGIN) {
      canvas.style.cursor = 'ns-resize';
    } else {
      canvas.style.cursor = 'default';
    }
  });
}
```

(드래그 중·pointerdown 시점에는 3패널이 모두 갱신되어야 하므로 `drawAll()`로 단순화했다 — 원래도 3개 함수를 전부 호출했으므로 동작은 동일하다.)

- [ ] **Step 7: `rangeSlider` 리스너 갱신**

현재 코드:

```js
el.rangeSlider.addEventListener('input', () => {
  state.fixedRange = sliderToValue(+el.rangeSlider.value, RANGES.fixedRange.min, RANGES.fixedRange.max);
  updateReadouts();
  updateArrowsNote();
  drawMainView();
  drawPhasorArrows();
});
```

교체:

```js
el.rangeSlider.addEventListener('input', () => {
  state.fixedRange = sliderToValue(+el.rangeSlider.value, RANGES.fixedRange.min, RANGES.fixedRange.max);
  updateReadouts();
  updateArrowsNote();
  drawMainView(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height, wavePhase);
  drawPhasorArrows(el.arrowsCanvas, el.arrowsCanvas.width, el.arrowsCanvas.height);
});
```

- [ ] **Step 8: `mSlider` 리스너 갱신**

현재 코드:

```js
el.mSlider.addEventListener('input', () => {
  state.M = +el.mSlider.value;
  updateReadouts();
  drawPhasorArrows();
});
```

교체:

```js
el.mSlider.addEventListener('input', () => {
  state.M = +el.mSlider.value;
  updateReadouts();
  drawPhasorArrows(el.arrowsCanvas, el.arrowsCanvas.width, el.arrowsCanvas.height);
});
```

- [ ] **Step 9: `tick()` 갱신**

현재 코드:

```js
function tick() {
  wavePhase += 0.6;
  drawMainView();

  if (state.animPlaying) {
    state.animFrame += 1;
    const frac = Math.min(1, state.animFrame / 90);
    drawPhasor(frac);
    if (frac >= 1) state.animPlaying = false;
  }

  requestAnimationFrame(tick);
}
```

교체:

```js
function tick() {
  wavePhase += 0.6;
  drawMainView(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height, wavePhase);

  if (state.animPlaying) {
    state.animFrame += 1;
    const frac = Math.min(1, state.animFrame / 90);
    drawPhasor(el.phasorCanvas, el.phasorCanvas.width, el.phasorCanvas.height, frac);
    if (frac >= 1) state.animPlaying = false;
  }

  requestAnimationFrame(tick);
}
```

- [ ] **Step 10: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 11: 브라우저 회귀 확인 (Playwright)**

프로젝트 루트에 임시 스크립트 생성:

```js
// _verify-render-refactor.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(300);

// 관측점 드래그, 호버, range 슬라이더, M 슬라이더 조작
const box = await page.locator('#mainCanvas').boundingBox();
await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.6);
await page.mouse.up();
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
await page.fill('#range-slider', '500');
await page.dispatchEvent('#range-slider', 'input');
await page.fill('#m-slider', '25');
await page.dispatchEvent('#m-slider', 'input');
await page.click('#animate-btn');
await page.waitForTimeout(1600);

console.log('콘솔/페이지 에러:', errors.length === 0 ? '없음' : errors);
await page.screenshot({ path: '_verify-render-refactor.png', fullPage: true });
await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-render-refactor.mjs
```

Expected: `콘솔/페이지 에러: 없음`. 생성된 `_verify-render-refactor.png`을 열어 이전(어두운 배경) 화면과 동일하게 3패널이 정상 렌더링되는지 확인한다.

- [ ] **Step 12: 임시 파일 정리**

```bash
rm _verify-render-refactor.mjs _verify-render-refactor.png
```

- [ ] **Step 13: 원본 3개 파일 무변경 확인 후 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
git add huygens/paper.js
git commit -m "$(cat <<'EOF'
기능(2/8): 렌더 함수를 canvas/논리크기/wavePhase 인자 방식으로 리팩터링

drawMainView/drawPhasorArrows/drawPhasor가 el.xxxCanvas를 직접 참조하던
것을, 대상 canvas·논리 크기·(메인 뷰는) wavePhase를 인자로 받도록 바꿨다.
화면 렌더 호출부는 자기 캔버스의 width/height를 그대로 넘기므로 동작은
기존과 완전히 동일하다. 이후 태스크의 오프스크린 고해상도 캡처가 같은
함수를 재사용할 수 있게 하기 위한 순수 리팩터링(물리 계산 무관).
EOF
)"
```

---

### Task 3: 흰 배경 인쇄용 테마

**Files:**
- Modify: `huygens/paper.js` — `THEME` 상수 추가, 3개 draw 함수의 하드코딩 색 치환 + 배경 흰색 채움, `yToColor` 명도 조정
- Modify: `huygens/paper.css` — 전체 색상 흰 배경 버전으로 교체

**Interfaces:**
- `THEME` 객체는 이후 태스크(4: 캡처 엔진이 `THEME.canvasBg`를 통한 배경 채움에 의존)와 태스크 6(폰트)에서 직접 색을 추가하지 않으므로 이 태스크 이후 안정적이다.

- [ ] **Step 1: `THEME` 상수 추가**

`paper.js`의 `state` 객체 선언 바로 뒤(현재 `};`로 끝나는 지점)에 추가:

```js
const THEME = {
  canvasBg: '#ffffff',
  text: '#1a1a1a',
  textDim: '#3a4058',
  axis: 'rgba(0,0,0,0.3)',
  axisFaint: 'rgba(0,0,0,0.12)',
  dashed: 'rgba(0,0,0,0.35)',
  waveLine: 'rgba(30,80,190,0.6)',
  fillWarn: 'rgba(230,120,20,0.15)',
  curveLine: '#d97a12',
  marker: '#d1204a',
  markerLine: 'rgba(209,32,74,0.85)',
  rangeBox: '#c97a12',
  obstacle: '#5b6273',
  obstacleStroke: '#4a5068',
  obstacleShade: 'rgba(91,98,115,0.25)',
  blocked: '#9aa0b5',
  refSpiral: 'rgba(60,66,90,0.35)',
};
```

- [ ] **Step 2: `yToColor` 명도 조정**

현재 코드:

```js
function yToColor(y, domain) {
  const t = Math.max(0, Math.min(1, (y + domain) / (2 * domain)));
  const hue = 240 - 240 * t; // 파란(아래) -> 빨간(위)
  return `hsl(${hue}, 85%, 55%)`;
}
```

교체:

```js
function yToColor(y, domain) {
  const t = Math.max(0, Math.min(1, (y + domain) / (2 * domain)));
  const hue = 240 - 240 * t; // 파란(아래) -> 빨간(위)
  return `hsl(${hue}, 85%, 45%)`;
}
```

- [ ] **Step 3: `drawMainView` 색상 치환**

`clearRect` 직후 흰 배경 채우기 추가 — 현재 코드:

```js
  const L = layoutMain(logicalW, logicalH);
  ctx.clearRect(0, 0, L.w, L.h);
```

교체:

```js
  const L = layoutMain(logicalW, logicalH);
  ctx.clearRect(0, 0, L.w, L.h);
  ctx.fillStyle = THEME.canvasBg;
  ctx.fillRect(0, 0, L.w, L.h);
```

입사 평면파 선 — 현재 코드:

```js
  ctx.strokeStyle = 'rgba(120,170,255,0.55)';
```

교체:

```js
  ctx.strokeStyle = THEME.waveLine;
```

입사 평면파 라벨 — 현재 코드:

```js
  ctx.fillStyle = '#7a90c8';
```

교체:

```js
  ctx.fillStyle = THEME.textDim;
```

색 띠의 차단(blocked) 색 — 현재 코드:

```js
    ctx.fillStyle = blocked ? '#444a5e' : yToColor((y0 + y1) / 2, s.halfHeight);
```

교체:

```js
    ctx.fillStyle = blocked ? THEME.blocked : yToColor((y0 + y1) / 2, s.halfHeight);
```

②범위 테두리 — 현재 코드:

```js
    ctx.strokeStyle = 'rgba(255,212,121,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX - 7, topPx, 14, botPx - topPx);
    ctx.fillStyle = 'rgba(255,212,121,0.85)';
```

교체:

```js
    ctx.strokeStyle = THEME.rangeBox;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX - 7, topPx, 14, botPx - topPx);
    ctx.fillStyle = THEME.rangeBox;
```

장애물 채움/테두리 — 현재 코드:

```js
    ctx.fillStyle = '#5b6273';
    ctx.fillRect(L.xObstacle - 7, topPx, 14, botPx - topPx);
    ctx.strokeStyle = '#9aa3bd';
    ctx.strokeRect(L.xObstacle - 7, topPx, 14, botPx - topPx);
  }
  ctx.fillStyle = '#aab2cf';
```

교체:

```js
    ctx.fillStyle = THEME.obstacle;
    ctx.fillRect(L.xObstacle - 7, topPx, 14, botPx - topPx);
    ctx.strokeStyle = THEME.obstacleStroke;
    ctx.strokeRect(L.xObstacle - 7, topPx, 14, botPx - topPx);
  }
  ctx.fillStyle = THEME.textDim;
```

그림자 경계 점선 — 현재 코드:

```js
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
```

교체:

```js
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = THEME.dashed;
```

스크린 선 — 현재 코드:

```js
  ctx.strokeStyle = '#aab2cf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.xScreen, yToPx(s.halfHeight, L));
```

교체:

```js
  ctx.strokeStyle = THEME.textDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.xScreen, yToPx(s.halfHeight, L));
```

밝기 곡선 — 현재 코드:

```js
    ctx.beginPath();
    ctx.strokeStyle = '#ffd479';
```

교체:

```js
    ctx.beginPath();
    ctx.strokeStyle = THEME.curveLine;
```

밝기 곡선 채움 — 현재 코드:

```js
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,212,121,0.12)';
```

교체:

```js
    ctx.stroke();
    ctx.fillStyle = THEME.fillWarn;
```

선택 지점 마커 — 현재 코드:

```js
  ctx.fillStyle = '#ff5577';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
```

교체:

```js
  ctx.fillStyle = THEME.marker;
  ctx.fill();
  ctx.strokeStyle = THEME.text;
  ctx.lineWidth = 1.5;
  ctx.stroke();
```

- [ ] **Step 4: `drawRuler` 색상 치환**

현재 코드:

```js
function drawRuler(ctx, L, s) {
  const step = niceRulerStep(s.halfHeight);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = '#7a8ab0';
```

교체:

```js
function drawRuler(ctx, L, s) {
  const step = niceRulerStep(s.halfHeight);
  ctx.strokeStyle = THEME.axis;
  ctx.fillStyle = THEME.textDim;
```

- [ ] **Step 5: `drawPhasorArrows` 배경 채움 + 색상 치환**

함수 시작부 — 현재 코드:

```js
  const L = layoutArrows(logicalW, logicalH);
  ctx.clearRect(0, 0, L.w, L.h);
```

교체:

```js
  const L = layoutArrows(logicalW, logicalH);
  ctx.clearRect(0, 0, L.w, L.h);
  ctx.fillStyle = THEME.canvasBg;
  ctx.fillRect(0, 0, L.w, L.h);
```

장애물 음영 — 현재 코드:

```js
    ctx.fillStyle = 'rgba(91,98,115,0.35)';
```

교체:

```js
    ctx.fillStyle = THEME.obstacleShade;
```

세로 기준선 — 현재 코드:

```js
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
```

교체:

```js
  ctx.strokeStyle = THEME.axisFaint;
```

관측점 Y 점선/라벨 — 현재 코드:

```js
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,85,119,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(L.w, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff5577';
```

교체:

```js
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = THEME.markerLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(L.w, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = THEME.marker;
```

범위 밖 표시 — 현재 코드:

```js
    const dist = Math.abs(Y - focusY) - R;
    ctx.fillStyle = '#ff5577';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(atTop ? '▲' : '▼', L.cx - 5, edgePy + (atTop ? 4 : 0));
    ctx.font = '11px sans-serif';
```

교체(폰트는 Task 6에서 다룸, 색만 변경):

```js
    const dist = Math.abs(Y - focusY) - R;
    ctx.fillStyle = THEME.marker;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(atTop ? '▲' : '▼', L.cx - 5, edgePy + (atTop ? 4 : 0));
    ctx.font = '11px sans-serif';
```

개별 위상자 점/화살표 색 — 현재 코드:

```js
    ctx.arc(L.cx, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = blocked ? 'rgba(180,185,200,0.5)' : yToColor(y, s.halfHeight);
    ctx.fill();

    const x0 = L.cx - dx * armLen, y0 = py - dy * armLen;
    const x1 = L.cx + dx * armLen, y1 = py + dy * armLen;
    drawArrow(ctx, x0, y0, x1, y1,
      blocked ? 'rgba(150,155,170,0.45)' : yToColor(y, s.halfHeight),
      blocked ? 1.2 : 2);
```

교체:

```js
    ctx.arc(L.cx, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = blocked ? THEME.blocked : yToColor(y, s.halfHeight);
    ctx.fill();

    const x0 = L.cx - dx * armLen, y0 = py - dy * armLen;
    const x1 = L.cx + dx * armLen, y1 = py + dy * armLen;
    drawArrow(ctx, x0, y0, x1, y1,
      blocked ? THEME.blocked : yToColor(y, s.halfHeight),
      blocked ? 1.2 : 2);
```

하단 표시 범위 텍스트 — 현재 코드:

```js
  drawCenteredRuler(ctx, toPy, focusY, R);

  ctx.fillStyle = '#7a8ab0';
```

교체:

```js
  drawCenteredRuler(ctx, toPy, focusY, R);

  ctx.fillStyle = THEME.textDim;
```

- [ ] **Step 6: `drawCenteredRuler` 색상 치환**

현재 코드:

```js
function drawCenteredRuler(ctx, toPy, center, halfRange) {
  const step = niceRulerStep(halfRange);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = '#7a8ab0';
```

교체:

```js
function drawCenteredRuler(ctx, toPy, center, halfRange) {
  const step = niceRulerStep(halfRange);
  ctx.strokeStyle = THEME.axis;
  ctx.fillStyle = THEME.textDim;
```

- [ ] **Step 7: `drawPhasor` 배경 채움 + 색상 치환**

함수 시작부 — 현재 코드:

```js
  const w = logicalW, h = logicalH;
  ctx.clearRect(0, 0, w, h);
  const s = cache.scale;
  if (!s) return;
```

교체:

```js
  const w = logicalW, h = logicalH;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = THEME.canvasBg;
  ctx.fillRect(0, 0, w, h);
  const s = cache.scale;
  if (!s) return;
```

축 색 — 현재 코드:

```js
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  let [ox, oy] = toPx(minRe, 0); let [ox2] = toPx(maxRe, 0);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox2, oy); ctx.stroke();
  let [oxv, oyv] = toPx(0, minIm); let [, oyv2] = toPx(0, maxIm);
  ctx.beginPath(); ctx.moveTo(oxv, oyv); ctx.lineTo(oxv, oyv2); ctx.stroke();
  ctx.fillStyle = '#8ea0e8';
```

교체:

```js
  ctx.strokeStyle = THEME.axis;
  ctx.lineWidth = 1;
  let [ox, oy] = toPx(minRe, 0); let [ox2] = toPx(maxRe, 0);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox2, oy); ctx.stroke();
  let [oxv, oyv] = toPx(0, minIm); let [, oyv2] = toPx(0, maxIm);
  ctx.beginPath(); ctx.moveTo(oxv, oyv); ctx.lineTo(oxv, oyv2); ctx.stroke();
  ctx.fillStyle = THEME.textDim;
```

기준 나선(회색) — 현재 코드:

```js
  ctx.strokeStyle = 'rgba(200,205,225,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
```

교체:

```js
  ctx.strokeStyle = THEME.refSpiral;
  ctx.lineWidth = 1.5;
  ctx.stroke();
```

장애물 가장자리 마커 — 현재 코드:

```js
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }
```

교체:

```js
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = THEME.canvasBg;
    ctx.fill();
    ctx.strokeStyle = THEME.text;
    ctx.stroke();
  }
```

최종 벡터합 화살표 — 현재 코드(흰 배경에서는 이중 스트로크의 흰 획이 배경에 묻히므로 단일 획으로 단순화):

```js
    const [ex, ey] = toPx(end.re, end.im);
    const [origx, origy] = toPx(0, 0);
    drawArrow(ctx, origx, origy, ex, ey, '#1a1a1a', 2.6);
    drawArrow(ctx, origx, origy, ex, ey, '#ffffff', 1.2);

    const mag = Math.sqrt(end.re * end.re + end.im * end.im);
    const refMag = Math.sqrt(reference.total.re ** 2 + reference.total.im ** 2);
    const relIntensity = (mag * mag) / (refMag * refMag);
    ctx.fillStyle = '#e8ebf5';
```

교체:

```js
    const [ex, ey] = toPx(end.re, end.im);
    const [origx, origy] = toPx(0, 0);
    drawArrow(ctx, origx, origy, ex, ey, THEME.text, 2.2);

    const mag = Math.sqrt(end.re * end.re + end.im * end.im);
    const refMag = Math.sqrt(reference.total.re ** 2 + reference.total.im ** 2);
    const relIntensity = (mag * mag) / (refMag * refMag);
    ctx.fillStyle = THEME.text;
```

- [ ] **Step 8: `paper.css` 전체를 흰 배경 버전으로 교체**

`paper.css` 전체 내용을 다음으로 교체한다:

```css
* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #1a1a1a;
  font-family: "Segoe UI", "Malgun Gothic", sans-serif;
}

.app-header {
  padding: 16px 24px 8px;
}

.app-header h1 {
  margin: 0 0 6px;
  font-size: 1.4rem;
}

.subtitle {
  margin: 0;
  color: #4a4f66;
  font-size: 0.92rem;
  max-width: 900px;
  line-height: 1.5;
}

.app {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  padding: 8px 24px 24px;
  align-items: start;
}

.controls {
  background: #f2f3f8;
  border: 1px solid #d3d7e6;
  border-radius: 10px;
  padding: 16px;
  position: sticky;
  top: 16px;
}

.control-group {
  margin-bottom: 18px;
}

.control-group h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #3355b0;
  margin: 0 0 10px;
}

.preset-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.preset-buttons button,
#animate-btn {
  background: #e4e7f4;
  color: #1a1a1a;
  border: 1px solid #b7bede;
  border-radius: 6px;
  padding: 7px 6px;
  font-size: 0.82rem;
  cursor: pointer;
}

.preset-buttons button:hover,
#animate-btn:hover {
  background: #d3d8ee;
}

#animate-btn {
  width: 100%;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-top: 12px;
  margin-bottom: 4px;
}

.readout {
  color: #c9660a;
  font-weight: 600;
}

input[type="range"] {
  width: 100%;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  margin-top: 14px;
}

#scale-table {
  width: 100%;
  font-size: 0.82rem;
  border-collapse: collapse;
}

#scale-table td {
  padding: 3px 0;
  color: #2a2f45;
}

#scale-table td:last-child {
  text-align: right;
  color: #c9660a;
  font-weight: 600;
}

.legend .color-bar {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(to right, hsl(240,85%,45%), hsl(120,85%,45%), hsl(0,85%,45%));
}

.color-bar-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #3355b0;
  margin-top: 4px;
}

.hint {
  font-size: 0.78rem;
  color: #5a6084;
  line-height: 1.4;
  margin-top: 8px;
}

.panels {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  background: #ffffff;
  border: 1px solid #d3d7e6;
  border-radius: 10px;
  padding: 14px 16px;
}

.panel h3 {
  margin: 0 0 8px;
  font-size: 0.95rem;
  color: #1a1a1a;
}

.panel canvas {
  width: 100%;
  display: block;
  background: #ffffff;
  border-radius: 6px;
  touch-action: none;
}

#mainCanvas { height: 320px; }
#arrowsCanvas { height: 280px; }
#phasorCanvas { height: 280px; }

.panel-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.panel-note {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: #5a6084;
}

.hint-note {
  color: #a8560a;
  background: rgba(201, 102, 10, 0.08);
  border: 1px solid rgba(201, 102, 10, 0.3);
  border-radius: 6px;
  padding: 6px 8px;
}

@media (max-width: 980px) {
  .app { grid-template-columns: 1fr; }
  .controls { position: static; }
  .panel-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 9: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 10: Playwright로 흰 배경 렌더링 확인**

프로젝트 루트에 임시 스크립트:

```js
// _verify-theme.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(300);

const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const canvasCorner = await page.evaluate(() => {
  const c = document.getElementById('mainCanvas');
  return Array.from(c.getContext('2d').getImageData(2, 2, 1, 1).data);
});

console.log('콘솔/페이지 에러:', errors.length === 0 ? '없음' : errors);
console.log('body 배경색:', bodyBg);
console.log('mainCanvas (2,2) 픽셀:', canvasCorner);
await page.screenshot({ path: '_verify-theme.png', fullPage: true });
await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-theme.mjs
```

Expected: `body 배경색: rgb(255, 255, 255)`, `mainCanvas (2,2) 픽셀`의 RGB가 `255,255,255`에 가까움(장애물/색띠 영역이 아니라면). `_verify-theme.png`를 열어 모든 라벨·곡선이 흰 배경에서 선명하게 보이는지 확인한다.

- [ ] **Step 11: 임시 파일 정리**

```bash
rm _verify-theme.mjs _verify-theme.png
```

- [ ] **Step 12: 원본 3개 파일 무변경 확인 후 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
git add huygens/paper.js huygens/paper.css
git commit -m "$(cat <<'EOF'
기능(3/8): 흰 배경 인쇄용 테마 적용

THEME 상수 객체를 추가하고 3개 draw 함수의 하드코딩 색을 전부 이 참조로
치환했다. clearRect 직후 THEME.canvasBg로 배경을 명시적으로 채우도록
해서, 캔버스가 그리기 전까지 투명이라 저장 시 PNG가 투명/JPEG가 검게
나오는 문제를 화면·저장 렌더 공통으로 해결했다(물리 엔진 함수는 무수정).
paper.css는 전체를 흰 배경 대비 버전으로 교체했다.
EOF
)"
```

---

### Task 4: 패널 캡처 엔진 (오프스크린 렌더 + 저장 로직, UI 없음)

**Files:**
- Modify: `huygens/paper.js` — `PANEL_CONFIG`, `slugLength`, `buildFilename`, `renderPanelToCanvas`, `savePanel` 추가

**Interfaces:**
- Consumes: Task 2의 `drawMainView(canvas, w, h, wavePhaseValue)` / `drawPhasorArrows(canvas, w, h)` / `drawPhasor(canvas, w, h, revealFraction)`, Task 3의 `THEME.canvasBg`(각 draw 함수 내부에 이미 반영됨), 기존 `formatLength`.
- Produces: `renderPanelToCanvas(panelKey, scale)` → 오프스크린 `HTMLCanvasElement` 반환(순수 함수, 부수효과 없음). `savePanel(panelKey, scale, format, quality)` → 실제 다운로드 트리거. `buildFilename(panelKey, scale, ext)` → 파일명 문자열. `panelKey`는 `'panel1'|'panel2'|'panel3'`, `format`은 `'png'|'jpeg'`. Task 5(UI)가 `savePanel`을 그대로 호출한다.

- [ ] **Step 1: 캡처 엔진 코드 추가**

`paper.js`의 `drawAll()` 함수(Task 2에서 갱신된 버전) 바로 뒤, `/* 캔버스 크기 조정 */` 주석 블록 앞에 삽입:

현재 코드(앵커 확인용):

```js
function drawAll() {
  drawMainView(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height, wavePhase);
  drawPhasorArrows(el.arrowsCanvas, el.arrowsCanvas.width, el.arrowsCanvas.height);
  drawPhasor(el.phasorCanvas, el.phasorCanvas.width, el.phasorCanvas.height, 1);
}

/* =========================================================================
   캔버스 크기 조정
   ========================================================================= */
```

교체(사이에 삽입):

```js
function drawAll() {
  drawMainView(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height, wavePhase);
  drawPhasorArrows(el.arrowsCanvas, el.arrowsCanvas.width, el.arrowsCanvas.height);
  drawPhasor(el.phasorCanvas, el.phasorCanvas.width, el.phasorCanvas.height, 1);
}

/* =========================================================================
   패널 캡처 (논문용 이미지 저장)
   ========================================================================= */
const PANEL_CONFIG = {
  panel1: { index: 1, name: 'main', canvas: () => el.mainCanvas, draw: (c, w, h) => drawMainView(c, w, h, 0) },
  panel2: { index: 2, name: 'arrows', canvas: () => el.arrowsCanvas, draw: (c, w, h) => drawPhasorArrows(c, w, h) },
  panel3: { index: 3, name: 'cornu', canvas: () => el.phasorCanvas, draw: (c, w, h) => drawPhasor(c, w, h, 1) },
};

// formatLength()에서 파생시켜 입력창/파일명이 서로 다른 반올림 규칙을
// 갖지 않게 한다. µ는 파일시스템/URL에 안전하지 않아 u로 치환한다.
function slugLength(meters) {
  return formatLength(meters)
    .replace(/\s+/g, '')
    .replace(/µ/g, 'u')
    .replace(/\.?0+(?=[a-z])/i, '');
}

function buildFilename(panelKey, scale, ext) {
  const cfg = PANEL_CONFIG[panelKey];
  return `panel${cfg.index}_${cfg.name}_lambda${slugLength(state.lambda)}_a${slugLength(state.a)}_z${slugLength(state.z)}_${scale}x.${ext}`;
}

// 화면 캔버스는 건드리지 않고 별도 오프스크린 캔버스에 그린다. 물리 픽셀
// 크기만 scale배로 키우고 ctx.scale(scale,scale)을 걸어, draw 함수에는
// 항상 원본(논리) 크기를 넘긴다 — 좌표가 이중으로 커지는 것을 막는다.
function renderPanelToCanvas(panelKey, scale) {
  const cfg = PANEL_CONFIG[panelKey];
  const srcCanvas = cfg.canvas();
  const logicalW = srcCanvas.width, logicalH = srcCanvas.height;
  const off = document.createElement('canvas');
  off.width = Math.round(logicalW * scale);
  off.height = Math.round(logicalH * scale);
  const ctx = off.getContext('2d');
  ctx.scale(scale, scale);
  cfg.draw(off, logicalW, logicalH);
  return off;
}

function savePanel(panelKey, scale, format, quality) {
  const off = renderPanelToCanvas(panelKey, scale);
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFilename(panelKey, scale, format === 'jpeg' ? 'jpg' : 'png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, mime, format === 'jpeg' ? quality : undefined);
}

/* =========================================================================
   캔버스 크기 조정
   ========================================================================= */
```

- [ ] **Step 2: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 3: Playwright로 배경 흰색 + wavePhase 고정 확인**

프로젝트 루트에 임시 스크립트:

```js
// _verify-capture-core.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(300);

const cornerColor = await page.evaluate(() => {
  const off = renderPanelToCanvas('panel1', 3);
  return Array.from(off.getContext('2d').getImageData(2, 2, 1, 1).data);
});

const [shotA, shotB] = await page.evaluate(() => {
  const a = renderPanelToCanvas('panel1', 2).toDataURL();
  wavePhase += 5; // 시간 경과 시뮬레이션
  const b = renderPanelToCanvas('panel1', 2).toDataURL();
  return [a, b];
});

const sizeAt3x = await page.evaluate(() => {
  const c = renderPanelToCanvas('panel3', 3);
  return [c.width, c.height];
});

const filename = await page.evaluate(() => buildFilename('panel1', 3, 'png'));

console.log('콘솔/페이지 에러:', errors.length === 0 ? '없음' : errors);
console.log('①패널 (2,2) 픽셀 RGBA:', cornerColor);
console.log('wavePhase 변경 후 렌더 동일 여부:', shotA === shotB ? 'OK' : 'FAIL');
console.log('③패널 3x 물리 크기:', sizeAt3x);
console.log('파일명 예시:', filename);
await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-capture-core.mjs
```

Expected:
- `①패널 (2,2) 픽셀 RGBA`가 `[255,255,255,255]`(장애물이 화면 좌상단을 가리지 않는 기본 파라미터 기준).
- `wavePhase 변경 후 렌더 동일 여부: OK`.
- `③패널 3x 물리 크기`가 화면 phasorCanvas 크기의 정확히 3배.
- `파일명 예시`가 `panel1_main_lambda500nm_a1mm_z1m_3x.png` 형태(기본 상태 λ=500nm, a=1mm, z=1m 기준).

- [ ] **Step 4: 임시 파일 정리**

```bash
rm _verify-capture-core.mjs
```

- [ ] **Step 5: 원본 3개 파일 무변경 확인 후 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
git add huygens/paper.js
git commit -m "$(cat <<'EOF'
기능(4/8): 패널 캡처 엔진 (오프스크린 렌더 + 저장, UI 제외)

renderPanelToCanvas()가 물리 픽셀 크기만 scale배로 키운 오프스크린
캔버스에 ctx.scale(scale,scale)을 걸고 기존 draw 함수를 논리 크기
그대로 호출한다 — 좌표 이중 확대를 방지한다. ①패널은 항상
wavePhase=0으로 그려 같은 파라미터로 여러 번 저장해도 파면 선 위치가
동일하다. savePanel()이 PNG/JPEG blob을 만들어 다운로드를 트리거하고,
slugLength()는 formatLength()에서 파생시켜 파일명·입력창 표시가
같은 반올림 규칙을 공유한다. 아직 버튼 UI는 없다(Task 5).
EOF
)"
```

---

### Task 5: 캡처 버튼 UI

**Files:**
- Modify: `huygens/paper.html` — 캡처 버튼 섹션 추가
- Modify: `huygens/paper.css` — 캡처 UI 스타일 추가
- Modify: `huygens/paper.js` — `el` 참조 추가, 버튼/셀렉트 이벤트 연결

**Interfaces:**
- Consumes: Task 4의 `savePanel(panelKey, scale, format, quality)`.
- Produces: 없음(최종 UI 레이어).

- [ ] **Step 1: `paper.html`에 캡처 섹션 추가**

현재 코드:

```html
  <aside class="controls">
    <section class="control-group">
      <h2>전자기파 스펙트럼 프리셋</h2>
```

교체:

```html
  <aside class="controls">
    <section class="control-group" id="paper-capture">
      <h2>이미지 저장 (논문용)</h2>
      <div class="paper-row">
        <label>배율
          <select id="paper-scale-select">
            <option value="1">1× (저용량)</option>
            <option value="2">2× (표준)</option>
            <option value="3" selected>3× (고해상도)</option>
            <option value="4">4× (초고해상도)</option>
          </select>
        </label>
        <label>포맷
          <select id="paper-format-select">
            <option value="png" selected>PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
      </div>
      <div class="paper-row" id="paper-quality-row" style="display:none">
        <label class="slider-label">JPEG 품질 <span class="readout" id="paper-quality-readout">0.92</span></label>
        <input type="range" id="paper-quality-slider" min="0.5" max="1" step="0.01" value="0.92">
      </div>
      <div class="paper-capture-buttons">
        <button id="paper-save-panel1">①저장</button>
        <button id="paper-save-panel2">②저장</button>
        <button id="paper-save-panel3">③저장</button>
        <button id="paper-save-all">모두 저장</button>
      </div>
    </section>
    <section class="control-group">
      <h2>전자기파 스펙트럼 프리셋</h2>
```

- [ ] **Step 2: `paper.css`에 캡처 UI 스타일 추가**

파일 맨 끝에 추가:

```css

.paper-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
  font-size: 0.82rem;
}
.paper-row select {
  margin-left: 4px;
}
.paper-capture-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 10px;
}
.paper-capture-buttons button {
  background: #e4e7f4;
  color: #1a1a1a;
  border: 1px solid #b7bede;
  border-radius: 6px;
  padding: 7px 6px;
  font-size: 0.82rem;
  cursor: pointer;
}
.paper-capture-buttons button:hover {
  background: #d3d8ee;
}
#paper-save-all {
  grid-column: 1 / -1;
  font-weight: 600;
}
```

- [ ] **Step 3: `el` 객체에 참조 추가**

현재 코드:

```js
  arrowsNote: document.getElementById('arrows-note'),
};
```

교체:

```js
  arrowsNote: document.getElementById('arrows-note'),
  paperScaleSelect: document.getElementById('paper-scale-select'),
  paperFormatSelect: document.getElementById('paper-format-select'),
  paperQualityRow: document.getElementById('paper-quality-row'),
  paperQualitySlider: document.getElementById('paper-quality-slider'),
  paperQualityReadout: document.getElementById('paper-quality-readout'),
  paperSavePanel1: document.getElementById('paper-save-panel1'),
  paperSavePanel2: document.getElementById('paper-save-panel2'),
  paperSavePanel3: document.getElementById('paper-save-panel3'),
  paperSaveAll: document.getElementById('paper-save-all'),
};
```

- [ ] **Step 4: 이벤트 연결**

현재 코드:

```js
// 위상자 누적 애니메이션
el.animateBtn.addEventListener('click', () => {
  state.animPlaying = true;
  state.animFrame = 0;
});
```

교체(뒤에 추가):

```js
// 위상자 누적 애니메이션
el.animateBtn.addEventListener('click', () => {
  state.animPlaying = true;
  state.animFrame = 0;
});

// 패널 캡처 버튼
function getCaptureOptions() {
  return {
    scale: parseInt(el.paperScaleSelect.value, 10),
    format: el.paperFormatSelect.value,
    quality: parseFloat(el.paperQualitySlider.value),
  };
}
el.paperFormatSelect.addEventListener('change', () => {
  el.paperQualityRow.style.display = el.paperFormatSelect.value === 'jpeg' ? 'block' : 'none';
});
el.paperQualitySlider.addEventListener('input', () => {
  el.paperQualityReadout.textContent = el.paperQualitySlider.value;
});
el.paperSavePanel1.addEventListener('click', () => {
  const o = getCaptureOptions();
  savePanel('panel1', o.scale, o.format, o.quality);
});
el.paperSavePanel2.addEventListener('click', () => {
  const o = getCaptureOptions();
  savePanel('panel2', o.scale, o.format, o.quality);
});
el.paperSavePanel3.addEventListener('click', () => {
  const o = getCaptureOptions();
  savePanel('panel3', o.scale, o.format, o.quality);
});
el.paperSaveAll.addEventListener('click', () => {
  const o = getCaptureOptions();
  ['panel1', 'panel2', 'panel3'].forEach((key, i) => {
    setTimeout(() => savePanel(key, o.scale, o.format, o.quality), i * 300);
  });
});
```

- [ ] **Step 5: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 6: Playwright로 버튼 클릭 → 다운로드 확인**

프로젝트 루트에 임시 스크립트:

```js
// _verify-capture-ui.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);

async function clickAndGetDownload(selector) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click(selector),
  ]);
  return download.suggestedFilename();
}

console.log('①저장:', await clickAndGetDownload('#paper-save-panel1'));
console.log('②저장:', await clickAndGetDownload('#paper-save-panel2'));
console.log('③저장:', await clickAndGetDownload('#paper-save-panel3'));

const allNames = [];
page.on('download', (d) => allNames.push(d.suggestedFilename()));
await page.click('#paper-save-all');
await page.waitForTimeout(1500);
console.log('모두 저장 결과 (3개여야 함):', allNames);

await page.selectOption('#paper-format-select', 'jpeg');
console.log('JPEG 선택 시 품질 슬라이더 노출:', await page.isVisible('#paper-quality-row'));
console.log('③저장(JPEG):', await clickAndGetDownload('#paper-save-panel3'));

await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-capture-ui.mjs
```

Expected: ①②③ 파일명이 각각 `panel1_main_..._3x.png` / `panel2_arrows_..._3x.png` / `panel3_cornu_..._3x.png` 형태. `모두 저장 결과`에 3개 파일명 모두 포함. JPEG 선택 시 품질 슬라이더 노출 `true`, `③저장(JPEG)` 파일명이 `.jpg`로 끝남.

- [ ] **Step 7: 임시 파일 정리**

```bash
rm _verify-capture-ui.mjs
```

- [ ] **Step 8: 원본 3개 파일 무변경 확인 후 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
git add huygens/paper.html huygens/paper.css huygens/paper.js
git commit -m "$(cat <<'EOF'
기능(5/8): 패널 캡처 버튼 UI

컨트롤 패널 최상단에 ①②③ 개별 저장 + 모두 저장 버튼, 배율(1~4×)·
포맷(PNG/JPEG)·JPEG 품질 슬라이더를 추가하고 Task 4의 savePanel()에
연결했다. "모두 저장"은 3개 다운로드가 겹치지 않도록 300ms 간격으로
순차 실행한다.
EOF
)"
```

---

### Task 6: 캔버스 폰트 확대 (이중 방식)

**Files:**
- Modify: `huygens/paper.js` — `state.fontScale`, `fontPx()` 헬퍼, 모든 `ctx.font` 상향, 폰트 슬라이더 UI/이벤트
- Modify: `huygens/paper.html` — 폰트 배율 슬라이더 섹션
- Modify: `huygens/paper.css` — readout/`#scale-table` 폰트 크기 상향

**Interfaces:**
- Produces: `fontPx(base, weight?)` → `ctx.font`에 대입 가능한 문자열. 다른 태스크가 소비하지 않음(최종 폰트 레이어).

- [ ] **Step 1: `state`에 `fontScale` 추가**

현재 코드:

```js
  dragging: false,
  animPlaying: false,
  animFrame: 0,
};
```

교체:

```js
  dragging: false,
  animPlaying: false,
  animFrame: 0,
  fontScale: 1.0,   // 캔버스 폰트 배율 (0.8~2.0) — 저장 배율과 별개로 "화면 상대 크기"만 조절
};
```

- [ ] **Step 2: `fontPx` 헬퍼 추가**

현재 코드:

```js
function formatLength(meters) {
  const abs = Math.abs(meters);
  if (abs >= 1) return meters.toFixed(abs >= 10 ? 1 : 3) + ' m';
  if (abs >= 1e-3) return (meters * 1e3).toFixed(abs * 1e3 >= 10 ? 1 : 3) + ' mm';
  if (abs >= 1e-6) return (meters * 1e6).toFixed(abs * 1e6 >= 10 ? 1 : 3) + ' µm';
  return (meters * 1e9).toFixed(1) + ' nm';
}
```

교체(뒤에 추가):

```js
function formatLength(meters) {
  const abs = Math.abs(meters);
  if (abs >= 1) return meters.toFixed(abs >= 10 ? 1 : 3) + ' m';
  if (abs >= 1e-3) return (meters * 1e3).toFixed(abs * 1e3 >= 10 ? 1 : 3) + ' mm';
  if (abs >= 1e-6) return (meters * 1e6).toFixed(abs * 1e6 >= 10 ? 1 : 3) + ' µm';
  return (meters * 1e9).toFixed(1) + ' nm';
}

function fontPx(base, weight) {
  return (weight ? weight + ' ' : '') + (base * state.fontScale) + 'px sans-serif';
}
```

- [ ] **Step 3: `drawMainView`의 `ctx.font` 3곳 상향**

입사 평면파 라벨 — 현재 코드:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = '11px sans-serif';
  ctx.fillText('입사 평면파 (선 간격 = 파장 λ' + (waveSpacingClamped ? ' · 범위 제한' : '') + ')', 8, 14);
```

교체:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = fontPx(16);
  ctx.fillText('입사 평면파 (선 간격 = 파장 λ' + (waveSpacingClamped ? ' · 범위 제한' : '') + ')', 8, 14);
```

②범위 라벨 — 현재 코드:

```js
    ctx.fillStyle = THEME.rangeBox;
    ctx.font = '10px sans-serif';
    ctx.fillText('②범위', barX + 10, topPx - 2);
```

교체:

```js
    ctx.fillStyle = THEME.rangeBox;
    ctx.font = fontPx(16);
    ctx.fillText('②범위', barX + 10, topPx - 2);
```

장애물 라벨 — 현재 코드:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = '11px sans-serif';
  ctx.fillText('장애물 (폭 ' + formatLength(state.a) + ')', L.xObstacle - 40, yToPx(s.halfHeight, L) - 6);
```

교체:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = fontPx(16);
  ctx.fillText('장애물 (폭 ' + formatLength(state.a) + ')', L.xObstacle - 40, yToPx(s.halfHeight, L) - 6);
```

- [ ] **Step 4: `drawRuler`의 `ctx.font` 상향**

현재 코드:

```js
  ctx.strokeStyle = THEME.axis;
  ctx.fillStyle = THEME.textDim;
  ctx.font = '10px sans-serif';
  const drawTick = (yy) => {
    const py = yToPx(yy, L);
    ctx.beginPath();
    ctx.moveTo(4, py);
    ctx.lineTo(10, py);
    ctx.stroke();
    ctx.fillText(formatLength(yy), 13, py + 3);
  };
  drawTick(0);
  for (let y = step; y <= s.halfHeight; y += step) {
    drawTick(y);
    drawTick(-y);
  }
}
```

교체:

```js
  ctx.strokeStyle = THEME.axis;
  ctx.fillStyle = THEME.textDim;
  ctx.font = fontPx(16);
  const drawTick = (yy) => {
    const py = yToPx(yy, L);
    ctx.beginPath();
    ctx.moveTo(4, py);
    ctx.lineTo(10, py);
    ctx.stroke();
    ctx.fillText(formatLength(yy), 18, py + 3);
  };
  drawTick(0);
  for (let y = step; y <= s.halfHeight; y += step) {
    drawTick(y);
    drawTick(-y);
  }
}
```

(라벨 시작 x좌표를 13→18로 살짝 밀어 눈금선과 겹치지 않게 여백을 확보했다.)

- [ ] **Step 5: `drawPhasorArrows`의 `ctx.font` 4곳 상향**

Y 관측점 라벨 — 현재 코드:

```js
    ctx.fillStyle = THEME.marker;
    ctx.font = '11px sans-serif';
    ctx.fillText('Y (관측점)', 6, py - 7);
```

교체:

```js
    ctx.fillStyle = THEME.marker;
    ctx.font = fontPx(16);
    ctx.fillText('Y (관측점)', 6, py - 10);
```

범위 밖 표시 — 현재 코드:

```js
    ctx.fillStyle = THEME.marker;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(atTop ? '▲' : '▼', L.cx - 5, edgePy + (atTop ? 4 : 0));
    ctx.font = '11px sans-serif';
    ctx.fillText(`Y는 이 방향으로 ${formatLength(dist)} 더 (범위 밖)`, 6, edgePy + (atTop ? 4 : 0));
```

교체:

```js
    ctx.fillStyle = THEME.marker;
    ctx.font = fontPx(18, 'bold');
    ctx.fillText(atTop ? '▲' : '▼', L.cx - 5, edgePy + (atTop ? 4 : 0));
    ctx.font = fontPx(16);
    ctx.fillText(`Y는 이 방향으로 ${formatLength(dist)} 더 (범위 밖)`, 6, edgePy + (atTop ? 14 : -8));
```

(범위 밖 텍스트는 화살표와 줄바꿈되도록 y좌표를 위/아래로 살짝 띄웠다.)

하단 표시 범위 텍스트 — 현재 코드:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = '11px sans-serif';
  ctx.fillText(`표시 범위: ${formatLength(focusY)} ± ${formatLength(R)}`, 6, L.h - 8);
```

교체:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = fontPx(16);
  ctx.fillText(`표시 범위: ${formatLength(focusY)} ± ${formatLength(R)}`, 6, L.h - 8);
```

- [ ] **Step 6: `drawCenteredRuler`의 `ctx.font` 상향**

현재 코드:

```js
  ctx.strokeStyle = THEME.axis;
  ctx.fillStyle = THEME.textDim;
  ctx.font = '10px sans-serif';
  const drawTick = (yy) => {
    const py = toPy(yy);
    ctx.beginPath();
    ctx.moveTo(4, py);
    ctx.lineTo(10, py);
    ctx.stroke();
    ctx.fillText(formatLength(yy), 13, py + 3);
  };
```

교체:

```js
  ctx.strokeStyle = THEME.axis;
  ctx.fillStyle = THEME.textDim;
  ctx.font = fontPx(16);
  const drawTick = (yy) => {
    const py = toPy(yy);
    ctx.beginPath();
    ctx.moveTo(4, py);
    ctx.lineTo(10, py);
    ctx.stroke();
    ctx.fillText(formatLength(yy), 18, py + 3);
  };
```

- [ ] **Step 7: `drawPhasor`의 `ctx.font` 2곳 상향**

Re/Im 라벨 — 현재 코드:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = '10px sans-serif';
  ctx.fillText('Re', ox2 - 14, oy - 4);
  ctx.fillText('Im', oxv + 4, oyv2 + 10);
```

교체:

```js
  ctx.fillStyle = THEME.textDim;
  ctx.font = fontPx(16);
  ctx.fillText('Re', ox2 - 20, oy - 6);
  ctx.fillText('Im', oxv + 6, oyv2 + 16);
```

결과 수치 — 현재 코드:

```js
    ctx.fillStyle = THEME.text;
    ctx.font = '12px sans-serif';
    ctx.fillText(`|합| = ${mag.toExponential(2)}`, 8, h - 28);
    ctx.fillText(`상대 세기 I/I₀ = ${relIntensity.toFixed(3)}`, 8, h - 12);
```

교체:

```js
    ctx.fillStyle = THEME.text;
    ctx.font = fontPx(18, 'bold');
    ctx.fillText(`|합| = ${mag.toExponential(2)}`, 8, h - 34);
    ctx.fillText(`상대 세기 I/I₀ = ${relIntensity.toFixed(3)}`, 8, h - 12);
```

- [ ] **Step 8: `paper.html`에 폰트 배율 슬라이더 섹션 추가**

현재 코드(Task 5에서 추가된 캡처 섹션의 닫는 태그 직후):

```html
      <div class="paper-capture-buttons">
        <button id="paper-save-panel1">①저장</button>
        <button id="paper-save-panel2">②저장</button>
        <button id="paper-save-panel3">③저장</button>
        <button id="paper-save-all">모두 저장</button>
      </div>
    </section>
    <section class="control-group">
      <h2>전자기파 스펙트럼 프리셋</h2>
```

교체:

```html
      <div class="paper-capture-buttons">
        <button id="paper-save-panel1">①저장</button>
        <button id="paper-save-panel2">②저장</button>
        <button id="paper-save-panel3">③저장</button>
        <button id="paper-save-all">모두 저장</button>
      </div>
    </section>
    <section class="control-group" id="paper-display">
      <h2>표시 설정</h2>
      <label class="slider-label">
        캔버스 폰트 배율 <span class="readout" id="paper-fontscale-readout">1.00×</span>
      </label>
      <input type="range" id="paper-fontscale-slider" min="0.8" max="2.0" step="0.05" value="1.0">
    </section>
    <section class="control-group">
      <h2>전자기파 스펙트럼 프리셋</h2>
```

- [ ] **Step 9: `paper.css`에 readout/`#scale-table` 폰트 크기 상향**

현재 코드:

```css
.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-top: 12px;
  margin-bottom: 4px;
}
```

교체:

```css
.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 1.15rem;
  margin-top: 12px;
  margin-bottom: 4px;
}
```

현재 코드:

```css
#scale-table {
  width: 100%;
  font-size: 0.82rem;
  border-collapse: collapse;
}
```

교체:

```css
#scale-table {
  width: 100%;
  font-size: 1.1rem;
  border-collapse: collapse;
}
```

- [ ] **Step 10: `el` 객체에 참조 추가**

현재 코드:

```js
  paperSaveAll: document.getElementById('paper-save-all'),
};
```

교체:

```js
  paperSaveAll: document.getElementById('paper-save-all'),
  paperFontScaleSlider: document.getElementById('paper-fontscale-slider'),
  paperFontScaleReadout: document.getElementById('paper-fontscale-readout'),
};
```

- [ ] **Step 11: 폰트 슬라이더 이벤트 연결**

현재 코드(Task 5에서 추가된 블록의 끝):

```js
el.paperSaveAll.addEventListener('click', () => {
  const o = getCaptureOptions();
  ['panel1', 'panel2', 'panel3'].forEach((key, i) => {
    setTimeout(() => savePanel(key, o.scale, o.format, o.quality), i * 300);
  });
});
```

교체(뒤에 추가):

```js
el.paperSaveAll.addEventListener('click', () => {
  const o = getCaptureOptions();
  ['panel1', 'panel2', 'panel3'].forEach((key, i) => {
    setTimeout(() => savePanel(key, o.scale, o.format, o.quality), i * 300);
  });
});

el.paperFontScaleSlider.addEventListener('input', () => {
  state.fontScale = parseFloat(el.paperFontScaleSlider.value);
  el.paperFontScaleReadout.textContent = state.fontScale.toFixed(2) + '×';
  drawAll();
});
```

- [ ] **Step 12: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 13: Playwright로 폰트 확대 확인**

프로젝트 루트에 임시 스크립트:

```js
// _verify-font.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(300);

const base = await page.evaluate(() => fontPx(16));
await page.fill('#paper-fontscale-slider', '2.0');
await page.dispatchEvent('#paper-fontscale-slider', 'input');
await page.waitForTimeout(200);
const scaled = await page.evaluate(() => fontPx(16));

console.log('콘솔/페이지 에러:', errors.length === 0 ? '없음' : errors);
console.log('fontScale=1.0:', base, ' / fontScale=2.0:', scaled);
await page.screenshot({ path: '_verify-font-2x.png', fullPage: true });
await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-font.mjs
```

Expected: `fontPx(16)`이 `16px sans-serif` → `32px sans-serif`로 정확히 2배. `콘솔/페이지 에러: 없음`. `_verify-font-2x.png`를 열어 폰트가 2배로 커진 상태에서 라벨이 캔버스 밖으로 잘리거나 서로 겹치지 않는지 육안 확인한다(겹침이 보이면 해당 라벨의 좌표 오프셋을 조정).

- [ ] **Step 14: 임시 파일 정리**

```bash
rm _verify-font.mjs _verify-font-2x.png
```

- [ ] **Step 15: 원본 3개 파일 무변경 확인 후 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
git add huygens/paper.html huygens/paper.css huygens/paper.js
git commit -m "$(cat <<'EOF'
기능(6/8): 캔버스 폰트 확대 (기본 크기 상향 + 배율 슬라이더)

ctx.font 하드코딩 10/11/12px를 16/16/18px(bold)로 일괄 상향하고,
fontPx(base, weight) 헬퍼로 0.8~2.0배 전역 슬라이더를 추가로 곱한다.
저장 배율(1~4x)은 해상도만, fontScale은 화면 상대 크기만 조절하므로
저장 시 둘이 곱해지는 것은 의도된 동작이다. 라벨 겹침 방지를 위해
ruler/Re-Im 라벨 오프셋을 함께 조정했다. readout/#scale-table CSS
폰트도 1.3~1.5배 키웠다.
EOF
)"
```

---

### Task 7: λ·a·z 직접 입력창

**Files:**
- Modify: `huygens/paper.html` — λ/a/z 슬라이더 옆에 숫자 입력 + 단위 드롭다운
- Modify: `huygens/paper.css` — 입력창 스타일
- Modify: `huygens/paper.js` — `el` 참조, `updateDirectInputDisplay`/`syncDirectInputs`/`setupDirectInput`, `onParamChange`/`setSlidersFromState` 훅

**Interfaces:**
- Consumes: 기존 `RANGES`, `state.lambda/a/z`, `onParamChange()`, `setSlidersFromState()`.
- Produces: 없음(최종 UI 레이어).

- [ ] **Step 1: `paper.html`에 λ 직접 입력 추가**

현재 코드:

```html
      <label class="slider-label">
        파장 &lambda; <span class="readout" id="lambda-readout"></span>
      </label>
      <input type="range" id="lambda-slider" min="0" max="1000" step="1">

      <label class="slider-label">
        장애물 폭 a <span class="readout" id="a-readout"></span>
      </label>
      <input type="range" id="a-slider" min="0" max="1000" step="1">

      <label class="slider-label">
        장애물&ndash;스크린 거리 z <span class="readout" id="z-readout"></span>
      </label>
      <input type="range" id="z-slider" min="0" max="1000" step="1">
```

교체:

```html
      <label class="slider-label">
        파장 &lambda; <span class="readout" id="lambda-readout"></span>
      </label>
      <input type="range" id="lambda-slider" min="0" max="1000" step="1">
      <div class="paper-direct-input">
        <input type="number" id="paper-lambda-input" step="any">
        <select id="paper-lambda-unit">
          <option value="1e-9" selected>nm</option>
          <option value="1e-6">µm</option>
          <option value="1e-3">mm</option>
          <option value="1e-2">cm</option>
          <option value="1">m</option>
        </select>
      </div>

      <label class="slider-label">
        장애물 폭 a <span class="readout" id="a-readout"></span>
      </label>
      <input type="range" id="a-slider" min="0" max="1000" step="1">
      <div class="paper-direct-input">
        <input type="number" id="paper-a-input" step="any">
        <select id="paper-a-unit">
          <option value="1e-9">nm</option>
          <option value="1e-6">µm</option>
          <option value="1e-3" selected>mm</option>
          <option value="1e-2">cm</option>
          <option value="1">m</option>
        </select>
      </div>

      <label class="slider-label">
        장애물&ndash;스크린 거리 z <span class="readout" id="z-readout"></span>
      </label>
      <input type="range" id="z-slider" min="0" max="1000" step="1">
      <div class="paper-direct-input">
        <input type="number" id="paper-z-input" step="any">
        <select id="paper-z-unit">
          <option value="1e-9">nm</option>
          <option value="1e-6">µm</option>
          <option value="1e-3">mm</option>
          <option value="1e-2">cm</option>
          <option value="1" selected>m</option>
        </select>
      </div>
```

- [ ] **Step 2: `paper.css`에 입력창 스타일 추가**

파일 맨 끝에 추가:

```css

.paper-direct-input {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.paper-direct-input input[type="number"] {
  width: 90px;
  padding: 3px 6px;
  border: 1px solid #b7bede;
  border-radius: 4px;
  font-size: 0.82rem;
}
.paper-direct-input select {
  padding: 3px 4px;
  border: 1px solid #b7bede;
  border-radius: 4px;
  font-size: 0.82rem;
}
```

- [ ] **Step 3: `el` 객체에 참조 추가**

현재 코드:

```js
  paperFontScaleSlider: document.getElementById('paper-fontscale-slider'),
  paperFontScaleReadout: document.getElementById('paper-fontscale-readout'),
};
```

교체:

```js
  paperFontScaleSlider: document.getElementById('paper-fontscale-slider'),
  paperFontScaleReadout: document.getElementById('paper-fontscale-readout'),
  paperLambdaInput: document.getElementById('paper-lambda-input'),
  paperLambdaUnit: document.getElementById('paper-lambda-unit'),
  paperAInput: document.getElementById('paper-a-input'),
  paperAUnit: document.getElementById('paper-a-unit'),
  paperZInput: document.getElementById('paper-z-input'),
  paperZUnit: document.getElementById('paper-z-unit'),
};
```

- [ ] **Step 4: `onParamChange`/`setSlidersFromState`에 동기화 훅 추가**

현재 코드:

```js
function onParamChange() {
  updateReadouts();
  scheduleRecompute(120);
}
```

교체:

```js
function onParamChange() {
  updateReadouts();
  syncDirectInputs();
  scheduleRecompute(120);
}
```

현재 코드:

```js
function setSlidersFromState() {
  el.lambdaSlider.value = valueToSlider(state.lambda, RANGES.lambda.min, RANGES.lambda.max);
  el.aSlider.value = valueToSlider(state.a, RANGES.a.min, RANGES.a.max);
  el.zSlider.value = valueToSlider(state.z, RANGES.z.min, RANGES.z.max);
  el.nSlider.value = state.N;
  el.mSlider.value = state.M;
  el.rangeSlider.value = valueToSlider(state.fixedRange, RANGES.fixedRange.min, RANGES.fixedRange.max);
  if (state.scaleLocked && state.lockedHalfHeight != null) {
    el.lockedHeightSlider.value = valueToSlider(
      state.lockedHalfHeight, RANGES.lockedHalfHeight.min, RANGES.lockedHalfHeight.max
    );
  }
  updateReadouts();
  updateArrowsNote();
}
```

교체:

```js
function setSlidersFromState() {
  el.lambdaSlider.value = valueToSlider(state.lambda, RANGES.lambda.min, RANGES.lambda.max);
  el.aSlider.value = valueToSlider(state.a, RANGES.a.min, RANGES.a.max);
  el.zSlider.value = valueToSlider(state.z, RANGES.z.min, RANGES.z.max);
  el.nSlider.value = state.N;
  el.mSlider.value = state.M;
  el.rangeSlider.value = valueToSlider(state.fixedRange, RANGES.fixedRange.min, RANGES.fixedRange.max);
  if (state.scaleLocked && state.lockedHalfHeight != null) {
    el.lockedHeightSlider.value = valueToSlider(
      state.lockedHalfHeight, RANGES.lockedHalfHeight.min, RANGES.lockedHalfHeight.max
    );
  }
  updateReadouts();
  updateArrowsNote();
  syncDirectInputs();
}
```

- [ ] **Step 5: 직접 입력 로직 추가**

`setSlidersFromState` 함수 정의 바로 뒤(현재 그 뒤에는 `function applyUrlParams() {`가 이어짐)에 삽입:

현재 코드(앵커 확인용, `setSlidersFromState` 닫는 `}` 직후):

```js
  updateReadouts();
  updateArrowsNote();
  syncDirectInputs();
}

function applyUrlParams() {
```

교체(사이에 삽입):

```js
  updateReadouts();
  updateArrowsNote();
  syncDirectInputs();
}

// 타이핑 중인 입력창은 절대 덮어쓰지 않는다 — formatLength 재포맷으로
// 인한 "500 입력 -> 499.9 표시" 같은 라운드트립 드리프트를 막기 위함.
function updateDirectInputDisplay(inputEl, unitEl, meters) {
  if (document.activeElement === inputEl) return;
  inputEl.value = +(meters / parseFloat(unitEl.value)).toPrecision(6);
}
function syncDirectInputs() {
  updateDirectInputDisplay(el.paperLambdaInput, el.paperLambdaUnit, state.lambda);
  updateDirectInputDisplay(el.paperAInput, el.paperAUnit, state.a);
  updateDirectInputDisplay(el.paperZInput, el.paperZUnit, state.z);
}
// rangeKey는 RANGES/state의 키와 1:1로 같다('lambda'|'a'|'z').
function setupDirectInput(inputEl, unitEl, rangeKey, applyValue) {
  function apply() {
    const raw = parseFloat(inputEl.value);
    if (!Number.isFinite(raw)) return; // 파싱 안 되는 중간 입력은 무시(값도, 입력창도 안 건드림)
    const meters = raw * parseFloat(unitEl.value);
    const range = RANGES[rangeKey];
    const clamped = Math.min(range.max, Math.max(range.min, meters));
    applyValue(clamped);
    onParamChange();
  }
  function commitAndCorrect() {
    apply();
    inputEl.value = +(state[rangeKey] / parseFloat(unitEl.value)).toPrecision(6);
  }
  inputEl.addEventListener('input', apply);       // 타이핑 중: 유효하면 즉시 반영, 표시는 안 건드림
  inputEl.addEventListener('change', commitAndCorrect); // 블러/엔터: clamp된 값으로 표시 보정
  unitEl.addEventListener('change', commitAndCorrect);
}
setupDirectInput(el.paperLambdaInput, el.paperLambdaUnit, 'lambda', v => { state.lambda = v; });
setupDirectInput(el.paperAInput, el.paperAUnit, 'a', v => { state.a = v; });
setupDirectInput(el.paperZInput, el.paperZUnit, 'z', v => { state.z = v; });

function applyUrlParams() {
```

- [ ] **Step 6: 문법 확인**

```bash
node --check "huygens/paper.js"
```

Expected: 출력 없음.

- [ ] **Step 7: Playwright로 입력창 동작 확인**

프로젝트 루트에 임시 스크립트:

```js
// _verify-direct-input.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(300);

// 1) 입력창 -> 슬라이더 동기화
await page.fill('#paper-lambda-input', '600');
await page.dispatchEvent('#paper-lambda-input', 'input');
await page.waitForTimeout(200);
console.log('λ=600nm 입력 후 readout:', await page.textContent('#lambda-readout'));

// 2) 슬라이더 -> 입력창 동기화
await page.fill('#z-slider', '500');
await page.dispatchEvent('#z-slider', 'input');
await page.waitForTimeout(200);
console.log('z 슬라이더 조작 후 입력창 값:', await page.inputValue('#paper-z-input'));

// 3) 범위 초과 값 -> change 시 clamp 표시
await page.fill('#paper-a-input', '999999');
await page.locator('#paper-a-input').dispatchEvent('change');
await page.waitForTimeout(200);
console.log('a 범위 초과 입력 후 clamp 표시값:', await page.inputValue('#paper-a-input'));

// 4) 중간 입력 상태에서 크래시 없는지
await page.fill('#paper-lambda-input', '5.');
await page.dispatchEvent('#paper-lambda-input', 'input');
await page.waitForTimeout(100);

console.log('콘솔/페이지 에러:', errors.length === 0 ? '없음' : errors);
await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-direct-input.mjs
```

Expected: `λ=600nm 입력 후 readout`에 `600` 포함. `z 슬라이더 조작 후 입력창 값`이 `500`(m 단위, z-slider가 로그 스케일이므로 정확히 500은 아닐 수 있음 — RANGES.z 범위 내 값이면 됨, 슬라이더가 실제로 움직였는지가 핵심). `a 범위 초과 입력 후 clamp 표시값`이 `RANGES.a.max`(10, m 단위 아님 — a-unit이 mm 기본이므로 표시값은 `10000`처럼 mm 환산값)로 clamp됨. `콘솔/페이지 에러: 없음`.

- [ ] **Step 8: 임시 파일 정리**

```bash
rm _verify-direct-input.mjs
```

- [ ] **Step 9: 원본 3개 파일 무변경 확인 후 커밋**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git status --short huygens/index.html huygens/style.css huygens/script.js
git add huygens/paper.html huygens/paper.css huygens/paper.js
git commit -m "$(cat <<'EOF'
기능(7/8): λ·a·z 직접 입력창 (숫자 + 단위, 슬라이더 양방향 동기화)

각 파라미터에 number input + 단위 드롭다운(nm/µm/mm/cm/m)을 슬라이더
아래 병행 배치했다. input 이벤트에서는 유효한 값만 반영하고 입력창
자신은 건드리지 않으며(포커스 중인 입력창은 syncDirectInputs가 항상
건너뜀), change(블러/엔터)나 단위 변경 시에만 clamp된 값으로 표시를
보정해 "타이핑 중 표시값이 흔들리는" 문제를 막았다. RANGES/
formatLength/valueToSlider 등 기존 헬퍼를 그대로 재사용했다.
EOF
)"
```

---

### Task 8: 최종 통합 검증 — Playwright 4개 기능 + 원본 무변경 + 물리 엔진 바이트 동일성

**Files:**
- 코드 변경 없음 — 검증만.

**Interfaces:** 없음(검증 태스크).

- [ ] **Step 1: 물리 엔진 8개 함수 바이트 단위 동일성 확인**

프로젝트 루트에 임시 스크립트:

```js
// _verify-physics-integrity.mjs
import fs from 'node:fs';

function extractBlock(text) {
  const start = text.indexOf('/* =========================================================================\n   물리: 프레넬 회절 적분');
  const end = text.indexOf('\n/* =========================================================================\n   색상 매핑');
  if (start === -1 || end === -1) throw new Error('앵커 문자열을 찾지 못했습니다 — 주석이 수정되었는지 확인하세요');
  return text.slice(start, end);
}

const orig = fs.readFileSync('huygens/script.js', 'utf8');
const paper = fs.readFileSync('huygens/paper.js', 'utf8');
const a = extractBlock(orig);
const b = extractBlock(paper);
console.log('물리 엔진 블록 길이 (원본/paper):', a.length, b.length);
console.log('바이트 단위 동일:', a === b ? 'OK' : 'FAIL');
if (a !== b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log('첫 차이 위치:', i);
      console.log('원본:', JSON.stringify(a.slice(Math.max(0, i - 30), i + 30)));
      console.log('paper:', JSON.stringify(b.slice(Math.max(0, i - 30), i + 30)));
      break;
    }
  }
}
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-physics-integrity.mjs
```

Expected: `바이트 단위 동일: OK`. `FAIL`이면 위 태스크 중 어딘가에서 물리 엔진 블록을 실수로 건드린 것이므로, 해당 태스크로 돌아가 원인을 찾는다(Global Constraints 위반).

- [ ] **Step 2: 원본 3개 파일 무변경 확인**

```bash
cd "C:\dev\04-task(diffraction integrate)"
git diff --stat huygens/index.html huygens/style.css huygens/script.js
git log --oneline -1 -- huygens/index.html huygens/style.css huygens/script.js
```

Expected: `git diff --stat`는 출력 없음. `git log`는 이번 작업 이전(Task 1보다 오래된) 커밋만 표시됨.

- [ ] **Step 3: Playwright로 4개 기능 통합 스모크 테스트**

프로젝트 루트에 임시 스크립트:

```js
// _verify-final.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = pathToFileURL(path.resolve('huygens/paper.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto(url);
await page.waitForTimeout(300);

// (1) 흰 배경
const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// (2) 캡처: ①②③ + 모두저장, 배율/포맷 반영
async function clickAndGetDownload(selector) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click(selector),
  ]);
  return download.suggestedFilename();
}
await page.selectOption('#paper-scale-select', '4');
const name1 = await clickAndGetDownload('#paper-save-panel1');
const name2 = await clickAndGetDownload('#paper-save-panel2');
const name3 = await clickAndGetDownload('#paper-save-panel3');

// (3) 폰트 배율
await page.fill('#paper-fontscale-slider', '1.5');
await page.dispatchEvent('#paper-fontscale-slider', 'input');
await page.waitForTimeout(150);

// (4) 직접 입력창 -> 슬라이더 동기화
await page.fill('#paper-lambda-input', '450');
await page.dispatchEvent('#paper-lambda-input', 'input');
await page.waitForTimeout(200);
const lambdaReadout = await page.textContent('#lambda-readout');

await page.screenshot({ path: '_verify-final.png', fullPage: true });

console.log('콘솔/페이지 에러:', errors.length === 0 ? '없음' : errors);
console.log('body 배경:', bodyBg);
console.log('①②③ 4x 파일명:', name1, name2, name3);
console.log('λ=450nm 입력 후 readout:', lambdaReadout);

await browser.close();
```

실행:

```bash
cd "C:\dev\04-task(diffraction integrate)"
node _verify-final.mjs
```

Expected: `콘솔/페이지 에러: 없음`, `body 배경: rgb(255, 255, 255)`, 파일명 3개 모두 `_4x.png`로 끝남, `λ=450nm 입력 후 readout`에 `450` 포함. `_verify-final.png`를 열어 흰 배경·확대된 폰트·정상 3패널 레이아웃을 최종 육안 확인한다.

- [ ] **Step 4: 임시 파일 정리**

```bash
rm _verify-physics-integrity.mjs _verify-final.mjs _verify-final.png
```

- [ ] **Step 5: 사용자에게 최종 보고**

이 태스크는 코드 변경이 없으므로 커밋하지 않는다. Step 1~3의 결과(물리 엔진 동일성, 원본 무변경, 4개 기능 스모크 테스트)를 사용자에게 요약 보고하고 작업을 마무리한다.

---

## Self-Review 메모

- **스펙 커버리지**: 설계 스펙 §2(캡처 시스템)=Task 4~5, §3.2(ctx.scale 방식)=Task 4 Step 1, §3.3(배경 채움)=Task 3, §3.4(wavePhase 고정)=Task 4 PANEL_CONFIG.panel1, §3.6(파일명/slugLength)=Task 4, §4(흰 테마)=Task 3, §5(폰트 이중 방식)=Task 6, §6(직접 입력창/라운드트립 방지)=Task 7, §8 Acceptance 1~7=Task 8(그리고 각 태스크 내 개별 검증)에서 모두 다룬다. 빠진 항목 없음.
- **플레이스홀더 스캔**: "TBD"/"나중에"/"적절히 처리" 등 없음. 모든 코드 스텝에 실제 diff 또는 전체 파일 내용을 포함했다.
- **일관성**: `drawMainView(canvas, logicalW, logicalH, wavePhaseValue)` / `drawPhasorArrows(canvas, logicalW, logicalH)` / `drawPhasor(canvas, logicalW, logicalH, revealFraction)` 시그니처는 Task 2에서 정의된 그대로 Task 4(`PANEL_CONFIG`)·Task 6(폰트)까지 동일하게 사용된다. `THEME` 키 이름은 Task 3에서 정의된 것만 Task 3 내에서 소비되고 이후 태스크는 새 키를 추가하지 않는다. `RANGES`/`state`의 키(`lambda`/`a`/`z`)와 `setupDirectInput`의 `rangeKey` 인자가 1:1로 일치함을 Task 7에서 명시했다.
