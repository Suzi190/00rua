/* rua-diag.js — rua小手机 真机自检面板（纯新增文件，不改动任何应用逻辑）
 *
 * 打开方式（任一）：
 *   1) 在屏幕最顶部 100px 区域内「连续点 5 下」（每次间隔 < 1.2 秒）；
 *   2) 页面地址后加 ?diag=1（Capacitor 里就是 https://localhost/?diag=1）；
 *   3) 电脑调试时在控制台执行 ruaDiag()。
 *
 * 用途：一眼看清「是否真全屏」和「文件导出是否可用」：
 *   · screen.height 与 innerHeight 的差值 —— ≈0 才是真全屏；>0 就是顶部那条色带的高度
 *   · #phoneScreen / .phone-frame / .status-bar / .dynamic-island 的实际 top / padding 值
 *   · env(safe-area-inset-*) 的实测值（用探针元素量的）
 *   · AndroidFileSaver 桥是否可用；「测试导出」会真的写一个 txt 到系统「下载」目录，
 *     并把原生返回的 "OK: ..." / "ERROR: ..." 原样显示出来
 *   · AndroidNetease 直连桥是否可用；「测试网易云」会真的通过原生直连请求一次官方接口，
 *     把耗时、正文大小、热评条数显示出来（这是「APK 里网易云到底通没通」的最快判据）
 */
