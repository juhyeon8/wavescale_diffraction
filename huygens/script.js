'use strict';

/* =========================================================================
   상태 (State)
   ========================================================================= */
const state = {
  lambda: 500e-9,   // 파장 (m)
  a: 1e-3,           // 장애물 폭 (m)
  z: 1.0,             // 장애물-스크린 거리 (m)
  N: 200,             // 위상자 분할 개수 (코르누 나선용)
  M: 20,              // 표시할 위상자 화살표 개수
  fixedRange: 2e-3,   // 패널②의 표시 반경 (m), λ/a/z와 무관하게 직접 조절
  obstacleOn: true,
  scaleLocked: false,      // true이면 Y축 범위를 lockedHalfHeight로 고정
  lockedHalfHeight: null,  // 잠금 시 사용할 반높이 (m); null이면 체크 시 스냅샷
  Y: 0,               // 현재 선택된 스크린(관측) 지점 (m) — 위상 공식의 기준점
  focusY: 0,          // 패널②가 지금 확대해서 보여주는 절대 좌표 위치 (메인 뷰 왼쪽 영역 호버로 결정)
  dragging: false,
  animPlaying: false,
  animFrame: 0,
};

// 캐시된 계산 결과 (파라미터가 바뀔 때만 재계산)
const cache = {
  scale: null,
  curve: null,
};

let wavePhase = 0;

/* =========================================================================
   로그 슬라이더 헬퍼
   ========================================================================= */
function sliderToValue(pos, minVal, maxVal) {
  const minLog = Math.log10(minVal), maxLog = Math.log10(maxVal);
  return Math.pow(10, minLog + (maxLog - minLog) * pos / 1000);
}
function valueToSlider(value, minVal, maxVal) {
  const minLog = Math.log10(minVal), maxLog = Math.log10(maxVal);
  return Math.round(1000 * (Math.log10(value) - minLog) / (maxLog - minLog));
}

const RANGES = {
  lambda: { min: 100e-9, max: 10 },
  a: { min: 10e-6, max: 10 },
  z: { min: 1e-2, max: 100 },
  fixedRange: { min: 10e-6, max: 10 },
  lockedHalfHeight: { min: 10e-6, max: 100 },
};

function formatLength(meters) {
  const abs = Math.abs(meters);
  if (abs >= 1) return meters.toFixed(abs >= 10 ? 1 : 3) + ' m';
  if (abs >= 1e-3) return (meters * 1e3).toFixed(abs * 1e3 >= 10 ? 1 : 3) + ' mm';
  if (abs >= 1e-6) return (meters * 1e6).toFixed(abs * 1e6 >= 10 ? 1 : 3) + ' µm';
  return (meters * 1e9).toFixed(1) + ' nm';
}

/* =========================================================================
   물리: 프레넬 회절 적분
   진폭(Y) ∝ ∫ exp[i π (y-Y)² / (λ z)] dy   (장애물 영역 제외)

   무차원 변수 v = (y-Y) * sqrt(2/(λz)) 로 치환하면 위 적분은 표준
   프레넬 적분 C(v) = ∫₀^v cos(πt²/2)dt, S(v) = ∫₀^v sin(πt²/2)dt 로 표현된다.
   적분 구간을 잘라 수치합(리만 합)으로 근사하면 절단 경계 근처에서 피적분
   함수가 샘플 간격보다 훨씬 빠르게 진동해 에일리어싱(가짜 잡음)이 생기므로,
   C, S는 잘 알려진 유리함수 근사식(Abramowitz & Stegun 7.3.27)으로 직접
   계산한다 — 적분 구간이나 분할 수에 무관하게 항상 안정적으로 정확하다.

   주의: C(v), S(v)는 v→±∞에서 ±0.5로 수렴하지만 그 수렴 속도가 매우 느리다
   (진동 폭이 ~1/(πv)로만 감소). 예를 들어 v=7에서도 진폭이 ~4.5%나 남아있어,
   "무한히 열린 영역"의 끝점을 fresnelCS(±V_MAX)로 근사하면 정규화에 수~10%
   계통 오차가 생긴다. 따라서 절단되지 않은(장애물이 없는 쪽으로 무한히 열린)
   끝점에는 정확한 해석적 극한값 ±0.5를 직접 사용한다. V_MAX는 오직
   "위상자 다이어그램을 어디까지 그릴지"를 정하는 시각화 파라미터일 뿐,
   물리량 계산(세기)에는 전혀 사용되지 않는다.
   ========================================================================= */
const V_MAX = 10; // 위상자 다이어그램을 그릴 때 사용하는 시각적 절단값

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

