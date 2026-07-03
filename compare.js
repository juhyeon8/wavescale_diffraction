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
