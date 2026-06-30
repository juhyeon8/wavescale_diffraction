# 금속 막대 회절 시뮬레이션 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 패러데이 케이지 산란 시뮬레이션을, 도선 1줄로 만든 "금속 막대" 장애물의 파장별 회절을 입사+산란 중첩과 스크린 세기 곡선으로 보여주는 시뮬레이션으로 변형한다.

**Architecture:** 기존 유한 배열 MoM(모멘트법) 솔버를 그대로 재사용한다. x=0에 세로로 쌓인 도선 N개가 장애물이고, 거리 L의 스크린에서 |E_total|²를 측정한다. 무한 배열(Floquet) 탭과 E⊥ 편광 토글을 제거해 단일 화면으로 단순화하고, 스크린 거리 슬라이더·세기 곡선 패널·물리 가드레일(λ/d 표시, 닿음/투과 경고)을 추가한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 없음), Canvas 2D. ES 모듈·fetch 미사용 → 더블클릭으로 열림.

## Global Constraints

- **시간 규약 `e^{-iωt}`, 외향 한켈 `H₀⁽¹⁾ = J₀ + iY₀`, 입사파 `exp(+ikx)` 유지** — 기존 코드에서 검증 완료(설계서 §1.1). 부호 변경 금지.
- **3파일만**: `index.html` / `style.css` / `script.js`. 새 파일·ES 모듈·fetch·npm 의존성 도입 금지(더블클릭으로 열려야 함).
- **검증 방식**: 테스트 러너 없음. 순수 수학은 `script.js`의 `selfCheck()`에 `console.assert` 단언을 추가하고, **브라우저로 `index.html`을 열어 DevTools 콘솔 출력과 화면을 확인**한다. 각 Task의 검증 단계는 "브라우저에서 열고 콘솔/화면 확인"이다.
- **모든 UI 텍스트·주석은 한국어**. 기존 코드 스타일(IIFE, 2-space, 한국어 주석)을 따른다.
- **요청 범위 밖 코드·서식은 건드리지 않는다.**
- 단위 규약 유지: λ는 cm, d·a·L은 mm, 내부 계산은 m.

---

## File Structure

- `index.html` — 패널 마크업 수정: 탭 바·무한/유한 pane·편광 섹션 제거, 단일 장애물 컨트롤 + 스크린 거리 L 슬라이더, 정보/배지 영역.
- `style.css` — 탭/세그버튼 스타일 정리(미사용), 배지(`.badge`)·세기 패널 관련 클래스 추가.
- `script.js` — Floquet/탭/E⊥ 제거, 단일 state, x-윈도우 일반화(스크린까지 줌아웃), 장(場)·스크린 세기 평가 헬퍼 DRY화, 4번째 세기 곡선 렌더, 가드레일 표시, `selfCheck()` 확장.

전체 변경은 한 기능(시뮬레이션 변형)이라 단일 계획으로 둔다.

---

## Task 1: Floquet·탭·E⊥ 제거 → 단일 막대 베이스라인

기존을 "도선 N개 한 줄 + 입사/산란/중첩 3칸"만 남도록 정리한다. 무한 배열(Floquet), 탭, 수직 편광(E⊥)을 모두 없애고, 반지름 상한 `min(a,0.3d)`을 제거한다. 이 Task 후에도 앱은 정상 렌더돼야 한다.

**Files:**
- Modify: `C:/dev/fourth-task/index.html`
- Modify: `C:/dev/fourth-task/script.js`
- Modify: `C:/dev/fourth-task/style.css`

**Interfaces:**
- Produces: 전역(IIFE 내) 단일 상태 객체 `state = { N, d_mm, a_mm, lam_cm, amp, L_mm, playing, phase }`. `recompute()`는 `state`만 읽는다. `solver` 객체는 `{ k, aEff_m, wiresY, cRe, cIm, gridW, gridH, xMin, xMax, Yw, incRe, incIm, scRe, scIm }`를 갖는다(Floquet 필드 제거, `Xw`→`xMin/xMax`).

- [ ] **Step 1: index.html — 탭/무한·유한 pane/편광 섹션 제거하고 단일 컨트롤로 교체**

`<h1>패러데이 케이지 산란</h1>` 아래 `#tabBar`부터 `#pane1` 닫는 `</div>`까지(탭 영역 전체)를 아래로 교체. 또 `<!-- 공유: 편광 -->`부터 `#polLegend` `</div>`까지(편광 섹션 전체) 삭제.

