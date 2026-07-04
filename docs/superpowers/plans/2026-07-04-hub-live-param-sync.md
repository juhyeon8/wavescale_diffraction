# 허브 라이브 파라미터 동기화 + 하위헌스 스케일 고정 기본화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hub.html의 마스터 슬라이더/프리셋이 iframe 3개를 리로드하지 않고 postMessage로 파라미터만 전달해 즉시 반영되게 하고, 하위헌스 앱의 "화면 스케일 고정"을 허브 안에서 기본 켜짐으로 만든다.

**Architecture:** §30(hub.html/hub.js)에 이미 있는 postMessage 채널(`scrollToPanelMain`)을 확장해 `{ type: 'diffhub-setParams', H_mm, L_mm, lam_cm }` 메시지를 추가한다. 세 앱(script.js/huygens/script.js/compare.js)은 각자 기존 슬라이더 input 핸들러가 쓰는 상태 갱신 + 동기화 + 디바운스 recompute 경로를 그대로 재사용한다. 새 계산 경로·새 상태 필드는 만들지 않는다.

**Tech Stack:** 순수 HTML/CSS/JS, 빌드 도구 없음, 테스트 러너 없음(브라우저 devtools 콘솔로 수동 검증).

## Global Constraints

- 메시지 타입 문자열은 정확히 `'diffhub-setParams'`. 다른 타입/형식은 무시(전체 `try/catch`로 감싸 콘솔 에러 0건 유지).
- 각 앱은 **기존 디바운스 recompute 경로**만 호출한다(금속: `scheduleRecompute()`, 하위헌스: `scheduleRecompute(0)`, compare: `scheduleRecompute()`). 새 recompute 함수를 만들지 않는다.
- `postMessage`의 targetOrigin은 기존 코드와 동일하게 `'*'`(file:// opaque origin이라 특정 오리진 지정 불가 — §30.7 참고).
- 파라미터가 없거나 메시지가 없으면 단독 실행 시 기존 동작과 100% 동일해야 한다(회귀 금지).
- `↺ 전체 초기화` 버튼이 만드는 하위헌스 URL에도 `&lockScale=1`을 붙인다(사용자 확정 — 탈출구로 리로드해도 허브 기본값인 스케일 고정이 유지되어야 함).

---

## Task 1: 금속 앱(script.js) — setParams 메시지 리스너

**Files:**
- Modify: `script.js:1064-1066` (닫는 IIFE 직전에 새 블록 삽입)

**Interfaces:**
- Consumes: 기존 `state.mode/H_mm/L_mm/lam_cm`, `syncActivePhysics()`(script.js:739), `applyModeUI()`(script.js:869), `syncLabels()`(script.js:812), `scheduleRecompute()`(script.js:826), `#hSlider/#lSlider/#lamSlider` DOM 요소.
- Produces: 없음(터미널 리스너).

- [ ] **Step 1: 메시지 리스너 추가**

`script.js`의 `drawFrame();` (1064줄) 과 `requestAnimationFrame(loop);` (1065줄) 사이, 즉 `})();` 직전에 아래 블록을 추가한다.

```javascript
  // =====================================================================
  // 허브(hub.html) 연동 — 리로드 없이 파라미터만 갱신(§30.8)
  // =====================================================================
  window.addEventListener("message", function (e) {
    try {
      if (!e.data || e.data.type !== "diffhub-setParams") return;
      if (state.mode !== "solid") {
        state.mode = "solid";
        applyModeUI();
      }
      state.H_mm = e.data.H_mm;
      state.L_mm = e.data.L_mm;
      state.lam_cm = e.data.lam_cm;
      syncActivePhysics();
      document.getElementById("hSlider").value = state.H_mm;
      document.getElementById("lSlider").value = state.L_mm;
      document.getElementById("lamSlider").value = state.lam_cm;
      syncLabels();
      scheduleRecompute();
    } catch (err) { /* 조용히 무시 */ }
  });
```

- [ ] **Step 2: 수동 검증**

`index.html`을 더블클릭으로 열고 devtools 콘솔에서:

```javascript
window.postMessage({ type: 'diffhub-setParams', H_mm: 250, L_mm: 150, lam_cm: 12 }, '*');
```

기대 결과: "솔리드 막대 모드" 버튼이 active로 바뀌고, H/L/λ 슬라이더와 라벨이 각각 250mm/150mm/12cm로 바뀌며, 약 1~2초 뒤 그림이 재계산된다. 콘솔 에러 없음.

- [ ] **Step 3: 회귀 확인**

`index.html`을 파라미터 없이 열고 selfCheck() 콘솔 출력에 `console.assert` 실패(빨간 줄) 없음을 확인.

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "기능: 금속 앱에 허브 setParams 메시지 리스너 추가"
```

---

## Task 2: 하위헌스 앱(huygens/script.js) — setParams 분기 + lockScale URL 파라미터

**Files:**
- Modify: `huygens/script.js:763-768` (`applyUrlParams`)
- Modify: `huygens/script.js:865-878` (`init`)
- Modify: `huygens/script.js:886-893` (기존 `message` 리스너)

**Interfaces:**
- Consumes: `state.a/z/lambda`(huygens/script.js:6-21), `setSlidersFromState()`(747), `scheduleRecompute(delay)`(215), `el.scaleLockToggle`(240).
- Produces: 없음(터미널 리스너/초기화).

- [ ] **Step 1: `applyUrlParams`가 lockScale 플래그를 반환하도록 수정**

```javascript
function applyUrlParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.has('lambda')) state.lambda = Math.min(RANGES.lambda.max, Math.max(RANGES.lambda.min, parseFloat(p.get('lambda'))));
  if (p.has('a')) state.a = Math.min(RANGES.a.max, Math.max(RANGES.a.min, parseFloat(p.get('a'))));
  if (p.has('z')) state.z = Math.min(RANGES.z.max, Math.max(RANGES.z.min, parseFloat(p.get('z'))));
  return { lockScale: p.get('lockScale') === '1' };
}
```

- [ ] **Step 2: `init()`에서 초기 렌더 후 스케일 고정 체크박스를 프로그램적으로 켜기**

```javascript
function init() {
  const urlParams = applyUrlParams();
  setSlidersFromState();
  resizeAllCanvases();
  recomputeAll();
  attachScreenInteraction();
  drawAll();
  if (urlParams.lockScale) {
    el.scaleLockToggle.checked = true;
    el.scaleLockToggle.dispatchEvent(new Event('change'));
  }
  requestAnimationFrame(tick);

  window.addEventListener('resize', () => {
    resizeAllCanvases();
    drawAll();
  });
}
```

(기존 체크 핸들러(huygens/script.js:722-737)가 `state.scaleLocked`/`lockedHalfHeight` 스냅샷·`scheduleRecompute(0)`을 그대로 처리하므로 새 로직 없음. `lockScale` 파라미터가 없으면 `urlParams.lockScale`이 `false`라 기존 동작과 100% 동일.)

- [ ] **Step 3: 기존 `message` 리스너에 setParams 분기 추가**

```javascript
window.addEventListener('message', (e) => {
  try {
    if (e.data === 'scrollToPanelMain') {
      const panel = document.getElementById('panel-main');
      if (panel) panel.scrollIntoView({ block: 'start' });
    } else if (e.data && e.data.type === 'diffhub-setParams') {
      state.a = e.data.H_mm / 1000;
      state.z = e.data.L_mm / 1000;
      state.lambda = e.data.lam_cm / 100;
      setSlidersFromState();
      scheduleRecompute(0);
    }
  } catch (err) { /* 조용히 무시 */ }
});
```

- [ ] **Step 4: 수동 검증**

`huygens/index.html?lockScale=1`을 열고: 로드 직후 "화면 스케일 고정" 체크박스가 켜져 있고 고정 반높이 슬라이더 섹션이 보임을 확인. devtools 콘솔에서:

```javascript
window.postMessage({ type: 'diffhub-setParams', H_mm: 250, L_mm: 150, lam_cm: 12 }, '*');
```

기대 결과: λ/a/z 로그 슬라이더가 즉시 새 값으로 이동, 곡선이 즉시 재계산되며 Y축 반높이(고정값)는 바뀌지 않음.

- [ ] **Step 5: 회귀 확인**

`huygens/index.html`을 파라미터 없이 연다. 스케일 고정 체크박스가 꺼진 기존 초기 상태와 동일한지 확인. 콘솔 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add huygens/script.js
git commit -m "기능: 하위헌스 앱에 setParams 메시지 분기 + lockScale URL 파라미터 추가"
```

