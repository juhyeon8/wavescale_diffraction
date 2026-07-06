# 금속 앱 ctx.arc 음수 반지름 버그 수정 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hub에서 탭 전환을 반복할 때 금속 앱(`script.js`)이 `Uncaught IndexSizeError: The radius provided is negative`를 던지는 버그를 없앤다.

**Architecture:** `script.js`의 뷰 계층(`resize()`/`drawOverlay*()`) 3곳만 수정한다 — (1) `resize()` 맨 앞에 그리기 불가능한 과도기 크기를 통째로 건너뛰는 조기 return, (2) 파생 치수(`bandW`/`bandH1to1`) 하한 클램프, (3) `ctx.arc()` 호출부 반지름 방어. 물리 계산(`recompute()` 내부, 베셀/한켈, MoM)은 무수정.

**Tech Stack:** 순수 Vanilla JS(빌드 도구 없음), 배포용 난독화는 `javascript-obfuscator`(devDependency).

## Global Constraints

- 이 리포에는 자동화 테스트 러너가 없다(`package.json`의 `test` 스크립트는 placeholder). 검증은 이 프로젝트의 기존 관행을 따른다: 콘솔 `selfCheck()` 단언(script.js:959) + 브라우저 수동 조작(더블클릭으로 `file://`로 열기, 콘솔 관찰). 아래 각 태스크의 "검증" 스텝은 이 관행에 맞춘 수동 절차이며, 자동 unit test가 아니다.
- 물리 함수·`recompute()` 로직은 무수정 — 뷰 계층(`resize`/`drawOverlay*`)만 손댄다.
- try-catch로 예외를 감싸 증상만 숨기는 방식은 금지.
- 근거 문서: `docs/superpowers/specs/2026-07-02-shadow-fill-ratio-and-1to1-view-design.md` §32.
- dist 재빌드 시 `--string-array false` 유지(§29에서 실측으로 끈 옵션 — 다시 켜면 recompute 3~6배 지연 재발).

---

## File Structure

- Modify: `script.js` — `resize()`(370번째 줄 부근), `computeBaseAndGrid()`(337번째 줄), `drawOverlay()`(582번째 줄), `drawOverlay1to1()`(685번째 줄).
- Modify (생성물, 손으로 편집 안 함): `dist/script.js` — obfuscator로 원본 `script.js`에서 재생성.
- 새 파일 없음.

---

### Task 1: `resize()` 조기 return 가드 추가

**Files:**
- Modify: `script.js:370-394` (함수 `resize`)

**Interfaces:**
- 이 함수는 다른 태스크의 코드에 영향받지 않는다. 이후 태스크(2, 3)가 이 함수 안에서 계산되는 `layout.bandW`/`layout.bandH1to1`을 소비한다.

- [ ] **Step 1: 현재 코드 확인**

`script.js:370-394`의 현재 내용:

```js
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    // 크기 변화가 없으면 recompute()를 건너뛴다 — 허브가 탭 전환마다 무조건
    // resize 이벤트를 재전달하므로, 가드가 없으면 실제 폭/높이가 그대로여도
    // 매번 수 초짜리 recompute가 다시 도는 문제가 있었다(§30 추록).
    if (rect.width === layout.cssW && rect.height === layout.cssH) return;
    layout.cssW = rect.width; layout.cssH = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.cssW * dpr);
    canvas.height = Math.round(layout.cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    layout.bandX = layout.marginL;
    layout.bandW = layout.cssW - layout.marginL - layout.marginR - layout.plotW - layout.gap;
    const totalH = layout.cssH - layout.marginT - layout.marginB - 2 * layout.gap;
    layout.bandH = totalH / 3;
    for (let i = 0; i < 3; i++)
      layout.bandY[i] = layout.marginT + i * (layout.bandH + layout.gap);

    offscreen.width = layout.gridW;
    offscreen.height = Math.max(40, Math.round(layout.gridW * layout.bandH / layout.bandW));

    recompute();
    drawFrame();
  }
```

- [ ] **Step 2: 조기 return 추가**

`rect`를 읽은 직후, 기존 "크기 변화 없음" 가드보다 앞에 삽입한다:

```js
  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    // 그리기 불가능한 과도기 크기(탭 전환 중간 등)는 통째로 건너뛴다 — 이번 크기는
    // layout.cssW/cssH에 반영조차 하지 않으므로, 다음 정상 크기의 resize에서
    // 처음부터 다시 계산된다(§32). 임계값은 실제 물리적 하한(bandW: cssW-134,
    // bandH1to1: cssH-20)보다 여유를 둔 안전판.
    if (rect.width < 200 || rect.height < 150) return;
    // 크기 변화가 없으면 recompute()를 건너뛴다 — 허브가 탭 전환마다 무조건
    // resize 이벤트를 재전달하므로, 가드가 없으면 실제 폭/높이가 그대로여도
    // 매번 수 초짜리 recompute가 다시 도는 문제가 있었다(§30 추록).
    if (rect.width === layout.cssW && rect.height === layout.cssH) return;
    layout.cssW = rect.width; layout.cssH = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.cssW * dpr);
    canvas.height = Math.round(layout.cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    layout.bandX = layout.marginL;
    layout.bandW = layout.cssW - layout.marginL - layout.marginR - layout.plotW - layout.gap;
    const totalH = layout.cssH - layout.marginT - layout.marginB - 2 * layout.gap;
    layout.bandH = totalH / 3;
    for (let i = 0; i < 3; i++)
      layout.bandY[i] = layout.marginT + i * (layout.bandH + layout.gap);

    offscreen.width = layout.gridW;
    offscreen.height = Math.max(40, Math.round(layout.gridW * layout.bandH / layout.bandW));

    recompute();
    drawFrame();
  }
```

- [ ] **Step 3: 문법 확인**

Run: `node --check script.js`
Expected: 출력 없음(에러 없이 종료).

- [ ] **Step 4: 커밋**

```bash
git add script.js
git commit -m "$(cat <<'EOF'
버그 수정(1/3): resize() 그리기 불가능한 과도기 크기 조기 return 추가

hub 탭 전환 중 컨테이너 폭/높이가 순간적으로 200×150px 미만이 되면
layout.bandW/bandH1to1가 음수가 되어 이후 ctx.arc에서 IndexSizeError가
났다(§32). resize() 맨 앞에서 이런 크기를 통째로 건너뛰어, 다음 정상
크기의 resize에서 처음부터 다시 계산되게 한다.
EOF
)"
```

---

### Task 2: `bandW` / `bandH1to1` 하한 클램프 (2중 방어)

**Files:**
- Modify: `script.js:337` (함수 `computeBaseAndGrid`)
- Modify: `script.js:383` (함수 `resize`, Task 1에서 수정한 코드 내부)

**Interfaces:**
- Task 1의 `resize()` 코드를 이어서 수정한다. Task 3(arc 호출부)은 이 클램프와 무관하게 독립적으로 방어하므로 순서를 바꿔도 무방하다.

- [ ] **Step 1: `bandH1to1` 클램프**

`script.js:337`의 현재 코드:

```js
    layout.bandH1to1 = layout.cssH - layout.marginT - layout.marginB;
```

다음으로 교체:

```js
    layout.bandH1to1 = Math.max(1, layout.cssH - layout.marginT - layout.marginB);
```

- [ ] **Step 2: `bandW` 클램프**

Task 1에서 수정한 `resize()` 안의 다음 줄(원래 `script.js:383`):

```js
    layout.bandW = layout.cssW - layout.marginL - layout.marginR - layout.plotW - layout.gap;
```

다음으로 교체:

```js
    layout.bandW = Math.max(1, layout.cssW - layout.marginL - layout.marginR - layout.plotW - layout.gap);
```

- [ ] **Step 3: 문법 확인**

Run: `node --check script.js`
Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add script.js
git commit -m "$(cat <<'EOF'
버그 수정(2/3): bandW/bandH1to1 파생 치수 하한 클램프(2중 방어)

Task 1의 조기 return이 걸러내지 못하는 경우를 대비한 원천 클램프.
bandW/bandH1to1가 음수가 되면 sPx/rPx가 음수로 전파돼 ctx.arc에서
IndexSizeError가 났다(§32). 두 값 모두 Math.max(1, ...)로 하한을 둔다.
EOF
)"
```

---

### Task 3: `ctx.arc()` 호출부 반지름 방어

**Files:**
- Modify: `script.js:582` (함수 `drawOverlay`)
- Modify: `script.js:685` (함수 `drawOverlay1to1`)

**Interfaces:**
- Task 1/2와 독립적 — 이 두 클램프가 어떤 이유로든 뚫려도(예: 향후 다른 코드 경로에서 rPx가 음수가 되는 경우) 최후 방어선이 된다.

- [ ] **Step 1: `drawOverlay`의 arc 호출 수정**

`script.js:582`의 현재 코드:

```js
      ctx.beginPath(); ctx.arc(p.x, p.y, rPx, 0, TWO_PI);