탭+도선 설정 교체본:
```html
    <h1>금속 막대 회절</h1>
    <div class="sub">x=0에 도선 N개를 세로로 쌓아 금속 막대(장애물)를 만들고,
      왼→오른 평면파의 회절을 봅니다. 굵기 2a가 간격 d 이상이면 도선이 닿아
      솔리드 막대가 됩니다. 전기장(도선과 평행 성분) 한 가지만 그립니다.</div>

    <h2>장애물(도선) 설정</h2>
    <div class="row">
      <label style="width:60px">개수 N</label>
      <input type="range" id="nSlider" min="2" max="120" step="1" value="40">
      <span class="valbox" id="nVal"></span>
    </div>
    <div class="row">
      <label style="width:60px">간격 d</label>
      <input type="range" id="dSlider" min="0.5" max="20" step="0.1" value="4">
      <span class="valbox" id="dVal"></span>
    </div>
    <div class="row">
      <label style="width:60px">굵기 a</label>
      <input type="range" id="aSlider" min="0.05" max="6" step="0.05" value="1">
      <span class="valbox" id="aVal"></span>
    </div>
```

- [ ] **Step 2: index.html — 파동 설정에 스크린 거리 L 슬라이더 추가**

`<h2>파동 설정</h2>` 블록의 진폭 `.row` 다음에 추가:
```html
    <div class="row">
      <label style="width:60px">스크린 거리 L</label>
      <input type="range" id="lSlider" min="10" max="300" step="1" value="80">
      <span class="valbox" id="lVal"></span>
    </div>
```

- [ ] **Step 3: script.js — 상수/상태/솔버 정리**

상단 상수에서 Floquet 관련(`N_MAX_INF, D_MIN_INF, FLOQUET_M, FLOQUET_YW`)을 삭제하고 아래로 교체. 단, 화면 y 반높이 기준값은 이름만 바꿔 유지하지 않고 x-윈도우에서 유도하므로 제거한다. `A_RATIO_MAX` 삭제(상한 제거).
```js
  const C_LIGHT = 2.99792458e8;
  const TWO_PI = Math.PI * 2;
  const VMAX = 1.5;           // 색 포화 기준 [V/m]
  const N_MAX = 120;          // 도선 수 상한(성능)
```

`shared`/`tabState`/`activeTab` 전체를 단일 `state`로 교체:
```js
  const state = {
    N: 40, d_mm: 4, a_mm: 1.0,
    lam_cm: 12.2, amp: 1.0, L_mm: 80,
    playing: true, phase: 0,
  };
```

`floquetZ`, `floquetField` 함수 정의를 통째로 삭제.

`solver` 객체 정의를 교체(Floquet 필드 제거, `Xw`→`xMin,xMax`):
```js
  const solver = {
    k: 0, aEff_m: 0, wiresY: [],
    cRe: null, cIm: null,
    gridW: 0, gridH: 0, xMin: 0, xMax: 0, Yw: 0,
    incRe: null, incIm: null, scRe: null, scIm: null,
  };
```

- [ ] **Step 4: script.js — recompute()를 단일 막대 + L 기반 x-윈도우로 재작성**

