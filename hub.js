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
  let paramSyncTimer = null;
  function sendSetParams() {
    const msg = { type: "diffhub-setParams", H_mm: state.H_mm, L_mm: state.L_mm, lam_cm: state.lam_cm };
    [el.metalFrame, el.huygensFrame, el.compareFrame].forEach((frame) => {
      try { frame.contentWindow.postMessage(msg, "*"); } catch (e) { /* 동일 출처가 아니면 무시 */ }
    });
  }
  function scheduleParamSync() {
    if (paramSyncTimer) clearTimeout(paramSyncTimer);
    paramSyncTimer = setTimeout(sendSetParams, 300);
  }
  el.mH.addEventListener("input", function () { state.H_mm = parseFloat(this.value); syncMasterLabels(); scheduleParamSync(); });
  el.mL.addEventListener("input", function () { state.L_mm = parseFloat(this.value); syncMasterLabels(); scheduleParamSync(); });
  el.mLam.addEventListener("input", function () { state.lam_cm = parseFloat(this.value); syncMasterLabels(); scheduleParamSync(); });

  function reloadAll() {
    const H = state.H_mm, L = state.L_mm, lam = state.lam_cm;
    el.metalFrame.src = `./index.html?mode=solid&H=${H}&L=${L}&lam=${lam}`;
    el.huygensFrame.src = `./huygens/index.html?lambda=${lam / 100}&a=${H / 1000}&z=${L / 1000}&lockScale=1`;
    el.compareFrame.src = `./compare.html?H=${H}&L=${L}&lam=${lam}`;
  }
  el.applyBtn.addEventListener("click", reloadAll);

  const PRESETS = { preset1Btn: 1, preset2Btn: 4, preset3Btn: 20 };
  Object.keys(PRESETS).forEach((id) => {
    el[id].addEventListener("click", () => {
      state.H_mm = 200; state.L_mm = 300; state.lam_cm = PRESETS[id];
      syncMasterSliders();
      if (paramSyncTimer) clearTimeout(paramSyncTimer);
      sendSetParams();
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

  // =====================================================================
  // ③ 나란히 보기 — 하위헌스 쪽 그래프 패널(#panel-main) 먼저 보이기(§30.7).
  // huygens/style.css의 980px 이하 세로 스택 레이아웃 때문에 절반 폭에서는
  // 헤더·슬라이더가 먼저 보이고 그래프는 스크롤해야 보인다.
  //
  // 방식: postMessage. iframe.contentDocument로 직접 접근하는 방식은
  // Chrome이 file://을 파일마다 별도의 불투명(opaque) 출처로 취급해
  // 실패한다(실측: contentDocument는 null, dispatchEvent/location 접근은
  // SecurityError — 같은 폴더라도 "동일 출처"가 아니다). URL 해시(#panel-main)
  // + 첫 진입 시 강제 리로드안도 검토했으나, §30.2의 "탭 전환은 리로드를
  // 유발하지 않는다" 불변식을 깨고 ①에서의 조작 상태를 파괴하므로 기각했다.
  // postMessage는 opaque 출처 간에도 항상 허용되는 예외적 API라 리로드 없이
  // 안전하게 전달할 수 있다.
  //
  // 로드(최초 + 리로드) 직후 딱 한 번만 스크롤하고, 사용자가 직접 스크롤한
  // 위치는 탭 전환으로 되돌리지 않는다(플래그가 꺼져 있으면 아무 것도 하지
  // 않음).
  // =====================================================================
  let needsScrollHuygens = false;
  function maybeScrollHuygens() {
    if (currentTab !== "side" || !needsScrollHuygens) return;
    try {
      el.huygensFrame.contentWindow.postMessage("scrollToPanelMain", "*");
    } catch (e) { /* 접근 실패 시 조용히 무시 */ }
    needsScrollHuygens = false;
  }
  el.huygensFrame.addEventListener("load", () => {
    needsScrollHuygens = true;
    maybeScrollHuygens();
  });

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
      if (tab === "side") maybeScrollHuygens();
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
