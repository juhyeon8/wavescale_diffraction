# 금속 막대 회절 시뮬레이션 — 뷰 개선 + 관찰 조건 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 금속 막대 회절 시뮬레이션(`C:/dev/fourth-task`)에서 "장애물 크기 H에 비해 파장 λ가 길수록
회절이 잘 일어난다(λ/H가 핵심)"를 학습자가 한눈에 볼 수 있도록, 뷰 왜곡을 줄이고
λ/H·Fresnel 수 지표·솔리드 모드·그림자 폭 지표를 추가한다.

**Architecture:** 기존 EFIE 기반 MoM 물리 엔진(`besselJ0/Y0`, `hankel0`, `solveComplex`, `evalFields`,
`screenIntensity`, `recompute()`의 행렬 구성)은 전혀 건드리지 않는다. 이번 작업은 전부
뷰 지오메트리(`computeBaseAndGrid`)·오버레이(`drawOverlay`)·정보 표시(`updateInfo`)·UI(`index.html`,
모드 토글)·`style.css` 계층만 수정한다. 솔리드 모드는 `state.N/d_mm/a_mm`를 자동 산출해서 채우는
방식으로 구현해 솔버가 두 모드를 그대로 공유한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 없음), Canvas 2D. ES 모듈·fetch 미사용 → 더블클릭으로 열림.

## Global Constraints

- **3파일만**: `index.html` / `style.css` / `script.js`. 새 파일·ES 모듈·fetch·npm 의존성 도입 금지.
- **절대 변경 금지**: `besselJ0`, `besselY0`, `hankel0`, `solveComplex`, `evalFields`, `screenIntensity`,
  `recompute()` 안의 MoM 행렬 구성 로직, `colorFor`. 이번 작업은 뷰/레이아웃/UI/정보표시 계층만 수정한다.
- **검증 방식**: 테스트 러너 없음. 순수 함수는 `selfCheck()`에 `console.assert` 단언을 추가하고,
  **브라우저로 `index.html`을 열어 DevTools 콘솔과 화면을 확인**한다.
- **모든 UI 텍스트·주석은 한국어**. 기존 코드 스타일(IIFE, 2-space, 한국어 주석) 유지.
- **요청 범위 밖 코드·서식은 건드리지 않는다.**
- 단위 규약 유지: λ는 cm, d·a·L·H는 mm, 내부 계산은 m.
- 설계 근거는 `docs/superpowers/specs/2026-07-01-zoom-and-view-design.md`의 §13~§17에 기록되어 있다
  (특히 §13.3: H=150mm·L=100mm 조합에서는 막대 가시성 하한이 등방 기준을 이겨 ②산란파가 원형으로
  보이지 않는 것이 **사용자가 확인한 의도된 동작**이다 — 버그 아님).
- Task마다 끝에 **브라우저로 열어 검증**하는 단계가 있다. 각 Task 완료 후 커밋한다(기존 프로젝트 관례:
  Co-Authored-By 라인 포함).

---

## File Structure

- `script.js` — `computeBaseAndGrid()` 재작성(등방+하한), 새 순수 헬퍼(`chooseBaseYw`, `lamHRatio`,
  `lamHBadge`, `fresnelNumber`, `fresnelBadge`, `computeSolidWireLayout`, `findShadowRegion`,
  `computeShadowProfile`), `drawOverlay()`에 H 치수선·축척비 라벨 추가, `updateInfo()` 확장,
  모드 상태(`state.mode`/`syncActivePhysics`/`applyModeUI`) 추가, `drawIntensityPlot()`이 그림자
  음영을 그리도록 수정, `selfCheck()` 확장, 슬라이더 바인딩 추가/변경.
- `index.html` — 모드 토글 버튼, H 슬라이더 행, 하단 안내문 갱신.
- `style.css` — `.info .lamH` 스타일 추가(그 외 기존 `.segbtns`/`.row`/`.badge` 재사용, 신규 스타일
  최소화).

전체가 한 관찰 목표(λ/H 비교)를 위한 연결된 변경이라 단일 계획으로 둔다.

---

## Task 1: 뷰 등방화 + 가로 범위를 현재 L 기준으로

가로 범위를 `L_MAX`(슬라이더 최댓값) 대신 현재 스크린 거리 `L`에서 유도하고, 세로 범위를
1:1 등방 기준으로 역산하되 막대 가시성 하한으로 보정한다. 설계 근거: 위 설계서 §13.

**Files:**
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: 기존 `state.L_mm/N/d_mm`, `layout.bandW/bandH`, `ZOOM_MIN`.
- Produces: 순수 함수 `chooseBaseYw(span, aspect, H_m)` → `{ baseYw, isotropic, scaleRatio }`.
  `view` 객체에 `isotropic`(boolean), `scaleRatio`(number) 필드 추가(기존 `zoomFactor`와 함께).

- [ ] **Step 1: script.js — `selfCheck()`에 `chooseBaseYw` 단언 추가(먼저 실패하도록)**

