# 금속 막대 회절 시뮬레이션 — 그림자 채움률 S̄ + 1:1 관찰 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 금속 막대 회절 시뮬레이션(`C:/dev/fourth-task`)에 (A) 기하 그림자 영역(|y|≤H/2)의
세기 평균 S̄ 지표(프레넬 진동에 강건한 회절 판단 기준)와, (B) 가로:세로 축척이 항상
정확히 1:1인 관찰 모드(스크린 거리 L과 무관하게 회절 퍼짐각을 왜곡 없이 관찰)를 추가한다.

**Architecture:** 물리 엔진(`besselJ0/Y0`, `hankel0`, `solveComplex`, `evalFields`,
`screenIntensity`, `recompute()`의 MoM 행렬 구성)은 전혀 건드리지 않는다. S̄는
`screenIntensity`의 순수 포인트 평가를 100점 샘플링해 평균 내는 정보 표시 계층
작업이다. 1:1 모드는 물리 필드 자체가 L과 무관하다는 점(§20.1)을 이용해, gridWorld를
3분할 뷰(L 기반)와 1:1 뷰(H 기반) 두 몫의 합집합으로 잡아 하나의 솔버 결과를 공유한다
— 모드 전환은 gridH(세로 해상도) 요구치가 실제로 달라질 때만 recompute를 유발한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 없음), Canvas 2D. ES 모듈·fetch 미사용 → 더블클릭으로 열림.

## Global Constraints

- **3파일만**: `index.html` / `style.css` / `script.js`. 새 파일·ES 모듈·fetch·npm 의존성 도입 금지.
- **절대 변경 금지**: `besselJ0`, `besselY0`, `hankel0`, `solveComplex`, `evalFields`, `screenIntensity`,
  `recompute()` 안의 MoM 행렬 구성 로직, `colorFor`. 이번 작업은 지표 계산/뷰/레이아웃/UI
  계층만 수정한다. `recompute()`의 그리드/gridH 산정 로직(계산 위치 결정)은 손대지만,
  MoM 행렬 구성 자체(도선 전류 c 계산)는 건드리지 않는다.
- **검증 방식**: 테스트 러너 없음. 순수 함수는 `selfCheck()`에 `console.assert` 단언을 추가하고,
  **브라우저로 `index.html`을 열어 DevTools 콘솔과 화면을 확인**한다. 렌더링 전용 코드
  (canvas 드로잉)는 selfCheck 단언 없이 브라우저 스크린샷으로 검증한다(기존 관례).
- **모든 UI 텍스트·주석은 한국어**. 기존 코드 스타일(IIFE, 2-space, 한국어 주석) 유지.
- **요청 범위 밖 코드·서식은 건드리지 않는다.**
- 단위 규약 유지: λ는 cm, d·a·L·H는 mm, 내부 계산은 m.
- 설계 근거는 `docs/superpowers/specs/2026-07-02-shadow-fill-ratio-and-1to1-view-design.md`
  §18~§23에 기록되어 있다.
- **λ 스윕 콘솔 표(검증 시나리오)는 앱에 영구 기능으로 넣지 않는다** — Playwright로
  구현 중 직접 확인하는 임시 방법이다(§21).
- **gridH 전략은 "현재 모드 추종"**(§20.4, 사용자 확정): 모드 전환 시 요구 gridH가
  달라질 때만(양방향 모두) 최대 1회 recompute. 같은 모드 안의 줌 조작·(1:1에서의) L
  조작은 recompute를 유발하지 않는다.

---

## File Structure

- `script.js` — 새 순수 함수(`shadowFillRatioFromSamples`, `computeShadowFillRatio`,
  `compute1to1Range`, `unionGridWorld`, `requiredGridH`), 새 상태(`state.viewMode`,
  `state.viewField`, `base1to1`, `camera1to1`, `layout.bandH1to1`), `computeBaseAndGrid()`/
  `computeCamera()`/`recompute()`의 gridH 산정 확장, `switchViewMode()`, 새 렌더 함수
  (`worldToBand1to1`, `drawOverlay1to1`), `drawFrame()` 리팩터링(모드 분기),
  `drawIntensityPlot(by, bh)` 파라미터화 + 기하 그림자 음영/범례, `updateInfo()`에 S̄ 표시,
  `selfCheck()` 확장, L 슬라이더 재바인딩, 뷰모드/필드 버튼 바인딩.
- `index.html` — 뷰모드 토글(3분할/1:1) + 필드 선택(①/②/③) 버튼 마크업, 하단 안내문에
  S̄ 설명 문장 추가.
- `style.css` — 변경 없음(`.segbtns` 기존 스타일 재사용).

Part A(S̄, Task 1~2)와 Part B(1:1 모드, Task 3~4)는 서로 독립적이지만 정보 박스·I(y)
플롯을 공유하므로 하나의 계획으로 정리한다. 구현 순서는 위험도 낮은 S̄ 먼저.

---

## Task 1: 그림자 채움률 S̄ 순수 함수

**Files:**
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: 기존 `screenIntensity(L_m, wy)`, `barHeight_mm(N, d_mm)`.
- Produces: 순수 함수 `shadowFillRatioFromSamples(samples)` → number,
  `computeShadowFillRatio(L_m, H_m, samples=100)` → number. Task 2가 `updateInfo()`에서
  사용한다.

- [ ] **Step 1: script.js — `selfCheck()`에 단언 추가(먼저 실패하도록)**

`findShadowRegion` 관련 단언(script.js:773-774) 바로 다음, "장애물 없을 때" 주석
(775번째 줄) 앞에 추가:
```js
    console.assert(Math.abs(shadowFillRatioFromSamples([0.2, 0.4, 0.6, 0.8]) - 0.5) < 1e-9,
      "shadowFillRatioFromSamples([.2,.4,.6,.8])=0.5");
    console.assert(shadowFillRatioFromSamples([0, 0, 0]) === 0, "shadowFillRatioFromSamples 전부 0 → 0");
```

`console.log("[검증] screenIntensity(중심)=", ...)` 줄(script.js:787) 바로 다음,
`selfCheck()` 함수를 닫는 `}` (788번째 줄) 앞에 추가:
```js
    {
      const H_m = barHeight_mm(state.N, state.d_mm) / 1000;
      const sbar = computeShadowFillRatio(state.L_mm / 1000, H_m);
      console.assert(sbar >= 0, "S̄ ≥ 0");
      console.log("[검증] 그림자 채움률 S̄=", sbar.toFixed(4));
    }
```

- [ ] **Step 2: 브라우저로 열어 실패 확인**

`C:/dev/fourth-task/index.html`을 열고 콘솔에서
`ReferenceError: shadowFillRatioFromSamples is not defined`가 뜨는지 확인.

