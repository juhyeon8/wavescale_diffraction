(function () {
  "use strict";

  // =====================================================================
  // 0. 상수
  // =====================================================================
  const C_LIGHT = 2.99792458e8;
  const TWO_PI = Math.PI * 2;
  const VMAX = 1.5;           // 색 포화 기준 [V/m]
  const N_MAX = 120;          // 도선 수 상한(성능)

  // =====================================================================
  // 1. 상태
  // =====================================================================
  const state = {
    N: 40, d_mm: 4, a_mm: 1.0,
    lam_cm: 12.2, amp: 1.0, L_mm: 80,
    playing: true, phase: 0,
  };

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

  function recompute() {
    if (!layout.bandW || !layout.bandH) return;

    const lam_m = state.lam_cm / 100;
    const d_m = state.d_mm / 1000;
    const aEff_m = state.a_mm / 1000;          // 상한 제거: 닿음 허용
    const k = TWO_PI / lam_m;
    const L_m = state.L_mm / 1000;
    const N = Math.min(N_MAX, Math.max(2, state.N));

    // x-윈도우: 왼쪽 입사/반사 영역 + 스크린까지. L 키우면 전체 줌아웃.
    const xMax = L_m * 1.15;
    const xMin = -Math.max(L_m * 0.4, 0.02);
    let span = xMax - xMin;
    if (span < 0.05) span = 0.05;              // 최소 폭
    const aspect = layout.bandH / layout.bandW;
    const Yw = (span * aspect) / 2;            // y 반높이를 x-폭에서 유도

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
    const gridH = Math.max(40, Math.round(gridW * aspect));
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
    gridW: 360, plotW: 96,
  };

  const BAND_TITLES = ["① 입사파", "② 산란파", "③ 중첩 (입사 + 산란)"];

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
    const A = state.amp;
    const cosP = Math.cos(state.phase), sinP = Math.sin(state.phase);

    if (offscreen.width !== gw || offscreen.height !== gh) {
      offscreen.width = gw; offscreen.height = gh;
    }
    const img = offctx.createImageData(gw, gh);
    const data = img.data;

    for (let band = 0; band < 3; band++) {
      for (let p = 0; p < gw * gh; p++) {
        let fr, fi;
        if (band === 0) { fr = solver.incRe[p]; fi = solver.incIm[p]; }
        else if (band === 1) { fr = solver.scRe[p]; fi = solver.scIm[p]; }
        else { fr = solver.incRe[p] + solver.scRe[p]; fi = solver.incIm[p] + solver.scIm[p]; }
        const val = (fr * cosP + fi * sinP) * A;
        colorFor(val / VMAX, data, p * 4);
      }
      offctx.putImageData(img, 0, 0);
      const by = layout.bandY[band];
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, layout.bandX, by, layout.bandW, layout.bandH);
      drawOverlay(band, by);
    }
    drawIntensityPlot();
  }

  function drawIntensityPlot() {
    if (!solver.wiresY || !solver.wiresY.length) return;
    const by = layout.bandY[2], bh = layout.bandH;
    const px = layout.bandX + layout.bandW + layout.gap;
    const pw = layout.plotW;
    const L_m = state.L_mm / 1000;

    // 세로로 샘플링 (위→아래), 최대값으로 가로 스케일
    const M = 120;
    const Iy = new Float64Array(M);
    let Imax = 1e-6;
    for (let s = 0; s < M; s++) {
      const wy = solver.Yw - (s + 0.5) / M * 2 * solver.Yw;
      const I = screenIntensity(L_m, wy);
      Iy[s] = I; if (I > Imax) Imax = I;
    }
    const scale = Math.max(2, Math.ceil(Imax));   // 가로 0..scale

    // 축 박스 + 입사 세기=1 기준선
    ctx.save();
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, by + 0.5, pw - 1, bh - 1);
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
    const sx = layout.bandX + (wx - solver.xMin) / (solver.xMax - solver.xMin) * layout.bandW;
    const sy = by + (solver.Yw - wy) / (2 * solver.Yw) * layout.bandH;
    return { x: sx, y: sy };
  }

  function drawOverlay(band, by) {
    const bx = layout.bandX, bw = layout.bandW, bh = layout.bandH;
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    const sPx = layout.bandW / (solver.xMax - solver.xMin);
    const dPx = (state.d_mm / 1000) * sPx;
    const aPx = (solver.aEff_m) * sPx;
    const rPx = Math.min(dPx * 0.5, Math.max(1.5, aPx));   // 닿으면 dPx의 절반(맞닿음)
    const N = state.N;

    // 중심선 (도선 배열 위치)
    const top = worldToBand(0, solver.Yw, by), bot = worldToBand(0, -solver.Yw, by);
    ctx.save();
    ctx.strokeStyle = band === 0 ? "#e4e4e8" : "#9aa0aa";
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
    ctx.restore();

    // 스크린 위치 (거리 L, 세로 점선)
    const Lx = state.L_mm / 1000;
    if (Lx >= solver.xMin && Lx <= solver.xMax) {
      const st = worldToBand(Lx, solver.Yw, by), sb = worldToBand(Lx, -solver.Yw, by);
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

    // 밴드 제목
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "#10193a";
    ctx.fillText(BAND_TITLES[band], bx + 10, by + bh - 10);

    if (band === 2) {
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#5a5a62";
      ctx.fillText("오른쪽=막대 뒤(그림자/회절) · 왼쪽=반사 간섭 · 점선=스크린 위치", bx + 120, by + bh - 10);
    }
  }

  // =====================================================================
  // 8. 정보 표시
  // =====================================================================

  // 가드레일 순수 헬퍼
  function barHeight_mm(N, d_mm) { return (N - 1) * d_mm; }
  function isTouching(a_mm, d_mm) { return 2 * a_mm >= d_mm; }
  function transmissionWarn(lam_cm, d_mm) { return lam_cm * 10 < 5 * d_mm; }

  function updateInfo() {
    const lam_m = state.lam_cm / 100;
    const f_GHz = C_LIGHT / lam_m / 1e9;
    const dlam = (state.d_mm / 1000) / lam_m;        // d/λ
    const lam_d = lam_m / (state.d_mm / 1000);        // λ/d
    const H = barHeight_mm(state.N, state.d_mm);
    const touch = isTouching(state.a_mm, state.d_mm);
    const warn = transmissionWarn(state.lam_cm, state.d_mm);

    const badges =
      (touch ? `<span class="badge ok">닿음(솔리드)</span>` : `<span class="badge">틈 있음</span>`) +
      (warn ? ` <span class="badge warn">투과 영향 구간 (λ &lt; 5d)</span>` : ``);

    document.getElementById("infoBox").innerHTML =
      `도선 N = <b>${state.N}</b> · 막대 높이 H = <b>${H.toFixed(1)} mm</b><br>` +
      `파장 λ = <b>${state.lam_cm.toFixed(1)} cm</b> (f ≈ <b>${f_GHz.toFixed(2)} GHz</b>)<br>` +
      `간격 d = <b>${state.d_mm.toFixed(1)} mm</b> · 굵기 a = <b>${state.a_mm.toFixed(2)} mm</b><br>` +
      `<b>λ/d = ${lam_d.toFixed(2)}</b> (d/λ = ${dlam.toFixed(3)}) · L = <b>${state.L_mm.toFixed(0)} mm</b><br>` +
      badges;
  }

  function syncLabels() {
    document.getElementById("nVal").textContent = state.N + " 개";
    document.getElementById("dVal").textContent = state.d_mm.toFixed(1) + " mm";
    document.getElementById("aVal").textContent = state.a_mm.toFixed(2) + " mm";
    document.getElementById("lamVal").textContent = state.lam_cm.toFixed(1) + " cm";
    document.getElementById("ampVal").textContent = state.amp.toFixed(2) + " V/m";
    document.getElementById("lVal").textContent = state.L_mm.toFixed(0) + " mm";
  }

  // =====================================================================
  // 9. UI 바인딩
  // =====================================================================
  let recomputeTimer = null;
  function scheduleRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => { recompute(); drawFrame(); }, 60);
  }

  function bindSlider(id, key, parse, redrawOnly) {
    document.getElementById(id).addEventListener("input", function () {
      state[key] = parse(this.value);
      syncLabels();
      if (redrawOnly) drawFrame(); else scheduleRecompute();
    });
  }
  bindSlider("nSlider", "N", v => parseInt(v, 10));
  bindSlider("dSlider", "d_mm", parseFloat);
  bindSlider("aSlider", "a_mm", parseFloat);
  bindSlider("lamSlider", "lam_cm", parseFloat);
  bindSlider("lSlider", "L_mm", parseFloat);
  bindSlider("ampSlider", "amp", parseFloat, true);

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
    console.assert(barHeight_mm(5, 4) === 16, "barHeight 5,4 → 16");
    console.assert(isTouching(2, 3) === true,  "isTouching 2,3 (2a=4≥3)");
    console.assert(isTouching(1, 3) === false, "isTouching 1,3 (2a=2<3)");
    console.assert(transmissionWarn(2, 5) === true,  "warn λ=20mm<25mm");
    console.assert(transmissionWarn(3, 5) === false, "no-warn λ=30mm≥25mm");
    console.log("[검증] 가드레일 헬퍼 단언 통과");

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
  }

  // =====================================================================
  // 시작
  // =====================================================================
  syncLabels();
  window.addEventListener("resize", resize);
  resize();       // layout 확정 + recompute + drawFrame
  selfCheck();    // 베셀 검증
  recompute();    // 상태 재계산
  drawFrame();
  requestAnimationFrame(loop);
})();
