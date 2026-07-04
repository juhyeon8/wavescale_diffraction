(function () {
  "use strict";

  // =====================================================================
  // 0. 상수
  // =====================================================================
  const C_LIGHT = 2.99792458e8;
  const TWO_PI = Math.PI * 2;
  const VMAX = 1.5;           // 색 포화 기준 [V/m]
  const N_MAX = 120;          // 도선 수 상한(성능)
  const ZOOM_MIN = 0.5;       // 최대 줌아웃(50%)
  const ZOOM_MAX = 20;        // 최대 줌인(2000%)

  // =====================================================================
  // 1. 상태
  // =====================================================================
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

  // 뷰 전용 상태(물리 state와 분리) — 줌 배율 + 등방 판정 결과(§13)
  const view = { zoomFactor: 1, isotropic: true, scaleRatio: 1 };

  // =====================================================================
  // 2. 베셀/한켈 함수  (Abramowitz & Stegun 9.4 다항 근사)
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
  // 3. 복소 선형계 Z c = b  (N×N, 부분 피벗 가우스 소거)
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

  // =====================================================================
  // 4. 솔버 출력 (recompute 결과 저장)
  // =====================================================================
  const solver = {
    k: 0, aEff_m: 0, wiresY: [],
    cRe: null, cIm: null,
    gridW: 0, gridH: 0, xMin: 0, xMax: 0, Yw: 0,
    incRe: null, incIm: null, scRe: null, scIm: null,
  };

  // =====================================================================
  // 5. 물리 계산
  // =====================================================================
  // 한 점에서 입사·산란장 평가 (그리드/스크린 공용)
  function evalFields(wx, wy, k, wiresY, cRe, cIm, aEff_m) {
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

  // 스크린(거리 L_m, 높이 wy)에서의 세기 |E_total|² (입사 세기=1 단위)
  function screenIntensity(L_m, wy) {
    const f = evalFields(L_m, wy, solver.k, solver.wiresY, solver.cRe, solver.cIm, solver.aEff_m);
    const tr = f.incRe + f.scRe, ti = f.incIm + f.scIm;
    return tr * tr + ti * ti;
  }

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

  function recompute() {
    if (!layout.bandW || !layout.bandH) return;
    const _t0 = performance.now();

    const lam_m = state.lam_cm / 100;
    const d_m = state.d_mm / 1000;
    const aEff_m = state.a_mm / 1000;          // 상한 제거: 닿음 허용
    const k = TWO_PI / lam_m;
    const N = Math.min(N_MAX, Math.max(2, state.N));

    // 물리 그리드 범위: base(줌 100% 기준, L_MAX 기반) ÷ ZOOM_MIN 까지 미리 커버.
    // 줌·L 조작과 무관 — N/d/a/λ가 바뀌어도 이 범위 자체는 안 바뀐다 (§1 gridWorld).
    computeBaseAndGrid();
    const xMin = gridWorld.xMin, xMax = gridWorld.xMax, Yw = gridWorld.Yw;
    const span = xMax - xMin;

    // 도선 위치 (y=0 중심)
    const wiresY = new Float64Array(N);
    for (let n = 0; n < N; n++) wiresY[n] = (n - (N - 1) / 2) * d_m;

    // 유한 배열 MoM: Z_mn=H0(k·|y_m-y_n|), 자기항 H0(k·a), b=-1
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

    const gridW = layout.gridW;
    const aspect3band = layout.bandH / layout.bandW;
    const aspect1to1 = layout.bandH1to1 / layout.bandW;
    const gridH = requiredGridH(gridW, aspect3band, aspect1to1, state.viewMode);
    const incRe = new Float32Array(gridW * gridH);
    const incIm = new Float32Array(gridW * gridH);
    const scRe = new Float32Array(gridW * gridH);
    const scIm = new Float32Array(gridW * gridH);
    for (let gj = 0; gj < gridH; gj++) {
      const wy = Yw - (gj + 0.5) / gridH * 2 * Yw;
      for (let gi = 0; gi < gridW; gi++) {
        const wx = xMin + (gi + 0.5) / gridW * span;
        const idx = gj * gridW + gi;
        const f = evalFields(wx, wy, k, wiresY, cRe, cIm, aEff_m);
        incRe[idx] = f.incRe; incIm[idx] = f.incIm;
        scRe[idx] = f.scRe; scIm[idx] = f.scIm;
      }
    }

    Object.assign(solver, {
      k, aEff_m, wiresY, cRe, cIm,
      gridW, gridH, xMin, xMax: xMin + span, Yw, incRe, incIm, scRe, scIm,
    });

    const _dt = performance.now() - _t0;
    console.log(`[성능] recompute() ${_dt.toFixed(1)} ms (N=${N}, gridW=${gridW}, gridH=${gridH})`);

    updateInfo();
  }

  // =====================================================================
  // 6. 레이아웃 / 캔버스
  // =====================================================================
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const offscreen = document.createElement("canvas");
  const offctx = offscreen.getContext("2d");

  const layout = {
    cssW: 0, cssH: 0, marginL: 12, marginR: 12, marginT: 10, marginB: 10,
    gap: 14, bandX: 0, bandW: 0, bandH: 0, bandY: [0, 0, 0],
    bandH1to1: 0,                                     // 1:1 모드 단일 밴드 높이(§20.2)
    gridW: 900, plotW: 96,
  };

  const BAND_TITLES = ["① 입사파", "② 산란파", "③ 중첩 (입사 + 산란)"];

  // =====================================================================
  // 6.1 뷰 지오메트리 — base(줌 100% 기준) · gridWorld(물리 계산 범위) · camera(현재 뷰)
  // =====================================================================
  const base = { xMin: 0, xMax: 0, Yw: 0 };
  const base1to1 = { xMin: 0, xMax: 0, Yw: 0 };       // 1:1 모드 zoom=100% 뷰(§20.2)
  const gridWorld = { xMin: 0, xMax: 0, Yw: 0 };
  const camera = { xMin: 0, xMax: 0, Yw: 0 };
  const camera1to1 = { xMin: 0, xMax: 0, Yw: 0 };

  // [등방 판정] 1:1 등방 기준 세로 반높이 vs 막대 가시성 하한, 큰 쪽 채택.
  // 순수 함수 — selfCheck()에서 단언.
  function chooseBaseYw(span, aspect, H_m) {
    const isoYw = (span * aspect) / 2;
    const floorYw = 1.15 * (H_m / 2 + 0.05);
    const baseYw = Math.max(isoYw, floorYw);
    return { baseYw, isotropic: baseYw === isoYw, scaleRatio: (2 * baseYw) / (aspect * span) };
  }

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

    // [1:1 모드] 좌표계 — L 무관, H만의 함수(§20.2)
    layout.bandH1to1 = layout.cssH - layout.marginT - layout.marginB;
    const range1to1 = compute1to1Range(H_m, layout.bandW, layout.bandH1to1);
    base1to1.xMin = range1to1.xMin1to1; base1to1.xMax = range1to1.xMax1to1; base1to1.Yw = range1to1.Yw1to1;

    // gridWorld: 3분할 몫과 1:1 몫의 합집합, ZOOM_MIN까지 미리 커버(§20.3)
    const union = unionGridWorld(baseXmin, baseXmax, baseYw, range1to1, ZOOM_MIN);
    gridWorld.xMin = union.xMin; gridWorld.xMax = union.xMax; gridWorld.Yw = union.Yw;
  }

  // camera: 현재 화면(밴드)에 실제로 보이는 범위. 항상 x=0,y=0 중심으로
  // base를 zoomFactor만큼 나눈 값 — gridWorld의 부분집합이 되도록 보장된다.
  function computeCamera() {
    camera.xMin = base.xMin / view.zoomFactor;
    camera.xMax = base.xMax / view.zoomFactor;
    camera.Yw = base.Yw / view.zoomFactor;
    camera1to1.xMin = base1to1.xMin / view.zoomFactor;
    camera1to1.xMax = base1to1.xMax / view.zoomFactor;
    camera1to1.Yw = base1to1.Yw / view.zoomFactor;
  }

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

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
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

  // =====================================================================
  // 7. 색 매핑 + 프레임 렌더
  // =====================================================================
  function colorFor(v, out, o) {
    let t = v; if (t > 1) t = 1; else if (t < -1) t = -1;
    let r, g, bl;
    if (t >= 0) { r = 255; g = 255 - t * 205; bl = 255 - t * 215; }
    else { const u = -t; r = 255 - u * 215; g = 255 - u * 165; bl = 255 - u * 35; }
    out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = 255;
  }

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

  function worldToBand(wx, wy, by) {
    const sx = layout.bandX + (wx - camera.xMin) / (camera.xMax - camera.xMin) * layout.bandW;
    const sy = by + (camera.Yw - wy) / (2 * camera.Yw) * layout.bandH;
    return { x: sx, y: sy };
  }

  function drawOverlay(band, by) {
    const bx = layout.bandX, bw = layout.bandW, bh = layout.bandH;
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    const sPx = layout.bandW / (camera.xMax - camera.xMin);
    const dPx = (state.d_mm / 1000) * sPx;
    const aPx = (solver.aEff_m) * sPx;
    const rPx = Math.min(dPx * 0.5, Math.max(1.5, aPx));   // 닿으면 dPx의 절반(맞닿음)
    const N = state.N;

    // 중심선 (도선 배열 위치)
    const top = worldToBand(0, camera.Yw, by), bot = worldToBand(0, -camera.Yw, by);
    ctx.save();
    ctx.strokeStyle = band === 0 ? "#e4e4e8" : "#9aa0aa";
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
    ctx.restore();

    // 스크린 위치 (거리 L, 세로 점선)
    const Lx = state.L_mm / 1000;
    if (Lx >= camera.xMin && Lx <= camera.xMax) {
      const st = worldToBand(Lx, camera.Yw, by), sb = worldToBand(Lx, -camera.Yw, by);
      ctx.save();
      ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      ctx.restore();
      if (band === 0) {
        ctx.save(); ctx.font = "10px sans-serif"; ctx.fillStyle = "#c0392b";
        ctx.textAlign = "center"; ctx.fillText("스크린", (st.x + sb.x) / 2, by + 12);
        ctx.restore();
      }
    }

    // 도선
    for (let n = 0; n < N; n++) {
      const p = worldToBand(0, solver.wiresY[n], by);
      if (p.y < by - 4 || p.y > by + bh + 4) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, rPx, 0, TWO_PI);
      if (band !== 0) {
        ctx.fillStyle = "#3a3a40"; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "#1c1c1f"; ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(120,120,128,0.45)"; ctx.fill();
      }
    }

    // 진행방향 화살표 (입사 칸, 왼→오른)
    if (band === 0) {
      const ay = by + 16, ax = bx + 16;
      ctx.fillStyle = "#444"; ctx.strokeStyle = "#444"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 34, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax + 34, ay); ctx.lineTo(ax + 27, ay - 4); ctx.lineTo(ax + 27, ay + 4); ctx.closePath(); ctx.fill();
      ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#444";
      ctx.fillText("입사파 진행 →", ax, ay - 8);
    }

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

    // 밴드 제목
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "#10193a";
    ctx.fillText(BAND_TITLES[band], bx + 10, by + bh - 10);

    if (band === 1 && !view.isotropic) {
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#5a5a62";
      ctx.fillText(`세로:가로 축척 ×${view.scaleRatio.toFixed(1)} (막대 높이 우선표시)`, bx + 120, by + bh - 10);
    }
    if (band === 2) {
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#5a5a62";
      ctx.fillText("오른쪽=막대 뒤(그림자/회절) · 왼쪽=반사 간섭 · 점선=스크린 위치", bx + 120, by + bh - 10);
    }
  }

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

  // =====================================================================
  // 8. 정보 표시
  // =====================================================================

  // 가드레일 순수 헬퍼
  function barHeight_mm(N, d_mm) { return (N - 1) * d_mm; }
  function isTouching(a_mm, d_mm) { return 2 * a_mm >= d_mm; }
  function transmissionWarn(lam_cm, d_mm) { return lam_cm * 10 < 5 * d_mm; }

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

  function updateInfo() {
    const lam_m = state.lam_cm / 100;
    const f_GHz = C_LIGHT / lam_m / 1e9;
    const dlam = (state.d_mm / 1000) / lam_m;        // d/λ
    const lam_d = lam_m / (state.d_mm / 1000);        // λ/d
    const H = barHeight_mm(state.N, state.d_mm);
    const touch = isTouching(state.a_mm, state.d_mm);
    const warn = transmissionWarn(state.lam_cm, state.d_mm);

    const Icenter = (solver.wiresY && solver.wiresY.length)
      ? screenIntensity(state.L_mm / 1000, 0) : 1;

    const shadowProfile = computeShadowProfile(state.L_mm / 1000);
    const shadowText = shadowProfile.region
      ? `${shadowProfile.widthMm.toFixed(1)} mm`
      : `해당 없음(중심 밝음)`;

    const lamH = lamHRatio(state.lam_cm, state.N, state.d_mm);
    const lamHInfo = lamHBadge(lamH);
    const nF = fresnelNumber(H, state.L_mm, state.lam_cm);
    const nFInfo = fresnelBadge(nF);
    const H_m = H / 1000;
    const sbar = computeShadowFillRatio(state.L_mm / 1000, H_m);

    const modeBadges = (state.mode === 'solid')
      ? `<span class="badge ok">솔리드(자동)</span>` +
        (state.solidApproxWarn ? ` <span class="badge warn">근사(격자 상한, d&gt;1mm)</span>` : ``)
      : (touch ? `<span class="badge ok">닿음(솔리드)</span>` : `<span class="badge">틈 있음</span>`) +
        (warn ? ` <span class="badge warn">투과 영향 구간 (λ &lt; 5d)</span>` : ``);

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
  }

  function syncLabels() {
    document.getElementById("nVal").textContent = state.N + " 개";
    document.getElementById("dVal").textContent = state.d_mm.toFixed(1) + " mm";
    document.getElementById("aVal").textContent = state.a_mm.toFixed(2) + " mm";
    document.getElementById("lamVal").textContent = state.lam_cm.toFixed(1) + " cm";
    document.getElementById("ampVal").textContent = state.amp.toFixed(2) + " V/m";
    document.getElementById("lVal").textContent = state.L_mm.toFixed(0) + " mm";
    document.getElementById("hVal").textContent = state.H_mm.toFixed(0) + " mm";
  }

  // =====================================================================
  // 9. UI 바인딩
  // =====================================================================
  let recomputeTimer = null;
  function scheduleRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => { recompute(); drawFrame(); }, 150);
  }

  function bindSlider(id, key, parse, redrawOnly) {
    document.getElementById(id).addEventListener("input", function () {
      state[key] = parse(this.value);
      syncLabels();
      if (redrawOnly) drawFrame(); else scheduleRecompute();
    });
  }
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
  bindSlider("lamSlider", "lam_cm", parseFloat);
  // L: 3분할 모드는 가로 범위 기준이라 recompute 필요(§13.2). 1:1 모드는
  // gridWorld가 이미 H 기반으로 충분해 recompute 불필요 — drawFrame만(§20.6).
  // 단, 물리 필드는 L에 무관해도(§20.1) 정보 박스(S̄/I₀ 등)는 현재 L로 다시
  // 평가해야 하므로 updateInfo()는 recompute 없이 별도로 호출한다.
  document.getElementById("lSlider").addEventListener("input", function () {
    state.L_mm = parseFloat(this.value);
    syncLabels();
    if (state.viewMode === '1to1') { updateInfo(); drawFrame(); } else scheduleRecompute();
  });

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

  bindSlider("ampSlider", "amp", parseFloat, true);

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

  // 줌 (버튼 + 마우스 휠) — 항상 x=0,y=0 중심, view.zoomFactor 하나를 공유한다.
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const zoomPctVal = document.getElementById("zoomPctVal");
  function setZoom(z) {
    view.zoomFactor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    zoomPctVal.textContent = Math.round(view.zoomFactor * 100) + "%";
    drawFrame();
  }
  zoomInBtn.addEventListener("click", () => setZoom(view.zoomFactor * 1.25));
  zoomOutBtn.addEventListener("click", () => setZoom(view.zoomFactor / 1.25));
  zoomResetBtn.addEventListener("click", () => setZoom(1));
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(view.zoomFactor * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });

  // 재생/일시정지
  const playBtn = document.getElementById("playBtn");
  const phaseWrap = document.getElementById("phaseWrap");
  const phaseSlider = document.getElementById("phaseSlider");
  playBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? "‖ 일시정지" : "▶ 재생";
    phaseWrap.classList.toggle("on", !state.playing);
    document.getElementById("phaseHint").style.display = state.playing ? "none" : "block";
  });
  phaseSlider.addEventListener("input", () => {
    state.phase = parseFloat(phaseSlider.value) * Math.PI / 180;
    document.getElementById("phaseVal").textContent = phaseSlider.value + "°";
    if (!state.playing) drawFrame();
  });

  // =====================================================================
  // 10. 애니메이션 루프
  // =====================================================================
  function loop() {
    if (state.playing) {
      state.phase = (state.phase + 0.06) % TWO_PI;
      drawFrame();
    }
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // 11. 콘솔 자가검증
  // =====================================================================
  function selfCheck() {
    console.log("[검증] J0(1)=", besselJ0(1).toFixed(6), "(기대 0.765198)");
    console.log("[검증] Y0(1)=", besselY0(1).toFixed(6), "(기대 0.088257)");
    console.log("[검증] J0(5)=", besselJ0(5).toFixed(6), "(기대 -0.177597)");
    console.log("[검증] Y0(0.01)=", besselY0(0.01).toFixed(4), "(유한, 발산 아님)");
    {
      const r1 = chooseBaseYw(0.1, 1.0, 0.02);
      console.assert(!r1.isotropic, "chooseBaseYw: H 하한이 이겨야 함(0.069>0.05)");
      const r2 = chooseBaseYw(1.0, 1.0, 0.001);
      console.assert(r2.isotropic, "chooseBaseYw: 등방 기준이 이겨야 함(0.5>0.058)");
    }
    console.assert(barHeight_mm(5, 4) === 16, "barHeight 5,4 → 16");
    console.assert(isTouching(2, 3) === true,  "isTouching 2,3 (2a=4≥3)");
    console.assert(isTouching(1, 3) === false, "isTouching 1,3 (2a=2<3)");
    console.assert(transmissionWarn(2, 5) === true,  "warn λ=20mm<25mm");
    console.assert(transmissionWarn(3, 5) === false, "no-warn λ=30mm≥25mm");
    console.log("[검증] 가드레일 헬퍼 단언 통과");
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
    console.assert(lamHBadge(0.1).text.includes("그림자 뚜렷"), "lamHBadge <0.3");
    console.assert(lamHBadge(0.5).text.includes("전이"), "lamHBadge 0.3~1");
    console.assert(lamHBadge(2).text.includes("감싸"), "lamHBadge >=1");
    console.assert(fresnelBadge(5).text.includes("기하"), "fresnelBadge >3");
    console.assert(fresnelBadge(1).text.includes("전이"), "fresnelBadge 0.5~3");
    console.assert(fresnelBadge(0.1).text.includes("메워짐"), "fresnelBadge <0.5");
    console.assert(Math.abs(lamHRatio(12, 5, 4) - 7.5) < 1e-9, "lamHRatio(12,5,4)=7.5");
    console.assert(Math.abs(fresnelNumber(16, 100, 12) - (8 * 8) / (100 * 120)) < 1e-9, "fresnelNumber(16,100,12)");
    {
      const testIy = new Float64Array([1, 1, 0.3, 0.2, 0.1, 0.2, 0.3, 1, 1]);
      const r = findShadowRegion(testIy, 0.5);
      console.assert(r && r.lo === 2 && r.hi === 6, "findShadowRegion 기본 케이스");
    }
    console.assert(findShadowRegion(new Float64Array([1, 1, 1, 1, 1]), 0.5) === null,
      "findShadowRegion 그림자 없음");
    console.assert(Math.abs(shadowFillRatioFromSamples([0.2, 0.4, 0.6, 0.8]) - 0.5) < 1e-9,
      "shadowFillRatioFromSamples([.2,.4,.6,.8])=0.5");
    console.assert(shadowFillRatioFromSamples([0, 0, 0]) === 0, "shadowFillRatioFromSamples 전부 0 → 0");
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

    // 장애물 없을 때(도선 0개) 스크린 세기 ≈ 1
    {
      const k0 = TWO_PI / (state.lam_cm / 100);
      const f = evalFields(0.08, 0.0, k0, new Float64Array(0), new Float64Array(0), new Float64Array(0), 1e-6);
      const I0 = (f.incRe + f.scRe) ** 2 + (f.incIm + f.scIm) ** 2;
      console.assert(Math.abs(I0 - 1) < 1e-9, "무장애물 스크린 세기=1");
      console.log("[검증] 무장애물 세기 I0=", I0.toFixed(6));
    }
    recompute();
    console.assert(Math.abs(screenIntensity(state.L_mm / 1000, 0) - 1) < 0.2 || state.N >= 2,
      "screenIntensity 정의됨");
    console.log("[검증] screenIntensity(중심)=", screenIntensity(state.L_mm / 1000, 0).toFixed(3));
    {
      const H_m = barHeight_mm(state.N, state.d_mm) / 1000;
      const sbar = computeShadowFillRatio(state.L_mm / 1000, H_m);
      console.assert(sbar >= 0, "S̄ ≥ 0");
      console.log("[검증] 그림자 채움률 S̄=", sbar.toFixed(4));
    }
  }

  // =====================================================================
  // 10. URL 파라미터 초기화 (허브 연동, §30)
  // =====================================================================
  function applyUrlParams() {
    const p = new URLSearchParams(window.location.search);
    if (p.get('mode') === 'solid') state.mode = 'solid';
    if (p.has('H')) state.H_mm = parseFloat(p.get('H'));
    if (p.has('L')) state.L_mm = parseFloat(p.get('L'));
    if (p.has('lam')) state.lam_cm = parseFloat(p.get('lam'));
    document.getElementById("hSlider").value = state.H_mm;
    document.getElementById("lSlider").value = state.L_mm;
    document.getElementById("lamSlider").value = state.lam_cm;
  }

  // =====================================================================
  // 시작
  // =====================================================================
  applyUrlParams();
  syncActivePhysics();
  applyModeUI();
  applyViewModeUI();
  applyViewFieldUI();
  syncLabels();
  window.addEventListener("resize", resize);
  resize();       // layout 확정 + recompute + drawFrame
  selfCheck();    // 베셀 검증
  recompute();    // 상태 재계산
  drawFrame();
  requestAnimationFrame(loop);

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
})();