- [ ] **Step 3: script.js — 함수 정의**

`computeShadowProfile` 정의(script.js:159-172)가 끝나는 `}` 다음, `function recompute()`
(174번째 줄) 앞의 빈 줄에 추가:
```js

  // 그림자 채움률 S̄(§19) — 기하 그림자 |y|≤H/2 구간의 세기 평균. 기하광학이면 0.
  // 순수 함수(표본 배열만 받음) — selfCheck()에서 단언. 상한(≤1) 없음: 경계
  // 회절 무늬가 구간에 들어오면 S̄가 1을 살짝 넘을 수 있다(정상 물리, §19.2).
  function shadowFillRatioFromSamples(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i];
    return sum / samples.length;
  }
  function computeShadowFillRatio(L_m, H_m, samples = 100) {
    const arr = new Array(samples);
    for (let s = 0; s < samples; s++) {
      const wy = -H_m / 2 + (s + 0.5) / samples * H_m;
      arr[s] = screenIntensity(L_m, wy);
    }
    return shadowFillRatioFromSamples(arr);
  }
```

- [ ] **Step 4: 브라우저로 열어 검증**

`C:/dev/fourth-task/index.html`을 열고 확인:
- 콘솔에 `console.assert` 실패 없음(Step 1 단언 포함).
- `[검증] 그림자 채움률 S̄= 0.xxxx` 로그가 찍힘(기본값 H=150mm·L=100mm·λ=12cm 기준
  0과 1 사이의 값).

- [ ] **Step 5: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js
git commit -m "$(cat <<'EOF'
기능: 그림자 채움률 S̄ 순수 함수 추가(기하 그림자 |y|≤H/2 세기 평균)

- shadowFillRatioFromSamples: 표본 배열 평균(순수, selfCheck 단언 대상)
- computeShadowFillRatio: screenIntensity 100점 샘플링으로 S̄ 계산
- selfCheck에 S̄≥0 단언 추가(상한 없음 — 경계 회절 무늬로 1 초과 가능, §19.2)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: S̄ 정보 표시 + 힌트 문구 + I(y) 플롯 기하 그림자 음영

**Files:**
- Modify: `C:/dev/fourth-task/script.js`
- Modify: `C:/dev/fourth-task/index.html`

**Interfaces:**
- Consumes: Task 1의 `computeShadowFillRatio(L_m, H_m)`, 기존 `barHeight_mm`,
  `computeShadowProfile`, `base.Yw`.
- Produces: 없음(표시 전용, 새 인터페이스 없음).

- [ ] **Step 1: script.js — `updateInfo()`에 S̄ 계산 및 표시 추가**

`const nFInfo = fresnelBadge(nF);` 줄(script.js:601) 바로 다음에 추가:
```js
    const H_m = H / 1000;
    const sbar = computeShadowFillRatio(state.L_mm / 1000, H_m);
```

`document.getElementById("infoBox").innerHTML = ...` 문자열(script.js:609-617)에서
`.lamH` div 바로 다음 줄에 S̄ 줄 삽입(순서: S̄ → 기존 나머지):
```js
    document.getElementById("infoBox").innerHTML =
      `<div class="lamH"><b>λ/H = ${lamH.toFixed(2)}</b> <span class="badge ${lamHInfo.cls}">${lamHInfo.text}</span></div>` +
      `그림자 채움률 <b>S̄ = ${sbar.toFixed(3)}</b> (기하광학이면 0)<br>` +
      `도선 N = <b>${state.N}</b> · 막대 높이 H = <b>${H.toFixed(1)} mm</b><br>` +
      `파장 λ = <b>${state.lam_cm.toFixed(1)} cm</b> (f ≈ <b>${f_GHz.toFixed(2)} GHz</b>)<br>` +
      `간격 d = <b>${state.d_mm.toFixed(1)} mm</b> · 굵기 a = <b>${state.a_mm.toFixed(2)} mm</b><br>` +
      `<b>λ/d = ${lam_d.toFixed(2)}</b> (d/λ = ${dlam.toFixed(3)}) · L = <b>${state.L_mm.toFixed(0)} mm</b><br>` +
      `Fresnel 수 <b>N_F = ${nF.toFixed(2)}</b> <span class="badge ${nFInfo.cls}">${nFInfo.text}</span><br>` +
      `그림자 중심 세기 <b>I₀ = ${Icenter.toFixed(3)}</b> (입사=1.000) · 어두운 구간 폭 (I&lt;0.5) <b>${shadowText}</b><br>` +
      modeBadges;
```
(이 문자열은 순서상 이미 S̄ → I₀ → 어두운 구간 폭이 된다. 나머지 줄은 기존과 동일 —
바뀐 부분은 `.lamH` div 다음 줄에 S̄ 줄이 새로 추가된 것뿐이다.)

- [ ] **Step 2: index.html — 힌트 문구에 S̄ 설명 추가**

`"그림자 뚜렷 → 전이 → 감싸 돎"으로 바뀌는 것을 볼 수 있습니다.` 줄(index.html:99)
다음, `λ를 키우면 그림자 중심이...` 문장(100번째 줄) 앞에 삽입:
```html
      <b>그림자 채움률 S̄</b>는 기하광학이라면 0이어야 할 그림자 영역(|y|≤H/2)에
      회절로 흘러 들어온 에너지 비율로, 중심 한 점(I₀)과 달리 프레넬 진동에 덜
      흔들리는 판단 기준입니다.
```

- [ ] **Step 3: script.js — `drawIntensityPlot()`에 기하 그림자 음영 + 범례 추가**