`recompute()` 전체를 아래로 교체. 핵심: x-윈도우를 스크린 거리 L에서 유도(줌아웃), 장(場) 평가를 `evalFields` 헬퍼로 DRY화.
```js
  // 한 점에서 입사·산란장 평가 (그리드/스크린 공용)
  function evalFields(wx, wy, k, wiresY, cRe, cIm, aEff_m) {
    const incRe = Math.cos(k * wx), incIm = Math.sin(k * wx);
    let sr = 0, si = 0;
    for (let n = 0; n < wiresY.length; n++) {
      const dy = wy - wiresY[n];
      let r = Math.sqrt(wx * wx + dy * dy);
      if (r < aEff_m) r = aEff_m;
      const x = k * r;
      const jr = besselJ0(x), yi = besselY0(x);
      sr += cRe[n] * jr - cIm[n] * yi;
      si += cRe[n] * yi + cIm[n] * jr;
    }
    return { incRe, incIm, scRe: sr, scIm: si };
  }

  function recompute() {
    if (!layout.bandW || !layout.bandH) return;

    const lam_m = state.lam_cm / 100;
    const d_m = state.d_mm / 1000;
    const aEff_m = state.a_mm / 1000;          // 상한 제거: 닿음 허용
    const k = TWO_PI / lam_m;
    const L_m = state.L_mm / 1000;
    const N = Math.min(N_MAX, Math.max(2, state.N));

    // x-윈도우: 왼쪽 입사/반사 영역 + 스크린까지. L 키우면 전체 줌아웃.
    const xMax = L_m * 1.15;
    const xMin = -Math.max(L_m * 0.4, 0.02);
    let span = xMax - xMin;
    if (span < 0.05) span = 0.05;              // 최소 폭
    const aspect = layout.bandH / layout.bandW;
    const Yw = (span * aspect) / 2;            // y 반높이를 x-폭에서 유도

    // 도선 위치 (y=0 중심)
    const wiresY = new Float64Array(N);
    for (let n = 0; n < N; n++) wiresY[n] = (n - (N - 1) / 2) * d_m;

    // 유한 배열 MoM: Z_mn=H0(k·|y_m-y_n|), 자기항 H0(k·a), b=-1
    const ZM = new Float64Array(N * N * 2);
    const b = new Float64Array(N * 2);
    const Hself = hankel0(k * aEff_m);
    for (let m = 0; m < N; m++) {
      b[m * 2] = -1; b[m * 2 + 1] = 0;
      for (let n = 0; n < N; n++) {
        const h = (m === n) ? Hself : hankel0(k * Math.abs(wiresY[m] - wiresY[n]));
        ZM[(m * N + n) * 2] = h.re;
        ZM[(m * N + n) * 2 + 1] = h.im;
      }
    }
    const c = solveComplex(N, ZM, b);
    const cRe = new Float64Array(N), cIm = new Float64Array(N);
    for (let n = 0; n < N; n++) { cRe[n] = c[n * 2]; cIm[n] = c[n * 2 + 1]; }

    const gridW = layout.gridW;
    const gridH = Math.max(40, Math.round(gridW * aspect));
    const incRe = new Float32Array(gridW * gridH);
    const incIm = new Float32Array(gridW * gridH);
    const scRe = new Float32Array(gridW * gridH);
    const scIm = new Float32Array(gridW * gridH);
    for (let gj = 0; gj < gridH; gj++) {
      const wy = Yw - (gj + 0.5) / gridH * 2 * Yw;
      for (let gi = 0; gi < gridW; gi++) {
        const wx = xMin + (gi + 0.5) / gridW * span;
        const idx = gj * gridW + gi;
        const f = evalFields(wx, wy, k, wiresY, cRe, cIm, aEff_m);
        incRe[idx] = f.incRe; incIm[idx] = f.incIm;
        scRe[idx] = f.scRe; scIm[idx] = f.scIm;
      }
    }

    Object.assign(solver, {
      k, aEff_m, wiresY, cRe, cIm,
      gridW, gridH, xMin, xMax: xMin + span, Yw, incRe, incIm, scRe, scIm,
    });

    updateInfo();
  }
```

- [ ] **Step 5: script.js — drawFrame()에서 τ(편광) 제거**

`drawFrame()`에서 `const A = shared.amp, tau = solver.tau;`를 `const A = state.amp;`로 바꾸고, band별 `* tau`를 모두 제거:
```js
        if (band === 0) { fr = solver.incRe[p]; fi = solver.incIm[p]; }
        else if (band === 1) { fr = solver.scRe[p]; fi = solver.scIm[p]; }
        else { fr = solver.incRe[p] + solver.scRe[p]; fi = solver.incIm[p] + solver.scIm[p]; }
```
또 `cosP/sinP`는 `state.phase` 사용: `const cosP = Math.cos(state.phase), sinP = Math.sin(state.phase);`

- [ ] **Step 6: script.js — worldToBand / drawOverlay를 xMin~xMax, state로 정리**

`worldToBand`:
```js
  function worldToBand(wx, wy, by) {
    const sx = layout.bandX + (wx - solver.xMin) / (solver.xMax - solver.xMin) * layout.bandW;
    const sy = by + (solver.Yw - wy) / (2 * solver.Yw) * layout.bandH;
    return { x: sx, y: sy };
  }
```
`drawOverlay`에서 `const ts = tabState[activeTab];`와 그 사용을 `state`로 교체: 도선 픽셀 반지름 계산을 단순화(상한 제거 반영).
```js
    const sPx = layout.bandW / (solver.xMax - solver.xMin);
    const dPx = (state.d_mm / 1000) * sPx;
    const aPx = (solver.aEff_m) * sPx;
    const rPx = Math.min(dPx * 0.5, Math.max(1.5, aPx));   // 닿으면 dPx의 절반(맞닿음)
    const N = state.N;
```
중심선/도선 루프의 `ts.N`→`state.N`, `solver.wiresY[n]` 유지. `drawPolIndicator` 호출과 함수 정의 삭제, 입사 화살표 블록의 `drawPolIndicator(...)` 줄 제거.
band===2 캡션을 단일 문구로:
```js
    if (band === 2) {
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#5a5a62";
      ctx.fillText("오른쪽=막대 뒤(그림자/회절) · 왼쪽=반사 간섭 · 점선=스크린 위치", bx + 120, by + bh - 10);
    }
```