---

## Task 3: 비교 앱(compare.js) — setParams 메시지 리스너

**Files:**
- Modify: `compare.js:576-577` (닫는 IIFE 직전에 새 블록 삽입)

**Interfaces:**
- Consumes: `state.H_mm/L_mm/lam_cm`(compare.js:13-15), `setSlidersFromState()`(523), `scheduleRecompute()`(388).
- Produces: 없음(터미널 리스너).

- [ ] **Step 1: 메시지 리스너 추가**

`compare.js`의 `recomputeBoth();` (576줄) 다음, `})();` 직전에 추가한다.

```javascript
  // =====================================================================
  // 허브(hub.html) 연동 — 리로드 없이 파라미터만 갱신(§30.8)
  // =====================================================================
  window.addEventListener("message", function (e) {
    try {
      if (!e.data || e.data.type !== "diffhub-setParams") return;
      state.H_mm = e.data.H_mm;
      state.L_mm = e.data.L_mm;
      state.lam_cm = e.data.lam_cm;
      setSlidersFromState();
      scheduleRecompute();
    } catch (err) { /* 조용히 무시 */ }
  });
```

- [ ] **Step 2: 수동 검증**

`compare.html`을 열고 devtools 콘솔에서:

```javascript
window.postMessage({ type: 'diffhub-setParams', H_mm: 250, L_mm: 150, lam_cm: 12 }, '*');
```

