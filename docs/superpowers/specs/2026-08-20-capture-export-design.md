# §33 캡처 / 내보내기 — 설계

작성 2026-08-20 · 대상 `script.js`(§33) · `capture.html` · `capture.js`

## 1. 목적

논문 그림용으로 **개별 패널을 깨끗한 PNG 한 장씩** 뽑는다. 최종 배치(패널 조합)는
사람이 직접 하므로 프로그램은 한 장씩 저장만 하면 된다.

화면 캡처에서 제거해야 했던 것:

1. 좌상단 진행방향 화살표 + `입사파 진행 →`
2. 스크린 점선 위의 `스크린` 라벨
3. 막대 왼쪽 `H = 150 mm` 치수선
4. 밴드 제목(`① 입사파` 등)과 하단 부가 설명

그리고 스크린 세기 그래프는 화면에서 **누워 있던**(가로축=I) 것을
캡처에서는 **전치**한다 — 가로축 = 스크린 위의 위치 y, 세로축 = I(y)/I₀.

## 2. 구조 — 왜 도구 페이지로 분리했나

캡처 UI를 `index.html` 패널에 넣으면 수업용 화면이 복잡해지고, 화면 코드와 캡처
코드가 얽힌다. 그래서 **UI 없는 훅 + 별도 도구 페이지**로 나눴다.

| 파일 | 역할 | 변경 |
|---|---|---|
| `script.js` | 캡처 렌더러(§33) + `window.__capture` 훅 | 추가만 |
| `index.html`, `style.css` | 수업용 화면 | **0줄** |
| `capture.html`, `capture.js` | 도구 페이지 — UI 전부 여기 | 신규 |

`capture.html`은 **`script.js`를 같은 페이지에서 직접 로드**하고
`window.__capture` 를 그대로 호출한다. iframe이 없으므로 동일 출처 제약이 없고
**더블클릭(`file://`)으로 열어도 동작한다** — 로컬 서버가 필요 없다.

### 2.1 DOM 계약

`script.js`는 조작 패널의 id를 `getElementById`로 하드코딩해 찾는다(35개,
`querySelector`류는 쓰지 않는다). 그래서 `capture.html`은 `index.html`의
`#panel` 마크업을 **그대로 복사해** `#hiddenPanel`에 담고 화면 밖으로만 민다.

```css
#hiddenPanel { position: absolute; left: -99999px; top: 0; width: 340px; }
```

`display:none`이 아니라 화면 밖으로 미는 이유는, 숨긴 요소도 값과 레이아웃을
읽을 수 있어야 하기 때문이다.

파라미터를 바꿀 때는 **숨긴 원본 슬라이더에 값을 넣고 `input` 이벤트를 발생**시켜
기존 바인딩 로직이 처리하게 한다(우회하지 않는다). 단, `L`은 1:1 모드에서
recompute 없이 다시 그리기만 하므로(§20.6) 그 경우 `ready()`를 기다리지 않는다.

`index.html`을 고치면서 id를 바꾸면 `capture.html`이 조용히 깨지므로
`tests/dom-contract.js`가 두 파일의 id 집합을 대조한다(A24).

## 3. 절대 불변 제약

- **물리 계층 함수 무수정** — `besselJ0`/`besselY0`/`hankel0`/`solveComplex`/
  `evalFields`/`screenIntensity`/`findShadowRegion`/`computeShadowProfile`/
  `shadowFillRatioFromSamples`/`computeShadowFillRatio`/`recompute`/`chooseBaseYw`/
  `compute1to1Range`/`unionGridWorld`/`requiredGridH`/`computeBaseAndGrid`/`computeCamera`
- **캡처 경로는 `recompute()`/`scheduleRecompute()`를 호출하지 않는다.** 이미 계산된
  `solver` 격자를 크롭·확대할 뿐이다. 격자보다 큰 출력은 업스케일(정상 동작).
- **렌더러는 읽기 전용.** 상태를 바꾸는 것은 준비 단계 API 넷뿐이다(§6).
- **라이브 렌더 출력은 픽셀 단위로 이전과 동일**해야 한다(§8 회귀 앵커로 검증).

