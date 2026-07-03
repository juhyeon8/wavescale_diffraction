(function () {
  "use strict";

  // =====================================================================
  // 마스터 상태 + 단위 환산표(§30.3)
  // ---------------------------------------------------------------------
  //  마스터 파라미터   | 금속(index.html)     | 하위헌스(huygens)      | 비교(compare.html)
  //  H_mm (mm)         | H=H_mm (mm)          | a=H_mm/1000 (m)        | H=H_mm (mm)
  //  L_mm (mm)         | L=L_mm (mm)          | z=L_mm/1000 (m)        | L=L_mm (mm)
  //  lam_cm (cm)       | lam=lam_cm (cm)      | lambda=lam_cm/100 (m)  | lam=lam_cm (cm)
  // =====================================================================
  const state = { H_mm: 200, L_mm: 300, lam_cm: 4 };

  const el = {
    tabBtns: Array.from(document.querySelectorAll('.tabBtn')),
    masterToggleBtn: document.getElementById('masterToggleBtn'),
    masterBody: document.getElementById('masterBody'),
    mH: document.getElementById('mH'), mHVal: document.getElementById('mHVal'),
    mL: document.getElementById('mL'), mLVal: document.getElementById('mLVal'),
    mLam: document.getElementById('mLam'), mLamVal: document.getElementById('mLamVal'),
    applyBtn: document.getElementById('applyBtn'),
    preset1Btn: document.getElementById('preset1Btn'),
    preset2Btn: document.getElementById('preset2Btn'),
    preset3Btn: document.getElementById('preset3Btn'),
    pairPane: document.getElementById('pairPane'),
    comparePane: document.getElementById('comparePane'),
    metalWrap: document.getElementById('metalWrap'),
    huygensWrap: document.getElementById('huygensWrap'),
    metalFrame: document.getElementById('metalFrame'),
    huygensFrame: document.getElementById('huygensFrame'),
    compareFrame: document.getElementById('compareFrame'),
  };

  // =====================================================================
  // 마스터 슬라이더
  // =====================================================================
  function syncMasterLabels() {
    el.mHVal.textContent = state.H_mm.toFixed(0) + " mm";
    el.mLVal.textContent = state.L_mm.toFixed(0) + " mm";
    el.mLamVal.textContent = state.lam_cm.toFixed(1) + " cm";
  }
  function syncMasterSliders() {
    el.mH.value = state.H_mm; el.mL.value = state.L_mm; el.mLam.value = state.lam_cm;
    syncMasterLabels();
  }
  el.mH.addEventListener("input", function () { state.H_mm = parseFloat(this.value); syncMasterLabels(); });
  el.mL.addEventListener("input", function () { state.L_mm = parseFloat(this.value); syncMasterLabels(); });
  el.mLam.addEventListener("input", function () { state.lam_cm = parseFloat(this.value); syncMasterLabels(); });

  function reloadAll() {
    const H = state.H_mm, L = state.L_mm, lam = state.lam_cm;
    el.metalFrame.src = `./index.html?mode=solid&H=${H}&L=${L}&lam=${lam}`;
    el.huygensFrame.src = `./huygens/index.html?lambda=${lam / 100}&a=${H / 1000}&z=${L / 1000}`;
    el.compareFrame.src = `./compare.html?H=${H}&L=${L}&lam=${lam}`;
  }
  el.applyBtn.addEventListener("click", reloadAll);

  const PRESETS = { preset1Btn: 1, preset2Btn: 4, preset3Btn: 20 };
  Object.keys(PRESETS).forEach((id) => {
    el[id].addEventListener("click", () => {
      state.H_mm = 200; state.L_mm = 300; state.lam_cm = PRESETS[id];
      syncMasterSliders();
      reloadAll();
    });
  });

  el.masterToggleBtn.addEventListener("click", () => {
    const collapsed = el.masterBody.classList.toggle("collapsed");
    el.masterToggleBtn.textContent = (collapsed ? "▸" : "▾") + " 마스터 컨트롤";
  });

  // =====================================================================
  // 탭 전환 — iframe 3개 상주 + CSS 크기 전환(§30.2). 재배치/복제 금지.
  // 숨김 대상은 display:none 대신 position:absolute + 명시적 px 크기 +
  // visibility:hidden으로 처리한다: flex 흐름에서 빠지되(형제가 100%를
  // 차지할 수 있게) 실제 픽셀 크기는 유지해 내부 캔버스가 0×0으로
  // 줄어드는 것을 막는다.
  // =====================================================================
  function hideWrap(wrap, w, h) {
    wrap.style.position = "absolute";
    wrap.style.top = "0"; wrap.style.left = "0";
    wrap.style.width = w + "px";
    wrap.style.height = h + "px";
    wrap.style.visibility = "hidden";
    wrap.style.flex = "none";
  }
  function showWrap(wrap, basis) {
    wrap.style.position = "relative";
    wrap.style.width = "";
    wrap.style.height = "100%";
    wrap.style.visibility = "visible";
    wrap.style.flex = "1 1 " + basis;
  }
  function dispatchResize(win) {
    try { win.dispatchEvent(new Event("resize")); } catch (e) { /* 동일 출처가 아니면 무시 */ }
  }

  let currentTab = "huygens";
  function applyTab(tab) {
    currentTab = tab;
    el.tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

    const showCompare = (tab === "compare");
    el.pairPane.style.visibility = showCompare ? "hidden" : "visible";
    el.comparePane.style.visibility = showCompare ? "visible" : "hidden";

    if (!showCompare) {
      const pairW = el.pairPane.clientWidth;
      const pairH = el.pairPane.clientHeight;
      if (tab === "metal") { showWrap(el.metalWrap, "100%"); hideWrap(el.huygensWrap, pairW, pairH); }
      else if (tab === "huygens") { hideWrap(el.metalWrap, pairW, pairH); showWrap(el.huygensWrap, "100%"); }
      else if (tab === "side") { showWrap(el.metalWrap, "50%"); showWrap(el.huygensWrap, "50%"); }
    }

    requestAnimationFrame(() => {
      if (showCompare) {
        dispatchResize(el.compareFrame.contentWindow);
      } else {
        if (tab === "metal" || tab === "side") dispatchResize(el.metalFrame.contentWindow);
        if (tab === "huygens" || tab === "side") dispatchResize(el.huygensFrame.contentWindow);
      }
    });
  }
  el.tabBtns.forEach((btn) => btn.addEventListener("click", () => applyTab(btn.dataset.tab)));

  // =====================================================================
  // 시작
  // =====================================================================
  syncMasterSliders();
  applyTab("huygens");
  window.addEventListener("resize", () => applyTab(currentTab));
})();