기대 결과: H/L/λ 슬라이더·라벨이 갱신되고 약 200ms 뒤 메인 플롯·정보 박스가 재계산됨.

- [ ] **Step 3: 회귀 확인**

`compare.html`을 파라미터 없이 열고 selfCheck() 콘솔 단언 실패 없음을 확인.

- [ ] **Step 4: Commit**

```bash
git add compare.js
git commit -m "기능: 비교 앱에 허브 setParams 메시지 리스너 추가"
```

---

## Task 4: hub.html — 라벨/힌트/초기 src 수정

**Files:**
- Modify: `hub.html:78-83` (`applyBtn` 라벨, `mHint` 문구)
- Modify: `hub.html:89` (huygens iframe 초기 src)

**Interfaces:**
- Consumes: 없음(정적 마크업).
- Produces: `#applyBtn` 텍스트/`#huygensFrame` 초기 `src`를 Task 6(hub.js)이 그대로 사용.

- [ ] **Step 1: 적용 버튼 라벨 교체**

```html
<button id="applyBtn">↺ 전체 초기화</button>
```

(78줄 `<button id="applyBtn">양쪽에 적용</button>` 대체)

- [ ] **Step 2: 힌트 문구 교체**

```html
<div class="mHint">슬라이더·프리셋은 리로드 없이 즉시 반영됩니다. ↺는 전체 초기화(리로드)입니다. 하위헌스 화면의 a&sup2;/(&lambda;z)는 금속 앱 N_F의 4배입니다.</div>
```

(83줄 대체)

- [ ] **Step 3: 하위헌스 iframe 초기 src에 lockScale=1 추가**

```html
<div id="huygensWrap"><iframe id="huygensFrame" src="./huygens/index.html?lambda=0.04&a=0.2&z=0.3&lockScale=1"></iframe></div>
```

(89줄 대체)

- [ ] **Step 4: 수동 검증**

`hub.html`을 열고 ①탭(하위헌스)에서 "화면 스케일 고정" 체크박스가 처음부터 켜져 있는지 확인. 버튼 라벨이 "↺ 전체 초기화"로 보이는지 확인.

- [ ] **Step 5: Commit**

```bash
git add hub.html
git commit -m "문서: 허브 적용 버튼을 전체 초기화로, 하위헌스 초기 스케일 고정 켜짐으로 변경"
```

---

## Task 5: hub.js — 라이브 동기화(디바운스 setParams) + 프리셋 즉시 전송 + reloadAll lockScale

**Files:**
- Modify: `hub.js:46-65` (마스터 슬라이더 리스너, `reloadAll`, 프리셋 리스너)

**Interfaces:**
- Consumes: Task 1~3에서 각 앱이 리스닝하는 `{ type: 'diffhub-setParams', H_mm, L_mm, lam_cm }` 메시지 형식.
- Produces: 없음.

- [ ] **Step 1: 디바운스 setParams 전송 함수 추가 + 마스터 슬라이더 리스너 교체**

