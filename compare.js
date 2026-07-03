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

  // =====================================================================
  // 콘솔 자가검증(마지막에 호출)
  // =====================================================================
  function selfCheck() {
    console.log("[검증] J0(1)=", besselJ0(1).toFixed(6), "(기대 0.765198)");
    console.log("[검증] Y0(1)=", besselY0(1).toFixed(6), "(기대 0.088257)");
    {
      // 장애물 없음(obstacleOn=false) → 세기 = (1²+1²)/REF_INTENSITY = 1
      const I = fresnelIntensity(0, 0.01, 0.2, 0.3, false) / REF_INTENSITY;
      console.assert(Math.abs(I - 1) < 1e-9, "장애물 없음 세기=1 (정규화 기준)");
    }
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
    {
      const r = recomputeMoM(200, 300, 1);
      console.assert(r.sbar >= 0 && r.sbar <= 0.08 + 1e-6,
        "recomputeMoM(H=200,L=300,λ=1cm): S̄가 0.08 이하(§28.1 기준4, 이산화 누설 없음)");
      console.log("[검증] recomputeMoM 기본 케이스 S̄=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
    }
  }

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
  selfCheck();
})();
