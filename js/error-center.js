/* =====================================================================
 * rua小手机 · 统一报错中心（纯增量，不改动任何原有业务流程）
 *  - diagnoseError：把任意错误翻译成“人话标题 + 解决建议 + 技术详情”
 *  - reportError ：记录并弹出直观诊断框（可复制详情 / 重试）
 *  - 错误日志中心：最近 50 条，持久化在 IndexedDB(key=error_log)，设置里可查看/复制/清空
 *  - 全局兜底：window error / unhandledrejection 只记录不打扰，并在设置入口显示数量
 *  本模块所有逻辑均做自保护，绝不让“报错功能”本身抛出异常影响主程序。
 * ===================================================================== */
(function () {
  'use strict';
  if (window.RuaErrorCenter && window.RuaErrorCenter.__installed) return;

  var MAX_LOG = 50;
  var _logs = [];
  var _logLoaded = false;
  var _lastPersist = 0;
  var _dedup = {};          // 相同错误 10s 内去重（全局兜底用）
  var _lastOverlayRec = null;

  function safeStr(v) { try { return (v === undefined || v === null) ? '' : String(v); } catch (e) { return ''; } }
  function nowTs() { return Date.now(); }
  function fmtTime(t) { try { var d = new Date(t); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); } catch (e) { return ''; } }

  /* ---------- 持久化（直连 IndexedDB，失败也不影响） ---------- */
  function persistLogs(force) {
    try {
      if (typeof _idbSet !== 'function') return;
      var t = nowTs();
      if (!force && t - _lastPersist < 1500) return;
      _lastPersist = t;
      _idbSet('error_log', _logs.slice(-MAX_LOG));
    } catch (e) {}
  }
  function loadLogs(cb) {
    try {
      if (_logLoaded) { cb && cb(); return; }
      if (typeof _idbGet === 'function') {
        Promise.resolve(_idbGet('error_log')).then(function (v) {
          try { if (Array.isArray(v)) _logs = v; } catch (e) {}
          _logLoaded = true; updateEntryBadge(); cb && cb();
        }, function () { _logLoaded = true; cb && cb(); });
      } else { _logLoaded = true; cb && cb(); }
    } catch (e) { _logLoaded = true; cb && cb(); }
  }

  /* ---------- 错误分类诊断 ---------- */
  function toMessage(err) {
    if (err === undefined || err === null) return '未知错误';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    try { return JSON.stringify(err); } catch (e) { return safeStr(err); }
  }
  function diagnoseError(err, context) {
    var raw = toMessage(err);
    var m = raw || '未知错误';
    var low = m.toLowerCase();
    var ctx = safeStr(context);
    var isImg = /生图|绘图|画图|图片生成|image|draw|t2i|i2i/i.test(ctx);
    var isTts = /语音|配音|朗读|tts|voice|speech|minimax|elevenlabs/i.test(ctx);

    var kind = 'unknown', icon = '⚠️', title = '出现未知错误', level = 'error', advice = [];

    if (/aborterror|超时|timeout|timed out/i.test(m)) {
      kind = 'timeout'; icon = '⏱️'; title = '响应超时，没等到 API 回复';
      advice = ['点「重试」再发一次，多半就能成功', '检查网络是否通畅，或换一个响应更快的模型 / 中转站', '上下文、记忆、图片太多会明显变慢，可适当精简', '若一直超时，到设置里确认接口地址是否正确'];
    } else if (/failed to fetch|networkerror|load failed|网络连接失败|无法连接|err_connection|断网|network request failed/i.test(m)) {
      kind = 'network'; icon = '📡'; title = '无法连接到接口服务器';
      advice = ['检查「设置 → AI接口」的接口地址(BaseURL)是否填错，末尾不要再加 /chat/completions', '确认当前网络能访问该地址（部分官方接口需要特殊网络环境）', '若用中转站，确认其服务正常、没有欠费或停服', '接口地址需为 https，且复制时不要带空格或换行'];
    } else if (/cors|cross.origin|跨域|access-control-allow-origin/i.test(m)) {
      kind = 'cors'; icon = '🚧'; title = '被跨域策略拦截 (CORS)';
      advice = ['浏览器不能直接调用这个接口，需要服务商/中转站开启跨域允许', '换用明确支持“浏览器网页直接调用”的 API 中转服务', '让对方在响应头加上 Access-Control-Allow-Origin 即可解决'];
    } else if (/\b401\b|\b403\b|unauthorized|forbidden|密钥无效|无权限|invalid api|invalid token|authentication/i.test(m)) {
      kind = 'auth'; icon = '🔑'; title = 'API 密钥无效或没有权限';
      advice = ['到「设置 → AI接口」重新填写正确的 API Key', '检查 Key 是否复制完整、没有多余空格或换行', '确认该 Key 未被禁用、对应账户仍有额度', '用中转站时，Key 必须是中转站签发的，不能填官方的 Key'];
    } else if (/\b429\b|rate limit|频率超限|too many requests|限流|配额不足|insufficient|quota|余额|欠费/i.test(m)) {
      kind = 'ratelimit'; icon = '🚦'; title = '请求太频繁 / 额度不足';
      advice = ['先等几秒，再点「重试」', '确认账户余额或令牌额度是否充足', '适当降低主动消息、群聊多人同时回复的频率', '中转站可能做了限速，具体可咨询服务商'];
    } else if (/\b400\b|\b422\b|参数错误|bad request|invalid request|model.*not|does not exist|不存在/i.test(m)) {
      kind = 'badrequest'; icon = '📝'; title = '请求参数或模型名有误';
      advice = ['最常见是模型名填错：到设置里核对模型名，要和接口支持的完全一致（区分大小写）', '不支持图片的模型不要传参考图，不支持的参数也会报 400', '聊天/记忆过长可能超出上下文，可清理部分记录或调小 max_tokens', '展开下方「技术详情」可看到接口返回的具体原因'];
    } else if (/\b50[0-9]\b|bad gateway|gateway timeout|服务器异常|service unavailable|internal server error/i.test(m)) {
      kind = 'server'; icon = '🛠️'; title = '对方 API 服务器异常';
      advice = ['这是接口服务端的问题，不是你设置的问题，稍后点「重试」即可', '若长时间如此，换一个模型或中转站', '可查看服务商状态页，确认是否正在维护'];
    } else if (/非json|json格式|json.parse|unexpected token|返回格式|格式异常|parse|解析失败|expected/i.test(low + m)) {
      kind = 'format'; icon = '🧩'; title = '接口返回的内容无法解析';
      advice = ['确认 BaseURL 指向的是 OpenAI 兼容的对话接口，而不是网页地址', '核对模型名，确认该模型是可用的对话模型', '可尝试在设置里关闭/开启“流式输出”对比测试', '技术详情里保留了原始返回，方便复制给开发者'];
    } else if (/空内容|empty|没有返回内容/i.test(m)) {
      kind = 'empty'; icon = '💭'; title = 'AI 返回了空内容';
      advice = ['点「重试」再发一次', '可能触发了内容审核，换个说法再试', '检查系统规则与人设是否相互冲突，导致模型无法正常输出'];
    } else if (/quota|exceeded|存储空间|存储.*满|localstorage|indexeddb|space|内存不足/i.test(m)) {
      kind = 'storage'; icon = '💾'; title = '浏览器本地存储空间不足';
      advice = ['图片、表情包、聊天记录会占满存储，可先导出备份再清理一部分', '尽量用系统自带浏览器，第三方内置浏览器/无痕模式配额很小', '清理长期不用的聊天、壁纸与大图后刷新页面'];
    } else if (/permission|notallowed|denied|权限|麦克风|通知权限/i.test(m)) {
      kind = 'permission'; icon = '🔒'; title = '浏览器权限被拒绝或未授权';
      advice = ['到浏览器的站点设置里，允许对应的通知/麦克风等权限', 'iPhone 需用 Safari「分享 → 添加到主屏幕」，再从桌面图标打开', '授权弹窗出现时请选择“允许”'];
    } else if (isImg) {
      kind = 'imagegen'; icon = '🎨'; title = '生图失败';
      advice = ['检查「设置 → 生图API」的地址、Key、模型是否正确', '确认接口为 OpenAI 兼容的 /images/generations 格式', '参考图过大可能失败，可压缩后再上传', '展开技术详情查看接口返回的报错'];
    } else if (isTts) {
      kind = 'tts'; icon = '🔊'; title = '语音合成失败';
      advice = ['检查语音(TTS)接口配置，以及所选模型与音色是否匹配', '要朗读的文字太长可能失败，可让角色说短一点', '个别音色只支持特定模型，请换组合再试'];
    } else {
      kind = 'unknown'; icon = '⚠️'; title = '出现了一个错误';
      advice = ['可以先点「重试」', '如果反复出现，点「复制详情」把信息发给开发者排查', '刷新页面通常能恢复，数据有自动备份，不会丢'];
    }

    var stack = '';
    try { stack = err && err.stack ? safeStr(err.stack).split('\n').slice(0, 6).join('\n') : ''; } catch (e) {}
    var technical = '【场景】' + (ctx || '未标注') +
      '\n【时间】' + fmtTime(nowTs()) +
      '\n【类型】' + kind +
      '\n【原始报错】' + m +
      (stack ? '\n【堆栈】\n' + stack : '');

    return { kind: kind, icon: icon, title: title, level: level, advice: advice, technical: technical, raw: m };
  }

  /* ---------- 记录日志 ---------- */
  function addLog(rec) {
    try {
      _logs.push(rec);
      if (_logs.length > MAX_LOG) _logs = _logs.slice(-MAX_LOG);
      persistLogs(false);
      updateEntryBadge();
    } catch (e) {}
  }
  function updateEntryBadge() {
    try {
      var el = document.getElementById('ruaErrLogBadge');
      if (!el) return;
      var n = _logs.length;
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = n ? 'inline-flex' : 'none';
    } catch (e) {}
  }

  /* ---------- 复制（带降级） ---------- */
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { showMiniTip('已复制到剪贴板'); }, function () { _copyFallback(text); });
      } else { _copyFallback(text); }
    } catch (e) { _copyFallback(text); }
  }
  function _copyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      showMiniTip(ok ? '已复制到剪贴板' : '复制失败，请手动长按选择');
    } catch (e) { showMiniTip('复制失败'); }
  }
  var _miniTimer = null;
  function showMiniTip(txt) {
    try {
      if (typeof showToast === 'function') { showToast(txt); return; }
      var el = document.getElementById('ruaMiniTip');
      if (!el) { el = document.createElement('div'); el.id = 'ruaMiniTip'; document.body.appendChild(el); }
      el.textContent = txt; el.classList.add('show');
      clearTimeout(_miniTimer);
      _miniTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
    } catch (e) {}
  }

  /* ---------- 构建弹窗骨架（只建一次） ---------- */
  function ensureDom() {
    if (document.getElementById('ruaErrorOverlay')) return;
    var style = document.createElement('style');
    style.textContent =
      '.rua-err-sheet{max-height:86%;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '.rua-err-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
      '.rua-err-icon{font-size:26px;line-height:1}' +
      '.rua-err-title{font-size:17px;font-weight:700;flex:1;line-height:1.35}' +
      '.rua-err-ctx{font-size:12px;opacity:.6;margin:2px 2px 10px}' +
      '.rua-err-summary{font-size:13.5px;line-height:1.6;margin:0 2px 10px}' +
      '.rua-err-advice{margin:0 0 12px}' +
      '.rua-err-advice .a-item{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.55;background:rgba(128,128,128,.12);border-radius:10px;padding:8px 10px;margin-bottom:6px}' +
      '.rua-err-advice .a-idx{flex:0 0 auto;font-weight:700;opacity:.7}' +
      '.rua-err-tech{margin:0 0 14px;font-size:12px}' +
      '.rua-err-tech summary{opacity:.7;cursor:pointer;padding:4px 2px}' +
      '.rua-err-tech pre{white-space:pre-wrap;word-break:break-all;background:rgba(128,128,128,.12);border-radius:10px;padding:10px;font-size:11.5px;line-height:1.5;max-height:180px;overflow:auto;margin:6px 0 0;font-family:ui-monospace,Menlo,Consolas,monospace}' +
      '.rua-err-btns{display:flex;gap:8px;flex-wrap:wrap}' +
      '.rua-err-btns button{flex:1;min-width:90px}' +
      '.rua-log-item{background:rgba(128,128,128,.10);border-radius:10px;padding:9px 11px;margin-bottom:8px}' +
      '.rua-log-top{display:flex;justify-content:space-between;gap:8px;align-items:center}' +
      '.rua-log-title{font-size:13px;font-weight:600;flex:1}' +
      '.rua-log-time{font-size:11px;opacity:.55;flex:0 0 auto}' +
      '.rua-log-ctx{font-size:11.5px;opacity:.6;margin-top:3px}' +
      '.rua-log-pre{white-space:pre-wrap;word-break:break-all;font-size:11px;line-height:1.5;margin-top:6px;display:none;font-family:ui-monospace,Menlo,Consolas,monospace}' +
      '.rua-log-item.open .rua-log-pre{display:block}' +
      '.rua-log-empty{text-align:center;opacity:.55;font-size:13px;padding:36px 10px}' +
      '#ruaErrLogBadge{display:none;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#E0708A;color:#fff;font-size:11px;font-weight:600;margin-left:auto;margin-right:6px}' +
      '#ruaMiniTip{position:fixed;left:50%;bottom:14%;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:9px 16px;border-radius:20px;font-size:13px;z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80%}' +
      '#ruaMiniTip.show{opacity:1}';
    document.head.appendChild(style);

    var ov = document.createElement('div');
    ov.className = 'modal-overlay'; ov.id = 'ruaErrorOverlay';
    ov.innerHTML =
      '<div class="modal-sheet rua-err-sheet">' +
        '<div class="modal-handle"></div>' +
        '<div class="rua-err-head"><span class="rua-err-icon"></span><div class="rua-err-title"></div></div>' +
        '<div class="rua-err-ctx"></div>' +
        '<div class="rua-err-summary"></div>' +
        '<div class="rua-err-advice"></div>' +
        '<details class="rua-err-tech"><summary>技术详情（反馈给开发者时点这里）</summary><pre></pre></details>' +
        '<div class="rua-err-btns">' +
          '<button class="btn-secondary" data-act="copy">复制详情</button>' +
          '<button class="btn-primary" data-act="retry" style="display:none">重试</button>' +
          '<button class="btn-primary" data-act="ok">我知道了</button>' +
        '</div>' +
      '</div>';
    (document.getElementById('phoneFrame') || document.body).appendChild(ov);
    try { ov.style.zIndex = '10000'; } catch (e) {}
    ov.addEventListener('click', function (e) { if (e.target === ov) hideOverlay(); });
    ov.querySelector('[data-act=ok]').addEventListener('click', hideOverlay);
    ov.querySelector('[data-act=copy]').addEventListener('click', function () { if (_lastOverlayRec) copyText(_lastOverlayRec.diag.technical); });
    ov.querySelector('[data-act=retry]').addEventListener('click', function () {
      var fn = _lastOverlayRec && _lastOverlayRec.onRetry; hideOverlay();
      if (typeof fn === 'function') { try { fn(); } catch (e) {} }
    });

    var log = document.createElement('div');
    log.className = 'modal-overlay'; log.id = 'ruaErrorLogOverlay';
    log.innerHTML =
      '<div class="modal-sheet rua-err-sheet">' +
        '<div class="modal-handle"></div>' +
        '<div class="modal-title">问题诊断 · 错误日志</div>' +
        '<div class="modal-close" data-act="closelog">×</div>' +
        '<div style="font-size:12px;opacity:.6;line-height:1.6;margin:4px 2px 10px">这里记录最近 ' + MAX_LOG + ' 条异常。遇到问题时可点「全部复制」发给开发者。</div>' +
        '<div id="ruaErrorLogList"></div>' +
        '<div class="rua-err-btns" style="margin-top:6px">' +
          '<button class="btn-secondary" data-act="copyall">全部复制</button>' +
          '<button class="btn-secondary" data-act="clear">清空日志</button>' +
          '<button class="btn-primary" data-act="closelog2">关闭</button>' +
        '</div>' +
      '</div>';
    (document.getElementById('phoneFrame') || document.body).appendChild(log);
    try { log.style.zIndex = '10000'; } catch (e) {}
    log.addEventListener('click', function (e) { if (e.target === log) hideLog(); });
    log.querySelector('[data-act=closelog]').addEventListener('click', hideLog);
    log.querySelector('[data-act=closelog2]').addEventListener('click', hideLog);
    log.querySelector('[data-act=copyall]').addEventListener('click', function () {
      if (!_logs.length) { showMiniTip('暂无日志'); return; }
      var text = _logs.map(function (r) { return '----------\n' + r.technical; }).join('\n');
      copyText(text);
    });
    log.querySelector('[data-act=clear]').addEventListener('click', function () {
      if (!_logs.length) { showMiniTip('日志已经是空的'); return; }
      if (!confirm('确定清空全部错误日志吗？')) return;
      _logs = []; persistLogs(true); renderLogList(); updateEntryBadge(); showMiniTip('已清空');
    });
  }

  function showOverlay(rec) {
    try {
      ensureDom();
      _lastOverlayRec = rec;
      var ov = document.getElementById('ruaErrorOverlay');
      ov.querySelector('.rua-err-icon').textContent = rec.diag.icon;
      ov.querySelector('.rua-err-title').textContent = rec.diag.title;
      ov.querySelector('.rua-err-ctx').textContent = rec.context ? '发生位置：' + rec.context : '';
      ov.querySelector('.rua-err-summary').textContent = rec.diag.raw && rec.diag.raw !== rec.diag.title ? rec.diag.raw : '';
      var ab = ov.querySelector('.rua-err-advice'); ab.innerHTML = '';
      rec.diag.advice.forEach(function (a, i) {
        var d = document.createElement('div'); d.className = 'a-item';
        d.innerHTML = '<span class="a-idx">' + (i + 1) + '.</span><span></span>';
        d.lastChild.textContent = a; ab.appendChild(d);
      });
      ov.querySelector('.rua-err-tech pre').textContent = rec.diag.technical;
      ov.querySelector('.rua-err-tech').removeAttribute('open');
      var rb = ov.querySelector('[data-act=retry]');
      rb.style.display = typeof rec.onRetry === 'function' ? '' : 'none';
      ov.classList.add('show');
    } catch (e) {}
  }
  function hideOverlay() { try { var o = document.getElementById('ruaErrorOverlay'); if (o) o.classList.remove('show'); } catch (e) {} }

  /* ---------- 主入口 ---------- */
  function reportError(err, opts) {
    try {
      opts = opts || {};
      var diag = diagnoseError(err, opts.context || opts.where || '');
      var rec = {
        t: nowTs(),
        context: safeStr(opts.context || opts.where || ''),
        kind: diag.kind,
        title: diag.title,
        diag: diag,
        technical: diag.technical,
        onRetry: (typeof opts.onRetry === 'function') ? opts.onRetry : null
      };
      addLog(rec);
      // silent：只记录不弹窗（如群聊单个成员失败、全局兜底）
      if (!opts.silent) showOverlay(rec);
      else try { console.warn('[错误中心·已记录]', opts.context || '', diag.raw); } catch (e) {}
      return diag;
    } catch (e) { return null; }
  }

  /* ---------- 日志中心 ---------- */
  function renderLogList() {
    try {
      var box = document.getElementById('ruaErrorLogList');
      if (!box) return;
      if (!_logs.length) { box.innerHTML = '<div class="rua-log-empty">暂时没有记录到错误 👍</div>'; return; }
      box.innerHTML = '';
      for (var i = _logs.length - 1; i >= 0; i--) {
        (function (r) {
          var item = document.createElement('div'); item.className = 'rua-log-item';
          var top = document.createElement('div'); top.className = 'rua-log-top';
          var tt = document.createElement('div'); tt.className = 'rua-log-title';
          tt.textContent = (r.diag ? r.diag.icon : '⚠️') + ' ' + (r.title || '错误');
          var tm = document.createElement('div'); tm.className = 'rua-log-time'; tm.textContent = fmtTime(r.t);
          top.appendChild(tt); top.appendChild(tm);
          var ctx = document.createElement('div'); ctx.className = 'rua-log-ctx';
          ctx.textContent = (r.context ? '位置：' + r.context + '　' : '') ;
          var pre = document.createElement('pre'); pre.className = 'rua-log-pre'; pre.textContent = r.technical || '';
          item.appendChild(top); if (r.context) item.appendChild(ctx); item.appendChild(pre);
          item.addEventListener('click', function () { item.classList.toggle('open'); });
          box.appendChild(item);
        })(_logs[i]);
      }
    } catch (e) {}
  }
  function openLog() {
    try {
      ensureDom();
      var ov = document.getElementById('ruaErrorLogOverlay');
      loadLogs(function () { renderLogList(); });
      renderLogList();
      ov.classList.add('show');
    } catch (e) {}
  }
  function hideLog() { try { var o = document.getElementById('ruaErrorLogOverlay'); if (o) o.classList.remove('show'); } catch (e) {} }

  /* ---------- 全局兜底：只记录、不打断 ---------- */
  function isDup(key) {
    var t = nowTs();
    if (_dedup[key] && t - _dedup[key] < 10000) return true;
    _dedup[key] = t; return false;
  }
  function bootGlobalCatch() {
    try {
      window.addEventListener('error', function (e) {
        try {
          if (e && e.target && e.target !== window && (e.target.tagName === 'IMG' || e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) return; // 资源加载错误不刷屏
          var msg = (e && (e.message) || safeStr(e)) || '运行时错误';
          var loc = (e && e.filename) ? ('\n位置:' + e.filename + ':' + e.lineno + ':' + e.colno) : '';
          var pseudo = new Error(msg + loc);
          if (isDup('e:' + msg)) return;
          reportError(pseudo, { context: '页面运行时', silent: true });
        } catch (_) {}
      }, true);
      window.addEventListener('unhandledrejection', function (e) {
        try {
          var r = e && e.reason;
          var msg = (r && r.message) ? r.message : safeStr(r) || '未处理的异步错误';
          if (isDup('p:' + msg)) return;
          reportError(r instanceof Error ? r : new Error(msg), { context: '异步任务(Promise)', silent: true });
        } catch (_) {}
      });
    } catch (e) {}
  }

  /* ---------- 控制台兜底：把「只 console 一声就被吞掉」的异常也记进日志 ----------
     背景：openApp / 各渲染函数大量 try-catch 里只写了 console.error，手机上看不到控制台，
     于是出现“点了没反应、日志里也什么都没有”的无法取证情况。这里接管 console.error
     （以及带 Error 对象的 console.warn）自动入档。带 _inHook 重入锁，日志本身绝不会再触发记录。 */
  var _inHook = false;
  var _warnDedup = {};
  function consoleMsgOf(args) {
    var parts = [], errObj = null;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a instanceof Error) { if (!errObj) errObj = a; parts.push(a.message || String(a)); }
      else if (a && typeof a === 'object') { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(safeStr(a)); } }
      else parts.push(safeStr(a));
    }
    return { msg: parts.join(' ').replace(/\s+/g, ' ').slice(0, 300), err: errObj };
  }
  function hookConsole(level, args) {
    if (_inHook) return;                                  // 重入保护：报错中心自己打的日志不再入档
    _inHook = true;
    try {
      var got = consoleMsgOf(args), msg = got.msg;
      if (!msg) return;
      // 已有专门通道的，不重复记录（全局错误、报错中心自身的输出、真机自检）
      if (/^(?:\[全局错误\]|全局错误|\[错误中心|\[RuaErrorCenter|\[rua-diag\])/.test(msg)) return;
      if (level === 'warn') {
        // warn 数量很大（通话降级/摄像头回退等），只在带 Error 对象时记录，且 60 秒内同文去重，
        // 避免把真正有价值的错误从最近 50 条里挤出去。重要的 warn 请直接用 RuaErrorCenter.report 上报。
        if (!got.err) return;
        var t = nowTs(), wk = 'cw:' + msg;
        if (_warnDedup[wk] && t - _warnDedup[wk] < 60000) return;
        _warnDedup[wk] = t;
      } else if (isDup('ce:' + msg)) return;
      reportError(got.err || new Error(msg), { context: 'console.' + level, silent: true });
    } catch (e) {} finally { _inHook = false; }
  }
  function bootConsoleHook() {
    try {
      if (console.__ruaHooked) return;
      var origError = console.error.bind(console), origWarn = console.warn.bind(console);
      console.error = function () { try { hookConsole('error', arguments); } catch (e) {} return origError.apply(null, arguments); };
      console.warn = function () { try { hookConsole('warn', arguments); } catch (e) {} return origWarn.apply(null, arguments); };
      console.__ruaHooked = true;
    } catch (e) {}
  }

  /* ---------- 安装 ---------- */
  function install() {
    ensureDom();
    loadLogs();
    bootGlobalCatch();
    bootConsoleHook();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  var API = {
    __installed: true,
    report: reportError,
    diagnose: diagnoseError,
    openLog: openLog,
    hideLog: hideLog,
    logs: function () { return _logs.slice(); }
  };
  window.RuaErrorCenter = API;
  window.reportError = reportError;        // 兼容通用命名
  window.RuaReportError = reportError;
})();

