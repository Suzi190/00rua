/* ============================================================
 * rua小手机 · AI真实生图 + 用户自建MCP 功能模块（独立文件，尽量不改动原有逻辑）
 *  - 生图：AI 回复中的 [照片：描述] 调用用户配置的生图API发出真实图片
 *  - MCP：连接远程 MCP 服务(Streamable HTTP)，读取工具；每个服务可在桌面生成自定义图标APP；
 *         AI 可通过 [tool:名称]{json}[/tool] 标记调用工具并依据结果回复
 * 设计原则：所有对外入口全部 try-catch，任何异常都不得影响原有聊天/桌面功能。
 * ============================================================ */
(function () {
  'use strict';
  if (window.__ruaMcpExtraLoaded) return;
  window.__ruaMcpExtraLoaded = true;

  function cfg() {
    // 根因修复：主程序用 `let config` 声明全局，let/const 不挂 window，window.config 永远是 undefined，
    // 旧写法会凭空 new 一个空对象，导致这里永远读不到用户配置的 imageApi / chatHistory / mcpServers
    // ——表现为“测试接口能过、聊天却永远回退描述图片”、MCP 配置也读不到。
    // let 全局虽不挂 window，但跨 <script> 仍可通过自由变量标识符访问到最新绑定（config 还会被整体重赋值，因此必须每次实时取）。
    try { if (typeof config !== 'undefined' && config) return config; } catch (e) {}
    return window.config || (window.config = {});
  }
  function toast(msg) { try { if (typeof window.showToast === 'function') window.showToast(msg); } catch (e) {} }
  function esc(s) { try { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s); } catch (e) { return String(s); } }
  function save() { try { if (typeof persistConfigThrottled === 'function') persistConfigThrottled(); else if (typeof Store !== 'undefined' && Store.set) Store.set('config', cfg()); } catch (e) {} }
  function uid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // 未上传图标时的默认矢量图（非emoji）
  var DEFAULT_MCP_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>"
    + "<rect width='120' height='120' rx='26' fill='#5B6EE1'/>"
    + "<circle cx='40' cy='42' r='10' fill='#fff'/><circle cx='82' cy='60' r='10' fill='#fff'/><circle cx='44' cy='82' r='10' fill='#fff'/>"
    + "<path d='M48 48 L74 56 M74 64 L52 78' stroke='#fff' stroke-width='5'/></svg>");

  /* ============================================================
   * 一、AI 真实生图
   * ============================================================ */
  // 取当前聊天角色（用于外貌/画风/参考图）
  function activeRole() {
    try {
      var c = cfg();
      if (typeof currentCharIdx !== 'undefined' && Array.isArray(c.characters) && c.characters[currentCharIdx]) return c.characters[currentCharIdx];
      if (c.role && c.role.name) return c.role;
      return null;
    } catch (e) { return null; }
  }
  // 清洗一条聊天文本，只留可读内容（去标签/卡片/思考），用于生图上下文
  function _plainForImg(t) {
    return String(t == null ? '' : t)
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<miyavoice>[\s\S]*?<\/miyavoice>/gi, '')
      .replace(/\[(?:照片|图片|转账|红包|位置|语音|外卖|购物)[：:][^\]]+\]/g, '')
      .replace(/表情包-[^\s]*/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  // 判断照片的人物意图：together=双人/同框，solo=明确单人（together 优先）
  function photoPeopleSpec(d) {
    var t = String(d || '');
    var together = /合照|合影|两人|两个人|二位|俩人|双人|一起|一同|同框|我们|牵手|拥抱|并肩|依偎|挨着|对面|情侣|cp|两个人都|彼此/i.test(t);
    var solo = !together && /单人|一个人|一人|独自|独照|单照|个人照|自拍|特写|正脸|侧脸|侧颜|脸部|近景|他自己|她自己|我自己|本人|只有我|就我|我的一张|我一张|我的照片|单独/i.test(t);
    return { together: together, solo: solo };
  }
  // 角色发图时，按照片描述判定画面主体到底是谁：
  //  - 合照/同框 → role（role 分支会把两人都画上）
  //  - 明确是“你/用户本人”的单人照 → user（只画用户、用用户参考图），修复“要我的单人照却画出角色/双人”
  //  - 其余默认 role（角色自己的照片/自拍）
  function decidePhotoWho(desc) {
    var spec = photoPeopleSpec(desc);
    if (spec.together) return 'role';
    var uname = '';
    try { var _u = cfg().user; uname = (_u && (_u.personaName || _u.name) || '').trim(); } catch (e) {}
    var userHit = /你的?|拍你|给你拍|用户|玩家|对方/.test(desc) || (uname && desc.indexOf(uname) >= 0);
    if (userHit && spec.solo) return 'user';
    if (userHit && !/我的?|自己|本人自拍/.test(desc)) return 'user';
    return 'role';
  }
  // 局部把“绘制中…”气泡替换成成品图，避免整张消息列表 innerHTML 重建导致大图反复解码、一张张蹦
  function patchImageBubble(arrIdx, url) {
    try {
      var nodes = document.querySelectorAll('#chatMessages [data-msg-idx="' + arrIdx + '"]');
      if (!nodes.length) return false;
      nodes.forEach(function (b) {
        b.style.background = 'transparent'; b.style.padding = '0';
        b.innerHTML = '<img loading="lazy" decoding="async" class="msg-image" src="' + url + '" style="max-width:200px;border-radius:10px;display:block" onclick="previewImage(this.src)" alt="">';
      });
      return true;
    } catch (e) { return false; }
  }
  // 生图提示词 = 照片描述 + 按“谁是主体/几个人”注入对应外貌画风 + 最近对话情境
  // who: 'role'=角色发图(默认,主体是角色)；'user'=用户主动生图(主体是用户)
  function buildImagePrompt(desc, who) {
    who = who || 'role';
    var p = String(desc || '');
    var spec = photoPeopleSpec(p);
    var role = activeRole();
    var u = null; try { u = cfg().user; } catch (e) {}
    var wantRole, wantUser, peopleNote = '';
    if (who === 'user') {
      // 用户主动生图：默认主体就是用户本人且为单人；只有明确合照才带入当前角色
      wantUser = true;
      wantRole = spec.together;
      if (spec.together) peopleNote = '本张为双人/同框照，画面中必须同时包含用户本人与该角色两个人，不要多画其他人';
      else peopleNote = '本张为用户本人的单人照，画面中只有用户一个人，严禁出现对话中的该角色或其他任何人物，严禁画成两人/多人';
    } else {
      // 角色发图：以角色为默认主体，只有明确合照/同框才把用户画进去（修复“说了单人照却出双人”）
      wantRole = true;
      wantUser = spec.together;
      if (spec.together) peopleNote = '本张为双人/同框照，画面中包含该角色与用户本人两个人，不要多画其他人';
      else if (spec.solo) peopleNote = '本张为单人照，画面中只有该角色一个人，不要出现用户/玩家或其他任何人，严禁画成两人';
      else peopleNote = '只按描述安排人物，不要添加描述之外的额外人物，尤其不要凭空把用户/玩家画入画面';
    }
    // 人数硬约束提到最前（紧跟画面描述），优先于形象资料与对话情境，避免被上下文带偏成双人
    if (peopleNote) p += '\n【人数要求·最高优先级，必须严格遵守】' + peopleNote;
    if (wantRole && role) {
      var bits = [];
      if (role.persona && String(role.persona).trim()) bits.push('角色设定（据此把握人物身份、气质与画面氛围）：' + String(role.persona).trim().slice(0, 320));
      if (role.nickname || role.name) bits.push('该角色名：' + (role.nickname || role.name));
      if (role.gender) bits.push('性别：' + role.gender);
      if (role.appearance && String(role.appearance).trim()) bits.push('若画面中出现角色本人，其形象必须严格一致：' + String(role.appearance).trim());
      if (role.artStyle && String(role.artStyle).trim()) bits.push('角色相关形象画风/质感：' + String(role.artStyle).trim());
      if (bits.length) p += '\n' + bits.join('\n');
    }
    // 用户形象：仅在需要用户入镜时注入（合照 / 用户主动生图），单人角色照绝不注入，避免诱导成双人
    if (wantUser && u) {
      var ubits = [];
      var uname = u.personaName || u.name || '用户';
      if (u.appearance && String(u.appearance).trim()) ubits.push('画面中出现的用户本人（即与角色对话的“我/玩家”，名字：' + uname + '）形象必须严格一致：' + String(u.appearance).trim());
      if (u.artStyle && String(u.artStyle).trim()) ubits.push('用户本人相关形象画风/质感：' + String(u.artStyle).trim());
      if (ubits.length) p += '\n' + ubits.join('\n');
    }
    // 最近对话情境
    try {
      var ch = cfg().chatHistory || [];
      var ctx = [];
      for (var i = ch.length - 1; i >= 0 && ctx.length < 6; i--) {
        var m = ch[i];
        if (!m || m.role === 'system' || m.type) continue;
        var t = _plainForImg(m.content);
        if (t) ctx.push((m.role === 'user' ? '用户' : '角色') + '：' + t.slice(0, 60));
      }
      if (ctx.length) {
        ctx.reverse();
        p += '\n【这张图来自以下最近对话，画面场景、情绪与对话情境吻合，但人物数量以上方“人数要求”为准】' + ctx.join(' / ').slice(0, 420);
      }
    } catch (e) {}
    return p.slice(0, 1700);
  }
  function dataURLtoBlob(dataurl) {
    var arr = String(dataurl).split(','), mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
    var bstr = atob(arr[1]), len = bstr.length, u8 = new Uint8Array(len);
    while (len--) u8[len] = bstr.charCodeAt(len);
    return new Blob([u8], { type: mime });
  }
  async function text2Image(im, prompt) {
    var url = im.baseUrl.replace(/\/+$/, '') + '/images/generations';
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + im.apiKey },
      body: JSON.stringify({ model: im.model, prompt: prompt, n: 1, size: '1024x1024' })
    });
    if (!res.ok) {
      var t = '';
      try { t = await res.text(); } catch (e) {}
      return { ok: false, err: 'HTTP ' + res.status + ' ' + t.substring(0, 120) };
    }
    var data = await res.json();
    var item = data && data.data && data.data[0];
    var img = item ? (item.url || (item.b64_json ? 'data:image/png;base64,' + item.b64_json : '')) : '';
    if (!img) return { ok: false, err: '接口未返回图片' };
    return { ok: true, url: img };
  }
  // 图生图（OpenAI 兼容 images/edits）；不支持/失败由调用方回退文生图
  async function tryImageEdit(im, refs, prompt) {
    try {
      if (!Array.isArray(refs)) refs = [refs];
      refs = refs.filter(Boolean);
      if (!refs.length) return { ok: false, err: '无参考图' };
      var fd = new FormData();
      refs.forEach(function (rf, ri) {
        var ext = String(rf).indexOf('image/png') >= 0 ? 'png' : 'jpg';
        fd.append('image', dataURLtoBlob(rf), 'ref' + ri + '.' + ext);
      });
      fd.append('model', im.model);
      fd.append('prompt', prompt);
      fd.append('n', '1');
      fd.append('size', '1024x1024');
      var res = await fetch(im.baseUrl.replace(/\/+$/, '') + '/images/edits', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + im.apiKey },
        body: fd
      });
      if (!res.ok) { var t = ''; try { t = await res.text(); } catch (e) {} return { ok: false, err: 'edits HTTP ' + res.status + ' ' + t.substring(0, 100) }; }
      var data = await res.json();
      var item = data && data.data && data.data[0];
      var img = item ? (item.url || (item.b64_json ? 'data:image/png;base64,' + item.b64_json : '')) : '';
      if (!img) return { ok: false, err: 'edits未返回图片' };
      return { ok: true, url: img };
    } catch (e) { return { ok: false, err: 'edits异常:' + e.message }; }
  }
  async function generateImageByPrompt(promptText, who) {
    who = who || 'role';
    var im = cfg().imageApi || {};
    if (!im.baseUrl || !im.apiKey) {
      return { ok: false, err: '未配置生图API(缺地址或Key)' };
    }
    var finalPrompt = buildImagePrompt(promptText, who);
    var spec = photoPeopleSpec(promptText);
    var role = activeRole();
    var wantRole = (who === 'user') ? spec.together : true;
    var wantUser = (who === 'user') ? true : spec.together;
    // 参考图按“谁入镜”收集；仅本地 dataURL 可走 images/edits
    var refs = [];
    if (wantRole && role && Array.isArray(role.refImages) && role.refImages[0] && String(role.refImages[0]).indexOf('data:image') === 0) refs.push(role.refImages[0]);
    if (wantUser) {
      try {
        var _u = cfg().user;
        if (_u && Array.isArray(_u.refImages) && _u.refImages[0] && String(_u.refImages[0]).indexOf('data:image') === 0) refs.push(_u.refImages[0]);
      } catch (e) {}
    }
    if (refs.length) {
      var er = await tryImageEdit(im, refs, finalPrompt);
      if (er.ok) return er;
      console.warn('[生图] 图生图不可用，回退文生图:', er.err);
    }
    return text2Image(im, finalPrompt);
  }

  // 取当前私聊消息数组（群聊/NPC第一版不做生图与工具，安全跳过）
  function activeChat() {
    try {
      var c = cfg();
      if (typeof isGroupChatMode !== 'undefined' && isGroupChatMode) return null;
      if (typeof isNpcChatMode !== 'undefined' && isNpcChatMode) return null;
      if (!Array.isArray(c.chatHistory)) return null;
      return {
        arr: c.chatHistory,
        persist: function () {
          try { save(); if (typeof syncCharHistory === 'function') syncCharHistory(); } catch (e) {}
        },
        redraw: function () {
          try { if (typeof renderMessages === 'function') renderMessages(); if (typeof scrollChatToBottom === 'function') scrollChatToBottom(); } catch (e) {}
        }
      };
    } catch (e) { return null; }
  }

  var PHOTO_RE = /\[照片[：:]([^\]]+)\]/g;

  // 角色发图方式判定：
  //  - 只有用户在角色设置里【手动点选】过(imageModeManual=true)，才严格按其选择 real/describe 锁定；
  //  - 否则（含旧版本被自动写死成 describe 的老角色）一律按图片API是否可用自动决定：配好且测试可用就发真图。
  //  这样修复“先存过角色、后配API，结果被锁死成描述图片”的问题。
  function roleHasImgApi(im) { return !!(im && im.baseUrl && im.apiKey); } /* 模型名可留空，由接口默认 */
  function roleWantsRealPhoto(role, im) {
    if (role && role.imageModeManual === true) {
      return role.imageMode === 'real'; // 用户显式选择，describe 即描述、real 即真图
    }
    return roleHasImgApi(im); // 自动：有可用API就真图
  }
  // 兼容多种照片标记：[照片：x] / [图片:x] / 【照片：x】，提取描述并返回清除标记后的正文
  function extractPhotoTags(text) {
    var descs = [];
    var cleaned = String(text == null ? '' : text);
    cleaned = cleaned.replace(/\[(?:照片|图片|相片|发图)[：:]\s*([^\]]+)\]/g, function (_, d) { if (d && d.trim()) descs.push(d.trim()); return ''; });
    cleaned = cleaned.replace(/【(?:照片|图片|相片|发图)[：:]\s*([^】]+)】/g, function (_, d) { if (d && d.trim()) descs.push(d.trim()); return ''; });
    return { descs: descs, cleaned: cleaned.replace(/\n{3,}/g, '\n\n').trim() };
  }
  // 真图失败时把该张照片还原成文字“照片卡片”，保证用户至少看得到描述，而不是图和文字一起消失
  function restoreDescribeTag(chat, lastMsg, desc) {
    try {
      var tag = '[照片：' + desc + ']';
      if (String(lastMsg.content || '').indexOf(tag) < 0) {
        lastMsg.content = (lastMsg.content ? lastMsg.content + '\n' : '') + tag;
      }
      chat.persist(); chat.redraw();
    } catch (e) {}
  }
  // 处理一条 AI 回复里的真实生图
  function processPhotos(chat, lastMsg) {
    if (!lastMsg || typeof lastMsg.content !== 'string') return;
    var im = cfg().imageApi || {};
    var ex = extractPhotoTags(lastMsg.content);
    if (!ex.descs.length) return;
    var role = null;
    try { role = activeRole(); } catch (e) {}
    if (!role) { try { role = cfg().role || null; } catch (e) {} }
    var mode = role && role.imageMode;
    console.log('[生图] 检测到照片', ex.descs.length, '张；角色=', (role && role.name) || '?', '；发图方式=', mode || '智能', '；API=', im.baseUrl ? ('已配' + (im.model ? '(含model)' : '(无model)')) : '未配');
    if (!roleWantsRealPhoto(role, im)) {
      // 描述模式：保留标记，交给渲染层做“照片卡片”
      return;
    }
    // 想发真图，但连 baseUrl/apiKey 都没有 → 回退描述，并给一次可见提示（限频，避免刷屏）
    if (!(im.baseUrl && im.apiKey)) {
      console.warn('[生图] 角色选了真实图片，但未配置图片API(baseUrl/apiKey)，回退描述图片');
      if (!window.__realImgTipAt || Date.now() - window.__realImgTipAt > 60000) {
        window.__realImgTipAt = Date.now();
        toast('该角色设为真实图片，但图片生成API未配置完整，已临时用描述图片');
      }
      return;
    }
    var descs = ex.descs;
    console.log('[生图] 开始真实出图 ' + descs.length + ' 张');
    // 从原文字消息中移除照片标记（避免与真图重复的假卡片）
    lastMsg.content = ex.cleaned;
    // 先把全部“绘制中”占位插入，最后只整体重绘一次，避免多图时连续 N 次全量重绘
    descs.forEach(function (desc) {
      var who = decidePhotoWho(desc);
      var placeholder = { role: 'assistant', type: 'image', content: '[image]', time: Date.now(), _genDesc: desc, _imgLoading: true };
      var idx = chat.arr.push(placeholder) - 1;
      generateImageByPrompt(desc, who).then(function (r) {
        var msg = chat.arr[idx];
        if (!msg) return;
        if (r.ok) {
          msg.content = '[image]' + r.url;
          msg._imgLoading = false; delete msg._genDesc;
          chat.persist();
          // 优先只替换这一条气泡，不动其它已生成图片，避免全量重绘造成的卡顿/闪烁；找不到再整体重绘兜底
          if (!patchImageBubble(idx, r.url)) chat.redraw();
          try { if (typeof scrollChatToBottom === 'function') scrollChatToBottom(); } catch (e) {}
        } else {
          // 失败：移除占位，并把这张图还原成文字描述照片卡片，不让内容凭空消失
          chat.arr.splice(chat.arr.indexOf(msg), 1);
          restoreDescribeTag(chat, lastMsg, desc);
          console.warn('[生图] 真实出图失败，已回退描述卡片：', r.err);
        }
      }).catch(function (e) {
        var msg = chat.arr[idx];
        if (msg) chat.arr.splice(chat.arr.indexOf(msg), 1);
        restoreDescribeTag(chat, lastMsg, desc);
        console.warn('[生图] 真实出图异常，已回退描述卡片：', e && e.message);
      });
    });
    chat.persist(); chat.redraw();
    try { if (typeof scrollChatToBottom === 'function') scrollChatToBottom(); } catch (e) {}
  }

  /* ============================================================
   * 二、MCP 客户端（JSON-RPC 2.0 over Streamable HTTP）
   * ============================================================ */
  function mcpServers() { var c = cfg(); if (!Array.isArray(c.mcpServers)) c.mcpServers = []; return c.mcpServers; }

  // 解析“每行一个 Key: Value”的自定义请求头
  function parseCustomHeaders(text) {
    var out = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) {
        var k = line.slice(0, i).trim();
        var v = line.slice(i + 1).trim();
        if (k) out[k] = v;
      }
    });
    return out;
  }
  function parseRpcBody(text) {
    if (!text) return null;
    // SSE 形式：事件以空行分隔，一个事件的 data 可能跨多行，需拼接
    if (text.indexOf('data:') !== -1 || text.indexOf('event:') !== -1) {
      var blocks = text.split(/\r?\n\r?\n/);
      for (var b = blocks.length - 1; b >= 0; b--) {
        var dataLines = [];
        blocks[b].split(/\r?\n/).forEach(function (ln) {
          var t = ln.replace(/^\s+/, '');
          if (t.indexOf('data:') === 0) dataLines.push(t.slice(5).trim());
        });
        if (dataLines.length) {
          try {
            var o = JSON.parse(dataLines.join(''));
            if (o && (o.result !== undefined || o.error !== undefined || o.id !== undefined)) return o;
          } catch (e) {}
        }
      }
      return null;
    }
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  var _rpcSeq = 1000;
  async function mcpRpc(server, method, params, isNotification) {
    // 标准 MCP Streamable HTTP 请求头
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-03-26'
    };
    if (server.apiKey) headers['Authorization'] = 'Bearer ' + server.apiKey;
    if (server._sessionId) headers['Mcp-Session-Id'] = server._sessionId;
    // 合并用户自定义请求头（可覆盖上面的任意头，例如 x-api-key / 自定义 Authorization）
    try {
      var custom = parseCustomHeaders(server.headersText);
      Object.keys(custom).forEach(function (k) { headers[k] = custom[k]; });
    } catch (e) {}
    var body = { jsonrpc: '2.0', method: method, params: params || {} };
    if (!isNotification) { _rpcSeq++; body.id = _rpcSeq; }
    var endpoint = String(server.url || '').trim().replace(/\/+$/, '');
    var res;
    try {
      res = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    } catch (netErr) {
      // 浏览器层面直接失败，基本都是 CORS / 网络 / 地址问题
      var _em = netErr && netErr.message || 'Failed to fetch';
        throw new Error('浏览器跨域(CORS)被拦截或地址不可达：' + _em + '。该MCP服务端未对网页开放跨域，直连连不上属正常——请用 Cloudflare Worker 反代地址（给服务端补上跨域头），在Worker的UPSTREAM环境变量填真实MCP地址，小手机里改填Worker地址即可。');
    }
    var sid = res.headers.get('Mcp-Session-Id') || res.headers.get('mcp-session-id');
    if (sid) server._sessionId = sid;
    if (res.status === 202 && isNotification) return { ok: true };
    var text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('认证失败 HTTP ' + res.status + '：请在“令牌”或“自定义请求头”里提供正确的 Authorization / API-Key。 ' + text.substring(0, 120));
      if (res.status === 404 || res.status === 405) throw new Error('地址或方法不对 HTTP ' + res.status + '：请确认填的是 MCP 的 Streamable HTTP 端点(通常以 /mcp 结尾)，而不是网页地址。');
      throw new Error('HTTP ' + res.status + ' ' + text.substring(0, 150));
    }
    if (isNotification) return { ok: true };
    var o = parseRpcBody(text);
    if (!o) throw new Error('已连通但返回内容不是 MCP 协议(JSON-RPC)。请确认这是 Streamable HTTP 类型的 MCP 端点；旧版 SSE 传输(GET+POST双端点)暂不支持。原始返回：' + text.substring(0, 120));
    if (o.error) throw new Error((o.error.message || 'MCP错误') + (o.error.code ? ' (' + o.error.code + ')' : ''));
    return { ok: true, result: o.result };
  }

  async function mcpConnect(server) {
    server._sessionId = null;
    var init = await mcpRpc(server, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'rua-phone', version: '1.0' }
    });
    await mcpRpc(server, 'notifications/initialized', {}, true);
    var tl = await mcpRpc(server, 'tools/list', {});
    var tools = (tl.result && Array.isArray(tl.result.tools)) ? tl.result.tools : [];
    server.tools = tools.map(function (t) {
      return { name: t.name, description: t.description || '', inputSchema: t.inputSchema || { type: 'object', properties: {} } };
    });
    server.connected = true;
    return server.tools;
  }

  async function mcpCallTool(server, toolName, args) {
    // 确保有会话
    if (!server.connected) { await mcpConnect(server); }
    var r = await mcpRpc(server, 'tools/call', { name: toolName, arguments: args || {} });
    var result = r.result || {};
    var out = [];
    if (Array.isArray(result.content)) {
      result.content.forEach(function (c) {
        if (c && c.type === 'text' && c.text) out.push(c.text);
        else if (c && c.text) out.push(c.text);
      });
    }
    return { text: out.join('\n') || '(工具无文本输出)', isError: !!result.isError };
  }

  function findToolAnywhere(toolName) {
    var list = mcpServers();
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s.connected || !Array.isArray(s.tools)) continue;
      for (var j = 0; j < s.tools.length; j++) {
        if (s.tools[j].name === toolName) return { server: s, tool: s.tools[j] };
      }
    }
    return null;
  }

  /* ============================================================
   * 三、AI 工具调用（标记式 agent loop，兼容任意 OpenAI 风格接口）
   * ============================================================ */
  var TOOL_RE = /\[tool[：:]([^\]]+)\]([\s\S]*?)\[\/tool\]/i;

  function buildMcpToolPrompt() {
    var list = mcpServers().filter(function (s) { return s.connected && s.tools && s.tools.length; });
    if (!list.length) return '';
    var lines = ['=== 可用外部工具（MCP）===',
      '当且仅当需要这些工具才能回答时，在回复【最末尾】单独用如下格式调用一个工具（一次最多一个）：',
      '[tool:工具名]',
      '{"参数名":"参数值"}',
      '[/tool]',
      '参数必须是合法JSON，且严格符合该工具要求；不需要工具时不要输出该标记。可用工具：'];
    list.forEach(function (s) {
      s.tools.forEach(function (t) {
        var schema = '';
        try { schema = ' 参数' + JSON.stringify(t.inputSchema && t.inputSchema.properties ? t.inputSchema.properties || {} : {}); } catch (e) {}
        lines.push('- 「' + s.name + '」的工具 ' + t.name + '：' + (t.description || '').substring(0, 200) + schema);
      });
    });
    return lines.join('\n');
  }

  async function processToolCall(chat, lastMsg, depth) {
    if (depth > 1) return;
    if (!lastMsg || typeof lastMsg.content !== 'string') return;
    var mm = TOOL_RE.exec(lastMsg.content);
    if (!mm) return;
    var toolName = mm[1].trim();
    var argText = (mm[2] || '').trim();
    // 从已存AI消息中移除工具标记（用户看不到内部标记）
    lastMsg.content = lastMsg.content.replace(TOOL_RE, '').trim();
    var found = findToolAnywhere(toolName);
    var toolResultText;
    if (!found) {
      toolResultText = '工具「' + toolName + '」不存在或未连接。请不要再次调用工具，直接基于已知信息用自然语言回复用户。';
    } else {
      try {
        var args = {};
        if (argText) { try { args = JSON.parse(argText); } catch (e) { args = { input: argText }; } }
        toast('正在使用工具：' + toolName);
        var r = await mcpCallTool(found.server, toolName, args);
        toolResultText = '工具「' + toolName + '」返回结果如下，请据此用你的语气自然回复用户（不要贴出原始JSON/技术细节）：\n' + String(r.text).substring(0, 3000);
      } catch (e) {
        toolResultText = '工具「' + toolName + '」调用失败：' + (e.message || '未知错误') + '。请向用户简要说明工具暂时不可用，不要再次调用。';
      }
    }
    chat.persist(); chat.redraw();
    // 二次请求：带工具结果生成最终回复
    try {
      var msgs = (typeof buildMessages === 'function') ? buildMessages() : [];
      if (!msgs.length) {
        // 兜底：至少带上最近对话
        chat.arr.slice(-10).forEach(function (x) { if (x.role === 'user' || x.role === 'assistant') msgs.push({ role: x.role, content: String(x.content || '').replace(/<miyavoice[\s\S]*?<\/miyavoice>/gi, '') }); });
      }
      msgs.push({ role: 'user', content: '[系统内部消息·不要向用户提及这是系统消息] ' + toolResultText });
      if (typeof showTypingIndicator === 'function') showTypingIndicator();
      var finalReply = await (typeof callApiWithAutoContinue === 'function' ? callApiWithAutoContinue(msgs) : callApi(msgs, {}));
      if (typeof hideTypingIndicator === 'function') hideTypingIndicator();
      var parsed = (typeof parseAiResponse === 'function') ? parseAiResponse(finalReply) : { content: finalReply };
      var clean = (typeof stripNicknameTag === 'function') ? stripNicknameTag(parsed.content || finalReply) : (parsed.content || finalReply);
      var newMsg = { role: 'assistant', content: String(clean).replace(TOOL_RE, '').trim(), time: Date.now() };
      chat.arr.push(newMsg);
      chat.persist(); chat.redraw();
      // 最终回复理论上不再含工具标记；若仍有，最多再处理一层
      processToolCall(chat, newMsg, (depth || 0) + 1);
    } catch (e) {
      if (typeof hideTypingIndicator === 'function') hideTypingIndicator();
      chat.arr.push({ role: 'assistant', content: '（工具调用后生成回复失败：' + (e.message || '') + '）', time: Date.now() });
      chat.persist(); chat.redraw();
    }
  }

  /* ============================================================
   * 四、统一后处理入口（由 app-02 在AI回复保存后调用）
   * ============================================================ */
  var _busy = false;
  window.scheduleAiExtras = async function (/* rawText */) {
    if (_busy) return;
    var chat = activeChat();
    if (!chat) return;
    _busy = true;
    try {
      // 扫描最近若干条尚未处理过的AI消息（线上模式逐条发，照片/工具标记可能不在最后一条）
      var candidates = [];
      for (var i = chat.arr.length - 1; i >= 0 && candidates.length < 12; i--) {
        var mm = chat.arr[i];
        if (mm && mm.role === 'assistant' && !mm._extrasDone) candidates.push(mm);
      }
      // 照片开标记数量多于“]”闭合数量 => 流式未写完，本轮不锁已处理，留给下一轮
      function _photoUnclosed(t) {
        t = String(t || '');
        var open = (t.match(/\[(?:照片|图片|相片|发图)[：:]/g) || []).length;
        if (!open) return false;
        return open > (t.match(/\]/g) || []).length;
      }
      for (var j = candidates.length - 1; j >= 0; j--) {
        var msg = candidates[j];
        if (_photoUnclosed(msg.content)) continue; // 等下一轮，避免漏掉还没写完的照片标记
        msg._extrasDone = true;
        try { processPhotos(chat, msg); await processToolCall(chat, msg, 0); } catch (e) { console.warn('extras item error:', e); }
      }
    } catch (e) { console.warn('scheduleAiExtras error:', e); }
    finally { setTimeout(function () { _busy = false; }, 500); }
  };

  /* ============================================================
   * 五、把 MCP 工具说明注入 AI 的 system prompt（hook callApi）
   * ============================================================ */
  try {
    if (typeof window.callApi === 'function' && !window.__mcpCallApiHooked) {
      var _origCallApi = window.callApi;
      window.callApi = async function (messages, options) {
        try {
          var toolPrompt = buildMcpToolPrompt();
          if (toolPrompt && Array.isArray(messages) && messages.length) {
            // 找到 system 消息追加；没有则插入
            var sysIdx = -1;
            for (var i = 0; i < messages.length; i++) { if (messages[i] && messages[i].role === 'system') { sysIdx = i; break; } }
            if (sysIdx >= 0) messages[sysIdx].content = String(messages[sysIdx].content || '') + '\n\n' + toolPrompt;
            else messages.unshift({ role: 'system', content: toolPrompt });
          }
        } catch (e) {}
        return _origCallApi.apply(this, arguments);
      };
      window.__mcpCallApiHooked = true;
    }
  } catch (e) { console.warn('MCP callApi hook fail:', e); }

  // hook openApp：复用原生桌面点击通道打开MCP应用
  try {
    if (typeof window.openApp === 'function' && !window.__mcpOpenAppHooked) {
      var _origOpenApp = window.openApp;
      window.openApp = function (id) {
        if (typeof id === 'string' && id.indexOf('mcp:') === 0) {
          var k = id.slice(4);
          if (k === '__add__') openMcpPanel(null); else openMcpServerApp(k);
          return;
        }
        return _origOpenApp.apply(this, arguments);
      };
      window.__mcpOpenAppHooked = true;
    }
  } catch (e) { console.warn('MCP openApp hook fail:', e); }

  /* ============================================================
   * 六、桌面自定义 APP 图标注入（hook renderHomeScreen，自动填补空格）
   * ============================================================ */
  function iconHtml(s) {
    // 统一使用真实图片（用户上传优先，否则用默认矢量图），不再用“底色+emoji”
    var img = s.iconImage || DEFAULT_MCP_ICON;
    return '<div class="app-icon" style="background:#ffffff;overflow:hidden;padding:0"><img src="' + img + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/></div>';
  }

  window.openMcpServerApp = function (id) {
    var s = mcpServers().filter(function (x) { return x.id === id; })[0];
    if (!s) { toast('应用不存在'); return; }
    openMcpPanel(s);
  };

  function injectMcpHomeIcons() {
    try {
      var list = mcpServers().filter(function (s) { return s.connected && s.addToHome !== false; });
      /* HV2 固定版式：应用块 2×2 已固定 4 格（同人 / 约稿 / 购物 / 论坛），
         块高固定且 align-content:start、无 overflow:hidden —— 多塞第 5 个图标会溢出到格子外，
         因此这里只在还有空位时补位（整块满则跳过注入，MCP 应用仍可在「设置 → MCP 应用管理」中使用）。 */
      var area = document.querySelector('#appGrid0 .hv2-apps[data-slot="doujin,commission,shop,social"]')
              || document.querySelector('.home-widget-area[data-page="p1"]');
      if (!area) return;
      // 清掉旧的注入
      var old = area.querySelectorAll('.app-item[data-app-id^="mcp:"]');
      for (var k = 0; k < old.length; k++) old[k].parentNode.removeChild(old[k]);
      // 剩余空位＝4 格 − 固定图标数（同人/约稿/购物/论坛）
      var fixed = area.querySelectorAll('.app-item:not([data-app-id^="mcp:"])').length;
      var room = 4 - fixed;
      if (room <= 0) { console.debug('MCP: 首页应用块已满（' + fixed + ' 格），跳过桌面图标注入'); return; }
      list.slice(0, room).forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'app-item';
        item.dataset.appId = 'mcp:' + s.id;
        item.innerHTML = iconHtml(s) + '<span class="app-name">' + esc(s.name || 'MCP应用') + '</span>';
        (function(sid){ item.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openMcpServerApp(sid); }, true); })(s.id);
        area.appendChild(item); // grid auto-flow 自动填补空位
      });
    } catch (e) { console.warn('injectMcpHomeIcons:', e); }
  }

  /* 暴露给 HV2 固定版式：照片/便签变化时会重绘应用块，需要顺手补回注入的图标 */
  try { window.__mcpInjectHomeIcons = injectMcpHomeIcons; } catch (e) {}

  try {
    if (typeof window.renderHomeScreen === 'function' && !window.__mcpHomeHooked) {
      var _origRHS = window.renderHomeScreen;
      window.renderHomeScreen = function () {
        var r;
        try { r = _origRHS.apply(this, arguments); } catch (e) { console.error(e); throw e; }
        try { injectMcpHomeIcons(); } catch (e) {}
        return r;
      };
      window.__mcpHomeHooked = true;
    }
  } catch (e) {}

  /* ============================================================
   * 七、MCP 管理/应用面板（纯JS弹窗）
   * ============================================================ */
  function openMcpPanel(server) {
    var existing = document.getElementById('mcpExtraPanel');
    if (existing) existing.parentNode.removeChild(existing);
    var overlay = document.createElement('div');
    overlay.id = 'mcpExtraPanel';
    overlay.className = 'modal-overlay show';
    overlay.style.cssText = 'display:flex;position:fixed;inset:0;z-index:99999;';
    var isEdit = !!server;
    var s = server ? JSON.parse(JSON.stringify(server)) : { id: uid(), name: '', url: '', apiKey: '', headersText: '', icon: '🔧', iconBg: '#4A90E2', iconImage: '', addToHome: true };

    function toolListHtml() {
      if (!s.tools || !s.tools.length) return '<div style="color:#999;font-size:12px;padding:8px 0">尚未连接，没有工具</div>';
      return s.tools.map(function (t, i) {
        return '<div style="border:1px solid #eee;border-radius:10px;padding:8px;margin-bottom:6px">'
          + '<div style="font-weight:600;font-size:13px">' + esc(t.name) + '</div>'
          + '<div style="color:#888;font-size:11px;margin:2px 0 6px">' + esc((t.description || '无描述').substring(0, 120)) + '</div>'
          + '<button data-mcp-tool="' + i + '" style="font-size:11px;padding:4px 10px;background:#07C160;color:#fff;border:0;border-radius:6px">手动调用</button>'
          + '<div data-mcp-tool-out="' + i + '"></div></div>';
      }).join('');
    }

    overlay.innerHTML =
      '<div class="modal-content" style="max-width:360px;width:92%;max-height:86vh;overflow-y:auto">'
      + '<div class="modal-header"><div class="modal-title">' + (isEdit ? 'MCP 应用' : '连接 MCP 服务') + '</div><div class="modal-close" data-mcp-close>×</div></div>'
      + '<div style="padding:4px 2px">'
      + '<label class="form-label" style="display:block;font-size:12px;color:#666;margin:8px 0 2px">应用名称（桌面显示）</label>'
      + '<input id="mcpName" class="form-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px" value="' + esc(s.name) + '" placeholder="例如：我的天气助手"/>'
      + '<label class="form-label" style="display:block;font-size:12px;color:#666;margin:8px 0 2px">MCP 服务地址（Streamable HTTP，https://…）</label>'
      + '<input id="mcpUrl" class="form-input" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px" value="' + esc(s.url) + '" placeholder="https://example.com/mcp"/>'
      + '<label class="form-label" style="display:block;font-size:12px;color:#666;margin:8px 0 2px">API Key / 令牌（没有可留空）</label>'
      + '<input id="mcpKey" class="form-input" type="password" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px" value="' + esc(s.apiKey) + '"/>'
      + '<label class="form-label" style="display:block;font-size:12px;color:#666;margin:10px 0 2px">自定义请求头（可选，每行一个，格式 名称: 值）</label>'
      + '<textarea id="mcpHeaders" rows="3" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:8px;font-size:12px;resize:vertical;outline:none;box-sizing:border-box;font-family:monospace" placeholder="X-API-Key: 你的密钥&#10;Authorization: Bearer 令牌&#10;X-Source: web">' + esc(s.headersText || '') + '</textarea>'
      + '<label class="form-label" style="display:block;font-size:12px;color:#666;margin:10px 0 4px">APP 图标（上传正方形真实图片）</label>'
      + '<div style="display:flex;align-items:center;gap:12px">'
      + '<img id="mcpIconPreview" src="' + (s.iconImage || DEFAULT_MCP_ICON) + '" style="width:54px;height:54px;border-radius:13px;object-fit:cover;border:1px solid #eee"/>'
      + '<button type="button" id="mcpIconUploadBtn" class="form-input" style="width:auto;padding:8px 16px;cursor:pointer">上传图片</button>'
      + '<input type="file" id="mcpIconFile" accept="image/*" style="display:none"/>'
      + '</div>'
      + '<div id="mcpConnState" style="font-size:12px;margin:8px 0;color:' + (s.connected ? '#3d9b6c' : '#e08a2e') + '">' + (s.connected ? '✅ 已连接，' + (s.tools ? s.tools.length : 0) + ' 个工具' : '⚠️ 未连接') + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">'
      + '<button id="mcpConnectBtn" style="flex:1;min-width:120px;padding:9px;background:#07C160;color:#fff;border:0;border-radius:8px">连接并获取工具</button>'
      + '<button id="mcpSaveBtn" style="flex:1;min-width:120px;padding:9px;background:#576B95;color:#fff;border:0;border-radius:8px">保存并加到桌面</button>'
      + (isEdit ? '<button id="mcpDelBtn" style="padding:9px 14px;background:#fff;color:#d45d79;border:1px solid #d45d79;border-radius:8px">删除</button>' : '')
      + '</div>'
      + '<div id="mcpToolsWrap" style="margin-top:6px">' + toolListHtml() + '</div>'
      + '<div style="font-size:11px;color:#aaa;margin-top:10px;line-height:1.5">说明：仅支持可从浏览器直连的远程MCP服务；若连接报错，多为服务端未允许跨域(CORS)或地址/协议不对。本地(stdio)MCP无法在网页中使用。</div>'
      + '</div></div>';
    document.body.appendChild(overlay);

    function repaintTools() {
      var w = overlay.querySelector('#mcpToolsWrap');
      if (w) w.innerHTML = toolListHtml();
      var st = overlay.querySelector('#mcpConnState');
      if (st) { st.textContent = (s.connected ? '✅ 已连接，' + (s.tools ? s.tools.length : 0) + ' 个工具' : '⚠️ 未连接'); st.style.color = s.connected ? '#3d9b6c' : '#e08a2e'; }
      bindToolBtns();
    }
    function readForm() {
      s.name = overlay.querySelector('#mcpName').value.trim();
      s.url = overlay.querySelector('#mcpUrl').value.trim();
      s.apiKey = overlay.querySelector('#mcpKey').value.trim();
      s.headersText = overlay.querySelector('#mcpHeaders') ? overlay.querySelector('#mcpHeaders').value : '';
      // iconImage 由上传控件写入 s.iconImage
      if (!s.iconImage) s.iconImage = DEFAULT_MCP_ICON;
    }
    function bindToolBtns() {
      var btns = overlay.querySelectorAll('[data-mcp-tool]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].onclick = function () {
          var idx = parseInt(this.getAttribute('data-mcp-tool'), 10);
          var t = s.tools[idx];
          var out = overlay.querySelector('[data-mcp-tool-out="' + idx + '"]');
          if (!t) return;
          var argStr = window.prompt('调用工具「' + t.name + '」，请输入JSON参数（无参数可留空/填{}）', '{}');
          if (argStr === null) return;
          var args = {};
          try { args = argStr.trim() ? JSON.parse(argStr) : {}; } catch (e) { toast('JSON格式不正确'); return; }
          if (out) out.innerHTML = '<div style="font-size:11px;color:#999;margin-top:6px">调用中…</div>';
          // 用最新保存的server（含session）
          var live = mcpServers().filter(function (x) { return x.id === s.id; })[0];
          var target = live || s;
          mcpCallTool(target, t.name, args).then(function (r) {
            if (out) out.innerHTML = '<div style="font-size:11px;white-space:pre-wrap;background:#f6f6f6;border-radius:8px;padding:6px;margin-top:6px;max-height:160px;overflow:auto">' + esc(r.text.substring(0, 1500)) + '</div>';
          }).catch(function (e) { if (out) out.innerHTML = '<div style="font-size:11px;color:#d45d79;margin-top:6px">' + esc(e.message) + '</div>'; });
        };
      }
    }
    bindToolBtns();

    // 图标上传
    (function () {
      var upBtn = overlay.querySelector('#mcpIconUploadBtn');
      var fileInput = overlay.querySelector('#mcpIconFile');
      var preview = overlay.querySelector('#mcpIconPreview');
      if (upBtn && fileInput) {
        upBtn.onclick = function () { fileInput.click(); };
        fileInput.onchange = function () {
          var f = fileInput.files && fileInput.files[0];
          if (!f) return;
          if (f.size > 4 * 1024 * 1024) { toast('图片请控制在4MB内'); return; }
          var reader = new FileReader();
          reader.onload = function (e) {
            s.iconImage = e.target.result;
            if (preview) preview.src = s.iconImage;
          };
          reader.readAsDataURL(f);
        };
      }
    })();

    overlay.querySelector('[data-mcp-close]').onclick = function () { overlay.parentNode && overlay.parentNode.removeChild(overlay); };
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.parentNode.removeChild(overlay); });

    overlay.querySelector('#mcpConnectBtn').onclick = async function () {
      readForm();
      if (!s.url) { toast('请填写MCP地址'); return; }
      var btn = overlay.querySelector('#mcpConnectBtn');
      btn.textContent = '连接中…'; btn.disabled = true;
      try {
        var tools = await mcpConnect(s);
        // 写回列表（含session）
        var liveIdx = mcpServers().findIndex(function (x) { return x.id === s.id; });
        var persistable = JSON.parse(JSON.stringify(s)); delete persistable._sessionId;
        if (liveIdx >= 0) mcpServers()[liveIdx] = persistable; else mcpServers().push(persistable);
        save();
        toast('连接成功，发现 ' + tools.length + ' 个工具');
      } catch (e) {
        s.connected = false;
        toast('连接失败：' + (e.message || ''));
        var st = overlay.querySelector('#mcpConnState');
        if (st) { st.textContent = '❌ ' + (e.message || '连接失败'); st.style.color = '#d45d79'; }
      } finally {
        btn.textContent = '连接并获取工具'; btn.disabled = false;
        // 同步s内工具到UI
        s.connected = (mcpServers().filter(function(x){return x.id===s.id;})[0]||{}).connected || s.connected;
        var live2 = mcpServers().filter(function(x){return x.id===s.id;})[0];
        if (live2) { s.tools = live2.tools; }
        repaintTools();
      }
    };

    overlay.querySelector('#mcpSaveBtn').onclick = function () {
      readForm();
      if (!s.name) { toast('请填写应用名称'); return; }
      var persistable = JSON.parse(JSON.stringify(s)); delete persistable._sessionId;
      var idx = mcpServers().findIndex(function (x) { return x.id === s.id; });
      if (idx >= 0) mcpServers()[idx] = persistable; else mcpServers().push(persistable);
      save();
      if (typeof renderHomeScreen === 'function') renderHomeScreen();
      overlay.parentNode.removeChild(overlay);
      toast('已保存，桌面已添加「' + s.name + '」');
    };

    var delBtn = overlay.querySelector('#mcpDelBtn');
    if (delBtn) delBtn.onclick = function () {
      if (!window.confirm('确定删除这个MCP应用？')) return;
      var list = mcpServers();
      for (var i = 0; i < list.length; i++) if (list[i].id === s.id) { list.splice(i, 1); }
      save();
      if (typeof renderHomeScreen === 'function') renderHomeScreen();
      overlay.parentNode.removeChild(overlay);
      toast('已删除');
    };
  }
  window.openMcpPanel = openMcpPanel;

  // 用户主动生图：复用同一套（角色+用户外貌/画风/参考图 + 上下文）出图，返回 {ok,url,err}
  window.mochiUserGenImage = async function (desc) {
    try {
      var im = cfg().imageApi || {};
      if (!im.baseUrl || !im.apiKey) return { ok: false, err: '未配置图片生成API（设置→图片生成API）' };
      return await generateImageByPrompt(String(desc || ''), 'user');
    } catch (e) { return { ok: false, err: e.message || '生成失败' }; }
  };

  // 暴露一个“添加MCP应用”的全局入口（可被设置页/控制台调用）
  window.addMcpApp = function () { openMcpPanel(null); };

  // 启动后刷新一次桌面图标
  try { document.addEventListener('DOMContentLoaded', function () { setTimeout(injectMcpHomeIcons, 1200); }); } catch (e) {}
  setTimeout(function () { try { injectMcpHomeIcons(); } catch (e) {} }, 1500);

})();