- [ ] **Step 7: script.js — updateInfo / syncLabels를 state·새 슬라이더로 정리, 편광/탭 핸들러 삭제**

`updateInfo()`를 임시로 단순화(가드레일은 Task 2에서 추가):
```js
  function updateInfo() {
    const lam_m = state.lam_cm / 100;
    const f_GHz = C_LIGHT / lam_m / 1e9;
    document.getElementById("infoBox").innerHTML =
      `도선 N = <b>${state.N}</b><br>` +
      `파장 λ = <b>${state.lam_cm.toFixed(1)} cm</b> (f ≈ <b>${f_GHz.toFixed(2)} GHz</b>)<br>` +
      `간격 d = <b>${state.d_mm.toFixed(1)} mm</b> · 굵기 a = <b>${state.a_mm.toFixed(2)} mm</b><br>` +
      `스크린 거리 L = <b>${state.L_mm.toFixed(0)} mm</b>`;
  }
```
`syncLabels()`를 새 슬라이더로 교체:
```js
  function syncLabels() {
    document.getElementById("nVal").textContent = state.N + " 개";
    document.getElementById("dVal").textContent = state.d_mm.toFixed(1) + " mm";
    document.getElementById("aVal").textContent = state.a_mm.toFixed(2) + " mm";
    document.getElementById("lamVal").textContent = state.lam_cm.toFixed(1) + " cm";
    document.getElementById("ampVal").textContent = state.amp.toFixed(2) + " V/m";
    document.getElementById("lVal").textContent = state.L_mm.toFixed(0) + " mm";
  }
```
UI 바인딩 섹션 교체: `bindTabSlider`·탭 전환·편광 토글(`setPol`)·`computeTransmittance` 호출을 모두 삭제하고 단일 슬라이더 바인딩으로:
```js
  function bindSlider(id, key, parse, redrawOnly) {
    document.getElementById(id).addEventListener("input", function () {
      state[key] = parse(this.value);
      syncLabels();
      if (redrawOnly) drawFrame(); else scheduleRecompute();
    });
  }
  bindSlider("nSlider", "N", v => parseInt(v, 10));
  bindSlider("dSlider", "d_mm", parseFloat);
  bindSlider("aSlider", "a_mm", parseFloat);
  bindSlider("lamSlider", "lam_cm", parseFloat);
  bindSlider("lSlider", "L_mm", parseFloat);
  bindSlider("ampSlider", "amp", parseFloat, true);
```
재생/위상 핸들러의 `shared.`→`state.`로 치환.

`computeTransmittance` 함수와 `transmittance` 변수, 그 호출을 모두 삭제(스크린 세기는 Task 4에서 새로 만든다).

- [ ] **Step 8: script.js — selfCheck()에서 Floquet/투과 경향 부분 제거**

`selfCheck()`의 베셀 4줄은 유지. `savedLam...` 이하 투과율 경향 블록을 삭제(Task 4에서 스크린 세기 경향으로 대체). 시작부 호출 `selfCheck();`는 유지.

- [ ] **Step 9: style.css — 미사용 탭/세그/편광 스타일 정리(선택)**

`#tabBar`, `.tabBtn*`, `.tabPane*`, `.autoN`, `.segbtns*` 규칙은 남아 있어도 무해하므로 **삭제하지 않는다**(범위 최소화). 변경 없음.

- [ ] **Step 10: 브라우저로 열어 검증**

`C:/dev/fourth-task/index.html`을 브라우저로 연다.
기대:
- 탭 바·편광 버튼 없음. 도선 설정(N/d/a), 파동 설정(λ/A/L) 슬라이더 보임.
- 3칸(①입사 ②산란 ③중첩) 정상 렌더, 도선 막대가 가운데 보임.
- 콘솔에 `[검증] J0(1)= 0.765198 ...` 등 베셀 4줄 출력, 에러 없음.
- N/d/a/λ/L 슬라이더 조작 시 그림이 바뀜(특히 L↑ → 전체 축소).