`drawIntensityPlot()` 함수(script.js:382-433) 전체를 아래로 교체(시그니처는 이번
단계에서 아직 바꾸지 않음 — 파라미터화는 Task 4에서 한다):
```js
  function drawIntensityPlot() {
    if (!solver.wiresY || !solver.wiresY.length) return;
    const by = layout.bandY[2], bh = layout.bandH;
    const px = layout.bandX + layout.bandW + layout.gap;
    const pw = layout.plotW;
    const L_m = state.L_mm / 1000;
    const H_m = barHeight_mm(state.N, state.d_mm) / 1000;

    // 세로로 샘플링 (위→아래), 최대값으로 가로 스케일
    // §5: 줌과 무관하게 항상 base.Yw(고정 기준 범위) 전체 높이로 그린다 —
    // 그래야 줌인해도 회절 무늬 전체(중심 봉우리+옆 봉우리들)가 항상 보인다.
    const profile = computeShadowProfile(L_m);
    const Iy = profile.Iy;
    const M = profile.M;
    const scale = Math.max(2, Math.ceil(profile.Imax));   // 가로 0..scale

    // 축 박스
    ctx.save();
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, by + 0.5, pw - 1, bh - 1);

    // 기하 그림자 구간 음영(|y|<H/2) — 파랑, S̄ 계산 구간과 대응(§19.3)
    {
      const halfH = H_m / 2;
      const geomTop = by + (base.Yw - halfH) / (2 * base.Yw) * bh;
      const geomBot = by + (base.Yw + halfH) / (2 * base.Yw) * bh;
      ctx.save();
      ctx.fillStyle = "rgba(47,111,235,0.10)";
      ctx.fillRect(px, geomTop, pw, geomBot - geomTop);
      ctx.restore();
    }
    // 어두운 구간 음영(I<0.5)
    if (profile.region) {
      const { lo, hi } = profile.region;
      const syLo = by + (lo / profile.M) * bh;
      const syHi = by + ((hi + 1) / profile.M) * bh;
      ctx.save();
      ctx.fillStyle = "rgba(192,57,43,0.12)";
      ctx.fillRect(px, syLo, pw, syHi - syLo);
      ctx.restore();
    }

    ctx.fillStyle = "#8a8a92"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("전체 높이 기준", px + pw / 2, by + 12);

    // 범례 — 기하 그림자(파랑) vs 어두운 구간(빨강)
    ctx.font = "9px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(47,111,235,0.6)"; ctx.fillRect(px + 4, by + 20, 7, 7);
    ctx.fillStyle = "#5a5a62"; ctx.fillText("기하(|y|<H/2)", px + 14, by + 27);
    ctx.fillStyle = "rgba(192,57,43,0.6)"; ctx.fillRect(px + 4, by + 31, 7, 7);
    ctx.fillStyle = "#5a5a62"; ctx.fillText("어두운(I<0.5)", px + 14, by + 38);

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

- [ ] **Step 4: 브라우저로 열어 검증**

기대:
- 콘솔 `console.assert` 실패 없음.
- 정보 박스에 "그림자 채움률 S̄ = 0.xxx (기하광학이면 0)"가 λ/H 줄 바로 다음에 보임.
- 하단 힌트 문구에 S̄ 설명 문장이 추가되어 보임.
- ③밴드 오른쪽 I(y) 플롯에 파란 옅은 음영(기하 그림자, |y|<H/2)과 기존 빨간 음영
  (어두운 구간)이 함께 보이고, 위쪽에 작은 범례(파란/빨간 사각형 + 짧은 라벨)가 보임.
  두 음영이 겹치는 영역은 색이 섞여 보임.
- λ를 바꾸면 S̄ 값과 빨간 음영 범위가 함께 갱신됨(파란 음영은 H가 고정이면 불변).

- [ ] **Step 5: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js index.html
git commit -m "$(cat <<'EOF'
기능: 정보 박스 S̄ 표시 + 힌트 문구 + I(y) 플롯 기하 그림자 음영/범례

- updateInfo(): S̄를 λ/H 다음 줄에 표시(순서: S̄ → I₀ → 어두운 구간 폭)
- index.html: 하단 힌트에 S̄ 설명(프레넬 진동에 강건한 판단 기준) 추가
- drawIntensityPlot(): |y|<H/2 기하 그림자 파란 음영 + 범례 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 1:1 모드 좌표계/gridWorld 공유 (렌더링 변경 없음)

이 Task는 **화면에 보이는 것을 전혀 바꾸지 않는다** — 3분할 뷰가 100% 그대로 동작해야
한다. 1:1 모드가 필요로 하는 좌표계·gridWorld 합집합·gridH 산정 로직의 기반만 놓는다.
`state.viewMode`는 이 Task 끝에서도 항상 `'3band'`이므로(전환 UI는 Task 4), 새 로직이
실제로 3band 아닌 값을 반환하는 경로는 아직 실행되지 않는다 — selfCheck 단언으로만
검증한다.

**Files:**
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: 기존 `layout.bandW/bandH/cssH/marginT/marginB/gridW`, `ZOOM_MIN`, `view.zoomFactor`.
- Produces: 순수 함수 `compute1to1Range(H_m, bandW, bandH1to1)` →
  `{Yw1to1, xMin1to1, xMax1to1}`, `unionGridWorld(baseXmin, baseXmax, baseYw, range1to1, zoomMin)`
  → `{xMin, xMax, Yw}`, `requiredGridH(gridW, aspect3band, aspect1to1, viewMode)` → number.
  새 상태: `state.viewMode`('3band'|'1to1', 기본 '3band'), `state.viewField`
  ('inc'|'sc'|'total', 기본 'total'), `base1to1`/`camera1to1`(base/camera와 동일 형태),
  `layout.bandH1to1`. 함수 `switchViewMode(newMode)` — Task 4가 버튼에 연결한다.

- [ ] **Step 1: script.js — `selfCheck()`에 단언 추가(먼저 실패하도록)**

Task 1에서 추가한 S̄ 단언들 중 `shadowFillRatioFromSamples` 관련 단언 다음(§Task1
Step 1에서 넣은 두 줄 바로 다음)에 추가:
```js
    {
      const r = compute1to1Range(0.1, 1, 1);
      console.assert(Math.abs(r.Yw1to1 - 0.125) < 1e-9, "compute1to1Range Yw1to1(H=0.1,정사각비율)=0.125");
      console.assert(Math.abs(r.xMin1to1 - (-1 / 12)) < 1e-9, "compute1to1Range xMin1to1=-1/12");
      console.assert(Math.abs(r.xMax1to1 - (1 / 6)) < 1e-9, "compute1to1Range xMax1to1=1/6");
    }
    {
      const small = unionGridWorld(-0.1, 0.2, 0.05, { xMin1to1: -0.02, xMax1to1: 0.04, Yw1to1: 0.03 }, 0.5);
      console.assert(Math.abs(small.xMax - 0.4) < 1e-9 && Math.abs(small.Yw - 0.1) < 1e-9,
        "unionGridWorld: 3분할 몫이 더 크면 그대로(÷zoomMin)");
      const big = unionGridWorld(-0.1, 0.2, 0.05, { xMin1to1: -0.3, xMax1to1: 0.5, Yw1to1: 0.2 }, 0.5);
      console.assert(Math.abs(big.xMax - 1.0) < 1e-9 && Math.abs(big.Yw - 0.4) < 1e-9,
        "unionGridWorld: 1:1 몫이 더 크면 그쪽 채택(÷zoomMin)");
    }
    console.assert(requiredGridH(900, 0.25, 0.75, '3band') === 225, "requiredGridH 3band 모드");
    console.assert(requiredGridH(900, 0.25, 0.75, '1to1') === 675, "requiredGridH 1to1 모드");
