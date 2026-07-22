# 하위헌스(huygens) 앱 — 논문용 이미지 캡처 전용 버전 설계

> 참고 문서: `huygens/지시서_논문용_캡처버전.md` (원 지시서). 이 스펙은 그 지시서를
> 실제 코드(`huygens/index.html`, `style.css`, `script.js`)와 대조 검증하고, 지시서에
> 없던 세부 구현 방식(오프스크린 렌더 좌표계, 배경 투명 처리, 애니메이션 경합,
> 파일명 라운드트립)을 확정한 버전이다.

## 1. 배경과 목표

기존 `huygens/` 앱(Cornu 나선 단일 회절 시뮬레이터)은 화면 관찰용으로 만들어져
어두운 배경·작은 라벨 폰트·캔버스 전체 스크린샷만 가능한 구조다. 논문에 그림별로
따로 삽입하려면:

- 패널①(메인 뷰)·②(위상자 방향)·③(Cornu 나선)을 **개별 이미지**로,
- **인쇄용 흰 배경**에 **대비가 확보된 색**으로,
- **축소 삽입돼도 읽히는 큰 폰트**로,
- λ/a/z를 **정밀 숫자 입력**으로 맞춘 상태에서

내보낼 수 있어야 한다. 기존 화면용 앱은 그대로 두고, 별도 복제본으로 만든다.

**절대 변경 금지(물리 엔진)**: `fresnelCS`, `kFactor`, `totalAmplitude`,
`fresnelIntensity`, `computePhasorPath`, `computeScale`, `computeFreeHalfHeight`,
`niceRulerStep`. 이 8개 함수는 `paper.js`에 바이트 단위로 그대로 복사한다.
이번 작업은 전부 렌더링/UI/저장 계층이다.

## 2. 파일 구조

- 신규 생성: `huygens/paper.html`, `huygens/paper.css`, `huygens/paper.js`.
- 기존 `huygens/index.html`, `style.css`, `script.js`는 **무수정**. 작업 완료 후
  `git diff`로 무변경 확인.
- `paper.html`은 `index.html`을 복제해 `<link>`/`<script>` 경로만
  `paper.css`/`paper.js`로 교체하고, 캡처 버튼 그룹·폰트 배율 슬라이더·λ/a/z
  직접 입력창을 컨트롤 패널에 추가한다.
- `paper.js`는 `script.js` 전체를 복제한 뒤 수정한다.
- `script.js` 맨 끝의 hub 연동 메시지 리스너
  (`window.addEventListener('message', ...)` 블록, hub.html이 iframe으로 이 앱을
  띄우고 파라미터를 동기화하는 코드)는 **`paper.js`에서 삭제**한다. 논문 캡처
  버전은 독립 페이지로만 쓴다.
- 새 UI 요소의 `id`는 기존과 충돌하지 않게 `paper-` 접두사를 쓴다.

## 3. 캡처 시스템

### 3.1 버튼 구성

컨트롤 패널 최상단에 "이미지 저장(PNG)" 버튼 그룹을 추가한다:

- "①저장" / "②저장" / "③저장" — 각 패널 개별 저장.
- "모두 저장" — 3장을 순서대로 연속 다운로드.
- 배율 프리셋: 저용량(1×) / 표준(2×) / 고해상도(3×, 학회지 인쇄 기본) / 초고해상도(4×).
- 포맷: PNG / JPEG 선택, JPEG일 때만 품질 슬라이더(0.5~1.0) 노출.

### 3.2 오프스크린 렌더 좌표계 — `ctx.scale()` 방식으로 확정

화면 캔버스는 `resizeCanvas()`에서 `canvas.width = rect.width`(CSS 픽셀 1:1)로
설정되고, `layoutMain`/`layoutArrows`/`drawPhasor`는 지금 `canvas.width`/
`canvas.height`를 직접 읽어 레이아웃을 계산한다.

**채택 방식**: 오프스크린 캔버스의 `width`/`height` **속성**(물리 픽셀)은
`원본 논리 크기 × scale`로 설정하고, 그리기 직전 `ctx.scale(scale, scale)`을
건다. 이때 레이아웃 함수들이 여전히 `canvas.width`(이제 물리 스케일 값)를
직접 읽으면 좌표가 이중으로 커지므로, **레이아웃 함수는 캔버스 속성이 아니라
별도로 넘겨받는 논리 크기 인자를 쓰도록 리팩터링**한다:

