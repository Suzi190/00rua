
// 紧急CSS重置：URL加上 #resetcss 即可在页面加载前清除自定义CSS
(function(){
  if (location.hash === '#resetcss' || location.search.indexOf('resetcss') !== -1) {
    try {
      var raw = localStorage.getItem('mochi_config');
      if (raw) {
        var cfg = JSON.parse(raw);
        if (cfg && cfg.settings) {
          cfg.settings.pageCss = '';
          cfg.settings.bubbleCss = '';
          localStorage.setItem('mochi_config', JSON.stringify(cfg));
        }
      }
    } catch(e) {}
    if (location.hash === '#resetcss') history.replaceState(null, '', location.pathname);
  }
})();
// ===== 内存泄漏防护系统 =====
var _ruaTimers = [];
var _ruaListeners = [];
var _ruaRafs = [];
function ruaSetInterval(fn, ms) { var id = setInterval(fn, ms); _ruaTimers.push({ type: 'interval', id: id }); return id; }
function ruaSetTimeout(fn, ms) { var id = setTimeout(fn, ms); _ruaTimers.push({ type: 'timeout', id: id }); return id; }
function ruaRAF(fn) { var id = requestAnimationFrame(fn); _ruaRafs.push(id); return id; }
function ruaAddListener(el, type, handler, opts) { el.addEventListener(type, handler, opts); _ruaListeners.push({ el: el, type: type, handler: handler }); return handler; }
function ruaCleanup() {
  _ruaTimers.forEach(function(t) { if (t.type === 'interval') clearInterval(t.id); else clearTimeout(t.id); });
  _ruaTimers = [];
  _ruaRafs.forEach(function(id) { cancelAnimationFrame(id); }); _ruaRafs = [];
  _ruaListeners.forEach(function(l) { try { l.el.removeEventListener(l.type, l.handler); } catch(e) {} });
  _ruaListeners = [];
}
window.addEventListener('beforeunload', function() {
  _ruaTimers.forEach(function(t) { if (t.type === 'interval') clearInterval(t.id); else clearTimeout(t.id); });
  _ruaRafs.forEach(function(id) { cancelAnimationFrame(id); });
  _ruaListeners.forEach(function(l) { try { l.el.removeEventListener(l.type, l.handler); } catch(e) {} });
});
// ===== Service Worker 注册（内联 Blob URL，单文件无需外部 sw.js） =====
if (false && 'serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    try {
      var _swCode = "var CACHE_NAME='rua-phone-v5-docnetworkfirst';var NETWORK_TIMEOUT=3000;var MAX_ENTRY_SIZE=2*1024*1024;self.addEventListener('install',function(e){self.skipWaiting();e.waitUntil(caches.open(CACHE_NAME).then(function(c){ return c.add('./').catch(function(){}); }));});self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(names){return Promise.all(names.map(function(n){ if(n!==CACHE_NAME) return caches.delete(n); }));}).then(function(){ return self.clients.claim(); }));});function fetchWithTimeout(r,t){return new Promise(function(resolve,reject){var done=false;var tm=setTimeout(function(){ if(!done){ done=true; reject(new Error('timeout')); } },t);fetch(r).then(function(resp){ if(!done){ done=true; clearTimeout(tm); resolve(resp); } }).catch(function(err){ if(!done){ done=true; clearTimeout(tm); reject(err); } });});}function putCache(req,resp){try{if(resp&&resp.status===200){var sz=parseInt(resp.headers.get('content-length')||'0');if(sz<MAX_ENTRY_SIZE){caches.open(CACHE_NAME).then(function(c){ c.put(req,resp.clone()).catch(function(){}); });}}}catch(e){}return resp;}self.addEventListener('fetch',function(e){var req=e.request;if(req.method!=='GET') return;var url=new URL(req.url);if(url.origin!==self.location.origin) return;if(req.mode==='navigate'||req.destination==='document'){e.respondWith(fetchWithTimeout(req,NETWORK_TIMEOUT).then(function(resp){ return putCache(req,resp); }).catch(function(){ return caches.open(CACHE_NAME).then(function(cache){ return cache.match(req).then(function(cached){ return cached||cache.match('./index.html').then(function(fb){return fb||new Response('loading',{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});}); }); }); }));return;}if(req.destination==='script'||req.destination==='style'){e.respondWith(fetch(req).then(function(resp){return putCache(req,resp);}).catch(function(){return caches.open(CACHE_NAME).then(function(cache){return cache.match(req).then(function(cached){ return cached||new Response('',{status:404}); });});}));return;}if(req.destination==='image'||req.destination==='font'||req.destination==='audio'){e.respondWith(caches.open(CACHE_NAME).then(function(cache){return cache.match(req).then(function(cached){if(cached){ fetch(req).then(function(r){ putCache(req,r); }).catch(function(){}); return cached; }return fetch(req).then(function(r){ return putCache(req,r); }).catch(function(){ return new Response('',{status:404}); });});}));return;}e.respondWith(caches.open(CACHE_NAME).then(function(cache){return fetch(req).then(function(resp){return putCache(req,resp);}).catch(function(){return cache.match(req).then(function(cached){ return cached||new Response('',{status:504}); });});}));});self.addEventListener('message',function(e){if(e.data==='skipWaiting') self.skipWaiting();if(e.data==='clearCache'){caches.keys().then(function(names){ return Promise.all(names.map(function(n){ return caches.delete(n); })); });}});";
      var _swBlob = new Blob([_swCode], { type: 'application/javascript' });
      var _swUrl = URL.createObjectURL(_swBlob);
      navigator.serviceWorker.register(_swUrl).then(function(reg) {
        console.log('[SW] 注册成功（Blob URL）');
        try { if (reg && reg.update) reg.update(); } catch (eu) {}
      }).catch(function(err) {
        console.warn('[SW] 注册失败:', err);
      });
    } catch(e) {
      console.warn('[SW] 初始化失败:', e);
    }
  });
}
// ===== 真实 Service Worker：供网页挂后台时显示系统通知 =====
// Service Worker 不能从 blob: 地址注册，必须使用同源 http(s) 文件。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(function(reg) {
      try { reg.update(); } catch (e) {}
      console.log('[SW] 后台通知服务已启用');
    }).catch(function(err) {
      console.warn('[SW] 后台通知服务启用失败:', err);
    });
  });
  navigator.serviceWorker.addEventListener('message', function(event) {
    var d = event && event.data;
    if (!d || d.type !== 'RUA_NOTIFICATION_OPEN') return;
    try { window.focus(); } catch (e) {}
    try { if (d.appId && typeof openApp === 'function') openApp(d.appId); } catch (e2) {}
  });
}
// 新版 Service Worker 接管后自动刷新一次，确保用户立刻跑到最新代码（每个会话最多一次）
if ('serviceWorker' in navigator) {
  try {
    var _swReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (_swReloaded || sessionStorage.getItem('rua_sw_reloaded') === '1') return;
      _swReloaded = true;
      try { sessionStorage.setItem('rua_sw_reloaded', '1'); } catch (e) {}
      location.reload();
    });
  } catch (e) {}
}
// ===== 后台通知权限 + 屏幕常亮（尽量保活）=====
(function() {
  try {
    /* 首次用户点击/触摸时请求一次系统通知权限：仅 default 才请求，被拒后不再打扰 */
    var _asked = false;
    function _askNotif() {
      if (_asked) return; _asked = true;
      try { if ('Notification' in window && Notification.permission === 'default') { Notification.requestPermission().catch(function(){}); } } catch (e) {}
    }
    document.addEventListener('click', _askNotif);
    document.addEventListener('touchstart', _askNotif, { passive: true });

    /* Screen Wake Lock：页面可见时尽量保持屏幕/页面不被休眠，重新回到前台时再次申请 */
    var _wl = null;
    function _reqWakeLock() {
      try {
        if (navigator.wakeLock && document.visibilityState === 'visible') {
          navigator.wakeLock.request('screen').then(function(lock) { _wl = lock; }).catch(function(){});
        }
      } catch (e) {}
    }
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') _reqWakeLock(); });
    window.addEventListener('load', _reqWakeLock);
    _reqWakeLock();
  } catch (e) {}
})();

// ===== 重复ID查找辅助：尝试基础ID及后缀变体 =====
function _findById(id) {
  var el = document.getElementById(id);
  if (el) return el;
  for (var i = 2; i <= 9; i++) {
    el = document.getElementById(id + '-' + i);
    if (el) return el;
  }
  return null;
}
// ===== 全局错误捕获：防止运行时错误与未处理 Promise 静默丢失 =====
window.onerror = function(msg, src, line, col, err) {
  try { console.error('[全局错误]', msg, src + ':' + line + ':' + col, err || ''); } catch(_) {}
  return false;
};
window.addEventListener('error', function(e) {
  try {
    var loc = (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0);
    console.error('[全局错误]', e.message, loc, e.error || '');
  } catch(_) {}
  return false;
});
window.addEventListener('unhandledrejection', function(e) {
  try {
    var r = e.reason;
    console.error('[未处理Promise]', (r && r.message) ? r.message : r, r || '');
  } catch(_) {}
});