## 4. 설계 결정 (D1~D11)

- **D1. 화면은 그대로, 캡처만 깨끗하게.** `drawOverlay()`/`drawOverlay1to1()`/
  `drawIntensityPlot()`은 수정하지 않는다. 캡처는 **독립 렌더러**를 새로 쓴다.
- **D2. 구도는 캔버스 컨테이너를 픽셀로 고정해 잡는다.** 원안(WYSIWYG — 현재 창
  비율을 따름)은 창 크기에 따라 결과가 달라져 재현이 안 되므로, `capture.html`이
  `#canvasWrap`을 세 프리셋 중 하나로 **고정**하는 방식으로 대체했다(§5).
  출력 픽셀: `W = 해상도 프리셋`, `H = round(W × 밴드 종횡비)`.
- **D3. ①②③ 세 패널은 같은 뷰·같은 위상·같은 진폭**에서 뽑는다. 필드 데이터는
  `solver`에 전부 있으므로 모드 전환이 필요 없다.
- **D4. 캡처에 남기는 것** — 필드 색상 이미지, 장애물, x=0 중심 점선(옵션),
  스크린 위치선(옵션), 얇은 테두리(옵션), ±H/2 점선(옵션, 기본 끔).
  **빼는 것** — 모든 글자, 진행 화살표, H 치수선. 필드 패널 렌더러에는
  `fillText` 호출이 하나도 없다.
- **D5. 장애물 색은 세 패널 모두 `#2a2a30`.** 화면의 ①밴드처럼 반투명 회색으로
  약하게 그리지 않는다(논문 그림 일관성).
- **D6. 배경은 불투명 흰색** — 투명 PNG 금지(편집 사고 방지).
- **D7. 선 두께·폰트는 출력 폭에 비례.** 기준 배율 `s = W / 1000`.
  글자만 따로 `capture.fontScale`(기본 1.5)로 더 키울 수 있고, 선 두께는
  그 영향을 받지 않는다(§9).
- **D8. 그래프 사양** — 가로축 `y`, 범위 `[-base.Yw, +base.Yw]`(줌 무관), 단위 cm.
  여백은 고정 비율이 아니라 글자 실측으로 역산한다(§9).
  세로축 `I(y)/I₀`, 범위 `0 ~ plotYMax(Imax)`. `I=1` 회색 점선. `|y| ≤ H/2` 회색
  음영. 곡선 `#c0392b`, 두께 `2s`. 화면 그래프의 범례와 `I<0.5` 빨간 음영은 넣지
  않는다. 샘플 `M = 400`(캡처 전용, `computeShadowProfile`은 그대로 M=120).
- **D9. 파일명에 물리 파라미터를 박는다.**
  `diff_{kind}_H{H}mm_L{L}mm_lam{λ}cm_ph{위상}_w{W}_{구도}.png`
  예) `diff_total_H150mm_L100mm_lam12cm_ph000_w1200_sq.png`
- **D10. 저장은 `toBlob` → `<a download>`**, 콘솔에 파일명·크기·용량 로그.
- **D11. `window.__capture` 훅을 노출**(도구 페이지·검증 공용, 프로덕션에도 남김).

## 5. 구도 프리셋 (캔버스 컨테이너 픽셀 고정)

`resize()`는 `canvas.parentElement`의 크기에서 밴드를 계산한다.

```
bandW     = cssW − 134     (여백 12+12 + 그래프 96 + 간격 14)
bandH1to1 = cssH − 20      (여백 10+10)
```

그래서 `#canvasWrap`을 픽셀로 못박으면 밴드 크기가 창과 무관하게 고정된다.
`flex`나 `vw/vh`를 쓰지 않고, 창이 작으면 `#stageScroll`이 스크롤될 뿐이다.
테두리는 `border` 대신 `box-shadow`로 그린다(컨테이너 크기에 영향을 주지 않도록).