(function () {
  'use strict';
  if (window.__ruaDiag) return;   // 防重复注入
  window.__ruaDiag = true;

  var OPEN_TAPS = 5;              // 顶部连点次数
  var TAP_ZONE = 100;             // 顶部热区高度（CSS 像素）
  var TAP_GAP = 1200;             // 两次点击的最大间隔（毫秒）
  var TAG = 'v20261008diag';

  var taps = 0;
  var lastTap = 0;
  var lastCounted = 0;            // 上一次计数的时间，用于忽略 touchend 之后合成的 click
  var panel = null;
  var pre = null;
  var tipEl = null;

  function $(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function num(v) { return Math.round(v * 100) / 100; }
  function px(v) { return num(v) + 'px'; }

  function rectLine(sel) {
    var node = $(sel);
    if (!node) return sel + ' : 未找到';
    var r = node.getBoundingClientRect();
    var cs = window.getComputedStyle(node);
    return sel + ' : top=' + px(r.top) + ' left=' + px(r.left)
      + ' w=' + px(r.width) + ' h=' + px(r.height)
      + ' | padding-top=' + cs.paddingTop + ' padding-bottom=' + cs.paddingBottom;
  }

  /* 用探针元素实测 env(safe-area-inset-*)：Android WebView 通常全为 0px */
  function safeArea() {
    var probe = document.createElement('div');
    probe.setAttribute('style',
      'position:fixed;left:-9999px;top:0;width:0;height:0;visibility:hidden;'
      + 'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);'
      + 'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);');
    var host = document.body || document.documentElement;
    host.appendChild(probe);
    var cs = window.getComputedStyle(probe);
    var out = [cs.paddingTop, cs.paddingBottom, cs.paddingLeft, cs.paddingRight];
    host.removeChild(probe);
    return out;
  }

  /* ---------- 采集信息 ---------- */

  function collect() {
    var de = document.documentElement;
    var sc = window.screen || {};
    var vv = window.visualViewport;
    var sa = safeArea();
    var gap = num((sc.height || 0) - window.innerHeight);
    var full = Math.abs(gap) <= 1;
    var L = [];

    L.push('== rua小手机 真机自检 ' + TAG + ' ==');
    L.push('时间 ' + new Date().toLocaleString());
    L.push('UA ' + navigator.userAgent);
    L.push('Capacitor=' + (typeof window.Capacitor !== 'undefined' ? 'yes' : 'no')
      + ' AndroidFileSaver=' + (typeof window.AndroidFileSaver !== 'undefined' ? 'yes' : 'no')
      + ' AndroidNetease=' + (typeof window.AndroidNetease !== 'undefined' ? 'yes' : 'no')
      + ' dpr=' + window.devicePixelRatio);

    L.push('');
    L.push('== 全屏判定 ==');
    L.push('screen   ' + (sc.width || 0) + 'x' + (sc.height || 0)
      + '  avail ' + (sc.availWidth || 0) + 'x' + (sc.availHeight || 0)
      + '  orientation ' + (sc.orientation && sc.orientation.type ? sc.orientation.type : '-'));
    L.push('inner    ' + px(window.innerWidth) + ' x ' + px(window.innerHeight));
    L.push('client   ' + px(de.clientWidth) + ' x ' + px(de.clientHeight)
      + '  scrollY=' + px(window.pageYOffset || 0));
    L.push('visualVP ' + (vv
      ? px(vv.width) + ' x ' + px(vv.height) + ' offsetTop=' + px(vv.offsetTop) + ' scale=' + num(vv.scale)
      : '不支持'));
    L.push('screen.height - innerHeight = ' + px(gap));
    L.push(full
      ? '判定：✅ 真全屏（内容铺到屏幕最顶端）'
      : '判定：❌ 还有 ' + px(gap) + ' 高度没被内容占用（≈状态栏高度时就是顶部那条色带）');

    L.push('');
    L.push('== 关键元素位置 ==');
    L.push(rectLine('#phoneScreen'));
    L.push(rectLine('.phone-frame'));
    L.push(rectLine('.status-bar'));
    L.push(rectLine('.dynamic-island'));
    L.push('body rect top=' + px(document.body ? document.body.getBoundingClientRect().top : 0)
      + ' | html padding=' + window.getComputedStyle(de).padding);

    L.push('');
    L.push('== env(safe-area-inset-*) 实测 ==');
    L.push('top=' + sa[0] + ' bottom=' + sa[1] + ' left=' + sa[2] + ' right=' + sa[3]);
    L.push('（Android WebView 通常全为 0px，页面靠 max(14px, env(...)) 兜底）');

    L.push('');
    L.push('== 文件导出桥 ==');
    L.push('typeof AndroidFileSaver = ' + (typeof window.AndroidFileSaver));
    L.push('saveTextFile  = ' + (window.AndroidFileSaver ? typeof window.AndroidFileSaver.saveTextFile : '无此对象'));
    L.push('saveBase64File= ' + (window.AndroidFileSaver ? typeof window.AndroidFileSaver.saveBase64File : '无此对象'));

    L.push('');
    L.push('== 网易云数据源 ==');
    L.push('typeof AndroidNetease = ' + (typeof window.AndroidNetease));
    L.push('getAsync        = ' + (window.AndroidNetease ? typeof window.AndroidNetease.getAsync : '无此对象'));
    L.push('neFetch / neClassify / neAdapt = ' + (typeof window.neFetch)
      + ' / ' + (typeof window.neClassify) + ' / ' + (typeof window.neAdapt));
    L.push('（有 getAsync → APK 走 L0 原生直连官方接口，含歌词翻译与热评；'
      + '没有则自动降级 L1/L2/L3 第三方镜像源，歌单/搜索/歌词仍在）');

    L.push('');
    L.push('== 日间/夜间主题样式 ==');
    var tls = window.__ruaThemeLightState;
    L.push('主题状态 = ' + (tls ? (tls.light ? '日间' : '夜间') : '未初始化（app 还没跑到 applyTheme）'));
    if (tls) {
      L.push('样式地址 = ' + tls.href);
      L.push('样式表加载 = ' + (tls.light
        ? (tls.loaded ? '✅ 已加载' : (tls.failed ? '❌ 加载失败(404/文件缺失) —— 日间会完全不生效' : '…未确认(可能还在加载)'))
        : '—（夜间不加载）'));
    }
    var tlLink = document.getElementById('themeLightLink');
    L.push('link#themeLightLink = ' + (tlLink ? '存在' : '不存在'));
    if (tlLink) {
      var tlOk = false;
      try { tlOk = !!tlLink.sheet; } catch (e) {}
      L.push('  link.sheet = ' + (tlOk ? '已生效' : '空（样式没挂上，日间就一直是夜间）'));
    }
    /* 实测：日间应该把这些值算成浅色，夜间是深色 —— 一眼能看出主题到底有没有生效 */
    var vwEl = document.getElementById('view-wechat');
    if (vwEl) {
      L.push('#view-wechat class = ' + vwEl.className);
      L.push('#view-wechat 背景 = ' + window.getComputedStyle(vwEl).backgroundColor + '（日间应为 rgb(237, 237, 237)）');
    }
    var lblEl = document.querySelector('.wx-m-label');
    if (lblEl) L.push('.wx-m-label 文字色 = ' + window.getComputedStyle(lblEl).color + '（日间应为 rgb(25, 25, 25)）');

    L.push('');
    L.push('== 其他 ==');
    L.push('display-mode standalone=' + (window.matchMedia
      ? window.matchMedia('(display-mode: standalone)').matches : '-')
      + ' | 视口 meta=' + (function () {
        var m = $('meta[name="viewport"]');
        return m ? m.getAttribute('content') : '未找到';
      })());
    return L.join('\n');
  }
  /* ---------- 面板 DOM ---------- */

  function mkBtn(text, fn, extra) {
    var b = document.createElement('button');
    b.setAttribute('type', 'button');
    b.textContent = text;
    b.setAttribute('style',
      'padding:9px 10px;border:0;border-radius:9px;background:#FF6B9D;color:#fff;'
      + 'font-size:12px;font-weight:700;' + (extra || ''));
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }

  function buildPanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'ruaDiagPanel';
    panel.setAttribute('style',
      'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;'
      + 'display:flex;flex-direction:column;box-sizing:border-box;color:#F7EFF3;'
      + 'background:rgba(24,19,28,.96);padding:10px 10px calc(10px + env(safe-area-inset-bottom));'
      + 'font:12px/1.55 Menlo,Consolas,monospace;-webkit-user-select:text;user-select:text;');

    var head = document.createElement('div');
    head.setAttribute('style', 'display:flex;align-items:center;gap:8px;flex-shrink:0;padding-bottom:8px;');
    var title = document.createElement('div');
    title.textContent = '真机自检 ' + TAG;
    title.setAttribute('style', 'flex:1;font-size:14px;font-weight:700;color:#FFD1DC;');
    head.appendChild(title);
    head.appendChild(mkBtn('关闭', close, 'flex:0 0 auto;'));

    pre = document.createElement('pre');
    pre.setAttribute('style',
      'flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;margin:0;padding:8px;'
      + 'border-radius:9px;background:rgba(255,255,255,.07);white-space:pre-wrap;word-break:break-all;');

    var bar = document.createElement('div');
    bar.setAttribute('style', 'display:flex;gap:6px;flex-shrink:0;padding-top:8px;flex-wrap:wrap;');
    bar.appendChild(mkBtn('刷新', render, 'flex:1 1 0;min-width:68px;'));
    bar.appendChild(mkBtn('测试导出', testExport, 'flex:1 1 0;min-width:68px;'));
    bar.appendChild(mkBtn('测试网易云', testNetease, 'flex:1 1 0;min-width:68px;background:#4A90D9;'));
    bar.appendChild(mkBtn('复制全部', copyAll, 'flex:1 1 0;min-width:68px;'));
    bar.appendChild(mkBtn('复制导出结果', copyTip, 'flex:1 1 0;min-width:68px;background:#7A5C6B;'));

    tipEl = document.createElement('div');
    tipEl.setAttribute('style',
      'flex:0 0 auto;max-height:26vh;overflow:auto;padding-top:8px;font-size:11px;color:#FFD1DC;'
      + 'white-space:pre-wrap;word-break:break-all;');
    tipEl.textContent = '「测试导出」会真的写一个 txt 到系统「下载」目录，并显示原生返回值。';

    panel.appendChild(head);
    panel.appendChild(pre);
    panel.appendChild(bar);
    panel.appendChild(tipEl);
    (document.body || document.documentElement).appendChild(panel);
    return panel;
  }

  function tip(msg) {
    if (tipEl) tipEl.textContent = msg;
  }

  function render() {
    buildPanel();
    pre.textContent = collect();
    panel.style.display = 'flex';
  }

  function open() {
    render();
    taps = 0;
  }

  function close() {
    if (panel) panel.style.display = 'none';
    taps = 0;
  }

  /* ---------- 复制（失败走 textarea 兜底） ---------- */

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('style', 'position:fixed;left:-9999px;top:0;');
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      ta.parentNode.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    if (!text) { tip('没有可复制的内容'); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { tip('已复制到剪贴板（' + text.length + ' 字）'); },
          function () { tip(fallbackCopy(text) ? '已复制（兜底方式）' : '复制失败，请长按选中文本手动复制'); }
        );
        return;
      }
    } catch (e) { /* 继续走兜底 */ }
    tip(fallbackCopy(text) ? '已复制（兜底方式）' : '复制失败，请长按选中文本手动复制');
  }

  function copyAll() { copyText(collect()); }
  function copyTip() { copyText(tipEl ? tipEl.textContent : ''); }

  /* ---------- 一键导出测试 ---------- */

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function testExport() {
    buildPanel();

    var bridge = window.AndroidFileSaver;
    if (!bridge || typeof bridge.saveTextFile !== 'function') {
      tip('❌ AndroidFileSaver 不可用：typeof = ' + (typeof bridge)
        + '，saveTextFile = ' + (bridge ? typeof bridge.saveTextFile : '无此对象')
        + '\n（说明原生注入失败或当前不在 APK 里运行；网页端会退回 Blob 下载）');
      return;
    }

    var name = 'rua-diag-' + stamp() + '.txt';
    var content = 'rua小手机 导出自检 ' + TAG + '\n'
      + '时间：' + new Date().toString() + '\n'
      + 'UA：' + navigator.userAgent + '\n'
      + '视口：' + window.innerWidth + 'x' + window.innerHeight
      + ' screen：' + (window.screen ? window.screen.width + 'x' + window.screen.height : '-') + '\n';

    var ret;
    try {
      ret = bridge.saveTextFile(name, content, 'text/plain');
    } catch (e) {
      ret = 'JS 调用抛异常：' + e;
    }

    tip('已请求保存：' + name + '\n原生返回：' + ret + '\n'
      + '（返回 OK: 之后，打开手机「文件管理 → 下载」应能看到这个文件）');
  }

  /* ---------- 网易云原生直连实测 ---------- */

  // 真机判断「APK 里的网易云到底通没通」的最快方式：直接走原生桥请求一次官方接口。
  // 复用 app-06.js 的 neNativeGet（就是应用实际在用的那条通道，自带 token 与超时管理），
  // 所以这里测通了，就代表应用里的推荐/排行榜/歌词/热评都能拿到数据。
  function testNetease() {
    buildPanel();

    var api = window.AndroidNetease;
    if (!api || typeof api.getAsync !== 'function') {
      tip('❌ AndroidNetease 不可用：typeof = ' + (typeof api)
        + '，getAsync = ' + (api ? typeof api.getAsync : '无此对象')
        + '\n（说明原生注入失败，或当前不在 APK 里运行）\n'
        + '此时网易云会自动降级到第三方镜像源：歌单/搜索/歌词/播放仍有，'
        + '但拿不到歌词翻译和热评。');
      return;
    }
    if (typeof window.neNativeGet !== 'function') {
      tip('❌ 找不到 neNativeGet（js/app-06.js 可能没加载成功）');
      return;
    }

    var url = 'https://music.163.com/api/v1/resource/comments/R_SO_4_347230?limit=1';
    var t0 = Date.now();
    tip('正在通过原生直连请求官方接口…\n' + url);

    window.neNativeGet(url).then(function (r) {
      var n = -1;
      try {
        var d = r.data || {};
        var list = d.hotComments || (d.data && d.data.hotComments) || [];
        n = list.length;
      } catch (e) { /* 结构不同也不影响结论 */ }
      tip('✅ 原生直连成功（' + (Date.now() - t0) + 'ms）\n'
        + '正文 ' + r.text.length + ' 字节，热评 ' + (n < 0 ? '解析失败' : n + ' 条') + '\n'
        + '说明：APK 里的网易云正在走 L0 原生直连官方接口，歌词翻译与热评都可用。');
    }, function (err) {
      tip('❌ 原生直连失败：' + ((err && err.message) ? err.message : err) + '\n'
        + '（应用会自动降级到镜像源 L1/L2/L3：歌单/搜索/歌词/播放仍有，'
        + '但没有歌词翻译和热评）');
    });
  }
  /* ---------- 顶部连点 5 下打开 ---------- */

  function countTap(e) {
    var now = Date.now();
    if (e.type === 'click' && now - lastCounted < 400) {
      return; // touchend 之后合成的 click，同一次点按只算一次
    }

    var y;
    if (e.type === 'touchend') {
      var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
      y = t ? t.clientY : 99999;
    } else {
      y = (typeof e.clientY === 'number') ? e.clientY : 99999;
    }
    if (y > TAP_ZONE) { taps = 0; return; }

    taps = (now - lastTap <= TAP_GAP) ? (taps + 1) : 1;
    lastTap = now;
    lastCounted = now;

    if (taps >= OPEN_TAPS) { taps = 0; open(); }
  }

  function hookTaps() {
    // 捕获阶段监听，且不 preventDefault / 不 stopPropagation，完全不影响页面里既有按钮
    document.addEventListener('touchend', countTap, true);
    document.addEventListener('click', countTap, true);
  }

  /* ---------- 对外接口（便于控制台/脚本调用） ---------- */

  window.ruaDiag = open;
  window.ruaDiagClose = close;
  window.ruaDiagText = function () { return collect(); };
  window.ruaDiagExport = testExport;

  /* ---------- 启动 ---------- */

  function boot() {
    hookTaps();
    try {
      // 地址后加 ?diag=1 自动打开（Capacitor 里是 https://localhost/?diag=1）
      if (/(?:[?&])diag=1(?:&|$)/.test(window.location.search || '')) open();
    } catch (e) { /* 忽略 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