`selfCheck()`의 베셀 4줄 다음, 기존 가드레일 단언 앞에 추가:
```js
    {
      const r1 = chooseBaseYw(0.1, 1.0, 0.02);
      console.assert(!r1.isotropic, "chooseBaseYw: H 하한이 이겨야 함(0.069>0.05)");
      const r2 = chooseBaseYw(1.0, 1.0, 0.001);
      console.assert(r2.isotropic, "chooseBaseYw: 등방 기준이 이겨야 함(0.5>0.058)");
    }
```

- [ ] **Step 2: 브라우저로 열어 실패 확인**

`C:/dev/fourth-task/index.html`을 열고 콘솔에서 `ReferenceError: chooseBaseYw is not defined`가
뜨는지 확인(아직 미구현).

- [ ] **Step 3: script.js — `chooseBaseYw` 정의 및 `computeBaseAndGrid()` 재작성**

`computeBaseAndGrid()` 정의 전체를 아래로 교체(기존 `L_MAX_M`·`Y_MARGIN_M` 상수와 그 위/아래
주석 블록도 함께 제거):
```js
  // [등방 판정] 1:1 등방 기준 세로 반높이 vs 막대 가시성 하한, 큰 쪽 채택.
  // 순수 함수 — selfCheck()에서 단언.
  function chooseBaseYw(span, aspect, H_m) {
    const isoYw = (span * aspect) / 2;
    const floorYw = 1.15 * (H_m / 2 + 0.05);
    const baseYw = Math.max(isoYw, floorYw);
    return { baseYw, isotropic: baseYw === isoYw, scaleRatio: (2 * baseYw) / (aspect * span) };
  }

  // base: 줌 100%일 때 뷰.
  // 가로(x)는 "현재" 스크린 거리 L 기준(전파 방향) — L이 바뀌면 recompute가 다시 계산한다.
  // 세로(y)는 1:1 등방(가로와 같은 미터/픽셀 축척)을 우선하되, 막대(H) 전체+여백이
  // 항상 보이도록 하한을 둔다(§13). 하한이 이기면 등방이 깨지고, ②밴드에 축척비를 표기한다.
  function computeBaseAndGrid() {
    const L_m = state.L_mm / 1000;
    const baseXmax = L_m * 1.15;
    const baseXmin = -Math.max(L_m * 0.4, 0.02);
    const span = baseXmax - baseXmin;
    const aspect = layout.bandH / layout.bandW;

    const H_m = (state.N - 1) * (state.d_mm / 1000);
    const { baseYw, isotropic, scaleRatio } = chooseBaseYw(span, aspect, H_m);
    view.isotropic = isotropic;
    view.scaleRatio = scaleRatio;

    base.xMin = baseXmin; base.xMax = baseXmax; base.Yw = baseYw;

    // gridWorld: 물리 그리드를 실제로 계산하는 범위. 최대 줌아웃(ZOOM_MIN)까지
    // 미리 커버해둬서, 줌 조작이 절대 recompute()를 다시 트리거하지 않게 한다.
    gridWorld.xMin = baseXmin / ZOOM_MIN;
    gridWorld.xMax = baseXmax / ZOOM_MIN;
    gridWorld.Yw = baseYw / ZOOM_MIN;
  }
```

- [ ] **Step 4: script.js — `view` 객체에 필드 추가**

```js
  // 뷰 전용 상태(물리 state와 분리) — 줌 배율 + 등방 판정 결과(§13)
  const view = { zoomFactor: 1, isotropic: true, scaleRatio: 1 };
```

- [ ] **Step 5: script.js — L 슬라이더를 recompute 트리거로 변경**

```js
  // L이 이제 가로 범위(base.xMax/xMin)의 기준이므로 recompute 필요(§13.2).
  bindSlider("lSlider", "L_mm", parseFloat);
```

- [ ] **Step 6: script.js — ②밴드 안내 라벨을 등방 여부 조건부로 교체**

`drawOverlay()`의 `if (band === 1) { ... }` 블록을 아래로 교체:
```js
    if (band === 1 && !view.isotropic) {
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#5a5a62";
      ctx.fillText(`세로:가로 축척 ×${view.scaleRatio.toFixed(1)} (막대 높이 우선표시)`, bx + 120, by + bh - 10);
    }
```

- [ ] **Step 7: 브라우저로 열어 검증**

`C:/dev/fourth-task/index.html`을 열고 확인:
- 콘솔에 `console.assert` 실패 없음(Step 1 단언 포함).
- 기본값(N=40,d=4,L=80)에서는 ②밴드에 "세로:가로 축척 ×N.N (막대 높이 우선표시)" 라벨이 보임
  (H=156mm가 등방 기준보다 크므로 하한이 이김 — §13.3에서 확인된 의도된 동작).
- **등방이 실제로 작동하는지 확인**: 개수 N을 최소(2)로, 간격 d를 최소(0.5mm)로 낮추고
  L을 최대(300mm)로 올린 뒤 ②밴드를 보면 축척비 라벨이 사라지고(또는 ×1.0에 가까워지고)
  산란파 파문이 원에 가깝게 보여야 함.
- L 슬라이더를 움직이면 화면이 즉시 바뀌지 않고(디바운스 150ms) 잠깐 뒤 recompute 콘솔 로그가
  찍히며 다시 그려짐 — 기존엔 즉시 반응했던 것과 달라진 점(의도됨, §13.4).