```

- [ ] **Step 2: 브라우저로 열어 실패 확인**

`ReferenceError: compute1to1Range is not defined`가 뜨는지 확인.

- [ ] **Step 3: script.js — `state`/`view` 객체에 필드 추가**

`state` 객체 정의(script.js:17-24)를 아래로 교체:
```js
  const state = {
    mode: 'solid',                              // 기본값: 솔리드 모드(관찰 조건 정리, §17)
    N: 40, d_mm: 4, a_mm: 1.0,
    wireN: 40, wireD_mm: 4, wireA_mm: 1.0,      // 도선 모드 슬라이더 원본(모드 전환 시 보존)
    H_mm: 150, solidApproxWarn: false,          // 솔리드 모드 슬라이더/경고
    lam_cm: 12, amp: 1.0, L_mm: 100,
    playing: true, phase: 0,
    viewMode: '3band',                          // '3band' | '1to1' — 관찰 모드(§20)
    viewField: 'total',                         // 1:1 모드 전용: 'inc'|'sc'|'total'(기본 ③중첩)
  };
```

- [ ] **Step 4: script.js — `base1to1`/`camera1to1` 객체 및 `layout.bandH1to1` 추가**

`base`/`gridWorld`/`camera` 정의(script.js:258-260)를 아래로 교체:
```js
  const base = { xMin: 0, xMax: 0, Yw: 0 };
  const base1to1 = { xMin: 0, xMax: 0, Yw: 0 };       // 1:1 모드 zoom=100% 뷰(§20.2)
  const gridWorld = { xMin: 0, xMax: 0, Yw: 0 };
  const camera = { xMin: 0, xMax: 0, Yw: 0 };
  const camera1to1 = { xMin: 0, xMax: 0, Yw: 0 };
```

`layout` 객체 정의(script.js:247-251)를 아래로 교체:
```js
  const layout = {
    cssW: 0, cssH: 0, marginL: 12, marginR: 12, marginT: 10, marginB: 10,
    gap: 14, bandX: 0, bandW: 0, bandH: 0, bandY: [0, 0, 0],
    bandH1to1: 0,                                     // 1:1 모드 단일 밴드 높이(§20.2)
    gridW: 900, plotW: 96,
  };
```

- [ ] **Step 5: script.js — 순수 함수 정의**

`chooseBaseYw` 정의(script.js:264-269) 다음, `computeBaseAndGrid()` 정의 시작(271번째
줄 주석) 앞에 추가:
```js

  // [1:1 모드] 좌표계 — L 무관, H(H_m)만의 함수(§20.2). 순수 함수 — selfCheck()에서 단언.
  function compute1to1Range(H_m, bandW, bandH1to1) {
    const Yw1to1 = 1.25 * (H_m / 2 + 0.05);
    const xSpan1to1 = 2 * Yw1to1 * (bandW / bandH1to1);
    const xMin1to1 = -xSpan1to1 / 3;                  // 장애물(x=0)을 밴드 왼쪽 1/3 지점에 배치
    const xMax1to1 = xSpan1to1 * 2 / 3;
    return { Yw1to1, xMin1to1, xMax1to1 };
  }

  // gridWorld = 3분할 몫과 1:1 몫의 합집합(§20.3). 순수 함수 — selfCheck()에서 단언.
  function unionGridWorld(baseXmin, baseXmax, baseYw, range1to1, zoomMin) {
    const xMin = Math.min(baseXmin, range1to1.xMin1to1) / zoomMin;
    const xMax = Math.max(baseXmax, range1to1.xMax1to1) / zoomMin;
    const Yw = Math.max(baseYw, range1to1.Yw1to1) / zoomMin;
    return { xMin, xMax, Yw };
  }

  // gridH 요구치 — 현재 모드가 요구하는 세로 해상도(§20.4, "현재 모드 추종").
  // 순수 함수 — selfCheck()에서 단언.
  function requiredGridH(gridW, aspect3band, aspect1to1, viewMode) {
    const aspect = (viewMode === '1to1') ? aspect1to1 : aspect3band;
    return Math.max(40, Math.round(gridW * aspect));
  }
```

- [ ] **Step 6: script.js — `computeBaseAndGrid()` 확장(1:1 몫 계산 + gridWorld 합집합)**

`computeBaseAndGrid()` 정의(script.js:275-294, 이제 위 Step 5로 인해 줄 번호가 밀렸음 —
`function computeBaseAndGrid() {`로 시작하는 함수를 찾아 교체) 전체를 아래로 교체:
```js
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

    // [1:1 모드] 좌표계 — L 무관, H만의 함수(§20.2)
    layout.bandH1to1 = layout.cssH - layout.marginT - layout.marginB;
    const range1to1 = compute1to1Range(H_m, layout.bandW, layout.bandH1to1);
    base1to1.xMin = range1to1.xMin1to1; base1to1.xMax = range1to1.xMax1to1; base1to1.Yw = range1to1.Yw1to1;

    // gridWorld: 3분할 몫과 1:1 몫의 합집합, ZOOM_MIN까지 미리 커버(§20.3)
    const union = unionGridWorld(baseXmin, baseXmax, baseYw, range1to1, ZOOM_MIN);
    gridWorld.xMin = union.xMin; gridWorld.xMax = union.xMax; gridWorld.Yw = union.Yw;
  }
```

- [ ] **Step 7: script.js — `computeCamera()` 확장(camera1to1 산출)**

`computeCamera()` 정의를 아래로 교체:
```js
  function computeCamera() {
    camera.xMin = base.xMin / view.zoomFactor;
    camera.xMax = base.xMax / view.zoomFactor;
    camera.Yw = base.Yw / view.zoomFactor;
    camera1to1.xMin = base1to1.xMin / view.zoomFactor;
    camera1to1.xMax = base1to1.xMax / view.zoomFactor;
    camera1to1.Yw = base1to1.Yw / view.zoomFactor;
  }
```

- [ ] **Step 8: script.js — `switchViewMode()` 정의**

`computeCamera()` 정의 다음, `function resize()` 정의 앞에 추가:
```js

  // 모드 전환 — gridH 요구치가 실제로 바뀔 때만 recompute(§20.4, 최대 1회, 양방향 허용).
  // 버튼 바인딩(호출부)은 이후 Task에서 연결한다.
  function switchViewMode(newMode) {
    if (state.viewMode === newMode) return;
    const gridW = layout.gridW;
    const aspect3band = layout.bandH / layout.bandW;
    const aspect1to1 = layout.bandH1to1 / layout.bandW;
    const oldGridH = requiredGridH(gridW, aspect3band, aspect1to1, state.viewMode);
    const newGridH = requiredGridH(gridW, aspect3band, aspect1to1, newMode);
    state.viewMode = newMode;
    if (oldGridH !== newGridH) scheduleRecompute(); else drawFrame();
  }
