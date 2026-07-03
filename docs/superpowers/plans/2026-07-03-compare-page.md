# MoM vs 하위헌스 비교 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **예외: Task 1은 위임하지 말 것.** 사용자 실시간 승인(레이아웃 프리뷰 확인)이 필요한
> 게이트 단계라서, 컨트롤러(현재 세션)가 직접 수행해야 한다. Task 2부터 서브에이전트
> 위임/배치 실행을 시작한다.

**Goal:** 금속 막대(EFIE-MoM, 엄밀해)와 하위헌스(프레넬 적분, 키르히호프 근사)가 같은
회절 물리를 구현함을 스크린 세기 곡선 I(y)로 정량 비교하는 신규 3번째 페이지
(`compare.html`+`compare.js`)를 만든다.

**Architecture:** 기존 두 앱(`script.js`/`huygens/script.js`)은 읽기 전용 참조다. 물리
코어(베셀/한켈/MoM 행렬 구성, 프레넬 적분)는 "이식"이며, 비교 페이지는 2D 필드 그리드를
계산하지 않고 스크린 곡선(241점)만 평가하므로 기존 앱보다 훨씬 높은 이산화 해상도
(N≤400, d=λ/20 목표)를 쓸 수 있다. 상태 흐름은 H/L/λ 슬라이더 → 200ms 디바운스 →
MoM·하위헌스 두 곡선을 **같은 타이머 콜백 안에서 함께** 재계산 → 메인 플롯 + 지표 박스
갱신, 하위헌스만 먼저 갱신하지 않는다(사용자 확정 수정사항).

**Tech Stack:** 순수 HTML/CSS/JS(빌드 없음), Canvas 2D. ES 모듈·fetch 미사용 → 더블클릭으로 열림.

## Global Constraints

- **신규 파일은 `compare.html`/`compare.js`만**(프로젝트 루트, `compare/` 하위 폴더 아님).
  스타일은 `compare.html` 안 `<style>`에 자체 포함(`style.css` 미의존).
- **절대 변경 금지(읽기 전용)**: `index.html`/`script.js`/`style.css`, `huygens/` 하위
  전체(`index.html`/`script.js`/`style.css`). 이 계획의 어떤 Task도 이 파일들을 열어서
  참조는 하되 **쓰기(Edit/Write)는 절대 하지 않는다.**
- **물리 코어는 "이식"이지 "재구현"이 아니다** — `besselJ0`/`besselY0`/`hankel0`/
  `solveComplex`(출처: `script.js`), `fresnelCS`/`totalAmplitude`(출처: `huygens/script.js`)를
  문자 그대로 복사하고 파일 상단에 출처 주석을 명기한다.
- **이산화**: `d_target = λ/20`, `N = min(400, max(2, ceil(H/d_target)+1))`,
  `d = H/(N-1)`, `a = d/2`. 경고 배지는 `d > 1.05·(λ/20)`일 때만(공차 있음 — 대표
  프리셋 "깊은 그림자"에서 반올림 수준 미달(`d=λ/19.95`)이 오탐으로 뜨는 것을 방지).
- **프리셋 3개 전부 H=200mm/L=300mm 고정 + λ만 변경**(1cm/4cm/20cm). 적용 시
  `setSlidersFromState()`(`huygens/script.js:706` 패턴)로 슬라이더 표시값도 동기화.
- **슬라이더(H/L/λ) 변경 시 MoM·하위헌스 두 곡선을 같은 200ms 디바운스 안에서 함께**
  재계산한다(하위헌스만 먼저 즉시 갱신하지 않는다 — 사용자 확정 수정사항).
- **λ스윕은 async 루프 + 프레임 양보**로 진행률 표시, UI를 멈추지 않는다.
- **검증 방식**: 테스트 러너 없음. 순수 함수는 `selfCheck()`에 `console.assert` 단언을
  추가하고, 브라우저로 `compare.html`을 열어 DevTools 콘솔과 화면을 확인한다.
- **모든 UI 텍스트·주석은 한국어**. 기존 코드 스타일(IIFE, 2-space, 한국어 주석) 유지.
- **무변경 검증은 git diff가 아니라 파일 해시 비교로 한다** — `huygens/`가 git에서
  untracked 상태라 `git diff`로는 변경을 못 잡는다(2026-07-03 세션에서 발견한 gotcha).
  Task 1에서 구현 시작 **전** 해시를 떠 두고, 최종 검증 Task에서 다시 비교한다.
- 설계 근거는
  `docs/superpowers/specs/2026-07-02-shadow-fill-ratio-and-1to1-view-design.md`
  §24~§29에 기록되어 있다(커밋 `e91571c`).

---

## File Structure

- `compare.html`(신규) — 페이지 스켈레톤 + 자체 `<style>`, H/L/λ 슬라이더, 프리셋 버튼 3개,
  메인 플롯 캔버스, 지표 박스, λ스윕 버튼 + 결과 패널(숨김), 클래식
  `<script src="compare.js">`.
- `compare.js`(신규, IIFE) — 이식된 물리 코어(베셀/한켈/solveComplex,
  fresnelCS/totalAmplitude), 이산화 전략, MoM/하위헌스 스크린 곡선 계산,
  S̄/I₀/N_F 계산, 메인 플롯·λ스윕 차트 렌더링(Canvas 2D), 상태/디바운스 흐름,
  프리셋, `selfCheck()`.
- 기존 파일 전부 읽기 전용 참조만(수정 없음): `script.js`, `huygens/script.js`.

Task 순서: 무결성 스냅샷+레이아웃 승인(1) → 실 파일 스캐폴딩(2) → 물리 코어 이식
(3~4) → 이산화(5) → 두 모형 곡선 계산(6~7) → 렌더링+지표(8) → 상태 흐름/프리셋(9) →
λ스윕(10) → 최종 검증(11).

---

## Task 1: huygens/ 무결성 스냅샷 + 레이아웃 프리뷰 승인 (컨트롤러 직접 수행)

이 Task는 서브에이전트에 위임하지 않는다 — 사용자 실시간 승인이 필요한 게이트다.

**Files:**
- Create(스크래치, git 미추적): `.superpowers/sdd/compare-page-huygens-hash-before.txt`
- Create(스크래치, git 미추적): `.preview/compare-layout/index.html`

- [ ] **Step 1: 구현 시작 전 참조 파일 해시 스냅샷**

```bash
cd "C:/dev/fourth-task"
sha256sum huygens/index.html huygens/script.js huygens/style.css index.html script.js style.css \
  > .superpowers/sdd/compare-page-huygens-hash-before.txt
cat .superpowers/sdd/compare-page-huygens-hash-before.txt
```
6줄(각 파일당 1줄)의 해시가 출력되는지 확인. 이 파일은 Task 11에서 재비교 기준이 된다.

- [ ] **Step 2: 정적 레이아웃 프리뷰 작성(더미 데이터, physics 없음)**