- **성능**: 콘솔의 `[성능] recompute()` 값이 N=120 근처에서도 기존(§9.2, ~2초)과 비슷한 수준인지
  확인(현저히 나빠지면 안 됨 — 나빠졌다면 `gridW`가 아닌 다른 원인이므로 보고).

- [ ] **Step 8: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js
git commit -m "$(cat <<'EOF'
기능: 뷰 등방화(1:1) + 가로 범위를 현재 L 기준으로 변경

- computeBaseAndGrid: 세로 범위를 등방(1:1) 기준으로 역산, 막대 가시성 하한(H/2+50mm)*1.15로 보정
- 하한이 등방을 이기면 축척비를 배지로 고지(기존 고정 타원 안내 라벨 제거)
- 가로 범위 기준을 L_MAX에서 현재 L로 변경, L 슬라이더가 recompute를 타도록 변경

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: λ/H 핵심 지표 + Fresnel 수 + 막대 높이(H) 치수선

**Files:**
- Modify: `C:/dev/fourth-task/script.js`
- Modify: `C:/dev/fourth-task/style.css`

**Interfaces:**
- Consumes: `barHeight_mm`(기존), `state`, `worldToBand`(기존).
- Produces: 순수 함수 `lamHRatio(lam_cm, N, d_mm)`, `lamHBadge(ratio)` → `{cls, text}`,
  `fresnelNumber(H_mm, L_mm, lam_cm)`, `fresnelBadge(nf)` → `{cls, text}`.

- [ ] **Step 1: script.js — `selfCheck()`에 지표 단언 추가(먼저 실패하도록)**

가드레일 단언(`barHeight_mm` 등) 다음에 추가:
```js
    console.assert(lamHBadge(0.1).text.includes("그림자 뚜렷"), "lamHBadge <0.3");
    console.assert(lamHBadge(0.5).text.includes("전이"), "lamHBadge 0.3~1");
    console.assert(lamHBadge(2).text.includes("감싸"), "lamHBadge >=1");
    console.assert(fresnelBadge(5).text.includes("기하"), "fresnelBadge >3");
    console.assert(fresnelBadge(1).text.includes("전이"), "fresnelBadge 0.5~3");
    console.assert(fresnelBadge(0.1).text.includes("메워짐"), "fresnelBadge <0.5");
    console.assert(Math.abs(lamHRatio(12, 5, 4) - 7.5) < 1e-9, "lamHRatio(12,5,4)=7.5");
    console.assert(Math.abs(fresnelNumber(16, 100, 12) - (8 * 8) / (100 * 120)) < 1e-9, "fresnelNumber(16,100,12)");
```

- [ ] **Step 2: 브라우저로 열어 실패 확인**

콘솔에 `ReferenceError: lamHBadge is not defined`가 뜨는지 확인.

- [ ] **Step 3: script.js — 순수 헬퍼 정의**

가드레일 헬퍼(`barHeight_mm` 등) 정의 바로 다음에 추가:
```js
  // λ/H 핵심 지표 + Fresnel 수 — 순수 헬퍼(§14)
  function lamHRatio(lam_cm, N, d_mm) {
    const H_mm = barHeight_mm(N, d_mm);
    return (lam_cm * 10) / H_mm;                     // λ[mm] / H[mm]
  }
  function lamHBadge(ratio) {
    if (ratio < 0.3) return { cls: '', text: '그림자 뚜렷 (빛처럼 직진)' };
    if (ratio < 1) return { cls: 'warn', text: '회절 전이 구간' };
    return { cls: 'ok', text: '장애물을 감싸 돎 (라디오파처럼)' };
  }
  function fresnelNumber(H_mm, L_mm, lam_cm) {
    const lam_mm = lam_cm * 10;
    return Math.pow(H_mm / 2, 2) / (L_mm * lam_mm);
  }
  function fresnelBadge(nf) {
    if (nf > 3) return { cls: '', text: '기하 그림자 구간' };
    if (nf >= 0.5) return { cls: 'warn', text: '전이' };
    return { cls: 'ok', text: '그림자 메워짐' };
  }
```

- [ ] **Step 4: script.js — `updateInfo()`에 λ/H·Fresnel 표시 추가**

`updateInfo()`의 `const badges = ...` 줄 앞에 계산 추가:
```js
    const lamH = lamHRatio(state.lam_cm, state.N, state.d_mm);
    const lamHInfo = lamHBadge(lamH);
    const nF = fresnelNumber(H, state.L_mm, state.lam_cm);
    const nFInfo = fresnelBadge(nF);
```
`document.getElementById("infoBox").innerHTML = ...` 문자열의 맨 앞에 λ/H 줄을 추가하고,
`L = ...<br>` 다음에 Fresnel 줄을 추가(기존 `그림자 중심 세기` 줄과 `badges` 순서는 유지):
```js
    document.getElementById("infoBox").innerHTML =
      `<div class="lamH"><b>λ/H = ${lamH.toFixed(2)}</b> <span class="badge ${lamHInfo.cls}">${lamHInfo.text}</span></div>` +
      `도선 N = <b>${state.N}</b> · 막대 높이 H = <b>${H.toFixed(1)} mm</b><br>` +
      `파장 λ = <b>${state.lam_cm.toFixed(1)} cm</b> (f ≈ <b>${f_GHz.toFixed(2)} GHz</b>)<br>` +
      `간격 d = <b>${state.d_mm.toFixed(1)} mm</b> · 굵기 a = <b>${state.a_mm.toFixed(2)} mm</b><br>` +
      `<b>λ/d = ${lam_d.toFixed(2)}</b> (d/λ = ${dlam.toFixed(3)}) · L = <b>${state.L_mm.toFixed(0)} mm</b><br>` +
      `Fresnel 수 <b>N_F = ${nF.toFixed(2)}</b> <span class="badge ${nFInfo.cls}">${nFInfo.text}</span><br>` +
      `그림자 중심 세기 <b>I₀ = ${Icenter.toFixed(3)}</b> (입사=1.000)<br>` +
      badges;
```