| 키 | 구도 | 컨테이너 | 밴드 목표 | 밴드 실측 |
|---|---|---|---|---|
| `sq` | 정사각 | 934 × 820 | 800 × 800 | **800 × 800** |
| `wide` | 와이드 | 1334 × 470 | 1200 × 450 | **1200 × 450** |
| `sqtall` | 여유크롭 | 934 × 900 | 800 × 880 | **800 × 880** |

세 프리셋 모두 목표와 **정확히 일치**한다(Δ 0). 창 크기 1500×950 / 1100×700 /
1800×1100 에서 측정해도 값이 변하지 않는다(A25).

프리셋 전환은 컨테이너 크기를 바꾸고 `window`에 `resize` 이벤트를 보내
기존 `resize()`가 돌게 하는 것으로 처리한다(`resize()`는 수정하지 않았다).
크기 변화가 없으면 `resize()`의 기존 가드가 조기 반환하므로, 그때는
`expectRecompute()`를 부르지 않는다.

## 6. 준비 단계 API와 `ready()`

상태를 바꿀 수 있는 것은 넷뿐이고, 나머지(`dataURL`/`blobSize`/`meta`/`anisotropy`/
`gridChecksum`/`layout`/`params`)는 읽기 전용이다.

| API | 하는 일 |
|---|---|
| `pause()` | 재생 중이면 기존 일시정지 버튼을 눌러 라벨까지 일관되게 갱신 |
| `setPhaseDeg(deg)` | 위상 슬라이더에 값을 넣고 `input` 이벤트를 발생 |
| `setViewMode(mode)` | 3분할 ↔ 1:1 전환(gridH 요구치가 바뀌면 recompute 예약) |
| `expectRecompute()` | 외부 파라미터 변경 직전 기준점 기록(상태 변경 없음) |
| `ready(timeoutMs)` | 예약된 recompute 완료까지 대기 |

`ready()`는 **`recompute()`에 훅을 걸지 않는다**(§3 무수정 제약). `recompute()`가
매번 새 `Float32Array`를 할당해 `solver`에 대입한다는 성질을 이용해,
`solver.incRe` **참조가 교체되고** `solver.gridH`가 기대값과 같아질 때까지 폴링한
뒤 rAF 2회를 기다린다. 재계산이 예약되지 않았으면 즉시 resolve 한다.
백그라운드 탭에서 rAF가 멈출 수 있으므로 rAF 대기에 120ms `setTimeout` 폴백을
두고, 기본 10초에 타임아웃 reject 한다(도구 페이지는 90초를 쓴다 — 1:1 모드는
격자가 3배라 recompute가 30초 가까이 걸린다).

## 7. 등방 가드

지시서 초안은 `state.viewMode !== '1to1' || view.isotropic === false` 로 경고를
띄우려 했으나, `view.isotropic`은 **3분할 base 기준으로만** 계산되는 값이라
1:1 모드에서도 `false`로 남아 헛경고가 난다. 그래서 판정을 **캡처 이미지의 실측
픽셀 축척비**로 바꿨다.

```
aniso = |pxPerMm_y / pxPerMm_x − 1|      →  aniso > 0.005 이면 경고
```

`view.isotropic` / `view.scaleRatio`는 `captureMeta`에 참고값으로만 기록한다.
경고는 콘솔(`[캡처 경고] 비등방 뷰 — 세로:가로 축척 ×N.N …`)과 `capture.html`
상단 붉은 배너 양쪽에 표시하되, **캡처를 막지는 않는다.**

`captureMeta.scaleRatio`는 `pxPerMm_x / pxPerMm_y` 로 정의해 `view.scaleRatio`와
같은 규약을 쓴다 — 줌 100%·3분할에서는 수식이 같아 두 값이 일치하므로 교차
검증에 쓸 수 있다(실측 둘 다 5.77).

## 8. 수용 기준 결과 (2026-08-20 실측)

`node tests/capture-acceptance.js` — 28항목 중 통과 27, 실패 0, 참고 1.
`node tests/dom-contract.js`(A24) · `node tests/file-protocol-check.js`(A23) 통과.
회귀 앵커(`node tests/regression-anchor.js`)는 3분할·1:1 두 뷰 모두
**다른 픽셀 0개**(maxDelta 0).