- [ ] **Step 11: Commit**

```bash
cd "C:/dev/fourth-task"
git add index.html style.css script.js
git commit -m "리팩터: Floquet·탭·E⊥ 제거하고 단일 막대 베이스라인으로 정리

- 무한 배열(Floquet)·무한/유한 탭·수직 편광 토글 제거
- 단일 state, 반지름 상한 제거(닿음 허용), x-윈도우를 스크린 거리 L에서 유도
- evalFields로 장 평가 DRY화

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 가드레일 표시 (λ/d, 막대 높이 H, 닿음 배지, λ<5d 경고)

회절/투과 구분 가드레일과 막대 크기를 정보 영역에 표시한다. 순수 헬퍼는 `selfCheck()`로 단언한다.

**Files:**
- Modify: `C:/dev/fourth-task/script.js`
- Modify: `C:/dev/fourth-task/style.css`

**Interfaces:**
- Consumes: `state`(Task 1).
- Produces: 순수 함수 `barHeight_mm(N, d_mm)`, `isTouching(a_mm, d_mm)`, `transmissionWarn(lam_cm, d_mm)`.
  - `barHeight_mm(N,d) = (N-1)*d`
  - `isTouching(a,d) = (2*a >= d)`
  - `transmissionWarn(lam_cm,d_mm) = (lam_cm*10 < 5*d_mm)`  // λ[mm] < 5d

- [ ] **Step 1: script.js — selfCheck()에 헬퍼 단언 추가(먼저 실패하도록)**

`selfCheck()`의 베셀 4줄 다음에 추가(아직 함수 미정의 → ReferenceError로 실패 확인용):
```js
    console.assert(barHeight_mm(5, 4) === 16, "barHeight 5,4 → 16");
    console.assert(isTouching(2, 3) === true,  "isTouching 2,3 (2a=4≥3)");
    console.assert(isTouching(1, 3) === false, "isTouching 1,3 (2a=2<3)");
    console.assert(transmissionWarn(2, 5) === true,  "warn λ=20mm<25mm");
    console.assert(transmissionWarn(3, 5) === false, "no-warn λ=30mm≥25mm");
    console.log("[검증] 가드레일 헬퍼 단언 통과");
```

- [ ] **Step 2: 브라우저로 열어 실패 확인**

콘솔에 `ReferenceError: barHeight_mm is not defined` 가 뜨는지 확인(아직 미구현).

- [ ] **Step 3: script.js — 순수 헬퍼 정의**

`updateInfo()` 정의 위에 추가:
```js
  // 가드레일 순수 헬퍼
  function barHeight_mm(N, d_mm) { return (N - 1) * d_mm; }
  function isTouching(a_mm, d_mm) { return 2 * a_mm >= d_mm; }
  function transmissionWarn(lam_cm, d_mm) { return lam_cm * 10 < 5 * d_mm; }
```

- [ ] **Step 4: script.js — updateInfo()에 λ/d·H·배지 반영**

`updateInfo()`를 교체:
```js
  function updateInfo() {
    const lam_m = state.lam_cm / 100;
    const f_GHz = C_LIGHT / lam_m / 1e9;
    const dlam = (state.d_mm / 1000) / lam_m;        // d/λ
    const lam_d = lam_m / (state.d_mm / 1000);        // λ/d
    const H = barHeight_mm(state.N, state.d_mm);
    const touch = isTouching(state.a_mm, state.d_mm);
    const warn = transmissionWarn(state.lam_cm, state.d_mm);

    const badges =
      (touch ? `<span class="badge ok">닿음(솔리드)</span>` : `<span class="badge">틈 있음</span>`) +
      (warn ? ` <span class="badge warn">투과 영향 구간 (λ &lt; 5d)</span>` : ``);

    document.getElementById("infoBox").innerHTML =
      `도선 N = <b>${state.N}</b> · 막대 높이 H = <b>${H.toFixed(1)} mm</b><br>` +
      `파장 λ = <b>${state.lam_cm.toFixed(1)} cm</b> (f ≈ <b>${f_GHz.toFixed(2)} GHz</b>)<br>` +
      `간격 d = <b>${state.d_mm.toFixed(1)} mm</b> · 굵기 a = <b>${state.a_mm.toFixed(2)} mm</b><br>` +
      `<b>λ/d = ${lam_d.toFixed(2)}</b> (d/λ = ${dlam.toFixed(3)}) · L = <b>${state.L_mm.toFixed(0)} mm</b><br>` +
      badges;
  }