- [ ] **Step 5: style.css — λ/H 강조 스타일 추가**

파일 끝에 추가:
```css
.info .lamH { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
```

- [ ] **Step 6: script.js — `drawOverlay()`에 막대 높이(H) 치수선 추가 (①밴드만)**

`drawOverlay()`의 "진행방향 화살표" 블록(`if (band === 0) { ... "입사파 진행 →" ... }`) 바로
다음에 추가:
```js
    // 막대 높이(H) 치수선 — ①밴드에서만, 줌 추적(worldToBand가 camera 기준이라 자동 반영)
    if (band === 0) {
      const H_m = (state.N - 1) * (state.d_mm / 1000);
      const halfH = H_m / 2;
      const top = worldToBand(0, halfH, by), bot = worldToBand(0, -halfH, by);
      const dimX = Math.max(bx + 6, top.x - 20);
      ctx.save();
      ctx.strokeStyle = "#5a5a62"; ctx.fillStyle = "#5a5a62"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dimX, top.y); ctx.lineTo(dimX, bot.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dimX, top.y); ctx.lineTo(dimX - 3, top.y + 6); ctx.lineTo(dimX + 3, top.y + 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(dimX, bot.y); ctx.lineTo(dimX - 3, bot.y - 6); ctx.lineTo(dimX + 3, bot.y - 6); ctx.closePath(); ctx.fill();
      ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.save(); ctx.translate(dimX - 8, (top.y + bot.y) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(`H = ${(H_m * 1000).toFixed(0)} mm`, 0, 0);
      ctx.restore();
      ctx.restore();
    }
```

- [ ] **Step 7: 브라우저로 열어 검증**

기대:
- 콘솔 `console.assert` 실패 없음.
- 정보 박스 맨 위에 `λ/H = ...` 굵고 큰 글씨 + 구간 배지, `Fresnel 수 N_F = ...` + 구간 배지.
- ①입사파 밴드에 막대 왼쪽으로 세로 치수선(양방향 화살표)과 "H = xx mm" 라벨이 보임.
- 줌 인/아웃 시 치수선이 막대를 계속 따라옴(위치·화살표 길이가 갱신됨).
- N/d를 바꿔 H가 변하면 λ/H·Fresnel 수·배지·치수선 라벨이 함께 갱신됨.

- [ ] **Step 8: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js style.css
git commit -m "$(cat <<'EOF'
기능: λ/H 핵심 지표 + Fresnel 수 배지 + 막대 높이(H) 치수선

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 솔리드 모드 토글 (틈 투과 제거)

**주의**: 이 Task 완료 시점에는 `state.mode` 기본값이 `'wire'`(기존 동작 유지)다. 기본값을
`'solid'`로 바꾸는 것은 Task 5에서 한다(관찰 조건 정리와 함께 묶어서 처리).

**Files:**
- Modify: `C:/dev/fourth-task/index.html`
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: `N_MAX`(기존 상수), `state`(Task 1~2에서 확장됨).
- Produces: 순수 함수 `computeSolidWireLayout(H_mm)` → `{ N, d_mm, a_mm, approxWarn }`.
  `state.mode`('wire'|'solid'), `state.wireN/wireD_mm/wireA_mm`(도선 모드 원본 보존),
  `state.H_mm`, `state.solidApproxWarn`. 함수 `syncActivePhysics()`, `applyModeUI()`.

- [ ] **Step 1: index.html — 모드 토글 버튼 + H 슬라이더 마크업 추가**

`<h2>장애물(도선) 설정</h2>`부터 굵기 `a` 슬라이더 `.row` 끝까지를 아래로 교체:
```html
    <h2>장애물 설정</h2>
    <div class="segbtns" id="modeButtons">
      <button id="modeWireBtn" class="active">도선 배열 모드</button>
      <button id="modeSolidBtn">솔리드 막대 모드</button>
    </div>
    <div id="wireControls">
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
    </div>
    <div id="solidControls" style="display:none">
      <div class="row">
        <label style="width:60px">장애물 높이 H</label>
        <input type="range" id="hSlider" min="20" max="300" step="1" value="150">
        <span class="valbox" id="hVal"></span>
      </div>
    </div>
```
(마크업의 `display:none`은 초기 표시일 뿐이며, 로드 시 `applyModeUI()`가 `state.mode` 기준으로
다시 설정하므로 정확한 초깃값 여부는 중요하지 않다.)