기준 자체를 고친 항목은 셋이다.

- **A7** — 지시서의 잉크 검출기(`|g−b| ≤ 18`)는 1:1 모드 제목색 `#10193a`(남색)를
  놓친다. `|r−g| ≤ 18 && r ≤ 140` 만 남긴 보완 검출기로 판정했다(필드 빨강은
  `r > 140`, 필드 파랑은 `|r−g|`가 커서 여전히 제외된다).
- **A11** — 음영 띠의 **원시** 픽셀 폭 비율은 0.40이 아니다(실측 0.624). 그래프의
  가로 범위 `base.Yw`가 `1.15 × (H/2 + 0.05)` 로 H에 의존해 같이 줄어들기
  때문이다(14.37 → 9.20 cm). y 범위로 보정하면 **0.400** 으로 기대값과 맞는다.
- **A13** — 픽셀 검사 대신 코드 확인으로 대체(`FONT` 블록과 `fontScale` 반영식 확인).
- **A27** — "눈금 숫자의 실제 렌더 높이 11px 이상"은 기본값 ×1.5·640px에서 **9px**이라
  문자 그대로는 성립하지 않는다. 숫자 글리프의 높이(cap height)는 폰트 크기의 약
  0.72배이기 때문이다(설정 폰트는 13px). 판정은 **설정 폰트 px**(하한 `minTick=11`)
  기준으로 했고, 실측 높이도 함께 보고한다. 실측 기준으로 11px을 원하면
  `FONT.tick`을 16으로 올리면 된다(×1.5·640px에서 15px → 실측 약 11px).

## 9. 그래프 글자 크기와 여백

논문에 넣으면 축 숫자가 작아 보인다는 문제가 있어, 글자 크기를 따로 키울 수 있게 했다.

### 9.1 기본값은 한 곳에서만

`renderPlotCapture` 상단의 `FONT` 블록이 유일한 출처다.

```js
const FONT = { tick: 14, axis: 16, minTick: 11, minAxis: 12 };
const fs = (base, min) => Math.max(min, Math.round(base * (cw / 1000) * capture.fontScale));
```

옛 하드코딩(12/13, 하한 9/10)은 폐기했다.

### 9.2 여백은 글자 실측으로 역산

고정 비율(`0.13·cw`, `0.80·ch`)로 잡으면 글자를 키웠을 때 숫자가 잘린다.
그래서 눈금 문자열을 **먼저 만들고** `measureText`로 재서 박스를 역산한다.

```
box.l = pad + y축이름높이 + gap + 최장y눈금폭 + 눈금선길이
box.b = ch − pad − x축이름높이 − gap − x눈금높이 − 눈금선길이
box.t = pad + 최상단y눈금높이/2          (상단 숫자 잘림 방지)
box.r = cw − pad − 최우측x눈금폭/2       (우측 숫자 잘림 방지)
pad = gap = round(6 × (cw/1000) × fontScale)
```

글자 높이는 `actualBoundingBoxAscent/Descent`를 쓰고, 미지원 환경에서는
`fontPx × 1.2`로 폴백한다.

박스가 뒤집히거나 플롯 영역이 캔버스의 40% 미만이면 **콘솔 경고만** 남기고 그대로
그린다 — 배율을 자동으로 낮추면 사용자가 무엇이 잘못됐는지 알 수 없기 때문이다.

### 9.3 조작과 저장

`capture.html`의 배율 슬라이더(0.8~3.0, 0.1 단위)가 `capture.fontScale`을 바꾸고,
패널의 작은 그래프 미리보기가 즉시 갱신된다. 값은 `localStorage`의
`capture.fontScale` 키에 저장해 다음에 열 때 유지한다(`file://`에서 저장소가
막혀 있어도 동작하도록 try/catch로 감쌌다). **파일명에는 배율을 넣지 않는다**(D9 유지).

배율별 실측(640px 출력):

