/* ============================================================
 * world-accounts.js  多世界 · 多账号 · 角色微信 · 微信助手
 * 设计：外壳多账号、内核单活动会话。
 *  - config.worlds[]：多个世界，每世界含多个“用户人设账号” users[]
 *  - 角色仍在 config.characters，用 worldId 归属世界，补 wxPassword/socialData/risk
 *  - config.waSession = {worldId, kind:'user'|'char', refId} 当前登录身份
 *  - 用户账号登录：把该账号字段装载进 config.user，现有微信内核零改动
 *  - 角色账号登录：进入本模块自渲染的“角色微信”，数据独立于用户微信，互不污染
 * ============================================================ */
(function () {
  'use strict';
  if (window.WA && window.WA.__installed) return;
  var WA = {}; window.WA = WA;
  function C() { return (typeof config !== 'undefined') ? config : null; }
  function S() { try { return (typeof Store !== 'undefined') ? Store : null; } catch (e) { return null; } }
  function save() { try { var s = S(); if (s) s.set('config', C()); } catch (e) {} }
  function esc(t) { return (typeof escapeHtml === 'function') ? escapeHtml(String(t == null ? '' : t)) : String(t == null ? '' : t).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]; }); }
  function toast(m, t) { try { if (typeof showToast === 'function') return showToast(m, t); } catch (e) {} }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- 稳定伪随机（按种子生成，刷新不变） ---------- */
  function hashStr(str) {
    var h = 2166136261; str = String(str || '');
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  function seededRnd(seed) {
    var s = hashStr(seed) || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  /* 角色微信密码：创建即按“名字+人设”稳定生成 字母+数字 8~10 位 */
  function genWxPassword(seedName, seedPersona) {
    var rnd = seededRnd('wxpwd:' + (seedName || '') + '|' + (seedPersona || ''));
    var letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
    var digits = '0123456789';
    var len = 8 + Math.floor(rnd() * 3); // 8-10
    var out = '';
    for (var i = 0; i < len; i++) {
      if (i === 2 || i === len - 2) out += digits[Math.floor(rnd() * digits.length)];
      else out += letters[Math.floor(rnd() * letters.length)];
    }
    return out;
  }
  WA.genWxPassword = genWxPassword;

  /* ---------- 世界 / 账号访问 ---------- */
  function worlds() { var c = C(); if (!c.worlds || !Array.isArray(c.worlds)) c.worlds = []; return c.worlds; }
  function defaultWorld() {
    var ws = worlds();
    var d = ws.filter(function (w) { return w.isDefault; })[0] || ws[0];
    // 默认世界固定 id='default'：缺 worldId 的老角色/老群聊天然归属默认世界，避免随机 id 造成误隐藏
    if (!d) { d = { id: 'default', name: '默认世界', isDefault: true, createdAt: Date.now(), users: [] }; ws.unshift(d); }
    return d;
  }
  function currentWorld() {
    var c = C(); var ws = worlds();
    var w = null;
    if (c.waSession && c.waSession.worldId) w = ws.filter(function (x) { return x.id === c.waSession.worldId; })[0];
    return w || defaultWorld();
  }
  WA.currentWorld = currentWorld;
  function worldChars(wid) {
    var c = C(); wid = wid || currentWorld().id;
    // 只按世界归属列角色；不看 deletedFromWechat（那是某用户账号的好友视图标记，与“可登录的角色账号”无关）
    return (c.characters || []).filter(function (ch) { return ch && (ch.worldId || defaultWorld().id) === wid; });
  }
  WA.worldChars = worldChars;
  function findUserAcc(id) {
    var ws = worlds();
    for (var i = 0; i < ws.length; i++) { var u = (ws[i].users || []).filter(function (x) { return x.id === id; })[0]; if (u) return u; }
    return null;
  }
  function accountWorld(acc) {
    if (!acc) return null;
    var ws = worlds();
    for (var i = 0; i < ws.length; i++) {
      if ((ws[i].users || []).some(function (u) { return u === acc || String(u.id) === String(acc.id); })) return ws[i];
    }
    return null;
  }
  // 账号的所属世界以 worlds[].users[] 中的真实位置为准。
  // 旧存档账号没有 _worldId；若沿用当前会话世界，切回旧账号时会被误判为仍在新世界。
  function normalizeAccountWorldIds() {
    worlds().forEach(function (w) {
      (w.users || []).forEach(function (u) { if (u) u._worldId = w.id || 'default'; });
    });
  }
  function session() { var c = C(); if (!c.waSession) c.waSession = null; return c.waSession; }

  /* 用户账号需要随账号走、切换不丢的全部字段（与 app-02 中 config.user.* 赋值点保持一致） */
  var USER_FIELDS = ['name', 'personaName', 'wxName', 'wxId', 'avatar', 'persona',
    'personaRelations', 'appearance', 'artStyle', 'phoneNumber', 'refImages', 'savedImages',
    'wallet', 'walletHistory', 'relations'];
  // 兼容别名/历史字段，随账号一起存取，避免重进丢失
  var USER_ALIAS_FIELDS = ['nickname', 'bio'];
  function userHasContent(u) {
    if (!u || typeof u !== 'object') return false;
    return USER_FIELDS.concat(USER_ALIAS_FIELDS).some(function (f) {
      var v = u[f];
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    });
  }
  function cloneVal(v) { return Array.isArray(v) ? v.slice() : v; }
  /* 把一个用户账号完整字段同步到运行时 config.user（现有内核读 config.user） */
  function loadUserIntoRuntime(acc) {
    var c = C();
    if (!acc) return; // 防御：找不到账号时不要用 undefined 构造运行时
    // 多账号铁律：运行时 config.user 只能由“本账号自己的字段”构成，缺什么就是空，
    // 绝不能借用上一个账号残留在 config.user 里的头像/人设/昵称，否则资料少的账号会“串脸”，
    // 看起来像同一个人、连聊天都像混在一起。（账号数据独立持久化，无需向运行时借位补全。）
    var next = Object.assign({}, {
      name: '', personaName: '', nickname: '', wxName: '', wxId: '', wxPassword: acc.wxPassword || '',
      avatar: '', persona: '', bio: '', personaRelations: '', appearance: '', artStyle: '',
      phoneNumber: '', refImages: [], savedImages: [], wallet: 0, walletHistory: [],
      _waAccountId: acc.id
    });
    USER_FIELDS.forEach(function (f) {
      if (acc[f] !== undefined && acc[f] !== null) next[f] = cloneVal(acc[f]);
    });
    USER_ALIAS_FIELDS.forEach(function (f) { if (acc[f] !== undefined && acc[f] !== null) next[f] = acc[f]; });
    // 内核兼容别名：只在“本账号自己的字段”之间回退，不引用任何其他账号
    next.nickname = acc.personaName || next.nickname || acc.name || '';
    next.bio = acc.persona || next.bio || '';
    if (!next.wxName) next.wxName = acc.name || '';
    c.user = next;
  }
  /* 把运行时 config.user 回写到当前账号（双向同步；用 !==undefined 判断，清空/0 也能写回，不丢改动） */
  function syncRuntimeToAccount() {
    var c = C(); var sn = session(); if (!sn || sn.kind !== 'user') return;
    var acc = findUserAcc(sn.refId); if (!acc) return; var u = c.user || {};
    // 来源一致性闸门：运行时这份 user 由某账号装载而来（_waAccountId）。若它不属于当前会话账号，
    // 说明正处在异步权威 config 换入 / 切号的错乱瞬态，绝不能把 A 的资料回写给 B（两个账号雷同的根因）。
    if (u._waAccountId && String(u._waAccountId) !== String(acc.id)) return;
    // 空壳保护：运行时人设整体为空、目标账号却有人设（典型为异步权威 config 晚到的装载瞬态），禁止用空壳覆盖账号
    if (!userHasContent(u) && userHasContent(acc)) return;
    USER_FIELDS.forEach(function (f) {
      if (u[f] !== undefined) acc[f] = cloneVal(u[f]);
    });
    USER_ALIAS_FIELDS.forEach(function (f) { if (u[f] !== undefined) acc[f] = u[f]; });
    try { syncSocialRuntime(acc, c); } catch (e) {} // 回写朋友圈封面/已读（moments 同引用）
    try { writeBackCharState(acc); } catch (e) {} // 回写置顶/备注/删除好友等每账号状态
  }
  // 强制把 config.user 人设落到“当前世界的目标用户账号”：
  // 已登录用户账号→该账号；未登录/角色账号态→当前世界主账号（没有就用 config.user 自动建一个），保证设置里填的人设永远有着落点
  function persistUserToAccount() {
    var c = C(); var sn = session(); var u = c.user; if (!u) return null;
    var acc = (sn && sn.kind === 'user') ? findUserAcc(sn.refId) : null;
    if (!acc) {
      // 未登录/角色态且运行时是没有任何实质内容的空壳：绝不凭空新建“未命名”空账号，
      // 否则启动竞态下它会被 unshift 成主账号、再以更新的时间戳顶掉 IndexedDB 里真正有内容的原账号
      if (!userHasContent(u) && !(Array.isArray(u.contacts) && u.contacts.length) && !(u.chats && Object.keys(u.chats).length)) return null;
      var wid = (sn && sn.worldId) || currentWorld().id;
      var w = worlds().filter(function (x) { return x.id === wid; })[0] || defaultWorld();
      if (!Array.isArray(w.users)) w.users = [];
      acc = w.users[0];
      if (!acc) {
        acc = JSON.parse(JSON.stringify(u));
        acc.id = uid('uacc'); acc.kind = 'user'; acc._worldId = w.id; if (!acc.wxPassword) acc.wxPassword = '';
        if (!Array.isArray(acc.contacts)) acc.contacts = [];
        if (!acc.chats || typeof acc.chats !== 'object') acc.chats = {};
        if (!acc.offlineChats || typeof acc.offlineChats !== 'object') acc.offlineChats = {};
        ensureAccSocial(acc);
        acc._waJustCreated = true; // 本次由当前 runtime 克隆新建，允许写入，不受来源闸门拦截
        w.users.unshift(acc);
      }
    }
    if (!acc) return null;
    // 来源一致性闸门：runtime 属于别的账号时，不允许落进这个既有账号（防止 A 资料覆盖 B）
    if (!acc._waJustCreated && u._waAccountId && String(u._waAccountId) !== String(acc.id)) return null;
    // 空壳保护：运行时人设整体为空、该账号却有人设时，不用空壳覆盖（保留账号原值）
    if (!userHasContent(u) && userHasContent(acc)) return acc;
    USER_FIELDS.concat(USER_ALIAS_FIELDS).forEach(function (f) { if (u[f] !== undefined) acc[f] = cloneVal(u[f]); });
    try { syncSocialRuntime(acc, c); } catch (e) {} // 朋友圈封面/已读等值类型也要随落盘回写当前账号，避免切账号后封面/红点状态回退
    try { if (sn && sn.kind === 'user') writeBackCharState(acc); } catch (e) {}
    try { backupPersona(acc); } catch (e) {} // 人设按账号留一份可回滚备份，只在有内容时写
    return acc;
  }
  WA.persistUserToAccount = persistUserToAccount; window.waPersistUserToAccount = persistUserToAccount;
  // 轻量回写：只同步用户人设字段（不遍历角色，供高频持久化钩子调用）；任意状态都落账号（未登录落主账号）
  function lightSyncUserToAcc() {
    try { persistUserToAccount(); } catch (e) {}
  }
  WA.lightSyncUserToAcc = lightSyncUserToAcc;
  // 根治：包装统一持久化入口 Store.set —— 任何模块改了 config.user（人设弹窗/头像/手机号/钱包/收藏图…）
  // 在落盘前自动回写当前账号，避免“保存了但没进账号、重进被空账号覆盖”的人设丢失
  function hookStoreSet() {
    try {
      if (typeof Store === 'undefined' || !Store || typeof Store.set !== 'function' || Store._waHooked) return;
      var origSet = Store.set;
      Store.set = function (key, val) {
        if (key === 'config') {
          try { lightSyncUserToAcc(); } catch (e) {}
          // V2：角色账号登录时注入的“用户镜像角色”只在运行时存在，落盘前临时剥离，避免冗余对话被序列化、重进残留
          if (val && Array.isArray(val.characters) && val.characters.some(function (x) { return x && (x._waMirror || x._waLife); })) {
            var _keepChars = val.characters;
            val.characters = _keepChars.filter(function (x) { return !x._waMirror && !x._waLife; });
            var _r = origSet.apply(this, arguments);
            val.characters = _keepChars;
            return _r;
          }
        }
        return origSet.apply(this, arguments);
      };
      Store._waHooked = true;
    } catch (e) {}
  }
  WA.hookStoreSet = hookStoreSet;

  /* ============================================================
   * 账号级联系人 + 独立聊天记录（每个人设账号是独立的人）
   * account.contacts: [{cid,status:'friend'/'removed',addedAt,alias,pin,starred,blocked}]
   * account.chats: { [charId]: [msg,...] } —— 与挂载后的 char.chatHistory 同引用
   * ============================================================ */
  var PER_CHAR_FIELDS = ['alias', 'pin', 'starred', 'blocked'];
  function accContacts(acc) { if (!acc) return []; if (!Array.isArray(acc.contacts)) acc.contacts = []; return acc.contacts; }
  function contactOf(acc, cid) {
    if (!acc) return null; cid = String(cid);
    return accContacts(acc).filter(function (t) { return String(t.cid) === cid; })[0] || null;
  }
  function currentAccount() { var sn = session(); if (!sn || sn.kind !== 'user') return null; return findUserAcc(sn.refId); }
  /* 防丢合并：src 里同世界同 id 的用户账号，若某字段 dst 为空而 src 有值，就补进 dst（只补空、绝不覆盖已有值，绝不跨 id 写串）。
     用于 IndexedDB 权威 config 异步换入时，把内存里更新/更全的人设并回，避免较早快照把刚填的人设冲空。 */
  var IDENTITY_FIELDS = ['name','personaName','nickname','wxName','wxId','persona','personaRelations','appearance','artStyle','phoneNumber','avatar','bio'];
  // 是否具备“用户亲手建立的身份”。注意：contacts/chats/moments/memories/charMemories 是系统按主账号自动挂的，
  // 不能作为“非空壳”依据——否则 bug 产生的空壳被自动挂上联系人后就永远清不掉，还会占着主账号位置。
  function _hasUserIdentity(u) {
    if (!u || typeof u !== 'object') return false;
    if (u.wxPassword) return true; // 设过登录密码=用户主动建立
    if (Array.isArray(u.refImages) && u.refImages.length) return true;
    return IDENTITY_FIELDS.some(function (f) { var v = u[f]; return v !== undefined && v !== null && String(v).trim() !== ''; });
  }
  /* 账号“真实活动证据”：哪怕没填姓名/人设，只要它真的拥有角色、加过好友、有聊天/记忆/朋友圈/申请记录，
     它就是一个被真正使用过的账号，绝不能因为“身份字段为空”被当空壳删掉或被新注册账号顶下主位
     （这正是“注册第二个账号后默认账号被清空、角色被新账号篡夺”的根因）。系统空挂的空数组/空对象不算活动。 */
  function _nonEmptyBucket(v) {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') {
      for (var k in v) { if (Array.isArray(v[k]) && v[k].length > 0) return true; }
    }
    return false;
  }
  function _hasAccountActivity(u, allChars) {
    if (!u || typeof u !== 'object') return false;
    if (_nonEmptyBucket(u.chats) || _nonEmptyBucket(u.offlineChats)) return true;
    if (Array.isArray(u.memories) && u.memories.length) return true;
    if (Array.isArray(u.moments) && u.moments.length) return true;
    if (Array.isArray(u.friendRequests) && u.friendRequests.length) return true;
    // 注意：单独“contacts里有好友”不算活动证据——系统会给主账号自动补挂全部角色联系人，
    // bug空壳也会被补，只凭contacts会让空壳清不掉。必须有非空聊天/记忆/动态，或确实拥有角色。
    var chs = allChars || (C() && C().characters) || [];
    if (Array.isArray(chs) && chs.some(function (ch) { return ch && String(ch.ownerAccountId) === String(u.id); })) return true;
    return false;
  }
  /* 真实账号 = 有亲手建立的身份，或有真实活动；两者都没有才是可清理的空壳 */
  function _isRealAccount(u) { return _hasUserIdentity(u) || _hasAccountActivity(u); }
  function _accIsEmptyShell(u) { return !_isRealAccount(u); }
  function mergeRicherAccounts(dst, src) {
    if (!dst || !src) return dst;
    if (!Array.isArray(dst.worlds)) dst.worlds = [];
    var UF = ['name','personaName','wxName','wxId','avatar','persona','personaRelations','appearance','artStyle','phoneNumber'];
    var ARR = ['refImages','savedImages','walletHistory','contacts','moments','memories'];
    (src.worlds || []).forEach(function (sw) {
      var dw = dst.worlds.filter(function (w) { return w.id === sw.id; })[0];
      // src 有这个世界而 dst 没有：若其中含任一“有内容账号”，整体并入该世界（空世界不并）
      if (!dw) {
        if (Array.isArray(sw.users) && sw.users.some(function (u) { return !_accIsEmptyShell(u); })) {
          var nw = JSON.parse(JSON.stringify(sw)); nw.users = (nw.users || []).filter(function (u) { return !_accIsEmptyShell(u); });
          if (nw.users.length) dst.worlds.push(nw);
        }
        return;
      }
      if (!Array.isArray(sw.users)) return; if (!Array.isArray(dw.users)) dw.users = [];
      sw.users.forEach(function (su) {
        var du = dw.users.filter(function (u) { return u.id === su.id; })[0];
        if (!du) {
          // dst 缺这个账号：只有“有内容账号”才整体并回，绝不能把空壳“未命名”账号并进来顶替原账号
          if (!_accIsEmptyShell(su)) dw.users.push(JSON.parse(JSON.stringify(su)));
          return;
        }
        UF.forEach(function (f) {
          var sv = su[f], dv = du[f];
          if (sv !== undefined && sv !== null && sv !== '' && (dv === undefined || dv === null || dv === '')) du[f] = sv;
        });
        ARR.forEach(function (f) {
          if (Array.isArray(su[f]) && su[f].length && !(Array.isArray(du[f]) && du[f].length)) du[f] = su[f].slice();
        });
        // 账号级对象桶：dst 空、src 有才补
        ['chats','offlineChats','charMemories','friendRequests'].forEach(function (f) {
          if (su[f] && typeof su[f] === 'object' && Object.keys(su[f]).length && !(du[f] && typeof du[f] === 'object' && Object.keys(du[f]).length)) du[f] = JSON.parse(JSON.stringify(su[f]));
        });
      });
    });
    return dst;
  }
  WA.mergeRicherAccounts = mergeRicherAccounts; window.waMergeRicherAccounts = mergeRicherAccounts;
  function isFriendWith(acc, ch) {
    if (!acc || !ch) return false;
    var t = contactOf(acc, ch.id);
    return !!(t && t.status === 'friend');
  }
  /* v89：账号级“各 APP 生活数据桶”。相册/通话记录/地图城市/换装/匿名号码/查手机/NPC商店
     都属于“这个人设账号”的生活痕迹，随账号隔离；设备级设置/API/世界书/表情包/桌面小组件不在此列。 */
  var APPDATA_ARR = ['photos', 'phoneCallLog', 'wechatCallLog', 'mapLocations', 'npcShopItems'];
  var APPDATA_ALL = APPDATA_ARR.concat(['userCity', 'mapMyLocation', 'phoneCheckData', 'mapLastPos', '_anonPhoneNum']); // dressup 按角色存、跨账号共享，不随账号隔离
  function ensureAccAppData(acc) {
    if (!acc) return acc;
    if (!acc.appData || typeof acc.appData !== 'object') acc.appData = {};
    var ad = acc.appData;
    APPDATA_ARR.forEach(function (f) { if (!Array.isArray(ad[f])) ad[f] = []; });
    if (ad.userCity === undefined) ad.userCity = null;
    if (ad.mapMyLocation === undefined) ad.mapMyLocation = null;
    if (ad.mapLastPos === undefined) ad.mapLastPos = null;
    if (!ad.phoneCheckData || typeof ad.phoneCheckData !== 'object') ad.phoneCheckData = {};
    if (ad._anonPhoneNum === undefined) ad._anonPhoneNum = '';
    return acc;
  }
  function mountAccAppData(acc, c) {
    if (!acc || !c) return;
    ensureAccAppData(acc);
    var ad = acc.appData;
    APPDATA_ALL.forEach(function (f) { c[f] = ad[f]; }); // 数组/对象同引用，值类型复制；内核读写 config.xxx 即落到本账号
  }
  function syncAccAppData(acc, c) {
    if (!acc || !c || !acc.appData) return;
    var ad = acc.appData;
    APPDATA_ALL.forEach(function (f) { if (c[f] !== undefined) ad[f] = c[f]; });
  }
  WA.ensureAccAppData = ensureAccAppData; window.waEnsureAccAppData = ensureAccAppData;
  /* 换装(dressup)按角色存、本应跨账号共享。老版本曾误随账号隔离，导致切号后搭配“消失”。
     一次性把各账号 appData.dressup 里的自定义搭配合并回全局 config.dressup（幂等，只回收不删除） */
  function _dressIsCustom(d) { return !!(d && ((d.hairIdx | 0) !== 0 || (d.exprIdx | 0) !== 0 || (d.color && d.color !== '#3D2817'))); }
  function migrateDressupToGlobal() {
    var c = C(); if (!c) return;
    if (!c.dressup || typeof c.dressup !== 'object') c.dressup = {};
    if (c._dressupGlobalV1) return;
    try {
      worlds().forEach(function (w) { (w.users || []).forEach(function (u) {
        var ad = u && u.appData; if (!ad || !ad.dressup || typeof ad.dressup !== 'object') return;
        Object.keys(ad.dressup).forEach(function (cid) {
          var have = c.dressup[cid], src = ad.dressup[cid]; if (!src) return;
          if (!have) c.dressup[cid] = src;
          else if (!_dressIsCustom(have) && _dressIsCustom(src)) c.dressup[cid] = src;
        });
      }); });
      c._dressupGlobalV1 = 1;
    } catch (e) {}
  }
  WA.migrateDressupToGlobal = migrateDressupToGlobal; window.waMigrateDressup = migrateDressupToGlobal;
  /* 朋友圈按账号分桶（每个世界/账号一个朋友圈社会） */
  function ensureAccSocial(acc) {
    if (!acc) return acc;
    if (!Array.isArray(acc.moments)) acc.moments = [];
    if (acc.momentsCover === undefined) acc.momentsCover = '';
    if (acc.momentsLastSeen === undefined) acc.momentsLastSeen = 0;
    // 记忆 / 好友请求同样按账号独立分桶
    if (!Array.isArray(acc.memories)) acc.memories = [];
    if (!acc.charMemories || typeof acc.charMemories !== 'object') acc.charMemories = {};
    if (!Array.isArray(acc.friendRequests)) acc.friendRequests = [];
    if (acc.friendRequestsSeen === undefined) acc.friendRequestsSeen = 0;
    if (acc.unreadCount === undefined || acc.unreadCount === null) acc.unreadCount = 0;
    // v90：一次性红点基准对齐。老账号更新到本版时，桶里可能已有历史动态/好友申请，
    // 若 seen 还是 0 会把这些“旧账”全当成新内容、冒出莫名红点。首次规范化时把基准对齐到当前最新一条，
    // 历史内容不再亮红点（列表里仍看得到），此后真正新到、时间更晚的内容才会亮；只执行一次，不影响后续提醒。
    if (!acc._badgeBaselineV1) {
      acc._badgeBaselineV1 = 1;
      try {
        if ((acc.momentsLastSeen === 0 || acc.momentsLastSeen === undefined) && Array.isArray(acc.moments) && acc.moments.length) {
          var _mt = acc.moments.reduce(function (m, x) { return Math.max(m, (x && x.time) || 0); }, 0);
          if (_mt) acc.momentsLastSeen = _mt;
        }
        if ((acc.friendRequestsSeen === 0 || acc.friendRequestsSeen === undefined) && Array.isArray(acc.friendRequests) && acc.friendRequests.length) {
          var _ft = acc.friendRequests.reduce(function (m, x) { return Math.max(m, (x && x.time) || 0); }, 0);
          if (_ft) acc.friendRequestsSeen = _ft;
        }
        acc.unreadCount = 0; // 更新瞬间未读计数清零，避免历史未读残留亮角标
      } catch (ebl) {}
    }
    return acc;
  }
  /* 把账号的记忆/好友请求桶挂到运行时 config（同引用，内核读写无感，天然按账号隔离） */
  function mountAccData(acc, c) {
    c = c || C(); if (!acc || !c) return;
    ensureAccSocial(acc);
    c.memories = acc.memories; // 当前“用户人设账号”的第一人称记忆（按账号隔离）
    c.friendRequests = acc.friendRequests;
    c.friendRequestsSeen = acc.friendRequestsSeen || 0;
    c.unreadCount = acc.unreadCount || 0; // 微信总未读角标也按账号独立，切号不带走红点
    // 角色记忆属于“角色本人”，跨用户账号共享（角色是一个真正有记忆的人，记得和不同账号发生的事）；
    // 因此这里不按账号分桶，只保证角色自身记忆是数组
    (c.characters || []).forEach(function (ch) { if (!Array.isArray(ch.memories)) ch.memories = []; });
    mountAccAppData(acc, c); // v89：相册/通话记录/地图/换装等 APP 生活数据随账号挂载
  }
  /* 把账号的朋友圈桶挂到运行时 config（同引用，内核读写无感）；字符串/数字值类型同步回写 */
  function mountSocial(acc, c) {
    ensureAccSocial(acc);
    c.moments = acc.moments;
    c.momentsCover = acc.momentsCover || '';
    c.momentsLastSeen = acc.momentsLastSeen || 0;
  }
  function syncSocialRuntime(acc, c) {
    if (!acc) return;
    // 同引用数组无需回拷，这里做兜底；值类型必须回写
    if (Array.isArray(c.moments)) acc.moments = c.moments;
    if (c.momentsCover !== undefined) acc.momentsCover = c.momentsCover;
    if (c.momentsLastSeen !== undefined) acc.momentsLastSeen = c.momentsLastSeen;
    if (Array.isArray(c.memories)) acc.memories = c.memories;
    if (Array.isArray(c.friendRequests)) acc.friendRequests = c.friendRequests;
    if (c.friendRequestsSeen !== undefined) acc.friendRequestsSeen = c.friendRequestsSeen;
    if (c.unreadCount !== undefined) acc.unreadCount = c.unreadCount;
    syncAccAppData(acc, c); // v89：切号前把各 APP 生活数据回写本账号
  }

  function ensureChatBucket(acc, cid) {
    if (!acc.chats || typeof acc.chats !== 'object') acc.chats = {};
    cid = String(cid);
    if (!Array.isArray(acc.chats[cid])) acc.chats[cid] = [];
    return acc.chats[cid];
  }
  /* 把某角色加为指定账号联系人；可接管传入的历史数组（同引用，不丢记录） */
  function addContact(acc, ch, inheritHistory) {
    if (!acc || !ch) return null;
    if (!acc.charMemories || typeof acc.charMemories !== 'object') acc.charMemories = {};
    if (!Array.isArray(acc.charMemories[String(ch.id)])) acc.charMemories[String(ch.id)] = [];
    var t = contactOf(acc, ch.id);
    if (!t) {
      t = { cid: ch.id, status: 'friend', addedAt: Date.now(), alias: ch.alias || '', pin: !!ch.pin, starred: !!ch.starred, blocked: !!ch.blocked };
      accContacts(acc).push(t);
    } else { t.status = 'friend'; delete t.removedByUser; }
    var bucket = ensureChatBucket(acc, ch.id);
    if (bucket.length === 0 && Array.isArray(inheritHistory) && inheritHistory.length) {
      for (var i = 0; i < inheritHistory.length; i++) bucket.push(inheritHistory[i]);
    }
    return t;
  }
  /* 把 char 上的每账号会话状态回写联系人关系（置顶/备注/星标/拉黑/删除好友） */
  function writeBackCharState(acc) {
    if (!acc) return; var c = C();
    var awid = acc._worldId || 'default';
    // 只有运行时确实挂载着这个账号、这个世界时才允许回写角色的临时显示状态。
    // 新建/切换世界期间 waSession 会先变化，而角色上的 deletedFromWechat 仍可能属于上一轮挂载；
    // 若此时回写，会把旧世界主账号的全部好友误记成 removed。
    if (_mountedAccId === null || String(_mountedAccId) !== String(acc.id) || String(_mountedWorldId || 'default') !== String(awid)) return;
    (c.characters || []).forEach(function (ch) {
      var t = contactOf(acc, ch.id);
      if (!t) return;
      // 跨世界角色：mountAccount 对它只是“运行时临时隐藏”，ch 上残留的是别的世界/账号的运行态。
      // 绝不能回写——否则临时 deletedFromWechat=true 会被误判成该账号“主动删除好友”而永久 removed，
      // 备注/置顶/星标也会串号。切回其世界时 mountAccount 会按真实好友关系重算。
      if ((ch.worldId || 'default') !== awid) return;
      PER_CHAR_FIELDS.forEach(function (f) { if (ch[f] !== undefined) t[f] = ch[f]; });
      if (ch.deletedFromWechat === true && t.removedByUser === true) t.status = 'removed';
      else if (t.status === 'removed') t.status = 'friend';
    });
  }
  /* 挂载：把当前账号的联系人关系与聊天桶装到角色实体上，让内核（读 char.chatHistory/deletedFromWechat）无感 */
  var _mountedAccId = null;
  var _mountedWorldId = null;
  var _lastGroupHealAt = 0; // v90：悬空群自愈节流时间戳
  function mountAccount(acc) {
    var c = C(); if (!acc || !c) return;
    try { migrateDressupToGlobal(); } catch (emd) {}
    if (!acc.chats || typeof acc.chats !== 'object') acc.chats = {};
    if (!acc.offlineChats || typeof acc.offlineChats !== 'object') acc.offlineChats = {};
    if (!Array.isArray(acc.contacts)) acc.contacts = [];
    var wid = acc._worldId || 'default';
    (c.characters || []).forEach(function (ch) {
      if ((ch.worldId || 'default') !== wid) { ch.deletedFromWechat = true; return; } // 跨世界角色对当前账号一律隐藏（防止主动消息/未读等非渲染路径跨世界串扰）；切回其世界时会按好友关系重算
      try { ensureCharPerson(ch, acc); } catch (epe) {} // v85：切到该账号即在每个同世界角色的人物簿里建档/同步改名
      var t = contactOf(acc, ch.id), friend = !!(t && t.status === 'friend');
      var cid = String(ch.id);
      if (!Array.isArray(acc.chats[cid])) acc.chats[cid] = [];
      ch.chatHistory = acc.chats[cid]; // 同引用：内核 push 直接写进该账号聊天桶
      if (!Array.isArray(acc.offlineChats[cid])) acc.offlineChats[cid] = [];
      ch.offlineChatHistory = acc.offlineChats[cid]; // 单人线下同样按账号独立（同引用）
      if (friend) {
        ch.deletedFromWechat = false;
        PER_CHAR_FIELDS.forEach(function (f) { ch[f] = t[f] !== undefined ? t[f] : (f === 'alias' ? '' : false); });
      } else {
        ch.deletedFromWechat = true; // 非好友：对当前账号隐藏，内核跳过显示与主动消息
      }
    });
    mountSocial(acc, c);
    mountAccData(acc, c);
    _mountedAccId = acc.id;
    _mountedWorldId = wid;
  }
  function unmountAccount() {
    var acc = currentAccount();
    if (acc) {
      try { writeBackCharState(acc); } catch (e) {}
      try { syncSocialRuntime(acc, C()); } catch (e) {} // v89：切走前把朋友圈/记忆/各APP生活数据一并回写，防止漏回写串号
    }
    _mountedAccId = null;
    _mountedWorldId = null;
  }
  /* 渲染前幂等保证：账号切换/数据异步加载后自动重挂 */
  function ensureMount() {
    var c = C(); if (!c) return;
    // v90：每次挂载幂等自愈悬空群归属（节流，避免每帧跑），保证 MIG_FLAG 已置的老用户也能找回“消失”的群
    try { if (!_lastGroupHealAt || Date.now() - _lastGroupHealAt > 3000) { reconcileGroupOwnership(); _lastGroupHealAt = Date.now(); } } catch (egh) {}
    var sn = session();
    if (!sn || sn.kind !== 'user') { _mountedAccId = null; _mountedWorldId = null; return; }
    var acc = findUserAcc(sn.refId);
    if (!acc) { _mountedAccId = null; _mountedWorldId = null; return; }
    // id 相同但任一运行时桶引用被冲掉/整体替换（IndexedDB 晚到整体换 config、深合并、备份恢复）时也要强制重挂，
    // 否则运行时会仍指着旧空桶，表现为“记忆没读/申请记录消失/切号后数据不对”
    var _stale = !Array.isArray(acc.moments) || c.moments !== acc.moments
      || !Array.isArray(acc.friendRequests) || c.friendRequests !== acc.friendRequests
      || !Array.isArray(acc.memories) || c.memories !== acc.memories;
    // v89：账号 APP 数据桶引用被整体替换（备份恢复/深合并/晚到 config）时也要重挂
    try {
      ensureAccAppData(acc);
      if (Array.isArray(acc.appData.photos) && c.photos !== acc.appData.photos) _stale = true;
    } catch (ead) {}
    if (_mountedAccId !== acc.id || _stale) mountAccount(acc);
    // 用户人设兜底：权威 config 晚到/整体替换可能把 config.user 冲空或残留成别的身份（含角色自视），
    // 渲染前按“当前会话账号”重装（只读 账号→运行时，绝不跨账号写，不会把 A 写成 B）
    try {
      var _ru = c.user;
      var _wrongId = _ru && _ru._waAccountId && String(_ru._waAccountId) !== String(acc.id);
      if (_wrongId || (!userHasContent(_ru) && userHasContent(acc))) loadUserIntoRuntime(acc);
    } catch (eu) {}
  }
  WA.accContacts = accContacts; WA.contactOf = contactOf; WA.currentAccount = currentAccount;
  WA.isFriendWith = isFriendWith; WA.addContact = addContact; WA.ensureChatBucket = ensureChatBucket;
  WA.mountAccount = mountAccount; WA.unmountAccount = unmountAccount; WA.ensureMount = ensureMount; WA.writeBackCharState = writeBackCharState;
  WA.markContactRemovedByUser = function (acc, ch) {
    var t = acc && ch ? contactOf(acc, ch.id) : null;
    if (!t) return false;
    t.removedByUser = true;
    t.status = 'removed';
    return true;
  };

  /* ============================================================
   * 迁移（幂等）：默认世界 / 用户账号化 / 角色补字段与密码 / NPC转角色
   * ============================================================ */
  var MIG_FLAG = '_waMigratedV1';
  /* 单 config 内账号对账：消灭 bug 产生的“未命名”空壳账号，保证默认主账号始终是有内容的那个
     - 纯空壳（无人设/联系人/聊天/记忆/朋友圈，且非当前登录账号）：同世界另有账号则删除；
     - 默认世界若 users[0] 是空壳、后面有有内容账号，把第一个有内容账号提为主账号(users[0])；
     - 全世界只剩一个空壳、而运行时 config.user 或迁移前快照有内容：用内容回填它（不删，保住落点）。 */
  function reconcileUserAccounts() {
    var c = C(); if (!c || !Array.isArray(c.worlds)) return;
    var sn = session();
    c.worlds.forEach(function (w) {
      if (!Array.isArray(w.users)) { w.users = []; return; }
      var isDef = !!(w.isDefault || w.id === 'default');
      var realUsers = w.users.filter(function (u) { return !_accIsEmptyShell(u); });
      var shellUsers = w.users.filter(function (u) { return _accIsEmptyShell(u); });
      // 默认世界一个真账号都没有时：先用 runtime/快照内容把第一个空壳填成真账号，保住落点；填不了才保留一个空壳
      if (!realUsers.length && shellUsers.length) {
        var src = userHasContent(c.user) ? c.user : (c._waSnapshot && userHasContent(c._waSnapshot.user) ? c._waSnapshot.user : null);
        if (src && isDef) {
          var filled = shellUsers[0];
          IDENTITY_FIELDS.concat(['refImages']).forEach(function (f) { if (src[f] !== undefined && src[f] !== null && (filled[f] === undefined || filled[f] === '' || (Array.isArray(filled[f]) && !filled[f].length))) filled[f] = cloneVal(src[f]); });
          realUsers = [filled]; shellUsers = shellUsers.slice(1);
        }
      }
      // 删除多余空壳；但“当前正登录的空壳”先记下，下面改挂到真账号后再删
      var currentIsShell = !!(sn && sn.kind === 'user' && shellUsers.some(function (u) { return String(u.id) === String(sn.refId); }));
      var keep = realUsers.slice();
      if (!keep.length && isDef && shellUsers.length) keep = [shellUsers[0]]; // 默认世界保底一个可进入的账号
      w.users = keep;
      // 真账号排到 users[0]（主账号位置），保证“自动继承本世界角色”落在真账号而非空壳
      if (isDef && w.users.length > 1 && _accIsEmptyShell(w.users[0])) {
        for (var gi = 1; gi < w.users.length; gi++) { if (!_accIsEmptyShell(w.users[gi])) { var gg = w.users.splice(gi, 1)[0]; w.users.unshift(gg); break; } }
      }
      // 当前会话停在被删空壳上：改挂到本世界第一个真账号；没有则回到选号页
      if (currentIsShell && sn && (sn.worldId === w.id || (isDef && (!sn.worldId || sn.worldId === 'default')))) {
        var target = w.users.filter(function (u) { return !_accIsEmptyShell(u); })[0] || w.users[0] || null;
        if (target) { sn.kind = 'user'; sn.refId = target.id; sn.worldId = w.id; loadUserIntoRuntime(target); }
        else { sn.kind = null; sn.refId = null; }
      }
    });
  }
  WA.reconcileUserAccounts = reconcileUserAccounts; window.waReconcileUserAccounts = reconcileUserAccounts;
  /* NPC 幂等并入普通角色：每次启动都把残留 config.npcs 转成普通角色（按来源id/同名去重，不重复转），
     然后清空独立 NPC 列表与其全局聊天桶——微信里不再存在“独立 NPC 联系人 / NPC 角标 / 每账号都有同一个NPC”。 */
  function reconcileNpcsToChars() {
    var c = C(); if (!c) return;
    if (!Array.isArray(c.npcs) || !c.npcs.length) { return; }
    if (!Array.isArray(c.characters)) c.characters = [];
    var dw = defaultWorld(); var wid = dw ? dw.id : 'default';
    var remain = [];
    c.npcs.forEach(function (n) {
      if (!n || n._deprecated) return;
      var dup = c.characters.some(function (ch) { return String(ch._srcNpcId) === String(n.id) || (ch._fromNpc && ch.name === (n.name || n.nickname)); });
      if (dup) return; // 已转过，去重
      var nchat = (c.npcChats || []).filter(function (nc) { return String(nc.npcId) === String(n.id); })[0];
      var hist = (nchat && Array.isArray(nchat.messages)) ? nchat.messages.slice() : [];
      var ch = {
        id: uid('char'), _fromNpc: true, _srcNpcId: String(n.id),
        name: n.name || n.nickname || '路人',
        nickname: '', avatar: n.avatar || (n.name ? n.name.charAt(0) : '人'),
        avatarBg: n.avatarBg || '#576B95', gender: n.gender || 'other',
        persona: n.persona || n.memory || (n.name ? n.name + '，世界中的一位人物。' : '世界中的一位人物。'),
        createdAt: n.createdAt || Date.now(),
        wxId: (typeof generateCharWxId === 'function') ? (function () { try { return generateCharWxId(n.name, n.persona || ''); } catch (e) { return 'u' + Math.floor(Math.random() * 9000 + 1000); } })() : ('u' + Math.floor(Math.random() * 9000 + 1000)),
        chatHistory: hist, offlineChatHistory: [], memories: Array.isArray(n.memories) ? n.memories : [],
        worldId: (n.worldId || wid),
        ownerAccountId: (function () { var _w = (c.worlds || []).filter(function (x) { return (x.id || 'default') === (n.worldId || wid); })[0]; return (_w && _w.users && _w.users[0]) ? _w.users[0].id : null; })(),
        wxPassword: (typeof genWxPassword === 'function') ? genWxPassword(n.name, n.persona || n.memory || '') : '',
        risk: { value: 0, totalMs: 0, actionCount: 0, lastTickAt: 0, lastEventAt: 0 }, socialData: null
      };
      c.characters.push(ch);
    });
    c.npcs = [];
    c.npcChats = []; // 独立 NPC 聊天桶清空：其历史已并入对应角色，之后按角色/账号体系走
  }
  WA.reconcileNpcsToChars = reconcileNpcsToChars; window.waReconcileNpcsToChars = reconcileNpcsToChars;
  /* 每个角色都必须有创建者归属 ownerAccountId（幂等补齐，只补不覆盖）：
     缺归属的角色（NPC转入/接受申请补建/旧备份导入）会被误判成对所有账号都是“熟人”，
     这里统一补为其所属世界的主账号 users[0]。必须在 reconcileUserAccounts（主账号排定）之后跑。 */
  function reconcileCharOwner() {
    var c = C(); if (!c || !Array.isArray(c.characters)) return;
    c.characters.forEach(function (ch) {
      var wid = ch.worldId || 'default';
      var w = (c.worlds || []).filter(function (x) { return (x.id || 'default') === wid; })[0];
      var cid = String(ch.id);
      function accBonded(bu) {
        if (!bu) return false;
        // 只认“非空聊天/线下记录”作为真正相处过的硬证据；不能用“是不是好友联系人”——
        // reconcileMainContacts 会给主账号 users[0] 自动补全所有角色为好友，好友关系是系统挂的，
        // 用它会让主账号永远抢占归属，反而把真正聊过的账号/新账号关系判错。
        return (bu.chats && Array.isArray(bu.chats[cid]) && bu.chats[cid].length > 0)
            || (bu.offlineChats && Array.isArray(bu.offlineChats[cid]) && bu.offlineChats[cid].length > 0);
      }
      var bonded = null;
      if (Array.isArray(w.users)) {
        for (var bi = 0; bi < w.users.length; bi++) { if (accBonded(w.users[bi])) { bonded = w.users[bi]; break; } }
      }
      var main = (w && Array.isArray(w.users) && w.users[0]) ? w.users[0] : null;
      var ownerAcc = ch.ownerAccountId ? findUserAcc(ch.ownerAccountId) : null;
      if (ownerAcc) {
        // 已有有效归属，通常保持；唯一例外是“自愈历史错配”：现归属与该角色零互动，
        // 而另一个账号才是真正和TA相处（好友/聊天）的——说明此前被bug判给了刚注册的新账号，纠正回来。
        if (bonded && String(bonded.id) !== String(ownerAcc.id) && !accBonded(ownerAcc)) {
          ch.ownerAccountId = bonded.id;
        }
        return;
      }
      // 无归属或归属悬空：优先判给真正相处过的账号，都没有才落到本世界主账号 users[0]
      var chosen = bonded || main;
      if (chosen) ch.ownerAccountId = chosen.id;
    });
  }
  WA.reconcileCharOwner = reconcileCharOwner; window.waReconcileCharOwner = reconcileCharOwner;

  /* ===== v85 角色“人物簿”：以角色第一人称记录 TA 遇到的每一个人（每个用户账号=一个独立的人） =====
     ch.people[accId] = {name,isOwner,relation,howMet,impression,firstAt,updatedAt}
     - 创建者账号(isOwner)：角色人设里默认的“你/青梅竹马/恋人”等关系只属于 TA，relation 留空（用时展开成人设关系）
     - 其他账号：初始 relation='刚认识的陌生人'，之后随互动/总结演进（角色真正“认识”一个人，而不是被代码硬判成陌生人） */
  function accDisplayNameOf(u) { return (u && (u.personaName || u.name)) || ''; }
  function accIsCharOwner(ch, acc) {
    if (!ch || !acc) return false;
    if (ch.ownerAccountId) return String(ch.ownerAccountId) === String(acc.id);
    try {
      var wid = ch.worldId || 'default';
      var w = (C().worlds || []).filter(function (x) { return (x.id || 'default') === wid; })[0];
      var f = (w && Array.isArray(w.users) && w.users[0]) ? w.users[0] : null;
      return !!(f && String(f.id) === String(acc.id));
    } catch (e) { return false; }
  }
  function ensureCharPerson(ch, acc) {
    if (!ch || !acc) return null;
    if (!ch.people || typeof ch.people !== 'object') ch.people = {};
    var key = String(acc.id);
    var p = ch.people[key];
    var isOwner = accIsCharOwner(ch, acc);
    var nm = accDisplayNameOf(acc);
    if (!p) {
      p = { name: nm, isOwner: isOwner, relation: isOwner ? '' : '刚认识的陌生人', howMet: '', impression: '', firstAt: Date.now(), updatedAt: Date.now(), interactionCount: 0, lastInteractAt: 0, customCall: '' };
      ch.people[key] = p;
    } else {
      if (nm) p.name = nm; // 账号改名后同步人物页名字
      if (p.isOwner === undefined) p.isOwner = isOwner;
      if (!isOwner && !p.relation) p.relation = '刚认识的陌生人';
      if (typeof p.interactionCount !== 'number') p.interactionCount = 0;
      if (p.lastInteractAt === undefined) p.lastInteractAt = 0;
      if (p.customCall === undefined) p.customCall = '';
      p.updatedAt = Date.now();
    }
    return p;
  }
  /* v90：每次“角色与某账号真实互动”时轻量更新人物簿：累计互动次数、最后互动时间；可选更新专属称呼/印象。
     这让角色对每个人的熟悉度、专属昵称都随相处自然演进，像真人一样越来越熟。 */
  function touchCharPerson(ch, acc, opts) {
    if (!ch || !acc) return null;
    var p = ensureCharPerson(ch, acc); if (!p) return null;
    p.interactionCount = (p.interactionCount || 0) + 1;
    p.lastInteractAt = Date.now();
    if (opts) {
      if (opts.customCall) p.customCall = String(opts.customCall).slice(0, 30);
      if (opts.impression) p.impression = String(opts.impression).slice(0, 300);
      if (opts.relation) p.relation = String(opts.relation).slice(0, 120);
    }
    return p;
  }
  /* 按账号 id 精确取“该角色 ↔ 该账号”的线上/线下聊天桶，绝不走会随当前挂载漂移的 ch.chatHistory 指针 */
  function accCharChats(ch, accId) {
    var empty = { online: [], offline: [] };
    if (!ch || accId == null) return empty;
    var acc = findUserAcc(accId);
    if (!acc) return empty;
    var cid = String(ch.id);
    return {
      online: (acc.chats && Array.isArray(acc.chats[cid])) ? acc.chats[cid] : [],
      offline: (acc.offlineChats && Array.isArray(acc.offlineChats[cid])) ? acc.offlineChats[cid] : []
    };
  }
  /* 角色认识的其他人名册（排除正在对话的账号），用于让角色知道自己生命里还有这些人、各是什么关系 */
  function charOtherRoster(ch, excludeAccId) {
    var out = [];
    if (!ch || !ch.people) return out;
    Object.keys(ch.people).forEach(function (k) {
      if (excludeAccId != null && String(k) === String(excludeAccId)) return;
      var p = ch.people[k]; if (!p) return;
      var _leg = '';
      try { var _ru = findUserAcc(k); _leg = _ru ? ((_ru.name || '') + '').trim() : ''; } catch (eru) {}
      out.push({ accId: k, name: p.name || '', legalName: _leg, isOwner: !!p.isOwner,
        relation: p.isOwner ? 'TA就是创建我时、我人设里默认的那个最重要的人' : (p.relation || '认识的人') });
    });
    return out;
  }
  function reconcileCharPeople() {
    var c = C(); if (!c) return;
    (c.characters || []).forEach(function (ch) {
      var wid = ch.worldId || 'default';
      var w = (c.worlds || []).filter(function (x) { return (x.id || 'default') === wid; })[0];
      if (!w || !Array.isArray(w.users)) return;
      w.users.forEach(function (u) { ensureCharPerson(ch, u); });
    });
  }
  WA.accIsCharOwner = accIsCharOwner; window.waAccIsCharOwner = accIsCharOwner;
  WA.ensureCharPerson = ensureCharPerson; window.waEnsureCharPerson = ensureCharPerson;
  window.waEnsureAccSocial = ensureAccSocial;
  WA.touchCharPerson = touchCharPerson; window.waTouchCharPerson = touchCharPerson;
  WA.accCharChats = accCharChats; window.waAccCharChats = accCharChats;
  WA.charOtherRoster = charOtherRoster; window.waCharOtherRoster = charOtherRoster;
  WA.reconcileCharPeople = reconcileCharPeople; window.waReconcileCharPeople = reconcileCharPeople;
  /* 每个世界主账号联系人对账（幂等，每次可跑）：
     - 本世界每个角色都应有联系人记录，缺失的补为好友并接管历史（不影响其他世界/其他账号，不复活主动删除之外的东西）；
     - 一次性自愈：早期“跨世界临时隐藏被误写成 removed”会误杀好友，用 _waContactHealedV1 保证只把这批 removed 恢复一次；
       修复上线后 writeBackCharState 已不再误杀，此后用户真删的 removed 会被一直保留。 */
  /* v90：群聊/多人线下“悬空归属/悬空世界”自愈，根治“群聊凭空消失”。
     - worldId 指向已不存在的世界 → 归回默认世界；
     - 没有 waOwnerId，或 owner 在其世界账号列表里已不存在（临时空账号被清理等）→ 重新归属该世界第一个真实账号。
     只修正引用、不删任何消息。 */
  function reconcileGroupOwnership() {
    var c = C(); if (!c) return;
    var ws = Array.isArray(c.worlds) ? c.worlds : [];
    function worldOf(wid) { return ws.filter(function (x) { return (x.id || 'default') === (wid || 'default'); })[0] || null; }
    function worldExists(wid) { return !!worldOf(wid) || ws.length === 0; }
    function firstUserId(wid) {
      var w = worldOf(wid) || ws.filter(function (x) { return x.isDefault; })[0] || ws[0];
      return (w && Array.isArray(w.users) && w.users[0]) ? w.users[0].id : null;
    }
    function fixList(list) {
      (list || []).forEach(function (g) {
        if (!g) return;
        if (!worldExists(g.worldId)) g.worldId = 'default';
        var needOwner = !g.waOwnerId;
        if (!needOwner) {
          var w = worldOf(g.worldId);
          var alive = w && Array.isArray(w.users) && w.users.some(function (u) { return String(u.id) === String(g.waOwnerId); });
          if (!alive) needOwner = true;
        }
        if (needOwner) { var fid = firstUserId(g.worldId); if (fid) g.waOwnerId = fid; }
      });
    }
    fixList(c.groupChats);
    fixList(c.groupOfflineChats);
  }
  function reconcileMainContacts() {
    var c = C(); if (!c || !Array.isArray(c.worlds)) return;
    var healOnce = !c._waContactHealedV1;
    var healWorldSwitchLoss = !c._waContactHealedV2;
    c.worlds.forEach(function (w) {
      if (!w || !Array.isArray(w.users) || !w.users[0]) return;
      var acc = w.users[0]; var wid = w.id || 'default';
      if (!Array.isArray(acc.contacts)) acc.contacts = [];
      if (!acc.chats || typeof acc.chats !== 'object') acc.chats = {};
      (c.characters || []).forEach(function (ch) {
        if ((ch.worldId || 'default') !== wid) return;
        var t = contactOf(acc, ch.id);
        if (!t) {
          addContact(acc, ch, Array.isArray(ch.chatHistory) ? ch.chatHistory : []);
          if (ch.deletedFromWechat === true) ch.deletedFromWechat = false;
        } else if ((healOnce || healWorldSwitchLoss) && t.status === 'removed' && t.removedByUser !== true) {
          t.status = 'friend'; // 被历史 bug 误杀的好友，一次性恢复
          ch.deletedFromWechat = false;
        }
      });
      // 非主账号不凭空添加全部角色，但只要已有聊天桶，就证明此前确实建立过联系人关系；
      // 缺失的联系人记录按聊天证据恢复，避免跨世界临时隐藏后再也显示不回来。
      for (var ui = 1; ui < w.users.length; ui++) {
        var ua = w.users[ui]; if (!ua) continue;
        if (!Array.isArray(ua.contacts)) ua.contacts = [];
        if (!ua.chats || typeof ua.chats !== 'object') ua.chats = {};
        (c.characters || []).forEach(function (ch2) {
          if ((ch2.worldId || 'default') !== wid) return;
          var cid2 = String(ch2.id), hist2 = ua.chats[cid2];
          if (!contactOf(ua, ch2.id) && Array.isArray(hist2) && hist2.length) addContact(ua, ch2, hist2);
        });
      }
    });
    if (healOnce) c._waContactHealedV1 = true;
    if (healWorldSwitchLoss) c._waContactHealedV2 = true;
  }
  WA.reconcileMainContacts = reconcileMainContacts; window.waReconcileMainContacts = reconcileMainContacts;
  function migrate() {
    var c = C(); if (!c) return;
    try { defaultWorld(); normalizeAccountWorldIds(); } catch (enw) {}
    // 幂等：已迁移过的 config（正常二次打开，或 IndexedDB 权威 config 异步换入后的补跑）不再重复执行
    // 继承/强制装载主账号那套逻辑——重复执行正是“两个账号变成一模一样 / 人设被旧快照覆盖丢失”的根因。
    // 这里只按该 config 自己的会话把对应账号重新挂到运行时即可。
    if (c[MIG_FLAG]) {
      try {
        reconcileNpcsToChars();
        reconcileUserAccounts();
        reconcileCharOwner();
        try { reconcileCharPeople(); } catch (e) {}
        reconcileMainContacts();
        var _esn = c.waSession;
        if (_esn && _esn.kind === 'user') { var _eacc = findUserAcc(_esn.refId); if (_eacc) { loadUserIntoRuntime(_eacc); mountAccount(_eacc); } }
      } catch (e) {}
      return;
    }
    try {
      var dw = defaultWorld();
      // 1) 迁移前快照（只做一次），防止意外
      if (!c._waSnapshot) {
        try {
          c._waSnapshot = {
            at: Date.now(),
            user: JSON.parse(JSON.stringify(c.user || {})),
            characters: JSON.parse(JSON.stringify(c.characters || [])),
            npcs: JSON.parse(JSON.stringify(c.npcs || [])),
            npcChats: JSON.parse(JSON.stringify(c.npcChats || []))
          };
        } catch (e) {}
      }
      // 2) 现有全局用户人设 → 默认世界第一个用户账号（放宽：任一人设字段有内容即建，避免只填人设正文时丢账号）
      if (!Array.isArray(dw.users)) dw.users = [];
      if (dw.users.length === 0) {
        var _srcU = userHasContent(c.user) ? c.user
          : (c._waSnapshot && userHasContent(c._waSnapshot.user) ? c._waSnapshot.user : null);
        if (_srcU) {
          var u0 = JSON.parse(JSON.stringify(_srcU));
          u0.id = uid('uacc'); u0.kind = 'user'; if (!u0.wxPassword) u0.wxPassword = '';
          u0._inherited = true;
          dw.users = [u0];
        }
      }
      // 2.5) 人设丢失补救：主账号人设为空、但运行时 user 或迁移前快照里有人设时，回填（一次性，不覆盖已有内容）
      try {
        (function rescueUserPersona() {
          if (!Array.isArray(dw.users)) dw.users = [];
          var src = userHasContent(c.user) ? c.user
            : (c._waSnapshot && userHasContent(c._waSnapshot.user) ? c._waSnapshot.user : null);
          if (!dw.users.length) {
            // 没有主账号但有人设：补建一个，保证人设有着落点
            if (!src) return;
            var nu = JSON.parse(JSON.stringify(src));
            nu.id = uid('uacc'); nu.kind = 'user'; if (!nu.wxPassword) nu.wxPassword = ''; nu._inherited = true; nu._personaRescued = true;
            dw.users.push(nu); return;
          }
          var main = dw.users[0];
          if (userHasContent(main) || !src) return;
          USER_FIELDS.concat(USER_ALIAS_FIELDS).forEach(function (f) { if (src[f] !== undefined && src[f] !== null && (main[f] === undefined || main[f] === '' || (Array.isArray(main[f]) && !main[f].length))) main[f] = cloneVal(src[f]); });
          main._personaRescued = true;
        })();
      } catch (e) {}

      // 3) 角色补 worldId / wxPassword / risk / socialData
      (c.characters || []).forEach(function (ch) {
        if (!ch.worldId) ch.worldId = dw.id;
        // 老角色（多账号功能上线前创建）的创建者账号补为默认世界主账号：人设里默认的“用户”关系属于TA
        if (!ch.ownerAccountId && dw.users && dw.users[0]) ch.ownerAccountId = dw.users[0].id;
        if (!ch.wxPassword) ch.wxPassword = genWxPassword(ch.name, ch.persona || '');
        if (!ch.risk) ch.risk = { value: 0, totalMs: 0, actionCount: 0, lastTickAt: 0, lastEventAt: 0 };
        if (!ch.socialData) ch.socialData = null;
      });

      // 4) NPC 转普通角色（统一走幂等收敛函数，首次/重复迁移都安全）
      try { reconcileNpcsToChars(); } catch (e) {}

      // 4.5) 账号联系人/聊天结构初始化；老用户继承账号一次性接管本世界全部角色为好友并保留历史
      (c.worlds || []).forEach(function (w) {
        (w.users || []).forEach(function (acc, ui) {
          acc._worldId = w.id || 'default';
          if (!Array.isArray(acc.contacts)) acc.contacts = [];
          if (!acc.chats || typeof acc.chats !== 'object') acc.chats = {};
          ensureAccSocial(acc);
          // 老版本全局朋友圈一次性继承给本世界首个待继承账号，避免更新后朋友圈消失
          if (acc._inherited && (!Array.isArray(acc.moments) || !acc.moments.length) && Array.isArray(c.moments) && c.moments.length) {
            acc.moments = c.moments.slice();
            acc.momentsCover = c.momentsCover || '';
            acc.momentsLastSeen = c.momentsLastSeen || 0;
          }
          if (acc._inherited) {
            var _inhWorldChars = (c.characters || []).filter(function (ch) { return (ch.worldId || 'default') === (w.id || 'default'); });
            // 一次性继承全局“用户记忆/好友请求”到该账号（老版本是全局共享的）
            ensureAccSocial(acc);
            if ((!Array.isArray(acc.memories) || !acc.memories.length) && Array.isArray(c.memories) && c.memories.length) acc.memories = c.memories;
            if ((!Array.isArray(acc.friendRequests) || !acc.friendRequests.length) && Array.isArray(c.friendRequests) && c.friendRequests.length) acc.friendRequests = c.friendRequests;
            if (acc.friendRequestsSeen === undefined && c.friendRequestsSeen !== undefined) acc.friendRequestsSeen = c.friendRequestsSeen;
            if ((acc.unreadCount === undefined || acc.unreadCount === null) && c.unreadCount) acc.unreadCount = c.unreadCount;
            // v89：一次性继承老版本全局的各 APP 生活数据到主账号（仅当账号桶为空、全局有值），避免更新后相册/通话记录/城市等消失
            try {
              ensureAccAppData(acc);
              APPDATA_ALL.forEach(function (f) {
                var gv = c[f];
                var av = acc.appData[f];
                var gEmpty = (gv === undefined || gv === null || gv === '' || (Array.isArray(gv) && !gv.length));
                var aEmpty = (av === undefined || av === null || av === '' || (Array.isArray(av) && !av.length));
                if (!gEmpty && aEmpty) acc.appData[f] = gv;
              });
            } catch (eiad) {}
            _inhWorldChars.forEach(function (ch) {
              addContact(acc, ch, Array.isArray(ch.chatHistory) ? ch.chatHistory : []);
              // 接管该角色对用户的记忆到账号分桶
              if ((!acc.charMemories[String(ch.id)] || !acc.charMemories[String(ch.id)].length) && Array.isArray(ch.memories) && ch.memories.length) acc.charMemories[String(ch.id)] = ch.memories;
              // 接管单人线下历史
              if ((!acc.offlineChats || !acc.offlineChats[String(ch.id)]) && Array.isArray(ch.offlineChatHistory) && ch.offlineChatHistory.length) {
                if (!acc.offlineChats) acc.offlineChats = {};
                acc.offlineChats[String(ch.id)] = ch.offlineChatHistory.slice();
              }
            });
            // 老群聊 / 多人线下：一次性归属到继承账号（无 owner 的旧数据只归主账号）
            (c.groupChats || []).forEach(function (g) { if (!g.waOwnerId && (g.worldId || 'default') === (w.id || 'default')) g.waOwnerId = acc.id; });
            (c.groupOfflineChats || []).forEach(function (g) { if (!g.waOwnerId) g.waOwnerId = acc.id; });
            // 关键：本世界角色尚未加载（异步权威 config 晚到）时不要消费掉一次性继承标记，否则角色到齐后再也继承不上
            if (_inhWorldChars.length) delete acc._inherited;
          }
          // 每个世界主账号【幂等补齐】（不打一次性标记，天然抗异步晚到）：
          // 本世界每个角色都应有一条联系人记录；缺失记录的补为好友并接管历史、清掉被污染的隐藏标记；
          // 已有记录（friend 或用户主动删成 removed）一律不动，故不会复活已删好友，也不影响其他世界/其他账号。
          if (ui === 0) {
            (c.characters || []).forEach(function (ch) {
              if ((ch.worldId || 'default') !== (w.id || 'default')) return;
              var _ex = contactOf(acc, ch.id);
              // 主账号首次见到该角色、账号还没记忆桶、而角色全局带着老记忆时继承（异步晚到也能补）
              if (!acc.charMemories[String(ch.id)] && Array.isArray(ch.memories) && ch.memories.length) acc.charMemories[String(ch.id)] = ch.memories;
              if (!_ex) {
                addContact(acc, ch, Array.isArray(ch.chatHistory) ? ch.chatHistory : []);
                if (ch.deletedFromWechat === true) ch.deletedFromWechat = false;
                if ((!acc.offlineChats || !acc.offlineChats[String(ch.id)]) && Array.isArray(ch.offlineChatHistory) && ch.offlineChatHistory.length) {
                  if (!acc.offlineChats) acc.offlineChats = {};
                  acc.offlineChats[String(ch.id)] = ch.offlineChatHistory.slice();
                }
              }
            });
          } else {
            // 次账号只按真实聊天证据恢复丢失的联系人，不扩大其原有好友范围。
            (c.characters || []).forEach(function (ch) {
              if ((ch.worldId || 'default') !== (w.id || 'default')) return;
              var _cid = String(ch.id), _hist = acc.chats && acc.chats[_cid];
              if (!contactOf(acc, ch.id) && Array.isArray(_hist) && _hist.length) addContact(acc, ch, _hist);
            });
          }
        });
      });

      // 5) 会话：已登录则校验有效性；未登录不自动选定身份（点微信先走选世界/选账号页）
      if (!c.waSession) {
        c.waSession = { worldId: dw.id, kind: null, refId: null };
      } else if (c.waSession.kind === 'user' && !findUserAcc(c.waSession.refId)) {
        c.waSession = { worldId: dw.id, kind: null, refId: null };
      }
      // 6) 已登录→装载并挂载该账号；未登录→仅把默认主账号人设装进 config.user 供设置/论坛等界面展示（不视为登录、不挂载联系人）
      if (c.waSession && c.waSession.kind === 'user') {
        var acc = findUserAcc(c.waSession.refId); if (acc) { loadUserIntoRuntime(acc); mountAccount(acc); }
      } else if (dw.users[0]) {
        try { loadUserIntoRuntime(dw.users[0]); mountAccData(dw.users[0], c); } catch (e) {}
      }
      // 一次性合并：v66 曾把角色记忆按账号存进 acc.charMemories，现回归角色本人，把各账号的都并回 ch.memories（去重）
      if (!c._charMemMerged) {
        (c.characters || []).forEach(function (ch) {
          if (!Array.isArray(ch.memories)) ch.memories = [];
          var seen = {};
          ch.memories.forEach(function (m) { seen[(m && m.content) || m] = true; });
          (worlds() || []).forEach(function (w) {
            (w.users || []).forEach(function (u) {
              var bucket = u.charMemories && u.charMemories[String(ch.id)];
              if (!Array.isArray(bucket)) return;
              bucket.forEach(function (m) {
                var key = (m && m.content) || m;
                if (key && !seen[key]) { seen[key] = true; ch.memories.push(m); }
              });
            });
          });
        });
        c._charMemMerged = true;
      }
      try { reconcileNpcsToChars(); } catch (e) {}
      try { reconcileUserAccounts(); } catch (e) {}
      try { reconcileCharOwner(); } catch (e) {}
      try { reconcileCharPeople(); } catch (e) {}
      try { reconcileMainContacts(); } catch (e) {}
      try { reconcileGroupOwnership(); } catch (e) {} // v90：自愈悬空的群归属/世界，找回“消失”的群
      c[MIG_FLAG] = true;
      save();
    } catch (e) {
      console.warn('[WA] migrate error', e);
    }
  }
  WA.migrate = migrate;
  /* 一次性修复历史消息被错误翻成“全是我发的”：
     早期版本在“并未真正打开某个单聊（对端 peerKey 为空）”时也会执行盖章落盘，
     把一条线里对方(assistant)的消息错盖成当前账号、role 翻成 user 并持久化。
     首次迁移前拍下的 _waSnapshot.characters[].chatHistory 保留了污染前 role 正确的原始消息，
     这里严格按“同长度、逐索引、快照原始线确有对方回复、当前线却一条 assistant 都没有”才还原，
     长度对不上 / 本来就全是用户发言 的线一律不动，绝不靠奇偶猜测臆测归属。 */
  function healContaminatedThreads() {
    var c = C(); if (!c || c._waThreadHealedV2) return;
    try {
      var snap = (c._waSnapshot && Array.isArray(c._waSnapshot.characters)) ? c._waSnapshot.characters : null;
      if (!snap) { c._waThreadHealedV2 = 1; return; }
      var snapById = {};
      snap.forEach(function (ch) { if (ch && ch.id) snapById[String(ch.id)] = Array.isArray(ch.chatHistory) ? ch.chatHistory : []; });
      var healed = 0;
      function healArr(arr, meK, cid) {
        if (!Array.isArray(arr) || arr.length < 2) return 0;
        var orig = snapById[String(cid)];
        // 必须能拿到同角色的原始线，且当前线不比原始线短（尾部允许有污染后新增的健康消息）
        if (!Array.isArray(orig) || orig.length < 2 || arr.length < orig.length) return 0;
        var origHasUser = orig.some(function (x) { return x && x.role === 'user'; });
        var origHasAssistant = orig.some(function (x) { return x && x.role === 'assistant'; });
        if (!origHasUser || !origHasAssistant) return 0; // 快照本来就单方发言，无对照不还原
        var n0 = orig.length, mismatch = 0;
        for (var i = 0; i < n0; i++) { // 先统计老段与快照原始 role 的不一致条数（整体对调/错盖都会不一致）
          var cm = arr[i], sm = orig[i]; if (!cm || !sm || cm.role === 'system') continue;
          if (cm.role !== sm.role) mismatch++;
        }
        // 至少 2 条、或达到老段 1/3 对不上，才判定为被翻转污染，避免误伤个别正常差异
        if (mismatch < 2 && mismatch < Math.ceil(n0 / 3)) return 0;
        var n = 0;
        for (var j = 0; j < n0; j++) { // 仅按快照索引还原老段 role，尾部新增消息保持不动
          var cur = arr[j], src = orig[j]; if (!cur || !src) continue;
          if (cur.role !== src.role) { cur.role = src.role; n++; }
          delete cur.senderKey; // 清掉错盖，下次打开会话时 orientThread 按正确视角重新盖章
        }
        return n;
      }
      (c.worlds || []).forEach(function (w) {
        (w.users || []).forEach(function (u) {
          var meK = identKey('user', u.id);
          if (u.chats && typeof u.chats === 'object') {
            Object.keys(u.chats).forEach(function (cid) { healed += healArr(u.chats[cid], meK, cid); });
          }
        });
      });
      c._waThreadHealedV2 = 1;
      if (healed > 0) { try { save(); } catch (e) {} }
    } catch (e) { try { C()._waThreadHealedV2 = 1; } catch (_) {} }
  }
  WA.healContaminatedThreads = healContaminatedThreads; window.waHealContaminatedThreads = healContaminatedThreads;
  /* V3 存量治愈（不依赖迁移快照，按“消息归属是否属于本会话合法端点”自洽校验，幂等一次性）：
     A 世界层角色共享线 _charThreads：清掉不属于本 pair 的错盖 senderKey，打开时 orientThread 重盖；
     B 用户账号 u.chats：两端为 u:账号 / c:角色，清第三者 senderKey；
     C 群 gc.messages：senderId 不属于本群成员时按 senderName 重盖，盖不上置空（落左侧带头衔，绝不错判成我）；
       并把“多行、每行都是‘本群成员名:内容’、涉及≥2名成员”的被合并消息保守拆回多条。 */
  function healThreadsV3() {
    var c = C(); if (!c || c._waThreadHealedV3) return;
    var changed = 0;
    function nn(x) { return String(x == null ? '' : x).replace(/\s+/g, '').toLowerCase(); }
    try {
      var store = c._charThreads || {};
      Object.keys(store).forEach(function (wid) {
        var bucket = store[wid]; if (!bucket) return;
        Object.keys(bucket).forEach(function (pk) {
          var arr = bucket[pk]; if (!Array.isArray(arr)) return; var ends = pk.split('~');
          arr.forEach(function (m) {
            if (!m || m.role === 'system' || !m.senderKey) return;
            if (ends.indexOf(String(m.senderKey)) < 0) { delete m.senderKey; changed++; }
          });
        });
      });
    } catch (e) {}
    try {
      (c.worlds || []).forEach(function (w) {
        (w.users || []).forEach(function (u) {
          var meK = identKey('user', u.id);
          if (u.chats && typeof u.chats === 'object') Object.keys(u.chats).forEach(function (cid) {
            var arr = u.chats[cid]; if (!Array.isArray(arr)) return; var peerK = identKey('char', cid);
            arr.forEach(function (m) {
              if (!m || m.role === 'system' || !m.senderKey) return;
              if (m.senderKey !== meK && m.senderKey !== peerK) { delete m.senderKey; changed++; }
            });
          });
        });
      });
    } catch (e) {}
    try {
      (c.groupChats || []).forEach(function (gc) {
        if (!gc || !Array.isArray(gc.messages) || !Array.isArray(gc.members)) return;
        var idSet = {}, byName = {};
        gc.members.forEach(function (mm) {
          if (!mm) return;
          if (mm.memberId != null) idSet[String(mm.memberId)] = 1;
          var k = nn(mm.name); if (k) byName[k] = byName[k] || mm;
        });
        // 先保守拆分被糊成一段的多人消息
        var rebuilt = [];
        gc.messages.forEach(function (m) {
          if (!m) return;
          var lines = String(m.content == null ? '' : m.content).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          var parsed = lines.map(function (ln) {
            var mt = ln.match(/^(.{1,12}?)[:：]\s*(.+)$/); if (!mt) return null;
            var mem = byName[nn(mt[1])]; return mem ? { mem: mem, text: mt[2] } : null;
          });
          var who = {}; parsed.forEach(function (q) { if (q) who[String(q.mem.memberId)] = 1; });
          if (lines.length >= 2 && parsed.length === lines.length && Object.keys(who).length >= 2) {
            parsed.forEach(function (q, i) {
              rebuilt.push(Object.assign({}, m, { senderName: q.mem.name, senderId: (q.mem.memberId != null ? q.mem.memberId : null), content: q.text, time: (m.time || Date.now()) + i }));
            });
            changed++;
          } else rebuilt.push(m);
        });
        if (rebuilt.length !== gc.messages.length) gc.messages = rebuilt;
        // 再校正 senderId 归属
        gc.messages.forEach(function (m) {
          if (!m) return;
          if (m.senderId != null && idSet[String(m.senderId)]) return;
          var mem = byName[nn(m.senderName)];
          if (mem && mem.memberId != null) { if (String(m.senderId) !== String(mem.memberId)) { m.senderId = mem.memberId; changed++; } }
          else if (m.senderId != null) { m.senderId = null; changed++; }
        });
      });
    } catch (e) {}
    c._waThreadHealedV3 = 1;
    if (changed > 0) { try { save(); } catch (e) {} }
  }
  WA.healThreadsV3 = healThreadsV3; window.waHealThreadsV3 = healThreadsV3;
  /* V4 存量治愈（新 flag，升级后必跑一次，不被 V2/V3 的一次性标记挡住）：
     A 私聊：以迁移前快照 _waSnapshot 的原始 role 为唯一权威，逐条纠正被翻转的 role、清错盖 senderKey（无阈值、不要求双方都发言）；
     B 角色自带全局线 ch.chatHistory 同样按快照复位；
     C 世界层 _charThreads 清掉不属于本 pair 两端的第三者 key；
     D 群聊：按成员表权威重盖 senderId（找不到置 null，打开时必落左侧而非错判成“我”）；放宽“多人糊一段”拆分——
       只要一段里出现≥2名本群成员的“名字:内容”行就拆，未带名字的行并入上一条。 */
  function healThreadsV4() {
    var c = C(); if (!c || c._waThreadHealedV4) return;
    var changed = 0;
    function nn(x) { return String(x == null ? '' : x).replace(/\s+/g, '').toLowerCase(); }
    var snap = (c._waSnapshot && Array.isArray(c._waSnapshot.characters)) ? c._waSnapshot.characters : null;
    var snapById = {}; if (snap) snap.forEach(function (ch) { if (ch && ch.id) snapById[String(ch.id)] = Array.isArray(ch.chatHistory) ? ch.chatHistory : []; });
    // A 用户账号私聊线：按快照原始 role 复位
    try {
      (c.worlds || []).forEach(function (w) {
        (w.users || []).forEach(function (u) {
          var meK = identKey('user', u.id); if (!u.chats || typeof u.chats !== 'object') return;
          Object.keys(u.chats).forEach(function (cid) {
            var arr = u.chats[cid], orig = snapById[String(cid)]; if (!Array.isArray(arr) || !Array.isArray(orig)) return;
            var peerK = identKey('char', cid), n = Math.min(arr.length, orig.length);
            for (var i = 0; i < n; i++) {
              var cm = arr[i], sm = orig[i]; if (!cm || !sm || sm.role === 'system' || cm.role === 'system') continue;
              var wantKey = sm.role === 'user' ? meK : peerK;
              if ((cm.senderKey && cm.senderKey !== wantKey) || cm.role !== sm.role) { cm.role = sm.role; delete cm.senderKey; changed++; }
            }
          });
        });
      });
    } catch (e) {}
    // B 角色自带全局线 ch.chatHistory 按快照复位（主控视角原始线，本不该带 senderKey）
    try {
      (c.characters || []).forEach(function (ch) {
        var orig = snapById[String(ch.id)]; if (!Array.isArray(ch.chatHistory) || !Array.isArray(orig)) return;
        var n = Math.min(ch.chatHistory.length, orig.length);
        for (var i = 0; i < n; i++) {
          var cm = ch.chatHistory[i], sm = orig[i]; if (!cm || !sm || sm.role === 'system' || cm.role === 'system') continue;
          if (cm.role !== sm.role || cm.senderKey) { cm.role = sm.role; delete cm.senderKey; changed++; }
        }
      });
    } catch (e) {}
    // C 世界层角色共享线：清第三者 key
    try {
      var store = c._charThreads || {};
      Object.keys(store).forEach(function (wid) {
        var bucket = store[wid]; if (!bucket) return;
        Object.keys(bucket).forEach(function (pk) {
          var arr = bucket[pk], ends = pk.split('~'); if (!Array.isArray(arr)) return;
          arr.forEach(function (m) {
            if (!m || m.role === 'system' || !m.senderKey) return;
            if (ends.indexOf(String(m.senderKey)) < 0) { delete m.senderKey; changed++; }
          });
        });
      });
    } catch (e) {}
    // D 群聊：放宽拆分 + 权威重盖 senderId
    try {
      (c.groupChats || []).forEach(function (gc) {
        if (!gc || !Array.isArray(gc.messages) || !Array.isArray(gc.members)) return;
        var byName = {}, idSet = {};
        gc.members.forEach(function (mm) {
          if (!mm) return; if (mm.memberId != null) idSet[String(mm.memberId)] = mm;
          var k = nn(mm.name); if (k) byName[k] = byName[k] || mm;
        });
        var rebuilt = [];
        gc.messages.forEach(function (m) {
          if (!m) return;
          var lines = String(m.content == null ? '' : m.content).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          var rows = [], cur = null;
          lines.forEach(function (ln) {
            var mt = ln.match(/^(.{1,12}?)[:：]\s*(.+)$/), mem = mt ? byName[nn(mt[1])] : null;
            if (mem) { cur = { mem: mem, text: mt[2] }; rows.push(cur); }
            else if (cur) cur.text += '\n' + ln;
          });
          var who = {}; rows.forEach(function (r) { who[String(r.mem.memberId)] = 1; });
          if (rows.length >= 2 && Object.keys(who).length >= 2) {
            rows.forEach(function (r, i) {
              rebuilt.push(Object.assign({}, m, { senderName: r.mem.name, senderId: (r.mem.memberId != null ? r.mem.memberId : null), role: 'other', content: r.text, time: (m.time || Date.now()) + i }));
            });
            changed++;
          } else rebuilt.push(m);
        });
        if (rebuilt.length !== gc.messages.length) gc.messages = rebuilt;
        gc.messages.forEach(function (m) {
          if (!m) return;
          if (m.senderId != null && idSet[String(m.senderId)]) return;
          var mem = byName[nn(m.senderName)];
          if (mem && mem.memberId != null) { if (String(m.senderId) !== String(mem.memberId)) { m.senderId = mem.memberId; changed++; } }
          else if (m.senderId != null) { m.senderId = null; m.role = 'other'; changed++; }
        });
      });
    } catch (e) {}
    c._waThreadHealedV4 = 1;
    if (changed > 0) { try { save(); } catch (e) {} }
  }
  WA.healThreadsV4 = healThreadsV4; window.waHealThreadsV4 = healThreadsV4;
  /* V5 存量治愈（新 flag，升级必跑一次，幂等）：专治 V3/V4 漏掉的“私聊/群里一条 assistant 消息里糊了多句、本应是多个气泡”。
     规则保守：只拆 role=assistant/other、纯文本(type 为空或 text)、≥2 个非空行、且不含心声/语音/卡片标签的消息；
     逐行还原成多条独立气泡，保留原 senderKey/senderName/senderId，时间戳逐条 +1s。同时按两端 senderKey 自洽左右。 */
  function healThreadsV5() {
    var c = C(); if (!c || c._waThreadHealedV5) return;
    var changed = 0;
    var CARD = /<miyavoice|<inner_voice|\[语音|\[照片|\[图片|\[转账|\[红包|\[位置|\[视频|\[通话|\[名片|\[链接|\[文件/;
    function splitOne(m) {
      if (!m || m.role === 'system') return null;
      if (m.role !== 'assistant' && m.role !== 'other') return null;
      if (m.type && m.type !== 'text') return null;
      var txt = String(m.content == null ? '' : m.content);
      if (CARD.test(txt)) return null;
      var lines = txt.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (lines.length < 2) return null;
      return lines.map(function (ln, i) { var nm = Object.assign({}, m, { content: ln, time: (m.time || Date.now()) + i * 1000 }); return nm; });
    }
    function healPrivateArr(arr) {
      if (!Array.isArray(arr)) return;
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var parts = splitOne(arr[i]);
        if (parts) { changed++; out.push.apply(out, parts); } else out.push(arr[i]);
      }
      if (out.length !== arr.length) arr.length = 0, Array.prototype.push.apply(arr, out);
    }
    try {
      (c.worlds || []).forEach(function (w) { (w.users || []).forEach(function (u) {
        if (u.chats && typeof u.chats === 'object') Object.keys(u.chats).forEach(function (cid) {
          var arr = u.chats[cid]; healPrivateArr(arr);
          // 有 senderKey 的按两端自洽 role
          if (Array.isArray(arr)) { var meK = identKey('user', u.id), pk = identKey('char', cid);
            arr.forEach(function (m) { if (m && m.senderKey) m.role = (m.senderKey === meK) ? 'user' : (m.senderKey === pk ? 'assistant' : m.role); }); }
        });
      }); });
    } catch (e) {}
    try {
      var store = c._charThreads || {};
      Object.keys(store).forEach(function (wid) { Object.keys(store[wid] || {}).forEach(function (pair) {
        var arr = store[wid][pair], ends = pair.split('~'); healPrivateArr(arr);
        if (Array.isArray(arr)) arr.forEach(function (m) { if (m && m.senderKey && ends.indexOf(String(m.senderKey)) >= 0) m.role = (m.senderKey === ends[0]) ? 'user' : 'assistant'; });
      }); });
    } catch (e) {}
    try {
      (c.characters || []).forEach(function (ch) { healPrivateArr(ch.chatHistory); });
    } catch (e) {}
    try { // 群聊：多行 other/assistant 拆条，再按成员表权威重盖 senderId
      (c.groupChats || []).forEach(function (gc) {
        if (!gc || !Array.isArray(gc.messages)) return;
        var rebuilt = []; gc.messages.forEach(function (m) {
          var parts = splitOne(m);
          if (parts) { changed++; rebuilt.push.apply(rebuilt, parts); } else rebuilt.push(m);
        });
        if (rebuilt.length !== gc.messages.length) gc.messages = rebuilt;
        if (Array.isArray(gc.members)) {
          var idSet = {}, byName = {};
          function nn(x) { return String(x == null ? '' : x).replace(/\s+/g, '').toLowerCase(); }
          gc.members.forEach(function (mm) { if (!mm) return; if (mm.memberId != null) idSet[String(mm.memberId)] = 1; var k = nn(mm.name); if (k) byName[k] = mm; });
          gc.messages.forEach(function (m) {
            if (!m) return;
            if (m.senderId != null && idSet[String(m.senderId)]) return;
            var mem = byName[nn(m.senderName)];
            if (mem && mem.memberId != null) m.senderId = mem.memberId;
            else if (m.senderId != null) { m.senderId = null; m.role = 'other'; }
          });
        }
      });
    } catch (e) {}
    c._waThreadHealedV5 = 1;
    if (changed > 0) { try { save(); } catch (e) {} }
  }
  WA.healThreadsV5 = healThreadsV5; window.waHealThreadsV5 = healThreadsV5;
  /* 用户人设自愈（每次启动幂等，只补空、绝不覆盖非空）：老存档迁移后默认世界主账号若个别身份字段缺失，
     从迁移前快照/运行时 user 回填，避免“更新后我的人设空了”。快照来自旧单账号时代，只属于默认世界主账号。 */
  var PERSONA_CORE = ['name', 'personaName', 'nickname', 'wxName', 'wxId', 'persona', 'personaRelations', 'appearance', 'artStyle', 'avatar', 'refImages', 'phoneNumber', 'gender'];
  function personaCoreHas(u) {
    if (!u) return false;
    return ['persona', 'personaName', 'personaRelations', 'appearance', 'artStyle', 'name', 'wxName'].some(function (f) {
      var v = u[f]; return v !== undefined && v !== null && v !== '';
    });
  }
  function backupPersona(acc) {
    if (!acc || !personaCoreHas(acc)) return;
    var c = C(); if (!c._personaBackup || typeof c._personaBackup !== 'object') c._personaBackup = {};
    var o = {}; PERSONA_CORE.forEach(function (f) { if (acc[f] !== undefined) o[f] = cloneVal(acc[f]); }); o.at = Date.now();
    c._personaBackup[String(acc.id)] = o;
  }
  // 只补空、绝不覆盖非空，且严格按同一账号 id 找回，杜绝串号
  function rescuePersonaFromBackup() {
    var c = C(); if (!c._personaBackup) return;
    (c.worlds || []).forEach(function (w) { (w.users || []).forEach(function (acc) {
      var bk = c._personaBackup[String(acc.id)]; if (!bk) return;
      PERSONA_CORE.forEach(function (f) {
        var empty = acc[f] === undefined || acc[f] === null || acc[f] === '' || (Array.isArray(acc[f]) && !acc[f].length);
        if (empty && bk[f] !== undefined && bk[f] !== null && bk[f] !== '' && !(Array.isArray(bk[f]) && !bk[f].length)) acc[f] = cloneVal(bk[f]);
      });
    }); });
  }
  WA.rescuePersonaFromBackup = rescuePersonaFromBackup; window.waRescuePersonaFromBackup = rescuePersonaFromBackup;
  function rescueUserPersonaAlways() {
    var c = C();
    function isEmpty(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); }
    function fillFrom(acc, src) { if (!acc || !src) return; USER_FIELDS.concat(USER_ALIAS_FIELDS).forEach(function (f) { if (isEmpty(acc[f]) && !isEmpty(src[f])) acc[f] = cloneVal(src[f]); }); }
    try {
      var snapU = (c._waSnapshot && c._waSnapshot.user) || null;
      var dw = defaultWorld();
      if (dw && Array.isArray(dw.users) && dw.users[0]) {
        if (snapU) fillFrom(dw.users[0], snapU);
        // 运行时 user 若确属该主账号且更全，也补一次（覆盖瞬态丢失）
        if (c.user && (!c.user._waAccountId || String(c.user._waAccountId) === String(dw.users[0].id)) && (c.user.kind !== 'char')) fillFrom(dw.users[0], c.user);
      }
      // 运行时 config.user 为空、当前会话账号有内容：重装，保证“我的人设”界面不空白
      var sn = session();
      if (sn && sn.kind === 'user') { var acc = findUserAcc(sn.refId); if (acc && !userHasContent(c.user) && userHasContent(acc)) loadUserIntoRuntime(acc); }
      try { rescuePersonaFromBackup(); } catch (e2) {}
    } catch (e) {}
  }
  WA.rescueUserPersonaAlways = rescueUserPersonaAlways; window.waRescueUserPersonaAlways = rescueUserPersonaAlways;

  /* 登录 / 登出 / 切换 */
  function loginUser(accId) {
    var c = C(); syncRuntimeToAccount();
    var acc = findUserAcc(accId); if (!acc) return false;
    var ownerWorld = accountWorld(acc);
    var ownerWorldId = ownerWorld ? (ownerWorld.id || 'default') : (acc._worldId || defaultWorld().id);
    acc._worldId = ownerWorldId;
    c.waSession = { worldId: ownerWorldId, kind: 'user', refId: acc.id };
    loadUserIntoRuntime(acc);
    mountAccount(acc); // 挂载该账号独立的联系人与聊天记录
    // 清掉上一个账号残留的消息横幅/红点，避免“切号还看到上一个账号提示”
    try { var _lt = document.getElementById('toast'); if (_lt) _lt.classList.remove('show'); } catch (e) {}
    try { if (typeof updateBadges === 'function') updateBadges(); } catch (e) {}
    save();
    closeAuth();
    if (typeof openApp === 'function') openApp('wechat');
    return true;
  }
  WA.loginUser = loginUser;
  function logout() {
    var c = C();
    try { leaveCharIdentity(); } catch (e) {}
    syncRuntimeToAccount();
    try { unmountAccount(); } catch (e) {}
    var sn = session();
    var _logoutWid = sn ? sn.worldId : defaultWorld().id;
    c.waSession = { worldId: _logoutWid, kind: null, refId: null };
    // 登出后把记忆/好友请求/朋友圈运行时桶切回该世界主账号，避免残留上一个账号的数据
    try {
      var _lw = worlds().filter(function (x) { return x.id === _logoutWid; })[0] || defaultWorld();
      if (_lw && _lw.users[0]) { loadUserIntoRuntime(_lw.users[0]); mountAccData(_lw.users[0], c); }
    } catch (e) {}
    save();
    try { if (typeof goHome === 'function') goHome(); } catch (e) {}
    openAuth();
  }
  WA.logout = logout;
  function isLoggedIn() { var sn = session(); return !!(sn && sn.kind && sn.refId); }
  WA.isLoggedIn = isLoggedIn;

  /* 暴露到全局便于 app-02 钩子调用 */
  window.waMigrate = migrate; window.waLoginUser = loginUser; window.waLogout = logout;
  window.waIsLoggedIn = isLoggedIn; window.waCurrentWorld = currentWorld;
  window.waSyncRuntimeToAccount = syncRuntimeToAccount; window.waLoadUserIntoRuntime = loadUserIntoRuntime;
  window.waFindUserAcc = findUserAcc; window.waSession = session;
  window.waDefaultWorld = defaultWorld; window.waWorlds = worlds;
  /* 当前激活世界 id；某角色/群是否属于当前世界（用于多世界隔离显示，单世界永远为真，不影响老用户） */
  function activeWorldId() { var sn = session(); var wid = sn && sn.worldId; if (!wid) { var dw = defaultWorld(); wid = dw ? dw.id : 'default'; } return wid; }
  function charVisible(ch) { if (!ch) return false; var wid = activeWorldId(); return (ch.worldId || 'default') === wid; }
  // v90：某世界是否仍存在（群/线下的 worldId 指向已删除世界时返回 false，渲染层据此兜底显示而不是把群藏没）
  function worldAlive(wid) { var w = wid || 'default'; var all = worlds(); if (!Array.isArray(all) || !all.length) return true; return all.some(function (x) { return (x.id || 'default') === w; }); }
  // v90：群/多人线下在当前世界是否可见——世界匹配，或其世界已失效（删除/数据晚到）时兜底可见，宁可见不丢失
  function groupVisibleHere(g) {
    if (!g) return false;
    var wid = g.worldId || 'default';
    if (wid === activeWorldId()) return true;
    var all = worlds();
    // 世界列表还没加载/为空（IndexedDB 数据晚到）时无法判断，宁可见不丢失
    if (!Array.isArray(all) || !all.length) return true;
    // 列表里找不到其世界=世界已删除→兜底显示；找得到=属于另一个现存世界→不显示
    return !all.some(function (x) { return (x.id || 'default') === wid; });
  }
  window.waActiveWorldId = activeWorldId; window.waCharVisible = charVisible;
  window.waWorldAlive = worldAlive; window.waGroupVisibleHere = groupVisibleHere;
  // 账号联系人/聊天
  window.waEnsureMount = ensureMount;
  window.waCurrentAccount = currentAccount;
  // 取某角色的【创建者账号】对象（含 personaName/name/wxName），供非创建者账号会话时告诉角色“你创建者叫什么、你确实认识TA”
  window.waCharOwnerAcc = function (ch) {
    try {
      if (!ch) return null;
      var o = ch.ownerAccountId ? findUserAcc(ch.ownerAccountId) : null;
      if (o) return o;
      var wid = ch.worldId || 'default';
      var w = (C().worlds || []).filter(function (x) { return (x.id || 'default') === wid; })[0];
      return (w && Array.isArray(w.users) && w.users[0]) ? w.users[0] : null;
    } catch (e) { return null; }
  };
  window.waIsFriendWith = function (ch) { var a = currentAccount(); return isFriendWith(a, ch); };
  window.waContactOf = function (ch) { var a = currentAccount(); return a ? contactOf(a, ch && ch.id) : null; };
  window.waAddFriendCurrent = function (ch, inherit) { var a = currentAccount(); if (!a || !ch) return null; var t = addContact(a, ch, inherit); mountAccount(a); return t; };
  // 好友申请是否属于当前人设账号（有归属按归属；无归属老记录只对该世界第一个账号可见）
  window.waReqBelongsCurrent = function (req) {
    if (!req) return false;
    var a = currentAccount();
    if (!a) return true;
    // friendRequests 已按账号分桶、运行时同引用挂载，桶内请求天然属于当前账号；
    // 仅当请求明确带了别的账号 id 时才过滤，避免“新账号亮红点却点进去没有”
    if (req.waAccountId) return req.waAccountId === a.id;
    return true;
  };
  // 当前账号与某角色的好友关系：'friend'=好友  'removed'=加过又删  null=该账号从未加过（首次，不能当成“被删除”）
  window.waContactStatus = function (chOrId) {
    var cid = (chOrId && chOrId.id !== undefined) ? chOrId.id : chOrId;
    var a = currentAccount();
    if (!a) {
      var ch = (chOrId && chOrId.name) ? chOrId : (C().characters || []).filter(function (x) { return String(x.id) === String(cid); })[0];
      return ch ? (ch.deletedFromWechat ? 'removed' : 'friend') : 'friend';
    }
    var t = contactOf(a, cid);
    return t ? t.status : null;
  };
  // 当前账号是否从未加过该角色（用于区分“首次添加”与“删除后重新添加”）
  window.waIsFirstAdd = function (chOrId) { return window.waContactStatus(chOrId) === null; };
  // 群聊/多人线下是否归属当前人设账号（有 owner 按 owner；无 owner 的旧群只对该世界第一个账号可见）
  // v89：解析“当前归属用户账号id”的兜底链：当前挂载账号 → 会话refId → 当前世界主账号。
  // 用于建群/建多人线下，保证登录瞬态 waCurrentAccount() 为空时也不会建出无主群（无主群会导致创建者之后看不到）。
  window.waResolveOwnerId = function () {
    try {
      var cur = currentAccount();
      if (cur && cur.id) return cur.id;
      var sn = session();
      if (sn && sn.kind === 'user' && sn.refId) return sn.refId;
      var wid = (sn && sn.worldId) || (typeof waActiveWorldId === 'function' ? waActiveWorldId() : 'default');
      var w = worlds().filter(function (x) { return (x.id || 'default') === (wid || 'default'); })[0];
      if (w && Array.isArray(w.users) && w.users[0]) return w.users[0].id;
    } catch (e) {}
    return null;
  };
  window.waGroupOwned = function (g) {
    if (!g) return false;
    var a = currentAccount();
    if (!a) return true;
    if (g.waOwnerId) {
      // v90修复“群聊凭空消失”：若群归属的账号在其世界里已不存在（悬空 owner，常见于临时空账号被清理），
      // 不能把群永久藏起来——对当前世界的真实账号一律可见，真正的归属修正交给启动自愈。
      var ownerAlive = false;
      try {
        var gw = worlds().filter(function (x) { return (x.id || 'default') === (g.worldId || 'default'); })[0];
        if (gw && Array.isArray(gw.users)) ownerAlive = gw.users.some(function (u) { return String(u.id) === String(g.waOwnerId); });
      } catch (eo) { ownerAlive = true; } // 判不出来时按存活处理，宁可见到也不要丢
      if (!ownerAlive) return true;
      return g.waOwnerId === a.id;
    }
    // v89修复：无 waOwnerId 的群属于历史/登录瞬态创建的“无主群”，归属无法当场判定。
    // 外层已按世界过滤，这里对当前世界内的账号一律可见，绝不能因为找不到主账号就把群藏起来（“群聊凭空消失”）。
    // 归属的固化只在启动迁移里做（那里能判断继承账号），此处不做“看一次就绑定”的固化，避免时隐时现。
    return true;
  };

  /* ============================================================
   * 通用样式注入（一次）
   * ============================================================ */
  var CSS = [
    '#waAuthOverlay,#waAssist,#waUserEditOverlay{position:absolute;inset:0;z-index:9000;background:#111214;color:#eee;font-size:14px;display:none;flex-direction:column;overflow:hidden}',
    '#waAuthOverlay.show,#waAssist.show,#waUserEditOverlay.show{display:flex}',
    '.wa-top{flex-shrink:0;padding:14px 16px;display:flex;align-items:center;gap:10px;background:#1c1c1e;border-bottom:.5px solid rgba(255,255,255,.08)}',
    '.wa-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '.wa-card{background:#1c1c1e;border-radius:14px;margin:12px;overflow:hidden}',
    '.wa-row{display:flex;align-items:center;gap:12px;padding:13px 15px;border-bottom:.5px solid rgba(255,255,255,.06);cursor:pointer}',
    '.wa-row:last-child{border-bottom:none}',
    '.wa-ava{width:46px;height:46px;border-radius:10px;background:#576B95;display:grid;place-items:center;font-size:20px;color:#fff;overflow:hidden;flex-shrink:0}',
    '.wa-ava img{width:100%;height:100%;object-fit:cover}',
    '.wa-grow{flex:1;min-width:0}',
    '.wa-name{font-size:16px;color:#fff;font-weight:600}',
    '.wa-sub{font-size:12px;color:#8e8e93;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.wa-tag{font-size:10px;padding:2px 7px;border-radius:8px;background:rgba(87,107,149,.25);color:#9db4e8;margin-left:6px}',
    '.wa-tag.char{background:rgba(255,159,10,.18);color:#ffb85c}',
    '.wa-btn{margin:14px 12px;padding:13px;border-radius:12px;text-align:center;font-size:16px;font-weight:600;background:#07C160;color:#fff;border:none;width:calc(100% - 24px)}',
    '.wa-btn.ghost{background:#2c2c2e;color:#ddd}',
    '.wa-btn.danger{background:#3a2326;color:#ff6b6b}',
    '.wa-btn:active{opacity:.8}',
    '.wa-input{width:100%;box-sizing:border-box;background:#2c2c2e;border:.5px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;padding:12px 13px;margin:8px 0;font-size:15px}',
    '.wa-field{padding:0 14px;margin-top:6px}',
    '.wa-field label{display:block;font-size:12px;color:#8e8e93;margin:10px 0 2px}',
    '.wa-h{padding:18px 16px 6px;font-size:13px;color:#8e8e93}',
    '.wa-seg{display:flex;gap:8px;padding:10px 12px;overflow-x:auto}',
    '.wa-seg .chip{flex-shrink:0;padding:7px 14px;border-radius:16px;background:#2c2c2e;color:#ccc;font-size:13px}',
    '.wa-seg .chip.on{background:#07C160;color:#fff}',
    '.wa-seg .chip.add{background:transparent;border:1px dashed #555;color:#999}',
    '.wa-back{width:30px;color:#bbb;font-size:22px;cursor:pointer;line-height:1}',
    '.wa-title{flex:1;text-align:center;font-size:16px;font-weight:600}',
    '.wa-link{color:#5795ff;font-size:13px;cursor:pointer}',
    '.wa-chatrow{display:flex;gap:11px;padding:11px 14px;border-bottom:.5px solid rgba(255,255,255,.06);cursor:pointer}',
    '.wa-bubble{max-width:72%;padding:9px 12px;border-radius:10px;font-size:15px;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
    '.wa-bubble.l{background:#3a3a3c;color:#fff;border-top-left-radius:3px}',
    '.wa-bubble.r{background:#07C160;color:#fff;border-top-right-radius:3px;margin-left:auto}',
    '.wa-line{display:flex;margin:8px 14px;gap:8px;align-items:flex-start}',
    '.wa-moments{background:#1c1c1e;border-radius:12px;margin:10px 12px;padding:13px}',
    '.wa-riskbar{font-size:11px;color:#ffb85c;padding:6px 14px;background:rgba(255,159,10,.08)}'
  ].join('');
  var cssInjected = false;
  function injectCss() {
    if (cssInjected) return; cssInjected = true;
    var el = document.createElement('style'); el.id = 'wa-style'; el.textContent = CSS; document.head.appendChild(el);
  }
  function overlay(id, html) {
    var o = document.getElementById(id);
    if (!o) { o = document.createElement('div'); o.id = id; document.getElementById('phoneScreen') ? document.getElementById('phoneScreen').appendChild(o) : document.body.appendChild(o); }
    o.innerHTML = html; return o;
  }
  function avaHtml(subject, size) {
    var av = subject && subject.avatar;
    if (av && /^(data:image\/|https?:|blob:)/i.test(av)) return '<div class="wa-ava" style="' + (size ? 'width:' + size + 'px;height:' + size + 'px' : '') + '"><img src="' + av + '" alt=""></div>';
    var ch = (subject && (subject.wxName || subject.name)) || '?';
    var bg = (subject && subject.avatarBg) || '#576B95';
    return '<div class="wa-ava" style="background:' + bg + ';' + (size ? 'width:' + size + 'px;height:' + size + 'px' : '') + '">' + esc(String(ch).charAt(0)) + '</div>';
  }

  /* ============================================================
   * 登录 / 注册 / 世界切换
   * ============================================================ */
  var Auth = { step: 'world', draftWorldId: null };
  var _waSavedScrollY = 0;
  function openAuth(opts) {
    injectCss();
    var sn = session();
    Auth.draftWorldId = (sn && sn.worldId) || currentWorld().id;
    // 登出后进入：从“选世界”开始；微信内“切换账号”：直接到当前世界的账号步
    Auth.step = (opts && opts.step === 'account') ? 'account' : 'world';
    var o = overlay('waAuthOverlay', ''); o.classList.add('show');
    _waSavedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _waSavedScrollY + 'px';
    document.body.style.width = '100%';
    // Move overlay to body to prevent iOS keyboard push (phoneScreen transform breaks fixed positioning inside it)
    if (o.parentNode && o.parentNode !== document.body) { document.body.appendChild(o); }
    o.style.position = 'fixed';
    renderAuth();
  }
  WA.openAuth = openAuth; window.waOpenAuth = openAuth;
  function closeAuth() {
    var o = document.getElementById('waAuthOverlay'); if (o) { o.classList.remove('show'); o.style.position = ''; }
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, _waSavedScrollY);
  }
  WA.closeAuth = closeAuth; window.waCloseAuth = closeAuth;

  function renderAuth() {
    var o = document.getElementById('waAuthOverlay'); if (!o) return;
    if (Auth.step === 'register') {
      var wr = worlds().filter(function (x) { return x.id === Auth.draftWorldId; })[0] || defaultWorld();
      return renderRegister(o, wr);
    }
    if (Auth.step === 'account') return renderAccountStep(o);
    return renderWorldStep(o);
  }
  // 第一步：选世界
  function renderWorldStep(o) {
    var ws = worlds(); var sn = session();
    var html = '<div class="wa-top"><div class="wa-title">选择世界</div></div><div style="overflow-y:auto;flex:1">';
    html += '<div class="wa-h">先选择要进入哪个世界，再选该世界里的人设账号或角色</div><div class="wa-card">';
    if (!ws.length) html += '<div class="wa-row"><div class="wa-grow wa-sub">还没有世界</div></div>';
    ws.forEach(function (w) {
      var uc = (w.users || []).length;
      var cc = (C().characters || []).filter(function (ch) { return (ch.worldId || 'default') === (w.id || 'default'); }).length;
      var cur = sn && sn.worldId === w.id;
      html += '<div class="wa-row" onclick="waAuthPickWorld(\'' + w.id + '\')">'
        + '<div class="wa-grow"><div class="wa-name">' + esc(w.name) + (w.isDefault ? '<span class="wa-tag">默认</span>' : '') + (cur ? '<span class="wa-tag">上次</span>' : '') + '</div>'
        + '<div class="wa-sub">人设账号 ' + uc + ' 个 · 角色 ' + cc + ' 个</div></div><div class="wa-link">进入 ›</div></div>';
    });
    html += '</div>';
    html += '<button class="wa-btn ghost" onclick="waAuthNewWorld()">＋ 创建新世界</button>';
    if (sn && sn.kind && sn.refId) html += '<button class="wa-btn ghost" onclick="waCloseAuth()">返回当前微信</button>';
    html += '<div style="height:24px"></div></div>';
    o.innerHTML = html;
  }
  // 第二步：选该世界内的用户人设 / 角色
  function renderAccountStep(o) {
    var w = worlds().filter(function (x) { return x.id === Auth.draftWorldId; })[0] || defaultWorld();
    Auth.draftWorldId = w.id;
    var chars = worldChars(w.id); var sn = session();
    var html = '<div class="wa-top"><div class="wa-back" onclick="waAuthWorldBack()">‹</div><div class="wa-title">' + esc(w.name) + ' · 选择账号</div><div style="width:30px"></div></div>'
      + '<div style="overflow-y:auto;flex:1">'
      + '<div class="wa-h">我的人设账号（点击进入，可拥有多个）</div><div class="wa-card">';
    var users = w.users || [];
    if (!users.length) html += '<div class="wa-row"><div class="wa-grow"><div class="wa-sub">这个世界还没有人设账号，点下方按钮注册一个</div></div></div>';
    users.forEach(function (u) {
      var cur = sn && sn.kind === 'user' && sn.refId === u.id;
      html += '<div class="wa-row" onclick="waAuthTapUser(\'' + u.id + '\')">' + avaHtml(u)
        + '<div class="wa-grow"><div class="wa-name">' + esc(u.wxName || u.name || '未命名') + (cur ? '<span class="wa-tag">当前</span>' : '') + '</div>'
        + '<div class="wa-sub">' + esc(u.name || '未填姓名') + ' · 微信号：' + esc(u.wxId || '未设置') + '</div></div><div class="wa-link" onclick="event.stopPropagation();waEditUser(\'' + u.id + '\')">管理</div></div>';
    });
    html += '</div>';
    html += '<div class="wa-h">角色账号（需要角色的微信密码，可在聊天里问 TA；登录有被发现风险）</div><div class="wa-card">';
    if (!chars.length) html += '<div class="wa-row"><div class="wa-grow"><div class="wa-sub">这个世界还没有角色</div></div></div>';
    chars.forEach(function (ch, i) {
      var curC = sn && sn.kind === 'char' && sn.refId === ch.id;
      html += '<div class="wa-row" onclick="waAuthTapCharById(\'' + esc(String(ch.id)) + '\')">' + avaHtml(ch)
        + '<div class="wa-grow"><div class="wa-name">' + esc(ch.name) + '<span class="wa-tag char">角色</span>' + (curC ? '<span class="wa-tag">当前</span>' : '') + '</div>'
        + '<div class="wa-sub">微信号：' + esc(ch.wxId || '—') + '</div></div></div>';
    });
    html += '</div>';
    html += '<button class="wa-btn" onclick="waAuthGoRegister()">注册新的人设账号</button>';
    html += '<div style="height:24px"></div></div>';
    o.innerHTML = html;
  }
  window.waAuthPickWorld = function (wid) { Auth.draftWorldId = wid; Auth.step = 'account'; renderAuth(); };
  window.waAuthWorldBack = function () { Auth.step = 'world'; renderAuth(); };
  window.waAuthNewWorld = function () {
    askInput({ title: '创建新世界', label: '世界名称', placeholder: '例如：高中时代 / 娱乐圈', value: '新世界' }, function (ok, name) {
      if (!ok) return; name = (name || '').trim() || '新世界';
      var w = { id: uid('world'), name: name, isDefault: false, createdAt: Date.now(), users: [] };
      worlds().push(w); save(); Auth.draftWorldId = w.id; Auth.step = 'account'; renderAuth();
    });
  };
  window.waAuthTapChar = function (idx) {
    var w = worlds().filter(function (x) { return x.id === Auth.draftWorldId; })[0];
    _enterCharAccount(worldChars(w.id)[idx]);
  };
  window.waAuthTapCharById = function (cid) {
    var ch = (C().characters || []).filter(function (x) { return String(x.id) === String(cid); })[0];
    _enterCharAccount(ch);
  };
  window.waAuthTapUser = function (accId) {
    var u = findUserAcc(accId); if (!u) return;
    if (u.wxPassword) {
      askInput({ title: '进入「' + (u.wxName || u.name) + '」', label: '输入该人设账号的微信密码', placeholder: '微信密码', password: true }, function (ok, pwd) {
        if (!ok) return;
        if (pwd !== u.wxPassword) { toast('密码错误'); return; }
        try { leaveCharIdentity(); } catch (e) {}
        loginUser(accId);
      });
      return;
    }
    try { leaveCharIdentity(); } catch (e) {}
    loginUser(accId);
  };
  function _enterCharAccount(ch) {
    if (!ch) return;
    askInput({ title: '登录角色「' + ch.name + '」的微信', label: '需要 TA 的微信密码（可在与 TA 的聊天中询问）', placeholder: '输入微信密码', password: true }, function (ok, pwd) {
      if (!ok) return;
      var r = loginChar(ch, pwd);
      if (r && r.error === 'pwd') { logAbnormal(ch, '输入密码错误，尝试登录该账号'); toast('密码错误，已留下异常记录'); }
    });
  };
  window.waAuthGoRegister = function () { Auth.step = 'register'; renderAuth(); };

  function renderRegister(o, w) {
    o.innerHTML = '<div class="wa-top"><div class="wa-back" onclick="waAuthBack()">‹</div><div class="wa-title">注册人设 · ' + esc(w.name) + '</div><div style="width:30px"></div></div>'
      + '<div class="wa-body">'
      + '<div class="wa-field"><label>姓名（真实姓名）</label><input class="wa-input" id="waRegName" placeholder="角色对你的真实称呼">'
      + '<label>昵称（人设名）</label><input class="wa-input" id="waRegPersonaName" placeholder="你在这个世界的人设昵称">'
      + '<label>微信名（微信主页显示）</label><input class="wa-input" id="waRegWxName" placeholder="微信昵称">'
      + '<label>微信号</label><input class="wa-input" id="waRegWxId" placeholder="字母数字组合，可留空自动生成">'
      + '<label>微信密码（可留空=免密进入）</label><input class="wa-input" id="waRegPwd" type="password" placeholder="登录该人设账号用">'
      + '<label>人设简介 / 性格</label><textarea class="wa-input" id="waRegBio" rows="3" placeholder="你在这个世界是个怎样的人"></textarea>'
      + '<label>人物关系</label><input class="wa-input" id="waRegRelations" placeholder="和主要角色的初始关系（选填）">'
      + '<label>外貌文字描述（生图用）</label><textarea class="wa-input" id="waRegAppearance" rows="2"></textarea>'
      + '<label>生图画风描述</label><input class="wa-input" id="waRegArtStyle">'
      + '<div style="height:14px"></div>'
      + '<button class="wa-btn" onclick="waAuthDoRegister()">完成注册并进入微信</button>'
      + '<div style="height:26px"></div></div></div>';
  }
  window.waAuthBack = function () { Auth.step = 'account'; renderAuth(); };
  window.waAuthDoRegister = function () {
    var w = worlds().filter(function (x) { return x.id === Auth.draftWorldId; })[0] || defaultWorld();
    function v(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
    var name = v('waRegName');
    if (!name) { toast('至少填写姓名'); return; }
    var wxId = v('waRegWxId') || ('wx_' + hashStr(name + Date.now()).toString(36).slice(0, 8));
    var acc = {
      id: uid('uacc'), kind: 'user', _worldId: w.id,
      name: name, personaName: v('waRegPersonaName'), nickname: v('waRegPersonaName'),
      wxName: v('waRegWxName') || name, wxId: wxId, wxPassword: v('waRegPwd'),
      avatar: '', persona: v('waRegBio'), personaRelations: v('waRegRelations'),
      appearance: v('waRegAppearance'), artStyle: v('waRegArtStyle'), refImages: [],
      wallet: 0, walletHistory: [], assistantChat: [], createdAt: Date.now(),
      contacts: [], chats: {}, offlineChats: {}, moments: [], momentsCover: '', momentsLastSeen: 0,
      appData: null,
      memories: [], charMemories: {}, friendRequests: [], friendRequestsSeen: 0, unreadCount: 0
    };
    if (!Array.isArray(w.users)) w.users = [];
    w.users.push(acc); save();
    loginUser(acc.id);
  };
  // 微信内“切换账号”：不登出，保存当前后直接到当前世界的账号步
  function switchAccount() {
    try { syncRuntimeToAccount(); } catch (e) {}
    openAuth({ step: 'account' });
  }
  WA.switchAccount = switchAccount; window.waSwitchAccount = switchAccount;

  /* 注销账号（默认世界主账号不可注销，保证始终有一个落点） */
  window.waDeleteUser = function (accId) {
    var u = findUserAcc(accId); if (!u) return;
    var w = worlds().filter(function (x) { return (x.users || []).some(function (y) { return y.id === accId; }); })[0];
    if (w && (w.isDefault || w.id === 'default') && (w.users || []).length <= 1) { toast('默认世界需保留至少一个人设账号，不可注销'); return; }
    askConfirm('对人设账号「' + (u.wxName || u.name) + '」执行注销？注销后该账号及其微信资料将被删除，且不可恢复。', function (act) {
      if (!act) { renderAuth(); return; }
      __doDeleteUser(accId);
    });
  };
  function __doDeleteUser(accId) {
    var u = findUserAcc(accId); if (!u) return;
    worlds().forEach(function (ww) { if (Array.isArray(ww.users)) ww.users = ww.users.filter(function (x) { return x.id !== accId; }); });
    var sn = session(); if (sn && sn.refId === accId) { C().waSession = { worldId: currentWorld().id, kind: null, refId: null }; }
    waCloseUserEdit(); save(); toast('已注销'); renderAuth();
  };
  window.waManageUser = window.waDeleteUser; // 兼容旧引用

  /* ===== 人设账号资料编辑 ===== */
  var _editAccId = null, _editAvatar = '', _editRefs = [];
  function _ueReadFile(file, cb) {
    if (!file) return;
    try {
      if (typeof compressImageToDataURL === 'function') compressImageToDataURL(file, 768, 0.85, cb);
      else { var r = new FileReader(); r.onload = function (e) { cb(e.target.result); }; r.readAsDataURL(file); }
    } catch (e) { var r2 = new FileReader(); r2.onload = function (e) { cb(e.target.result); }; r2.readAsDataURL(file); }
  }
  window.waEditUser = function (accId) {
    var u = findUserAcc(accId); if (!u) return;
    injectCss(); _editAccId = accId;
    _editAvatar = u.avatar || '';
    _editRefs = Array.isArray(u.refImages) ? u.refImages.slice() : [];
    var f = function (v) { return esc(v == null ? '' : v); };
    var html = '<div class="wa-top"><div class="wa-back" onclick="waCloseUserEdit()">‹</div><div class="wa-title">编辑人设资料</div><div style="width:30px"></div></div>'
      + '<div class="wa-body">'
      + '<div style="display:flex;flex-direction:column;align-items:center;margin:4px 0 14px">'
      +   '<div id="ueAvaBox" style="width:64px;height:64px;border-radius:10px;overflow:hidden;background:#3a3a3c;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px"></div>'
      +   '<input type="file" id="ueAvatarInput" accept="image/*" style="display:none">'
      +   '<button class="wa-btn ghost" type="button" style="margin-top:8px" onclick="document.getElementById(\'ueAvatarInput\').click()">上传头像</button>'
      + '</div>'
      + '<div class="wa-field">'
      + '<label>微信名（微信主页显示）</label><input class="wa-input" id="ueWxName" value="' + f(u.wxName) + '">'
      + '<label>姓名（真实姓名）</label><input class="wa-input" id="ueName" value="' + f(u.name) + '">'
      + '<label>昵称（人设名）</label><input class="wa-input" id="uePersonaName" value="' + f(u.personaName) + '">'
      + '<label>微信号</label><input class="wa-input" id="ueWxId" value="' + f(u.wxId) + '">'
      + '<label>手机号（选填）</label><input class="wa-input" id="uePhone" value="' + f(u.phoneNumber) + '">'
      + '<label>人设简介 / 性格</label><textarea class="wa-input" id="ueBio" rows="3">' + f(u.persona) + '</textarea>'
      + '<label>人物关系</label><input class="wa-input" id="ueRelations" value="' + f(u.personaRelations) + '">'
      + '<label>外貌文字描述（生图用）</label><textarea class="wa-input" id="ueAppearance" rows="2">' + f(u.appearance) + '</textarea>'
      + '<label>生图画风描述</label><input class="wa-input" id="ueArtStyle" value="' + f(u.artStyle) + '">'
      + '<label>参考图（最多4张，生图/合照用）</label>'
      + '<div id="ueRefBox" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0"></div>'
      + '<input type="file" id="ueRefInput" accept="image/*" multiple style="display:none">'
      + '<button class="wa-btn ghost" type="button" onclick="document.getElementById(\'ueRefInput\').click()">添加参考图</button>'
      + '<div style="height:14px"></div>'
      + '<button class="wa-btn" onclick="waSaveUserEdit()">保存资料</button>'
      + '<button class="wa-btn ghost" type="button" style="margin-top:10px;color:#FF453A" onclick="waDeleteUser(\'' + u.id + '\')">注销该账号</button>'
      + '<div style="height:26px"></div></div></div>';
    var o = overlay('waUserEditOverlay', html);
    o.classList.add('show');
    o.style.zIndex = 720;
    _ueRenderAva(); _ueRenderRefs();
    var ai = document.getElementById('ueAvatarInput');
    if (ai) ai.onchange = function (e) { var fl = (e.target.files || [])[0]; _ueReadFile(fl, function (d) { _editAvatar = d; _ueRenderAva(); }); try { e.target.value = ''; } catch (_) {} };
    var ri = document.getElementById('ueRefInput');
    if (ri) ri.onchange = function (e) {
      Array.prototype.slice.call(e.target.files || []).forEach(function (fl) {
        if (_editRefs.length >= 4) { toast('最多4张参考图'); return; }
        _ueReadFile(fl, function (d) { if (_editRefs.length < 4) { _editRefs.push(d); _ueRenderRefs(); } });
      });
      try { e.target.value = ''; } catch (_) {}
    };
  };
  function _ueRenderAva() {
    var box = document.getElementById('ueAvaBox'); if (!box) return;
    box.innerHTML = _editAvatar ? '<img src="' + _editAvatar + '" style="width:100%;height:100%;object-fit:cover">' : '?';
  }
  window._ueRemoveRef = function (i) { _editRefs.splice(i, 1); _ueRenderRefs(); };
  function _ueRenderRefs() {
    var box = document.getElementById('ueRefBox'); if (!box) return;
    box.innerHTML = _editRefs.map(function (src, i) {
      return '<div style="position:relative;width:56px;height:56px;border-radius:8px;overflow:hidden"><img src="' + src + '" style="width:100%;height:100%;object-fit:cover"><div onclick="_ueRemoveRef(' + i + ')" style="position:absolute;top:1px;right:1px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:11px;line-height:16px;text-align:center;cursor:pointer">×</div></div>';
    }).join('');
  }
  window.waCloseUserEdit = function () { var o = document.getElementById('waUserEditOverlay'); if (o) o.remove(); _editAccId = null; };
  window.waSaveUserEdit = function () {
    var u = findUserAcc(_editAccId); if (!u) { waCloseUserEdit(); return; }
    function v(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
    u.wxName = v('ueWxName'); u.name = v('ueName'); u.personaName = v('uePersonaName');
    u.nickname = u.personaName; u.wxId = v('ueWxId'); u.phoneNumber = v('uePhone');
    u.persona = v('ueBio'); u.personaRelations = v('ueRelations');
    u.appearance = v('ueAppearance'); u.artStyle = v('ueArtStyle');
    u.avatar = _editAvatar || ''; u.refImages = _editRefs.slice();
    if (!u.wxName) u.wxName = u.name || '';
    // 若编辑的是当前运行时账号（已登录或默认主账号正装载），同步到 config.user，保证设置页/AI 立即用新值
    try {
      var c = C(), sn = session();
      var isCurrent = (sn && sn.kind === 'user' && sn.refId === u.id);
      var isMain = !(sn && sn.kind === 'user') && (function () { var w = (c.worlds || []).filter(function (x) { return (x.users || []).some(function (y) { return y.id === u.id; }); })[0]; return w && (w.isDefault || w.id === 'default') && w.users[0] === u; })();
      if (isCurrent || isMain) loadUserIntoRuntime(u);
    } catch (e) {}
    save(); waCloseUserEdit(); renderAuth(); toast('人设资料已保存');
  };

  /* ============================================================
   * 异常登录痕迹 + 错误缓冲（供微信助手问答）
   * ============================================================ */
  function logAbnormal(char, text) {
    if (!char) return;
    if (!Array.isArray(char.abnormalLogs)) char.abnormalLogs = [];
    char.abnormalLogs.push({ time: Date.now(), text: text });
    save();
  }
  WA.logAbnormal = logAbnormal;
  var _errBuf = [];
  function hookErrors() {
    window.addEventListener('error', function (e) { try { _errBuf.push(String((e && e.message) || e)); if (_errBuf.length > 12) _errBuf.shift(); } catch (x) {} });
    window.addEventListener('unhandledrejection', function (e) { try { _errBuf.push('Promise: ' + String(e.reason && e.reason.message ? e.reason.message : e.reason)); if (_errBuf.length > 12) _errBuf.shift(); } catch (x) {} });
  }

  /* ============================================================
   * 被发现风险
   * ============================================================ */
  var Risk = {
    decay: function (ch) {
      if (!ch.risk) ch.risk = { value: 0, totalMs: 0, actionCount: 0, lastTickAt: 0, lastEventAt: 0 };
      // 距上次活动越久，风险自然回落
      if (ch.risk.lastTickAt) {
        var offMin = (Date.now() - ch.risk.lastTickAt) / 60000;
        if (offMin > 1) ch.risk.value = Math.max(0, ch.risk.value - offMin * 1.2);
      }
      return ch.risk;
    },
    add: function (ch, n, reason) {
      var r = Risk.decay(ch);
      r.value = Math.min(100, r.value + n); r.actionCount++;
      if (reason) r.lastReason = reason;
      save();
      if (r.value >= 100) Risk.triggerEvent(ch, 'hard');
      else if (r.value >= 60 && (!r.lastEventAt || Date.now() - r.lastEventAt > 5 * 60000)) Risk.triggerEvent(ch, 'soft');
    },
    timer: null, current: null,
    start: function (ch) {
      Risk.stop(); Risk.current = ch; Risk.decay(ch); ch.risk.lastTickAt = Date.now();
      Risk.timer = setInterval(function () {
        if (!Risk.current) return; var r = Risk.current.risk; if (!r) return;
        var now = Date.now(); r.totalMs += now - (r.lastTickAt || now); r.lastTickAt = now;
        r.value = Math.min(100, r.value + 0.25); // 登录时长缓慢累积
        if (r.value >= 100) Risk.triggerEvent(Risk.current, 'hard');
      }, 5000);
    },
    stop: function () { if (Risk.timer) { clearInterval(Risk.timer); Risk.timer = null; } Risk.current = null; },
    triggerEvent: function (ch, level) {
      ch.risk.lastEventAt = Date.now();
      var c = C();
      var apiOk = c.api && c.api.baseUrl && c.api.model;
      var hint = level === 'hard'
        ? '用户正在偷偷登录你的微信、翻看并操作你的账号（可能看了聊天、删/拉黑联系人或发了消息），你刚刚有所察觉。'
        : '你隐约感觉自己的微信似乎被人动过（异地登录/消息位置不对），心生一丝怀疑。';
      var sys = '【系统：' + hint + '请严格依据你的人设、与用户的记忆、线上线下关系数据，用符合你性格的方式自然表现——hard 级别可以直接质问/对峙/情绪爆发，soft 级别只是试探、旁敲侧击。只输出你发给用户的微信消息正文，1-5条短句，不要解释系统设定。】';
      function pushFallback() {
        var txt = level === 'hard' ? '（你是不是动我微信了？我怎么感觉不太对。）' : '（我微信是不是在别的地方登过……？）';
        ch.chatHistory = ch.chatHistory || [];
        ch.chatHistory.push({ role: 'assistant', content: txt, time: Date.now(), isRiskEvent: true });
        save();
      }
      if (!apiOk || typeof callApi !== 'function') { pushFallback(); ch.risk.value = level === 'hard' ? 25 : 45; return; }
      var msgs = [];
      try {
        var persona = '你是' + ch.name + '。人设：' + (ch.persona || '').slice(0, 1200);
        // 设计要求：结合人设、长期记忆、线上线下关系数据综合反应
        var memTxt = '';
        try {
          var mems = Array.isArray(ch.memories) ? ch.memories : [];
          if (mems.length) memTxt = mems.slice(-12).map(function (m) { return typeof m === 'string' ? m : (m && (m.content || m.summary) || ''); }).filter(Boolean).join('\n').slice(0, 1200);
        } catch (e) {}
        var offTxt = '';
        try {
          var off = Array.isArray(ch.offlineChatHistory) ? ch.offlineChatHistory : [];
          if (off.length) offTxt = off.slice(-8).map(function (m) { return (m.role === 'user' ? '用户' : ch.name) + '：' + String(m.content || '').replace(/<[^>]+>/g, '').slice(0, 200); }).join('\n').slice(0, 1000);
        } catch (e) {}
        var sysBase = persona
          + (memTxt ? '\n【你的长期记忆】\n' + memTxt : '')
          + (offTxt ? '\n【你和用户的线下相处记录】\n' + offTxt : '');
        msgs.push({ role: 'system', content: sysBase });
        var recent = (ch.chatHistory || []).slice(-10).map(function (m) { return { role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '').replace(/<miyavoice>[\s\S]*?<\/miyavoice>/gi, '').slice(0, 300) }; });
        msgs = msgs.concat(recent);
        msgs.push({ role: 'user', content: sys });
      } catch (e) {}
      callApi(msgs, { temperature: 0.95, maxTokens: 600, timeout: 60000 }).then(function (reply) {
        var txt = String(reply || '').replace(/<[^>]+>/g, '').trim() || (level === 'hard' ? '你动我微信了？' : '我总觉得哪里不对……');
        ch.chatHistory = ch.chatHistory || [];
        ch.chatHistory.push({ role: 'assistant', content: txt, time: Date.now(), isRiskEvent: true });
        save();
        try { if (typeof _notifyWechatMessage === 'function') _notifyWechatMessage(txt); } catch (e) {}
      }).catch(function () { pushFallback(); });
      ch.risk.value = level === 'hard' ? 25 : 45; // 触发后回落，避免连环爆发
      save();
    }
  };
  WA.Risk = Risk;

  /* ============================================================
   * 微信助手（用户账号 & 角色账号通用；角色额外显示异常痕迹）
   * ============================================================ */
  var Assist = {
    target: null, // {kind:'user'|'char', ref}
    open: function (target) {
      injectCss(); Assist.target = target;
      var o = overlay('waAssist', ''); o.classList.add('show'); Assist.render();
    },
    msgs: function () {
      var t = Assist.target; if (!t) return [];
      if (t.kind === 'char') { t.ref.assistantChat = t.ref.assistantChat || []; return t.ref.assistantChat; }
      t.ref.assistantChat = t.ref.assistantChat || []; return t.ref.assistantChat;
    },
    render: function () {
      var o = document.getElementById('waAssist'); if (!o) return;
      var t = Assist.target; var list = Assist.msgs();
      var ab = t.kind === 'char' ? (t.ref.abnormalLogs || []) : [];
      var h = '<div class="wa-top"><div class="wa-back" onclick="WA.Assist.close()">‹</div><div class="wa-title">微信助手</div><div style="width:30px"></div></div><div class="wa-body" id="waAssistBody" style="background:#17181a">';
      h += '<div class="wa-line"><div class="wa-bubble l">你好，我是微信助手。遇到报错、功能不会用，都可以直接问我。' + (t.kind === 'char' ? '本账号的登录安全记录也可在此查看。' : '') + '</div></div>';
      if (t.kind === 'char' && ab.length) {
        h += '<div class="wa-moments" style="border:1px solid rgba(255,159,10,.3)"><div style="color:#ffb85c;font-size:13px;font-weight:600;margin-bottom:6px">登录安全记录</div>';
        ab.slice(-8).forEach(function (l) { var d = new Date(l.time); h += '<div style="font-size:12px;color:#ccc;margin:4px 0">' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' · ' + esc(l.text) + '</div>'; });
        h += '</div>';
      }
      list.forEach(function (m) {
        h += '<div class="wa-line">' + (m.from === 'me' ? '<div class="wa-bubble r">' + esc(m.content) + '</div>' : '<div class="wa-bubble l">' + esc(m.content) + '</div>') + '</div>';
      });
      h += '</div><div style="flex-shrink:0;display:flex;gap:8px;padding:10px;background:#1c1c1e;border-top:.5px solid rgba(255,255,255,.08)">'
        + '<input id="waAssistInput" class="wa-input" style="margin:0;flex:1" placeholder="描述你遇到的问题…" onkeydown="if(event.key===\'Enter\')WA.Assist.send()">'
        + '<button class="wa-btn" style="width:auto;margin:0;padding:10px 16px" onclick="WA.Assist.send()">发送</button></div>';
      o.innerHTML = h;
      var b = document.getElementById('waAssistBody'); if (b) b.scrollTop = b.scrollHeight;
    },
    close: function () { var o = document.getElementById('waAssist'); if (o) o.classList.remove('show'); },
    send: function () {
      var inp = document.getElementById('waAssistInput'); var q = inp ? inp.value.trim() : ''; if (!q) return;
      var list = Assist.msgs(); list.push({ from: 'me', content: q, time: Date.now() }); Assist.render();
      var c = C();
      if (!c.api || !c.api.baseUrl || !c.api.model) {
        list.push({ from: 'them', content: '还没有配置聊天 API，我只能给通用建议：请先到「设置-API配置」填写接口地址、Key 和模型。', time: Date.now() }); Assist.render(); return;
      }
      var sys = '你是这款“仿真手机互动网页”的内置微信助手，帮助用户排查使用问题。请用简洁中文给出可操作的解决步骤。';
      var ctx = [];
      if (_errBuf.length) ctx.push('近期页面报错（可能相关，新到旧）：\n' + _errBuf.slice(-6).map(function (e, i) { return (i + 1) + '. ' + e; }).join('\n'));
      var t = Assist.target;
      if (t.kind === 'char') ctx.push('当前正在查看角色「' + t.ref.name + '」的微信。');
      ctx.push('用户问题：' + q);
      callApi([{ role: 'system', content: sys }, { role: 'user', content: ctx.join('\n\n') }], { temperature: 0.4, maxTokens: 700, timeout: 60000 })
        .then(function (a) { list.push({ from: 'them', content: String(a || '我暂时无法回答，请换个说法。'), time: Date.now() }); save(); Assist.render(); })
        .catch(function (e) { list.push({ from: 'them', content: '回答失败：' + (e.message || e) + '。可重试或检查网络/API。', time: Date.now() }); Assist.render(); });
    }
  };
  WA.Assist = Assist;
  window.waOpenAssistUser = function () { Assist.open({ kind: 'user', ref: (function () { var sn = session(); return sn && sn.kind === 'user' ? findUserAcc(sn.refId) : (C().user || {}); })() }); };

  /* ============================================================
   * V2 统一身份层：角色账号也进入【同一套主微信】（不再另做简化界面）
   * 设计：
   *  - 用户账号 u:<accId> 与 角色账号 c:<charId> 都是可登录身份；
   *  - 一条对话 = 世界内两个身份之间的【共享消息线】，谁登录就以谁为“我”，
   *    消息按 senderKey 就地翻转左右，双方登录看同一份，真正形成微型社会；
   *  - 用户↔角色：复用该用户账号的 chats[charId]（双方看同一份）；
   *  - 角色↔角色：存世界层 config._charThreads[worldId][pairKey]。
   * ============================================================ */
  var Ident = { peerKey: null, peerSubject: null, mirrors: [] };

  function identKey(kind, id) { return (kind === 'char' ? 'c:' : 'u:') + String(id); }
  function isCharSession() { var sn = session(); return !!(sn && sn.kind === 'char' && sn.refId); }
  WA.isCharSession = isCharSession; window.waIsCharSession = isCharSession;
  function sessionChar() {
    var sn = session(); if (!sn || sn.kind !== 'char') return null;
    return (C().characters || []).filter(function (x) { return !x._waMirror && !x._waLife && String(x.id) === String(sn.refId); })[0] || null;
  }
  function meSubject() {
    var sn = session(); if (!sn || !sn.kind) return null;
    return sn.kind === 'char' ? sessionChar() : findUserAcc(sn.refId);
  }
  function meKey() { var sn = session(); return sn && sn.kind ? identKey(sn.kind, sn.refId) : null; }
  WA.meKey = meKey; window.waMeKey = meKey;
  WA.sessionChar = sessionChar; window.waSessionChar = sessionChar;

  /* ===== 角色代演群：登录角色进“自己也在里面”的群，操作者从用户账号换成该角色 ===== */
  // 登录角色在运行时 characters 数组里的稳定下标（镜像只追加在末尾，真实角色下标不变）
  function sessionCharIdx() {
    var ch = sessionChar(); if (!ch) return -1;
    return (C().characters || []).indexOf(ch);
  }
  // 登录角色是否为某群成员（优先按 memberId，兼容仅存 name 的老群）
  function charInGroup(gc) {
    var ch = sessionChar(); if (!ch || !gc || !Array.isArray(gc.members)) return false;
    var idx = sessionCharIdx();
    var myId = 'char_' + idx;
    for (var i = 0; i < gc.members.length; i++) {
      var m = gc.members[i]; if (!m) continue;
      if (m.memberId === myId) return true;
      if ((m.charId !== undefined && String(m.charId) === String(ch.id))) return true;
      if (!m.memberId && m.name && m.name === ch.name) return true; // 老群兜底
    }
    return false;
  }
  // 当前群的“操作者”：角色态且我在群里→返回登录角色描述；否则 null（=普通用户账号操作，走原逻辑）
  function charGroupActor(gc) {
    if (!isCharSession()) return null;
    var ch = sessionChar(); if (!ch || !gc || !Array.isArray(gc.members)) return null;
    var idx = sessionCharIdx(), runtimeId = 'char_' + idx, mine = null, i, mm;
    // 关键：必须用“建群时固化在群成员里的身份”匹配，而不是直接拿运行时下标现拼 memberId——
    // 镜像角色追加/角色增删会让运行时下标漂移，现拼会把别人的消息错判成“我”发的（全翻右侧）
    for (i = 0; i < gc.members.length; i++) { mm = gc.members[i]; if (mm && mm.charId !== undefined && String(mm.charId) === String(ch.id)) { mine = mm; break; } }
    if (!mine) for (i = 0; i < gc.members.length; i++) { mm = gc.members[i]; if (mm && typeof mm.charIdx === 'number' && mm.charIdx === idx) { mine = mm; break; } }
    if (!mine) for (i = 0; i < gc.members.length; i++) { mm = gc.members[i]; if (mm && mm.memberId === runtimeId) { mine = mm; break; } }
    if (!mine) for (i = 0; i < gc.members.length; i++) { mm = gc.members[i]; if (mm && !mm.memberId && mm.name === ch.name) { mine = mm; break; } }
    if (!mine) return null; // 我不在这个群
    return { memberId: mine.memberId || runtimeId, charIdx: idx, charId: ch.id, name: ch.name, char: ch };
  }
  // 角色态会话列表用：返回登录角色所在、且属于当前世界的群（gIdx 指向 config.groupChats）
  function charGroupList() {
    var out = []; if (!isCharSession()) return out;
    var c = C(), groups = (c && c.groupChats) || [], wid = activeWorldId();
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i]; if (!g || g.deleted) continue;
      if ((g.worldId || 'default') !== wid) continue;
      if (charInGroup(g)) out.push({ gIdx: i, gc: g });
    }
    return out;
  }
  WA.sessionCharIdx = sessionCharIdx; window.waSessionCharIdx = sessionCharIdx;
  WA.charInGroup = charInGroup; window.waCharInGroup = charInGroup;
  WA.charGroupActor = charGroupActor; window.waCharGroupActor = charGroupActor;
  /* 用户账号视角：当前登录的人设账号在该群里的稳定身份（与 charGroupActor 对称）。
     群按 waOwnerId 归属；归属当前账号（或无主老群）时，操作者本人=该用户，memberId 用不随下标漂移的 'user:'+账号id */
  function userGroupActor(gc) {
    var a = currentAccount(); if (!a || !gc) return null;
    var mine = !gc.waOwnerId || String(gc.waOwnerId) === String(a.id);
    if (!mine) { // 无 owner 的老群对当前世界账号可见；owner 悬空也视为本人可操作
      var alive = false; try { var ow = gc.waOwnerId && findUserAcc(gc.waOwnerId); alive = !!ow; } catch (e) {}
      if (alive) return null;
    }
    return { memberId: 'user:' + a.id, userId: a.id, name: accDisplayNameOf(a), avatar: a.avatar || '', isUser: true };
  }
  /* 角色视角：群里的“用户（建群/归属的人设账号）”是谁，用于把用户发的消息正确显示成左侧带头衔的对方 */
  function groupOwnerActor(gc) {
    if (!gc) return null;
    var a = gc.waOwnerId ? findUserAcc(gc.waOwnerId) : null;
    if (!a) { var wid = gc.worldId || activeWorldId(); var w = worlds().filter(function (x) { return (x.id || 'default') === (wid || 'default'); })[0]; a = w && Array.isArray(w.users) ? w.users[0] : null; }
    if (!a) return null;
    return { memberId: 'user:' + a.id, userId: a.id, name: accDisplayNameOf(a), avatar: a.avatar || '', isUser: true };
  }
  /* 当前视角（登录角色 or 登录用户）在群里的“我是谁”——左右归属唯一权威 */
  function currentGroupActor(gc) { return isCharSession() ? charGroupActor(gc) : userGroupActor(gc); }
  WA.userGroupActor = userGroupActor; window.waUserGroupActor = userGroupActor;
  WA.groupOwnerActor = groupOwnerActor; window.waGroupOwnerActor = groupOwnerActor;
  WA.currentGroupActor = currentGroupActor; window.waCurrentGroupActor = currentGroupActor;
  window.waUserNameById = function (uid) { var u = findUserAcc(uid); return u ? accDisplayNameOf(u) : ''; };
  WA.charGroupList = charGroupList; window.waCharGroupList = charGroupList;

  /* 角色作为“我”时，给内核一个稳定的 config.user 视图（缓存保证钱包等引用稳定） */
  function charSelfView(ch) {
    if (!ch) return null;
    if (!ch._selfView) {
      ch._selfView = {
        _src: ch.id, _waAccountId: 'char:' + ch.id, kind: 'char',
        name: ch.name, personaName: ch.name, nickname: ch.nickname || '',
        wxName: ch.name, wxId: ch.wxId || '', avatar: ch.avatar || '', avatarBg: ch.avatarBg || '#576B95',
        persona: ch.persona || '', personaRelations: ch.personaRelations || '', appearance: ch.appearance || '',
        artStyle: ch.artStyle || '', refImages: ch.refImages || [], phoneNumber: '',
        wallet: (typeof ch.wallet === 'number' ? ch.wallet : 0), walletHistory: ch.walletHistory || [],
        createdAt: ch.createdAt || Date.now()
      };
    }
    var sv = ch._selfView;
    sv.name = ch.name; sv.personaName = ch.name; sv.nickname = ch.nickname || sv.nickname;
    sv.wxName = ch.name; sv.wxId = ch.wxId || ''; sv.avatar = ch.avatar || ''; sv.avatarBg = ch.avatarBg || '#576B95';
    sv.persona = ch.persona || ''; sv.personaRelations = ch.personaRelations || ''; sv.appearance = ch.appearance || '';
    sv.artStyle = ch.artStyle || '';
    if (typeof ch.wallet === 'number') sv.wallet = ch.wallet;
    return sv;
  }

  /* 清掉运行时注入的“用户账号镜像角色”（不持久化、仅角色登录期间存在） */
  function clearMirrors() {
    var c = C(); if (!c || !Array.isArray(c.characters)) { Ident.mirrors = []; return; }
    c.characters = c.characters.filter(function (x) { return !x._waMirror && !x._waLife; });
    Ident.mirrors = [];
  }

  /* 世界层 角色↔角色 对话存储（按世界隔离） */
  function charThreadStore(wid) {
    var c = C(); wid = wid || 'default';
    if (!c._charThreads) c._charThreads = {};
    if (!c._charThreads[wid]) c._charThreads[wid] = {};
    return c._charThreads[wid];
  }
  function pairKey(k1, k2) { return [String(k1), String(k2)].sort().join('~'); }

  /* 把一条共享消息线按“当前我是谁”就地定向：补 senderKey、翻转 role 左右 */
  function orientThread(arr, meK, peerK, legacyUserIsPeer) {
    if (!Array.isArray(arr)) return;
    // legacyUserIsPeer=true：无 senderKey 老消息的 role 是站在【主控用户视角】写的
    // （role=user 是主控发的、role=assistant/other 是角色发的）。角色登录回看与主控的同一条线时，
    // 必须按这个原始视角补章，否则主控说的话会被错盖成当前角色、全部翻到右边。
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i]; if (!m) continue;
      if (m.role === 'system') continue;
      if (!m.senderKey) {
        if (m.role === 'user') m.senderKey = legacyUserIsPeer ? peerK : meK;
        else if (m.role === 'assistant' || m.role === 'other') m.senderKey = legacyUserIsPeer ? meK : peerK;
      }
      if (m.senderKey) m.role = (m.senderKey === meK) ? 'user' : 'assistant';
    }
  }
  WA.orientThread = orientThread; window.waOrientThread = orientThread;

  /* 角色登录：把“我”切换为该角色，进入同一套主微信（view-wechat），不再开独立界面 */
  function mountCharRuntime(ch, c) {
    c.memories = Array.isArray(ch.memories) ? ch.memories : (ch.memories = []);
    if (!Array.isArray(ch.friendRequests)) ch.friendRequests = [];
    c.friendRequests = ch.friendRequests;
    c.friendRequestsSeen = ch.friendRequestsSeen || 0;
    c.moments = worldMomentsView(ch.worldId || 'default');
    c.momentsCover = ch.momentsCover || '';
  }
  function loginChar(ch, pwd) {
    var c = C(); if (!ch) return false;
    try { migrateDressupToGlobal(); } catch (emd) {}
    if (ch.wxPassword && pwd !== ch.wxPassword) return { error: 'pwd' };
    try { syncRuntimeToAccount(); } catch (e) {}
    try { if (currentAccount()) unmountAccount(); } catch (e) {}
    clearMirrors();
    c.waSession = { worldId: ch.worldId || activeWorldId(), kind: 'char', refId: ch.id };
    c.user = charSelfView(ch);
    mountCharRuntime(ch, c);
    // 角色视角：同世界其他角色默认都是其联系人（不写 deletedFromWechat，避免污染用户视角，改用运行时列表）
    try { logAbnormal(ch, '账号在你的设备上登录'); } catch (e) {}
    try { Risk.decay(ch); } catch (e) {}
    Ident.peerKey = null; Ident.peerSubject = null;
    save(); closeAuth();
    // 首次登录自动生成生活圈（异步、不阻塞、失败可手动刷新）；启动背景联系人主动消息节奏；生成同世界微型社会
    try { lifeStartProactive(); setTimeout(function () { try { lifeGenerate(ch); } catch (e) {} }, 1200); setTimeout(function () { try { ensureSociety(ch.worldId || activeWorldId()); } catch (e) {} }, 2600); } catch (e) {}
    if (typeof openApp === 'function') openApp('wechat');
    return true;
  }
  WA.loginChar = loginChar; window.waLoginChar = loginChar;

  /* 角色登录时的联系人列表：同世界其他角色 + 同世界全部用户人设账号 */
  function charPeerList(ch) {
    var c = C(), wid = ch.worldId || 'default', out = [];
    function dropped(k) { var r = ch.peerRels && ch.peerRels[k]; return !!(r && (r.removed || r.blocked)); }
    function remark(k) { var r = ch.peerRels && ch.peerRels[k]; return (r && r.remark) ? r.remark : ''; } // 我给对方的备注
    (c.characters || []).forEach(function (x) {
      if (x._waMirror || x._waLife || x === ch) return;
      if ((x.worldId || 'default') !== wid) return;
      var ck = identKey('char', x.id);
      if (dropped(ck)) return; // 该角色已被登录角色删除/拉黑
      var pk = pairKey(identKey('char', ch.id), ck);
      var store = charThreadStore(wid);
      var last = (Array.isArray(store[pk]) && store[pk].length) ? store[pk][store[pk].length - 1] : null;
      out.push({
        key: ck, kind: 'char', ref: x.id,
        name: remark(ck) || x.nickname || x.name, wxName: x.nickname || '', trueName: x.name,
        avatar: x.avatar, avatarBg: x.avatarBg || '#576B95',
        persona: x.persona || '', pin: !!x.pin, lastMsg: last, time: last ? last.time : 0
      });
    });
    var w = worlds().filter(function (y) { return (y.id || 'default') === wid; })[0];
    (w && w.users || []).forEach(function (u) {
      var uk = identKey('user', u.id);
      if (dropped(uk)) return;
      var t = (u.chats || {})[String(ch.id)];
      var last = (Array.isArray(t) && t.length) ? t[t.length - 1] : null;
      out.push({
        key: uk, kind: 'user', ref: u.id, otherCharId: ch.id,
        name: remark(uk) || u.wxName || u.personaName || u.name, wxName: u.wxName || '', trueName: u.personaName || u.name,
        avatar: u.avatar, avatarBg: u.avatarBg || '#07C160',
        persona: u.persona || '', pin: false, lastMsg: last, time: last ? last.time : 0
      });
    });
    return out;
  }
  WA.charPeerList = charPeerList; window.waCharPeerList = function () { var ch = sessionChar(); return ch ? charPeerList(ch) : []; };
  // 角色给某个联系人设备注名（备注 > 对方微信网名 > 真名），留空清除
  window.waSetPeerRemark = function (key, remark) {
    var ch = sessionChar(); if (!ch || !key) return;
    if (!ch.peerRels) ch.peerRels = {};
    if (!ch.peerRels[key]) ch.peerRels[key] = {};
    ch.peerRels[key].remark = (remark || '').trim();
    save();
  };
  /* 角色账号删除/拉黑某个联系人（只记在登录角色自己身上，不影响用户账号视角） */
  /* 角色通过别人的好友申请：按名字找到同世界的角色/用户，解除“我（角色）”曾对其删除/拉黑的关系标记 */
  function charAcceptByName(name) {
    var ch = sessionChar(); if (!ch || !name) return;
    if (!ch.peerRels) ch.peerRels = {};
    var wid = ch.worldId || activeWorldId(), meK = identKey('char', ch.id), keys = [];
    (C().characters || []).forEach(function (x) {
      if (x._waMirror || x._waLife) return;
      if (String(x.id) !== String(ch.id) && x.name === name) keys.push(identKey('char', x.id));
    });
    var w = worlds().filter(function (x) { return String(x.id || 'default') === String(wid || 'default'); })[0];
    (w && w.users || []).forEach(function (u) {
      if (u.name === name || u.wxName === name || u.personaName === name) keys.push(identKey('user', u.id));
    });
    keys.forEach(function (pk) {
      var rk = pairKey(meK, pk), r = ch.peerRels[rk];
      if (r) { delete r.removed; delete r.blocked; r.at = Date.now(); if (!Object.keys(r).length) delete ch.peerRels[rk]; }
    });
    save();
  }
  window.waCharAcceptRequest = charAcceptByName;
  function charDropPeer(key, blocked) {
    var ch = sessionChar(); if (!ch || !key) return;
    if (!ch.peerRels) ch.peerRels = {};
    ch.peerRels[key] = blocked ? { blocked: true, at: Date.now() } : { removed: true, at: Date.now() };
    // 关系变动写入时间线，供常规记忆总结
    try {
      var _dn = '', _pp = String(key).split(':'), _rid = _pp.slice(1).join(':');
      if (_pp[0] === 'c') { var _dx = (C().characters || []).filter(function (x) { return !x._waMirror && String(x.id) === _rid; })[0]; _dn = _dx ? _dx.name : ''; }
      else { var _du = findUserAcc(_rid); _dn = _du ? (_du.personaName || _du.name) : ''; }
      if (typeof window.logRelationEvent === 'function' && _dn) window.logRelationEvent(blocked ? ('我拉黑了「' + _dn + '」') : ('我删除了联系人「' + _dn + '」'), _dn);
    } catch (e) {}
    try { riskAction(10); } catch (e) {}
    save();
    setTimeout(function () { try { if (typeof window.autoExtractMemories === 'function') window.autoExtractMemories(); } catch (e) {} }, 1500);
  }
  WA.charDropPeer = charDropPeer; window.waCharDropPeer = charDropPeer;
  /* 角色账号“刷新联系人”：恢复被删除/拉黑的 peer（重新建立联系） */
  window.waCharRefreshPeers = function () { var ch = sessionChar(); if (ch) { ch.peerRels = {}; save(); if (typeof renderChatList === 'function') renderChatList(); if (typeof renderContacts === 'function') renderContacts(); toast('已刷新联系人'); } };

  /* 角色态：打开与某个 peer 的共享对话，返回对方 subject（已注入为内核可识别的“角色”对象） */
  function prepareCharPeer(key) {
    var c = C(), me = sessionChar(); if (!me) return null;
    var pp = String(key).split(':'), kind = pp[0], ref = pp.slice(1).join(':');
    var subject, thread;
    var meK = identKey('char', me.id);
    if (kind === 'c') {
      subject = (c.characters || []).filter(function (x) { return !x._waMirror && !x._waLife && String(x.id) === String(ref); })[0];
      if (!subject) return null;
      var store = charThreadStore(me.worldId || 'default');
      var pk = pairKey(meK, identKey('char', subject.id));
      if (!Array.isArray(store[pk])) store[pk] = [];
      thread = store[pk];
    } else {
      var u = findUserAcc(ref); if (!u) return null;
      if (!u.chats || typeof u.chats !== 'object') u.chats = {};
      var cid = String(me.id);
      if (!Array.isArray(u.chats[cid])) u.chats[cid] = [];
      thread = u.chats[cid]; // 与该用户账号登录时和本角色聊的是同一份
      subject = (c.characters || []).filter(function (x) { return x._waMirror && x._mirrorOf === u.id; })[0];
      if (!subject) {
        subject = {
          _waMirror: true, _mirrorOf: u.id, id: 'mirror_' + u.id,
          name: u.personaName || u.name || '对方', nickname: u.personaName || '',
          avatar: u.avatar || '', avatarBg: u.avatarBg || '#07C160',
          persona: u.persona || '', personaRelations: u.personaRelations || '', appearance: u.appearance || '',
          gender: u.gender || 'other', worldId: me.worldId, memories: (u.memories || []), people: {},
          _mirrorKind: 'user', wxId: u.wxId || '', artStyle: u.artStyle || '', refImages: u.refImages || [],
          voiceEnabled: true, stickerEnabled: true
        };
        c.characters.push(subject); Ident.mirrors.push(subject);
      }
    }
    subject.chatHistory = thread;
    // kind==='u'：角色回看与主控用户的同一条线，其无 senderKey 老消息的 role 是主控视角，需反转补章
    orientThread(thread, meK, key, kind === 'u');
    // 线下时间线同样“同一份、按视角定向”：与用户账号的线下共用 acc.offlineChats[角色id]；角色间用独立配对桶
    var offThread;
    if (kind === 'u') {
      if (!u.offlineChats || typeof u.offlineChats !== 'object') u.offlineChats = {};
      var ocid = String(me.id);
      if (!Array.isArray(u.offlineChats[ocid])) u.offlineChats[ocid] = [];
      offThread = u.offlineChats[ocid];
    } else {
      if (!c._charOffline) c._charOffline = {};
      var owid = me.worldId || 'default';
      if (!c._charOffline[owid]) c._charOffline[owid] = {};
      var opk = pairKey(meK, identKey('char', subject.id));
      if (!Array.isArray(c._charOffline[owid][opk])) c._charOffline[owid][opk] = [];
      offThread = c._charOffline[owid][opk];
    }
    subject.offlineChatHistory = offThread;
    orientThread(offThread, meK, key, kind === 'u');
    Ident.peerKey = key; Ident.peerSubject = subject;
    return { subject: subject, thread: thread };
  }
  WA.prepareCharPeer = prepareCharPeer;
  window.waOpenPeer = function (key) {
    var r = prepareCharPeer(key); if (!r) return;
    if (typeof window.__waEnterSubject === 'function') window.__waEnterSubject(r.subject);
    save();
  };
  // 角色态进入与某 peer 的线下时间线：先挂好共享线下线，再交给内核 openOfflineChat
  window.waOpenPeerOffline = function (key) {
    var r = prepareCharPeer(key); if (!r) return;
    var idx = C().characters.indexOf(r.subject);
    save();
    if (typeof window.openOfflineChat === 'function' && idx >= 0) window.openOfflineChat(idx);
  };

  /* 用户态：openChat 打开角色时设置当前 peerKey，并把该共享线按用户视角定向 */
  function prepareUserPeer(ch) {
    var acc = currentAccount(); if (!acc || !ch) return;
    if (!acc.chats || typeof acc.chats !== 'object') acc.chats = {};
    var cid = String(ch.id);
    // 隔离硬约束：当前账号没有这条线时，必须新建独立空数组，绝不能继承 ch.chatHistory
    // （它可能还挂着上一个账号的聊天引用，否则会把别人的记录串给本账号）
    if (!Array.isArray(acc.chats[cid])) acc.chats[cid] = [];
    ch.chatHistory = acc.chats[cid];
    orientThread(ch.chatHistory, identKey('user', acc.id), identKey('char', ch.id));
    Ident.peerKey = identKey('char', ch.id); Ident.peerSubject = ch;
  }
  WA.prepareUserPeer = prepareUserPeer; window.waPrepareUserPeer = prepareUserPeer;
  window.waSetPeerKey = function (k) { Ident.peerKey = k; };
  window.waPrivateSelfKey = function () { var sn = session(); return (sn && sn.kind) ? identKey(sn.kind, sn.refId) : null; };
  window.waPrivatePeerKey = function () { return Ident.peerKey || null; };
  window.waActivePeerKey = function () { return Ident.peerKey; };

  /* 幂等盖章：渲染/持久化前，给当前对话补 senderKey 并按当前身份校正左右 */
  function stampActive() {
    try {
      var c = C(), sn = c.waSession; if (!sn || !sn.kind) return;
      var arr = c.chatHistory; if (!Array.isArray(arr)) return;
      var meK = identKey(sn.kind, sn.refId), pk = Ident.peerKey;
      // 对端未知（启动挂载、后台落盘、群聊等并未真正打开某个单聊的时机）：绝不臆测归属，直接返回。
      if (!pk) return;
      // 注意：进入会话时 orientThread 已把“进场前就存在的无 key 老消息”一次性补好 senderKey。
      // 因此这里遇到的无 key 消息必然是本次会话进行中刚产生的新消息，必须按【当前视角正常归属】：
      // 我发的(user)→meK，对方回的(assistant/other)→pk。绝不能再做“老消息反转”，否则角色本人刚发的
      // user 消息会被抢先错盖成对方(用户账号)，且事后 waStampOutgoing 因已有 key 跳过 → 角色说的话被记成用户说的。
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i]; if (!m || m.role === 'system') continue;
        if (!m.senderKey) {
          if (m.role === 'user') m.senderKey = meK;
          else if (m.role === 'assistant' || m.role === 'other') m.senderKey = pk;
        }
        if (m.senderKey) m.role = (m.senderKey === meK) ? 'user' : 'assistant';
      }
    } catch (e) {}
  }
  WA.stampActive = stampActive; window.waStampActive = stampActive;

  /* 一条“我发出 / 对方回复”的消息落共享线时补 senderKey（发送出口调用，双保险） */
  window.waStampOutgoing = function () { try { var c = C(), sn = c.waSession; if (!sn || !sn.kind) return; var a = c.chatHistory; if (Array.isArray(a) && a.length) { var last = a[a.length - 1]; if (last && last.role === 'user' && !last.senderKey) last.senderKey = identKey(sn.kind, sn.refId); } } catch (e) {} };
  window.waStampIncoming = function () { try { var c = C(); if (Array.isArray(c.chatHistory) && c.chatHistory.length && Ident.peerKey) { var last = c.chatHistory[c.chatHistory.length - 1]; if (last && last.role === 'assistant' && !last.senderKey) last.senderKey = Ident.peerKey; } } catch (e) {} };

  /* ===== 世界共享朋友圈：聚合当前世界全部用户账号 + 同世界角色的动态 ===== */
  function worldMomentsView(wid) {
    var c = C(), out = [];
    wid = wid || 'default';
    worlds().forEach(function (w) {
      if ((w.id || 'default') !== wid) return;
      (w.users || []).forEach(function (u) {
        (u.moments || []).forEach(function (m) { out.push(Object.assign({}, m, { authorKey: identKey('user', u.id), _authorKind: 'user' })); });
      });
    });
    (c.characters || []).forEach(function (ch) {
      if (ch._waMirror || ch._waLife || (ch.worldId || 'default') !== wid) return;
      (ch.moments || []).forEach(function (m) { out.push(Object.assign({}, m, { authorKey: identKey('char', ch.id), _authorKind: 'char' })); });
    });
    // 角色登录时，把其生活圈背景联系人发的朋友圈并入 TA 看到的朋友圈流（仅该角色视角）
    try {
      var _snL = session();
      if (_snL && _snL.kind === 'char') {
        var _meL = sessionChar();
        if (_meL && _meL.lifeCircle && Array.isArray(_meL.lifeCircle.moments)) {
          _meL.lifeCircle.moments.forEach(function (m) { if (m) out.push(Object.assign({}, m, { authorKey: 'life:' + (m.authorName || ''), _authorKind: 'life' })); });
        }
      }
    } catch (el) {}
    // 确定性去重：同一条动态无论从几个源桶（用户/角色/生活圈）汇入，只显示一次。
    // 指纹用 作者+正文+时间（跨源副本是 Object.assign 复制，time 完全一致）；再对同作者同正文做一次近邻去重，兜住时间差极小的副本
    var _seen = {}, _seenTxt = {};
    out = out.filter(function (m) {
      if (!m) return false;
      var k = (m.authorKey || ('@' + (m.authorName || ''))) + '§' + (m.text || '') + '§' + (m.time || 0);
      if (_seen[k]) return false;
      var kt = (m.authorName || '') + '§' + (m.text || '');
      if (_seenTxt[kt]) return false; // 同一作者发的同文案，只保留时间最新的一条
      _seen[k] = 1; _seenTxt[kt] = 1; return true;
    });
    out.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    return out;
  }
  WA.worldMomentsView = worldMomentsView;
  window.waWorldMoments = function () { var sn = session(); var wid = (sn && sn.worldId) || activeWorldId(); return worldMomentsView(wid); };
  /* 发布一条朋友圈到“当前身份”的源桶（用户→acc.moments；角色→ch.moments），返回落库后的消息对象 */
  function publishMomentAsMe(moment) {
    var sn = session(); if (!sn || !sn.kind) return null;
    if (sn.kind === 'char') { var ch = sessionChar(); if (!ch) return null; if (!Array.isArray(ch.moments)) ch.moments = []; moment.authorType = 'char'; moment.authorKey = identKey('char', ch.id); moment.authorName = ch.name; ch.moments.unshift(moment); }
    else { var acc = findUserAcc(sn.refId); if (!acc) return null; if (!Array.isArray(acc.moments)) acc.moments = []; moment.authorKey = identKey('user', acc.id); moment.authorName = acc.wxName || acc.personaName || acc.name; acc.moments.unshift(moment); }
    save(); return moment;
  }
  WA.publishMomentAsMe = publishMomentAsMe; window.waPublishMomentAsMe = publishMomentAsMe;

  /* ===== 角色身份的“被发现风险”（轻量、真实接入共享线，不再是孤立数值） ===== */
  function riskOf(ch) { if (!ch.risk) ch.risk = { value: 0, totalMs: 0, actionCount: 0, lastTickAt: 0, lastEventAt: 0 }; return ch.risk; }
  function riskAction(weight) {
    var ch = sessionChar(); if (!ch) return;
    var r = riskOf(ch); r.value = Math.min(100, r.value + (weight || 6)); r.actionCount++; r.lastEventAt = Date.now();
    if (r.value >= 70) riskBreak(ch);
    save();
  }
  WA.riskAction = riskAction; window.waRiskAction = riskAction;
  window.waRiskLevel = function () { var ch = sessionChar(); return ch ? riskOf(ch).value : 0; };
  function riskBreak(ch) {
    var r = riskOf(ch); if (r._fired && Date.now() - r._fired < 5 * 60 * 1000) return; r._fired = Date.now();
    // 找与该角色关系最深的创建者账号，把“质问/察觉”写进同一条共享对话（双方登录都看得到）
    var owner = findUserAcc(ch.ownerAccountId);
    var ownerAcc = owner || (function () { var w = worlds().filter(function (x) { return (x.id || 'default') === (ch.worldId || 'default'); })[0]; return w && w.users && w.users[0]; })();
    var line = null;
    if (ownerAcc) { if (!ownerAcc.chats) ownerAcc.chats = {}; line = ownerAcc.chats[String(ch.id)] || (ownerAcc.chats[String(ch.id)] = []); }
    var txt = '（TA似乎察觉到自己的微信被人动过，语气里带着怀疑）……等下，我微信是不是你登的？';
    var msg = { role: 'assistant', content: txt, time: Date.now(), isRiskEvent: true, senderKey: identKey('char', ch.id) };
    if (line) line.push(msg);
    r.value = 35;
    try { if (typeof showToast === 'function') showToast('⚠ 操作太多，TA开始起疑了'); } catch (e) {}
  }

  /* 角色态 AI 的“操作者身份锁定”：记忆/人物簿仍由 app-02 既有体系注入，这里只明确谁在操作、你扮演谁 */
  window.waIdentityContext = function () {
    try {
      var sn = session(); if (!sn || sn.kind !== 'char') return '';
      var me = sessionChar(); if (!me) return '';
      var peer = Ident.peerSubject;
      var pn = peer ? (peer.name || '对方') : '对方';
      return '=== 当前登录身份（最高优先级，务必遵守）===\n'
        + '这部手机此刻登录的是角色「' + me.name + '」的微信账号：对话里 role=user 的消息全部由「' + me.name + '」发出。'
        + '而你要扮演的，是正在和「' + me.name + '」聊天的对方「' + pn + '」。请始终以「' + pn + '」的第一人称、按其本人人设与记忆回复；'
        + '绝不要替「' + me.name + '」说话、行动或描写其心理；也绝不能让「' + pn + '」表现出“知道自己的微信账号正被别人登录或操控”，要像真人正常用微信一样自然。';
    } catch (e) { return ''; }
  };

  /* 退出/切换身份时清理角色运行时态 */
  function leaveCharIdentity() { clearMirrors(); Ident.peerKey = null; Ident.peerSubject = null; try { Risk.stop && Risk.stop(); } catch (e) {} try { if (Life && Life.proactiveTimer) { clearInterval(Life.proactiveTimer); Life.proactiveTimer = null; } } catch (e) {} var _o = document.getElementById('waLifeOverlay'); if (_o) _o.style.display = 'none'; }
  WA.leaveCharIdentity = leaveCharIdentity;

  /* 刷新/重进微信时，按当前会话把运行时（config.user / 记忆桶 / 朋友圈 / 挂载）恢复到正确身份 */
  function resumeRuntime() {
    var sn = session(); if (!sn || !sn.kind) return;
    var c = C();
    if (sn.kind === 'char') {
      var ch = sessionChar(); if (!ch) return;
      clearMirrors();
      c.user = charSelfView(ch);
      mountCharRuntime(ch, c);
      try { lifeStartProactive(); setTimeout(function () { try { lifeGenerate(ch); } catch (e) {} }, 1200); setTimeout(function () { try { ensureSociety(ch.worldId || activeWorldId()); } catch (e) {} }, 2600); } catch (e) {}
    } else {
      var acc = findUserAcc(sn.refId); if (!acc) return;
      try { loadUserIntoRuntime(acc); } catch (e) {}
      try { mountAccount(acc); } catch (e) {}
    }
  }
  WA.resumeRuntime = resumeRuntime; window.waResumeRuntime = resumeRuntime;

  /* 仿微信自定义输入/确认弹层（替代浏览器原生 prompt/confirm，避免出戏） */
  function _askOverlay(id) {
    injectCss();
    var o = document.getElementById(id);
    if (!o) { o = document.createElement('div'); o.id = id; (document.getElementById('phoneScreen') || document.body).appendChild(o); }
    o.style.cssText = 'position:absolute;inset:0;z-index:9600;background:#111214;color:#eee;font-size:14px;display:none;flex-direction:column';
    return o;
  }
  function askInput(opts, cb) {
    var o = _askOverlay('waAskOverlay'); o.classList.add('show'); o.style.display = 'flex';
    o.innerHTML = '<div class="wa-top"><div class="wa-title">' + esc(opts.title || '') + '</div></div>'
      + '<div class="wa-body"><div class="wa-field"><label>' + esc(opts.label || '') + '</label>'
      + '<input class="wa-input" id="waAskInput" type="' + (opts.password ? 'password' : 'text') + '" placeholder="' + esc(opts.placeholder || '') + '"></div></div>'
      + '<div style="flex-shrink:0;display:flex;gap:10px;padding:12px 14px">'
      + '<button class="wa-btn ghost" id="waAskCancel" style="margin:0;flex:1">取消</button>'
      + '<button class="wa-btn" id="waAskOk" style="margin:0;flex:1">确定</button></div>';
    var inp = document.getElementById('waAskInput'); if (opts.value) inp.value = opts.value;
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
    function close(ok) { var v = inp.value; o.style.display = 'none'; o.classList.remove('show'); cb(ok, v); }
    document.getElementById('waAskCancel').onclick = function () { close(false); };
    document.getElementById('waAskOk').onclick = function () { close(true); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') close(true); if (e.key === 'Escape') close(false); };
  }
  WA.askInput = askInput; window.waAskInput = askInput;
  function askConfirm(title, cb) {
    var o = _askOverlay('waAskConfirm'); o.classList.add('show'); o.style.display = 'flex';
    o.innerHTML = '<div class="wa-top"><div class="wa-title">确认操作</div></div>'
      + '<div class="wa-body"><div style="padding:18px 16px;font-size:14px;line-height:1.6;color:#ddd">' + esc(title || '') + '</div></div>'
      + '<div style="flex-shrink:0;display:flex;gap:10px;padding:12px 14px">'
      + '<button class="wa-btn ghost" id="waCfCancel" style="margin:0;flex:1">取消</button>'
      + '<button class="wa-btn danger" id="waCfOk" style="margin:0;flex:1;background:#FA5151">确定</button></div>';
    function close(ok) { o.style.display = 'none'; o.classList.remove('show'); cb(ok); }
    document.getElementById('waCfCancel').onclick = function () { close(false); };
    document.getElementById('waCfOk').onclick = function () { close(true); };
  }
  WA.askConfirm = askConfirm; window.waAskConfirm = askConfirm;


  /* 用户微信聊天列表置顶“微信助手”（无侵入包装 renderChatList） */
  function injectAssistantRow() {
    try {
      var sn = session(); if (!sn || sn.kind !== 'user') return;
      var list = document.getElementById('chatList'); if (!list) return;
      var old = document.getElementById('waAssistantRow'); if (old) old.remove();
      var row = document.createElement('div');
      row.id = 'waAssistantRow'; row.className = 'chat-item';
      row.onclick = function () { waOpenAssistUser(); };
      row.innerHTML = '<div class="chat-avatar" style="background:#07C160">助</div>'
        + '<div class="chat-info"><div class="chat-info-row"><div class="chat-name">微信助手</div><div class="chat-time"></div></div></div>';
      list.insertBefore(row, list.firstChild);
    } catch (e) {}
  }
  function patchChatList() {
    // 聊天列表：渲染前确保当前账号联系人/聊天已挂载，渲染后置顶微信助手
    if (typeof renderChatList === 'function' && !renderChatList._wa) {
      var orig = window.renderChatList;
      var wrapped = function () { try { ensureMount(); } catch (e) {} var r = orig.apply(this, arguments); try { injectAssistantRow(); } catch (e2) {} return r; };
      wrapped._wa = true; window.renderChatList = wrapped;
    }
    // 通讯录同样在渲染前挂载
    if (typeof renderContacts === 'function' && !renderContacts._wa) {
      var origC = window.renderContacts;
      var wrappedC = function () { try { ensureMount(); } catch (e) {} return origC.apply(this, arguments); };
      wrappedC._wa = true; window.renderContacts = wrappedC;
    }
    // 单人/多人线下列表渲染前也挂载（用户可能不经微信直进线下）
    if (typeof renderOfflineCharList === 'function' && !renderOfflineCharList._wa) {
      var origO = window.renderOfflineCharList;
      var wrappedO = function () { try { ensureMount(); } catch (e) {} return origO.apply(this, arguments); };
      wrappedO._wa = true; window.renderOfflineCharList = wrappedO;
    }
    // 朋友圈渲染前也确保挂载的是当前账号的朋友圈桶（异步权威 config 晚到也能纠正）
    if (typeof renderMoments === 'function' && !renderMoments._wa) {
      var origM = window.renderMoments;
      var wrappedM = function () { try { ensureMount(); } catch (e) {} return origM.apply(this, arguments); };
      wrappedM._wa = true; window.renderMoments = wrappedM;
    }
  }

  /* ===================== 生活圈：角色微信里的家人/朋友/同事等背景联系人（按人设 AI 生成、可续聊） ===================== */
  var Life = { busy: {}, proactiveTimer: null };
  var LIFE_BG = ['#576B95', '#3A8D6A', '#B0744A', '#8E6FBF', '#3E7CB1', '#B1567A', '#6E8B3D', '#A6633C', '#4E7A8C', '#8C5E9E'];
  function lifeCircleOf(ch) { if (!ch) return null; if (!ch.lifeCircle) ch.lifeCircle = { at: 0, generating: false, contacts: [], groups: [], moments: [] }; return ch.lifeCircle; }
  function lifeApiOk() { var a = C().api; return !!(a && a.baseUrl && a.apiKey && a.model); }
  // v113：生活圈生成统一注入【全局世界书】（常驻恒生效+关键词命中），让背景联系人/生活群/其动态也遵守同一世界观
  function lifeBookSuffix(ctx) {
    try { return (typeof window !== 'undefined' && window.globalBookSuffix) ? window.globalBookSuffix(ctx || '') : ''; }
    catch (e) { return ''; }
  }
  // 生活圈请求：不同模型/中转的 max_tokens 上限不同（4096/8192…），硬塞大值会直接 400 导致一直生成失败。
  // 按 期望值→4096→2048→不带上限(用模型默认) 逐档降级，只对“长度/上限/token”类错误降级，其它错误（鉴权/网络）直接抛
  async function lifeCall(messages, wantTokens, temperature, timeoutMs) {
    var seq = [wantTokens || 6000, 4096, 2048, 0].filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    var lastErr = null;
    for (var i = 0; i < seq.length; i++) {
      try {
        var opt = { temperature: (temperature === undefined ? 0.95 : temperature), timeout: timeoutMs || 90000 };
        if (seq[i] > 0) opt.maxTokens = seq[i];
        return await callApi(messages, opt);
      } catch (e) {
        lastErr = e;
        var msg = String((e && e.message) || e).toLowerCase();
        var lenErr = /max_tokens|maxtoken|token|length|context|too many|413|400|range|maximum|exceed/.test(msg);
        if (!lenErr) throw e;
      }
    }
    throw lastErr;
  }
  // 从可能被截断的文本里，按 key（contacts/groups/requests）抢救出所有【已完整闭合】的对象
  function lifeSalvageKey(text, key) {
    try {
      var re = new RegExp('"' + key + '"\\s*:\\s*\\[', 'g'), m0 = re.exec(text);
      if (!m0) return [];
      var i = m0.index + m0[0].length, depth = 0, inStr = false, esc = false, objs = [], start = -1;
      for (; i < text.length; i++) {
        var ch = text[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') { if (depth === 0) start = i; depth++; }
        else if (ch === '}') {
          depth--;
          if (depth === 0 && start >= 0) {
            var frag = text.substring(start, i + 1);
            try { objs.push(JSON.parse(frag)); } catch (pe) {}
            start = -1;
          }
        } else if (ch === ']' && depth === 0) break; // 数组正常闭合
      }
      return objs;
    } catch (e) { return []; }
  }
  function lifeParse(t) {
    try { if (typeof parseAIJson === 'function') { var _pj = parseAIJson(t); if (_pj && (Array.isArray(_pj.contacts) || Array.isArray(_pj.groups) || Array.isArray(_pj.requests))) return _pj; } } catch (e) {}
    try { var s = String(t), i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i >= 0 && j > i) { var _whole = JSON.parse(s.substring(i, j + 1)); if (_whole) return _whole; } } catch (e2) {}
    // 整体解析失败（多为输出过长被截断）：抢救已完整的各分块，能救多少救多少，避免“只出一个群/全空”
    try {
      var c = lifeSalvageKey(t, 'contacts'), g = lifeSalvageKey(t, 'groups'), r = lifeSalvageKey(t, 'requests');
      if (c.length || g.length || r.length) return { contacts: c, groups: g, requests: r, _salvaged: true };
    } catch (e3) {}
    return null;
  }
  function lifeRefreshList() { try { if (isCharSession() && typeof renderChatList === 'function') renderChatList(); } catch (e) {} }
  window.waLifeParse = lifeParse; window.waLifeSalvageKey = lifeSalvageKey;
  function lifeNormMsgs(arr, selfName, otherName) {
    var out = []; (Array.isArray(arr) ? arr : []).forEach(function (m) {
      if (!m) return; var content = String(m.content || '').trim(); if (content.length < 1) return;
      var dir = (m.dir === 'out' || m.direction === 'out') ? 'out' : 'in';
      out.push({ dir: dir, content: content.slice(0, 500), time: String(m.time || '').slice(0, 5), sender: dir === 'out' ? selfName : (m.sender || otherName || '') });
    });
    return out;
  }
  function lifeNormContacts(arr, ch) {
    var out = []; (Array.isArray(arr) ? arr : []).forEach(function (x, i) {
      if (!x || !x.name) return;
      var msgs = lifeNormMsgs(x.messages, ch.name, x.name);
      if (msgs.length < 2) return; // 历史太少的不要
      out.push({
        id: 'lc_' + Date.now() + '_' + i, name: String(x.name).slice(0, 20), circle: String(x.circle || '').slice(0, 10),
        relation: String(x.relation || '').slice(0, 80), sign: String(x.sign || '').slice(0, 40), wxId: String(x.wxId || '').slice(0, 30),
        draft: String(x.draft || '').slice(0, 120), avatarBg: LIFE_BG[i % LIFE_BG.length], messages: msgs, unread: 0, removed: false, blocked: false
      });
    });
    return out.slice(0, 14);
  }
  function lifeNormGroups(arr, ch) {
    var out = []; (Array.isArray(arr) ? arr : []).forEach(function (x, i) {
      if (!x || !x.name) return;
      var members = (Array.isArray(x.members) ? x.members : []).map(function (n) { return String(n || '').slice(0, 20); }).filter(Boolean);
      var msgs = (Array.isArray(x.messages) ? x.messages : []).map(function (m) {
        if (!m) return null; var content = String(m.content || '').trim(); if (!content) return null;
        var sender = String(m.sender || '').slice(0, 20) || '群成员';
        var dir = (m.dir === 'out' || m.direction === 'out' || sender === ch.name) ? 'out' : 'in';
        return { dir: dir, content: content.slice(0, 500), time: String(m.time || '').slice(0, 5), sender: sender };
      }).filter(Boolean);
      if (msgs.length < 2) return;
      if (members.indexOf(ch.name) < 0) members.unshift(ch.name);
      out.push({ id: 'lg_' + Date.now() + '_' + i, name: String(x.name).slice(0, 24), circle: String(x.circle || '').slice(0, 10),
        members: members.slice(0, 16), avatarBg: LIFE_BG[(i + 3) % LIFE_BG.length], messages: msgs, unread: 0, removed: false });
    });
    return out.slice(0, 4);
  }
  // 角色视角的「新的朋友」记录：dir=in 别人申请加TA / dir=out TA主动申请别人；按时间线新的在前
  function lifeNormRequests(arr, ch, lc) {
    var bg = {}; (lc && lc.contacts || []).forEach(function (c) { bg[c.name] = c.avatarBg; });
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (x) {
      if (!x || !x.name) return;
      var name = String(x.name).slice(0, 20);
      var dir = (x.dir === 'out') ? 'out' : 'in';
      var st = String(x.status || 'accepted');
      if (['accepted', 'pending', 'ignored', 'rejected'].indexOf(st) < 0) st = 'accepted';
      var msg = String(x.message || '').trim().slice(0, 120); if (!msg) return;
      var hrs = Number(x.hoursAgo); if (!isFinite(hrs) || hrs < 0) hrs = 24;
      // 站在「角色=我」的视角：我主动=userInitiated(true)；别人申请我=false
      var status = (dir === 'out') ? (st === 'ignored' ? 'rejected' : st) : (st === 'rejected' ? 'ignored' : st);
      var rec = {
        id: 'fr_life_' + Date.now() + '_' + out.length,
        charName: name, message: msg, userInitiated: dir === 'out', status: status,
        time: Date.now() - Math.round(hrs * 3600 * 1000), type: 'first_request', _waCharReq: true,
        charAvatarBg: bg[name] || LIFE_BG[out.length % LIFE_BG.length]
      };
      var reply = String(x.reply || '').trim().slice(0, 120);
      if (reply) { if (dir === 'out') rec.charReply = reply; else rec.userReply = reply; }
      out.push(rec);
    });
    out.sort(function (a, b) { return b.time - a.time; }); // 新的在前，与好友申请 unshift 顺序一致
    return out.slice(0, 10);
  }
  async function lifeGenerate(ch) {
    if (!ch || Life.busy[ch.id]) return;
    var lc = lifeCircleOf(ch);
    // 卡死保护：上次异常残留 generating 但已不 busy，先复位
    if (lc.generating && !Life.busy[ch.id]) lc.generating = false;
    // 空壳保护：at 被置位但联系人/群全空（上次解析出空结果）视为未成功，允许重新生成
    var _emptyShell = lc.at && !(lc.contacts || []).length;
    if (_emptyShell) lc.at = 0;
    if (lc.at || lc.generating) return;
    if (!lifeApiOk()) return; // 没配 API 不自动跑，用户可在有 API 后手动刷新
    Life.busy[ch.id] = true; lc.generating = true; save(); lifeRefreshList();
    var persona = (ch.persona || '').slice(0, 1600);
    var mems = (ch.memories || []).slice(-12).map(function (m) { return m.content; }).join('\n').slice(0, 700);
    var sys = '你在为真人角色「' + ch.name + '」生成其私人微信里的【生活圈】——除了主角之外，TA现实生活里本来就有的家人、亲戚、朋友、老同学、同事/同学、网友、常联系的商家等，这些人是TA真实生活的背景，不是主角/恋人。\n'
      + '【角色人设】' + (persona || '（无详细人设，请按名字与常识设定一个合理普通人的生活）') + '\n'
      + (mems ? '【角色最近的经历与心情，供自然呼应】\n' + mems + '\n' : '')
      + '【铁律】\n'
      + '1. 严格按角色的年龄、职业、身份、性格、家庭背景决定生活圈构成（学生多同学老师家人，上班族多同事领导客户），按人设合理生成，不套固定模板。\n'
      + '2. 本次先稳稳生成 6 个私聊联系人 + 1 个群（如家庭群、同事群、死党群）；对象必须来自不同生活圈子，年龄/亲近度/语气各异，不要雷同。【数量宁少勿多，必须保证 JSON 一次完整输出、绝不中途截断】，更多联系人之后会再补充。\n'
      + '3. 关系红线：默认只能是家人、亲戚、同学、同事、朋友、网友、商家/服务人员；除非人设明确写了，否则禁止新造追求者、暗恋者、前任、约会对象。\n'
      + '4. 每个私聊联系人 messages 给 8-10 条，时间跨最近几天不同时段（早中晚都有）：dir="out" 表示「' + ch.name + '」本人发出（气泡在右），dir="in" 表示对方发来（在左），自然交替、像真实微信，允许有“对方连发几条我才回”“我隔一阵才回”的真实节奏；群 messages 8-10 条，要有@某人或接话，不要每人一句走流程，sender 为发言成员名字，dir="out" 表示是' + ch.name + '本人说的。\n'
      + '5. 每条 content 8-50 字、强口语、有具体名词和生活细节（具体菜名、地名、班次、梗、语气词、偶尔错别字或缩写），严禁AI腔、正能量套话和“记录生活”式空话；2-3 个私聊联系人可带 draft（' + ch.name + '打了却没发出去的话）。\n'
      + '6. relation 一句话写清此人与' + ch.name + '的关系与称呼（如“大姑，总爱催婚”“同组同事坐隔壁”）；sign 是对方微信个性签名；群 members 给成员名字数组。\n'
      + '7. time 用 "HH:MM"，分布在最近几天并按先后递增。禁止出现主角/恋人/用户，禁止提及 AI、系统、生成、JSON。\n'
      + '8. 另外生成 requests 数组 4-5 条，模拟TA微信「新的朋友」里的好友申请经过：dir="in"=别人申请加TA（TA收到的），dir="out"=TA主动申请别人；大多数 status="accepted"（现在已是好友，名字尽量复用上面 contacts 里的人，关系对得上），其中恰好 1 条 dir="in" 且 status="pending"（一个不太熟的人刚申请、TA还没通过），至多 1 条 dir="out" 且 status="pending"（TA申请了别人、正在等回复），可再各放 1 条 ignored/rejected 更真实；message 是申请验证语（口语、贴合关系，如“我是上次一起打球的”“同事推的你”“通过下，大姑”），reply 可选（对方或自己的简短回应），hoursAgo 是多少小时前的数字（1 到 720 之间，越熟的越早）。\n'
      + '只输出一个 JSON 对象，不要 markdown、不要解释：{"contacts":[{"name":"","circle":"","relation":"","sign":"","wxId":"","draft":"","messages":[{"dir":"in","content":"","time":"09:12"}]}],"groups":[{"name":"","circle":"","members":[""],"messages":[{"dir":"in","content":"","time":"","sender":""}]}],"requests":[{"name":"","dir":"in","message":"","status":"accepted","reply":"","hoursAgo":48}]}';
    try {
      sys += lifeBookSuffix(persona + '\n' + mems);
      var reply = await lifeCall([{ role: 'system', content: sys }, { role: 'user', content: '请生成「' + ch.name + '」的微信生活圈（务必输出完整 JSON、不要中途截断）' }], 5000, 0.95, 90000);
      var data = lifeParse(reply);
      if (data) {
        lc.contacts = lifeNormContacts(data.contacts, ch);
        lc.groups = lifeNormGroups(data.groups, ch);
        if (!Array.isArray(ch.friendRequests)) ch.friendRequests = [];
        // 原地填充：mountCharRuntime 已把 config.friendRequests 指向同一数组，重新赋值会断开引用导致界面看不到
        if (ch.friendRequests.length === 0 && Array.isArray(data.requests)) {
          var _reqs = lifeNormRequests(data.requests, ch, lc);
          Array.prototype.push.apply(ch.friendRequests, _reqs);
        }
        // 封板铁律：必须真生成出【私聊联系人】才算成功（只解析出群、没有联系人=残缺，绝不封板，保留重试/自动补，避免“只出一个群其他永远不出”）
        if (lc.contacts && lc.contacts.length) {
          Life.autoFail = Life.autoFail || {}; Life.autoFail[ch.id] = 0;
          lc.at = Date.now();
          try { lifeSpawnMoments(ch, 6, true); } catch (em) {}
          save();
          // v108：首次只生成一半量（6私聊+1群），不再后台自动补；用户可随时手动「补全联系人」追加
        } else {
          Life.autoFail = Life.autoFail || {}; Life.autoFail[ch.id] = (Life.autoFail[ch.id] || 0) + 1;
          try { toast('生活圈联系人没生成完整，请再点一次「生成我的生活圈」'); } catch (et) {}
        }
      } else {
        try { toast('生活圈内容解析失败，请再点一次「生成我的生活圈」'); } catch (ep) {}
      }
    } catch (e) { console.warn('[life] generate fail', e); Life.autoFail = Life.autoFail || {}; Life.autoFail[ch.id] = (Life.autoFail[ch.id] || 0) + 1; try { toast('生活圈生成失败：' + ((e && e.message) || '网络或API异常') + '，可重试'); } catch (ec) {} }
    finally { lc.generating = false; Life.busy[ch.id] = false; try { save(); lifeRefreshList(); } catch (e) {} }
  }
  // 刷新联系人：保留已有会话与聊天，按人设追加新的生活圈联系人/群
  async function lifeRegenerateMerge(ch, silent) {
    if (Life.busy[ch.id]) { if (!silent) toast('正在生成中…'); return; }
    var lc = lifeCircleOf(ch), have = (lc.contacts || []).map(function (x) { return x.name; });
    Life.busy[ch.id] = true;
    var persona = (ch.persona || '').slice(0, 1400);
    var sys = '为角色「' + ch.name + '」补充其微信生活圈里【还没有的】联系人。已有联系人：' + (have.join('、') || '无') + '。\n'
      + '人设：' + persona + '\n本次是小批量补全：只再生成 2-3 个与已有不重复、来自不同生活圈子的新联系人（至多再加1个新群）。【宁少勿多，必须保证 JSON 一次完整输出、绝不截断】。要求：私聊 6-9 条历史（跨最近几天不同时段、自然交替）（dir="out"=本人发出/in=对方发来，自然交替）；关系红线（默认家人/亲戚/同学/同事/朋友/网友/商家，禁造追求者前任除非人设明确）；口语生活化、按人设不套模板。\n'
      + '再给 requests 数组 3 条TA微信「新的朋友」申请经过：dir="in"=别人申请加TA、dir="out"=TA主动申请别人，多数 status="accepted"（名字尽量用本次/已有联系人），恰好1条 dir="in" 且 status="pending"，message 是口语验证语、reply 可选、hoursAgo 是多少小时前(1-720)。\n'
      + '只输出 JSON：{"contacts":[{"name":"","circle":"","relation":"","sign":"","wxId":"","draft":"","messages":[{"dir":"in","content":"","time":""}]}],"groups":[{"name":"","circle":"","members":[],"messages":[{"dir":"in","content":"","time":"","sender":""}]}],"requests":[{"name":"","dir":"in","message":"","status":"accepted","reply":"","hoursAgo":48}]}';
    try {
      sys += lifeBookSuffix(persona + '\n' + (have.join('、') || ''));
      var reply = await lifeCall([{ role: 'system', content: sys }, { role: 'user', content: '补充新联系人（输出完整 JSON、不要截断）' }], 3500, 0.95, 90000);
      var data = lifeParse(reply);
      if (data) {
        var add = lifeNormContacts(data.contacts, ch).filter(function (x) { return !(lc.contacts || []).some(function (e) { return e.name === x.name; }); });
        lc.contacts = (lc.contacts || []).concat(add).slice(0, 60); // v108：补全可无限次点击，放宽上限
        var gn = (lc.groups || []).map(function (g) { return g.name; });
        var ag = lifeNormGroups(data.groups, ch).filter(function (g) { return gn.indexOf(g.name) < 0; });
        lc.groups = (lc.groups || []).concat(ag).slice(0, 12);
        // 老角色补历史申请记录（仅在还没有时，原地填充保持同引用）
        if (!Array.isArray(ch.friendRequests)) ch.friendRequests = [];
        if (ch.friendRequests.length === 0 && Array.isArray(data.requests)) Array.prototype.push.apply(ch.friendRequests, lifeNormRequests(data.requests, ch, lc));
        lc.at = Date.now(); save(); lifeRefreshList();
        if (!silent) toast(add.length ? ('已新增 ' + add.length + ' 位联系人') : '没有新的联系人了');
      } else { if (!silent) toast('刷新失败，请稍后再试'); }
    } catch (e) { if (!silent) toast('刷新失败，请稍后再试'); }
    finally { Life.busy[ch.id] = false; }
  }
  // 首次生成后后台静默分批补足到约 10 个联系人：每批 3-5 个、最多 2 批，小批量稳定不截断；期间不打扰用户
  async function lifeAutoFill(ch) {
    try {
      var lc = lifeCircleOf(ch), rounds = 0;
      while ((lc.contacts || []).length < 10 && rounds < 2) {
        if (!lifeApiOk() || Life.busy[ch.id]) break;
        var before = (lc.contacts || []).length;
        await lifeRegenerateMerge(ch, true);
        rounds++;
        if ((lc.contacts || []).length <= before) break; // 这批没新增就别再空转
        if ((lc.contacts || []).length < 10) await new Promise(function (res) { setTimeout(res, 1000); });
      }
      lifeRefreshList();
    } catch (e) {}
  }
  window.waRefreshLifeContacts = function () {
    if (!isCharSession()) { toast('该功能仅角色微信可用'); return; }
    var ch = sessionChar(), lc = lifeCircleOf(ch);
    if (!lifeApiOk()) { toast('请先在设置配置 API'); return; }
    if (lc.generating || Life.busy[ch.id]) { toast('正在生成中…'); return; }
    if (!lc.at) { lifeGenerate(ch); toast('正在生成生活圈…'); return; }
    toast('正在补全联系人…'); lifeRegenerateMerge(ch); // v108：补全=只追加不清空，可无限次点
    try { ensureSociety(ch.worldId || activeWorldId()); } catch (e) {}
  };
  // v108：刷新=重建。清空本角色生活圈的联系人/群/由生活圈注入的好友申请，再按小批量重新生成（不碰与主角的真实聊天/申请）
  window.waLifeRebuild = function () {
    if (!isCharSession()) { toast('该功能仅角色微信可用'); return; }
    var ch = sessionChar(), lc = lifeCircleOf(ch);
    if (!lifeApiOk()) { toast('请先在设置配置 API'); return; }
    if (lc.generating || Life.busy[ch.id]) { toast('正在生成中…'); return; }
    lc.contacts = []; lc.groups = []; lc.at = 0; lc.generating = false;
    Life.autoFail = Life.autoFail || {}; Life.autoFail[ch.id] = 0;
    if (Array.isArray(ch.friendRequests)) { // 只清生活圈生成的申请记录（带 _waCharReq 标记），真实好友申请保留
      for (var i = ch.friendRequests.length - 1; i >= 0; i--) { if (ch.friendRequests[i] && ch.friendRequests[i]._waCharReq) ch.friendRequests.splice(i, 1); }
    }
    save(); lifeRefreshList();
    toast('已清空，正在重新生成生活圈…'); lifeGenerate(ch);
  };
  // 会话列表用：当前登录角色的生活圈会话（私聊联系人 + 生活群），已删除/拉黑的不显示
  function lifeList() {
    var ch = sessionChar(); if (!ch) return { generating: false, items: [] };
    var lc = lifeCircleOf(ch), items = [];
    (lc.contacts || []).forEach(function (x) {
      if (x.removed || x.blocked) return;
      var last = x.messages.length ? x.messages[x.messages.length - 1] : null;
      items.push({ lk: 'life', id: x.id, name: x.name, circle: x.circle, avatarBg: x.avatarBg, unread: x.unread || 0,
        lastText: last ? ((last.dir === 'out' ? '我: ' : '') + last.content) : (x.draft || ''), time: last ? last.time : '' });
    });
    (lc.groups || []).forEach(function (g) {
      if (g.removed) return;
      var last = g.messages.length ? g.messages[g.messages.length - 1] : null;
      items.push({ lk: 'lifegroup', id: g.id, name: g.name, circle: g.circle, avatarBg: g.avatarBg, unread: g.unread || 0, isGroup: true,
        lastText: last ? ((last.dir === 'out' ? '我: ' : last.sender + ': ') + last.content) : '', time: last ? last.time : '' });
    });
    return { generating: !!lc.generating && !lc.at, items: items };
  }
  WA.lifeList = lifeList; window.waLifeList = lifeList;
  window.waLifeEnsure = function () { var ch = sessionChar(); if (ch) lifeGenerate(ch); };
  // 带防抖的自动补生成：登录后首次自动跑若因时机太早/网络抖动失败，进入角色微信列表且已配好 API 时自动补一次（15s 防抖，不重复打 API）
  window.waLifeMaybeAuto = function () {
    try {
      if (!isCharSession()) return;
      var ch = sessionChar(); if (!ch) return;
      var lc = lifeCircleOf(ch);
      Life.autoFail = Life.autoFail || {};
      if ((Life.autoFail[ch.id] || 0) >= 3) return; // 连续自动失败3次不再空转，等用户手动点生成
      if (lc.generating || Life.busy[ch.id] || !lifeApiOk()) return;
      var now = Date.now();
      if (Life.lastAuto && now - Life.lastAuto < 15000) return;
      Life.lastAuto = now;
      if (!lc.at || !(lc.contacts || []).length) { lifeGenerate(ch); return; }
      // v108：已有联系人就不再自动追加，补全交给用户手动点「补全联系人」
    } catch (e) {}
  };
  window.waLifeStatus = function () { var ch = sessionChar(); if (!ch) return null; var lc = lifeCircleOf(ch); return { at: lc.at, generating: !!lc.generating, apiOk: lifeApiOk() }; };

  /* ---- 生活圈聊天界面（自绘 overlay，不改动主聊天引擎，零破坏风险） ---- */
  /* ===== 生活圈并入主微信：包装成主聊天视图可打开的“虚拟会话主体”，与真实角色/群共用同一套 openChat / renderMessages / 输入条，不再是另一套界面 ===== */
  function lifeBaseTs() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function lifeStdMsgs(found) {
    var t = found.target, base = lifeBaseTs();
    return (t.messages || []).map(function (m, i) {
      var mine = m.dir === 'out';
      var o = { role: mine ? 'user' : 'assistant', content: String(m.content == null ? '' : m.content), time: base + i * 60000, _life: true };
      if (!mine && found.isGroup && m.sender) o.senderName = String(m.sender);
      return o;
    });
  }
  function lifeSubject(found) {
    var ch = found.ch, t = found.target;
    var subj = t._subject;
    if (!subj) {
      subj = {
        _waLife: true, _waLifeId: t.id, id: 'life_' + t.id,
        name: t.name, avatar: '', avatarBg: t.avatarBg || '#576B95',
        persona: t.relation || t.circle || '', gender: 'other', worldId: ch.worldId || 'default',
        chatHistory: [], voiceEnabled: false, stickerEnabled: false, moments: [], memories: [],
        _waLifeGroup: !!found.isGroup, members: (t.members || []).slice(), noFriendOps: true,
        people: {}, starred: false, blocked: false, alias: '', deletedFromWechat: false
      };
      t._subject = subj;
    }
    subj.name = t.name; subj.avatarBg = t.avatarBg || subj.avatarBg; subj._waLifeGroup = !!found.isGroup;
    subj.chatHistory = lifeStdMsgs(found);
    return subj;
  }
  function lifeSyncSubject(id) {
    var found = lifeFind(id); if (!found) return null;
    var subj = found.target._subject; if (!subj) return null;
    subj.chatHistory = lifeStdMsgs(found);
    return { found: found, subj: subj };
  }
  // 若正用主聊天视图打开该生活圈会话，就地刷新（与 overlay 刷新并存、互不影响）
  function lifeRefreshOpenView(id) {
    try {
      var r = lifeSyncSubject(id);
      var ci = (typeof currentCharIdx !== 'undefined') ? currentCharIdx : -1;
      var cur = (C().characters || [])[ci];
      if (r && cur && cur._waLife && cur._waLifeId === id) {
        if (typeof renderMessages === 'function') renderMessages();
        if (typeof scrollChatToBottom === 'function') scrollChatToBottom();
        if (typeof renderChatList === 'function') renderChatList();
      }
    } catch (e) {}
    if (LifeOpen) lifeRender();
  }
  window.waLifeFindById = function (id) { return lifeFind(id); };
  window.waLifeSyncSubject = lifeSyncSubject;
  window.waLifeRefreshOpenView = lifeRefreshOpenView;
  window.waLifeReplyFor = function (id, text) {
    var f = lifeFind(id); if (!f) return Promise.resolve([]);
    return lifeReplyLines(f.ch, f.target, f.isGroup, text, false);
  };
  window.waLifeIsSubject = function (x) { return !!(x && x._waLife); };
  window.waLifePushOut = function (id, text) {
    var f = lifeFind(id); if (!f) return false;
    var ch = f.ch; f.target.messages = f.target.messages || [];
    f.target.messages.push({ dir: 'out', content: text, time: lifeNowHM(), sender: ch.name });
    return true;
  };
  window.waLifePushInMany = function (id, lines) {
    var f = lifeFind(id); if (!f) return 0; f.target.messages = f.target.messages || [];
    (lines || []).forEach(function (m) { f.target.messages.push(m); });
    return (lines || []).length;
  };

  var LifeOpen = null; // {ch, target, isGroup}
  function lifeFind(id) {
    var ch = sessionChar(), lc = ch && lifeCircleOf(ch); if (!lc) return null;
    var g = null, c = null;
    c = (lc.contacts || []).filter(function (x) { return x.id === id; })[0] || null;
    if (c) return { ch: ch, target: c, isGroup: false };
    g = (lc.groups || []).filter(function (x) { return x.id === id; })[0] || null;
    if (g) return { ch: ch, target: g, isGroup: true };
    return null;
  }
  function lifeOverlay() {
    injectCss();
    var o = document.getElementById('waLifeOverlay');
    if (!o) { o = document.createElement('div'); o.id = 'waLifeOverlay'; (document.getElementById('phoneScreen') || document.body).appendChild(o); }
    o.style.cssText = 'position:absolute;inset:0;z-index:9500;background:#000;color:#eee;font-size:14px;display:none;flex-direction:column';
    return o;
  }
  function lifeEsc(s) { return esc(String(s == null ? '' : s)); }
  function lifeRender() {
    if (!LifeOpen) return;
    var body = document.getElementById('waLifeBody'); if (!body) return;
    var t = LifeOpen.target, self = LifeOpen.ch.name;
    var h = '';
    // 直接复用主微信聊天的 .msg/.msg.self/.msg-avatar/.msg-bubble/.gc-msg-col 样式（含主题与自定义气泡CSS），保证和其他微信完全一致
    var selfAv = (LifeOpen.ch.avatar && String(LifeOpen.ch.avatar).indexOf('data:') === 0)
      ? ('<div class="msg-avatar"><img src="' + lifeEsc(LifeOpen.ch.avatar) + '" style="width:100%;height:100%;object-fit:cover" alt=""></div>')
      : ('<div class="msg-avatar">' + lifeEsc(self.charAt(0)) + '</div>');
    var _lastLifeT = null;
    (t.messages || []).forEach(function (m) {
      var mine = m.dir === 'out';
      var _mt = String(m.time || '').slice(0, 5);
      if (_mt && _mt !== _lastLifeT) { h += '<div class="msg-time">' + lifeEsc(_mt) + '</div>'; _lastLifeT = _mt; }
      var avTxt = lifeEsc((mine ? self : (m.sender || t.name || '?')).charAt(0));
      var avStyle = mine ? '' : (' style="background:' + lifeEsc(t.avatarBg || '#576B95') + '"');
      var avatar = mine ? selfAv : ('<div class="msg-avatar"' + avStyle + '>' + avTxt + '</div>');
      var bubble = '<div class="msg-bubble" style="white-space:pre-wrap">' + lifeEsc(m.content) + '</div>';
      if (mine) {
        h += '<div class="msg self">' + avatar + bubble + '</div>';
      } else if (LifeOpen.isGroup) {
        h += '<div class="msg">' + avatar + '<div class="gc-msg-col" style="flex:1;min-width:0"><div style="font-size:11px;color:#8E8E93;margin-bottom:2px;margin-left:4px">' + lifeEsc(m.sender || '') + '</div>' + bubble + '</div></div>';
      } else {
        h += '<div class="msg">' + avatar + bubble + '</div>';
      }
    });
    body.className = 'chat-messages wa-life-body';
    body.innerHTML = h || '<div style="text-align:center;color:#8e8e93;padding:30px;font-size:13px">还没有消息</div>';
    body.scrollTop = body.scrollHeight;
  }
  window.waOpenLife = function (id) {
    var found = lifeFind(id); if (!found) return;
    found.target.unread = 0; save();
    var subj = lifeSubject(found);
    // 与真实角色/群完全同一个聊天视图（openChat 主视图），不再另开自绘 overlay，保证“一个系统”
    if (typeof window.__waEnterSubject === 'function') { window.__waEnterSubject(subj); return; }
    LifeOpen = found; // 理论兜底
  };

  function lifeMenu(id) {
    var found = LifeOpen || lifeFind(id); if (!found) return;
    var isG = found.isGroup;
    askConfirm(isG
      ? '删除并清空与「' + found.target.name + '」的生活群会话？（可之后在联系人菜单重新生成）'
      : '对「' + found.target.name + '」要做什么？确定后可选择删除或拉黑。', function () {});
    // askConfirm 只给确定/取消，这里用简易操作弹层覆盖更细操作
    setTimeout(function () {
      var o = lifeOverlay();
      var menu = document.createElement('div');
      menu.id = 'waLifeMenuPanel';
      menu.style.cssText = 'position:absolute;right:10px;top:52px;z-index:9550;background:#2c2c2e;border-radius:12px;overflow:hidden;min-width:150px;box-shadow:0 6px 24px rgba(0,0,0,.5)';
      function item(txt, fn, danger) { var b = document.createElement('div'); b.textContent = txt; b.style.cssText = 'padding:13px 16px;font-size:14px;color:' + (danger ? '#ff6b6b' : '#eee') + ';border-bottom:.5px solid rgba(255,255,255,.06)'; b.onclick = function () { menu.remove(); fn(); }; menu.appendChild(b); }
      item('刷新/补全历史', function () { lifeRegenOne(id); });
      if (!isG) item(found.target.blocked ? '取消拉黑' : '拉黑不再联系', function () { lifeToggleBlock(id); });
      item('删除该会话', function () { lifeDrop(id); }, true);
      item('取消', function () {});
      var old = document.getElementById('waLifeMenuPanel'); if (old) old.remove();
      o.appendChild(menu);
      setTimeout(function () { document.addEventListener('click', function clos(ev) { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', clos); } }); }, 0);
    }, 10);
  }
  function lifeCloseAndBack() { var o = document.getElementById('waLifeOverlay'); if (o) o.style.display = 'none'; LifeOpen = null; lifeRefreshList(); }
  function lifeDrop(id) {
    var f = lifeFind(id); if (!f) return; f.target.removed = true; save(); lifeCloseAndBack(); toast('已删除');
  }
  window.waLifeDrop = lifeDrop;
  function lifeToggleBlock(id) {
    var f = lifeFind(id); if (!f || f.isGroup) return; f.target.blocked = !f.target.blocked; save(); lifeCloseAndBack(); toast(f.target.blocked ? '已拉黑' : '已取消拉黑');
  }
  window.waLifeToggleBlock = lifeToggleBlock;
  // 刷新/补全某个联系人的历史：再调一次 AI，在现有基础上补更早/更多的往来
  async function lifeRegenOne(id) {
    var f = lifeFind(id); if (!f || !lifeApiOk()) { toast('请先配置 API'); return; }
    var ch = f.ch, t = f.target; toast('正在补全…');
    var lines = await lifeReplyLines(ch, t, f.isGroup, '（请自然地再展开一些我们之前的日常往来，补 6-10 条更早的聊天）', true);
    if (lines.length) { t.messages = lines.concat(t.messages || []); save(); lifeRefreshOpenView(id); toast('已补全'); }
    else toast('补全失败，请稍后再试');
  }
  window.waLifeRegenOne = lifeRegenOne;
  async function lifeReplyLines(ch, t, isGroup, promptText, isBackfill) {
    if (!lifeApiOk()) return [];
    var hist = (t.messages || []).slice(-12).map(function (m) { return (m.dir === 'out' ? ch.name : (m.sender || t.name)) + '：' + m.content; }).join('\n');
    var who = isGroup
      ? ('这是群「' + t.name + '」，成员：' + (t.members || []).join('、') + '；你轮流扮演除' + ch.name + '之外的成员发言，每条前面用“名字||内容”标注发言人')
      : ('你扮演「' + t.name + '」（' + (t.relation || ((t.circle || '朋友') + '，是' + ch.name + '生活里的人')) + '，微信签名：' + (t.sign || '无') + '）');
    var sys = '你在模拟真人微信聊天。' + who + '。\n【机主是谁】' + (ch.persona || '').slice(0, 500)
      + '\n要求：口语、简短、生活化，符合关系远近与各自性格；' + (isGroup ? '每条格式严格为“发言成员名||内容”，一次 1-4 条，每行一条' : '一次 1-3 条，每条单独一行，不要名字前缀、不要解释、不要括号动作') + '。';
    var up = '已有聊天：\n' + hist + '\n' + (isBackfill ? '请补全更早的日常往来（6-10条，按时间先后）：' : (ch.name + '刚说：' + promptText + '\n请回复：'));
    try {
      sys += lifeBookSuffix((ch.persona || '') + '\n' + hist + '\n' + who);
      var r = await callApi([{ role: 'system', content: sys }, { role: 'user', content: up }], { maxTokens: isBackfill ? 900 : 400, temperature: 0.95, timeout: 60000 });
      var raw = String(r || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var out = [];
      raw.forEach(function (line) {
        var sender = isGroup ? '' : t.name, content = line.replace(/^[-•\s]+/, '');
        if (isGroup && line.indexOf('||') >= 0) { var p = line.split('||'); sender = p[0].trim(); content = (p[1] || '').trim(); }
        content = content.replace(/^[^：:]+[：:]/, function (mm) { return isGroup ? mm : ''; }).trim();
        if (!content || content.length < 1) return;
        if (content === ch.name + '：' || content.indexOf(ch.name + '：') === 0 && !isGroup) content = content.split('：').slice(1).join('：');
        var mine = sender === ch.name;
        out.push({ dir: mine ? 'out' : 'in', content: content.slice(0, 500), time: lifeNowHM(), sender: mine ? ch.name : (sender || t.name) });
      });
      return isBackfill ? out.slice(0, 10) : out.slice(0, 4);
    } catch (e) { return []; }
  }
  function lifeNowHM() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  var _lifeSending = false;
  async function lifeDoSend(id) {
    if (_lifeSending) return;
    var f = lifeFind(id); if (!f) return;
    var inp = document.getElementById('waLifeInput'); var text = (inp.value || '').trim();
    if (!text) return;
    if (!lifeApiOk()) { toast('请先在设置配置 API'); return; }
    var ch = f.ch, t = f.target;
    t.messages = t.messages || [];
    t.messages.push({ dir: 'out', content: text, time: lifeNowHM(), sender: ch.name });
    inp.value = ''; try { if (inp.oninput) inp.oninput(); } catch (e) {} lifeRender(); save();
    _lifeSending = true;
    var typing = document.getElementById('waLifeBody');
    var tip = document.createElement('div'); tip.id = 'waLifeTyping'; tip.style.cssText = 'padding:7px 12px;color:#8e8e93;font-size:13px'; tip.textContent = '对方正在输入…'; if (typing) typing.appendChild(tip), typing.scrollTop = typing.scrollHeight;
    var lines = await lifeReplyLines(ch, t, f.isGroup, text, false);
    var tp = document.getElementById('waLifeTyping'); if (tp) tp.remove();
    lines.forEach(function (m) { t.messages.push(m); });
    _lifeSending = false; save(); lifeRender();
  }
  window.waLifeDoSend = lifeDoSend;

  /* ---- 生活圈主动消息：随机让背景联系人/群主动找角色聊天 ---- */
  function lifePickProactiveTarget(ch) {
    var lc = lifeCircleOf(ch), pool = [];
    (lc.contacts || []).forEach(function (x) { if (!x.removed && !x.blocked) pool.push({ t: x, g: false }); });
    (lc.groups || []).forEach(function (x) { if (!x.removed) pool.push({ t: x, g: true }); });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  async function lifeProactiveTick() {
    try {
      if (!isCharSession() || !lifeApiOk()) return;
      // 角色登录后的生活圈主动消息与设置页“主动消息”总开关联动。
      if (!C().settings || !C().settings.proactiveEnabled) return;
      var ch = sessionChar(); if (!ch) return;
      var lc = lifeCircleOf(ch); if (!lc.at) return;
      // 正在看这个生活圈会话时不打扰
      var pick = lifePickProactiveTarget(ch); if (!pick) return;
      var now = Date.now(), last = lc.lastProactive || 0;
      if (now - last < 90000) return; // 至少间隔 90s
      if (Math.random() > 0.5) return; // 每次有概率不发，更自然
      lc.lastProactive = now;
      var lines = await lifeReplyLines(ch, pick.t, pick.g, pick.g ? '（请你作为群成员自然地起个话题/分享一件事）' : '（请你主动给' + ch.name + '发一条消息，起个话题或分享日常，不要等TA先开口）', false);
      if (!lines.length) return;
      var _ci = (typeof currentCharIdx !== 'undefined') ? currentCharIdx : -1, _cur = (C().characters || [])[_ci];
      var viewing = !!( _cur && _cur._waLife && _cur._waLifeId === pick.t.id);
      lines.forEach(function (m) { pick.t.messages = pick.t.messages || []; pick.t.messages.push(m); if (!viewing) pick.t.unread = (pick.t.unread || 0) + 1; });
      save();
      if (viewing) lifeRefreshOpenView(pick.t.id); else lifeRefreshList();
    } catch (e) {}
  }
  function lifeStartProactive() {
    try { if (Life.proactiveTimer) clearInterval(Life.proactiveTimer); } catch (e) {}
    if (!C().settings || !C().settings.proactiveEnabled) return;
    Life.proactiveTimer = setInterval(lifeProactiveTick, 55000);
  }
  function lifeStopProactive() {
    try { if (Life.proactiveTimer) clearInterval(Life.proactiveTimer); } catch (e) {}
    Life.proactiveTimer = null;
  }
  WA.lifeStartProactive = lifeStartProactive;
  WA.lifeStopProactive = lifeStopProactive;
  // 生活圈背景联系人发朋友圈（作者是联系人，不是角色本人），并入角色看到的朋友圈流
  async function lifeSpawnMoments(ch, n, initial) {
    if (!ch || !lifeApiOk()) return;
    var lc = lifeCircleOf(ch);
    var names = (lc.contacts || []).map(function (x) { return x.name + '（' + (x.circle || '朋友') + '）'; }).join('、');
    if (!names) return;
    try {
      var sys = '你在模拟真人「' + ch.name + '」微信朋友圈里、其生活圈联系人发的动态。可选作者：' + names + '。\n'
        + '生成 ' + n + ' 条朋友圈，作者尽量各不相同（从可选作者里挑，别总用同一个），内容覆盖不同类型：晒饭、加班/上学吐槽、带娃、宠物、风景随拍、深夜情绪、转发配文、玩梗、求助、打卡等，时间和语气都要不一样。8-160字，允许有具体细节的长文和口语语气词，像不同的真人发的，严禁AI腔、鸡汤和正能量套话。每条正文必须以完整句子结束，禁止在半句话中截断。\n'
        + '只输出 JSON 数组：[{"authorName":"作者名","text":"正文"}]，不要解释、不要markdown。';
      sys += lifeBookSuffix(names);
      // 单次请求且只接受完整 JSON；截断/解析失败时整批不落盘，避免把半句话显示到朋友圈。
      var r = await callApiRaw([{ role: 'system', content: sys }, { role: 'user', content: '生成 ' + n + ' 条完整动态' }], { maxTokens: 3000, temperature: 1, timeout: 60000, requireComplete: true });
      var raw = String(r || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      var d = null;
      try { d = JSON.parse(raw); } catch (pe) { return; }
      var arr = Array.isArray(d) ? d : (d && d.moments); if (!Array.isArray(arr)) return;
      var now = Date.now();
      arr.slice(0, n).forEach(function (x, i) {
        if (!x || !x.authorName || !x.text) return;
        var contact = (lc.contacts || []).filter(function (c) { return c.name === x.authorName; })[0];
        lc.moments.push({ text: String(x.text).trim(), image: '', time: now - i * 3600000 - Math.floor(Math.random() * 2) * 86400000,
          likes: [], comments: [], authorName: String(x.authorName).slice(0, 20), authorAvatarBg: contact ? contact.avatarBg : '#576B95', authorType: 'life', reactionsDone: true });
      });
      save();
    } catch (e) {}
  }
  WA.lifeSpawnMoments = lifeSpawnMoments;
  window.waLifeSpawnMoments = function () { var ch = sessionChar(); if (ch) lifeSpawnMoments(ch, 4, false); };

  /* ===================== 微型社会：同世界真实角色之间自动生成关系网 + 共同群 ===================== */
  var Society = { busy: {} };
  function worldRealChars(wid) {
    return (C().characters || []).filter(function (x) { return !x._waMirror && !x._waLife && (x.worldId || 'default') === wid && !x.deletedFromWechat; });
  }
  function societyGroupExists(w, chars) {
    var idSet = {}; chars.forEach(function (c) { idSet[String(c.id)] = 1; });
    return (C().groupChats || []).some(function (g) {
      if (!g || g.deleted || (g.worldId || 'default') !== (w.id || 'default') || !g._social) return false;
      var gids = (g.members || []).map(function (m) { return String(m.charId); }).sort().join(',');
      var cids = chars.map(function (c) { return String(c.id); }).sort().join(',');
      return gids === cids;
    });
  }
  async function ensureSociety(wid) {
    var c = C();
    var w = worlds().filter(function (x) { return (x.id || 'default') === wid; })[0];
    if (!w || Society.busy[wid]) return;
    if (w.socialWeb && w.socialWeb.at) return;
    var chars = worldRealChars(wid);
    if (chars.length < 2 || !lifeApiOk()) return;
    Society.busy[wid] = true;
    try {
      var desc = chars.map(function (x, i) { return (i + 1) + '. ' + x.name + '：' + (x.persona || '').slice(0, 280); }).join('\n');
      var sys = '下面是同一个虚拟世界里的几个角色及其人设。请推断【这些角色彼此之间】的社会关系网（不是他们和主角/用户的关系，是他们互相之间），并生成一个他们共同所在的微信群。\n'
        + '【角色】\n' + desc + '\n'
        + '【要求】\n'
        + '1. 关系要合理、多样：家人/亲戚/同学/同事/室友/情侣/死对头/师徒/发小/网友等都可以，严格贴合每个人设，不要所有人都关系好。\n'
        + '2. pairs 给出每两个有交集角色的关系：rel=关系，tone=他们相处的语气，known=怎么认识。\n'
        + '3. groupName 是这群人最合适的共同微信群名（像“一家人”“302宿舍”“项目攻坚组”“老同学们”）；若他们实在不可能在同一个群，groupName 留空字符串。\n'
        + '4. groupChat 给这个群里 8-14 条最近的日常聊天，sender 必须是上面的角色名，内容口语、10-40字、符合彼此关系，time 为 HH:MM 并按先后。\n'
        + '只输出 JSON：{"groupName":"","pairs":[{"a":"","b":"","rel":"","tone":"","known":""}],"groupChat":[{"sender":"","content":"","time":""}]}，不要解释。';
      sys += lifeBookSuffix(desc);
      var reply = await callApi([{ role: 'system', content: sys }, { role: 'user', content: '生成他们的关系网与共同群' }], { maxTokens: 3000, temperature: 0.9, timeout: 90000 });
      var data = lifeParse(reply);
      if (!data) return;
      w.socialWeb = { at: Date.now(), pairs: Array.isArray(data.pairs) ? data.pairs : [], groupName: data.groupName || '' };
      // 建共同群
      if (data.groupName && Array.isArray(data.groupChat) && data.groupChat.length >= 3 && !societyGroupExists(w, chars)) {
        var byName = {}; chars.forEach(function (chh) { byName[chh.name] = chh; });
        var members = chars.map(function (chh) {
          var idx = c.characters.indexOf(chh);
          return { memberId: 'char_' + idx, type: 'char', charIdx: idx, charId: chh.id, name: chh.alias || chh.nickname || chh.name, avatar: chh.avatar || '', avatarBg: chh.avatarBg || '#576B95' };
        });
        var msgs = data.groupChat.map(function (m) {
          var chh = byName[m.sender]; var idx = chh ? c.characters.indexOf(chh) : -1;
          return { role: 'other', senderName: String(m.sender || '').slice(0, 20), senderId: idx >= 0 ? ('char_' + idx) : '', content: String(m.content || '').slice(0, 500), time: Date.now(), timeLabel: String(m.time || '') };
        }).filter(function (m) { return m.content; });
        if (!Array.isArray(c.groupChats)) c.groupChats = [];
        c.groupChats.push({
          id: 'social_' + Date.now(), name: String(data.groupName).slice(0, 24), members: members, messages: msgs,
          avatar: '群', avatarBg: '#7B7B7B', createdAt: Date.now(), worldId: wid, _social: true,
          waOwnerId: null, proactiveEnabled: false
        });
      }
      save(); lifeRefreshList();
    } catch (e) { console.warn('[society] fail', e); }
    finally { Society.busy[wid] = false; }
  }
  WA.ensureSociety = ensureSociety; window.waEnsureSociety = function () { var sn = session(); if (sn) ensureSociety(sn.worldId || activeWorldId()); };
  // 关系网查询：某角色与同世界其他角色的关系（供对话/群引用）
  window.waSocietyRelationsOf = function (charId) {
    try {
      var ch = (C().characters || []).filter(function (x) { return String(x.id) === String(charId); })[0]; if (!ch) return [];
      var w = worlds().filter(function (x) { return (x.id || 'default') === (ch.worldId || 'default'); })[0]; if (!w || !w.socialWeb) return [];
      var out = [];
      (w.socialWeb.pairs || []).forEach(function (p) {
        var other = null; if (p.a === ch.name) other = p.b; else if (p.b === ch.name) other = p.a;
        if (other) out.push({ other: other, rel: p.rel, tone: p.tone, known: p.known });
      });
      return out;
    } catch (e) { return []; }
  };

  /* 启动：注入样式、挂错误捕获、执行迁移、包装列表 */
  function boot() {
    injectCss(); hookErrors();
    try { migrate(); } catch (e) { console.warn('[WA] boot migrate', e); }
    try { rescueUserPersonaAlways(); } catch (e) {}
    try { healContaminatedThreads(); healThreadsV3(); healThreadsV4(); healThreadsV5(); } catch (e) {}
    try { patchChatList(); hookStoreSet(); } catch (e) {}
    // app-02 体积大、加载在后，延迟再 patch 一次兜底
    setTimeout(function () { try { rescueUserPersonaAlways(); patchChatList(); injectAssistantRow(); hookStoreSet(); healContaminatedThreads(); healThreadsV3(); healThreadsV4(); healThreadsV5(); } catch (e) {} }, 400);
    setTimeout(function () { try { rescueUserPersonaAlways(); patchChatList(); injectAssistantRow(); hookStoreSet(); healContaminatedThreads(); healThreadsV3(); healThreadsV4(); healThreadsV5(); if (typeof renderOfflineCharList === 'function') renderOfflineCharList(); } catch (e) {} }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.WA = WA;
})();