- [ ] **Step 2: script.js — `selfCheck()`에 `computeSolidWireLayout` 단언 추가(먼저 실패하도록)**

가드레일 단언 다음에 추가:
```js
    {
      const r = computeSolidWireLayout(100);
      console.assert(r.N === 101 && Math.abs(r.d_mm - 1.0) < 1e-9 && !r.approxWarn,
        "computeSolidWireLayout(100): N=101,d=1.0mm,경고 없음");
    }
    {
      const r = computeSolidWireLayout(150);
      console.assert(r.N === 120 && r.approxWarn,
        "computeSolidWireLayout(150): N_MAX(120) 도달, d>1mm 근사 경고");
    }
```
참고: 권장 기본값(H=150mm)에서도 N_MAX=120 상한 때문에 `approxWarn`이 뜬다 — d=150/119≈1.26mm로
목표(1mm)를 살짝 넘지만 λ=12cm 기준 λ/d≈95로 여전히 견고한 "닿음" 근사다(버그 아님, 설계서 §15.1).

- [ ] **Step 3: 브라우저로 열어 실패 확인**

콘솔에 `ReferenceError: computeSolidWireLayout is not defined`가 뜨는지 확인.

- [ ] **Step 4: script.js — `state`에 모드 필드 추가**

`state` 객체 정의를 아래로 교체:
```js
  const state = {
    mode: 'wire',                              // 'wire' | 'solid' (기본값은 Task 5에서 'solid'로 변경)
    N: 40, d_mm: 4, a_mm: 1.0,
    wireN: 40, wireD_mm: 4, wireA_mm: 1.0,      // 도선 모드 슬라이더 원본(모드 전환 시 보존)
    H_mm: 150, solidApproxWarn: false,          // 솔리드 모드 슬라이더/경고
    lam_cm: 12.2, amp: 1.0, L_mm: 80,
    playing: true, phase: 0,
  };
```

- [ ] **Step 5: script.js — `computeSolidWireLayout`/`syncActivePhysics` 정의**

가드레일 헬퍼(`barHeight_mm` 등) 다음에 추가:
```js
  // 솔리드 모드: H만으로 N/d/a 자동 산출(도선 맞닿음, d<=1mm 목표) — 순수 함수(§15.1)
  function computeSolidWireLayout(H_mm) {
    const nNeeded = Math.ceil(H_mm / 1) + 1;      // d <= 1mm(=λ_min/10) 목표
    const N = Math.min(N_MAX, Math.max(2, nNeeded));
    const d_mm = H_mm / (N - 1);
    const a_mm = d_mm / 2;                         // 맞닿음
    return { N, d_mm, a_mm, approxWarn: d_mm > 1 };
  }

  // 활성 모드에 따라 recompute()가 읽는 state.N/d_mm/a_mm을 갱신
  function syncActivePhysics() {
    if (state.mode === 'solid') {
      const r = computeSolidWireLayout(state.H_mm);
      state.N = r.N; state.d_mm = r.d_mm; state.a_mm = r.a_mm;
      state.solidApproxWarn = r.approxWarn;
    } else {
      state.N = state.wireN; state.d_mm = state.wireD_mm; state.a_mm = state.wireA_mm;
      state.solidApproxWarn = false;
    }
  }
```

- [ ] **Step 6: script.js — 도선 슬라이더 바인딩을 `wireN/wireD_mm/wireA_mm`으로 변경**

기존 3줄을 아래로 교체:
```js
  function bindWireSlider(id, key) {
    document.getElementById(id).addEventListener("input", function () {
      state[key] = (key === 'wireN') ? parseInt(this.value, 10) : parseFloat(this.value);
      syncActivePhysics();
      syncLabels();
      scheduleRecompute();
    });
  }
  bindWireSlider("nSlider", "wireN");
  bindWireSlider("dSlider", "wireD_mm");
  bindWireSlider("aSlider", "wireA_mm");
```

- [ ] **Step 7: script.js — H 슬라이더 바인딩 + 모드 토글 버튼 + `applyModeUI` 추가**

기존 `bindSlider("lSlider", ...)` 줄 다음(줌 바인딩 이전)에 추가:
```js
  document.getElementById("hSlider").addEventListener("input", function () {
    state.H_mm = parseFloat(this.value);
    syncActivePhysics();
    syncLabels();
    scheduleRecompute();
  });

  const modeWireBtn = document.getElementById("modeWireBtn");
  const modeSolidBtn = document.getElementById("modeSolidBtn");
  function applyModeUI() {
    document.getElementById("wireControls").style.display = (state.mode === 'wire') ? '' : 'none';
    document.getElementById("solidControls").style.display = (state.mode === 'solid') ? '' : 'none';
    modeWireBtn.classList.toggle("active", state.mode === 'wire');
    modeSolidBtn.classList.toggle("active", state.mode === 'solid');
  }
  modeWireBtn.addEventListener("click", () => {
    state.mode = 'wire'; syncActivePhysics(); applyModeUI(); syncLabels(); scheduleRecompute();
  });
  modeSolidBtn.addEventListener("click", () => {
    state.mode = 'solid'; syncActivePhysics(); applyModeUI(); syncLabels(); scheduleRecompute();
  });
```