| 배율 | 눈금 px | 축 이름 px | 숫자 글리프 실측 | 플롯 영역 |
|---|---|---|---|---|
| ×1.0 | 11 (하한 적용) | 12 | 8 px | 83 % |
| ×1.5 (기본) | 13 | 15 | 9 px | 78 % |
| ×2.0 | 18 | 20 | — | 72 % |
| ×2.5 | 22 | 25 | 16 px | 66 % |

## 10. 남은 제약

- 1:1 모드는 격자 세로 해상도가 3배(gridH 289 → 900)라 카메라 전환·파라미터 변경
  시 recompute가 **30초 가까이** 걸린다. 도구 페이지는 진행 오버레이로 안내한다.
- `capture.html`은 `script.js`를 직접 로드하므로 `index.html`과 **같은 폴더**에
  있어야 한다. 조작 패널 마크업이 두 파일에 중복되는 대가로 서버가 필요 없어졌다
  — 어긋남은 `tests/dom-contract.js`가 잡는다.
- 캡처에 쓰이는 격자 열 수는 어느 프리셋에서도 450열이다(gridWorld가 ZOOM_MIN까지
  미리 커버하므로 카메라가 그 절반을 본다). 1200px·1920px 출력은 업스케일이다.
- `dist/` 재빌드(javascript-obfuscator)는 이번 작업 범위 밖.

## 11. 그래프 축 이름 한/영 전환 (§34)

### 11.1 문자열은 한 테이블에서만

축 이름은 `script.js`의 `PLOT_LABELS`(§33.3 순수 헬퍼 구역, `formatTick` 바로 아래)
한 곳에서만 정한다. 키는 **`xName` · `yName` 두 개뿐**이다.

| lang | xName | yName |
|---|---|---|
| `ko` (기본) | 스크린 위의 위치 y | 스크린 세기 I(y) / I₀ |
| `en` | Position on screen y | I(y) / I₀ |

`captureLang(v)`는 `'en'`만 `'en'`으로 보고 나머지는 **예외 없이 조용히 `'ko'`**로
떨어뜨린다. `plotLabels(lang)`이 테이블을 읽는 유일한 통로다.

### 11.2 단위는 언어와 무관하게 뒤에 붙인다

x축은 단위가 붙으므로 테이블에는 **단위 없는 본문만** 담고, 조립은
`renderPlotCapture()`에서 한다.

```js
const LB = plotLabels(capture.lang);
const xName = LB.xName + " (" + capture.unit + ")";   // "… y (cm)" | "… y (mm)"
const yName = LB.yName;
```

`capture.unit`(`'cm' | 'mm'`)은 두 언어 공통이다. 눈금 숫자·포맷·단위 표기는
언어에 따라 달라지지 않는다.

### 11.3 무엇이 안 바뀌나

- **라이브 화면은 한국어 그대로**다. `drawIntensityPlot` · `drawOverlay` ·
  `drawOverlay1to1`의 한글 문자열은 손대지 않았다 — 언어 전환은 캡처 이미지와
  패널 미리보기에만 나타난다. `capture.html`이 이 점을 한 줄로 안내한다.
- **필드 캡처(`renderFieldCapture`)는 글자가 0개**라 언어와 무관하다.
- 언어 전환은 `recompute()`를 부르지 않는다. `state`·`view`·`solver`·`layout`을
  전혀 건드리지 않으므로 §3.3의 읽기 전용 규약이 그대로 유지된다(측정 16 ms).
- `lang='ko'` 캡처는 이 변경 전후로 dataURL이 **문자열 완전 동일**하다(plot·inc·sc·total).

### 11.4 파일명은 plot·en일 때만 `_en`

`captureFileName(kind, W, H_mm, L_mm, lam_cm, phaseDeg, viewPreset, lang)` — `lang`은
기존 호출부 하위 호환을 위해 **맨 뒤에** 붙인 선택 인자다.

```
diff_plot_…_w1200_sq.png       ko (기존과 동일)
diff_plot_…_w1200_sq_en.png    en
diff_total_…_w1200_sq.png      필드 캡처는 lang과 무관 — 접미사 없음
```