`.preview/compare-layout/index.html` 하나의 파일로 작성(§27.2 레이아웃 재현):
좌측(또는 상단) 메인 플롯 영역에 손으로 만든 샘플 곡선(sinc 유사 모양, "샘플 데이터 —
실제 물리 아님" 라벨 명시) 2개(파랑 실선/빨강 점선)를 canvas나 SVG로 정적으로 그리고,
우측 패널에 제목/설명, H/L/λ 슬라이더(동작은 라벨 갱신만, physics 연결 없음),
프리셋 버튼 3개(깊은 그림자/전이/그림자 메워짐), 지표 박스(더미 숫자:
`N_F=1.11`, `I₀(MoM)=0.076`, `I₀(Huygens)=0.057` 등), λ스윕 버튼(클릭 시 더미
진행률 텍스트만 표시), 근축 유효 범위 힌트 문구를 배치한다. `index.html`의
`#app`(flex canvas+panel) 톤과 `.row`/`.valbox`/`.segbtns`/`.info`/`.badge`
CSS 클래스 네이밍을 재사용해 최종본과 시각적으로 이어지게 한다.

- [ ] **Step 3: 사용자에게 프리뷰 제시 및 승인 확인**

프리뷰 파일 경로를 사용자에게 알리고(더블클릭으로 열어보도록), `AskUserQuestion`으로
레이아웃 승인 여부를 확인한다. 수정 요청이 있으면 Step 2로 돌아가 반영 후 재확인.
승인 시 다음 Task로 진행(프리뷰 파일 자체는 커밋하지 않음 — `.preview/`는 git
미추적 스크래치 디렉터리).

---

## Task 2: compare.html/compare.js 뼈대 생성 (physics 없음, 정적 UI만)

**Files:**
- Create: `C:/dev/fourth-task/compare.html`
- Create: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Produces: DOM id 전체(`mainCanvas`, `sweepCanvas`, `sweepPanel`, `sweepBtn`,
  `sweepProgress`, `hSlider`/`hVal`, `lSlider`/`lVal`, `lamSlider`/`lamVal`,
  `preset1Btn`/`preset2Btn`/`preset3Btn`, `infoBox`), `state.H_mm/L_mm/lam_cm`,
  `syncLabels()`. 이후 모든 Task가 이 DOM 구조와 `state`를 그대로 사용한다.

- [ ] **Step 1: compare.html 작성(Task 1에서 승인된 레이아웃 반영)**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>MoM vs 하위헌스 회절 비교</title>
<style>
:root {
  --bg: #f7f7f8; --panel-bg: #ffffff; --border: #d8d8dc;
  --text: #1c1c1f; --muted: #6b6b72; --accent: #2f6feb;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
  background: var(--bg); color: var(--text);
}
#app { display: flex; height: 100vh; }
#plotWrap { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px; gap: 12px; }
#mainCanvas { width: 100%; height: 60%; background: #fff; border: 1px solid var(--border); border-radius: 6px; }
#sweepPanel { display: none; height: 38%; }
#sweepPanel.show { display: flex; flex-direction: column; gap: 6px; }
#sweepCanvas { width: 100%; flex: 1; background: #fff; border: 1px solid var(--border); border-radius: 6px; }
#sweepProgress { font-size: 12px; color: var(--muted); }
#panel {
  width: 340px; flex-shrink: 0; background: var(--panel-bg);
  border-left: 1px solid var(--border); overflow-y: auto;
  padding: 16px; font-size: 13px;
}
h1 { font-size: 15px; margin: 0 0 6px; }
.sub { font-size: 11px; color: var(--muted); margin-bottom: 8px; line-height: 1.5; }
h2 { font-size: 12px; margin: 14px 0 8px; color: var(--muted);
  border-bottom: 1px solid var(--border); padding-bottom: 4px; letter-spacing: .02em; }