```

- [ ] **Step 9: script.js — `recompute()`의 gridH 계산을 `requiredGridH()` 사용하도록 변경**

`recompute()` 안에는 지역 변수 `aspect`가 두 곳에 걸쳐 쓰인다: 선언
(`const xMin = gridWorld.xMin, ...` 다음 줄 `const span = xMax - xMin;` 바로 다음의
`const aspect = layout.bandH / layout.bandW;`)과 사용(그 아래 `const gridW =
layout.gridW; const gridH = Math.max(40, Math.round(gridW * aspect));`). `span`은
이후 그리드 평가 루프(`const wx = xMin + (gi + 0.5) / gridW * span;`)에서도 쓰이므로
그대로 두고, `aspect`만 아래처럼 교체한다(선언부와 사용부를 함께 바꿔 미사용 변수가
남지 않게 한다):

`const aspect = layout.bandH / layout.bandW;` 줄을 삭제하고, 대신 `const gridW =
layout.gridW;` 줄부터 시작하는 블록을 아래로 교체:
```js
    const gridW = layout.gridW;
    const aspect3band = layout.bandH / layout.bandW;
    const aspect1to1 = layout.bandH1to1 / layout.bandW;
    const gridH = requiredGridH(gridW, aspect3band, aspect1to1, state.viewMode);
```
(`computeBaseAndGrid()` 안의 `aspect` 지역 변수는 별개 함수의 별개 변수라 이 변경과
무관하다 — 그대로 둔다.)

- [ ] **Step 10: 브라우저로 열어 검증**

`C:/dev/fourth-task/index.html`을 열고 확인:
- 콘솔에 `console.assert` 실패 없음(Step 1 단언 포함).
- **회귀 없음이 핵심**: 3분할 뷰가 이전과 동일하게 보임(막대·파문·축척비 배지 등).
- `[성능] recompute()` 로그의 `gridH` 값이 이전 커밋(Task 2까지)과 동일한지 확인
  (예: 기본값에서 `gridH=227` 근처, 변화 없어야 함) — `state.viewMode`가 여전히
  `'3band'`뿐이므로 `requiredGridH()`가 항상 3분할 값을 반환해야 한다.
- N/d/H/λ/L 슬라이더를 조작해도 기존과 동일하게 동작.

- [ ] **Step 11: Commit**

```bash
cd "C:/dev/fourth-task"
git add script.js
git commit -m "$(cat <<'EOF'
기능: 1:1 모드 좌표계/gridWorld 공유 기반 추가(렌더링 변경 없음)

- compute1to1Range/unionGridWorld/requiredGridH: 순수 함수, selfCheck 단언
- computeBaseAndGrid(): 1:1 몫을 함께 계산해 gridWorld를 합집합으로 확장(§20.3)
- computeCamera(): camera1to1 병행 산출
- switchViewMode(): gridH 요구치가 다를 때만 recompute(§20.4, 버튼 연결은 다음 Task)
- state.viewMode 기본값 '3band' 유지 — 3분할 뷰 100% 회귀 없음(브라우저 확인 완료)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 1:1 모드 렌더링 + UI

**Files:**
- Modify: `C:/dev/fourth-task/index.html`
- Modify: `C:/dev/fourth-task/script.js`

**Interfaces:**
- Consumes: Task 3의 `state.viewMode/viewField`, `base1to1/camera1to1`,
  `layout.bandH1to1`, `switchViewMode()`. Task 2의 `drawIntensityPlot()`(파라미터화 대상).
- Produces: `worldToBand1to1(wx, wy, by)`, `drawOverlay1to1(by)`. `drawIntensityPlot(by, bh)`
  (시그니처 변경).

- [ ] **Step 1: index.html — 뷰모드/필드 토글 버튼 마크업 추가**

`<!-- 화면 보기(줌) -->` 부터 `<div class="zoomRow">` 시작 전까지(index.html:65-66) 사이,
`<h2>화면 보기 (줌)</h2>` 바로 다음에 삽입:
```html
    <div class="segbtns" id="viewModeButtons">
      <button id="viewMode3bandBtn" class="active">3분할 뷰</button>
      <button id="viewMode1to1Btn">1:1 관찰 모드</button>
    </div>
    <div class="segbtns" id="viewFieldButtons" style="display:none">
      <button id="viewFieldIncBtn">① 입사</button>
      <button id="viewFieldScBtn">② 산란</button>
      <button id="viewFieldTotalBtn" class="active">③ 중첩</button>
    </div>
```

- [ ] **Step 2: script.js — `worldToBand1to1`/`drawOverlay1to1` 정의**

