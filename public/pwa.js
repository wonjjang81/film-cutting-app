(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const script = document.currentScript;
  const base = new URL('./', script.src);
  let installEvent = null, updateWorker = null, reloading = false, updateApproved = false;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', '앱 설치 및 업데이트');
  panel.style.cssText = 'position:fixed;right:12px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:10000;max-width:min(340px,calc(100vw - 24px));padding:12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#183047;box-shadow:0 4px 20px #0002;font:13px/1.5 system-ui;display:none';
  const text = document.createElement('p'); text.style.margin = '0 0 8px';
  const action = document.createElement('button'); action.type = 'button';
  action.style.cssText = 'min-height:40px;padding:8px 12px;border:0;border-radius:7px;background:#2563eb;color:white;font:inherit;cursor:pointer';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기'; close.setAttribute('aria-label', '설치 안내 닫기');
  close.style.cssText = 'margin-left:8px;min-height:40px;padding:8px;border:0;background:transparent;color:#475569;font:inherit;cursor:pointer';
  close.onclick = () => { panel.style.display = 'none'; };
  panel.append(text, action, close); document.body.append(panel);
  const show = (message, label) => { text.textContent = message; action.textContent = label; panel.style.display = 'block'; };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event;
    if (!standalone() && !updateWorker) show('필름 재단 계산기를 기기에 설치하고 별도 창으로 실행하세요. 로그인·서버 저장에는 인터넷이 필요합니다.', '앱 설치');
  });
  window.addEventListener('appinstalled', () => { installEvent = null; panel.style.display = 'none'; });
  action.onclick = async () => {
    if (updateWorker) {
      if (window.confirm('저장하지 않은 입력은 사라질 수 있습니다. 프로젝트를 저장하셨나요? 업데이트 후 앱을 다시 엽니다.')) { updateApproved = true; updateWorker.postMessage({ type: 'ACTIVATE_UPDATE' }); }
      return;
    }
    if (installEvent) {
      const pending = installEvent; installEvent = null;
      try { await pending.prompt(); await pending.userChoice; } finally { panel.style.display = 'none'; }
      return;
    }
    show(ios ? 'Safari 공유 메뉴 → 홈 화면에 추가 → 웹 앱으로 열기를 선택하세요.' : 'Chrome/Edge 메뉴에서 앱 설치 또는 이 페이지를 앱으로 설치를 선택하세요. 이미 설치했다면 앱 아이콘으로 실행할 수 있습니다.', '설치 방법');
  };
  // Keep an installation entry available even when the browser suppresses prompts.
  const help = document.createElement('button'); help.type = 'button'; help.textContent = '앱 설치 안내';
  help.style.cssText = 'position:fixed;right:12px;top:calc(10px + env(safe-area-inset-top));z-index:9999;min-height:36px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1d4ed8;font:12px system-ui;cursor:pointer';
  help.onclick = () => { show('기기에 설치하면 브라우저 탭 대신 별도 앱 창으로 실행합니다. 로그인·서버 프로젝트에는 인터넷이 필요합니다.', installEvent ? '앱 설치' : '설치 방법'); };
  if (!standalone()) document.body.append(help);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading && updateApproved) { reloading = true; window.location.reload(); }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname, updateViaCache: 'none' }).then(registration => {
      const offer = worker => { updateWorker = worker; show('새 버전이 준비됐습니다. 프로젝트를 저장한 뒤 업데이트해 주세요.', '저장 후 업데이트'); };
      if (registration.waiting) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker); });
      });
    }).catch(() => { help.textContent = '앱 설치 도움말'; });
  });
})();