- [ ] **Step 8: script.js — `syncLabels()`에 H 라벨 추가**

`syncLabels()` 끝에 추가:
```js
    document.getElementById("hVal").textContent = state.H_mm.toFixed(0) + " mm";
```

- [ ] **Step 9: script.js — 시작부에서 `syncActivePhysics()`/`applyModeUI()` 호출**

`syncLabels();` 호출(파일 맨 아래 "시작" 섹션) 바로 앞에 추가:
```js
  syncActivePhysics();
  applyModeUI();
```

- [ ] **Step 10: script.js — `updateInfo()`의 배지를 모드별로 분기**

기존 `const badges = ...` 블록을 아래로 교체:
```js
    const modeBadges = (state.mode === 'solid')
      ? `<span class="badge ok">솔리드(자동)</span>` +
        (state.solidApproxWarn ? ` <span class="badge warn">근사(격자 상한, d&gt;1mm)</span>` : ``)
      : (touch ? `<span class="badge ok">닿음(솔리드)</span>` : `<span class="badge">틈 있음</span>`) +
        (warn ? ` <span class="badge warn">투과 영향 구간 (λ &lt; 5d)</span>` : ``);
```
그리고 `innerHTML` 조립부 맨 끝의 `badges`를 `modeBadges`로 바꾼다.

- [ ] **Step 11: 브라우저로 열어 검증**

기대:
- 콘솔 `console.assert` 실패 없음(Step 2 단언 포함).
- 로드 시 "도선 배열 모드" 버튼이 활성(파란색), N/d/a 슬라이더 보임, H 슬라이더는 숨김(기본값은
  아직 `wire`, Task 5에서 `solid`로 바뀜).
- "솔리드 막대 모드" 클릭 시: N/d/a 슬라이더 숨김, H 슬라이더(20~300mm)만 보임, 정보 박스에
  "솔리드(자동)" 배지. H=150mm에서는 "근사(격자 상한)" 배지도 함께 뜸(Step 2 참고, 의도된 동작).
- H 슬라이더를 20mm 근처로 낮추면 근사 배지가 사라짐(N_MAX 상한 안 걸림).
- 다시 "도선 배열 모드" 클릭 시 이전에 조작했던 N/d/a 값이 그대로 복원됨(사라지지 않음).
- 도선 모드에서는 기존처럼 λ/d·닿음/틈·투과 배지가 정상 동작.

- [ ] **Step 12: Commit**

```bash
cd "C:/dev/fourth-task"
git add index.html script.js
git commit -m "$(cat <<'EOF'
기능: 솔리드 막대 모드 토글 추가 (틈 투과 제거, H 단일 조작)

- state.mode('wire'|'solid'), H 슬라이더(20~300mm)로 N/d/a 자동 산출(맞닿음, d<=1mm 목표)
- 도선 모드 슬라이더 값은 wireN/wireD_mm/wireA_mm에 별도 보존해 모드 왕복 시 유지
- MoM 솔버는 두 모드가 state.N/d_mm/a_mm 공유 — 물리 함수 미변경

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 그림자 정량 지표 강화 (그림자 폭)

**Files:**
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: `screenIntensity`(기존), `base.Yw`(Task 1).
- Produces: 순수 함수 `findShadowRegion(Iy, threshold)` → `{lo, hi} | null`,
  함수 `computeShadowProfile(L_m)` → `{ Iy, Imax, M, region, widthMm }`.

- [ ] **Step 1: script.js — `selfCheck()`에 `findShadowRegion` 단언 추가(먼저 실패하도록)**

지표 단언(Task 2) 다음에 추가:
```js
    {
      const testIy = new Float64Array([1, 1, 0.3, 0.2, 0.1, 0.2, 0.3, 1, 1]);
      const r = findShadowRegion(testIy, 0.5);
      console.assert(r && r.lo === 2 && r.hi === 6, "findShadowRegion 기본 케이스");
    }
    console.assert(findShadowRegion(new Float64Array([1, 1, 1, 1, 1]), 0.5) === null,
      "findShadowRegion 그림자 없음");
```

- [ ] **Step 2: 브라우저로 열어 실패 확인**

콘솔에 `ReferenceError: findShadowRegion is not defined`가 뜨는지 확인.

- [ ] **Step 3: script.js — `findShadowRegion`/`computeShadowProfile` 정의**

`screenIntensity` 정의 다음에 추가:
```js
  // 그림자 폭 지표(§16) — 스크린 I(y)에서 중심(y=0) 기준 I<threshold 연속 구간
  function findShadowRegion(Iy, threshold) {
    const M = Iy.length;
    const c = Math.floor(M / 2);
    if (Iy[c] >= threshold) return null;
    let lo = c, hi = c;
    while (lo > 0 && Iy[lo - 1] < threshold) lo--;
    while (hi < M - 1 && Iy[hi + 1] < threshold) hi++;
    return { lo, hi };
  }

  function computeShadowProfile(L_m) {
    const M = 120;
    const Iy = new Float64Array(M);
    let Imax = 1e-6;
    for (let s = 0; s < M; s++) {
      const wy = base.Yw - (s + 0.5) / M * 2 * base.Yw;
      const I = screenIntensity(L_m, wy);
      Iy[s] = I; if (I > Imax) Imax = I;
    }
    const region = findShadowRegion(Iy, 0.5);
    const worldPerSample = (2 * base.Yw) / M;
    const widthMm = region ? (region.hi - region.lo + 1) * worldPerSample * 1000 : 0;
    return { Iy, Imax, M, region, widthMm };
  }