```

(이 줄은 `drawOverlay` 함수, 579번째 줄 `for (let n = 0; n < N; n++) {` 도선 루프 안에 있다.) 다음으로 교체:

```js
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, rPx), 0, TWO_PI);
```

- [ ] **Step 2: `drawOverlay1to1`의 arc 호출 수정**

`script.js:685`의 현재 코드(`drawOverlay1to1` 함수, 682번째 줄 도선 루프 안):

```js
      ctx.beginPath(); ctx.arc(p.x, p.y, rPx, 0, TWO_PI);
```

다음으로 교체:

```js
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0, rPx), 0, TWO_PI);
```

- [ ] **Step 3: 문법 확인**

Run: `node --check script.js`
Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add script.js
git commit -m "$(cat <<'EOF'
버그 수정(3/3): ctx.arc 호출부 반지름 Math.max(0, r) 방어

drawOverlay/drawOverlay1to1의 도선 렌더링 arc 호출부에 최후 방어선을
추가한다. Task 1/2의 클램프가 원인을 없애지만, rPx가 어떤 경로로든
음수가 되더라도 이 지점에서 IndexSizeError가 나지 않도록 한다(§32).
EOF
)"
```

---

### Task 4: 단독 실행(`index.html`) 회귀 확인

**Files:**
- 코드 변경 없음 — 수동 검증만.

**Interfaces:** 없음(검증 태스크).

- [ ] **Step 1: `index.html`을 더블클릭으로 열기**

파일 탐색기에서 `C:\dev\fourth-task\index.html`을 더블클릭(서버 불필요).

- [ ] **Step 2: 콘솔에서 selfCheck 통과 확인**

브라우저 개발자 도구(F12) → Console 탭. 로드 시 자동 실행되는 `selfCheck()`(script.js:959, 1076번째 줄에서 호출) 출력 확인.
Expected: `[검증] ...` 로그들과 함께 `console.assert` 실패(빨간 메시지) **0건**.

- [ ] **Step 3: 3분할/1:1 모드, 모드 전환, 줌 수동 확인**

- 기본 진입(3분할) 화면이 정상 렌더링되는지 확인.
- 1:1 관찰 모드 버튼 클릭 → 정상 렌더링, 콘솔 에러 없음.
- 솔리드/도선 모드 전환 버튼 클릭 → 정상 렌더링, 콘솔 에러 없음.
- 줌 슬라이더(또는 관련 컨트롤)를 최소~최대로 조작 → 정상 렌더링, 콘솔 에러 없음.

Expected: 위 모든 조작에서 콘솔에 `Uncaught` 에러 없음, 화면 깨짐 없음.

- [ ] **Step 4: 문제 없으면 다음 태스크로**

이 태스크는 회귀 확인용이라 커밋할 코드 변경이 없다. 문제가 발견되면 Task 1~3으로 돌아가 원인을 찾는다.

---

### Task 5: hub 통합 시나리오 수동 검증

**Files:**
- 코드 변경 없음 — 수동 검증만.

**Interfaces:** 없음(검증 태스크).

- [ ] **Step 1: `hub.html`을 더블클릭으로 열기**

`C:\dev\fourth-task\hub.html`을 더블클릭. 개발자 도구 Console 탭을 열어둔다.

- [ ] **Step 2: 탭 20회 이상 왕복 전환 + 창 크기 드래그**

① 하위헌스 → ② 금속 막대 → ③ 나란히 보기 → ④ 정량 비교 순서로 20회 이상 빠르게 왕복 클릭한 뒤, 브라우저 창 크기를 여러 번 드래그로 늘렸다 줄인다.
Expected: 콘솔에 `Uncaught IndexSizeError` 등 예외 0건.

- [ ] **Step 3: 극단 크기(<400px)로 줄였다 되돌리기**

브라우저 창을 폭 400px 미만으로 줄인 뒤 원래 크기로 되돌린다.
Expected: 예외 없음, 되돌린 후 화면(탭/마스터 컨트롤/iframe)이 정상 복구됨.