```js
// 예시 시그니처 변경
function layoutMain(canvas, logicalW, logicalH) {
  const w = logicalW, h = logicalH;
  // ... 이하 동일
}
```

- 화면 렌더 호출: `layoutMain(el.mainCanvas, el.mainCanvas.width, el.mainCanvas.height)`
  → scale=1과 동등, 현재 동작과 완전히 동일.
- 저장 렌더 호출: 화면 캔버스의 **현재 논리 크기**를 그대로 넘기고, 오프스크린
  캔버스의 물리 `width`/`height` 속성만 `scale`배로 키운 뒤 `ctx.scale(scale, scale)`.
- `drawPhasorArrows`, `drawPhasor` 도 동일한 패턴으로 통일한다(현재 이 두 함수도
  내부에서 `canvas.width`/`canvas.height`를 직접 읽고 있음).
- **"width를 scale배 하고 좌표 계산도 별도로 scale배" 하는 방식은 채택하지
  않는다** — 두 방식이 섞이면 라벨이 이중으로 커지거나 안 커지는 문제가 생긴다.

이 리팩터링은 물리 계산과 무관한 순수 렌더 좌표 코드이므로 §1의 엔진 보존
규칙에 저촉되지 않는다.

### 3.3 배경 투명 문제

캔버스는 CSS 배경이 흰색이어도 그리기 전까지 캔버스 자체(비트맵)는 투명이다.
`clearRect`만 하면 저장된 PNG는 투명 배경으로, JPEG는 투명이 검정으로
채워져 나온다.

**해결**: `paper.js`의 `drawMainView`/`drawPhasorArrows`/`drawPhasor` 세 함수
모두 `clearRect` 직후 다음을 추가한다:

```js
ctx.fillStyle = THEME.canvasBg; // '#ffffff' 또는 '#fafafa'
ctx.fillRect(0, 0, w, h);
```

화면용 렌더와 저장용 렌더가 완전히 같은 함수를 타므로, 저장 전용 배경
채우기 분기를 별도로 만들 필요가 없다. 화면 표시 시에도 캔버스 자체가
명시적으로 흰 배경을 갖게 되어 더 안전해진다.

### 3.4 wavePhase 애니메이션 경합

`tick()`이 매 프레임 `drawMainView()`를 호출하며 `wavePhase`(입사 평면파 선의
위상)를 계속 증가시킨다. 저장 시점에 화면 캔버스를 직접 건드리지는 않지만,
`wavePhase`를 저장 렌더에도 그대로 쓰면 저장할 때마다 파면 선 위치가 달라져
같은 파라미터로 배율만 바꿔 여러 장 저장해도 그림이 서로 달라진다.

**결정**: `drawMainView`가 `wavePhase`를 인자로 받도록 하고, 저장 렌더 경로에서는
항상 `0`을 넘긴다. 화면 애니메이션의 전역 `wavePhase`는 그대로 `tick()`에서
계속 흐르며 영향받지 않는다.

```js
function drawMainView(canvas, logicalW, logicalH, wavePhaseValue) { /* ... */ }
// 화면: drawMainView(el.mainCanvas, ..., wavePhase)
// 저장: drawMainView(offscreenCanvas, ..., 0)
```

### 3.5 저장 함수 구조

공통 함수 하나로 구현한다:

```js
function savePanel(panelName, scale, format, quality) { /* ... */ }
```

- `panelName`에 따라 어떤 논리 크기·어떤 draw 함수를 쓸지 매핑.
- 오프스크린 캔버스 생성 → 물리 크기 설정 → `ctx.scale(scale, scale)` →
  해당 draw 함수를 논리 크기 + (필요 시 `wavePhase=0`)로 호출 →
  `canvas.toBlob(cb, mime, quality)` → `URL.createObjectURL` → `<a download>`.
- "모두 저장"은 `savePanel`을 패널 3개에 대해 순차 호출(브라우저 다운로드
  다이얼로그가 겹치지 않도록 약간의 지연을 두고 순차 실행).

### 3.6 파일명

