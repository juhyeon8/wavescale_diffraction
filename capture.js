/* 회절 시뮬레이션 — 논문 그림 캡처 도구 (capture.html 전용)
 *
 * script.js를 같은 페이지에서 직접 불러 window.__capture(§33)를 호출한다.
 * iframe이 없으므로 동일 출처 제약이 없고, 더블클릭(file://)으로 열어도 동작한다.
 *
 * script.js가 요구하는 조작 패널 마크업은 capture.html의 #hiddenPanel에 그대로
 * 들어 있다(화면 밖으로만 밀어 둠). 파라미터를 바꿀 때는 그 원본 슬라이더에 값을
 * 넣고 input 이벤트를 발생시킨다 — 기존 바인딩 로직을 우회하지 않는다.
 *
 * 구도는 #canvasWrap을 픽셀로 고정해 잡는다(창 크기와 무관):
 *   cssW = bandW + 134,  cssH = bandH1to1 + 20
 */
(function () {
  "use strict";

  const VIEW_PRESETS = [
    { key: 'sq', label: '정사각', w: 934, h: 820, targetBand: [800, 800] },
    { key: 'wide', label: '와이드', w: 1334, h: 470, targetBand: [1200, 450] },
    { key: 'sqtall', label: '여유크롭', w: 934, h: 900, targetBand: [800, 880] },
  ];
  const READY_TIMEOUT = 90000;   // 1:1 모드는 격자가 3배라 recompute가 30초를 넘기도 한다
  const FONT_SCALE_KEY = 'capture.fontScale';
  const FONT_SCALE_MIN = 0.8, FONT_SCALE_MAX = 3.0, FONT_SCALE_DEFAULT = 1.5;

  const ui = {
    viewPreset: 'sq',
    camera: '1to1',
    capPreset: 's',
    H_mm: 150, L_mm: 100, lam_cm: 12,
    phaseDeg: 0,
    fontScale: FONT_SCALE_DEFAULT,
  };

  const $ = (id) => document.getElementById(id);
  const wrap = $("canvasWrap");

  function busy(on, msg, sub) {
    $("busyMsg").textContent = msg || "계산 중…";
    $("busySub").textContent = sub || "";
    $("busy").classList.toggle("show", !!on);
  }

  function api() { return window.__capture || null; }

  function showBanner(text) {
    const b = $("anisoBanner");
    b.textContent = text;
    b.classList.add("show");
  }
  function hideBanner() { $("anisoBanner").classList.remove("show"); }

  function currentViewPreset() {
    return VIEW_PRESETS.find((p) => p.key === ui.viewPreset) || VIEW_PRESETS[0];
  }

  // 숨긴 원본 슬라이더에 값을 넣고 input 이벤트를 발생시킨다(기존 핸들러가 처리).
  function setSlider(id, value) {
    const el = $(id);
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ------------------------------------------------- 그래프 글자 배율(F1)
  function clampFontScale(v) {
    const n = Math.round(parseFloat(v) * 10) / 10;
    if (!isFinite(n)) return FONT_SCALE_DEFAULT;
    return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
  }

  function loadFontScale() {
    try {
      const raw = window.localStorage.getItem(FONT_SCALE_KEY);
      return (raw === null) ? FONT_SCALE_DEFAULT : clampFontScale(raw);
    } catch (e) { return FONT_SCALE_DEFAULT; }   // file://에서 저장소가 막혀도 동작해야 한다
  }

  function saveFontScale(v) {
    try { window.localStorage.setItem(FONT_SCALE_KEY, String(v)); } catch (e) { /* 무시 */ }
  }

  function applyFontScale(v, persist) {
    const a = api();
    ui.fontScale = clampFontScale(v);
    if (a) a.options.fontScale = ui.fontScale;
    $("capFontScale").value = String(ui.fontScale);
    $("capFontScaleVal").textContent = "×" + ui.fontScale.toFixed(1);
    if (persist) saveFontScale(ui.fontScale);
    refreshPlotPreview();
  }

  // 그래프 캡처는 화면에 없으므로 작은 미리보기를 그려 배율 변화를 바로 보여준다.
  function refreshPlotPreview() {
    const a = api();
    if (!a) return;
    try {
      $("plotPreview").src = a.dataURL('plot', 'xs');
      const m = a.meta;
      $("plotPreviewInfo").textContent =
        "눈금 " + m.tickPx + "px · 축 이름 " + m.axisPx + "px · 플롯 영역 "
        + (m.plotAreaFrac * 100).toFixed(0) + "% (640px 기준 미리보기)"
        + (m.boxWarn ? " — 배율이 큽니다" : "");
    } catch (e) { /* 아직 계산 전이면 조용히 넘어간다 */ }
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
      "컨테이너 " + vp.w + " × " + vp.h + " px → 밴드 실측 "
      + L.bandW.toFixed(0) + " × " + bandH.toFixed(0)
      + " px (목표 " + vp.targetBand[0] + " × " + vp.targetBand[1] + ")";
    $("capSizeVal").textContent = an.W + " × " + an.H + " px";
    $("stageInfo").textContent =
      "격자 " + L.gridW + " × " + L.gridH
      + " · 픽셀축척 가로 " + an.pxPerMm_x.toFixed(3) + " px/mm, 세로 " + an.pxPerMm_y.toFixed(3)
      + " px/mm · 세로:가로 축척 ×" + an.scaleRatio.toFixed(2)
      + " · 컨테이너는 창 크기와 무관하게 고정됩니다(작으면 스크롤).";

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

  // ------------------------------------------------- 구도 · 카메라 · 파라미터
  // 컨테이너 크기를 바꾸면 script.js의 resize()가 돌면서 recompute가 일어난다.
  // 완료 판정은 __capture.ready()(solver 배열 참조 교체 폴링)를 그대로 쓴다.
  async function applyViewPreset(key) {
    const a = api();
    if (!a) return;
    ui.viewPreset = key;
    const vp = currentViewPreset();
    syncButtons();
    const changed = (wrap.style.width !== vp.w + "px" || wrap.style.height !== vp.h + "px");
    if (!changed) { refreshStatus(); return; }
    busy(true, "구도 변경 — 다시 계산 중…", "컨테이너 " + vp.w + " × " + vp.h + " px");
    a.expectRecompute();
    wrap.style.width = vp.w + "px";
    wrap.style.height = vp.h + "px";
    // resize()는 window resize 이벤트에 걸려 있으므로 컨테이너만 바꾸면 안 돈다.
    window.dispatchEvent(new Event("resize"));
    try { await a.ready(READY_TIMEOUT); } catch (e) { showBanner(String(e.message || e)); }
    busy(false);
    refreshStatus();
    refreshPlotPreview();
  }

  async function applyCamera(mode) {
    const a = api();
    if (!a) return;
    ui.camera = mode;
    syncButtons();
    busy(true, "카메라 전환 — 다시 계산 중…",
      mode === '1to1' ? "1:1 관찰 모드는 격자가 커서 30초 가까이 걸릴 수 있습니다" : "");
    a.setViewMode(mode);
    try { await a.ready(READY_TIMEOUT); } catch (e) { showBanner(String(e.message || e)); }
    busy(false);
    refreshStatus();
  }

  // H·λ는 항상 recompute를 부른다. L은 1:1 모드에서 다시 그리기만 하므로(§20.6)
  // 그 경우에는 재계산을 기다리지 않는다 — 안 그러면 ready()가 타임아웃까지 매달린다.
  async function applyParam(which) {
    const a = api();
    if (!a) return;
    const willRecompute = (which !== 'L') || (a.layout().viewMode !== '1to1');
    if (willRecompute) {
      busy(true, "파라미터 변경 — 다시 계산 중…",
        "H=" + ui.H_mm + "mm · L=" + ui.L_mm + "mm · λ=" + ui.lam_cm + "cm");
      a.expectRecompute();
    }
    if (which === 'H') setSlider("hSlider", ui.H_mm);
    else if (which === 'L') setSlider("lSlider", ui.L_mm);
    else setSlider("lamSlider", ui.lam_cm);
    if (willRecompute) {
      try { await a.ready(READY_TIMEOUT); } catch (e) { showBanner(String(e.message || e)); }
      busy(false);
    }
    refreshStatus();
    refreshPlotPreview();
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
    a.options.fontScale = ui.fontScale;
  }

  // ------------------------------------------------------------------ 저장
  function dataURLtoBlob(dataURL) {
    const bin = atob(dataURL.slice(dataURL.indexOf(",") + 1));
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

  function captureOne(kind) {
    const a = api();
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
      refreshPlotPreview();
    }));

  function bindParam(id, key, valId, unit, which) {
    const el = $(id);
    el.addEventListener("input", () => {
      ui[key] = parseFloat(el.value);
      $(valId).textContent = el.value + " " + unit;
    });
    el.addEventListener("change", () => applyParam(which));
  }
  bindParam("capH", "H_mm", "capHVal", "mm", 'H');
  bindParam("capL", "L_mm", "capLVal", "mm", 'L');
  bindParam("capLam", "lam_cm", "capLamVal", "cm", 'lam');

  $("capPhase").addEventListener("input", function () {
    ui.phaseDeg = parseFloat(this.value);
    $("capPhaseVal").textContent = this.value + "°";
    applyPhase();
  });

  ["capScreenLine", "capCenterLine", "capFrame", "capHalfH", "capShadowBand"]
    .forEach((id) => $(id).addEventListener("change", () => { applyOptions(); refreshPlotPreview(); }));

  $("capFontScale").addEventListener("input", function () { applyFontScale(this.value, true); });

  $("capIncBtn").addEventListener("click", () => captureOne('inc'));
  $("capScBtn").addEventListener("click", () => captureOne('sc'));
  $("capTotalBtn").addEventListener("click", () => captureOne('total'));
  $("capPlotBtn").addEventListener("click", () => captureOne('plot'));
  $("capAllBtn").addEventListener("click", () => captureAll());

  // ------------------------------------------------------------------ 시작
  let booted = false;

  async function boot() {
    syncButtons();
    const a = api();
    if (!a) {
      showBanner("script.js를 불러오지 못했습니다 — capture.html과 같은 폴더에 있는지 확인하세요.");
      return;
    }
    // 솔리드 막대 모드로 맞춘다(파장별 비교는 틈 없는 막대에서 해야 한다).
    if (a.params().mode !== 'solid') $("modeSolidBtn").click();
    a.pause();
    a.setPhaseDeg(ui.phaseDeg);
    // H·L·λ 기본값은 script.js의 state 기본값과 같으므로 여기서 다시 넣지 않는다
    // (넣으면 불필요한 recompute가 한 번 더 돈다).
    const p0 = a.params();
    ui.H_mm = Math.round(p0.H_mm); ui.L_mm = p0.L_mm; ui.lam_cm = p0.lam_cm;
    $("capH").value = String(ui.H_mm); $("capHVal").textContent = ui.H_mm + " mm";
    $("capL").value = String(ui.L_mm); $("capLVal").textContent = ui.L_mm + " mm";
    $("capLam").value = String(ui.lam_cm); $("capLamVal").textContent = ui.lam_cm + " cm";
    applyFontScale(loadFontScale(), false);   // 지난번 배율 복원(없으면 기본 1.5)
    booted = true;
    await applyCamera(ui.camera);       // 기본 1:1 관찰 모드
    applyOptions();
    refreshStatus();
    refreshPlotPreview();
  }

  // 검증용 훅
  window.__captureTool = {
    ui: ui,
    presets: VIEW_PRESETS,
    api: api,
    ready: function () { return booted; },
    applyViewPreset: applyViewPreset,
    applyCamera: applyCamera,
    applyParam: applyParam,
    applyPhase: applyPhase,
    applyOptions: applyOptions,
    applyFontScale: applyFontScale,
    refreshPlotPreview: refreshPlotPreview,
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