// 장애물 유무에 따른 전체 위상자 벡터합(복소 진폭). 무한히 열린 쪽 끝점은
// 정확한 해석적 극한(±0.5)을 사용하므로 V_MAX와 무관하게 항상 정확하다.
function totalAmplitude(Y, lambda, a, zDist, obstacleOn) {
  if (!obstacleOn) {
    return { re: 1, im: 1 }; // (0.5 - (-0.5)) 양쪽 모두
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

// 장애물 없는 평면파의 기준 세기 (정규화용). 항상 1²+1²=2.
const REF_INTENSITY = 2;

// 누적 위상자 경로 (위상자 다이어그램 그리기용). 끝점 기준은 totalAmplitude와
// 동일하게 정확한 해석적 극한(±0.5)을 쓰므로, 마지막 점은 항상 실제 합과 일치한다.
function computePhasorPath(Y, lambda, a, zDist, N, obstacleOn) {
  const k = kFactor(lambda, zDist);

  if (!obstacleOn) {
    const path = [{ y: Y - V_MAX / k, re: 0, im: 0 }];
    for (let i = 1; i <= N; i++) {
      const v = -V_MAX + (2 * V_MAX) * i / N;
      const [C, S] = fresnelCS(v);
      path.push({ y: Y + v / k, re: C + 0.5, im: S + 0.5 });
    }
    return { path, n1: path.length - 1, total: path[path.length - 1] };
  }

  const vLow = (-a / 2 - Y) * k;
  const vHigh = (a / 2 - Y) * k;
  const n1 = Math.max(1, Math.round(N / 2));
  const n2 = Math.max(1, N - n1);

  const path = [{ y: Y - V_MAX / k, re: 0, im: 0 }];
  for (let i = 1; i <= n1; i++) {
    const v = -V_MAX + (vLow - (-V_MAX)) * i / n1;
    const [C, S] = fresnelCS(v);
    path.push({ y: Y + v / k, re: C + 0.5, im: S + 0.5 });
  }
  const arc1End = path[path.length - 1];
  const [Ch, Sh] = fresnelCS(vHigh);
  for (let i = 1; i <= n2; i++) {
    const v = vHigh + (V_MAX - vHigh) * i / n2;
    const [C, S] = fresnelCS(v);
    path.push({ y: Y + v / k, re: arc1End.re + (C - Ch), im: arc1End.im + (S - Sh) });
  }
  return { path, n1, total: path[path.length - 1] };
}

/* =========================================================================
   스케일 계산 (자동 리스케일)
   ========================================================================= */
function computeFreeHalfHeight(lambda, a, zDist) {
  return Math.max(a * 0.75, Math.sqrt(lambda * zDist) * 6);
}
function computeScale(lambda, a, zDist) {
  const fresnel = Math.sqrt(lambda * zDist);
  const fresnelNumber = (a * a) / (lambda * zDist);
  const halfHeight = (state.scaleLocked && state.lockedHalfHeight != null)
    ? state.lockedHalfHeight
    : computeFreeHalfHeight(lambda, a, zDist);
  return { fresnel, halfHeight, fresnelNumber };
}

function niceRulerStep(halfHeight) {
  const raw = halfHeight / 3;
  const exp = Math.floor(Math.log10(raw));
  const base = raw / Math.pow(10, exp);
  let niceBase;
  if (base < 1.5) niceBase = 1;
  else if (base < 3.5) niceBase = 2;
  else if (base < 7.5) niceBase = 5;
  else niceBase = 10;
  return niceBase * Math.pow(10, exp);
}

/* =========================================================================
   색상 매핑: y 위치 -> 색
   ========================================================================= */
function yToColor(y, domain) {
  const t = Math.max(0, Math.min(1, (y + domain) / (2 * domain)));
  const hue = 240 - 240 * t; // 파란(아래) -> 빨간(위)
  return `hsl(${hue}, 85%, 55%)`;
}

/* =========================================================================
   곡선 재계산 (파라미터 변경 시에만)
   ========================================================================= */
function recomputeAll() {
  const { lambda, a, z, obstacleOn } = state;
  const scale = computeScale(lambda, a, z);
  cache.scale = scale;

  // 잠금 모드에서는 고정 창이 프레넬 스케일보다 훨씬 클 수 있으므로
  // 무늬 해상도를 유지하기 위해 샘플 수를 늘린다 (상한 4001)
  const numPoints = state.scaleLocked
    ? Math.min(4001, Math.max(241, Math.ceil(scale.halfHeight / scale.fresnel * 40)))
    : 241;
  const ys = new Float64Array(numPoints);
  const intens = new Float64Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    const Y = -scale.halfHeight + (2 * scale.halfHeight) * i / (numPoints - 1);
    ys[i] = Y;
    intens[i] = fresnelIntensity(Y, lambda, a, z, obstacleOn) / REF_INTENSITY;
  }
  cache.curve = { ys, intens, maxI: Math.max(...intens) };

  updateScaleTable();
}

let recomputeTimer = null;
function scheduleRecompute(delay) {
  if (recomputeTimer) clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => {
    recomputeAll();
    drawAll();
  }, delay);
}

