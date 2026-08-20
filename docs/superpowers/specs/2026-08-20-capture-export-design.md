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

`capture.html`은 `index.html`을 **같은 출처 iframe**으로 띄우고
`iframe.contentWindow.__capture` 를 호출한다. 이미지는 자식이 그리고, blob 저장은
부모가 한다. 파라미터(H·L·λ)는 기존 `postMessage 'diffhub-setParams'` 핸들러를
재사용한다.

동일 출처 정책 때문에 **`file://` 에서는 동작하지 않는다** — 로컬 서버가 필요하다
(`npx serve` 등). 페이지 상단에 이 안내를 상시 표시한다. `index.html` 자체는
여전히 더블클릭으로 열린다.

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
- **D2. 구도는 부모가 픽셀로 고정한다.** 원안(WYSIWYG — 현재 창 비율을 따름)은
  창 크기에 따라 결과가 달라져 재현이 안 되므로, `capture.html`이 iframe 크기를
  세 프리셋 중 하나로 **고정**하는 방식으로 대체했다.
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
- **D7. 선 두께·폰트는 출력 폭에 비례.** 기준 배율 `s = W / 1000`,
  폰트는 `Math.max(9, …)` 하한(640px에서도 축 숫자가 읽혀야 함).
- **D8. 그래프 사양** — 가로축 `y`, 범위 `[-base.Yw, +base.Yw]`(줌 무관), 단위 cm.
  세로축 `I(y)/I₀`, 범위 `0 ~ plotYMax(Imax)`. `I=1` 회색 점선. `|y| ≤ H/2` 회색
  음영. 곡선 `#c0392b`, 두께 `2s`. 화면 그래프의 범례와 `I<0.5` 빨간 음영은 넣지
  않는다. 샘플 `M = 400`(캡처 전용, `computeShadowProfile`은 그대로 M=120).
- **D9. 파일명에 물리 파라미터를 박는다.**
  `diff_{kind}_H{H}mm_L{L}mm_lam{λ}cm_ph{위상}_w{W}_{구도}.png`
  예) `diff_total_H150mm_L100mm_lam12cm_ph000_w1200_sq.png`
- **D10. 저장은 `toBlob` → `<a download>`**, 콘솔에 파일명·크기·용량 로그.
- **D11. `window.__capture` 훅을 노출**(도구 페이지·검증 공용, 프로덕션에도 남김).

## 5. 구도 프리셋 (iframe 픽셀 고정)

밴드 크기는 `bandW = iframe_W − 475`, `bandH1to1 = iframe_H − 20` 로 결정된다
(오른쪽 패널 340 + 여백 12·12 + 그래프 96 + 간격 14 = 474, 나머지 1px은 반올림).

| 키 | 구도 | iframe | 밴드 목표 | 밴드 실측 |
|---|---|---|---|---|
| `sq` | 정사각 | 1275 × 820 | 800 × 800 | **801 × 800** |
| `wide` | 와이드 | 1675 × 470 | 1200 × 450 | **1201 × 450** |
| `sqtall` | 여유크롭 | 1275 × 900 | 800 × 880 | **801 × 880** |

가로가 목표보다 1px 큰 것은 위 상수 합(474 vs 475) 차이다. 허용 오차 ±2px 안이라
프리셋 숫자는 지시서 그대로 두었다. 정확히 800·1200을 원하면 iframe 폭을 1px씩
줄이면 된다(1274 / 1674 / 1274).

미리보기는 CSS `transform: scale()` 로 축소만 한다 — transform은 iframe 내부
레이아웃 픽셀에 영향을 주지 않으므로(실측으로 확인) 캡처 크기는 축소와 무관하다.

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
두고, 기본 10초에 타임아웃 reject 한다(도구 페이지는 60초를 쓴다 — 1:1 모드는
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

`node tests/capture-acceptance.js` — 23항목 중 통과 22, 실패 0, 참고 1.
회귀 앵커(`node tests/regression-anchor.js`)는 3분할·1:1 두 뷰 모두
**다른 픽셀 0개**(maxDelta 0).

기준 자체를 고친 항목은 셋이다.

- **A7** — 지시서의 잉크 검출기(`|g−b| ≤ 18`)는 1:1 모드 제목색 `#10193a`(남색)를
  놓친다. `|r−g| ≤ 18 && r ≤ 140` 만 남긴 보완 검출기로 판정했다(필드 빨강은
  `r > 140`, 필드 파랑은 `|r−g|`가 커서 여전히 제외된다).
- **A11** — 음영 띠의 **원시** 픽셀 폭 비율은 0.40이 아니다(실측 0.624). 그래프의
  가로 범위 `base.Yw`가 `1.15 × (H/2 + 0.05)` 로 H에 의존해 같이 줄어들기
  때문이다(14.37 → 9.20 cm). y 범위로 보정하면 **0.400** 으로 기대값과 맞는다.
- **A13** — 픽셀 검사 대신 코드 확인으로 대체(폰트 하한 `Math.max(9, …)` 존재 확인).

## 9. 남은 제약

- 1:1 모드는 격자 세로 해상도가 3배(gridH 289 → 899)라 카메라 전환·파라미터 변경
  시 recompute가 **30초 가까이** 걸린다. 도구 페이지는 진행 오버레이로 안내한다.
- 캡처에 쓰이는 격자 열 수는 어느 프리셋에서도 450열이다(gridWorld가 ZOOM_MIN까지
  미리 커버하므로 카메라가 그 절반을 본다). 1200px·1920px 출력은 업스케일이다.
- `dist/` 재빌드(javascript-obfuscator)는 이번 작업 범위 밖.