`drawOverlay()` 함수(script.js에서 `function drawOverlay(band, by) {`로 시작, 기존
441-529번째 줄 근방 — Task 1~3의 삽입으로 줄 번호가 밀렸으므로 함수명으로 찾을 것)
정의가 끝나는 `}` 다음에 추가:
```js

  function worldToBand1to1(wx, wy, by) {
    const sx = layout.bandX + (wx - camera1to1.xMin) / (camera1to1.xMax - camera1to1.xMin) * layout.bandW;
    const sy = by + (camera1to1.Yw - wy) / (2 * camera1to1.Yw) * layout.bandH1to1;
    return { x: sx, y: sy };
  }

  const VIEW_FIELD_TITLES = { inc: "① 입사파", sc: "② 산란파", total: "③ 중첩 (입사 + 산란)" };

  // 1:1 관찰 모드 오버레이 — drawOverlay(band,by)와 동형이지만 단일 필드·정의상
  // 항상 등방(축척비 배지 없음)이라 더 단순하다(§20.5).
  function drawOverlay1to1(by) {
    const bx = layout.bandX, bw = layout.bandW, bh = layout.bandH1to1;
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    const sPx = layout.bandW / (camera1to1.xMax - camera1to1.xMin);
    const dPx = (state.d_mm / 1000) * sPx;
    const aPx = solver.aEff_m * sPx;
    const rPx = Math.min(dPx * 0.5, Math.max(1.5, aPx));
    const N = state.N;

    // 중심선
    const top = worldToBand1to1(0, camera1to1.Yw, by), bot = worldToBand1to1(0, -camera1to1.Yw, by);
    ctx.save();
    ctx.strokeStyle = "#9aa0aa"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
    ctx.restore();

    // 스크린 위치(거리 L) — 프레임 안이면 점선, 밖이면 우측 가장자리 라벨만(§20.5).
    // L은 항상 양수(10~300mm)이고 xMin1to1은 항상 음수이므로 왼쪽 이탈은 없다.
    const Lx = state.L_mm / 1000;
    if (Lx >= camera1to1.xMin && Lx <= camera1to1.xMax) {
      const st = worldToBand1to1(Lx, camera1to1.Yw, by), sb = worldToBand1to1(Lx, -camera1to1.Yw, by);
      ctx.save();
      ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.font = "10px sans-serif"; ctx.fillStyle = "#c0392b";
      ctx.textAlign = "center"; ctx.fillText("스크린", (st.x + sb.x) / 2, by + 12);
      ctx.restore();
    } else if (Lx > camera1to1.xMax) {
      const outsideMm = (Lx - camera1to1.xMax) * 1000;
      ctx.save(); ctx.font = "10px sans-serif"; ctx.fillStyle = "#c0392b"; ctx.textAlign = "right";
      ctx.fillText(`스크린 → 오른쪽 밖 ${outsideMm.toFixed(0)} mm`, bx + bw - 6, by + 12);
      ctx.restore();
    }

    // 도선
    for (let n = 0; n < N; n++) {
      const p = worldToBand1to1(0, solver.wiresY[n], by);
      if (p.y < by - 4 || p.y > by + bh + 4) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, rPx, 0, TWO_PI);
      ctx.fillStyle = "#3a3a40"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "#1c1c1f"; ctx.stroke();
    }

    // 진행방향 화살표
    {
      const ay = by + 16, ax = bx + 16;
      ctx.fillStyle = "#444"; ctx.strokeStyle = "#444"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 34, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax + 34, ay); ctx.lineTo(ax + 27, ay - 4); ctx.lineTo(ax + 27, ay + 4); ctx.closePath(); ctx.fill();
      ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#444";
      ctx.fillText("입사파 진행 →", ax, ay - 8);
    }

    // 막대 높이(H) 치수선
    {
      const H_m = (state.N - 1) * (state.d_mm / 1000);
      const halfH = H_m / 2;
      const top2 = worldToBand1to1(0, halfH, by), bot2 = worldToBand1to1(0, -halfH, by);
      const dimX = Math.max(bx + 6, top2.x - 20);
      ctx.save();
      ctx.strokeStyle = "#5a5a62"; ctx.fillStyle = "#5a5a62"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dimX, top2.y); ctx.lineTo(dimX, bot2.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dimX, top2.y); ctx.lineTo(dimX - 3, top2.y + 6); ctx.lineTo(dimX + 3, top2.y + 6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(dimX, bot2.y); ctx.lineTo(dimX - 3, bot2.y - 6); ctx.lineTo(dimX + 3, bot2.y - 6); ctx.closePath(); ctx.fill();
      ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.save(); ctx.translate(dimX - 8, (top2.y + bot2.y) / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(`H = ${(H_m * 1000).toFixed(0)} mm`, 0, 0);
      ctx.restore();
      ctx.restore();
    }

    // 제목(현재 표시 필드)
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "#10193a";
    ctx.fillText(VIEW_FIELD_TITLES[state.viewField] + " · 1:1 관찰 모드", bx + 10, by + bh - 10);
  }
```

- [ ] **Step 3: script.js — `drawFrame()` 리팩터링(모드 분기)**

`drawFrame()` 함수 전체(`function drawFrame() {`로 시작)를 아래로 교체:
```js
  function drawFrame() {
    ctx.clearRect(0, 0, layout.cssW, layout.cssH);
    const gw = solver.gridW, gh = solver.gridH;
    if (!gw || !gh) return;
    computeCamera();
    const A = state.amp;
    const cosP = Math.cos(state.phase), sinP = Math.sin(state.phase);

    if (offscreen.width !== gw || offscreen.height !== gh) {
      offscreen.width = gw; offscreen.height = gh;
    }
    const gxSpan = solver.xMax - solver.xMin;

    // 필드값(0=입사/1=산란/2=중첩)을 오프스크린에 그린 뒤, cam 범위로 crop해서
    // destRect(밴드 픽셀 사각형)에 그린다 — 3분할·1:1 공용(§20.5).
    function renderField(fieldIndex, cam, destX, destY, destW, destH) {
      const img = offctx.createImageData(gw, gh);
      const data = img.data;
      for (let p = 0; p < gw * gh; p++) {
        let fr, fi;
        if (fieldIndex === 0) { fr = solver.incRe[p]; fi = solver.incIm[p]; }
        else if (fieldIndex === 1) { fr = solver.scRe[p]; fi = solver.scIm[p]; }
        else { fr = solver.incRe[p] + solver.scRe[p]; fi = solver.incIm[p] + solver.scIm[p]; }
        const val = (fr * cosP + fi * sinP) * A;
        colorFor(val / VMAX, data, p * 4);
      }
      offctx.putImageData(img, 0, 0);
      let sx = (cam.xMin - solver.xMin) / gxSpan * gw;
      let sxEnd = (cam.xMax - solver.xMin) / gxSpan * gw;
      let sy = (solver.Yw - cam.Yw) / (2 * solver.Yw) * gh;
      let syEnd = (solver.Yw + cam.Yw) / (2 * solver.Yw) * gh;
      sx = Math.max(0, Math.min(gw, sx));
      sxEnd = Math.max(0, Math.min(gw, sxEnd));
      sy = Math.max(0, Math.min(gh, sy));
      syEnd = Math.max(0, Math.min(gh, syEnd));
      const sW = Math.max(1, sxEnd - sx), sH = Math.max(1, syEnd - sy);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, sx, sy, sW, sH, destX, destY, destW, destH);
    }

    let plotBy, plotBh;
    if (state.viewMode === '1to1') {
      const fieldIndex = state.viewField === 'inc' ? 0 : (state.viewField === 'sc' ? 1 : 2);
      const by = layout.marginT;
      renderField(fieldIndex, camera1to1, layout.bandX, by, layout.bandW, layout.bandH1to1);
      drawOverlay1to1(by);
      plotBy = by; plotBh = layout.bandH1to1;
    } else {
      for (let band = 0; band < 3; band++) {
        const by = layout.bandY[band];
        renderField(band, camera, layout.bandX, by, layout.bandW, layout.bandH);
        drawOverlay(band, by);
      }
      plotBy = layout.bandY[2]; plotBh = layout.bandH;
    }
    drawIntensityPlot(plotBy, plotBh);
  }
```

- [ ] **Step 4: script.js — `drawIntensityPlot()`을 `(by, bh)` 파라미터로 변경**