/* =========================================================================
   DOM 참조
   ========================================================================= */
const el = {
  lambdaSlider: document.getElementById('lambda-slider'),
  aSlider: document.getElementById('a-slider'),
  zSlider: document.getElementById('z-slider'),
  nSlider: document.getElementById('n-slider'),
  mSlider: document.getElementById('m-slider'),
  rangeSlider: document.getElementById('range-slider'),
  lambdaReadout: document.getElementById('lambda-readout'),
  aReadout: document.getElementById('a-readout'),
  zReadout: document.getElementById('z-readout'),
  nReadout: document.getElementById('n-readout'),
  mReadout: document.getElementById('m-readout'),
  rangeReadout: document.getElementById('range-readout'),
  obstacleToggle: document.getElementById('obstacle-toggle'),
  scaleLockToggle: document.getElementById('scale-lock-toggle'),
  scaleLockSection: document.getElementById('scale-lock-section'),
  lockedHeightSlider: document.getElementById('locked-height-slider'),
  lockedHeightReadout: document.getElementById('locked-height-readout'),
  animateBtn: document.getElementById('animate-btn'),
  scaleTable: document.getElementById('scale-table'),
  mainCanvas: document.getElementById('mainCanvas'),
  arrowsCanvas: document.getElementById('arrowsCanvas'),
  phasorCanvas: document.getElementById('phasorCanvas'),
  arrowsNote: document.getElementById('arrows-note'),
};

function updateReadouts() {
  el.lambdaReadout.textContent = formatLength(state.lambda);
  el.aReadout.textContent = formatLength(state.a);
  el.zReadout.textContent = formatLength(state.z);
  el.nReadout.textContent = state.N;
  el.mReadout.textContent = state.M;
  el.rangeReadout.textContent = formatLength(state.fixedRange);
  if (state.scaleLocked && state.lockedHalfHeight != null) {
    el.lockedHeightReadout.textContent = formatLength(state.lockedHalfHeight);
  }
}

function updateArrowsNote() {
  el.arrowsNote.textContent = `메인 뷰 왼쪽에서 마우스를 움직여 고른 위치(focusY) ± ${formatLength(state.fixedRange)} 범위를 보여줍니다. 관측점 Y를 드래그하면 (이 위치들은 그대로 있고) 화살표 방향이 실제로 어떻게 바뀌는지 볼 수 있습니다. 회색 화살표는 장애물에 막힌 지점입니다.`;
}

function updateScaleTable() {
  const s = cache.scale;
  if (!s) return;
  const rows = [
    ['프레넬 스케일 &radic;(&lambda;z)', formatLength(s.fresnel)],
    ['장애물 폭 / 프레넬 스케일', (state.a / s.fresnel).toFixed(2)],
    ['프레넬 수 N_F = a&sup2;/(&lambda;z)', s.fresnelNumber.toExponential(2)],
    ['해석', s.fresnelNumber > 5 ? '기하광학적 그림자 (장애물 인식)' : (s.fresnelNumber < 0.3 ? '강한 회절 (장애물 무시하고 통과)' : '회절 효과 뚜렷')],
  ];
  el.scaleTable.innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
}

/* =========================================================================
   메인 뷰 렌더링
   ========================================================================= */
function layoutMain(canvas) {
  const w = canvas.width, h = canvas.height;
  const s = cache.scale;
  const xObstacle = w * 0.40;
  const xScreen = w * 0.82;
  const cy = h * 0.52;
  const pxPerM = (h * 0.40) / s.halfHeight;
  return { w, h, xObstacle, xScreen, cy, pxPerM };
}
function yToPx(y, L) { return L.cy - y * L.pxPerM; }

