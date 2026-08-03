# Claude Code 지시 프롬프트 — paper.js 추가 삭제 (2차)

> 대상: `huygens/paper.js` (논문 캡처 전용 복제본). **기존 `script.js`는 절대 건드리지 말 것.**
> 물리 엔진 8개 함수(`fresnelCS`, `kFactor`, `totalAmplitude`, `fresnelIntensity`,
> `computePhasorPath`, `computeScale`, `computeFreeHalfHeight`, `niceRulerStep`)는 무수정.

## 삭제할 2가지 요소

### (1) 그림①(`drawMainView`) — "· 범위 제한" 문구 삭제

입사 평면파 라벨에서, 파장 선 간격이 화면상 제한됐을 때만 붙는 `· 범위 제한`
문구를 제거한다. 현재 코드:

```js
ctx.fillText('입사 평면파 (선 간격 = 파장 λ' + (waveSpacingClamped ? ' · 범위 제한' : '') + ')', 8, 14);
```

를 다음으로 **교체**한다(조건부 문구를 없애고 고정 라벨로):

```js
ctx.fillText('입사 평면파 (선 간격 = 파장 λ)', 8, 14);
```

- `waveSpacingClamped` 변수 자체(줄 위쪽 `const waveSpacingClamped = ...`)는
  다른 곳에서 안 쓰이면 그대로 둬도 무방하다(선 간격 clamp 로직에는 영향 없음).
  굳이 지우지 말 것 — clamp 계산(`waveSpacing`)은 화면 렌더에 필요하다.

### (2) 그림③(`drawPhasor`) — 회색 기준 코르누 나선 삭제

장애물이 없을 때의 전체 나선(회색 곡선)을 그리는 부분을 제거한다.
"실제 합산 경로(색 곡선)"와 "최종 벡터합 화살표"는 **유지**한다.

삭제할 블록 — `drawPhasor` 안, 주석 `// 기준 나선 (회색)` 이하 `stroke()`까지:

```js
// 기준 나선 (회색)
ctx.beginPath();
reference.path.forEach((p, i) => {
  const [px, py] = toPx(p.re, p.im);
  if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
});
ctx.strokeStyle = 'rgba(200,205,225,0.35)';
ctx.lineWidth = 1.5;
ctx.stroke();
```

- 위 **블록 전체를 삭제**한다.
- **주의 — `reference` 변수는 지우지 말 것.** `reference`는 뒤쪽에서
  상대 세기 계산에 쓰인다:
  `const refMag = Math.sqrt(reference.total.re ** 2 + reference.total.im ** 2);`
  (`상대 세기 I/I₀` 값 계산). 회색 나선 **그리기**만 없애고, `reference`를
  구하는 `computePhasorPath(...)` 호출과 `reference.total` 사용은 그대로 둔다.
- 삭제 후 그림③에는: 색 곡선(실제 합산 경로) + 장애물 가장자리 마커 +
  최종 벡터합 화살표 + `|합|`/`상대 세기` 텍스트만 남는다.

### (선택) 패널 설명 문구 정리

그림③ 하단 안내문(`index.html`/`paper.html`)에 "회색 곡선은 장애물이 없을 때의
전체 나선"이라는 설명이 있다. 회색 나선을 지웠으므로 이 문장도 어색해진다.
`paper.html`에서 해당 `panel-note`를 다음처럼 회색 곡선 언급을 빼고 수정할지
결정해 줘(논문 캡처 시 이 설명 텍스트가 그림에 포함되는지에 따라):

- 수정 예: "색 곡선은 실제 합산 경로, 검은 화살표는 최종 벡터합입니다."

기본은 **수정하지 않음**(캡처 대상은 캔버스뿐이라 무관). 다만 설명까지 캡처에
넣는다면 위처럼 정리할 것.

## 검증 (Playwright)

1. `paper.html`을 열어 그림①의 입사 평면파 라벨이 파장 선 간격이 좁아지는
   조건(작은 λ)에서도 "· 범위 제한" 없이 "입사 평면파 (선 간격 = 파장 λ)"로만
   표시되는지 확인.
2. 그림③에 회색 기준 나선이 더 이상 그려지지 않고, 색 곡선·마커·최종 화살표·
   `상대 세기 I/I₀` 텍스트는 정상 표시되는지 확인.
3. `상대 세기 I/I₀` 값이 삭제 전과 **동일하게** 계산되는지 확인
   (`reference` 변수 보존 여부 검증 — 값이 NaN이거나 바뀌면 실수로 `reference`를
   건드린 것).
4. `git diff`로 `script.js`가 무변경인지 확인.