`hub.js:46-48`(기존 3줄)을 아래로 교체:

```javascript
  let paramSyncTimer = null;
  function sendSetParams() {
    const msg = { type: "diffhub-setParams", H_mm: state.H_mm, L_mm: state.L_mm, lam_cm: state.lam_cm };
    [el.metalFrame, el.huygensFrame, el.compareFrame].forEach((frame) => {
      try { frame.contentWindow.postMessage(msg, "*"); } catch (e) { /* 동일 출처가 아니면 무시 */ }
    });
  }
  function scheduleParamSync() {
    if (paramSyncTimer) clearTimeout(paramSyncTimer);
    paramSyncTimer = setTimeout(sendSetParams, 300);
  }
  el.mH.addEventListener("input", function () { state.H_mm = parseFloat(this.value); syncMasterLabels(); scheduleParamSync(); });
  el.mL.addEventListener("input", function () { state.L_mm = parseFloat(this.value); syncMasterLabels(); scheduleParamSync(); });
  el.mLam.addEventListener("input", function () { state.lam_cm = parseFloat(this.value); syncMasterLabels(); scheduleParamSync(); });
```

- [ ] **Step 2: `reloadAll`의 하위헌스 URL에 lockScale=1 추가**

`hub.js:52-54`의 `reloadAll` 본문 중 huygens 줄을 교체:

```javascript
    el.huygensFrame.src = `./huygens/index.html?lambda=${lam / 100}&a=${H / 1000}&z=${L / 1000}&lockScale=1`;
```

- [ ] **Step 3: 프리셋 리스너를 reloadAll 대신 즉시 setParams 전송으로 교체**

`hub.js:58-65`의 프리셋 블록을 교체:

```javascript
  const PRESETS = { preset1Btn: 1, preset2Btn: 4, preset3Btn: 20 };
  Object.keys(PRESETS).forEach((id) => {
    el[id].addEventListener("click", () => {
      state.H_mm = 200; state.L_mm = 300; state.lam_cm = PRESETS[id];
      syncMasterSliders();
      if (paramSyncTimer) clearTimeout(paramSyncTimer);
      sendSetParams();
    });
  });
```

(`el.applyBtn.addEventListener("click", reloadAll);` 줄은 그대로 둔다 — 버튼 라벨만 Task 4에서 바뀌었을 뿐, "현재 마스터 값으로 reloadAll" 동작은 이미 이 한 줄이 수행 중이라 JS 변경 불필요.)

- [ ] **Step 4: 수동 검증 — 라이브 동기화**

`hub.html`을 열고 ③ 나란히 탭에서 마스터 λ 슬라이더를 드래그한다. 기대 결과: 드래그를 멈추고 약 300ms 후 하위헌스 쪽이 먼저 갱신되고, 금속 쪽은 1~2초 후 갱신된다. devtools Network 탭 또는 `el.metalFrame.addEventListener('load', () => console.log('metal reload'))`를 콘솔에 걸어 두면 리로드가 발생하지 않음(로그 없음)을 확인할 수 있다.

- [ ] **Step 5: 수동 검증 — 프리셋 + 상태 보존**

①탭(하위헌스)에서 관측점을 드래그해 임의 위치로 옮긴 뒤, 마스터 프리셋 버튼 3개를 연달아 클릭한다. 기대 결과: λ 값은 프리셋대로 바뀌지만 관측점 드래그 위치 등 파라미터 외 조작 상태는 유지된다(리로드가 없으므로).

- [ ] **Step 6: 수동 검증 — 전체 초기화**

`↺ 전체 초기화` 버튼 클릭 시 iframe 3개가 실제로 리로드되는지(예: ①탭 관측점 드래그 위치가 초기화되는지) 확인.

- [ ] **Step 7: Commit**

```bash
git add hub.js
git commit -m "기능: 허브 마스터 컨트롤을 리로드 대신 postMessage 라이브 동기화로 전환"
```

---

## Task 6: §30 문서 추록 — 라이브 동기화 전환 근거

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-shadow-fill-ratio-and-1to1-view-design.md` (§30.7 다음, 새 `### 30.8` 절 추가)

**Interfaces:**
- Consumes: 없음(문서만).
- Produces: 없음.

- [ ] **Step 1: §30.8 절 추가**

파일 끝(708줄 이후, §30.7 절 다음)에 추가:

