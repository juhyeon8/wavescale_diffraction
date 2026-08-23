(function () {
  "use strict";

  // =====================================================================
  // 0. 상수
  // =====================================================================
  const TWO_PI = Math.PI * 2;
  const NUM_POINTS = 241;   // 메인 플롯 표본 수(§27.2)
  const SWEEP_POINTS = 24;  // λ 스윕 표본 수(§34.1). 이 한 줄만 10으로 되돌리면 이전 동작 복귀.
  const CROSSING_LAM_MIN = 2.0;  // 교차 탐색 하한 cm(§34.3) — 이 아래 부호 변화는 이산화 기인 가능
  const LABEL_MOM = "입사파-산란파 중첩";   // §35 범례 라벨 단일 출처
  const LABEL_HUY = "하위헌스-프레넬";

  // §36 캔버스 라벨 언어 — 화면과 PNG에 동시에 적용된다(패널 DOM은 항상 한국어).
  // 하이픈은 두 범례 모두 ASCII 하이픈-마이너스(U+002D)로 통일한다.
  const PLOT_LABELS = {
    ko: {
      mainX: "스크린 위치 y (mm)",
      mainY: "I / I₀(입사)",
      mom: LABEL_MOM,
      huy: LABEL_HUY,
      sweepX: "파장 λ (cm, 로그축)",
      sweepY: "Īₛ (그림자 영역의 평균 상대 세기)",
      momSolid: LABEL_MOM + " (실선)",
      huyDashed: LABEL_HUY + " (점선)",
    },
    en: {
      mainX: "Position on screen y (mm)",
      mainY: "I(y) / I₀",
      mom: "Incident - scattered superposition",
      huy: "Huygens-Fresnel",
      sweepX: "Wavelength λ (cm, log scale)",
      sweepY: "Īₛ (shadow mean intensity)",
      momSolid: "Incident - scattered superposition (solid)",
      huyDashed: "Huygens-Fresnel (dashed)",
    },
  };

  function normLang(v) { return (v === 'en') ? 'en' : 'ko'; }   // 그 외 값은 조용히 ko
  function plotLabels() { return PLOT_LABELS[normLang(state.lang)]; }

  // =====================================================================
  // 1. 상태
  // =====================================================================
  const state = {
    H_mm: 100, L_mm: 300, lam_cm: 1,
    fontScale: 1.0,   // 글자 크기 배율 — 글자와 축 여백에만 적용(곡선 굵기·마커는 불변)
    lang: 'ko',       // 'ko' | 'en' — 캔버스 축 제목·범례 언어(패널 DOM은 항상 한국어)
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
    // 누설이 Īₛ를 과대평가함(수렴 기준값은 d=1mm/λ30에서 실측). 1mm 상한을
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

  // 그림자 채움률 Īₛ(§19 로직 재사용) — 순수 함수
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

  // targetCanvas/exportW/exportH를 생략하면 화면용 el.mainCanvas에 기존과 동일하게 그림.
  // exportW/exportH를 주면 그 픽셀 크기의(화면 표시와 무관한) 오프스크린 캔버스에
  // 동일한 그림을 그리되, 폰트·여백·선굵기를 EXPORT_BASE_W 대비 비율(scale)만큼 키워
  // 어느 해상도로 내보내도 글자 비율이 같게 유지한다(§4-1).
  function drawMainPlot(mom, huy, H_mm, targetCanvas, exportW, exportH) {
    // ---- 인쇄용 표시 크기 상수(캡처해 보고 다시 조정) ----
    const TICK_PX = 18;         // 축 눈금 숫자
    const AXIS_TITLE_PX = 20;   // 축 제목(스크린 위치 y, I/I₀)
    const LEGEND_PX = 18;       // 좌상단 범례(파란선/빨간 점선 설명)
    const EXPORT_BASE_W = 1200; // PNG 내보내기 스케일 기준 폭 — 이 폭에서 scale=1
    const LB = plotLabels();

    const canvas = targetCanvas || el.mainCanvas;
    let w, h, scale;
    if (exportW && exportH) {
      canvas.width = exportW;
      canvas.height = exportH;
      w = exportW; h = exportH;
      scale = exportW / EXPORT_BASE_W;
    } else {
      ({ w, h } = resizeCanvas(canvas));
      scale = 1;
    }
    // 글자용 배율 — 글자를 키우면 축 라벨이 놓일 여백도 같이 넓혀야 잘리지 않는다.
    // 곡선 굵기·점선·음영은 scale만 쓰므로 그래프 그림 자체는 변하지 않는다.
    const ts = scale * state.fontScale;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);   // PNG 저장 시 배경이 비지 않게

    const m = { left: 76 * ts, right: 24 * scale, top: 24 * scale, bottom: 58 * ts };
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
    ctx.strokeStyle = "#2f6feb"; ctx.lineWidth = 1.8 * scale; ctx.beginPath();
    for (let i = 0; i < mom.ys_mm.length; i++) {
      const x = px(mom.ys_mm[i]), y = py(mom.Iy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 하위헌스-프레넬 곡선(빨강 점선)
    ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 1.8 * scale; ctx.setLineDash([5 * scale, 4 * scale]); ctx.beginPath();
    for (let i = 0; i < huy.ys_mm.length; i++) {
      const x = px(huy.ys_mm[i]), y = py(huy.Iy[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 축 라벨
    ctx.fillStyle = "#5a5a62"; ctx.font = `${AXIS_TITLE_PX * ts}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(LB.mainX, m.left + plotW / 2, h - 8 * ts);
    ctx.save(); ctx.translate(24 * ts, m.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(LB.mainY, 0, 0); ctx.restore();

    ctx.font = `${TICK_PX * ts}px sans-serif`;
    ctx.textAlign = "left"; ctx.fillText((-halfRange).toFixed(0), m.left, h - 32 * ts);
    ctx.textAlign = "right"; ctx.fillText(halfRange.toFixed(0), m.left + plotW, h - 32 * ts);
    ctx.textAlign = "center";
    ctx.fillText((-H_mm / 2).toFixed(0), shadeX0, h - 32 * ts);
    ctx.fillText((H_mm / 2).toFixed(0), shadeX1, h - 32 * ts);
    ctx.textAlign = "right";
    for (let v = 0; v <= Imax; v++) {
      ctx.fillText(v.toFixed(0), m.left - 8 * ts, py(v) + 4 * ts);
    }

    // 범례
    ctx.font = `${LEGEND_PX * ts}px sans-serif`; ctx.textAlign = "left";
    ctx.strokeStyle = "#2f6feb"; ctx.setLineDash([]); ctx.lineWidth = 1.8 * scale;
    ctx.beginPath(); ctx.moveTo(m.left + 10 * ts, m.top + 16 * ts); ctx.lineTo(m.left + 44 * ts, m.top + 16 * ts); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillText(LB.mom, m.left + 50 * ts, m.top + 22 * ts);
    ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5 * scale, 4 * scale]);
    ctx.beginPath(); ctx.moveTo(m.left + 10 * ts, m.top + 42 * ts); ctx.lineTo(m.left + 44 * ts, m.top + 42 * ts); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(LB.huy, m.left + 50 * ts, m.top + 48 * ts);
  }

  function updateInfoBox(mom, huy, H_mm, L_mm, lam_cm) {
    const nF = fresnelNumber(H_mm, L_mm, lam_cm);
    const diffPct = Math.abs(mom.sbar - huy.sbar) / Math.max(huy.sbar, 1e-9) * 100;
    const warnBadge = mom.disc.warn
      ? ` <span class="badge warn">⚠ N=${mom.disc.N} 상한, d=λ/${(lam_cm * 10 / mom.disc.d_mm).toFixed(1)} (목표 λ/20 미달)</span>`
      : "";
    el.infoBox.innerHTML =
      `Fresnel 수 <b>N_F = ${nF.toFixed(2)}</b> <span style="font-size:11px;color:#6b6b72">(하위헌스-프레넬 앱의 a²/(λz)는 이 값의 4배)</span><br>` +
      `I₀ — ${LABEL_MOM} <b>${mom.I0.toFixed(3)}</b> · 하위헌스-프레넬 <b>${huy.I0.toFixed(3)}</b> (입사=1.000)<br>` +
      `Īₛ — ${LABEL_MOM} <b>${mom.sbar.toFixed(3)}</b> · 하위헌스-프레넬 <b>${huy.sbar.toFixed(3)}</b><br>` +
      `Īₛ 상대 차이 <b>${diffPct.toFixed(1)}%</b>` + warnBadge;
  }

  // =====================================================================
  // 8. 상태 흐름 — H/L/λ 슬라이더는 같은 디바운스 안에서 두 모형을 함께 갱신(§27.4)
  // =====================================================================
  let lastPlot = null;   // 마지막 계산 결과 — 글자 크기만 바꿀 때 재계산 없이 다시 그리려고 보관

  function recomputeBoth() {
    const mom = recomputeMoM(state.H_mm, state.L_mm, state.lam_cm);
    const huy = recomputeHuygens(state.H_mm, state.L_mm, state.lam_cm);
    drawMainPlot(mom, huy, state.H_mm);
    updateInfoBox(mom, huy, state.H_mm, state.L_mm, state.lam_cm);
    lastPlot = { mom, huy, H_mm: state.H_mm };
    return { mom, huy };
  }

  let recomputeTimer = null;
  function scheduleRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(recomputeBoth, 200);
  }

  // =====================================================================
  // 9. λ 스윕 — 진행률 표시 + Īₛ vs λ 로그축 차트(§27.4)
  // =====================================================================
  function logSpace(minV, maxV, n) {
    const arr = new Array(n);
    const logMin = Math.log10(minV), logMax = Math.log10(maxV);
    for (let i = 0; i < n; i++) arr[i] = Math.pow(10, logMin + (logMax - logMin) * i / (n - 1));
    return arr;
  }

  // ---------------------------------------------------------------------
  // 9.1 두 모형 Īₛ 곡선의 교차점 검출(§34) — 물리 코어는 "호출만" 하는 순수 함수들.
  //     recomputeMoM/recomputeHuygens 및 그 하위 수치 경로는 일절 수정하지 않는다.
  // ---------------------------------------------------------------------

  // 같은 (H, L, λ)의 중복 계산을 막는 캐시. 이분법이 스윕 격자점을 다시 밟을 때 특히 효과.
  const sbarCache = new Map();
  function sbarPairAt(H_mm, L_mm, lam_cm) {
    const key = `${H_mm}|${L_mm}|${lam_cm.toFixed(4)}`;
    const hit = sbarCache.get(key);
    if (hit) return hit;
    const v = {
      mom: recomputeMoM(H_mm, L_mm, lam_cm).sbar,
      huy: recomputeHuygens(H_mm, L_mm, lam_cm).sbar,
    };
    sbarCache.set(key, v);
    return v;
  }

  // diff = Īₛ_MoM - Īₛ_Huy의 부호가 바뀌는 "모든" 구간을 반환(하나만 반환하지 않는다).
  function findSignChanges(lambdas, sMoM, sHuy) {
    const out = [];
    for (let i = 0; i + 1 < lambdas.length; i++) {
      const dLo = sMoM[i] - sHuy[i];
      const dHi = sMoM[i + 1] - sHuy[i + 1];
      if (dLo === 0 || (dLo < 0) !== (dHi < 0)) {
        out.push({ iLo: i, iHi: i + 1, lamLo: lambdas[i], lamHi: lambdas[i + 1] });
      }
    }
    return out;
  }

  // 이분법. 매 반복에서 두 모형을 재평가해 diff의 부호를 다시 본다.
  // 최대 25회 또는 구간폭 < tol_cm에서 종료. sbar는 수렴점에서의 두 모형 평균.
  function refineCrossing(H_mm, L_mm, lamLo, lamHi, tol_cm = 1e-3) {
    let lo = lamLo, hi = lamHi;
    const vLo = sbarPairAt(H_mm, L_mm, lo);
    let dLo = vLo.mom - vLo.huy;
    for (let it = 0; it < 25 && (hi - lo) >= tol_cm; it++) {
      const mid = 0.5 * (lo + hi);
      const vMid = sbarPairAt(H_mm, L_mm, mid);
      const dMid = vMid.mom - vMid.huy;
      if ((dLo < 0) === (dMid < 0)) { lo = mid; dLo = dMid; } else { hi = mid; }
    }
    const lam_cm = 0.5 * (lo + hi);
    const v = sbarPairAt(H_mm, L_mm, lam_cm);
    return { lam_cm, sbar: (v.mom + v.huy) / 2 };
  }

  // 부호 변화 구간 중 하단 λ가 CROSSING_LAM_MIN 미만인 것은 근 목록에서 제외하고 경고만 남긴다.
  // (§34.3 근거: computeDiscretization의 d_target=min(1, λ/20)과 N≤400 상한 때문에
  //  λ<2cm에서 N이 계단식으로 변해 diff(λ)가 불연속이 된다.)
  function findCrossings(H_mm, L_mm, lambdas, sMoM, sHuy) {
    const roots = [];
    for (const c of findSignChanges(lambdas, sMoM, sHuy)) {
      if (c.lamLo < CROSSING_LAM_MIN) {
        console.warn(
          `[교차점] λ=${c.lamLo.toFixed(2)}~${c.lamHi.toFixed(2)}cm 구간의 부호 변화는 ` +
          `이산화 기인 가능(λ<${CROSSING_LAM_MIN}cm에서 N이 계단식으로 변함) — 근 목록에서 제외`);
        continue;
      }
      roots.push(refineCrossing(H_mm, L_mm, c.lamLo, c.lamHi));
    }
    return roots;
  }

  function formatCrossings(crossings, H_mm, L_mm) {
    if (!crossings.length) return "구간 내 교차 없음";
    return "교차점: " + crossings.map((c) =>
      `λ* = ${c.lam_cm.toFixed(2)} cm, Īₛ* = ${c.sbar.toFixed(3)} ` +
      `(H/λ* = ${(H_mm / (c.lam_cm * 10)).toFixed(2)}, ` +
      `N_F = ${fresnelNumber(H_mm, L_mm, c.lam_cm).toFixed(3)})`
    ).join(" · ");
  }

  function buildSweepCsv(lambdas, sMoM, sHuy) {
    const lines = ["λ_cm,Is_MoM,Is_Huy,diff"];
    for (let i = 0; i < lambdas.length; i++) {
      lines.push([
        lambdas[i].toFixed(4), sMoM[i].toFixed(6), sHuy[i].toFixed(6),
        (sMoM[i] - sHuy[i]).toFixed(6),
      ].join(","));
    }
    return lines.join("\n");
  }

  // targetCanvas/exportW/exportH를 생략하면 화면용 el.sweepCanvas에 기존과 동일하게 그림.
  // exportW/exportH를 주면 그 픽셀 크기의 오프스크린 캔버스에 같은 그림을 그리되,
  // 폰트·여백·선굵기를 SW_EXPORT_BASE_W 대비 비율(scale)만큼 키운다(drawMainPlot과 동일 규칙).
  // meta = { H_mm, L_mm } — 주면 우상단에 조건 캡션을 표시(생략 가능).
  function drawSweepChart(lambdas, sMoM, sHuy, crossings, meta, targetCanvas, exportW, exportH) {
    // ---- 인쇄용 표시 크기 상수(캡처해 보고 다시 조정) ----
    const SW_TICK_PX = 18;          // 축 눈금 숫자
    const SW_AXIS_TITLE_PX = 20;    // 축 제목
    const SW_LEGEND_PX = 18;        // 범례
    const SW_CROSS_LABEL_PX = 16;   // 교차점 수치 라벨
    const SW_CAPTION_PX = 16;       // 우상단 H·L 캡션
    const SW_EXPORT_BASE_W = 1200;  // 이 폭에서 scale=1 (drawMainPlot의 EXPORT_BASE_W와 동일)
    const SW_SCREEN_SCALE = 0.65;   // 화면(38% 높이 패널)용 축소 배율
    const LB = plotLabels();

    const canvas = targetCanvas || el.sweepCanvas;
    let w, h, scale;
    if (exportW && exportH) {
      canvas.width = exportW;
      canvas.height = exportH;
      w = exportW; h = exportH;
      scale = exportW / SW_EXPORT_BASE_W;
    } else {
      ({ w, h } = resizeCanvas(canvas));
      scale = SW_SCREEN_SCALE;
    }
    const ts = scale * state.fontScale;   // 글자용 배율(drawMainPlot과 동일 규칙)
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);   // PNG 저장 시 배경이 비지 않게

    const m = { left: 76 * ts, right: 24 * scale, top: 24 * scale, bottom: 58 * ts };
    const plotW = w - m.left - m.right, plotH = h - m.top - m.bottom;
    const logMin = Math.log10(1), logMax = Math.log10(30);
    let Smax = 0.05;
    for (let i = 0; i < sMoM.length; i++) Smax = Math.max(Smax, sMoM[i], sHuy[i]);
    const px = (lam) => m.left + (Math.log10(lam) - logMin) / (logMax - logMin) * plotW;
    const py = (s) => m.top + (1 - s / Smax) * plotH;

    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(m.left + 0.5, m.top + 0.5, plotW - 1, plotH - 1);

    // y축 눈금 — 0부터 Smax까지 0.1 간격 눈금선 + 좌측 숫자 라벨(§34.4)
    ctx.font = `${SW_TICK_PX * ts}px sans-serif`;
    for (let s = 0; s <= Smax + 1e-9; s += 0.1) {
      const y = py(s);
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + plotW, y); ctx.stroke();
      ctx.fillStyle = "#5a5a62"; ctx.textAlign = "right";
      ctx.fillText(s.toFixed(1), m.left - 8 * ts, y + 6 * ts);
    }

    function drawCurve(color, dash, values) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.8 * scale;
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
    drawCurve("#c0392b", [5 * scale, 4 * scale], sHuy);

    // 교차점 마커 — 십자 보조선(점선, 회색) + 원 마커, 첫 근에는 수치 라벨(§34.4)
    (crossings || []).forEach((c, idx) => {
      const cx = px(c.lam_cm), cy = py(c.sbar);
      ctx.strokeStyle = "#999"; ctx.lineWidth = 1 * scale; ctx.setLineDash([3 * scale, 3 * scale]);
      ctx.beginPath();
      ctx.moveTo(cx, m.top); ctx.lineTo(cx, m.top + plotH);
      ctx.moveTo(m.left, cy); ctx.lineTo(m.left + plotW, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath(); ctx.arc(cx, cy, 4 * scale, 0, TWO_PI);
      ctx.fillStyle = "#111"; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * scale; ctx.stroke();

      if (idx === 0) {
        const label = `λ* = ${c.lam_cm.toFixed(2)} cm, Īₛ* = ${c.sbar.toFixed(3)}`;
        ctx.font = `${SW_CROSS_LABEL_PX * ts}px sans-serif`; ctx.fillStyle = "#111";
        const flip = cx + 10 * ts + ctx.measureText(label).width > m.left + plotW;
        ctx.textAlign = flip ? "right" : "left";
        ctx.fillText(label, cx + (flip ? -10 * ts : 10 * ts), cy - 10 * ts);
      }
    });

    ctx.fillStyle = "#5a5a62"; ctx.font = `${SW_AXIS_TITLE_PX * ts}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(LB.sweepX, m.left + plotW / 2, h - 8 * ts);
    // x축 눈금 라벨 — 로그축이므로 1,2,5,10,20,30에 배치(§34.4)
    ctx.font = `${SW_TICK_PX * ts}px sans-serif`;
    [1, 2, 5, 10, 20, 30].forEach((lam) => {
      const x = px(lam);
      ctx.textAlign = lam === 1 ? "left" : (lam === 30 ? "right" : "center");
      ctx.fillText(String(lam), x, h - 32 * ts);
    });
    ctx.save(); ctx.translate(24 * ts, m.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = `${SW_AXIS_TITLE_PX * ts}px sans-serif`;
    ctx.textAlign = "center"; ctx.fillText(LB.sweepY, 0, 0); ctx.restore();

    // 범례 — 선 종류로 두 모형을 구분(drawMainPlot과 동일 형식)
    ctx.font = `${SW_LEGEND_PX * ts}px sans-serif`; ctx.textAlign = "left";
    ctx.strokeStyle = "#2f6feb"; ctx.setLineDash([]); ctx.lineWidth = 1.8 * scale;
    ctx.beginPath(); ctx.moveTo(m.left + 10 * ts, m.top + 16 * ts); ctx.lineTo(m.left + 44 * ts, m.top + 16 * ts); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillText(LB.momSolid, m.left + 50 * ts, m.top + 22 * ts);
    ctx.strokeStyle = "#c0392b"; ctx.setLineDash([5 * scale, 4 * scale]);
    ctx.beginPath(); ctx.moveTo(m.left + 10 * ts, m.top + 42 * ts); ctx.lineTo(m.left + 44 * ts, m.top + 42 * ts); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(LB.huyDashed, m.left + 50 * ts, m.top + 48 * ts);

    // 조건 캡션(우상단) — 스윕을 실행한 시점의 H·L
    if (meta) {
      ctx.font = `${SW_CAPTION_PX * ts}px sans-serif`; ctx.fillStyle = "#6b6b72"; ctx.textAlign = "right";
      ctx.fillText(`H = ${meta.H_mm} mm, L = ${meta.L_mm} mm`, m.left + plotW - 10 * ts, m.top + 22 * ts);
    }
  }

  let lastSweepCsv = "";
  let lastSweep = null;   // { lambdas, sMoM, sHuy, crossings, H_mm, L_mm } — PNG 저장용 스냅샷

  async function runSweep() {
    const lambdas = logSpace(1, 30, SWEEP_POINTS);
    const sMoM = [], sHuy = [];
    el.sweepPanel.classList.add("show");
    el.sweepResult.textContent = "";
    for (let i = 0; i < lambdas.length; i++) {
      el.sweepProgress.textContent = `진행 중... (${i + 1}/${lambdas.length}, λ=${lambdas[i].toFixed(2)}cm)`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const v = sbarPairAt(state.H_mm, state.L_mm, lambdas[i]);
      sMoM.push(v.mom); sHuy.push(v.huy);
    }
    el.sweepProgress.textContent = "교차점 탐색 중...";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const crossings = findCrossings(state.H_mm, state.L_mm, lambdas, sMoM, sHuy);

    el.sweepProgress.textContent =
      `완료 (H=${state.H_mm}mm, L=${state.L_mm}mm 기준, λ=1~30cm ${SWEEP_POINTS}점)`;
    el.sweepResult.textContent = formatCrossings(crossings, state.H_mm, state.L_mm);
    drawSweepChart(lambdas, sMoM, sHuy, crossings, { H_mm: state.H_mm, L_mm: state.L_mm });

    lastSweepCsv = buildSweepCsv(lambdas, sMoM, sHuy);
    lastSweep = { lambdas, sMoM, sHuy, crossings, H_mm: state.H_mm, L_mm: state.L_mm };
    el.exportSweepPngBtn.disabled = false;
    console.log(`[스윕 CSV] H=${state.H_mm}mm, L=${state.L_mm}mm\n${lastSweepCsv}`);
    recomputeBoth();   // 스윕 중 state.H/L/λ는 안 바뀌지만, 메인 플롯 λ 슬라이더 값 기준으로 재동기화
  }

  // 클립보드 복사 — file://에서 navigator.clipboard가 막히는 경우가 있어 textarea 폴백을 둔다.
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* 조용히 무시 */ }
    document.body.removeChild(ta);
  }

  // =====================================================================
  // 콘솔 자가검증(마지막에 호출)
  // =====================================================================
  function selfCheck() {
    console.log("[검증] J0(1)=", besselJ0(1).toFixed(6), "(기대 0.765198)");
    { // §36 라벨 언어
      console.assert(normLang('zz') === 'ko' && normLang('en') === 'en', "normLang 폴백");
      console.assert(!/[\uAC00-\uD7A3\u3130-\u318F\u1100-\u11FF]/.test(
        Object.values(PLOT_LABELS.en).join("")), "영문 라벨에 한글 없음");
      console.assert(PLOT_LABELS.ko.mom === LABEL_MOM, "ko 범례는 LABEL_MOM 단일 출처");
    }
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
        "recomputeMoM(H=200,L=300,λ=1cm): Īₛ가 0.08 이하(§28.1 기준4, 이산화 누설 없음)");
      console.log("[검증] recomputeMoM 기본 케이스 Īₛ=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
    }
    {
      const r = recomputeHuygens(200, 300, 1);
      console.assert(Math.abs(r.sbar - 0.057) < 0.01,
        "recomputeHuygens(H=200,L=300,λ=1cm): Īₛ≈0.057(§26.2 수렴표 해석식 기준)");
      console.log("[검증] recomputeHuygens 기본 케이스 Īₛ=", r.sbar.toFixed(4), "I0=", r.I0.toFixed(4));
    }
    // §34 교차점 검출 A~D. 네 케이스 모두 24점 스윕 + 이분법이라 합쳐서 수 초가 걸린다.
    // 첫 렌더를 막지 않도록 뒤로 미룬다(assert는 매 로드마다 그대로 실행됨).
    setTimeout(function () {
      function crossingsOf(H, L) {
        const lambdas = logSpace(1, 30, SWEEP_POINTS);
        const sM = [], sH = [];
        for (let i = 0; i < lambdas.length; i++) {
          const v = sbarPairAt(H, L, lambdas[i]);
          sM.push(v.mom); sH.push(v.huy);
        }
        return findCrossings(H, L, lambdas, sM, sH);
      }
      [
        { id: "A", H: 125, L: 1000, lam: 4.19, sbar: 0.370 },
        { id: "B", H: 100, L: 300,  lam: 4.17, sbar: 0.188 },
        { id: "C", H: 200, L: 1000, lam: 5.85, sbar: 0.222 },
      ].forEach(function (c) {
        const r = crossingsOf(c.H, c.L);
        console.assert(r.length >= 1, `[§34-${c.id}] H=${c.H},L=${c.L}: 교차점이 검출되어야 함`);
        if (!r.length) return;
        console.assert(Math.abs(r[0].lam_cm - c.lam) <= 0.05,
          `[§34-${c.id}] H=${c.H},L=${c.L}: λ*=${r[0].lam_cm.toFixed(3)}cm (기대 ${c.lam}±0.05)`);
        console.assert(Math.abs(r[0].sbar - c.sbar) <= 0.005,
          `[§34-${c.id}] H=${c.H},L=${c.L}: Īₛ*=${r[0].sbar.toFixed(4)} (기대 ${c.sbar}±0.005)`);
        console.log(`[검증] §34-${c.id} H=${c.H},L=${c.L} → λ*=${r[0].lam_cm.toFixed(4)}cm, ` +
          `Īₛ*=${r[0].sbar.toFixed(4)} (근 ${r.length}개)`);
      });
      {
        const r = crossingsOf(125, 300);
        console.assert(r.length >= 2,
          `[§34-D] H=125,L=300: 탐색 구간에서 교차점 2개 이상이어야 함 (실제 ${r.length}개)`);
        console.log("[검증] §34-D H=125,L=300 → 근 " +
          r.map((x) => `λ*=${x.lam_cm.toFixed(4)}cm(Īₛ*=${x.sbar.toFixed(4)})`).join(", "));
      }
    }, 0);
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
    sweepResult: document.getElementById("sweepResult"),
    csvCopyBtn: document.getElementById("csvCopyBtn"),
    hSlider: document.getElementById("hSlider"), hVal: document.getElementById("hVal"),
    lSlider: document.getElementById("lSlider"), lVal: document.getElementById("lVal"),
    lamSlider: document.getElementById("lamSlider"), lamVal: document.getElementById("lamVal"),
    preset1Btn: document.getElementById("preset1Btn"),
    preset2Btn: document.getElementById("preset2Btn"),
    preset3Btn: document.getElementById("preset3Btn"),
    infoBox: document.getElementById("infoBox"),
    fontSlider: document.getElementById("fontSlider"), fontVal: document.getElementById("fontVal"),
    resSelect: document.getElementById("resSelect"),
    exportPngBtn: document.getElementById("exportPngBtn"),
    exportSweepPngBtn: document.getElementById("exportSweepPngBtn"),
    exportStatus: document.getElementById("exportStatus"),
    langEnCheck: document.getElementById("langEnCheck"),
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
    if (p.has('lang')) state.lang = normLang(p.get('lang'));
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

  el.csvCopyBtn.addEventListener("click", () => {
    if (!lastSweepCsv) return;
    copyToClipboard(lastSweepCsv);
    const old = el.csvCopyBtn.textContent;
    el.csvCopyBtn.textContent = "복사됨";
    setTimeout(() => { el.csvCopyBtn.textContent = old; }, 1200);
  });

  // §36 라벨 언어 지속 — 'capture.lang'과 별도 키다(캡처 도구 동작에 영향을 주지 않기 위해).
  const LANG_KEY = 'comparePrint.lang';

  function loadLang() {
    try {
      const raw = window.localStorage.getItem(LANG_KEY);
      return (raw === null) ? 'ko' : normLang(raw);
    } catch (e) { return 'ko'; }   // file://에서 저장소가 막혀도 부팅은 성공해야 한다
  }

  function saveLang(v) {
    try { window.localStorage.setItem(LANG_KEY, String(v)); } catch (e) { /* 무시 */ }
  }

  // 재계산 없이 스냅샷만 다시 그린다(글자 크기 전환과 같은 성질).
  function applyLang(v, persist) {
    state.lang = normLang(v);
    el.langEnCheck.checked = (state.lang === 'en');
    if (persist) saveLang(state.lang);
    redrawCharts();
  }

  // 글자 크기·라벨 언어 — 물리량이 바뀌는 게 아니므로 재계산 없이
  // lastPlot·lastSweep 스냅샷으로 두 차트를 다시 그리기만 한다.
  function redrawCharts() {
    if (lastPlot) drawMainPlot(lastPlot.mom, lastPlot.huy, lastPlot.H_mm);
    if (lastSweep) {
      drawSweepChart(lastSweep.lambdas, lastSweep.sMoM, lastSweep.sHuy, lastSweep.crossings,
        { H_mm: lastSweep.H_mm, L_mm: lastSweep.L_mm });
    }
  }

  el.fontSlider.addEventListener("input", function () {
    state.fontScale = parseFloat(this.value);
    el.fontVal.textContent = state.fontScale.toFixed(1) + "배";
    redrawCharts();
  });

  el.langEnCheck.addEventListener("change", function () {
    applyLang(this.checked ? 'en' : 'ko', true);
  });

  window.addEventListener("resize", () => { drawMainPlot === undefined || recomputeBoth(); });

  // =====================================================================
  // 10. PNG 내보내기(인쇄용) — 화면과 별개로 고정 해상도 오프스크린 캔버스에 재렌더(§4)
  // =====================================================================
  function formatLamForFilename(lam_cm) {
    return Number.isInteger(lam_cm) ? String(lam_cm) : lam_cm.toFixed(1).replace(".", "p");
  }

  function exportMainPlotPng() {
    const [expW, expH] = el.resSelect.value.split("x").map(Number);
    const { mom, huy } = recomputeBoth();   // 저장 시점 슬라이더 값으로 최신화 후 내보내기
    const offCanvas = document.createElement("canvas");
    drawMainPlot(mom, huy, state.H_mm, offCanvas, expW, expH);
    offCanvas.toBlob((blob) => {
      if (!blob) return;
      const lamStr = formatLamForFilename(state.lam_cm);
      const langSfx = (normLang(state.lang) === 'en') ? "_en" : "";
      const filename = `diffraction_H${state.H_mm.toFixed(0)}_L${state.L_mm.toFixed(0)}_lam${lamStr}_${expW}x${expH}${langSfx}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const mb = blob.size / (1024 * 1024);
      el.exportStatus.textContent = `저장됨 · ${filename} · 약 ${mb.toFixed(2)} MB`;
    }, "image/png");
  }

  // 스윕 차트는 스윕 실행 시점의 H·L에 묶인 결과이므로 recomputeBoth()로 갱신하지 않고
  // lastSweep 스냅샷을 그대로 다시 그린다.
  function exportSweepPng() {
    if (!lastSweep) return;
    const [expW, expH] = el.resSelect.value.split("x").map(Number);
    const offCanvas = document.createElement("canvas");
    drawSweepChart(lastSweep.lambdas, lastSweep.sMoM, lastSweep.sHuy,
      lastSweep.crossings, { H_mm: lastSweep.H_mm, L_mm: lastSweep.L_mm },
      offCanvas, expW, expH);
    offCanvas.toBlob((blob) => {
      if (!blob) return;
      const langSfx = (normLang(state.lang) === 'en') ? "_en" : "";
      const filename = `sweep_H${lastSweep.H_mm.toFixed(0)}_L${lastSweep.L_mm.toFixed(0)}_lam1to30cm_${expW}x${expH}${langSfx}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const mb = blob.size / (1024 * 1024);
      el.exportStatus.textContent = `저장됨 · ${filename} · 약 ${mb.toFixed(2)} MB`;
    }, "image/png");
  }

  el.exportPngBtn.addEventListener("click", exportMainPlotPng);
  el.exportSweepPngBtn.addEventListener("click", exportSweepPng);

  // =====================================================================
  // 시작
  // =====================================================================
  const hasLangParam = new URLSearchParams(window.location.search).has('lang');
  applyUrlParams();
  if (!hasLangParam) state.lang = loadLang();
  el.langEnCheck.checked = (state.lang === 'en');
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
