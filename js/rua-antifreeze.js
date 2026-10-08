/* rua-antifreeze.js — 防卡死保护层
   必须在所有应用脚本之前加载（放在 head 最前）。
   作用：
   1) 跟踪所有 setInterval，暴露统计/手动清理接口；
   2) 看门狗心跳（v116起）：主线程偶发阻塞只记录、不刷新、不清定时器，让其自行恢复；
      仅当 60 秒滑动窗口内连续阻塞达 3 次（真死锁）才兜底 location.reload() 一次，且有 60 秒冷却，
      从根上避免“进重页面→卡→自动刷新→还卡→iOS判定重复出现问题”的崩溃循环
      （Service Worker 已缓存全站，刷新秒开；应用状态在 IndexedDB / localStorage，不丢失）；
   3) 暴露手动 _ruaPanicClear 供控制台排查，自动流程不再盲目清空全部定时器，以免误停时钟/主动消息/记忆。
   本脚本不改写应用逻辑，仅在应用卡死时提供“自动自救”。 */
(function () {
  'use strict';
  if (window.__ruaAF) return;          // 防重复注入
  window.__ruaAF = true;

  var _origSI  = window.setInterval;
  var _origCI  = window.clearInterval;
  var _origST  = window.setTimeout;

  /* ---------- 1. 定时器登记 ---------- */
  var _intervals = new Map();         // id -> 创建时间
  window.setInterval = function (fn, ms) {
    /* 后台标签页不执行高频 UI/轮询回调。原生浏览器虽会节流，但部分 WebView
       仍会频繁唤醒 CPU；跳过这些无意义回调可明显降低锁屏/切后台后的发热。 */
    var wrapped = fn;
    if (typeof fn === 'function' && Number(ms) < 60000) {
      wrapped = function () {
        if (typeof document !== 'undefined' && document.hidden) return;
        return fn.apply(this, arguments);
      };
    }
    var args = Array.prototype.slice.call(arguments);
    args[0] = wrapped;
    var id = _origSI.apply(window, args);
    _intervals.set(id, Date.now());
    return id;
  };
  window.clearInterval = function (id) {
    _intervals.delete(id);
    return _origCI.apply(window, arguments);
  };
  window._ruaTimerStats = function () { return { liveIntervals: _intervals.size }; };
  window._ruaPanicClear = function () {   // 手动清理全部 interval（控制台/按钮可调）
    _intervals.forEach(function (_, id) { try { _origCI(id); } catch (e) {} });
    _intervals.clear();
    console.log('[防卡死] 已清理全部 interval');
  };

  /* ---------- 2. 看门狗心跳（v116 A止血：偶发卡顿不再整页刷新；只有滑动窗口内持续反复卡死才兜底刷新一次，
     从根上打断“进微信/设置→卡→自动刷新→还卡→iOS判定重复出现问题”的崩溃循环，也不再盲目清空正常定时器） ---------- */
  var BLOCK_LIMIT = 12000;            // 单次主线程阻塞判定阈值
  var STALL_WINDOW = 60000;           // 卡顿计数滑动窗口
  var STALL_RELOAD_AFTER = 3;         // 窗口内第几次卡顿才兜底刷新（前几次只等待自行恢复，不刷新、不清定时器）
  var RELOAD_COOLDOWN = 60000;        // 兜底刷新冷却，防止刷新循环
  var _last = Date.now();
  var _stallTimes = [];
  _origST(function tick () { _last = Date.now(); _origST(tick, 2000); }, 2000);

  _origSI(function () {
    var gap = Date.now() - _last;
    if (gap < BLOCK_LIMIT) return;    // 正常
    var now = Date.now();
    _last = now;
    /* 登记本次卡顿，只保留窗口内记录 */
    _stallTimes.push(now);
    _stallTimes = _stallTimes.filter(function (t) { return now - t <= STALL_WINDOW; });
    try {
      var _prev = JSON.parse(localStorage.getItem('_rua_freeze_log') || '{"total":0}');
      localStorage.setItem('_rua_freeze_log', JSON.stringify({ time: now, gap: gap, intervals: _intervals.size, stallCountInWindow: _stallTimes.length, total: (_prev.total || 0) + 1 }));
    } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('rua:stalled', { detail: { gap: gap, count: _stallTimes.length } })); } catch (e) {}
    /* 偶发/前几次卡顿：不刷新、也不清正常定时器（避免时钟、主动消息、记忆等被误停），让主线程自行缓过来 */
    if (_stallTimes.length < STALL_RELOAD_AFTER) {
      console.warn('[防卡死] 主线程卡顿 ' + gap + 'ms（窗口内第 ' + _stallTimes.length + ' 次），不刷新页面，等待自行恢复');
      return;
    }
    /* 窗口内连续反复卡死、自行恢复无效：兜底刷新一次，并受冷却约束避免刷新循环 */
    var last = 0;
    try { last = parseInt(sessionStorage.getItem('_rua_frz') || '0', 10); } catch (e) {}
    if (now - last < RELOAD_COOLDOWN) { _stallTimes = []; return; }
    try { sessionStorage.setItem('_rua_frz', String(now)); } catch (e) {}
    console.error('[防卡死] 主线程持续卡死（窗口内 ' + _stallTimes.length + ' 次），兜底刷新恢复');
    location.reload();
  }, 3000);

  /* ---------- 3. v109 A性能：滚动降级毛玻璃 / 切后台暂停动画（零业务耦合，不改任何应用逻辑） ---------- */
  try {
    var _perfRoot = document.documentElement, _scrollEndTimer = null;
    /* scroll 不冒泡，用捕获阶段统一接管所有内部滚动容器（聊天/朋友圈/通讯录等），无需逐个绑定 */
    document.addEventListener('scroll', function () {
      if (!_perfRoot.classList.contains('wa-scrolling')) _perfRoot.classList.add('wa-scrolling');
      if (_scrollEndTimer) clearTimeout(_scrollEndTimer);
      _scrollEndTimer = setTimeout(function () { _perfRoot.classList.remove('wa-scrolling'); }, 160);
    }, true);
    /* 切后台/锁屏：暂停全部CSS动画省电极降温；回前台自动恢复 */
    document.addEventListener('visibilitychange', function () {
      _perfRoot.classList.toggle('wa-bg-paused', document.hidden);
    });
  } catch (ePerf) {}
})();