```markdown
### 30.8 마스터 컨트롤 라이브 동기화 — 리로드 제거 + lockScale 파라미터

**배경**: §30.5의 [양쪽에 적용]/프리셋은 iframe 3개 전체 `reloadAll()`이라 (1) 리로드
오버헤드로 체감 지연이 크고 (2) 각 앱의 조작 상태(줌, 관측점 드래그, 스케일 고정 등
파라미터 외 상태)를 매번 파괴했다.

**해결**: §30.7에서 도입한 postMessage 채널을 확장해 `{ type: 'diffhub-setParams',
H_mm, L_mm, lam_cm }` 메시지를 추가했다. 세 앱은 각자 기존 슬라이더 input 핸들러가
쓰는 상태 갱신 + 슬라이더/라벨 동기화 + 디바운스 recompute 경로를 그대로 재사용한다
(새 계산 경로 없음 — 슬라이더로 직접 조작한 것과 동일한 코드 경로).

- 마스터 슬라이더 input → 300ms 디바운스 후 setParams 전송(hub.js `scheduleParamSync`).
  금속 앱의 recompute(~1~2초)는 물리 계산 자체의 비용이라 그대로 수용한다 —
  제거 대상은 리로드 오버헤드뿐이다.
- 프리셋 버튼 → 상태 갱신 + 마스터 슬라이더 동기화 + 대기 중인 디바운스를 취소하고
  즉시 setParams 전송(리로드 없음).
- [양쪽에 적용]은 `↺ 전체 초기화`로 이름을 바꿔 기존 `reloadAll()`을 그대로
  유지한다 — 앱이 이상 상태에 빠졌을 때의 수동 탈출구.

**메시지 사양**:
```
{ type: 'diffhub-setParams', H_mm: number, L_mm: number, lam_cm: number }
```
`type`이 정확히 일치하지 않으면 무시한다. 세 앱 모두 전체 `try/catch`로 감싸
처리 실패가 콘솔 에러로 새지 않게 했다.

**lockScale 파라미터**: 하위헌스 앱의 "화면 스케일 고정" 체크박스를 URL로 초기
켜짐 상태로 만들기 위해 `applyUrlParams()`가 `lockScale=1`을 읽어 반환하고,
`init()`이 초기 렌더(첫 `recomputeAll()`) 직후 체크박스를 프로그램적으로 켜서
기존 `change` 핸들러(§ 스케일 고정 스냅샷 로직)를 그대로 재사용한다. 파라미터가
없으면 `false`를 반환하므로 단독 실행 시 기존 동작과 100% 동일하다. 허브의
하위헌스 iframe은 초기 src와 `↺ 전체 초기화`가 만드는 src 모두에 `&lockScale=1`을
붙여, 허브 안에서는 항상 스케일 고정이 기본 켜짐 상태를 유지하게 했다(프리셋으로
λ를 바꿔도 Y축 범위가 고정되어 무늬 퍼짐을 같은 자로 비교할 수 있다).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-02-shadow-fill-ratio-and-1to1-view-design.md
git commit -m "문서: 허브 라이브 파라미터 동기화 전환 근거(§30.8) 추록"
```

---

## Self-Review 메모(작성자 기록)

- **스펙 커버리지**: Task 1(§ Task 1 금속) / Task 2(§ Task 1 하위헌스 + Task 3 lockScale) /
  Task 3(§ Task 1 compare) / Task 4~5(§ Task 2 hub) / Task 6(§30 추록) — 원 요청의
  Task 1/2/3 및 문서 추록 항목을 모두 커버함. Acceptance 5개 항목은 각 Task의
  "수동 검증" 스텝에 1:1로 대응(①③번은 Task 5 Step 4~6, ②번은 Task 4 Step 4,
  ④번은 각 Task의 회귀 확인 스텝, ⑤번은 Task 5 Step 6).
- **플레이스홀더 스캔**: 모든 코드 블록이 실제 삽입 코드이며 "TODO/적절히 처리"류
  표현 없음.
- **타입/이름 일관성**: `diffhub-setParams` 문자열, `H_mm/L_mm/lam_cm` 필드명이
  Task 1/2/3/5/6에서 동일하게 사용됨. `sendSetParams`/`scheduleParamSync` 함수명은
  Task 5 내에서만 쓰이고 다른 Task가 참조하지 않음(경계 확인 완료).