function drawMainView() {
  const canvas = el.mainCanvas;
  const ctx = canvas.getContext('2d');
  const s = cache.scale;
  const L = layoutMain(canvas);
  ctx.clearRect(0, 0, L.w, L.h);

  // 입사 평면파 — 선 간격 = 파장 λ. 장애물 색 띠와 같은 세로 스케일(L.pxPerM)을
  // 공유해야 "선 간격 : 색 띠 높이" 비율이 "λ : 장애물 폭 a"와 물리적으로 일치한다.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, L.xObstacle, L.h);
  ctx.clip();
  const rawWaveSpacing = state.lambda * L.pxPerM;
  const waveSpacing = Math.min(L.w / 3, Math.max(6, rawWaveSpacing));
  const waveSpacingClamped = waveSpacing !== rawWaveSpacing;
  ctx.strokeStyle = 'rgba(120,170,255,0.55)';
  ctx.lineWidth = 1.5;
  for (let x = -waveSpacing + (wavePhase % waveSpacing); x < L.xObstacle + waveSpacing; x += waveSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, L.h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#7a90c8';
  ctx.font = '11px sans-serif';
  ctx.fillText('입사 평면파 (선 간격 = 파장 λ' + (waveSpacingClamped ? ' · 범위 제한' : '') + ')', 8, 14);

  // 색 띠 (입사 파면 단면, 장애물 직전) — 어느 y가 어느 색인지 표시
  const barX = L.xObstacle - 10;
  const yTop = s.halfHeight, yBot = -s.halfHeight;
  const steps = 80;
  for (let i = 0; i < steps; i++) {
    const y0 = yBot + (yTop - yBot) * i / steps;
    const y1 = yBot + (yTop - yBot) * (i + 1) / steps;
    const blocked = state.obstacleOn && Math.abs((y0 + y1) / 2) <= state.a / 2;
    ctx.fillStyle = blocked ? '#444a5e' : yToColor((y0 + y1) / 2, s.halfHeight);
    const py0 = yToPx(y0, L), py1 = yToPx(y1, L);
    ctx.fillRect(barX - 4, Math.min(py0, py1), 8, Math.abs(py1 - py0) + 1);
  }

  // 패널②(위상자 방향 분포)가 지금 확대해서 보여주는 구간 표시
  // (마우스를 이 색 띠 영역 위에서 움직이면 이 구간이 따라 이동합니다)
  {
    const R = state.fixedRange;
    const topPx = yToPx(Math.min(state.focusY + R, s.halfHeight), L);
    const botPx = yToPx(Math.max(state.focusY - R, -s.halfHeight), L);
    ctx.strokeStyle = 'rgba(255,212,121,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX - 7, topPx, 14, botPx - topPx);
    ctx.fillStyle = 'rgba(255,212,121,0.85)';
    ctx.font = '10px sans-serif';
    ctx.fillText('②범위', barX + 10, topPx - 2);
  }

  // 장애물
  if (state.obstacleOn) {
    const topPx = yToPx(state.a / 2, L);
    const botPx = yToPx(-state.a / 2, L);
    ctx.fillStyle = '#5b6273';
    ctx.fillRect(L.xObstacle - 7, topPx, 14, botPx - topPx);
    ctx.strokeStyle = '#9aa3bd';
    ctx.strokeRect(L.xObstacle - 7, topPx, 14, botPx - topPx);
  }
  ctx.fillStyle = '#aab2cf';
  ctx.font = '11px sans-serif';
  ctx.fillText('장애물 (폭 ' + formatLength(state.a) + ')', L.xObstacle - 40, yToPx(s.halfHeight, L) - 6);

  // 기하광학적 그림자 경계 (점선)
  if (state.obstacleOn) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    [state.a / 2, -state.a / 2].forEach(yEdge => {
      ctx.beginPath();
      ctx.moveTo(L.xObstacle, yToPx(yEdge, L));
      ctx.lineTo(L.xScreen, yToPx(yEdge, L));
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  // 스크린 선
  ctx.strokeStyle = '#aab2cf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.xScreen, yToPx(s.halfHeight, L));
  ctx.lineTo(L.xScreen, yToPx(-s.halfHeight, L));
  ctx.stroke();

  // 밝기 곡선
  const curve = cache.curve;
  if (curve) {
    const curveMaxPx = L.w - L.xScreen - 16;
    const normFactor = curveMaxPx / Math.max(curve.maxI, 1e-6);
    ctx.beginPath();
    ctx.strokeStyle = '#ffd479';
    ctx.lineWidth = 2;
    for (let i = 0; i < curve.ys.length; i++) {
      const px = L.xScreen + curve.intens[i] * normFactor;
      const py = yToPx(curve.ys[i], L);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,212,121,0.12)';
    ctx.lineTo(L.xScreen, yToPx(curve.ys[curve.ys.length - 1], L));
    ctx.lineTo(L.xScreen, yToPx(curve.ys[0], L));
    ctx.closePath();
    ctx.fill();
  }

  // 선택된 지점 마커
  const markerPx = yToPx(state.Y, L);
  ctx.beginPath();
  ctx.arc(L.xScreen, markerPx, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ff5577';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 세로축 ruler
  drawRuler(ctx, L, s);
}

function drawRuler(ctx, L, s) {
  const step = niceRulerStep(s.halfHeight);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = '#7a8ab0';
  ctx.font = '10px sans-serif';
  const drawTick = (yy) => {
    const py = yToPx(yy, L);
    ctx.beginPath();
    ctx.moveTo(4, py);
    ctx.lineTo(10, py);
    ctx.stroke();
    ctx.fillText(formatLength(yy), 13, py + 3);
  };
  drawTick(0);
  for (let y = step; y <= s.halfHeight; y += step) {
    drawTick(y);
    drawTick(-y);
  }
}

/* =========================================================================
   위상자 방향 분포 (개별 위상자 화살표)
   각 위치 y의 위상자는 exp[i π (y-Y)² / (λz)] 방향(각도)을 가진다.
   화살표들이 서로 비슷한 방향이면 상쇄되지 않고 더해져서 살아남고,
   방향이 빠르게 회전하면 서로 상쇄되어 사라진다.
   ========================================================================= */
function layoutArrows(canvas) {
  const w = canvas.width, h = canvas.height;
  const pxPerM = (h * 0.42) / state.fixedRange;
  const cx = w * 0.58;
  const cy = h * 0.5;
  return { w, h, cx, cy, pxPerM };
}

function drawPhasorArrows() {
  const canvas = el.arrowsCanvas;
  const ctx = canvas.getContext('2d');
  const s = cache.scale;
  if (!s) return;
  const L = layoutArrows(canvas);
  ctx.clearRect(0, 0, L.w, L.h);

  const { lambda, a, z, Y, focusY, obstacleOn, M, fixedRange: R } = state;
  const toPy = (y) => L.cy - (y - focusY) * L.pxPerM;

  // 장애물 음영 (배경) — 현재 보이는 구간과 겹치는 부분만 자연히 표시됨
  if (obstacleOn) {
    const topPx = toPy(a / 2);
    const botPx = toPy(-a / 2);
    ctx.fillStyle = 'rgba(91,98,115,0.35)';
    ctx.fillRect(0, topPx, L.w, botPx - topPx);
  }

  // 세로 기준선 (화살표들의 회전 중심축)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(L.cx, toPy(focusY + R));
  ctx.lineTo(L.cx, toPy(focusY - R));
  ctx.stroke();

  // 현재 관측점 Y — focusY±R 범위 안에 있으면 그 위치에 점선으로, 밖이면 가장자리에 방향 표시
  const yInView = Y >= focusY - R && Y <= focusY + R;
  if (yInView) {
    const py = toPy(Y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,85,119,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(L.w, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff5577';
    ctx.font = '11px sans-serif';
    ctx.fillText('Y (관측점)', 6, py - 7);
  } else {
    const atTop = Y > focusY + R;
    const edgePy = atTop ? 10 : L.h - 10;
    const dist = Math.abs(Y - focusY) - R;
    ctx.fillStyle = '#ff5577';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(atTop ? '▲' : '▼', L.cx - 5, edgePy + (atTop ? 4 : 0));
    ctx.font = '11px sans-serif';
    ctx.fillText(`Y는 이 방향으로 ${formatLength(dist)} 더 (범위 밖)`, 6, edgePy + (atTop ? 4 : 0));
  }

  const armLen = Math.min(26, (L.h * 0.85) / M / 2 + 6);
  for (let i = 0; i < M; i++) {
    const y = focusY - R + (i + 0.5) * (2 * R) / M;
    const blocked = obstacleOn && Math.abs(y) <= a / 2;
    const phase = Math.PI * (y - Y) * (y - Y) / (lambda * z);
    const dx = Math.cos(phase), dy = -Math.sin(phase);
    const py = toPy(y);

    ctx.beginPath();
    ctx.arc(L.cx, py, 2, 0, Math.PI * 2);
    ctx.fillStyle = blocked ? 'rgba(180,185,200,0.5)' : yToColor(y, s.halfHeight);
    ctx.fill();

    const x0 = L.cx - dx * armLen, y0 = py - dy * armLen;
    const x1 = L.cx + dx * armLen, y1 = py + dy * armLen;
    drawArrow(ctx, x0, y0, x1, y1,
      blocked ? 'rgba(150,155,170,0.45)' : yToColor(y, s.halfHeight),
      blocked ? 1.2 : 2);
  }

  drawCenteredRuler(ctx, toPy, focusY, R);

  ctx.fillStyle = '#7a8ab0';
  ctx.font = '11px sans-serif';
  ctx.fillText(`표시 범위: ${formatLength(focusY)} ± ${formatLength(R)}`, 6, L.h - 8);
}

function drawCenteredRuler(ctx, toPy, center, halfRange) {
  const step = niceRulerStep(halfRange);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.fillStyle = '#7a8ab0';
  ctx.font = '10px sans-serif';
  const drawTick = (yy) => {
    const py = toPy(yy);
    ctx.beginPath();
    ctx.moveTo(4, py);
    ctx.lineTo(10, py);
    ctx.stroke();
    ctx.fillText(formatLength(yy), 13, py + 3);
  };
  drawTick(center);
  for (let d = step; d <= halfRange; d += step) {
    drawTick(center + d);
    drawTick(center - d);
  }
}

/* =========================================================================
   위상자(코르누 나선) 다이어그램
   ========================================================================= */
function drawPhasor(revealFraction) {
  const canvas = el.phasorCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = cache.scale;
  if (!s) return;

  const colored = computePhasorPath(state.Y, state.lambda, state.a, state.z, state.N, state.obstacleOn);
  const reference = computePhasorPath(state.Y, state.lambda, state.a, state.z, state.N, false);

  let minRe = Infinity, maxRe = -Infinity, minIm = Infinity, maxIm = -Infinity;
  [colored.path, reference.path].forEach(path => path.forEach(p => {
    minRe = Math.min(minRe, p.re); maxRe = Math.max(maxRe, p.re);
    minIm = Math.min(minIm, p.im); maxIm = Math.max(maxIm, p.im);
  }));
  minRe = Math.min(minRe, 0); maxRe = Math.max(maxRe, 0);
  minIm = Math.min(minIm, 0); maxIm = Math.max(maxIm, 0);
  const pad = 0.15 * Math.max(maxRe - minRe, maxIm - minIm, 1e-9);
  minRe -= pad; maxRe += pad; minIm -= pad; maxIm += pad;

  const scalePx = Math.min(w / (maxRe - minRe), h / (maxIm - minIm));
  const cx = w / 2 - (minRe + maxRe) / 2 * scalePx;
  const cyPx = h / 2 + (minIm + maxIm) / 2 * scalePx;
  const toPx = (re, im) => [cx + re * scalePx, cyPx - im * scalePx];

  // 축
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  let [ox, oy] = toPx(minRe, 0); let [ox2] = toPx(maxRe, 0);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox2, oy); ctx.stroke();
  let [oxv, oyv] = toPx(0, minIm); let [, oyv2] = toPx(0, maxIm);
  ctx.beginPath(); ctx.moveTo(oxv, oyv); ctx.lineTo(oxv, oyv2); ctx.stroke();
  ctx.fillStyle = '#8ea0e8';
  ctx.font = '10px sans-serif';
  ctx.fillText('Re', ox2 - 14, oy - 4);
  ctx.fillText('Im', oxv + 4, oyv2 + 10);

  // 기준 나선 (회색)
  ctx.beginPath();
  reference.path.forEach((p, i) => {
    const [px, py] = toPx(p.re, p.im);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = 'rgba(200,205,225,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 실제 경로 (색상, revealFraction 만큼만 그림 - 애니메이션용)
  const path = colored.path;
  const revealCount = Math.max(2, Math.round(path.length * (revealFraction !== undefined ? revealFraction : 1)));
  for (let i = 1; i < revealCount && i < path.length; i++) {
    const p0 = path[i - 1], p1 = path[i];
    const [x0, y0] = toPx(p0.re, p0.im);
    const [x1, y1] = toPx(p1.re, p1.im);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = yToColor(p1.y, s.halfHeight);
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // 장애물 가장자리(점프 지점) 마커
  if (state.obstacleOn && colored.n1 < revealCount) {
    const edgePoint = path[colored.n1];
    const [px, py] = toPx(edgePoint.re, edgePoint.im);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }

  // 최종 벡터합 화살표
  if (revealCount >= path.length) {
    const end = path[path.length - 1];
    const [ex, ey] = toPx(end.re, end.im);
    const [origx, origy] = toPx(0, 0);
    drawArrow(ctx, origx, origy, ex, ey, '#1a1a1a', 2.6);
    drawArrow(ctx, origx, origy, ex, ey, '#ffffff', 1.2);

    const mag = Math.sqrt(end.re * end.re + end.im * end.im);
    const refMag = Math.sqrt(reference.total.re ** 2 + reference.total.im ** 2);
    const relIntensity = (mag * mag) / (refMag * refMag);
    ctx.fillStyle = '#e8ebf5';
    ctx.font = '12px sans-serif';
    ctx.fillText(`|합| = ${mag.toExponential(2)}`, 8, h - 28);
    ctx.fillText(`상대 세기 I/I₀ = ${relIntensity.toFixed(3)}`, 8, h - 12);
  }
}

function drawArrow(ctx, x0, y0, x1, y1, color, width) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const angle = Math.atan2(y1 - y0, x1 - x0);
  const headLen = 8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawAll() {
  drawMainView();
  drawPhasorArrows();
  drawPhasor(1);
}

/* =========================================================================
   캔버스 크기 조정
   ========================================================================= */
function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
}
function resizeAllCanvases() {
  [el.mainCanvas, el.arrowsCanvas, el.phasorCanvas].forEach(resizeCanvas);
}

/* =========================================================================
   이벤트 연결
   ========================================================================= */
function onParamChange() {
  updateReadouts();
  scheduleRecompute(120);
}

el.lambdaSlider.addEventListener('input', () => {
  state.lambda = sliderToValue(+el.lambdaSlider.value, RANGES.lambda.min, RANGES.lambda.max);
  onParamChange();
});
el.aSlider.addEventListener('input', () => {
  state.a = sliderToValue(+el.aSlider.value, RANGES.a.min, RANGES.a.max);
  onParamChange();
});
el.zSlider.addEventListener('input', () => {
  state.z = sliderToValue(+el.zSlider.value, RANGES.z.min, RANGES.z.max);
  onParamChange();
});
el.nSlider.addEventListener('input', () => {
  state.N = +el.nSlider.value;
  onParamChange();
});
el.mSlider.addEventListener('input', () => {
  state.M = +el.mSlider.value;
  updateReadouts();
  drawPhasorArrows();
});
el.rangeSlider.addEventListener('input', () => {
  state.fixedRange = sliderToValue(+el.rangeSlider.value, RANGES.fixedRange.min, RANGES.fixedRange.max);
  updateReadouts();
  updateArrowsNote();
  drawMainView();
  drawPhasorArrows();
});
el.obstacleToggle.addEventListener('change', () => {
  state.obstacleOn = el.obstacleToggle.checked;
  scheduleRecompute(0);
});

el.scaleLockToggle.addEventListener('change', () => {
  state.scaleLocked = el.scaleLockToggle.checked;
  if (state.scaleLocked) {
    // 현재 halfHeight를 스냅샷해서 잠근다
    const cur = cache.scale || computeScale(state.lambda, state.a, state.z);
    state.lockedHalfHeight = cur.halfHeight;
    el.lockedHeightSlider.value = valueToSlider(
      state.lockedHalfHeight, RANGES.lockedHalfHeight.min, RANGES.lockedHalfHeight.max
    );
    el.scaleLockSection.style.display = 'block';
  } else {
    el.scaleLockSection.style.display = 'none';
  }
  updateReadouts();
  scheduleRecompute(0);
});

el.lockedHeightSlider.addEventListener('input', () => {
  state.lockedHalfHeight = sliderToValue(
    +el.lockedHeightSlider.value, RANGES.lockedHalfHeight.min, RANGES.lockedHalfHeight.max
  );
  updateReadouts();
  scheduleRecompute(120);
});

function setSlidersFromState() {
  el.lambdaSlider.value = valueToSlider(state.lambda, RANGES.lambda.min, RANGES.lambda.max);
  el.aSlider.value = valueToSlider(state.a, RANGES.a.min, RANGES.a.max);
  el.zSlider.value = valueToSlider(state.z, RANGES.z.min, RANGES.z.max);
  el.nSlider.value = state.N;
  el.mSlider.value = state.M;
  el.rangeSlider.value = valueToSlider(state.fixedRange, RANGES.fixedRange.min, RANGES.fixedRange.max);
  if (state.scaleLocked && state.lockedHalfHeight != null) {
    el.lockedHeightSlider.value = valueToSlider(
      state.lockedHalfHeight, RANGES.lockedHalfHeight.min, RANGES.lockedHalfHeight.max
    );
  }
  updateReadouts();
  updateArrowsNote();
}

function applyUrlParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.has('lambda')) state.lambda = Math.min(RANGES.lambda.max, Math.max(RANGES.lambda.min, parseFloat(p.get('lambda'))));
  if (p.has('a')) state.a = Math.min(RANGES.a.max, Math.max(RANGES.a.min, parseFloat(p.get('a'))));
  if (p.has('z')) state.z = Math.min(RANGES.z.max, Math.max(RANGES.z.min, parseFloat(p.get('z'))));
  return { lockScale: p.get('lockScale') === '1' };
}

const PRESETS = {
  radio:       { lambda: 1.0,    a: 2.0,    z: 10.0 },
  micro:       { lambda: 1e-2,   a: 5e-2,   z: 2.0 },
  visible:     { lambda: 500e-9, a: 1e-3,   z: 1.0 },
  bigobstacle: { lambda: 500e-9, a: 1e-2,   z: 1.0 },
};
document.querySelectorAll('.preset-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.preset];
    state.lambda = p.lambda; state.a = p.a; state.z = p.z;
    setSlidersFromState();
    scheduleRecompute(0);
  });
});

// 스크린 위 점(Y) 드래그 + 입사파면 영역 호버(focusY) — 두 구역을 분리해서 충돌을 막는다.
function attachScreenInteraction() {
  const canvas = el.mainCanvas;
  const SCREEN_DRAG_MARGIN = 30; // 스크린 선 근처 이 폭(px) 안에서만 Y 드래그 시작
  const FOCUS_HOVER_MARGIN = 20; // 장애물 오른쪽으로 이만큼(px)까지도 호버 영역으로 인정

  function clientToY(evt) {
    const rect = canvas.getBoundingClientRect();
    const py = (evt.clientY - rect.top);
    const L = layoutMain(canvas);
    const s = cache.scale;
    return Math.max(-s.halfHeight, Math.min(s.halfHeight, (L.cy - py) / L.pxPerM));
  }
  function clientToPx(evt) {
    const rect = canvas.getBoundingClientRect();
    return evt.clientX - rect.left;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const L = layoutMain(canvas);
    if (Math.abs(clientToPx(e) - L.xScreen) <= SCREEN_DRAG_MARGIN) {
      state.dragging = true;
      state.Y = clientToY(e);
      drawMainView();
      drawPhasorArrows();
      drawPhasor(1);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.Y = clientToY(e);
    drawMainView();
    drawPhasorArrows();
    drawPhasor(1);
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });

  canvas.addEventListener('pointermove', (e) => {
    if (state.dragging) return;
    const L = layoutMain(canvas);
    const px = clientToPx(e);
    if (px <= L.xObstacle + FOCUS_HOVER_MARGIN) {
      canvas.style.cursor = 'crosshair';
      state.focusY = clientToY(e);
      drawMainView();
      drawPhasorArrows();
    } else if (Math.abs(px - L.xScreen) <= SCREEN_DRAG_MARGIN) {
      canvas.style.cursor = 'ns-resize';
    } else {
      canvas.style.cursor = 'default';
    }
  });
}

// 위상자 누적 애니메이션
el.animateBtn.addEventListener('click', () => {
  state.animPlaying = true;
  state.animFrame = 0;
});

/* =========================================================================
   애니메이션 루프
   ========================================================================= */
function tick() {
  wavePhase += 0.6;
  drawMainView();

  if (state.animPlaying) {
    state.animFrame += 1;
    const frac = Math.min(1, state.animFrame / 90);
    drawPhasor(frac);
    if (frac >= 1) state.animPlaying = false;
  }

  requestAnimationFrame(tick);
}

/* =========================================================================
   초기화
   ========================================================================= */
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

init();

/* =========================================================================
   허브(hub.html) 연동 — ③ 나란히 보기에서 그래프 패널을 먼저 보여주기 위한
   최소 메시지 리스너. 메시지가 없으면 기존 동작과 완전히 동일하다.
   ========================================================================= */
window.addEventListener('message', (e) => {
  try {
    if (e.data === 'scrollToPanelMain') {
      const panel = document.getElementById('panel-main');
      if (panel) panel.scrollIntoView({ block: 'start' });
    } else if (e.data && e.data.type === 'diffhub-setParams') {
      const newA = e.data.H_mm / 1000;
      const newZ = e.data.L_mm / 1000;
      const geometryChanged = (newA !== state.a) || (newZ !== state.z);
      state.a = newA;
      state.z = newZ;
      state.lambda = e.data.lam_cm / 100;
      // 스케일 고정 중 기하(a,z)가 바뀌면 "지금 막 체크박스를 켰다면 잡혔을 값"으로
      // 재고정한다(§30.9) — λ만 바뀔 때는 고정값을 그대로 둔다(같은 자로 비교하는
      // 기능의 존재 이유). 사용자가 앱 안에서 고정을 껐다면(state.scaleLocked===false)
      // 여기서 다시 켜지 않는다.
      if (state.scaleLocked && geometryChanged) {
        state.lockedHalfHeight = computeFreeHalfHeight(state.lambda, state.a, state.z);
      }
      setSlidersFromState();
      scheduleRecompute(0);
    }
  } catch (err) { /* 조용히 무시 */ }
});