필드 캡처에 언어 접미사를 안 붙이는 이유는 텍스트가 없어 구분이 무의미하고, `ko`에
접미사를 안 붙이는 이유는 기존 파일명(그리고 그것을 검사하는 `selfCheck()` 단언)을
그대로 살리기 위해서다.

### 11.5 조작과 저장

`capture.html`의 "라벨 언어" 체크박스(`#capLangEn`)가 `capture.lang`을 바꾸고,
값은 `localStorage`의 `capture.lang` 키에 저장된다(`file://`에서 저장소가 막혀도
부팅되도록 `fontScale`과 같은 형태로 try/catch). 재계산이 없으므로 `busy()`
오버레이는 띄우지 않는다. `captureMeta.lang`과 `__capture.labels(lang)`으로
검증 코드가 현재 언어를 읽는다.

### 11.6 영문에서 여백이 달라지는 것은 정상

`box.l`은 y축 이름 높이의 실측값으로 역산하므로 언어에 따라 몇 px 달라진다.
640px 출력 기준 실측:

| 배율 | lang | 눈금 px | 축 이름 px | 플롯 영역 | boxWarn |
|---|---|---|---|---|---|
| ×0.8 | ko | 11 | 12 | 84.2 % | false |
| ×0.8 | en | 11 | 12 | 84.5 % | false |
| ×1.5 | ko | 13 | 15 | 78.5 % | false |
| ×1.5 | en | 13 | 15 | 79.2 % | false |
| ×3.0 | ko | 27 | 31 | 60.2 % | false |
| ×3.0 | en | 27 | 31 | 61.2 % | false |

차이는 어느 배율에서도 1 %p 안쪽이다(×1.5에서 `box.l` 49 → 47 px).

## 12. 스크린 위치선 강조 (§37)

### 12.1 왜 굵기가 아니라 색을 먼저 손댔나

논문 그림(3×2 패널)에 붙이면 스크린 위치선이 필드 위에서 묻힌다. 원인은 굵기가 아니라
**색상 충돌**이다 — 기존 선 `#c0392b`(빨강)를 필드의 **빨간 마루 위**에 그리니 굵게만
해서는 떨어져 보이지 않고, 인쇄 축소를 거치면 더 사라진다.

그래서 강조 단계에는 **흰색 헤일로**(선보다 굵은 흰 선을 아래에 먼저 깔기)를 넣었다.
배경이 빨강이든 파랑이든 흰 테두리가 선을 배경에서 떼어놓는다. 헤일로는 본선과 **같은
파선 패턴**으로 깔아 파선의 틈은 비워 둔다(틈이 흰 실선으로 메워지지 않는다).

### 12.2 프리셋 테이블 — `SCREEN_LINE_PRESETS`

`script.js`의 §33.3 순수 헬퍼 구역, `capturePixelSize` 바로 위 한 곳에서만 정한다.
값은 모두 `s = cw / 1000` 배율을 곱하기 **전** 기준이다.

| 단계 | UI 이름 | color | width | dash | halo |
|---|---|---|---|---|---|
| `normal` (기본) | 기본 | `#c0392b` | 1.2 | `[5, 4]` | 0 |
| `strong` | 진하게 | `#b02a1a` | 2.2 | `[7, 5]` | 2.0 |
| `max` | 아주 진하게 | `#8e1b10` | 3.2 | `null`(실선) | 2.6 |

`screenLinePreset(key)`가 테이블을 읽는 유일한 통로이고, **모르는 값은 예외 없이 조용히
`normal`**로 떨어진다(`capture.screenLineEmph = 'zz'`여도 기본 그림이 나온다).
`normal`은 `halo: 0`이라 헤일로 분기를 건너뛰고 color·width·dash가 현행과 같아,
캡처 dataURL이 변경 전과 **문자열 완전 동일**하다.

### 12.3 무엇이 안 바뀌나