Task 2에서 만든 `drawIntensityPlot()` 함수 전체를 아래로 교체(파라미터 추가 + 내부
하드코딩된 `by`/`bh` 산출 줄 제거, 나머지 본문은 Task 2와 동일):
```js
  function drawIntensityPlot(by, bh) {
    if (!solver.wiresY || !solver.wiresY.length) return;
    const px = layout.bandX + layout.bandW + layout.gap;
    const pw = layout.plotW;
    const L_m = state.L_mm / 1000;
    const H_m = barHeight_mm(state.N, state.d_mm) / 1000;

    // 세로로 샘플링 (위→아래), 최대값으로 가로 스케일
    // §5: 줌과 무관하게 항상 base.Yw(고정 기준 범위) 전체 높이로 그린다 —
    // 그래야 줌인해도 회절 무늬 전체(중심 봉우리+옆 봉우리들)가 항상 보인다.
    const profile = computeShadowProfile(L_m);
    const Iy = profile.Iy;
    const M = profile.M;
    const scale = Math.max(2, Math.ceil(profile.Imax));   // 가로 0..scale

    // 축 박스
    ctx.save();
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, by + 0.5, pw - 1, bh - 1);

    // 기하 그림자 구간 음영(|y|<H/2) — 파랑, S̄ 계산 구간과 대응(§19.3)
    {
      const halfH = H_m / 2;
      const geomTop = by + (base.Yw - halfH) / (2 * base.Yw) * bh;
      const geomBot = by + (base.Yw + halfH) / (2 * base.Yw) * bh;
      ctx.save();
      ctx.fillStyle = "rgba(47,111,235,0.10)";
      ctx.fillRect(px, geomTop, pw, geomBot - geomTop);
      ctx.restore();
    }
    // 어두운 구간 음영(I<0.5)
    if (profile.region) {
      const { lo, hi } = profile.region;
      const syLo = by + (lo / profile.M) * bh;
      const syHi = by + ((hi + 1) / profile.M) * bh;
      ctx.save();
      ctx.fillStyle = "rgba(192,57,43,0.12)";
      ctx.fillRect(px, syLo, pw, syHi - syLo);
      ctx.restore();
    }

    ctx.fillStyle = "#8a8a92"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("전체 높이 기준", px + pw / 2, by + 12);

    // 범례 — 기하 그림자(파랑) vs 어두운 구간(빨강)
    ctx.font = "9px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "rgba(47,111,235,0.6)"; ctx.fillRect(px + 4, by + 20, 7, 7);
    ctx.fillStyle = "#5a5a62"; ctx.fillText("기하(|y|<H/2)", px + 14, by + 27);
    ctx.fillStyle = "rgba(192,57,43,0.6)"; ctx.fillRect(px + 4, by + 31, 7, 7);
    ctx.fillStyle = "#5a5a62"; ctx.fillText("어두운(I<0.5)", px + 14, by + 38);

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

- [ ] **Step 5: script.js — L 슬라이더를 모드 인지형으로 재바인딩**

`bindSlider("lSlider", "L_mm", parseFloat);` 줄(주석 "L이 이제 가로 범위... recompute
필요(§13.2)." 포함)을 아래로 교체:
```js
  // L: 3분할 모드는 가로 범위 기준이라 recompute 필요(§13.2). 1:1 모드는
  // gridWorld가 이미 H 기반으로 충분해 recompute 불필요 — drawFrame만(§20.6).
  document.getElementById("lSlider").addEventListener("input", function () {
    state.L_mm = parseFloat(this.value);
    syncLabels();
    if (state.viewMode === '1to1') drawFrame(); else scheduleRecompute();
  });
```

- [ ] **Step 6: script.js — 뷰모드/필드 버튼 바인딩**

기존 줌 바인딩(`// 줌 (버튼 + 마우스 휠) ...` 주석으로 시작하는 블록) 바로 앞에 추가:
```js
  // 화면 보기 모드(3분할/1:1) + 1:1 모드 필드 선택(§20.7)
  const viewMode3bandBtn = document.getElementById("viewMode3bandBtn");
  const viewMode1to1Btn = document.getElementById("viewMode1to1Btn");
  const viewFieldButtons = document.getElementById("viewFieldButtons");
  const viewFieldIncBtn = document.getElementById("viewFieldIncBtn");
  const viewFieldScBtn = document.getElementById("viewFieldScBtn");
  const viewFieldTotalBtn = document.getElementById("viewFieldTotalBtn");
  function applyViewModeUI() {
    viewMode3bandBtn.classList.toggle("active", state.viewMode === '3band');
    viewMode1to1Btn.classList.toggle("active", state.viewMode === '1to1');
    viewFieldButtons.style.display = (state.viewMode === '1to1') ? '' : 'none';
  }
  viewMode3bandBtn.addEventListener("click", () => { switchViewMode('3band'); applyViewModeUI(); });
  viewMode1to1Btn.addEventListener("click", () => { switchViewMode('1to1'); applyViewModeUI(); });
  function applyViewFieldUI() {
    viewFieldIncBtn.classList.toggle("active", state.viewField === 'inc');
    viewFieldScBtn.classList.toggle("active", state.viewField === 'sc');
    viewFieldTotalBtn.classList.toggle("active", state.viewField === 'total');
  }
  viewFieldIncBtn.addEventListener("click", () => { state.viewField = 'inc'; applyViewFieldUI(); drawFrame(); });
  viewFieldScBtn.addEventListener("click", () => { state.viewField = 'sc'; applyViewFieldUI(); drawFrame(); });
  viewFieldTotalBtn.addEventListener("click", () => { state.viewField = 'total'; applyViewFieldUI(); drawFrame(); });
```

- [ ] **Step 7: script.js — 시작부에서 `applyViewModeUI()`/`applyViewFieldUI()` 호출**

`applyModeUI();` 호출(파일 맨 아래 "시작" 섹션) 바로 다음에 추가:
```js
  applyViewModeUI();
  applyViewFieldUI();
```

- [ ] **Step 8: 브라우저로 열어 검증**

`C:/dev/fourth-task/index.html`을 열고 확인:
- 콘솔 `console.assert` 실패 없음, 로드 시 "3분할 뷰" 버튼 활성, 필드 선택 버튼 숨김.
- "1:1 관찰 모드" 클릭: 단일 큰 밴드로 전환(기본 ③중첩), 필드 선택 버튼 3개 나타남,
  H 치수선·도선·진행 화살표 모두 보임, 축척비 배지는 절대 뜨지 않음.
  콘솔에 `[성능] recompute()` 로그가 **정확히 이 클릭 시점에 1번만** 찍히는지 확인
  (gridH가 227→675로 커지므로 이번 전환에서는 recompute 발생이 정상).
