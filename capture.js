/* 회절 시뮬레이션 — 논문 그림 캡처 도구 (capture.html 전용)
 *
 * index.html을 같은 출처 iframe으로 띄우고, 그 안의 window.__capture(§33) 훅을
 * 호출해 PNG를 받아 부모 쪽에서 저장한다. index.html / style.css / script.js의
 * 화면 UI는 전혀 건드리지 않는다.
 *
 * 구도(iframe 픽셀)는 부모가 고정한다 — 창 크기와 무관하게 재현 가능해야 하므로
 * 미리보기 축소는 CSS transform으로만 하고 iframe의 레이아웃 픽셀은 바꾸지 않는다.
 */
(function () {
  "use strict";

  // 구도 프리셋 — iframe 픽셀 크기를 그대로 고정한다.
  // 역산 공식: bandW = iframe_W − 475, bandH1to1 = iframe_H − 20 (실측으로 검증할 것)
  const VIEW_PRESETS = [
    { key: 'sq', label: '정사각', w: 1275, h: 820, targetBand: [800, 800] },
    { key: 'wide', label: '와이드', w: 1675, h: 470, targetBand: [1200, 450] },
    { key: 'sqtall', label: '여유크롭', w: 1275, h: 900, targetBand: [800, 880] },
  ];
  const KIND_LABEL = { inc: '① 입사파', sc: '② 산란파', total: '③ 중첩', plot: '스크린 세기 그래프' };
  const READY_TIMEOUT = 60000;   // 1:1 모드는 격자가 3배라 recompute가 20초를 넘기도 한다

  const ui = {
    viewPreset: 'sq',
    camera: '1to1',
    capPreset: 's',
    H_mm: 150, L_mm: 100, lam_cm: 12,
    phaseDeg: 0,
  };

  const $ = (id) => document.getElementById(id);
  const sim = $("sim");
  const clip = $("clip");
  let childOK = false;

  // ---------------------------------------------------------------- 유틸
  function busy(on, msg, sub) {
    $("busyMsg").textContent = msg || "계산 중…";
    $("busySub").textContent = sub || "";
    $("busy").classList.toggle("show", !!on);
  }

  function api() {
    // 동일 출처가 아니면(= file://로 연 경우) 접근 자체가 예외를 던진다.
    try {
      const w = sim.contentWindow;
      return (w && w.__capture) ? w.__capture : null;
    } catch (e) {
      return null;
    }
  }

  function requireApi() {
    const a = api();
    if (!a) {
      showBanner("iframe 안의 시뮬레이션에 접근할 수 없습니다 — 로컬 서버로 열었는지 확인하세요"
        + " (file://에서는 동작하지 않습니다).");
      return null;
    }
    return a;
  }

  function showBanner(text) {
    const b = $("anisoBanner");
    b.textContent = text;
    b.classList.add("show");
  }

  function hideBanner() { $("anisoBanner").classList.remove("show"); }

  function currentViewPreset() {
    return VIEW_PRESETS.find((p) => p.key === ui.viewPreset) || VIEW_PRESETS[0];
  }

  // ------------------------------------------------- iframe 크기 · 미리보기 축소
  function fitPreview() {
    const vp = currentViewPreset();
    const stage = $("stage");
    const availW = Math.max(200, stage.clientWidth - 24);
    const availH = Math.max(200, stage.clientHeight - 150);
    const k = Math.min(1, availW / vp.w, availH / vp.h);
    sim.style.transform = "scale(" + k + ")";
    clip.style.width = Math.round(vp.w * k) + "px";
    clip.style.height = Math.round(vp.h * k) + "px";
    return k;
  }

  function applyIframeSize() {
    const vp = currentViewPreset();
    sim.style.width = vp.w + "px";
    sim.style.height = vp.h + "px";
    return fitPreview();
  }

  // ------------------------------------------------------------ 상태 표시
  function refreshStatus() {
    const a = api();
    if (!a) return;
    const vp = currentViewPreset();
    const L = a.layout();
    const an = a.anisotropy(ui.capPreset);
    const bandH = (L.viewMode === '1to1') ? L.bandH1to1 : L.bandH;

    $("viewPresetVal").textContent =
      "iframe " + vp.w + " × " + vp.h + " px → 밴드 실측 "
      + L.bandW.toFixed(0) + " × " + bandH.toFixed(0)
      + " px (목표 " + vp.targetBand[0] + " × " + vp.targetBand[1] + ")";
    $("capSizeVal").textContent = an.W + " × " + an.H + " px";
    $("stageInfo").textContent =
      "격자 " + L.gridW + " × " + L.gridH
      + " · 픽셀축척 가로 " + an.pxPerMm_x.toFixed(3) + " px/mm, 세로 " + an.pxPerMm_y.toFixed(3)
      + " px/mm · 세로:가로 축척 ×" + an.scaleRatio.toFixed(2)
      + " · 미리보기는 축소해 보여줄 뿐 캡처 크기와 무관합니다.";

    if (an.isotropic) hideBanner();
    else showBanner("비등방 뷰 — 세로:가로 축척 ×" + an.scaleRatio.toFixed(1)
      + " 로 파형이 왜곡됩니다. 논문 그림에는 1:1 관찰 모드를 권합니다. (캡처는 그대로 됩니다)");
  }

  function syncButtons() {
    document.querySelectorAll("#viewPresetButtons button").forEach((b) =>
      b.classList.toggle("active", b.dataset.vp === ui.viewPreset));
    document.querySelectorAll("#cameraButtons button").forEach((b) =>
      b.classList.toggle("active", b.dataset.cam === ui.camera));
    document.querySelectorAll("#capPresetButtons button").forEach((b) =>
      b.classList.toggle("active", b.dataset.p === ui.capPreset));
  }

  // ------------------------------------------------------- 자식 상태 반영
  // 크기·파라미터를 바꾸면 자식이 recompute를 돌린다. 배열 참조 교체로 완료를
  // 판정하는 __capture.ready()를 기다린다(부모가 recompute를 직접 부르지 않는다).
  async function applyViewPreset(key) {
    const a = requireApi();
    if (!a) return;
    const prev = currentViewPreset();
    ui.viewPreset = key;
    const vp = currentViewPreset();
    const changed = (vp.w !== prev.w || vp.h !== prev.h) || sim.style.width !== vp.w + "px";
    syncButtons();
    if (!changed) { applyIframeSize(); refreshStatus(); return; }
    busy(true, "구도 변경 — 다시 계산 중…", vp.w + " × " + vp.h + " px");
    a.expectRecompute();
    applyIframeSize();
    try { await a.ready(READY_TIMEOUT); } catch (e) { showBanner(String(e.message || e)); }
    busy(false);
    refreshStatus();
  }

  async function applyCamera(mode) {
    const a = requireApi();
    if (!a) return;
    ui.camera = mode;
    syncButtons();
    busy(true, "카메라 전환 — 다시 계산 중…",
      mode === '1to1' ? "1:1 관찰 모드는 격자가 커서 20초 이상 걸릴 수 있습니다" : "");
    a.setViewMode(mode);
    try { await a.ready(READY_TIMEOUT); } catch (e) { showBanner(String(e.message || e)); }
    busy(false);
    refreshStatus();
  }

  async function applyParams() {
    const a = requireApi();
    if (!a) return;
    busy(true, "파라미터 변경 — 다시 계산 중…",
      "H=" + ui.H_mm + "mm · L=" + ui.L_mm + "mm · λ=" + ui.lam_cm + "cm");
    a.expectRecompute();
    sim.contentWindow.postMessage({
      type: "diffhub-setParams",
      H_mm: ui.H_mm, L_mm: ui.L_mm, lam_cm: ui.lam_cm,
    }, "*");
    try { await a.ready(READY_TIMEOUT); } catch (e) { showBanner(String(e.message || e)); }
    busy(false);
    refreshStatus();
  }

  function applyPhase() {
    const a = api();
    if (!a) return;
    a.pause();
    a.setPhaseDeg(ui.phaseDeg);
  }

  function applyOptions() {
    const a = api();
    if (!a) return;
    a.options.screenLine = $("capScreenLine").checked;
    a.options.centerLine = $("capCenterLine").checked;
    a.options.frame = $("capFrame").checked;
    a.options.halfHLines = $("capHalfH").checked;
    a.options.shadowBand = $("capShadowBand").checked;
    a.options.preset = ui.capPreset;
  }

  // ------------------------------------------------------------------ 저장
  function dataURLtoBlob(dataURL) {
    const comma = dataURL.indexOf(",");
    const bin = atob(dataURL.slice(comma + 1));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: "image/png" });
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log("[캡처] " + name + " " + (blob.size / 1024).toFixed(0) + "KB");
  }

  // 이미지는 자식이 그리고(§33), blob 저장은 부모가 한다.
  function captureOne(kind) {
    const a = requireApi();
    if (!a) return null;
    applyPhase();
    applyOptions();
    const dataURL = a.dataURL(kind, ui.capPreset);
    const p = a.params();
    const name = a.fileName(kind, a.meta.W, p.H_mm, p.L_mm, p.lam_cm, p.phaseDeg, ui.viewPreset);
    const blob = dataURLtoBlob(dataURL);
    saveBlob(blob, name);
    refreshStatus();
    return { name: name, size: blob.size, W: a.meta.W, H: a.meta.H };
  }

  async function captureAll() {
    const kinds = ['inc', 'sc', 'total'];
    for (let i = 0; i < kinds.length; i++) {
      captureOne(kinds[i]);
      // 브라우저의 다중 다운로드 차단을 피하려고 간격을 둔다.
      if (i < kinds.length - 1) await new Promise((r) => setTimeout(r, 250));
    }
  }

  // ------------------------------------------------------------------ 바인딩
  document.querySelectorAll("#viewPresetButtons button").forEach((b) =>
    b.addEventListener("click", () => applyViewPreset(b.dataset.vp)));
  document.querySelectorAll("#cameraButtons button").forEach((b) =>
    b.addEventListener("click", () => applyCamera(b.dataset.cam)));
  document.querySelectorAll("#capPresetButtons button").forEach((b) =>
    b.addEventListener("click", () => {
      ui.capPreset = b.dataset.p; syncButtons(); applyOptions(); refreshStatus();
    }));

  function bindParam(id, key, valId, unit, parse) {
    const el = $(id);
    el.addEventListener("input", () => {
      ui[key] = parse(el.value);
      $(valId).textContent = el.value + " " + unit;
    });
    el.addEventListener("change", applyParams);
  }
  bindParam("hSlider", "H_mm", "hVal", "mm", parseFloat);
  bindParam("lSlider", "L_mm", "lVal", "mm", parseFloat);
  bindParam("lamSlider", "lam_cm", "lamVal", "cm", parseFloat);

  $("phaseSlider").addEventListener("input", function () {
    ui.phaseDeg = parseFloat(this.value);
    $("phaseVal").textContent = this.value + "°";
    applyPhase();
  });

  ["capScreenLine", "capCenterLine", "capFrame", "capHalfH", "capShadowBand"]
    .forEach((id) => $(id).addEventListener("change", applyOptions));

  $("capIncBtn").addEventListener("click", () => captureOne('inc'));
  $("capScBtn").addEventListener("click", () => captureOne('sc'));
  $("capTotalBtn").addEventListener("click", () => captureOne('total'));
  $("capPlotBtn").addEventListener("click", () => captureOne('plot'));
  $("capAllBtn").addEventListener("click", () => captureAll());

  window.addEventListener("resize", fitPreview);

  // ------------------------------------------------------------------ 시작
  async function boot() {
    syncButtons();
    if (location.protocol === "file:") {
      showBanner("file://로 열려 있습니다 — 로컬 서버(npx serve 등)로 열어야 캡처가 동작합니다.");
      document.querySelectorAll("#panel button").forEach((b) => { b.disabled = true; });
      return;
    }
    busy(true, "시뮬레이션 불러오는 중…", "첫 계산에 수 초가 걸립니다");
    applyIframeSize();
    await new Promise((resolve) => {
      sim.addEventListener("load", resolve, { once: true });
      sim.src = "index.html?mode=solid&H=" + ui.H_mm + "&L=" + ui.L_mm + "&lam=" + ui.lam_cm;
    });
    // 자식의 첫 recompute가 끝나 __capture가 노출될 때까지 기다린다.
    for (let i = 0; i < 600 && !api(); i++) await new Promise((r) => setTimeout(r, 100));
    const a = requireApi();
    if (!a) { busy(false); return; }
    childOK = true;
    a.pause();
    a.setPhaseDeg(ui.phaseDeg);
    busy(false);
    await applyCamera(ui.camera);      // 기본 1:1 관찰 모드
    applyOptions();
    refreshStatus();
  }

  // 검증용 훅 — 부모 쪽 상태와 저장 경로를 테스트에서 그대로 쓴다.
  window.__captureTool = {
    ui: ui,
    presets: VIEW_PRESETS,
    api: api,
    ready: function () { return childOK; },
    applyViewPreset: applyViewPreset,
    applyCamera: applyCamera,
    applyParams: applyParams,
    applyPhase: applyPhase,
    applyOptions: applyOptions,
    refreshStatus: refreshStatus,
    captureOne: captureOne,
    captureAll: captureAll,
    bannerText: function () {
      const b = document.getElementById("anisoBanner");
      return b.classList.contains("show") ? b.textContent : "";
    },
  };

  boot();
})();