`formatLength()` 출력(`500.000 nm` 등)은 공백·소수점 표기 때문에 파일명에
그대로 쓰기 부적절하다. 별도 슬러그 함수를 만들되, **`formatLength()`에서
파생**시켜 두 표기가 서로 다른 반올림 규칙을 갖지 않게 한다:

```js
function slugLength(meters) {
  return formatLength(meters)
    .replace(/\s+/g, '')       // 공백 제거
    .replace(/µ/g, 'u')        // µm -> um (파일시스템/URL 안전)
    .replace(/\.?0+(?=[a-z])/i, ''); // 불필요한 후행 0 제거 (500.000nm -> 500nm)
}
```

파일명 형식: `panel{N}_{역할}_lambda{slug}_a{slug}_z{slug}_{scale}x.{ext}`
예: `panel1_main_lambda500nm_a1mm_z1m_3x.png`,
`panel2_arrows_lambda500nm_a1mm_z1m_3x.png`,
`panel3_cornu_lambda500nm_a1mm_z1m_3x.png`.

## 4. 흰 배경 테마

- `paper.css`: `body` 배경 `#0f1320`→`#ffffff`, 캔버스 배경 `#0a0e1c`→`#ffffff`(또는
  `#fafafa`), 패널/컨트롤 배경(`#161b2e`)·텍스트 색(`#e8ebf5`) 등을 흰 배경에서
  대비가 충분한 어두운 계열로 교체.
- `paper.js` 상단에 테마 상수 객체를 추가하고, 그리기 함수들의 하드코딩 색을
  이 참조로 치환한다(물리 엔진 함수는 제외):

  ```js
  const THEME = {
    canvasBg: '#ffffff',
    text: '#1a1a1a',
    textDim: '#3a4058',
    axis: 'rgba(0,0,0,0.3)',
    dashed: 'rgba(0,0,0,0.35)',
    waveLine: 'rgba(40,90,200,0.6)',   // 입사 평면파 선
    fillWarn: 'rgba(230,120,20,0.18)', // 밝기 곡선 채움
    marker: '#d1204a',                 // 관측점 마커 등 기존 강조색 계열 유지
  };
  ```

- 치환 대상(지시서 기준): 텍스트 `#aab2cf`/`#7a90c8`/`#7a8ab0`/`#e8ebf5`,
  ruler 눈금선 `rgba(255,255,255,0.15)`, 그림자 경계 점선
  `rgba(255,255,255,0.25)`, 밝기 곡선 채움 `rgba(255,212,121,0.12)`, 입사
  평면파 선 `rgba(120,170,255,0.55)`.
- 색 띠(`yToColor`, 파랑→빨강 hsl 매핑)는 로직 유지, 명도만 `55%`→`45%`로
  낮춰 흰 배경에서 중간 hue(노랑 계열) 대비를 확보한다.

## 5. 폰트 확대 (이중 방식)

지시서 원안대로 두 계층을 함께 적용한다:

- **기본 크기 상향**: `ctx.font`에 하드코딩된 px 값을 일괄 상향한다.
  - ruler 눈금 라벨: `10px` → `16px`
  - 장애물/평면파/②범위 등 캔버스 내 라벨: `11px` → `16px`
  - `|합|`, `상대 세기 I/I₀` 결과 수치: `12px` → `18px bold`
  - 컨트롤 패널 readout·`#scale-table` (CSS): 현재의 1.3~1.5배
- **전역 폰트 배율 슬라이더** (0.8×~2.0×, 기본 1.0×) 추가. 헬퍼
  `fontPx(base) = base * fontScale`을 만들어 모든 `ctx.font` 호출이 이 헬퍼를
  통과하도록 한다.
- 폰트 확대로 라벨이 겹치거나 캔버스 밖으로 나갈 수 있으므로, ruler 라벨
  위치·장애물 라벨 위치 등의 좌표 여백을 함께 조정하고 Playwright
  스크린샷으로 겹침 여부를 확인한다.
- **DPR(레티나) 대응은 이번 작업 범위 밖**이다: 화면 미리보기는 현행 그대로
  CSS 픽셀 1:1 유지, 고해상도는 저장본에만 적용한다.