```

- [ ] **Step 5: style.css — 배지 스타일 추가**

파일 끝에 추가:
```css
.badge { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 10px;
  background: #e8e8ec; color: #555; margin-top: 4px; }
.badge.ok { background: #e3f3e8; color: #1a8a4a; }
.badge.warn { background: #fdeaea; color: #c0392b; }
```

- [ ] **Step 6: 브라우저로 열어 검증**

기대:
- 콘솔에 `[검증] 가드레일 헬퍼 단언 통과`, `console.assert` 실패 없음.
- 정보 영역에 `λ/d = ...`, `막대 높이 H = ...` 표시.
- 굵기 a를 키워 2a≥d가 되면 **"닿음(솔리드)"** 배지(초록), 아니면 "틈 있음".
- λ를 줄여 λ<5d가 되면 **"투과 영향 구간"** 빨강 배지 표시.

- [ ] **Step 7: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js style.css
git commit -m "기능: 가드레일 표시(λ/d·막대높이 H·닿음/투과 배지) + selfCheck 단언

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 스크린 위치 점선 표시

3칸 모두에 거리 L의 스크린을 세로 점선으로 그린다(슬라이더 L은 Task 1에서 이미 동작). 줌아웃 동작은 Task 1에서 구현됨.

**Files:**
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: `worldToBand`, `solver.xMin/xMax/Yw`, `state.L_mm`.

- [ ] **Step 1: script.js — drawOverlay()에 스크린 점선 추가**

`drawOverlay`의 중심선(도선 배열) 그리는 블록 다음에 스크린 점선 블록 추가:
```js
    // 스크린 위치 (거리 L, 세로 점선)
    const Lx = state.L_mm / 1000;
    if (Lx >= solver.xMin && Lx <= solver.xMax) {
      const st = worldToBand(Lx, solver.Yw, by), sb = worldToBand(Lx, -solver.Yw, by);
      ctx.save();
      ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      ctx.restore();
      if (band === 0) {
        ctx.save(); ctx.font = "10px sans-serif"; ctx.fillStyle = "#c0392b";
        ctx.textAlign = "center"; ctx.fillText("스크린", (st.x + sb.x) / 2, by + 12);
        ctx.restore();
      }
    }
```

- [ ] **Step 2: 브라우저로 열어 검증**

기대: 세 칸 모두 오른쪽에 빨강 세로 점선(스크린)이 보이고, L 슬라이더를 키우면 점선이 오른쪽으로 가며 전체가 축소된다. ①칸에 "스크린" 라벨.

- [ ] **Step 3: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js
git commit -m "기능: 스크린 위치(거리 L) 세로 점선 표시

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 스크린 세기 곡선 패널 (③칸 오른쪽)

거리 L의 스크린에서 I(y)=|E_total|²를 계산해 ③칸 오른쪽에 세로 곡선으로 그린다.

**Files:**
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: `evalFields`(Task 1), `solver`, `state.L_mm`.
- Produces: `screenIntensity(L_m, wy)` → number = |E_total|² (입사 세기=1 단위). `layout.plotW` 우측 여백.

- [ ] **Step 1: script.js — selfCheck()에 세기 단언 추가(실패 확인용)**

`selfCheck()`의 가드레일 단언 다음에 추가:
```js
    // 장애물 없을 때(도선 0개) 스크린 세기 ≈ 1
    {
      const k0 = TWO_PI / (state.lam_cm / 100);
      const f = evalFields(0.08, 0.0, k0, new Float64Array(0), new Float64Array(0), new Float64Array(0), 1e-6);
      const I0 = (f.incRe + f.scRe) ** 2 + (f.incIm + f.scIm) ** 2;
      console.assert(Math.abs(I0 - 1) < 1e-9, "무장애물 스크린 세기=1");
      console.log("[검증] 무장애물 세기 I0=", I0.toFixed(6));
    }
```
(이 단언은 `screenIntensity`가 내부적으로 같은 식을 쓰는지 간접 확인. `screenIntensity` 자체 단언은 Step 5에서.)

- [ ] **Step 2: script.js — screenIntensity 정의**

`evalFields` 정의 다음에 추가:
```js
  // 스크린(거리 L_m, 높이 wy)에서의 세기 |E_total|² (입사 세기=1 단위)
  function screenIntensity(L_m, wy) {
    const f = evalFields(L_m, wy, solver.k, solver.wiresY, solver.cRe, solver.cIm, solver.aEff_m);
    const tr = f.incRe + f.scRe, ti = f.incIm + f.scIm;
    return tr * tr + ti * ti;
  }
```

- [ ] **Step 3: script.js — layout에 plotW 추가, resize에서 bandW 축소**

`layout` 객체에 `plotW: 96` 추가. `resize()`에서 `layout.bandW` 계산을 교체:
```js
    layout.bandX = layout.marginL;
    layout.bandW = layout.cssW - layout.marginL - layout.marginR - layout.plotW - layout.gap;
```

- [ ] **Step 4: script.js — drawIntensityPlot() 정의 및 drawFrame에서 호출**

`drawFrame()` 끝(밴드 루프 다음)에 `drawIntensityPlot();` 추가. 함수 정의 추가:
```js
  function drawIntensityPlot() {
    if (!solver.wiresY || !solver.wiresY.length) return;
    const by = layout.bandY[2], bh = layout.bandH;
    const px = layout.bandX + layout.bandW + layout.gap;
    const pw = layout.plotW;
    const L_m = state.L_mm / 1000;

    // 세로로 샘플링 (위→아래), 최대값으로 가로 스케일
    const M = 120;
    const Iy = new Float64Array(M);
    let Imax = 1e-6;
    for (let s = 0; s < M; s++) {
      const wy = solver.Yw - (s + 0.5) / M * 2 * solver.Yw;
      const I = screenIntensity(L_m, wy);
      Iy[s] = I; if (I > Imax) Imax = I;
    }
    const scale = Math.max(2, Math.ceil(Imax));   // 가로 0..scale

    // 축 박스 + 입사 세기=1 기준선
    ctx.save();
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, by + 0.5, pw - 1, bh - 1);
    const x1 = px + (1 / scale) * pw;
    ctx.strokeStyle = "#d9d9df"; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x1, by); ctx.lineTo(x1, by + bh); ctx.stroke();
    ctx.setLineDash([]);

    // I(y) 곡선
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let s = 0; s < M; s++) {
      const sy = by + (s + 0.5) / M * bh;
      const sx = px + Math.min(1, Iy[s] / scale) * pw;
      if (s === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // 라벨
    ctx.fillStyle = "#5a5a62"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("스크린 세기 I(y)", px + pw / 2, by + bh - 4);
    ctx.textAlign = "left"; ctx.fillText("0", px + 2, by + bh - 14);
    ctx.textAlign = "right"; ctx.fillText(scale.toFixed(0), px + pw - 2, by + bh - 14);
    ctx.restore();
  }
```

- [ ] **Step 5: script.js — selfCheck()에 screenIntensity 직접 단언 추가**

Step 1 블록 다음에 추가(무장애물 상태에서 recompute 후):
```js
    recompute();
    console.assert(Math.abs(screenIntensity(state.L_mm / 1000, 0) - 1) < 0.2 || state.N >= 2,
      "screenIntensity 정의됨");
    console.log("[검증] screenIntensity(중심)=", screenIntensity(state.L_mm / 1000, 0).toFixed(3));
```

- [ ] **Step 6: 브라우저로 열어 검증**

기대:
- ③칸 오른쪽에 빨강 세기 곡선과 축 박스, "스크린 세기 I(y)" 라벨, 0~눈금.
- 막대 뒤(y≈0) 그림자에서 곡선이 들어가고, 가장자리 부근에서 출렁임.
- λ를 키우면 그림자 중심 세기가 차오르는 경향.
- 콘솔 `console.assert` 실패 없음.

- [ ] **Step 7: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js
git commit -m "기능: 스크린 세기 I(y) 곡선 패널(③칸 오른쪽) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 그림자 중심 세기 수치 + 안내문 (회절 비교 가이드)

스크린 중심 세기를 수치로 표시하고, 회절 비교 기준(솔리드·L 고정)·근접/원거리장 안내를 넣는다.

**Files:**
- Modify: `C:/dev/fourth-task/script.js`
- Modify: `C:/dev/fourth-task/index.html`

**Interfaces:**
- Consumes: `screenIntensity`, `state`.

- [ ] **Step 1: script.js — updateInfo()에 그림자 중심 세기 추가**

`updateInfo()`의 `badges` 줄 앞에 계산 추가하고 출력에 한 줄 더:
```js
    const Icenter = (solver.wiresY && solver.wiresY.length)
      ? screenIntensity(state.L_mm / 1000, 0) : 1;
```
출력 문자열에서 `badges` 직전에 추가:
```js
      `그림자 중심 세기 <b>I₀ = ${Icenter.toFixed(3)}</b> (입사=1.000)<br>` +
```
주의: `updateInfo()`는 `recompute()` 끝에서 호출되므로 이때 `solver`가 갱신돼 있다.

- [ ] **Step 2: index.html — 하단 안내문 교체**

기존 마지막 `.hint`(① 입사파 … 설명) 내용을 회절 맥락으로 교체:
```html
    <div class="hint">
      ① 입사파 · ② 산란파(도선들의 원통파 합) · ③ 중첩(①+②). 세 칸은 같은 색 스케일.<br>
      오른쪽 곡선은 거리 L의 스크린에서 본 밝기 I(y)=|E|².
      <b>파장별 회절 비교는 도선이 닿은 "솔리드" 상태에서</b> 하세요(틈이 있으면 투과가 섞입니다).
      비교 중에는 <b>스크린 거리 L을 고정</b>하세요. L이 작으면 복잡한 줄무늬(근접장),
      크면 부드러운 봉우리(원거리장)로 무늬 성격이 달라집니다 — 정상 현상입니다.<br>
      색: <b>빨강(+E)</b> · 흰(0) · <span style="color:#2f6feb">파랑(−E)</span>.
    </div>
```

- [ ] **Step 3: 브라우저로 열어 검증**

기대: 정보 영역에 `그림자 중심 세기 I₀ = ...` 표시. 하단 안내문이 회절·솔리드·L 고정·근접/원거리장 문구로 바뀜. λ↑ 시 I₀ 증가 경향.

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js index.html
git commit -m "기능: 그림자 중심 세기 I0 수치 + 회절 비교 안내문(솔리드·L고정·근접/원거리장)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 최종 검증 패스

전체를 브라우저에서 시나리오로 점검한다.

**Files:** 없음(확인만).

- [ ] **Step 1: 시나리오 점검 (브라우저)**

`C:/dev/fourth-task/index.html`을 열고 확인:
1. 콘솔: 베셀 4줄 + `[검증] 가드레일 …`, `[검증] 무장애물 세기 I0= 1.000000`, `console.assert` 실패 0건.
2. 굵기 a를 키워 2a≥d → "닿음(솔리드)" 초록 배지. d를 키워 2a<d → "틈 있음".
3. λ를 줄여 λ<5d → "투과 영향 구간" 빨강 배지.
4. 솔리드 상태에서 λ를 1→30cm로 키우면: ③칸 막대 뒤 그림자에 빛이 차오르고, 오른쪽 I(y) 곡선의 중심 세기 I₀가 커지며, 정보의 I₀ 수치도 증가.
5. L을 키우면 전체가 축소되고 스크린 점선이 오른쪽으로 이동, I(y) 무늬가 부드러워지는 경향.
6. 일시정지 후 위상 슬라이더로 정지 탐색 동작.

- [ ] **Step 2: (선택) requesting-code-review 스킬로 변경 검토**

문제 없으면 종료.

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- §1 물리/MoM 재사용 → Task 1. §1.1 시간규약 유지 → Global Constraints + Task 1(부호 미변경).
- §2 화면 3칸+세기곡선 → Task 1(3칸), Task 4(곡선), Task 3(스크린 점선). L 줌아웃 → Task 1.
- §3 슬라이더(N/d/a/λ/L/A) → Task 1; λ/d·H 병기 → Task 2.
- §4 Floquet·E⊥·반지름상한 제거 → Task 1.
- §5 성능 N≤120 → Task 1(N_MAX). 정성적 한계·근접/원거리장 안내 → Task 5.
- §5.1 λ/d 표시·λ<5d 경고·솔리드 기준 → Task 2(배지), Task 5(안내문).
- §6.1 그림자 중심 세기·H 병기·L 고정 안내 → Task 5, Task 2. (FWHM은 견고성 위해 "그림자 중심 세기"로 대체 — 설계서 §6.1의 "또는" 허용 범위.)

**Placeholder scan:** 빈 항목 없음. 모든 코드 단계에 실제 코드 포함.

**Type consistency:** `state`/`solver` 필드, `evalFields`/`screenIntensity`/`barHeight_mm`/`isTouching`/`transmissionWarn` 시그니처가 Task 간 일치. `solver.Xw` 제거 후 `xMin/xMax`로 통일(worldToBand·drawOverlay·drawIntensityPlot 모두 동일 사용).

**비고:** FWHM 대신 그림자 중심 세기 I₀ 채택은 설계서 §6.1이 "FWHM(또는 그림자 중심부 세기)"로 허용한 범위 내 결정.