```

- [ ] **Step 4: script.js — `drawIntensityPlot()`이 `computeShadowProfile()`을 쓰도록 재작성**

`drawIntensityPlot()` 안의 `const M = 120; ... const scale = ...` 블록(자체 Iy 계산 루프)을
아래로 교체(이후 곡선 그리는 코드는 `Iy`/`scale` 변수명을 그대로 쓰므로 안 건드림):
```js
    const profile = computeShadowProfile(L_m);
    const Iy = profile.Iy;
    const scale = Math.max(2, Math.ceil(profile.Imax));   // 가로 0..scale
```
축 박스를 그리는 `ctx.strokeRect(...)` 호출 다음, "전체 높이 기준" 라벨 그리기 전에
그림자 음영을 추가:
```js
    if (profile.region) {
      const { lo, hi } = profile.region;
      const syLo = by + (lo / profile.M) * bh;
      const syHi = by + ((hi + 1) / profile.M) * bh;
      ctx.save();
      ctx.fillStyle = "rgba(192,57,43,0.12)";
      ctx.fillRect(px, syLo, pw, syHi - syLo);
      ctx.restore();
    }
```

- [ ] **Step 5: script.js — `updateInfo()`에 그림자 폭 표시 추가**

`그림자 중심 세기 ...` 줄을 아래로 교체(같은 줄에 그림자 폭 병기):
```js
    const shadowProfile = computeShadowProfile(state.L_mm / 1000);
    const shadowText = shadowProfile.region
      ? `${shadowProfile.widthMm.toFixed(1)} mm`
      : `해당 없음(중심 밝음)`;
```
(이 계산은 `const badges = ...` 또는 `const modeBadges = ...` 선언보다 앞에 추가)
그리고 `innerHTML` 문자열에서:
```js
      `그림자 중심 세기 <b>I₀ = ${Icenter.toFixed(3)}</b> (입사=1.000) · 그림자 폭 <b>${shadowText}</b><br>` +
```

- [ ] **Step 6: 브라우저로 열어 검증**

기대:
- 콘솔 `console.assert` 실패 없음.
- ③밴드 오른쪽 세기 곡선 패널에 옅은 빨강 음영이 그림자 구간(중심부)에 표시됨.
- 정보 박스에 "그림자 폭 = xx.x mm" 표시. λ를 키우면(그림자가 메워지면) 그림자 폭이 줄어들고,
  중심 세기가 0.5를 넘으면 "해당 없음(중심 밝음)"으로 바뀜.

- [ ] **Step 7: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js
git commit -m "$(cat <<'EOF'
기능: 그림자 폭 지표 추가(I<0.5 연속 구간) + 세기 곡선 음영 표시

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 권장 기본값 적용 + 힌트 문구 갱신

**Files:**
- Modify: `C:/dev/fourth-task/script.js`
- Modify: `C:/dev/fourth-task/index.html`

**Interfaces:**
- Consumes: `state`(Task 1~4에서 확장 완료).

- [ ] **Step 1: script.js — 기본값을 관찰이 잘 되는 세팅으로 변경**

`state` 객체 정의를 아래로 교체:
```js
  const state = {
    mode: 'solid',                              // 기본값: 솔리드 모드(관찰 조건 정리, §17)
    N: 40, d_mm: 4, a_mm: 1.0,
    wireN: 40, wireD_mm: 4, wireA_mm: 1.0,
    H_mm: 150, solidApproxWarn: false,
    lam_cm: 12, amp: 1.0, L_mm: 100,
    playing: true, phase: 0,
  };
```

- [ ] **Step 2: index.html — 슬라이더 기본 `value` 속성을 새 기본값과 맞춤**

`lSlider`의 `value="80"`을 `value="100"`으로, `lamSlider`의 `value="12.2"`를 `value="12"`로 변경.

- [ ] **Step 3: index.html — 하단 안내문을 관찰 시나리오로 갱신**

기존 마지막 `.hint` 블록 내용을 아래로 교체:
```html
    <div class="hint">
      ① 입사파 · ② 산란파(도선들의 원통파 합) · ③ 중첩(①+②). 세 칸은 같은 색 스케일.<br>
      오른쪽 곡선은 거리 L의 스크린에서 본 밝기 I(y)=|E|².
      <b>H와 L을 고정하고 λ만 바꿔 보세요</b> — λ/H·Fresnel 수 배지가
      "그림자 뚜렷 → 전이 → 감싸 돎"으로 바뀌는 것과, 그림자 중심 세기·그림자 폭이
      함께 변하는 것을 비교할 수 있습니다.
      <b>파장별 회절 비교는 솔리드 모드(틈 없음)</b>에서 하세요(도선 모드는 틈 사이 투과가
      섞입니다). L이 작으면 복잡한 줄무늬(근접장), 크면 부드러운 봉우리(원거리장)로
      무늬 성격이 달라집니다 — 정상 현상입니다.<br>
      색: <b>빨강(+E)</b> · 흰(0) · <span style="color:#2f6feb">파랑(−E)</span>.
    </div>