label { display: block; font-size: 12px; margin-bottom: 4px; }
.row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.row input[type=range] { flex: 1; }
.valbox { width: 96px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); }
.segbtns { display: flex; gap: 6px; margin-bottom: 6px; }
.segbtns button {
  flex: 1; font-size: 12px; padding: 7px 6px; border: 1px solid var(--border);
  border-radius: 6px; background: #f0f0f3; cursor: pointer;
}
.segbtns button:hover { background: #e4e4e8; }
button.std {
  font-size: 12px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;
  background: #f0f0f3; cursor: pointer; width: 100%;
}
button.std:hover { background: #e4e4e8; }
.info { font-size: 12px; line-height: 1.8; background: #f0f4ff; border: 1px solid #d6e0fb;
  border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.info b { color: var(--accent); font-variant-numeric: tabular-nums; }
.badge { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 10px;
  background: #e8e8ec; color: #555; margin-top: 4px; }
.badge.warn { background: #fdeaea; color: #c0392b; }
.hint { font-size: 11px; color: var(--muted); margin-top: 10px; line-height: 1.6;
  background: #fdf6e8; border: 1px solid #f0e0b0; border-radius: 8px; padding: 8px 10px; }
</style>
</head>
<body>
<div id="app">
  <div id="plotWrap">
    <canvas id="mainCanvas"></canvas>
    <div id="sweepPanel">
      <div id="sweepProgress"></div>
      <canvas id="sweepCanvas"></canvas>
    </div>
  </div>
  <div id="panel">
    <h1>MoM vs 하위헌스 회절 비교</h1>
    <div class="sub">금속 막대(EFIE-MoM, 엄밀해)와 하위헌스(프레넬 적분, 키르히호프 근사)의
      스크린 세기 곡선 I(y)를 같은 조건에서 정량 비교합니다.</div>

    <h2>기하 조건</h2>
    <div class="row">
      <label style="width:60px">장애물 높이 H</label>
      <input type="range" id="hSlider" min="20" max="300" step="1" value="200">
      <span class="valbox" id="hVal"></span>
    </div>
    <div class="row">
      <label style="width:60px">스크린 거리 L</label>
      <input type="range" id="lSlider" min="30" max="300" step="1" value="300">
      <span class="valbox" id="lVal"></span>
    </div>
    <div class="row">
      <label style="width:60px">파장 λ</label>
      <input type="range" id="lamSlider" min="1" max="30" step="0.1" value="1">
      <span class="valbox" id="lamVal"></span>
    </div>

    <h2>프리셋 (H=200mm·L=300mm 고정, λ만 변경)</h2>
    <div class="segbtns">
      <button id="preset1Btn">깊은 그림자<br>(λ=1cm)</button>
      <button id="preset2Btn">전이<br>(λ=4cm)</button>
      <button id="preset3Btn">그림자 메워짐<br>(λ=20cm)</button>
    </div>

    <h2>지표</h2>
    <div class="info" id="infoBox"></div>
    <div class="hint" id="paraxialHint">
      L이 H/2 수준이거나 작으면(광각) 하위헌스의 프레넬 근사가 무너져 두 곡선이 크게
      갈라집니다 — 근사 유효 범위의 시연이지 버그가 아닙니다.
    </div>

    <h2>λ 스윕</h2>
    <button class="std" id="sweepBtn">λ 스윕 (1~30cm, S̄ vs λ)</button>
  </div>
</div>
<script src="compare.js"></script>
</body>
</html>
```

- [ ] **Step 2: compare.js — state/DOM 참조/라벨 동기화 뼈대 작성**

```js
(function () {
  "use strict";

  // =====================================================================
  // 0. 상수
  // =====================================================================
  const TWO_PI = Math.PI * 2;
  const NUM_POINTS = 241;   // 메인 플롯 표본 수(§27.2)

  // =====================================================================
  // 1. 상태
  // =====================================================================
  const state = {
    H_mm: 200, L_mm: 300, lam_cm: 1,
  };

  // =====================================================================
  // 9. DOM 참조
  // =====================================================================
  const el = {
    mainCanvas: document.getElementById("mainCanvas"),
    sweepPanel: document.getElementById("sweepPanel"),
    sweepCanvas: document.getElementById("sweepCanvas"),
    sweepBtn: document.getElementById("sweepBtn"),
    sweepProgress: document.getElementById("sweepProgress"),
    hSlider: document.getElementById("hSlider"), hVal: document.getElementById("hVal"),
    lSlider: document.getElementById("lSlider"), lVal: document.getElementById("lVal"),
    lamSlider: document.getElementById("lamSlider"), lamVal: document.getElementById("lamVal"),
    preset1Btn: document.getElementById("preset1Btn"),
    preset2Btn: document.getElementById("preset2Btn"),
    preset3Btn: document.getElementById("preset3Btn"),
    infoBox: document.getElementById("infoBox"),
  };

  function syncLabels() {
    el.hVal.textContent = state.H_mm.toFixed(0) + " mm";
    el.lVal.textContent = state.L_mm.toFixed(0) + " mm";
    el.lamVal.textContent = state.lam_cm.toFixed(1) + " cm";
  }

  function setSlidersFromState() {
    el.hSlider.value = state.H_mm;
    el.lSlider.value = state.L_mm;
    el.lamSlider.value = state.lam_cm;
    syncLabels();
  }

  // =====================================================================
  // 시작
  // =====================================================================
  setSlidersFromState();
})();
```

- [ ] **Step 3: 브라우저로 열어 확인**

`C:/dev/fourth-task/compare.html`을 더블클릭으로 열어 확인: 콘솔 에러 없음, 슬라이더
3개와 라벨(200 mm/300 mm/1.0 cm)이 보임, 프리셋 버튼 3개·지표 박스(빈 상태)·λ스윕
버튼·근축 힌트 문구가 레이아웃대로 보임. 메인 캔버스는 아직 빈 화면(physics 없음,
정상).

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.html compare.js
git commit -m "$(cat <<'EOF'
기능: MoM vs 하위헌스 비교 페이지 뼈대(compare.html/compare.js) 추가

- 신규 3번째 페이지, 기존 index.html/huygens/ 무변경(읽기 전용 참조만)
- 레이아웃은 .preview/compare-layout/에서 사용자 승인받은 안 그대로 반영
- 이 커밋 시점에는 physics 없음 — H/L/λ 슬라이더는 라벨 동기화만 동작

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 물리 코어 이식 — 베셀/한켈/solveComplex (MoM 쪽)

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Produces: `besselJ0(x)`, `besselY0(x)`, `hankel0(x)` → `{re,im}`,
  `solveComplex(N, Z, b)` → 복소 배열. Task 6이 사용한다.

- [ ] **Step 1: selfCheck 골격 + 단언 먼저 추가(실패하도록)**

`state` 객체 정의 다음, `DOM 참조` 섹션 앞에 추가:
```js

  // =====================================================================
  // 콘솔 자가검증(마지막에 호출)
  // =====================================================================
  function selfCheck() {
    console.log("[검증] J0(1)=", besselJ0(1).toFixed(6), "(기대 0.765198)");
    console.log("[검증] Y0(1)=", besselY0(1).toFixed(6), "(기대 0.088257)");
  }
```

- [ ] **Step 2: 파일 맨 끝(`setSlidersFromState();` 다음)에 `selfCheck();` 호출 추가**

```js
  setSlidersFromState();
  selfCheck();
```

- [ ] **Step 3: 브라우저로 열어 실패 확인**

`ReferenceError: besselJ0 is not defined`가 콘솔에 뜨는지 확인.

- [ ] **Step 4: 물리 코어 이식 — script.js에서 문자 그대로 복사**

`const state = { ... };` 블록 다음, `selfCheck` 정의 앞에 추가:
```js

  // =====================================================================
  // 2. 베셀/한켈 함수 (출처: script.js, 문자 그대로 이식)
  // =====================================================================
  function besselJ0(x) {
    const ax = Math.abs(x);
    if (ax < 3) {
      const y = (x / 3) * (x / 3);
      return 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 +
        y * (0.0444479 + y * (-0.0039444 + y * 0.0002100)))));
    }
    const z = 3 / ax;
    const f = 0.79788456 + z * (-0.00000077 + z * (-0.00552740 + z * (-0.00009512 +
      z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
    const t = ax - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 +
      z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
    return f / Math.sqrt(ax) * Math.cos(t);
  }
  function besselY0(x) {
    if (x < 3) {
      const y = (x / 3) * (x / 3);
      const poly = 0.36746691 + y * (0.60559366 + y * (-0.74350384 + y * (0.25300117 +
        y * (-0.04261214 + y * (0.00427916 + y * (-0.00024846))))));
      return (2 / Math.PI) * Math.log(x / 2) * besselJ0(x) + poly;
    }
    const z = 3 / x;
    const f = 0.79788456 + z * (-0.00000077 + z * (-0.00552740 + z * (-0.00009512 +
      z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
    const t = x - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 +
      z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
    return f / Math.sqrt(x) * Math.sin(t);
  }
  function hankel0(x) { return { re: besselJ0(x), im: besselY0(x) }; }

  // =====================================================================
  // 3. 복소 선형계 Z c = b (출처: script.js, 문자 그대로 이식)
  // =====================================================================
  function solveComplex(N, Z, b) {
    const M = Z.slice();
    const x = b.slice();
    for (let col = 0; col < N; col++) {
      let piv = col, best = -1;
      for (let r = col; r < N; r++) {
        const re = M[(r * N + col) * 2], im = M[(r * N + col) * 2 + 1];
        const mag = re * re + im * im;
        if (mag > best) { best = mag; piv = r; }
      }
      if (piv !== col) {
        for (let k = 0; k < N; k++) {
          const i1 = (col * N + k) * 2, i2 = (piv * N + k) * 2;
          let t = M[i1]; M[i1] = M[i2]; M[i2] = t;
          t = M[i1 + 1]; M[i1 + 1] = M[i2 + 1]; M[i2 + 1] = t;
        }
        let t = x[col * 2]; x[col * 2] = x[piv * 2]; x[piv * 2] = t;
        t = x[col * 2 + 1]; x[col * 2 + 1] = x[piv * 2 + 1]; x[piv * 2 + 1] = t;
      }
      const pr = M[(col * N + col) * 2], pi = M[(col * N + col) * 2 + 1];
      const pden = pr * pr + pi * pi;
      for (let r = 0; r < N; r++) {
        if (r === col) continue;
        const fr0 = M[(r * N + col) * 2], fi0 = M[(r * N + col) * 2 + 1];
        const fr = (fr0 * pr + fi0 * pi) / pden;
        const fi = (fi0 * pr - fr0 * pi) / pden;
        if (fr === 0 && fi === 0) continue;
        for (let k = col; k < N; k++) {
          const ar = M[(col * N + k) * 2], ai = M[(col * N + k) * 2 + 1];
          M[(r * N + k) * 2]     -= fr * ar - fi * ai;
          M[(r * N + k) * 2 + 1] -= fr * ai + fi * ar;
        }
        const br = x[col * 2], bi = x[col * 2 + 1];
        x[r * 2]     -= fr * br - fi * bi;
        x[r * 2 + 1] -= fr * bi + fi * br;
      }
    }
    for (let i = 0; i < N; i++) {
      const dr = M[(i * N + i) * 2], di = M[(i * N + i) * 2 + 1];
      const den = dr * dr + di * di;
      const xr = x[i * 2], xi = x[i * 2 + 1];
      x[i * 2]     = (xr * dr + xi * di) / den;
      x[i * 2 + 1] = (xi * dr - xr * di) / den;
    }
    return x;
  }
```

- [ ] **Step 5: 브라우저로 열어 검증**

콘솔에 `[검증] J0(1)= 0.765198 (기대 0.765198)`, `[검증] Y0(1)= 0.088257 (기대 0.088257)`
로그가 뜨고 `console.assert` 실패가 없는지 확인.

- [ ] **Step 6: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: 베셀/한켈/solveComplex 물리 코어 이식(출처: script.js)

- besselJ0/besselY0/hankel0/solveComplex 문자 그대로 복사, 출처 주석 명기
- selfCheck()에 J0(1)/Y0(1) 단언 추가, 브라우저 확인 완료

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 물리 코어 이식 — 프레넬 적분 (하위헌스 쪽)

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: 없음(독립).
- Produces: `fresnelCS(v)` → `[C,S]`, `kFactor(lambda,zDist)`,
  `totalAmplitude(Y,lambda,a,zDist,obstacleOn)` → `{re,im}`,
  `fresnelIntensity(Y,lambda,a,zDist,obstacleOn)` → number, `REF_INTENSITY = 2`.
  Task 7이 사용한다.

- [ ] **Step 1: `solveComplex` 정의 다음에 이식(출처: huygens/script.js)**

```js

  // =====================================================================
  // 4. 프레넬 회절 적분 (출처: huygens/script.js, 문자 그대로 이식)
  // =====================================================================
  function fresnelCS(v) {
    const x = Math.abs(v);
    const x2 = x * x;
    const f = (1 + 0.926 * x) / (2 + 1.792 * x + 3.104 * x2);
    const g = 1 / (2 + 4.142 * x + 3.492 * x2 + 6.670 * x2 * x);
    const phase = Math.PI * x2 / 2;
    const s = Math.sin(phase), c = Math.cos(phase);
    let C = 0.5 + f * s - g * c;
    let S = 0.5 - f * c - g * s;
    if (v < 0) { C = -C; S = -S; }
    return [C, S];
  }

  function kFactor(lambda, zDist) { return Math.sqrt(2 / (lambda * zDist)); }

  function totalAmplitude(Y, lambda, a, zDist, obstacleOn) {
    if (!obstacleOn) {
      return { re: 1, im: 1 };
    }
    const k = kFactor(lambda, zDist);
    const vLow = (-a / 2 - Y) * k;
    const vHigh = (a / 2 - Y) * k;
    const [Clow, Slow] = fresnelCS(vLow);
    const [Chigh, Shigh] = fresnelCS(vHigh);
    return {
      re: (Clow + 0.5) + (0.5 - Chigh),
      im: (Slow + 0.5) + (0.5 - Shigh),
    };
  }

  function fresnelIntensity(Y, lambda, a, zDist, obstacleOn) {
    const t = totalAmplitude(Y, lambda, a, zDist, obstacleOn);
    return t.re * t.re + t.im * t.im;
  }

  const REF_INTENSITY = 2;  // 장애물 없는 평면파 기준 세기(정규화용), huygens와 동일
```

- [ ] **Step 2: `selfCheck()`에 단언 추가**

```js
  function selfCheck() {
    console.log("[검증] J0(1)=", besselJ0(1).toFixed(6), "(기대 0.765198)");
    console.log("[검증] Y0(1)=", besselY0(1).toFixed(6), "(기대 0.088257)");
    {
      // 장애물 없음(obstacleOn=false) → 세기 = (1²+1²)/REF_INTENSITY = 1
      const I = fresnelIntensity(0, 0.01, 0.2, 0.3, false) / REF_INTENSITY;
      console.assert(Math.abs(I - 1) < 1e-9, "장애물 없음 세기=1 (정규화 기준)");
    }
  }
```

- [ ] **Step 3: 브라우저로 열어 검증**

콘솔에 `console.assert` 실패 없음, 기존 J0/Y0 로그 그대로 유지되는지 확인.

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: 프레넬 적분 물리 코어 이식(출처: huygens/script.js)

- fresnelCS/kFactor/totalAmplitude/fresnelIntensity 문자 그대로 복사
- REF_INTENSITY=2(huygens와 동일한 정규화 방식) 유지
- selfCheck()에 무장애물 세기=1 단언 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 이산화 전략 (d=λ/20, N≤400, 공차 1.05배)

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces: `computeDiscretization(H_mm, lam_cm)` →
  `{N, d_mm, a_mm, d_target_mm, warn}`. Task 6이 사용한다.

- [ ] **Step 1: `selfCheck()`에 단언 먼저 추가(실패하도록)**

```js
    {
      // §26.1: 대표 프리셋 "깊은 그림자"(H=200,λ=1cm) → N=400 상한 걸리지만
      // d=λ/19.95로 공차(1.05배) 안쪽 — 경고 없어야 함(오탐 방지가 이 공차의 목적)
      const r1 = computeDiscretization(200, 1);
      console.assert(r1.N === 400 && !r1.warn,
        "computeDiscretization(200,1cm): N=400 상한, 공차 안쪽이라 경고 없음");
      // H=300,λ=1cm → d=300/399=0.752mm, d_target=0.5mm, 비율 1.5 > 1.05 → 경고
      const r2 = computeDiscretization(300, 1);
      console.assert(r2.N === 400 && r2.warn,
        "computeDiscretization(300,1cm): N=400 상한, 공차 밖이라 경고 있음");
      // H=100,λ=12cm → d_target=6mm, ceil(100/6)+1=18, 상한 안 걸림 → 경고 없음
      const r3 = computeDiscretization(100, 12);
      console.assert(r3.N === 18 && !r3.warn,
        "computeDiscretization(100,12cm): 상한 안 걸림, 경고 없음");
    }
```
이 블록을 `selfCheck()` 안, 무장애물 세기=1 단언 다음에 삽입.

- [ ] **Step 2: 브라우저로 열어 실패 확인**

`ReferenceError: computeDiscretization is not defined`가 뜨는지 확인.

- [ ] **Step 3: 함수 정의**

`const REF_INTENSITY = 2;` 다음에 추가:
```js

  // =====================================================================
  // 5. 이산화 전략(§26) — 순수 함수, selfCheck()에서 단언
  // =====================================================================
  function computeDiscretization(H_mm, lam_cm) {
    const lam_mm = lam_cm * 10;
    const d_target_mm = lam_mm / 20;
    const N = Math.min(400, Math.max(2, Math.ceil(H_mm / d_target_mm) + 1));
    const d_mm = H_mm / (N - 1);
    const a_mm = d_mm / 2;
    const warn = d_mm > 1.05 * d_target_mm;
    return { N, d_mm, a_mm, d_target_mm, warn };
  }
```

- [ ] **Step 4: 브라우저로 열어 검증**

`console.assert` 실패 없음 확인.

- [ ] **Step 5: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: 이산화 전략(d=λ/20, N≤400, 공차 1.05배) 순수 함수 추가

- computeDiscretization: N=min(400,ceil(H/d_target)+1), d>1.05*d_target일 때만 경고
- 공차 없이 d>d_target만 쓰면 대표 프리셋(H=200,λ=1cm)에서 0.25% 미달로
  오탐 경고가 뜨는 문제(§26.1)를 방지
- selfCheck 3케이스(상한+공차 안쪽/상한+공차 밖/상한 안 걸림) 단언 통과

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: MoM 스크린 곡선 계산 (recomputeMoM)

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: Task 3의 `besselJ0/besselY0/hankel0/solveComplex`, Task 5의
  `computeDiscretization`.
- Produces: `sampleYs_mm(H_mm)` → `Float64Array(241)`,
  `recomputeMoM(H_mm, L_mm, lam_cm)` →
  `{ys_mm, Iy, I0, sbar, disc}`(disc는 Task 5의 반환값). Task 8/9/10이 사용한다.

- [ ] **Step 1: `computeDiscretization` 다음에 y 표본 함수 + MoM 곡선 계산 추가**

```js

  // =====================================================================
  // 6. 스크린 y 표본(§27.2: -1.5*(H/2) ~ +1.5*(H/2), 241점)
  // =====================================================================
  function sampleYs_mm(H_mm) {
    const halfRange = 1.5 * (H_mm / 2);
    const ys = new Float64Array(NUM_POINTS);
    for (let i = 0; i < NUM_POINTS; i++) {
      ys[i] = -halfRange + (2 * halfRange) * i / (NUM_POINTS - 1);
    }
    return ys;
  }

  // 한 점에서 입사·산란장 평가 (출처: script.js evalFields — 물리 동일,
  // 그리드 루프 대신 단일 점 평가로 재구성, §25.1)
  function evalFieldsAtPoint(wx, wy, k, wiresY, cRe, cIm, aEff_m) {
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

  function screenIntensityAt(L_m, wy, k, wiresY, cRe, cIm, aEff_m) {
    const f = evalFieldsAtPoint(L_m, wy, k, wiresY, cRe, cIm, aEff_m);
    const tr = f.incRe + f.scRe, ti = f.incIm + f.scIm;
    return tr * tr + ti * ti;
  }

  // 그림자 채움률 S̄(§19 로직 재사용) — 순수 함수
  function shadowFillRatioFromSamples(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i];
    return sum / samples.length;
  }

  function computeShadowFillRatioMoM(L_m, H_m, k, wiresY, cRe, cIm, aEff_m, samples = 100) {
    const arr = new Array(samples);
    for (let s = 0; s < samples; s++) {
      const wy = -H_m / 2 + (s + 0.5) / samples * H_m;
      arr[s] = screenIntensityAt(L_m, wy, k, wiresY, cRe, cIm, aEff_m);
    }
    return shadowFillRatioFromSamples(arr);
  }

  // MoM 스크린 곡선 계산 — recompute()(script.js:193~257)와 동일한 행렬 구성(§25.1)
  function recomputeMoM(H_mm, L_mm, lam_cm) {
    const t0 = performance.now();
    const lam_m = lam_cm / 100;
    const k = TWO_PI / lam_m;
    const disc = computeDiscretization(H_mm, lam_cm);
    const N = disc.N;
    const d_m = disc.d_mm / 1000;
    const aEff_m = disc.a_mm / 1000;

    const wiresY = new Float64Array(N);
    for (let n = 0; n < N; n++) wiresY[n] = (n - (N - 1) / 2) * d_m;

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

    const L_m = L_mm / 1000;
    const H_m = H_mm / 1000;
    const ys_mm = sampleYs_mm(H_mm);
    const Iy = new Float64Array(NUM_POINTS);
    for (let i = 0; i < NUM_POINTS; i++) {
      Iy[i] = screenIntensityAt(L_m, ys_mm[i] / 1000, k, wiresY, cRe, cIm, aEff_m);
    }
    const I0 = screenIntensityAt(L_m, 0, k, wiresY, cRe, cIm, aEff_m);
    const sbar = computeShadowFillRatioMoM(L_m, H_m, k, wiresY, cRe, cIm, aEff_m);

    const dt = performance.now() - t0;
    console.log(`[성능] recomputeMoM() N=${N}, ${dt.toFixed(1)} ms`);

    return { ys_mm, Iy, I0, sbar, disc };
  }
```

- [ ] **Step 2: selfCheck에 단언 추가**

```js
    {
      const r = recomputeMoM(200, 300, 1);
      console.assert(r.sbar >= 0 && r.sbar <= 0.08 + 1e-6,
        "recomputeMoM(H=200,L=300,λ=1cm): S̄가 0.08 이하(§28.1 기준4, 이산화 누설 없음)");
      console.log("[검증] recomputeMoM 기본 케이스 S̄=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
    }
```

- [ ] **Step 3: 브라우저로 열어 검증**

콘솔에 `[성능] recomputeMoM() N=400, xx.x ms` 로그와 `[검증] recomputeMoM 기본 케이스
S̄=0.0xxx` 로그가 찍히고, `console.assert` 실패가 없는지 확인(S̄ ≈ 0.076 근방 기대,
§26.2 수렴표 참고).

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: MoM 스크린 곡선/S̄/I₀ 계산(recomputeMoM) 추가

- sampleYs_mm: 241점 y 표본(-1.5*(H/2)~+1.5*(H/2), §27.2)
- evalFieldsAtPoint/screenIntensityAt: script.js evalFields를 그리드 대신
  단일 점 평가로 재구성(물리 동일)
- shadowFillRatioFromSamples/computeShadowFillRatioMoM: S̄ 100점 샘플 평균
- recomputeMoM: script.js recompute()와 동일한 MoM 행렬 구성, 241점 곡선 산출
- selfCheck: H=200/L=300/λ=1cm 기준 S̄≤0.08 단언(이산화 누설 가드)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 하위헌스 스크린 곡선 계산 (recomputeHuygens)

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: Task 4의 `fresnelIntensity`/`REF_INTENSITY`, Task 6의 `sampleYs_mm`,
  `shadowFillRatioFromSamples`.
- Produces: `recomputeHuygens(H_mm, L_mm, lam_cm)` → `{ys_mm, Iy, I0, sbar}`.
  Task 8/9/10이 사용한다.

- [ ] **Step 1: `recomputeMoM` 다음에 추가**

```js

  // 하위헌스 스크린 곡선 계산 — a(장애물 폭)에 H(전체 폭)를 그대로 전달(§25.2:
  // 두 모형의 H/a는 기하학적으로 같은 양, computeSolidWireLayout이 확인)
  function computeShadowFillRatioHuygens(lam_m, a_m, z_m, H_m, samples = 100) {
    const arr = new Array(samples);
    for (let s = 0; s < samples; s++) {
      const wy = -H_m / 2 + (s + 0.5) / samples * H_m;
      arr[s] = fresnelIntensity(wy, lam_m, a_m, z_m, true) / REF_INTENSITY;
    }
    return shadowFillRatioFromSamples(arr);
  }

  function recomputeHuygens(H_mm, L_mm, lam_cm) {
    const lam_m = lam_cm / 100;
    const a_m = H_mm / 1000;
    const z_m = L_mm / 1000;
    const H_m = H_mm / 1000;
    const ys_mm = sampleYs_mm(H_mm);
    const Iy = new Float64Array(NUM_POINTS);
    for (let i = 0; i < NUM_POINTS; i++) {
      const Y_m = ys_mm[i] / 1000;
      Iy[i] = fresnelIntensity(Y_m, lam_m, a_m, z_m, true) / REF_INTENSITY;
    }
    const I0 = fresnelIntensity(0, lam_m, a_m, z_m, true) / REF_INTENSITY;
    const sbar = computeShadowFillRatioHuygens(lam_m, a_m, z_m, H_m);
    return { ys_mm, Iy, I0, sbar };
  }
```

- [ ] **Step 2: selfCheck에 단언 추가**

```js
    {
      const r = recomputeHuygens(200, 300, 1);
      console.assert(Math.abs(r.sbar - 0.057) < 0.01,
        "recomputeHuygens(H=200,L=300,λ=1cm): S̄≈0.057(§26.2 수렴표 해석식 기준)");
      console.log("[검증] recomputeHuygens 기본 케이스 S̄=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
    }
```

- [ ] **Step 3: 브라우저로 열어 검증**

콘솔에 `[검증] recomputeHuygens 기본 케이스 S̄=0.0xxx` 로그(≈0.057 근방)가 찍히고
`console.assert` 실패가 없는지 확인.

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: 하위헌스 스크린 곡선/S̄/I₀ 계산(recomputeHuygens) 추가

- H_mm을 huygens 쪽 장애물 폭 a로 그대로 전달(§25.2, 두 모형 H/a는 동일 기하량)
- REF_INTENSITY=2로 정규화(huygens 원본과 동일)
- selfCheck: H=200/L=300/λ=1cm 기준 S̄≈0.057(해석식) 단언

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 메인 플롯 렌더링 + 지표 박스

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: Task 6/7의 `recomputeMoM`/`recomputeHuygens` 반환 형태(`ys_mm`, `Iy`,
  `I0`, `sbar`, `disc`).
- Produces: `drawMainPlot(mom, huy, H_mm)`, `fresnelNumber(H_mm, L_mm, lam_cm)`,
  `updateInfoBox(mom, huy, H_mm, L_mm, lam_cm)`. Task 9가 이 셋을 호출한다.

- [ ] **Step 1: `recomputeHuygens` 다음에 Fresnel 수 + 렌더링 함수 추가**

```js

  // =====================================================================
  // 7. Fresnel 수 + 렌더링
  // =====================================================================
  function fresnelNumber(H_mm, L_mm, lam_cm) {
    const lam_mm = lam_cm * 10;
    return Math.pow(H_mm / 2, 2) / (L_mm * lam_mm);
  }

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function drawMainPlot(mom, huy, H_mm) {
    const canvas = el.mainCanvas;
    const { w, h } = resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const m = { left: 46, right: 16, top: 16, bottom: 30 };
    const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
    const halfRange = 0.75 * H_mm;   // 1.5*(H/2)
    let Imax = 2;
    for (let i = 0; i < mom.Iy.length; i++) Imax = Math.max(Imax, mom.Iy[i], huy.Iy[i]);
    Imax = Math.ceil(Imax);
    const px = (y_mm) => m.left + (y_mm + halfRange) / (2 * halfRange) * plotW;
    const py = (I) => m.top + (1 - I / Imax) * plotH;

    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(m.left + 0.5, m.top + 0.5, plotW - 1, plotH - 1);

    // 기하 그림자 음영 |y|<=H/2(§27.2)
    const shadeX0 = px(-H_mm / 2), shadeX1 = px(H_mm / 2);
    ctx.fillStyle = "rgba(120,120,128,0.12)";
    ctx.fillRect(shadeX0, m.top, shadeX1 - shadeX0, plotH);

    // 입사=1 기준선
    ctx.strokeStyle = "#aab2cf"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.left, py(1)); ctx.lineTo(m.left + plotW, py(1)); ctx.stroke();
    ctx.setLineDash([]);

    // MoM 곡선(파랑 실선)
    ctx.strokeStyle = "#2f6feb"; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 0; i < mom.ys_mm.length; i++) {
      const x = px(mom.ys_mm[i]), y = py(mom.Iy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 하위헌스 곡선(빨강 점선)
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.8; ctx.setLineDash([5, 4]); ctx.beginPath();
    for (let i = 0; i < huy.ys_mm.length; i++) {
      const x = px(huy.ys_mm[i]), y = py(huy.Iy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 축 라벨
    ctx.fillStyle = "#5a5a62"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("스크린 위치 y (mm)", m.left + plotW / 2, h - 4);
    ctx.save(); ctx.translate(12, m.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("I / I₀(입사)", 0, 0); ctx.restore();
    ctx.textAlign = "left"; ctx.fillText((-halfRange).toFixed(0), m.left, h - 16);
    ctx.textAlign = "right"; ctx.fillText(halfRange.toFixed(0), m.left + plotW, h - 16);
    ctx.textAlign = "left"; ctx.fillText(Imax.toFixed(0), 4, m.top + 10);

    // 범례
    ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.strokeStyle = "#2f6feb"; ctx.setLineDash([]); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(m.left + 10, m.top + 14); ctx.lineTo(m.left + 30, m.top + 14); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillText("MoM(금속 막대)", m.left + 34, m.top + 18);
    ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(m.left + 10, m.top + 30); ctx.lineTo(m.left + 30, m.top + 30); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText("Huygens(프레넬)", m.left + 34, m.top + 34);
  }

  function updateInfoBox(mom, huy, H_mm, L_mm, lam_cm) {
    const nF = fresnelNumber(H_mm, L_mm, lam_cm);
    const diffPct = Math.abs(mom.sbar - huy.sbar) / Math.max(huy.sbar, 1e-9) * 100;
    const warnBadge = mom.disc.warn
      ? ` <span class="badge warn">⚠ N=${mom.disc.N} 상한, d=λ/${(lam_cm * 10 / mom.disc.d_mm).toFixed(1)} (목표 λ/20 미달)</span>`
      : "";
    el.infoBox.innerHTML =
      `Fresnel 수 <b>N_F = ${nF.toFixed(2)}</b> <span style="font-size:11px;color:#6b6b72">(하위헌스 앱의 a²/(λz)는 이 값의 4배)</span><br>` +
      `I₀ — MoM <b>${mom.I0.toFixed(3)}</b> · Huygens <b>${huy.I0.toFixed(3)}</b> (입사=1.000)<br>` +
      `S̄ — MoM <b>${mom.sbar.toFixed(3)}</b> · Huygens <b>${huy.sbar.toFixed(3)}</b><br>` +
      `S̄ 상대 차이 <b>${diffPct.toFixed(1)}%</b>` + warnBadge;
  }
```

- [ ] **Step 2: 브라우저로 열어 확인용 임시 호출 추가(Task 9에서 실제 흐름으로 대체됨)**

`selfCheck();` 호출 다음에 임시로 아래를 추가(다음 Task에서 제거/대체될 임시 확인용):
```js
  {
    const mom = recomputeMoM(state.H_mm, state.L_mm, state.lam_cm);
    const huy = recomputeHuygens(state.H_mm, state.L_mm, state.lam_cm);
    drawMainPlot(mom, huy, state.H_mm);
    updateInfoBox(mom, huy, state.H_mm, state.L_mm, state.lam_cm);
  }
```

- [ ] **Step 3: 브라우저로 열어 검증**

메인 플롯에 파랑 실선(MoM)·빨강 점선(Huygens) 곡선, 회색 음영(|y|≤100mm), 입사=1
점선 기준선, 범례가 보이는지 확인. 지표 박스에 N_F/I₀×2/S̄×2/상대차이%가 채워지는지
확인. 콘솔 에러·assert 실패 없음.

- [ ] **Step 4: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: 메인 플롯 렌더링(2곡선+기하그림자 음영+범례) + 지표 박스 추가

- drawMainPlot: MoM 파랑 실선/Huygens 빨강 점선, |y|<=H/2 음영, 입사=1 기준선
- updateInfoBox: N_F(+각주), I0×2, S̄×2, 상대차이%, 이산화 경고 배지
- 임시 호출로 브라우저 확인(Task 9에서 실제 상태 흐름으로 대체 예정)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 상태 흐름 연결 — 디바운스 동시 갱신 + 프리셋

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: Task 2의 `state`/`el`/`syncLabels`/`setSlidersFromState`, Task 6~8의
  `recomputeMoM`/`recomputeHuygens`/`drawMainPlot`/`updateInfoBox`.
- Produces: `recomputeBoth()`, `scheduleRecompute()`. Task 10이 `recomputeBoth()`를
  재사용한다.

- [ ] **Step 1: Task 8 Step 2의 임시 호출 블록을 제거**

메인 흐름 함수로 대체할 것이므로, Task 8에서 추가한 임시 `{ const mom = ...
}` 블록 전체를 삭제한다.

- [ ] **Step 2: `updateInfoBox` 다음에 상태 흐름 함수 추가**

```js

  // =====================================================================
  // 8. 상태 흐름 — H/L/λ 슬라이더는 같은 디바운스 안에서 두 모형을 함께 갱신(§27.4)
  // =====================================================================
  function recomputeBoth() {
    const mom = recomputeMoM(state.H_mm, state.L_mm, state.lam_cm);
    const huy = recomputeHuygens(state.H_mm, state.L_mm, state.lam_cm);
    drawMainPlot(mom, huy, state.H_mm);
    updateInfoBox(mom, huy, state.H_mm, state.L_mm, state.lam_cm);
    return { mom, huy };
  }

  let recomputeTimer = null;
  function scheduleRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recomputeBoth, 200);
  }
```

- [ ] **Step 3: 슬라이더 이벤트 바인딩 추가**

```js

  el.hSlider.addEventListener("input", function () {
    state.H_mm = parseFloat(this.value);
    syncLabels();
    scheduleRecompute();
  });
  el.lSlider.addEventListener("input", function () {
    state.L_mm = parseFloat(this.value);
    syncLabels();
    scheduleRecompute();
  });
  el.lamSlider.addEventListener("input", function () {
    state.lam_cm = parseFloat(this.value);
    syncLabels();
    scheduleRecompute();
  });

  const PRESETS = {
    preset1Btn: { lam_cm: 1 },
    preset2Btn: { lam_cm: 4 },
    preset3Btn: { lam_cm: 20 },
  };
  Object.keys(PRESETS).forEach((id) => {
    el[id].addEventListener("click", () => {
      state.H_mm = 200; state.L_mm = 300; state.lam_cm = PRESETS[id].lam_cm;
      setSlidersFromState();
      recomputeBoth();
    });
  });

  window.addEventListener("resize", () => { drawMainPlot === undefined || recomputeBoth(); });
```

- [ ] **Step 4: 시작부에서 `recomputeBoth()` 최초 1회 호출**

`setSlidersFromState();` / `selfCheck();` 호출 다음에 추가:
```js
  setSlidersFromState();
  selfCheck();
  recomputeBoth();
```

- [ ] **Step 5: 브라우저로 열어 검증**

- 페이지 로드 시 기본값(H=200/L=300/λ=1cm)으로 플롯·지표 박스가 채워짐.
- H/L/λ 슬라이더를 드래그하는 동안 200ms 후 **두 곡선이 항상 같은 λ/H/L로 함께**
  바뀜(하나만 먼저 바뀌는 순간이 보이지 않아야 함).
- 프리셋 3개 클릭 시 슬라이더 핸들 위치·라벨이 즉시 H=200mm/L=300mm/해당 λ로
  동기화되고, 플롯·지표가 즉시(디바운스 없이) 갱신됨.
- 콘솔 에러·assert 실패 없음.

- [ ] **Step 6: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: 슬라이더 디바운스 동시 갱신 + 프리셋 3개 연결

- recomputeBoth(): MoM+Huygens를 한 호출에서 함께 재계산·렌더(§27.4,
  하위헌스만 먼저 갱신하지 않음 — 두 곡선 비교 목적상 동기화 필수)
- H/L/λ 슬라이더: 200ms 디바운스로 recomputeBoth() 예약
- 프리셋 3개: H=200/L=300 고정 + λ만 변경, setSlidersFromState()로 슬라이더 동기화

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: λ 스윕 (async 진행률 + S̄ vs λ 결과 차트)

**Files:**
- Modify: `C:/dev/fourth-task/compare.js`

**Interfaces:**
- Consumes: Task 6/7의 `recomputeMoM`/`recomputeHuygens`(현재 `state.H_mm`/`L_mm`
  기준으로 λ만 바꿔 재사용).
- Produces: 없음(버튼 클릭 시 사이드 이펙트만).

- [ ] **Step 1: `scheduleRecompute` 다음에 λ 스윕 함수 추가**

```js

  // =====================================================================
  // 9. λ 스윕 — 진행률 표시 + S̄ vs λ 로그축 차트(§27.4)
  // =====================================================================
  function logSpace(minV, maxV, n) {
    const arr = new Array(n);
    const logMin = Math.log10(minV), logMax = Math.log10(maxV);
    for (let i = 0; i < n; i++) arr[i] = Math.pow(10, logMin + (logMax - logMin) * i / (n - 1));
    return arr;
  }

  function drawSweepChart(lambdas, sMoM, sHuy) {
    const canvas = el.sweepCanvas;
    const { w, h } = resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const m = { left: 50, right: 16, top: 16, bottom: 30 };
    const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
    const logMin = Math.log10(1), logMax = Math.log10(30);
    let Smax = 0.05;
    for (let i = 0; i < sMoM.length; i++) Smax = Math.max(Smax, sMoM[i], sHuy[i]);
    const px = (lam) => m.left + (Math.log10(lam) - logMin) / (logMax - logMin) * plotW;
    const py = (s) => m.top + (1 - s / Smax) * plotH;

    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(m.left + 0.5, m.top + 0.5, plotW - 1, plotH - 1);

    function drawCurve(color, dash, values) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < lambdas.length; i++) {
        const x = px(lambdas[i]), y = py(values[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawCurve("#2f6feb", null, sMoM);
    drawCurve("#c0392b", [5, 4], sHuy);

    ctx.fillStyle = "#5a5a62"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("파장 λ (cm, 로그축)", m.left + plotW / 2, h - 4);
    ctx.textAlign = "left"; ctx.fillText("1", m.left, h - 16);
    ctx.textAlign = "right"; ctx.fillText("30", m.left + plotW, h - 16);
    ctx.save(); ctx.translate(14, m.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.fillText("S̄ (파랑=MoM, 빨강=Huygens)", 0, 0); ctx.restore();
  }

  async function runSweep() {
    const lambdas = logSpace(1, 30, 10);
    const sMoM = [], sHuy = [];
    el.sweepPanel.classList.add("show");
    for (let i = 0; i < lambdas.length; i++) {
      el.sweepProgress.textContent = `진행 중... (${i + 1}/${lambdas.length}, λ=${lambdas[i].toFixed(2)}cm)`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const mom = recomputeMoM(state.H_mm, state.L_mm, lambdas[i]);
      const huy = recomputeHuygens(state.H_mm, state.L_mm, lambdas[i]);
      sMoM.push(mom.sbar); sHuy.push(huy.sbar);
    }
    el.sweepProgress.textContent = `완료 (H=${state.H_mm}mm, L=${state.L_mm}mm 기준, λ=1~30cm 10점)`;
    drawSweepChart(lambdas, sMoM, sHuy);
    recomputeBoth();   // 스윕 중 state.H/L/λ는 안 바뀌지만, 메인 플롯 λ 슬라이더 값 기준으로 재동기화
  }

  el.sweepBtn.addEventListener("click", () => { runSweep(); });
```

- [ ] **Step 2: 브라우저로 열어 검증**

"λ 스윕" 버튼 클릭 시: 스윕 패널이 나타나고(클릭 전엔 숨김), 진행률 텍스트가
"진행 중... (1/10, λ=1.00cm)" 형태로 순차 갱신되며 UI가 멈추지 않음(다른 슬라이더를
스윕 도중 조작해도 반응함), 완료 후 "완료 (...)" 텍스트와 S̄ vs λ 로그축 차트
(파랑=MoM, 빨강=Huygens, λ가 커질수록 S̄가 증가하는 추세)가 보임. 콘솔 에러 없음.

- [ ] **Step 3: Commit**

```bash
cd "C:/dev/fourth-task"
git add compare.js
git commit -m "$(cat <<'EOF'
기능: λ 스윕(1~30cm 로그 10점) 진행률 표시 + S̄ vs λ 결과 차트 추가

- runSweep(): async 루프 + requestAnimationFrame 프레임 양보로 UI 안 멈춤
- drawSweepChart(): 로그 x축, MoM/Huygens 두 S̄ 곡선
- 결과 패널은 버튼 클릭 전 숨김, 완료 후 진행률 패널 자리에 차트 표시

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: 최종 검증 패스

**Files:** 없음(확인만, 코드 변경 없음. 문제 발견 시에만 별도 수정 커밋).

- [ ] **Step 1: huygens/ + 기존 3파일 무변경 확인(해시 재비교, git diff 아님)**

```bash
cd "C:/dev/fourth-task"
sha256sum huygens/index.html huygens/script.js huygens/style.css index.html script.js style.css \
  > .superpowers/sdd/compare-page-huygens-hash-after.txt
diff .superpowers/sdd/compare-page-huygens-hash-before.txt .superpowers/sdd/compare-page-huygens-hash-after.txt
```
`diff` 출력이 없어야(완전히 동일) 한다. 차이가 있으면 어느 파일이 바뀌었는지 확인하고
원인 커밋을 찾아 되돌린다(이 계획은 두 파일을 절대 수정하지 않는다).

- [ ] **Step 2: acceptance criteria 재현(브라우저, §28.1)**

`compare.html`을 열고 H=200mm/L=300mm 고정 상태에서:
1. λ=2cm: 그림자 가장자리 바깥 첫 밝은 무늬가 두 모형 모두 y≈160mm(±3mm), 세기
   1.3~1.4 부근인지 메인 플롯에서 눈으로 확인(또는 마우스 호버로 좌표 확인 어려우면
   Playwright로 Iy 배열 직접 조회).
2. λ=3cm: 지표 박스의 S̄가 두 모형 모두 0.100±0.005.
3. λ=30cm: S̄_MoM ≈ 0.22, S̄_Huygens ≈ 0.33(하위헌스가 높음 — 정상, 근축 힌트 문구가
   설명하는 것과는 다른 현상이니 혼동 주의: 이건 키르히호프의 회절 과대평가이지
   근축 근사 붕괴가 아님).
4. λ=1cm(프리셋 1): 지표 박스 S̄_MoM ≤ 0.08.
5. Step 1의 해시 비교로 이미 확인됨.

- [ ] **Step 3: selfCheck + 콘솔 에러 0건 확인**

`compare.html` 로드 시 콘솔에 `console.assert` 실패가 하나도 없는지, 페이지 에러가
0건인지 확인.

- [ ] **Step 4: 성능 로그 확인**

λ=1cm, H=300mm 근방(프리셋 없이 H 슬라이더를 300으로) 조합에서 `[성능]
recomputeMoM() N=400, xx.x ms` 로그가 찍히는지 확인(N=400 케이스의 실제 소요 시간
기록 목적).

- [ ] **Step 5: (선택) requesting-code-review 스킬로 변경 검토**

문제 없으면 종료. 문제 발견 시 별도 수정 커밋 후 이 Task를 재검증한다.

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- §25(물리 코어 이식, 출처 명기) → Task 3~4.
- §26(이산화 전략, d=λ/20, N≤400, 공차 1.05배) → Task 5, Task 6의 S̄ 단언.
- §27.1(파일 구성) → Task 2. §27.2(레이아웃) → Task 1(프리뷰)+Task 2.
- §27.3(프리셋, H/L 고정+setSlidersFromState) → Task 9.
- §27.4(두 곡선 동시 디바운스 갱신, λ스윕 진행률) → Task 9, Task 10.
- §27.5(N_F 각주, I₀/S̄/상대차이 표시, 경고 배지, 근축 힌트 문구) → Task 8(계산+표시),
  근축 힌트 문구는 Task 2에서 이미 정적 텍스트로 배치(물리와 무관한 상시 문구).
- §28.1(acceptance criteria 5개) → Task 11 Step 1~2.
- §28.2(selfCheck, 콘솔 에러 0건, 성능 로그, Playwright 재현) → Task 11 Step 3~4.
- §24 "절대 변경 금지" → Global Constraints + 모든 Task에서 읽기 전용 참조만.
- **gotcha(huygens/ untracked, git diff로 못 잡음)** → Task 1 Step 1(사전 해시)과
  Task 11 Step 1(사후 해시 비교)로 반영.
- **CLAUDE.md 규칙 6(미리보기 먼저)** → Task 1이 전담(컨트롤러 직접 수행, 서브에이전트
  위임 안 함).

**Placeholder scan:** 빈 항목 없음. 모든 코드 단계에 실제 코드 포함.

**Type consistency:** `recomputeMoM`/`recomputeHuygens`가 공통으로 `{ys_mm, Iy, I0,
sbar}` 형태를 반환(MoM만 추가로 `disc` 포함)하도록 Task 6/7에서 통일했고, Task
8(`drawMainPlot`/`updateInfoBox`)·Task 9(`recomputeBoth`)·Task 10(`runSweep`)이
모두 이 형태를 그대로 사용한다. `computeDiscretization`의 반환 필드명(`N`, `d_mm`,
`a_mm`, `d_target_mm`, `warn`)이 Task 5 정의와 Task 6(`recomputeMoM` 내부 사용)·
Task 8(`updateInfoBox`의 경고 배지) 간에 일치한다.

**알려진 트레이드오프:**
- λ스윕은 현재 슬라이더의 H/L 값을 그대로 쓴다(프리셋과 무관) — 사용자가 H/L을 바꾼
  채로 스윕하면 §28.1 acceptance 수치(H=200/L=300 기준)와 다른 결과가 나오는 게
  정상이며, 이는 스윕이 "현재 조건에서의 λ 의존성"을 보여주는 도구이지 고정
  검증 버튼이 아니기 때문이다(설계 §27.4에 스윕 시 H/L 고정 요구 없음).