- [ ] **Step 4: 애니메이션 재생 중 임계값(<200px) 시나리오**

② 금속 막대 탭에서 재생(▶, `state.playing=true` 기본값)이 진행 중인 상태로, 브라우저 창을 폭 200px **미만**으로 줄였다가 다시 정상 크기로 되돌린다.
Expected: 창이 좁아진 동안에도(조기 return이 걸려 `layout`이 갱신되지 않는 동안, `loop()`가 계속 `drawFrame()`을 호출) 콘솔 예외 없음, 되돌린 뒤 화면 정상 복구.

- [ ] **Step 5: 문제 없으면 다음 태스크로**

이 태스크는 검증용이라 커밋할 코드 변경이 없다. 문제가 발견되면 Task 1~3으로 돌아간다.

---

### Task 6: `dist/script.js` 재빌드 + 배포본 검증

**Files:**
- Modify(생성물): `dist/script.js`

**Interfaces:** 없음(빌드 + 검증 태스크). 이 태스크는 Task 1~3의 `script.js` 변경이 모두 커밋된 뒤에 실행한다.

- [ ] **Step 1: 재빌드**

프로젝트 루트(`C:\dev\fourth-task`)에서:

```bash
npx javascript-obfuscator script.js --output dist/script.js --compact true --identifier-names-generator hexadecimal --string-array false --control-flow-flattening false --dead-code-injection false --self-defending false
```

Expected: `dist/script.js`가 갱신됨(파일 수정 시각 변경). 다른 `dist/` 파일(`hub.js`, `compare.js`, `huygens/script.js`, HTML/CSS)은 이번 변경과 무관하므로 재빌드하지 않는다.

- [ ] **Step 2: string-array 꺼짐 확인**

```bash
node -e "const s=require('fs').readFileSync('dist/script.js','utf8'); console.log('string-array 흔적 없음:', !/const _0x[0-9a-f]+ ?= ?\[/.test(s) && !s.includes('atob'));"
```

Expected: `string-array 흔적 없음: true`

- [ ] **Step 3: 배포본에서 recompute 속도 확인(§29 회귀 여부)**

`dist/hub.html` 또는 `dist/index.html`을 더블클릭으로 열고, 개발자 도구 Console에서 `[성능] recompute() ... ms` 로그(script.js:254 유래) 확인.
Expected: N=40, gridW=600 기준 recompute 1회가 수 초 이내(§29에서 확인한 정상 수준, ~5초대) — 14초 이상이면 string-array가 다시 켜졌거나 다른 회귀이므로 Step 1부터 재확인.

- [ ] **Step 4: 배포본에서 acceptance 시나리오 1·4 재확인**

`dist/hub.html`을 더블클릭으로 열고 Task 5의 Step 2(탭 20회 왕복)와 Step 4(애니메이션 재생 중 <200px)를 배포본 기준으로 반복.
Expected: 콘솔 예외 0건.

- [ ] **Step 5: 사용자 확인 후 커밋·푸시**

이 프로젝트의 CLAUDE.md 규칙상 git 커밋·푸시는 사용자 확인 후 진행한다. Step 1~4가 모두 통과하면 사용자에게 결과를 보고하고, 커밋 여부·푸시 여부를 확인받는다. 승인 시:

```bash
git add dist/script.js
git commit -m "$(cat <<'EOF'
빌드: 금속 앱 arc 음수 반지름 수정 반영 dist 재빌드

script.js의 resize()/drawOverlay* 수정(§32)을 배포본에 반영. 난독화
옵션은 §29 그대로(hexadecimal identifiers + compact, string-array/
control-flow-flattening/dead-code-injection/self-defending 끔).
EOF
)"
```

푸시는 사용자가 명시적으로 요청할 때만 실행한다.

---

## Self-Review 메모

- **스펙 커버리지**: §32의 수정 방침 1~3(조기 return, 클램프, arc 방어)은 Task 1~3, acceptance 1~5는 Task 4~6에서 각각 다룬다. 빠진 항목 없음.
- **플레이스홀더 스캔**: "TBD"/"나중에" 등 없음. 모든 코드 스텝에 실제 diff 포함.
- **일관성**: `layout.bandW`/`layout.bandH1to1`/`rPx` 등 식별자는 태스크 전체에서 동일하게 사용. 임계값(200/150)도 Task 1과 Task 5에서 일치.
