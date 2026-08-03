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
    H_mm: 100, L_mm: 300, lam_cm: 1,
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
    // §26.1 정정: d_target=λ/20 단독으로는 λ가 클 때(예 λ=3cm) 잔여 이산화
    // 누설이 S̄를 과대평가함(수렴 기준값은 d=1mm/λ30에서 실측). 1mm 상한을
    // 추가로 걸어 λ가 커져도 격자가 과도하게 성겨지지 않게 함.
    const d_target_mm = Math.min(1, lam_mm / 20);
    const N = Math.min(400, Math.max(2, Math.ceil(H_mm / d_target_mm) + 1));
    const d_mm = H_mm / (N - 1);
    const a_mm = d_mm / 2;
    const warn = d_mm > 1.05 * d_target_mm;
    return { N, d_mm, a_mm, d_target_mm, warn };
  }

  // =====================================================================
  // 6. 스크린 y 표본(§27.2: -2.0*(H/2) ~ +2.0*(H/2), 241점 — acceptance 기준 1의
  //    첫 밝은 무늬(y≈160mm, H=200mm 기준)가 화면에서 직접 확인 가능해야 하므로
  //    ±1.5에서 확대)
  // =====================================================================
  function sampleYs_mm(H_mm) {
    const halfRange = 2.0 * (H_mm / 2);
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

  // 하위헌스-프레넬 스크린 곡선 계산 — a(장애물 폭)에 H(전체 폭)를 그대로 전달(§25.2:
  // 두 모형의 H/a는 기하학적으로 같은 양, computeSolidWireLayout이 확인)
  function computeShadowFillRatioHuygens(lam_m, a_m, z_m, H_m, samples = 100) {
    const arr = new Array(samples);
    for (let s = 0; s < samples; s++) {
      const wy = -H_m / 2 + (s + 0.5) / samples * H_m;
      arr[s] = fresnelIntensity(wy, lam_m, a_m, z_m, true) / REF_INTENSITY;
    }
    return shadowFillRatioFromSamples(arr);
  }

  function recomputeHuygens(H_mm, L_mm, lam_cm) {
    const lam_m = lam_cm / 100;
    const a_m = H_mm / 1000;
    const z_m = L_mm / 1000;
    const H_m = H_mm / 1000;
    const ys_mm = sampleYs_mm(H_mm);
    const Iy = new Float64Array(NUM_POINTS);
    for (let i = 0; i < NUM_POINTS; i++) {
      const Y_m = ys_mm[i] / 1000;
      Iy[i] = fresnelIntensity(Y_m, lam_m, a_m, z_m, true) / REF_INTENSITY;
    }
    const I0 = fresnelIntensity(0, lam_m, a_m, z_m, true) / REF_INTENSITY;
    const sbar = computeShadowFillRatioHuygens(lam_m, a_m, z_m, H_m);
    return { ys_mm, Iy, I0, sbar };
  }

  // =====================================================================
  // 7. Fresnel 수 + 렌더링
  // =====================================================================
  function fresnelNumber(H_mm, L_mm, lam_cm) {
    const lam_mm = lam_cm * 10;
    return Math.pow(H_mm / 2, 2) / (L_mm * lam_mm);
  }

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height };
  }

  function drawMainPlot(mom, huy, H_mm) {
    const canvas = el.mainCanvas;
    const { w, h } = resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const m = { left: 46, right: 16, top: 16, bottom: 30 };
    const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
    const halfRange = 1.0 * H_mm;   // 2.0*(H/2) — sampleYs_mm과 동일 범위 유지
    let Imax = 2;
    for (let i = 0; i < mom.Iy.length; i++) Imax = Math.max(Imax, mom.Iy[i], huy.Iy[i]);
    Imax = Math.ceil(Imax);
    const px = (y_mm) => m.left + (y_mm + halfRange) / (2 * halfRange) * plotW;
    const py = (I) => m.top + (1 - I / Imax) * plotH;

    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(m.left + 0.5, m.top + 0.5, plotW - 1, plotH - 1);

    // 기하 그림자 음영 |y|<=H/2(§27.2)
    const shadeX0 = px(-H_mm / 2), shadeX1 = px(H_mm / 2);
    ctx.fillStyle = "rgba(120,120,128,0.12)";
    ctx.fillRect(shadeX0, m.top, shadeX1 - shadeX0, plotH);

    // 입사=1 기준선
    ctx.strokeStyle = "#aab2cf"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.left, py(1)); ctx.lineTo(m.left + plotW, py(1)); ctx.stroke();
    ctx.setLineDash([]);

    // MoM 곡선(파랑 실선)
    ctx.strokeStyle = "#2f6feb"; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 0; i < mom.ys_mm.length; i++) {
      const x = px(mom.ys_mm[i]), y = py(mom.Iy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 하위헌스-프레넬 곡선(빨강 점선)
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.8; ctx.setLineDash([5, 4]); ctx.beginPath();
    for (let i = 0; i < huy.ys_mm.length; i++) {
      const x = px(huy.ys_mm[i]), y = py(huy.Iy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 축 라벨
    ctx.fillStyle = "#5a5a62"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("스크린 위치 y (mm)", m.left + plotW / 2, h - 4);
    ctx.save(); ctx.translate(12, m.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("I / I₀(입사)", 0, 0); ctx.restore();
    ctx.textAlign = "left"; ctx.fillText((-halfRange).toFixed(0), m.left, h - 16);
    ctx.textAlign = "right"; ctx.fillText(halfRange.toFixed(0), m.left + plotW, h - 16);
    ctx.fillStyle = "#5a5a62"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText((-H_mm / 2).toFixed(0), shadeX0, h - 16);
    ctx.fillText((H_mm / 2).toFixed(0), shadeX1, h - 16);
    ctx.textAlign = "left";
    for (let v = 0; v <= Imax; v++) {
      ctx.fillText(v.toFixed(0), 22, py(v) + 3);
    }

    // 범례
    ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.strokeStyle = "#2f6feb"; ctx.setLineDash([]); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(m.left + 10, m.top + 14); ctx.lineTo(m.left + 30, m.top + 14); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillText("도선 막대", m.left + 34, m.top + 18);
    ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(m.left + 10, m.top + 30); ctx.lineTo(m.left + 30, m.top + 30); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText("하위헌스-프레넬", m.left + 34, m.top + 34);
  }

  function updateInfoBox(mom, huy, H_mm, L_mm, lam_cm) {
    const nF = fresnelNumber(H_mm, L_mm, lam_cm);
    const diffPct = Math.abs(mom.sbar - huy.sbar) / Math.max(huy.sbar, 1e-9) * 100;
    const warnBadge = mom.disc.warn
      ? ` <span class="badge warn">⚠ N=${mom.disc.N} 상한, d=λ/${(lam_cm * 10 / mom.disc.d_mm).toFixed(1)} (목표 λ/20 미달)</span>`
      : "";
    el.infoBox.innerHTML =
      `Fresnel 수 <b>N_F = ${nF.toFixed(2)}</b> <span style="font-size:11px;color:#6b6b72">(하위헌스-프레넬 앱의 a²/(λz)는 이 값의 4배)</span><br>` +
      `I₀ — 도선 막대 <b>${mom.I0.toFixed(3)}</b> · 하위헌스-프레넬 <b>${huy.I0.toFixed(3)}</b> (입사=1.000)<br>` +
      `S̄ — 도선 막대 <b>${mom.sbar.toFixed(3)}</b> · 하위헌스-프레넬 <b>${huy.sbar.toFixed(3)}</b><br>` +
      `S̄ 상대 차이 <b>${diffPct.toFixed(1)}%</b>` + warnBadge;
  }

  // =====================================================================
  // 8. 상태 흐름 — H/L/λ 슬라이더는 같은 디바운스 안에서 두 모형을 함께 갱신(§27.4)
  // =====================================================================
  function recomputeBoth() {
    const mom = recomputeMoM(state.H_mm, state.L_mm, state.lam_cm);
    const huy = recomputeHuygens(state.H_mm, state.L_mm, state.lam_cm);
    drawMainPlot(mom, huy, state.H_mm);
    updateInfoBox(mom, huy, state.H_mm, state.L_mm, state.lam_cm);
    return { mom, huy };
  }

  let recomputeTimer = null;
  function scheduleRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recomputeBoth, 200);
  }

  // =====================================================================
  // 9. λ 스윕 — 진행률 표시 + S̄ vs λ 로그축 차트(§27.4)
  // =====================================================================
  function logSpace(minV, maxV, n) {
    const arr = new Array(n);
    const logMin = Math.log10(minV), logMax = Math.log10(maxV);
    for (let i = 0; i < n; i++) arr[i] = Math.pow(10, logMin + (logMax - logMin) * i / (n - 1));
    return arr;
  }

  function drawSweepChart(lambdas, sMoM, sHuy) {
    const canvas = el.sweepCanvas;
    const { w, h } = resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const m = { left: 50, right: 16, top: 16, bottom: 30 };
    const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
    const logMin = Math.log10(1), logMax = Math.log10(30);
    let Smax = 0.05;
    for (let i = 0; i < sMoM.length; i++) Smax = Math.max(Smax, sMoM[i], sHuy[i]);
    const px = (lam) => m.left + (Math.log10(lam) - logMin) / (logMax - logMin) * plotW;
    const py = (s) => m.top + (1 - s / Smax) * plotH;

    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(m.left + 0.5, m.top + 0.5, plotW - 1, plotH - 1);

    function drawCurve(color, dash, values) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.8;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < lambdas.length; i++) {
        const x = px(lambdas[i]), y = py(values[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawCurve("#2f6feb", null, sMoM);
    drawCurve("#c0392b", [5, 4], sHuy);

    ctx.fillStyle = "#5a5a62"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("파장 λ (cm, 로그축)", m.left + plotW / 2, h - 4);
    ctx.textAlign = "left"; ctx.fillText("1", m.left, h - 16);
    ctx.textAlign = "right"; ctx.fillText("30", m.left + plotW, h - 16);
    ctx.save(); ctx.translate(14, m.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.fillText("S̄ (파랑=도선 막대, 빨강=하위헌스-프레넬)", 0, 0); ctx.restore();
  }

  async function runSweep() {
    const lambdas = logSpace(1, 30, 10);
    const sMoM = [], sHuy = [];
    el.sweepPanel.classList.add("show");
    for (let i = 0; i < lambdas.length; i++) {
      el.sweepProgress.textContent = `진행 중... (${i + 1}/${lambdas.length}, λ=${lambdas[i].toFixed(2)}cm)`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const mom = recomputeMoM(state.H_mm, state.L_mm, lambdas[i]);
      const huy = recomputeHuygens(state.H_mm, state.L_mm, lambdas[i]);
      sMoM.push(mom.sbar); sHuy.push(huy.sbar);
    }
    el.sweepProgress.textContent = `완료 (H=${state.H_mm}mm, L=${state.L_mm}mm 기준, λ=1~30cm 10점)`;
    drawSweepChart(lambdas, sMoM, sHuy);
    recomputeBoth();   // 스윕 중 state.H/L/λ는 안 바뀌지만, 메인 플롯 λ 슬라이더 값 기준으로 재동기화
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
      // H=100,λ=12cm → d_target=min(1,6)=1mm(§26.1 정정), ceil(100/1)+1=101,
      // 상한(400) 안 걸림 → 경고 없음
      const r3 = computeDiscretization(100, 12);
      console.assert(r3.N === 101 && !r3.warn,
        "computeDiscretization(100,12cm): 상한 안 걸림, 경고 없음");
    }
    {
      const r = recomputeMoM(200, 300, 1);
      console.assert(r.sbar >= 0 && r.sbar <= 0.08 + 1e-6,
        "recomputeMoM(H=200,L=300,λ=1cm): S̄가 0.08 이하(§28.1 기준4, 이산화 누설 없음)");
      console.log("[검증] recomputeMoM 기본 케이스 S̄=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
    }
    {
      const r = recomputeHuygens(200, 300, 1);
      console.assert(Math.abs(r.sbar - 0.057) < 0.01,
        "recomputeHuygens(H=200,L=300,λ=1cm): S̄≈0.057(§26.2 수렴표 해석식 기준)");
      console.log("[검증] recomputeHuygens 기본 케이스 S̄=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
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

  function applyUrlParams() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('H')) state.H_mm = parseFloat(p.get('H'));
    if (p.has('L')) state.L_mm = parseFloat(p.get('L'));
    if (p.has('lam')) state.lam_cm = parseFloat(p.get('lam'));
  }

  el.hSlider.addEventListener("input", function () {
    state.H_mm = parseFloat(this.value);
    syncLabels();
    scheduleRecompute();
  });
  el.lSlider.addEventListener("input", function () {
    state.L_mm = parseFloat(this.value);
    syncLabels();
    scheduleRecompute();
  });
  el.lamSlider.addEventListener("input", function () {
    state.lam_cm = parseFloat(this.value);
    syncLabels();
    scheduleRecompute();
  });

  const PRESETS = {
    preset1Btn: { lam_cm: 2 },
    preset2Btn: { lam_cm: 5 },
    preset3Btn: { lam_cm: 20 },
  };
  Object.keys(PRESETS).forEach((id) => {
    el[id].addEventListener("click", () => {
      state.H_mm = 100; state.L_mm = 300; state.lam_cm = PRESETS[id].lam_cm;
      setSlidersFromState();
      recomputeBoth();
    });
  });

  el.sweepBtn.addEventListener("click", () => { runSweep(); });

  window.addEventListener("resize", () => { drawMainPlot === undefined || recomputeBoth(); });

  // =====================================================================
  // 시작
  // =====================================================================
  applyUrlParams();
  setSlidersFromState();
  selfCheck();
  recomputeBoth();

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
})();