- ①/②/③ 필드 버튼 전환 시 즉시 반응(recompute 로그 없음, drawFrame만).
- **핵심 시나리오**: 1:1 모드에서 L 슬라이더를 10→300mm로 여러 번 움직여도 화면의
  회절 무늬(막대 뒤 파문 모양)가 전혀 바뀌지 않음 — 스크린 점선 위치(또는 프레임
  밖으로 나가면 "스크린 → 오른쪽 밖 xxx mm" 라벨)와 정보 박스(S̄·I₀·어두운 구간 폭)만
  갱신됨. 이 구간 동안 `[성능] recompute()` 로그가 **전혀 찍히지 않아야 한다.**
- "3분할 뷰"로 되돌리면: gridH가 675→227로 줄어드는 recompute가 1번 발생(정상,
  §20.4), 이후 기존 3분할 동작(축척비 배지 포함) 100% 회귀.
- 다시 "1:1 관찰 모드"로 전환: gridH가 이미 675로 요구된 적 없으므로(직전에
  3band로 줄었으므로) 다시 675로 키우는 recompute가 1번 더 발생 — 이는 §20.4에서
  명시적으로 허용한 "전환마다 요구치가 다르면 매번 1회" 동작이며 버그가 아니다.

- [ ] **Step 9: Commit**

```bash
cd "C:/dev/fourth-task"
git add index.html script.js
git commit -m "$(cat <<'EOF'
기능: 1:1 관찰 모드 렌더링 + UI 추가

- drawFrame(): renderField 헬퍼로 3분할/1:1 렌더 경로 통합, 모드별 분기
- worldToBand1to1/drawOverlay1to1: 1:1 전용 오버레이(등방 배지 없음,
  스크린 오프프레임 시 "→ 오른쪽 밖 xxx mm" 라벨, §20.5)
- drawIntensityPlot(by,bh) 파라미터화 — 두 모드가 같은 함수 공유
- L 슬라이더: 1:1 모드에서는 recompute 없이 drawFrame만(화면 무늬 불변, §20.6)
- 뷰모드(3분할/1:1)·필드(①②③) 토글 버튼 + switchViewMode() 연결
- 브라우저 검증: 모드 전환당 recompute 최대 1회, 1:1에서 L 조작 시 무늬 불변,
  3분할 뷰 100% 회귀 확인 완료

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 최종 검증 패스

**Files:** 없음(확인만, 코드 변경 없음. 문제 발견 시에만 별도 수정 커밋).

- [ ] **Step 1: λ 스윕 — S̄의 프레넬 진동 강건성 확인 (브라우저, 임시 검증)**

`C:/dev/fourth-task/index.html`을 열고, 솔리드 모드·H=150mm·L=100mm 고정 상태에서
λ를 2/8/24cm로 순서대로 바꾸며 매번 정보 박스의 S̄·I₀·어두운 구간 폭·N_F 값을
기록(또는 임시 Playwright 스크립트로 자동 수집 — 앱에 버튼을 추가하지 않는다, §21).
확인 사항:
1. S̄가 세 지점에서 단조 증가.
2. λ=2~4cm 근접장 구간을 0.5cm 간격 정도로 세밀히 스윕했을 때, I₀는 이 구간에서
   출렁이는 반면(design §16 각주에서 이미 확인된 현상) S̄는 그 출렁임이 크게
   완화되어 있음(완전히 단조가 아니어도 되나, I₀ 대비 변동폭이 뚜렷이 작아야 함).

- [ ] **Step 2: 1:1 모드 시각 확인 (브라우저)**

같은 λ 스윕을 1:1 모드·②산란파 필드에서 반복: λ가 커질수록 산란파가 더 넓은
각도로(등방적으로, 왜곡 없이) 퍼지는 것이 보이는지 스크린샷으로 확인. ③중첩에서는
그림자가 점점 메워지는 것이 보이는지 확인.

- [ ] **Step 3: 회귀 확인**

"도선 배열 모드" 클릭 → 굵기 a를 키워 2a≥d면 "닿음(솔리드)" 배지, λ를 줄여 λ<5d면
"투과 영향 구간" 배지 — 기존 동작 그대로 유지되는지 확인. 3분할 뷰에서 H가 커서
등방이 깨지는 조합(권장 기본값)에서는 여전히 축척비 소표기가 뜨는지 확인.

- [ ] **Step 4: 성능/recompute 트리거 최종 확인**

일시정지 후 위상 슬라이더로 정지 탐색, 줌 버튼/휠 동작(recompute 재트리거 없이
즉시 반응) 확인 — 3분할·1:1 두 모드 모두에서. 콘솔에 `[성능] recompute()` 로그가
찍히는 시점이 §20.4/Task 4 Step 8에서 정리한 규칙(모드 전환 시 gridH 요구치가
다를 때만, 최대 1회)과 정확히 일치하는지 최종 확인.

- [ ] **Step 5: (선택) requesting-code-review 스킬로 변경 검토**

문제 없으면 종료. 문제 발견 시 별도 수정 커밋 후 이 Task를 재검증한다.

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- (A) S̄ 정의·구현·표시·힌트 문구(§19) → Task 1~2.
- (B) 1:1 모드 좌표계·gridWorld 공유·gridH 전략·렌더링·UI(§20) → Task 3~4.
- 검증용 콘솔 표는 앱 미포함(§21) → Task 5 Step 1에서 임시 방법으로만 사용, 명시.
- 완료 기준 전체(§22) → Task 5.
- "절대 변경 금지" 목록 → 전체 계획에서 어떤 Task도 건드리지 않음(확인됨).

**Placeholder scan:** 빈 항목 없음. 모든 코드 단계에 실제 코드 포함.

**Type consistency:** `compute1to1Range`/`unionGridWorld`/`requiredGridH`/
`switchViewMode`/`worldToBand1to1`/`drawOverlay1to1`/`shadowFillRatioFromSamples`/
`computeShadowFillRatio`의 시그니처가 정의 Task와 사용 Task(`computeBaseAndGrid`/
`computeCamera`/`drawFrame`/`updateInfo`) 간에 일치. `state.viewMode`/`viewField`,
`base1to1`/`camera1to1`, `layout.bandH1to1` 필드명이 Task 3~4에서 일관.
`drawIntensityPlot()`의 시그니처가 Task 2(무인자, 3분할 전용)에서 Task 4(`by,bh`
인자, 두 모드 공용)로 바뀌는 것을 Task 4 Step 4에서 전체 함수를 다시 제시해 명확히
했다.

**알려진 트레이드오프(사용자 확인 완료):**
- gridH는 "현재 모드 추종" 전략으로, 모드를 왕복 전환하면 매번 요구치가 바뀌어
  recompute가 그때마다 발생할 수 있다(§20.4) — "절대 recompute 안 함"이 아니라
  "전환당 최대 1회"가 정확한 보장이다. 1:1 모드가 실사용에서 답답하면 `gridW`
  축소를 후속 검토할 수 있으나 이번 계획 범위 밖이다.