- **필드 캡처(`renderFieldCapture`)의 스크린선에만** 적용된다. 라이브 화면의
  `drawIntensityPlot` · `drawOverlay` · `drawOverlay1to1`(“스크린” 점선과 글자)은
  손대지 않았다 — 단계를 바꿔도 라이브 캔버스 dataURL이 완전 동일하다.
- 같은 캡처 안의 다른 오버레이(`centerLine`, `halfHLines`, 장애물 원, `frame`)는
  현재 코드 그대로다.
- `index.html` · `style.css`는 0줄 변경. 물리 엔진 함수 7개(`besselJ0` · `besselY0` ·
  `hankel0` · `solveComplex` · `evalFields` · `screenIntensity` · `recompute`)도
  SHA-256 동일.
- 단계 변경은 `recompute()`를 부르지 않는다. `state` · `view` · `solver` · `layout`을
  전혀 건드리지 않아 §3.3의 읽기 전용 규약이 유지된다(측정 0.1 ms).
- **"스크린 위치선" 체크가 꺼져 있으면 단계와 무관하게 선이 아예 안 그려진다** —
  세 단계의 dataURL이 서로 완전히 같다.

### 12.4 파일명은 바꾸지 않는다

강조 단계는 물리 조건이 아니라 표시 스타일이므로 `captureFileName`을 손대지 않았다
(§34의 `_en`과 달리 **같은 데이터의 같은 그림**이다). 추적은 `captureMeta.screenLineEmph`
한 필드로만 한다.

### 12.5 조작과 저장

`capture.html`의 "스크린 위치선" 세그먼트 버튼(`#screenEmphButtons`)이
`capture.screenLineEmph`를 바꾸고, 값은 `localStorage`의 `capture.screenLineEmph`
키에 저장된다(`file://`에서 저장소가 막혀도 부팅되도록 `lang`과 같은 형태로 try/catch).
재계산이 없으므로 `busy()` 오버레이는 띄우지 않는다.

미리보기 이미지(`#plotPreview`)는 **그래프 캡처**라서 이 옵션의 영향을 받지 않는다 —
효과는 ①②③ 저장 버튼으로 확인해야 하고, 패널의 안내 문구가 이를 밝힌다.

### 12.6 가시성 실측 (2026-08-29)

H=150 mm · L=100 mm · λ=12 cm · 위상 0° · 1:1 관찰 · 정사각 · 프리셋 s(1200 px).
`screenLine=false` 캡처와의 **RGB 절대차 합**(스크린선 x=784 px의 ±20 px 띠 안).

| 패널 | normal | strong | max | strong/normal | max/normal |
|---|---|---|---|---|---|
| inc | 317,482 | 671,634 | 2,495,796 | ×2.12 | ×7.86 |
| sc | 367,070 | 833,656 | 2,558,556 | ×2.27 | ×6.97 |
| total | 402,617 | 856,123 | 2,605,484 | ×2.13 | ×6.47 |

세 패널 모두 단조 증가하고 기준(strong ≥ ×2.0, max ≥ ×3.0)을 넘는다. `max`가 ×6~8로
크게 뛰는 것은 파선이 **실선**으로 바뀌면서 잉크 길이가 약 2배가 되기 때문이다.

선 + 헤일로의 가로 footprint는 `max`에서 **8 px**(W=1200의 0.67 %)로, 화면 폭의 0.7 %
상한 안이다. `(3.2 + 2.6) × 1.2 = 6.96 px`에 안티에일리어싱 양쪽 끝이 더해진 값이다.

비교용 PNG 15장(`inc`/`sc`/`total` × 3단계, λ=4·20 cm의 `strong` 3장씩)은
`captures-sample/screenline/`에 있고, 같은 폴더의 `preview.html`이 스크린선 둘레만
잘라 나란히 보여준다.

### 12.7 검증

`tests/screenline-baseline.js`(변경 전 dataURL 기준선 저장) → `tests/screenline-check.js`
(E1~E13). 기존 스위트 `capture-acceptance.js` · `dom-contract.js` ·
`file-protocol-check.js`도 전부 통과한다(E14).