```

- [ ] **Step 4: 브라우저로 열어 검증**

기대: 로드 시 솔리드 모드가 기본 활성, H=150mm, L=100mm, λ=12.0cm로 시작. 하단 안내문이 새
문구로 표시. 콘솔 `console.assert` 실패 없음.

- [ ] **Step 5: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js index.html
git commit -m "$(cat <<'EOF'
기능: 권장 기본값(솔리드·H=150mm·L=100mm·λ=12cm) 적용 + 관찰 시나리오 안내문 갱신

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 최종 검증 패스

**Files:** 없음(확인만).

- [ ] **Step 1: 시나리오 점검 (브라우저)**

`C:/dev/fourth-task/index.html`을 열고 확인:
1. 콘솔: 베셀 4줄 + 모든 `[검증]`/`console.assert` 로그, 실패 0건.
2. 로드 시 솔리드 모드, H=150mm, L=100mm, λ=12.0cm로 시작. "근사(격자 상한)" 배지가 떠 있음
   (Task 3 Step 2에서 확인한 대로 H=150mm는 N_MAX 상한에 걸림 — 의도된 동작).
3. **λ 스윕(2→30cm, H=150mm·L=100mm 고정)**: (a) ③밴드에서 그림자가 점점 메워짐,
   (b) 정보 박스의 I₀가 대체로 증가(λ≈2~4cm 근접장 구간의 프레넬 진동 제외)하고,
   "어두운 구간 폭(I<0.5)"은 관측 범위 고정 하에 오히려 넓어짐(그늘이 넓고 얕아짐 —
   설계서 §16 각주 참고, 폭이 아니라 I₀가 회절 강도의 판단 기준), (c) λ/H 배지가
   "그림자 뚜렷 → 전이 → 감싸 돎"으로 바뀜, Fresnel 배지도 함께 바뀜.
4. **원형 파문 확인(별도 조합에서)**: H=150mm·L=100mm 조합은 막대 가시성 하한이 이겨
   ②밴드에 축척비 배지가 뜨고 파문이 눌려 보이는 것이 **정상**이다(설계서 §13.3, 사용자
   확인 완료). 대신 도선 모드에서 N을 작게(예: 6), d를 작게(예: 1mm), L을 크게(예: 280mm
   이상)로 설정하면 축척비 배지가 사라지고 ②밴드 파문이 원형에 가깝게 보이는지 확인한다.
5. **도선 모드 회귀 확인**: "도선 배열 모드" 클릭 → 굵기 a를 키워 2a≥d면 "닿음(솔리드)" 배지,
   λ를 줄여 λ<5d면 "투과 영향 구간" 배지 — 기존 동작 그대로 유지되는지 확인.
6. 일시정지 후 위상 슬라이더로 정지 탐색, 줌 버튼/휠 동작(recompute 재트리거 없이 즉시 반응)
   확인.

- [ ] **Step 2: (선택) requesting-code-review 스킬로 변경 검토**

문제 없으면 종료.

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- 작업 1(뷰 등방화+L 기준 가로 범위) → Task 1. 성능/등방 검증 → Task 1 Step 7, 설계서 §13.3~13.4.
- 작업 2(λ/H·H 치수선·Fresnel) → Task 2.
- 작업 3(솔리드 모드 토글) → Task 3.
- 작업 4(그림자 폭) → Task 4.
- 권장 기본값 + 힌트 문구 → Task 5.
- 완료 기준 시나리오 전체 → Task 6.
- "절대 변경 금지" 목록(besselJ0 등) → 전체 계획에서 어떤 Task도 이 함수들을 건드리지 않음(확인됨).

**Placeholder scan:** 빈 항목 없음. 모든 코드 단계에 실제 코드 포함.

**Type consistency:** `chooseBaseYw`/`lamHRatio`/`lamHBadge`/`fresnelNumber`/`fresnelBadge`/
`computeSolidWireLayout`/`findShadowRegion`/`computeShadowProfile`의 시그니처가 정의 Task와
사용 Task(업데이트되는 `updateInfo`/`drawOverlay`/`drawIntensityPlot`) 간에 일치.
`state.mode`/`wireN`/`wireD_mm`/`wireA_mm`/`H_mm`/`solidApproxWarn` 필드명이 Task 3~5에서 일관.

**알려진 트레이드오프(사용자 확인 완료, 버그 아님):**
- H=150mm·L=100mm(권장 기본값) 조합에서 ②산란파 밴드는 등방이 깨져 파문이 눌려 보임
  (설계서 §13.3). 같은 조합에서 솔리드 모드는 N_MAX 상한 때문에 "근사" 경고 배지가 항상 뜸
  (Task 3 Step 2). 둘 다 명세식을 있는 그대로 구현한 결과이며 사용자가 인지·확인했다.