- **문서화해 둘 관계**: `fontScale`(0.8~2.0×)은 "화면에 보이는 상대 크기"만
  조절하고, 저장 배율(1~4×, §3)은 "해상도"만 올린다. 저장 시 `ctx.scale`과
  `fontScale`이 함께 곱해져 실제로 그려지는 폰트 px가 커지는 것은 **의도된
  동작**이다(고배율로 저장할수록 라벨이 더 선명하고 크게 나옴).

## 6. λ/a/z 직접 입력창

- 각 파라미터(λ, a, z)에 `<input type="number">` + 단위 드롭다운
  (`nm/µm/mm/cm/m`)을 기존 로그 슬라이더 옆/아래에 병행 배치한다.
- 기존 `formatLength`, `valueToSlider`, `sliderToValue`, `RANGES`를 재사용한다.
- **이벤트 타이밍**: 기존 슬라이더와 동일하게 `input` 이벤트에서 처리하되,
  `parseFloat` 결과가 유효한 숫자일 때만 `state.x` 갱신 → SI 변환 →
  슬라이더 위치 동기화(`valueToSlider`로 값 계산 후 해당 슬라이더 엘리먼트의
  `.value`에 직접 대입, 즉 `setSlidersFromState()`에 준하는 처리) →
  `updateReadouts()` → `scheduleRecompute(120)`(기존 디바운스 재사용, 새
  디바운스 로직을 따로 만들지 않는다). 파싱이 안 되는 중간 입력 상태
  (`"5."`, 빈 문자열 등)는 무시하고 `state`도, 입력창 텍스트도 건드리지 않는다.
- **라운드트립 방지**: 입력창은 사용자가 타이핑한 텍스트를 그대로 유지한다.
  `change`(blur/enter) 시점에 값이 `RANGES` 범위를 벗어난 경우에만 clamp하고
  입력창에 실제 적용값을 되돌려 표시한다. `formatLength`로 매 keystroke마다
  값을 다시 포맷해 입력창에 되써넣지 않는다(그러면 "500 입력 → 499.9 표시"
  같은 드리프트가 생김).
- 슬라이더를 움직이면 입력창 숫자도 갱신되도록 양방향 동기화한다
  (`onParamChange` 안에서 입력 필드 값도 함께 갱신).

## 7. 구현 스타일 / 제약

- 기존 코드 컨벤션 유지: `'use strict'`, 바닐라 JS, 전역 `state`/`cache` 패턴.
- CSS는 기존 클래스 구조를 최대한 재사용하고, 라이트 테마 오버라이드는
  `paper.css` 안에서 명확히 구획을 나눠 작성.
- Subagent-Driven 실행 패턴으로 진행하고, §3(캡처)·§4(흰 배경)·§5(폰트)·
  §6(입력창)을 개별 커밋 단위로 나눠 작업한다.

## 8. 완료 기준 (Acceptance Criteria — Playwright 검증)

1. `paper.html`을 열었을 때 배경이 흰색이고 모든 라벨·곡선이 흰 배경에서
   선명하게 보인다.
2. ①·②·③ 각 패널이 개별 이미지로 저장되고, "모두 저장"으로 3장이 한 번에
   내려받아진다. 1×/2×/3×/4× 및 PNG/JPEG(품질) 선택이 실제 다운로드에
   반영된다. 파일명에 패널 번호·파라미터·배율이 포함되고, 3× 이상에서
   라벨이 또렷하다. 저장된 PNG/JPEG 배경이 투명/검정이 아니라 흰색이다.
   같은 파라미터로 배율만 바꿔 여러 번 저장해도 입사 평면파 선 위치가
   동일하다(wavePhase=0 고정 확인).
3. 폰트 배율 슬라이더(및 상향된 기본 폰트)로 캔버스 내 숫자가 커지고,
   겹침 없이 표시된다.
4. λ·a·z 숫자 입력창 + 단위로 값을 직접 입력하면 즉시 반영되고, 슬라이더와
   양방향 동기화되며, 타이핑 중간 상태에서 값이 튀지 않는다.
5. 기존 `index.html`/`style.css`/`script.js`는 변경되지 않았음을 `git diff`로
   확인한다.
6. 물리 엔진 8개 함수(`fresnelCS` 등, §1)가 원본과 텍스트 단위로 동일함을
   확인한다.
7. `paper.js`에 hub 연동 메시지 리스너 코드가 없음을 확인한다.
