/* ============================================================
 * rua小手机 · 同人论坛「小说」长篇连载模块（v115 新增，独立文件，零侵入）
 *  - 入口：同人论坛首页与「文章/捡手机/论坛体」并列的第 4 张卡「小说」
 *  - 流程：书架 → 创作向导(类型/视角/聚焦/配角/篇幅) → 大纲+人物谱 → 分章节写作(生成/续写/重写/手编) → 书架/导出
 *  - 男女主沿用同人论坛既有配对（第一主角=选中角色；第二主角=选中的用户人设账号）
 *  - 明确【不注入全局世界书 config.worldBooks】，也不改动现有 article/phone/forum 三类型
 *  - 按世界隔离存储：df_stories_<worldId>
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  /* ---------------- 常量：可选项（用户可自定义类型） ---------------- */
  var STORY_GENRES = ['玄幻修仙', '都市现实', '悬疑推理', '末世生存', '校园青春', '古言宫斗', '科幻未来', '无限流', '恐怖灵异', '武侠江湖', '娱乐圈', '电竞', '西幻奇幻', '年代文', '群像现实'];
  var POVS = [
    { id: 'third', name: '第三人称上帝视角' },
    { id: 'multi', name: '群像多视角切换' },
    { id: 'male1', name: '男主第一人称' },
    { id: 'female1', name: '女主第一人称' },
    { id: 'alt', name: '双主角视角交替' }
  ];
  var FOCUSES = [
    { id: 'pair', name: '以你俩为主', desc: '世界与配角作背景，主线仍是两人' },
    { id: 'semi', name: '半群像', desc: '你俩是主线，配角有独立支线' },
    { id: 'ensemble', name: '大群像', desc: '多线并行，你俩只是其中一线' }
  ];
  var CHAPTER_PLANS = [5, 10, 15, 20, 30];
  var CHAPTER_WORDS = [1200, 2000, 3000, 4000];
  var AI_ADD_OPTS = [0, 2, 4, 6, 8];

  var storyState = { stage: 'shelf', draft: null, book: null, busy: false, customGenres: [] };

  /* ---------------- 基础工具 ---------------- */
  function gid(id) { return document.getElementById(id); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) { try { if (typeof forumToast === 'function') return forumToast(msg); } catch (e) {} try { if (typeof showToast === 'function') return showToast(msg); } catch (e) {} }
  function wid() { try { return (config.waSession && config.waSession.worldId) || 'default'; } catch (e) { return 'default'; } }
  function storeKey() { return 'df_stories_' + wid(); }
  function loadAll() {
    try { var v = _dfStore.get(storeKey(), []); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveAll(arr) { try { _dfStore.set(storeKey(), arr); } catch (e) {} }
  function upsert(book) {
    var arr = loadAll(), idx = -1;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === book.id) { idx = i; break; }
    book.updatedAt = Date.now();
    if (idx >= 0) arr[idx] = book; else { book.createdAt = book.createdAt || Date.now(); arr.unshift(book); }
    saveAll(arr);
  }
  function removeBook(id) { saveAll(loadAll().filter(function (b) { return b.id !== id; })); }
  function findBook(id) { return loadAll().filter(function (b) { return b.id === id; })[0] || null; }
  function uid() { return 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* 第一主角（沿用同人论坛选中角色） */
  function leadChar() {
    try {
      var c = (typeof dfSelectedChar === 'function') ? dfSelectedChar() : null;
      if (c && c.name) return { id: c.id != null ? String(c.id) : '', name: c.name || '选择角色', prompt: c.prompt || c.persona || '' };
    } catch (e) {}
    return { id: '', name: '选择角色', prompt: '' };
  }
  /* 第二主角（沿用同人论坛选中的用户人设账号；可在向导切换） */
  function secondLead() {
    try {
      var p = (typeof dfGetUserPersona === 'function') ? dfGetUserPersona() : null;
      var accId = (dfState && dfState.selectedUserAccId) ? String(dfState.selectedUserAccId) : '';
      if (p) return { id: accId, name: p.nickname || '用户', bio: p.bio || '', relations: p.relations || '' };
    } catch (e) {}
    return { id: '', name: '用户', bio: '', relations: '' };
  }
  /* 当前世界真实角色（排除镜像/生活圈NPC与第一主角），供“配角勾选” */
  function worldChars() {
    var out = [], lead = leadChar(), w = wid();
    try {
      (config.characters || []).forEach(function (x) {
        if (!x || x._waMirror || x._waLife) return;
        if ((x.worldId || 'default') !== w) return;
        if (lead.id && String(x.id) === lead.id) return;
        out.push({ id: String(x.id), name: x.name || '未命名', persona: (x.persona || '').slice(0, 220) });
      });
    } catch (e) {}
    return out;
  }
  /* 第一主角生活圈里的联系人/群（来自 world-accounts 生成结果） */
  function lifeContacts() {
    var out = [], lead = leadChar();
    try {
      var ch = (config.characters || []).filter(function (x) { return lead.id ? String(x.id) === lead.id : false; })[0];
      var lc = ch && ch.lifeCircle;
      if (lc) {
        (lc.contacts || []).forEach(function (c) { out.push({ kind: '联系人', name: c.name, desc: [c.circle, c.relation].filter(Boolean).join('·') }); });
        (lc.groups || []).forEach(function (g) { out.push({ kind: '群', name: g.name, desc: ((g.members || []).slice(0, 8).join('、')) }); });
      }
    } catch (e) {}
    return out;
  }

  function newDraft() {
    var lead = leadChar(), sec = secondLead();
    return {
      lead: lead, second: sec,
      genres: [], pov: 'third', focus: 'semi',
      selWorld: [], selLife: [], aiAdd: 2, manual: [],
      seed: '', chapterPlan: 10, chapterWords: 2000,
      /* 大纲产物 */
      outline: null, rawOutline: '', outlineErr: ''
    };
  }

  /* ---------------- 页面容器与样式 ---------------- */
  function ensurePage() {
    var pages = gid('dfPages');
    if (!pages) return null;
    var page = gid('dfStoryPage');
    if (!page) {
      page = document.createElement('div');
      page.className = 'df-page';
      page.id = 'dfStoryPage';
      pages.appendChild(page);
      page.addEventListener('click', onDelegatedClick);
      page.addEventListener('input', onDelegatedInput);
      page.addEventListener('change', onDelegatedChange);
    }
    injectStyle();
    return page;
  }
  var STYLE_INJECTED = false;
  function injectStyle() {
    if (STYLE_INJECTED || gid('styCss')) return;
    var css = ''
      + '.sty-wrap{padding:12px 12px 90px;color:#5b3a4a;font-size:14px;}'
      + '.sty-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;}'
      + '.sty-back{border:0;background:#FFF0F5;color:#F5A0B8;font-weight:700;border-radius:999px;padding:7px 14px;font-size:13px;}'
      + '.sty-h{font-size:18px;font-weight:800;color:#7a4a60;flex:1;text-align:center;}'
      + '.sty-card{background:#fff;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 10px rgba(245,160,184,.08);}'
      + '.sty-label{font-size:13px;font-weight:800;color:#a87b8c;margin-bottom:8px;}'
      + '.sty-chips{display:flex;flex-wrap:wrap;gap:8px;}'
      + '.sty-chip{padding:7px 13px;border-radius:999px;background:#FFF6FA;border:1px solid rgba(245,160,184,.25);color:#c0708f;font-size:13px;font-weight:600;}'
      + '.sty-chip.sel{background:linear-gradient(135deg,#F5A0B8,#FFC7D9);color:#fff;border-color:transparent;}'
      + '.sty-opt{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;background:#FFF6FA;border:1px solid rgba(245,160,184,.2);margin-bottom:8px;}'
      + '.sty-opt.sel{background:linear-gradient(135deg,#ffe3ee,#fff4f8);border-color:#F5A0B8;}'
      + '.sty-opt-n{font-weight:700;color:#9a5a76;font-size:14px;}'
      + '.sty-opt-d{font-size:12px;color:#b48a9c;}'
      + '.sty-row{display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px dashed #ffe0ec;}'
      + '.sty-row:last-child{border-bottom:0;}'
      + '.sty-row input[type=checkbox]{width:17px;height:17px;accent-color:#F5A0B8;}'
      + '.sty-row-n{font-weight:700;color:#6f4658;font-size:13.5px;}'
      + '.sty-row-d{font-size:12px;color:#ab8896;}'
      + '.sty-ta{width:100%;box-sizing:border-box;border:1px solid rgba(245,160,184,.25);border-radius:12px;padding:10px;font-size:13.5px;color:#5b3a4a;background:#FFFCFD;outline:none;resize:vertical;font-family:inherit;}'
      + '.sty-inp{border:1px solid rgba(245,160,184,.25);border-radius:10px;padding:8px 10px;font-size:13px;color:#5b3a4a;background:#FFFCFD;outline:none;}'
      + '.sty-btn{border:0;border-radius:14px;padding:12px 16px;font-size:14px;font-weight:800;background:linear-gradient(135deg,#F5A0B8,#FFC7D9);color:#fff;box-shadow:0 4px 12px rgba(245,160,184,.25);}'
      + '.sty-btn.ghost{background:#FFF0F5;color:#c0708f;box-shadow:none;}'
      + '.sty-btn.gray{background:#f1eef0;color:#8a7882;box-shadow:none;}'
      + '.sty-btn.block{display:block;width:100%;}'
      + '.sty-btn:disabled{opacity:.55;}'
      + '.sty-bar{display:flex;gap:10px;margin-top:6px;}'
      + '.sty-bar>*{flex:1;}'
      + '.sty-lead{display:flex;gap:10px;align-items:center;}'
      + '.sty-ava{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#F5A0B8,#C9A7E8);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:16px;flex:0 0 auto;overflow:hidden;}'
      + '.sty-ava img{width:100%;height:100%;object-fit:cover;}'
      + '.sty-lead-m{flex:1;min-width:0;}'
      + '.sty-lead-n{font-weight:800;color:#6f4658;font-size:14px;}'
      + '.sty-lead-b{font-size:12px;color:#ab8896;line-height:1.4;}'
      + '.sty-x{color:#F5A0B8;font-weight:800;padding:0 4px;}'
      + '.sty-book{background:#fff;border-radius:14px;padding:13px;margin-bottom:10px;box-shadow:0 2px 8px rgba(245,160,184,.08);}'
      + '.sty-book-t{font-weight:800;font-size:15px;color:#6f4658;}'
      + '.sty-book-m{font-size:12px;color:#ab8896;margin:4px 0 8px;}'
      + '.sty-tag{display:inline-block;font-size:11px;background:#FFF0F5;color:#c0708f;border-radius:999px;padding:2px 9px;margin:0 6px 4px 0;}'
      + '.sty-prog{height:6px;border-radius:999px;background:#ffe8f1;overflow:hidden;margin:6px 0;}'
      + '.sty-prog>i{display:block;height:100%;background:linear-gradient(135deg,#F5A0B8,#FFC7D9);}'
      + '.sty-outline-sec{font-size:13.5px;line-height:1.7;color:#5b3a4a;white-space:pre-wrap;}'
      + '.sty-chlist{max-height:46vh;overflow:auto;border:1px solid #ffe0ec;border-radius:12px;}'
      + '.sty-chitem{display:flex;gap:8px;align-items:center;padding:9px 11px;border-bottom:1px dashed #ffe0ec;}'
      + '.sty-chitem:last-child{border-bottom:0;}'
      + '.sty-chitem.cur{background:#fff2f7;}'
      + '.sty-chitem .n{width:24px;height:24px;border-radius:50%;background:#FFE0EC;color:#c0708f;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}'
      + '.sty-chitem.done .n{background:#bfe8c9;color:#2f8a4d;}'
      + '.sty-chitem-m{flex:1;min-width:0;}'
      + '.sty-chitem-t{font-size:13.5px;font-weight:700;color:#6f4658;}'
      + '.sty-chitem-b{font-size:11.5px;color:#ab8896;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.sty-write-layout{display:flex;flex-direction:column;gap:10px;}'
      + '.sty-wc{font-size:12px;color:#ab8896;text-align:right;}'
      + '.sty-loading{padding:24px;text-align:center;color:#c0708f;font-size:14px;}'
      + '.sty-err{background:#fff0f0;border:1px solid #ffc9c9;color:#c05555;border-radius:10px;padding:10px;font-size:12.5px;margin-top:8px;line-height:1.6;}'
      + '.sty-mini{font-size:12px;color:#ab8896;}'
      + '.sty-manual-row{display:flex;gap:8px;margin-bottom:8px;}'
      + '.sty-manual-row .sty-inp{flex:1;}'
      + '.sty-icobtn{border:0;background:#FFF0F5;color:#c0708f;border-radius:10px;padding:8px 10px;font-size:12.5px;font-weight:700;}';
    var st = document.createElement('style'); st.id = 'styCss'; st.textContent = css; document.head.appendChild(st);
    STYLE_INJECTED = true;
  }

  function enterPage() {
    try { if (typeof dfSwitchPage === 'function') dfSwitchPage('dfStoryPage'); } catch (e) {}
    var pages = gid('dfPages'); if (pages) Array.prototype.forEach.call(pages.querySelectorAll('.df-page'), function (p) { p.classList.toggle('active', p.id === 'dfStoryPage'); });
    try { var tn = document.querySelector('.df-tag-nav'); if (tn) tn.style.display = 'none'; } catch (e) {}
    try { var bn = document.querySelector('.df-bottom-nav'); if (bn) bn.style.display = 'none'; } catch (e) {}
  }
  function leavePage() {
    try { var tn = document.querySelector('.df-tag-nav'); if (tn) tn.style.display = ''; } catch (e) {}
    try { var bn = document.querySelector('.df-bottom-nav'); if (bn) bn.style.display = ''; } catch (e) {}
    try { if (typeof dfSwitchPage === 'function') dfSwitchPage('dfHomePage'); } catch (e) {}
  }

  function render() {
    var page = ensurePage(); if (!page) return;
    enterPage();
    if (storyState.stage === 'wizard') page.innerHTML = viewWizard();
    else if (storyState.stage === 'outline') page.innerHTML = viewOutline();
    else if (storyState.stage === 'write') page.innerHTML = viewWrite();
    else page.innerHTML = viewShelf();
    page.scrollTop = 0;
  }

  /* ---------------- 书架 ---------------- */
  function viewShelf() {
    var arr = loadAll();
    var list = arr.length ? arr.map(function (b) {
      var done = (b.chapters || []).filter(function (c) { return (c.text || '').trim(); }).length;
      var total = (b.chapters || []).length || 1;
      var pct = Math.round(done / total * 100);
      return '<div class="sty-book">'
        + '<div class="sty-book-t">' + esc(b.title || '未命名小说') + '</div>'
        + '<div class="sty-book-m">' + esc((b.genres || []).join('·') || '未选类型') + '　|　进度 ' + done + '/' + (b.chapters || []).length + ' 章　|　' + new Date(b.updatedAt || Date.now()).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div>'
        + ((b.genres || []).map(function (g) { return '<span class="sty-tag">' + esc(g) + '</span>'; }).join(''))
        + '<div class="sty-prog"><i style="width:' + pct + '%"></i></div>'
        + '<div class="sty-bar"><button class="sty-btn" data-act="ss-open" data-id="' + esc(b.id) + '">继续写</button>'
        + '<button class="sty-btn ghost" data-act="ss-export" data-id="' + esc(b.id) + '">导出txt</button>'
        + '<button class="sty-btn gray" data-act="ss-del" data-id="' + esc(b.id) + '">删除</button></div>'
        + '</div>';
    }).join('') : '<div class="sty-card" style="text-align:center;color:#ab8896;padding:34px 16px">这个世界还没有小说<br><span class="sty-mini">点下方按钮，选角色当男女主，开一本长篇</span></div>';
    return '<div class="sty-wrap">'
      + '<div class="sty-top"><button class="sty-back" data-act="ss-back">‹ 返回同人论坛</button><div class="sty-h">我的小说</div><span style="width:84px"></span></div>'
      + list
      + '<button class="sty-btn block" data-act="ss-new" style="margin-top:8px">＋ 新建小说</button>'
      + '</div>';
  }

  /* ---------------- 创作向导 ---------------- */
  function leadBlock(d) {
    function ava(n, img) { return img ? '<div class="sty-ava"><img src="' + esc(img) + '"></div>' : '<div class="sty-ava">' + esc((n || '?').slice(0, 1)) + '</div>'; }
    var lead = d.lead, sec = d.second;
    var accs = [];
    try { accs = (typeof dfCurrentWorldUserAccs === 'function') ? dfCurrentWorldUserAccs() : []; } catch (e) {}
    var accOpts = '<option value="">当前默认账号</option>' + accs.map(function (a) {
      return '<option value="' + esc(a.id) + '"' + ((d.second.id && String(a.id) === d.second.id) ? ' selected' : '') + '>' + esc(a.personaName || a.name || '账号') + '</option>';
    }).join('');
    return '<div class="sty-card"><div class="sty-label">男女主（沿用同人论坛配对）</div>'
      + '<div class="sty-lead" style="margin-bottom:10px">' + ava(lead.name, '')
      + '<div class="sty-lead-m"><div class="sty-lead-n">男主/女主①：' + esc(lead.name) + '</div>'
      + '<div class="sty-lead-b">' + (esc((lead.prompt || '').slice(0, 60)) || '（无人设）') + '</div></div>'
      + '<button class="sty-icobtn" data-act="sg-pick-lead">更换</button></div>'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="sty-mini">男主/女主②（用户人设）：</span>'
      + '<select class="sty-inp" data-act="sg-acc" style="flex:1">' + accOpts + '</select></div>'
      + '<div class="sty-lead">' + ava(sec.name, '')
      + '<div class="sty-lead-m"><div class="sty-lead-n">' + esc(sec.name) + '</div><div class="sty-lead-b">' + (esc((sec.bio || '').slice(0, 80)) || '（无人设）') + '</div></div></div>'
      + '</div>';
  }
  function viewWizard() {
    var d = storyState.draft || (storyState.draft = newDraft());
    /* 类型（预设+自定义） */
    var allGenres = STORY_GENRES.concat(storyState.customGenres.filter(function (g) { return STORY_GENRES.indexOf(g) < 0; }));
    var genreChips = allGenres.map(function (g) {
      var sel = d.genres.indexOf(g) >= 0 ? ' sel' : '';
      return '<span class="sty-chip' + sel + '" data-act="sg-genre" data-v="' + esc(g) + '">' + esc(g) + '</span>';
    }).join('') + '<span class="sty-chip" data-act="sg-add-genre">＋自定义</span>';
    /* 视角 */
    var povs = POVS.map(function (p) {
      return '<div class="sty-opt' + (d.pov === p.id ? ' sel' : '') + '" data-act="sg-pov" data-v="' + p.id + '"><span class="sty-opt-n">' + esc(p.name) + '</span></div>';
    }).join('');
    /* 聚焦 */
    var focuses = FOCUSES.map(function (f) {
      return '<div class="sty-opt' + (d.focus === f.id ? ' sel' : '') + '" data-act="sg-focus" data-v="' + f.id + '"><span class="sty-opt-n">' + esc(f.name) + '</span><span class="sty-opt-d">' + esc(f.desc) + '</span></div>';
    }).join('');
    /* 配角：世界角色 */
    var wc = worldChars();
    var worldRows = wc.length ? wc.map(function (c) {
      var ck = d.selWorld.indexOf(c.id) >= 0;
      return '<label class="sty-row"><input type="checkbox" data-act="sg-world" data-v="' + esc(c.id) + '"' + (ck ? ' checked' : '') + '><div><div class="sty-row-n">' + esc(c.name) + '</div><div class="sty-row-d">' + esc((c.persona || '').slice(0, 48)) + '</div></div></label>';
    }).join('') : '<div class="sty-mini">当前世界没有其他角色可选（可在下方让 AI 补，或手动加）</div>';
    /* 配角：生活圈 */
    var lc = lifeContacts();
    var lifeRows = lc.length ? lc.map(function (c) {
      var ck = d.selLife.indexOf(c.name) >= 0;
      return '<label class="sty-row"><input type="checkbox" data-act="sg-life" data-v="' + esc(c.name) + '"' + (ck ? ' checked' : '') + '><div><div class="sty-row-n">[' + esc(c.kind) + '] ' + esc(c.name) + '</div><div class="sty-row-d">' + esc((c.desc || '').slice(0, 48)) + '</div></div></label>';
    }).join('') : '<div class="sty-mini">该角色还没有生活圈（生成生活圈后这里能勾选家人/同事/朋友）</div>';
    var aiSeg = AI_ADD_OPTS.map(function (n) { return '<span class="sty-chip' + (d.aiAdd === n ? ' sel' : '') + '" data-act="sg-aiadd" data-v="' + n + '">AI补' + n + '个</span>'; }).join('');
    var manualRows = d.manual.map(function (m, i) {
      return '<div class="sty-manual-row"><input class="sty-inp" placeholder="配角名" data-act="sg-mname" data-i="' + i + '" value="' + esc(m.name) + '"><input class="sty-inp" placeholder="一句话设定" data-act="sg-mdesc" data-i="' + i + '" value="' + esc(m.desc) + '" style="flex:2"><button class="sty-icobtn" data-act="sg-mdel" data-i="' + i + '">删</button></div>';
    }).join('');
    var planSeg = CHAPTER_PLANS.map(function (n) { return '<span class="sty-chip' + (d.chapterPlan === n ? ' sel' : '') + '" data-act="sg-plan" data-v="' + n + '">' + n + '章</span>'; }).join('');
    var wordSeg = CHAPTER_WORDS.map(function (n) { return '<span class="sty-chip' + (d.chapterWords === n ? ' sel' : '') + '" data-act="sg-words" data-v="' + n + '">' + n + '字/章</span>'; }).join('');

    return '<div class="sty-wrap">'
      + '<div class="sty-top"><button class="sty-back" data-act="sg-back">‹ 返回</button><div class="sty-h">新建小说</div><span style="width:54px"></span></div>'
      + leadBlock(d)
      + '<div class="sty-card"><div class="sty-label">① 小说类型（可多选，可自定义）</div><div class="sty-chips">' + genreChips + '</div></div>'
      + '<div class="sty-card"><div class="sty-label">② 叙事视角</div>' + povs + '</div>'
      + '<div class="sty-card"><div class="sty-label">③ 主角聚焦度</div>' + focuses + '</div>'
      + '<div class="sty-card"><div class="sty-label">④ 配角（你自己挑，自由组合）</div>'
      + '<div class="sty-label" style="color:#c0708f">当前世界的其他角色</div>' + worldRows
      + '<div class="sty-label" style="color:#c0708f;margin-top:10px">第一主角生活圈里的人</div>' + lifeRows
      + '<div class="sty-label" style="color:#c0708f;margin-top:10px">让 AI 按类型再补配角</div><div class="sty-chips">' + aiSeg + '</div>'
      + '<div class="sty-label" style="color:#c0708f;margin-top:10px">手动加配角</div>' + manualRows
      + '<button class="sty-btn ghost" data-act="sg-madd" style="margin-top:4px">＋ 加一个手动配角</button></div>'
      + '<div class="sty-card"><div class="sty-label">⑤ 故事种子与篇幅（种子可留空，AI 自定）</div>'
      + '<textarea class="sty-ta" rows="3" placeholder="一句话梗概/想要的开局或梗，留空让AI自由发挥" data-act="sg-seed">' + esc(d.seed) + '</textarea>'
      + '<div class="sty-label" style="margin-top:10px">计划章节数</div><div class="sty-chips" style="margin-bottom:10px">' + planSeg + '</div>'
      + '<div class="sty-label">每章大致字数</div><div class="sty-chips">' + wordSeg + '</div></div>'
      + '<button class="sty-btn block" data-act="sg-gen-outline" ' + (storyState.busy ? 'disabled' : '') + '>' + (storyState.busy ? '正在生成大纲…' : '✦ 生成故事大纲与人物谱') + '</button>'
      + (d.outlineErr ? '<div class="sty-err">' + esc(d.outlineErr) + '</div>' : '')
      + '</div>';
  }

  /* ---------------- 大纲与人物谱 ---------------- */
  function viewOutline() {
    var d = storyState.draft, o = d.outline;
    if (!o) return '<div class="sty-wrap"><div class="sty-loading">大纲数据丢失，请返回重试</div></div>';
    var roster = (o.roster || []).map(function (r) {
      return '<div class="sty-row" style="display:block"><span class="sty-row-n">' + esc(r.name) + '（' + esc(r.role || '角色') + '）</span><div class="sty-row-d">' + esc(r.desc || '') + (r.arc ? '　弧光：' + esc(r.arc) : '') + '</div></div>';
    }).join('') || '<div class="sty-mini">（人物谱为空）</div>';
    var chs = (o.chapters || []).map(function (c) {
      return '<div class="sty-chitem"><div class="n">' + (c.i || 0) + '</div><div class="sty-chitem-m"><div class="sty-chitem-t">' + esc(c.title || '') + '</div><div class="sty-chitem-b">' + esc(c.brief || '') + '</div></div></div>';
    }).join('');
    return '<div class="sty-wrap">'
      + '<div class="sty-top"><button class="sty-back" data-act="so-back">‹ 返回修改</button><div class="sty-h">大纲与人物谱</div><span style="width:72px"></span></div>'
      + '<div class="sty-card"><div class="sty-label">书名（可改）</div><input class="sty-inp" style="width:100%;box-sizing:border-box" data-act="so-title" value="' + esc(o.title || '') + '"></div>'
      + '<div class="sty-card"><div class="sty-label">世界背景</div><div class="sty-outline-sec">' + esc(o.worldview || '') + '</div></div>'
      + '<div class="sty-card"><div class="sty-label">一句话主线</div><div class="sty-outline-sec">' + esc(o.logline || '') + '</div></div>'
      + '<div class="sty-card"><div class="sty-label">人物谱（' + (o.roster || []).length + '人）</div>' + roster + '</div>'
      + '<div class="sty-card"><div class="sty-label">章节规划（' + (o.chapters || []).length + '章）</div><div class="sty-chlist">' + chs + '</div></div>'
      + '<div class="sty-card"><div class="sty-label">想手动微调？可直接改下方原始大纲（JSON），改完点“重新解析”</div>'
      + '<textarea class="sty-ta" rows="6" data-act="so-raw">' + esc(d.rawOutline || '') + '</textarea></div>'
      + '<div class="sty-bar"><button class="sty-btn ghost" data-act="so-roll"' + (storyState.busy ? ' disabled' : '') + '>重新生成</button>'
      + '<button class="sty-btn gray" data-act="so-parse">重新解析</button></div>'
      + '<button class="sty-btn block" style="margin-top:10px" data-act="so-confirm">确认大纲，开始分章写作 →</button>'
      + '</div>';
  }

  /* ---------------- 写作台 ---------------- */
  function curChapterIdx(book) {
    var i = (book && book._cur) || 0;
    if (!book.chapters || !book.chapters.length) return 0;
    return Math.max(0, Math.min(i, book.chapters.length - 1));
  }
  function viewWrite() {
    var b = storyState.book; if (!b) return viewShelf();
    var ci = curChapterIdx(b), ch = b.chapters[ci] || { title: '', brief: '', text: '' };
    var list = b.chapters.map(function (c, i) {
      var done = (c.text || '').trim();
      return '<div class="sty-chitem' + (i === ci ? ' cur' : '') + (done ? ' done' : '') + '" data-act="sw-pick" data-i="' + i + '">'
        + '<div class="n">' + (done ? '✓' : (i + 1)) + '</div>'
        + '<div class="sty-chitem-m"><div class="sty-chitem-t">第' + (i + 1) + '章 · ' + esc(c.title || '') + '</div><div class="sty-chitem-b">' + esc((c.brief || '').slice(0, 30)) + '</div></div></div>';
    }).join('');
    var wc = (ch.text || '').replace(/\s/g, '').length;
    return '<div class="sty-wrap">'
      + '<div class="sty-top"><button class="sty-back" data-act="sw-shelf">‹ 书架</button><div class="sty-h" style="font-size:15px">' + esc(b.title || '未命名') + '</div><span style="width:54px"></span></div>'
      + '<div class="sty-card"><div class="sty-label">章节目录（点选）</div><div class="sty-chlist">' + list + '</div></div>'
      + '<div class="sty-card sty-write-layout">'
      + '<div class="sty-label">第' + (ci + 1) + '章 · ' + esc(ch.title || '') + '</div>'
      + '<div class="sty-mini">本章概要：' + esc(ch.brief || '') + '</div>'
      + '<textarea class="sty-ta" rows="16" data-act="sw-text" placeholder="点下方按钮由AI生成，也可以自己直接写">' + esc(ch.text || '') + '</textarea>'
      + '<div class="sty-wc">正文约 ' + wc + ' 字（目标 ' + b.chapterWords + ' 字/章）</div>'
      + '<div class="sty-bar"><button class="sty-btn" data-act="sw-gen"' + (storyState.busy ? ' disabled' : '') + '>' + ((ch.text || '').trim() ? '重写本章' : '生成本章') + '</button>'
      + '<button class="sty-btn ghost" data-act="sw-cont"' + (storyState.busy ? ' disabled' : '') + '>续写本章</button></div>'
      + '<div class="sty-bar"><button class="sty-btn gray" data-act="sw-prev">‹ 上一章</button><button class="sty-btn" data-act="sw-save">保存</button><button class="sty-btn gray" data-act="sw-next">下一章 ›</button></div>'
      + (storyState.busy ? '<div class="sty-loading">AI 写作中，请稍候…</div>' : '')
      + (b._writeErr ? '<div class="sty-err">' + esc(b._writeErr) + '</div>' : '')
      + '</div></div>';
  }

  /* ============== AI：大纲 ============== */
  function extractJson(text) {
    var s = String(text || '').replace(/^```json\s*/i, '').replace(/```$/g, '').replace(/^```\s*/, '').trim();
    try { return JSON.parse(s); } catch (e) {}
    var a = s.indexOf('{'), z = s.lastIndexOf('}');
    if (a >= 0 && z > a) { try { return JSON.parse(s.slice(a, z + 1)); } catch (e2) {} }
    return null;
  }
  function rosterTextOf(d) {
    var lines = [];
    var lead = d.lead, sec = d.second;
    lines.push('· ' + lead.name + '：第一主角（用户选定的角色）。人设：' + (lead.prompt || '（按名字合理设定）').slice(0, 600));
    lines.push('· ' + sec.name + '：第二主角（用户人设）。' + (sec.bio || '').slice(0, 400) + (sec.relations ? '　与第一主角关系设定：' + String(sec.relations).slice(0, 300) : ''));
    worldChars().forEach(function (c) { if (d.selWorld.indexOf(c.id) >= 0) lines.push('· ' + c.name + '：配角（已有角色）。' + (c.persona || '').slice(0, 300)); });
    lifeContacts().forEach(function (c) { if (d.selLife.indexOf(c.name) >= 0) lines.push('· ' + c.name + '：配角（第一主角生活圈里的' + c.kind + '，' + (c.desc || '') + '）'); });
    (d.manual || []).forEach(function (m) { if (m && m.name) lines.push('· ' + m.name + '：手动指定配角，' + (m.desc || '由你合理设定')); });
    return lines.join('\n');
  }
  function buildOutlinePrompt(d) {
    var focusName = ((FOCUSES.filter(function (f) { return f.id === d.focus; })[0] || {}).name) || '';
    var povName = ((POVS.filter(function (p) { return p.id === d.pov; })[0] || {}).name) || '';
    var p = '你是资深长篇小说策划与主编。请根据下列设定，策划一本【' + (d.genres.join('、') || '不限类型') + '】长篇小说，并输出严格的 JSON。\n\n';
    p += '【叙事视角】' + povName + '\n';
    p += '【主角聚焦度】' + focusName + '（' + (d.focus === 'pair' ? '以两位主角为主线，世界与配角服务于两人' : d.focus === 'semi' ? '两位主角是主线，但重要配角要有自己的支线与处境' : '多线群像，两位主角只是众多线索之一，世界和众生相要立体') + '）\n';
    p += '【已有角色（必须沿用，名字与人设不得改）】\n' + rosterTextOf(d) + '\n';
    p += '【需要你新造的配角数量】' + d.aiAdd + ' 个（按类型与剧情需要补：反派/亲友/师长/对手/功能性人物等，不要和已有角色重名；若为0则不新造）\n';
    if (d.seed && d.seed.trim()) p += '【用户给定的故事种子】' + d.seed.trim() + '\n';
    p += '【计划章节数】' + d.chapterPlan + ' 章。\n\n';
    p += '硬性要求：\n';
    p += '1. 这是长篇小说，不是只围着两位主角谈恋爱的短篇：要有自洽的世界/行业/社会规则、有配角与支线、有起承转合，两位主角是主线人物而非世界的全部。\n';
    p += '2. roster 必须包含两位主角 + 上面所有“已有角色”中被选中的 + 你新造的配角，每人给 role/desc/arc。\n';
    p += '3. chapters 必须正好 ' + d.chapterPlan + ' 章，每章 i 从1递增，title 为章名，brief 写清本章主要事件、出场人物、推进哪条线。\n';
    p += '4. 只输出 JSON，不要 markdown、不要解释、不要 JSON 之外的字。结构：\n';
    p += '{"title":"书名","worldview":"本作世界/社会/规则背景，200-400字","logline":"一句话主线","roster":[{"name":"","role":"男主/女主/反派/朋友等定位","desc":"身份性格","arc":"人物弧光或支线"}],"chapters":[{"i":1,"title":"","brief":""}]}';
    return p;
  }
  async function genOutline() {
    var d = storyState.draft;
    if (!d.lead.name || d.lead.name === '选择角色') { toast('请先在同人论坛选好第一主角（角色）'); return; }
    if (!d.genres.length) { toast('请至少选择一个小说类型'); return; }
    storyState.busy = true; d.outlineErr = ''; render();
    try {
      var raw = await dfCallApi(buildOutlinePrompt(d), { temperature: 0.9, maxTokens: 7000, timeout: 300000 });
      var obj = extractJson(raw);
      if (!obj || !Array.isArray(obj.chapters) || !obj.chapters.length) { d.outlineErr = '大纲解析失败：AI 没返回合法 JSON。可点重新生成，或在下一步把原始内容贴进文本框重新解析。'; d.rawOutline = String(raw || '').slice(0, 6000); storyState.busy = false; storyState.stage = 'outline'; render(); return; }
      /* 规整 */
      obj.chapters = obj.chapters.filter(function (c) { return c && (c.title || c.brief); }).map(function (c, i) { return { i: i + 1, title: String(c.title || ('第' + (i + 1) + '章')), brief: String(c.brief || ''), text: '' }; });
      obj.roster = Array.isArray(obj.roster) ? obj.roster : [];
      d.outline = obj; d.rawOutline = JSON.stringify(obj, null, 2);
      storyState.stage = 'outline';
    } catch (e) {
      d.outlineErr = '生成失败：' + ((e && e.message) || e) + '。检查 API 配置后可重试。';
    } finally { storyState.busy = false; }
    render();
  }

  /* ============== AI：章节正文 ============== */
  function buildChapterPrompt(b, ci, mode) {
    var ch = b.chapters[ci];
    var povName = ((POVS.filter(function (p) { return p.id === b.pov; })[0] || {}).name) || '第三人称';
    var before = [];
    for (var i = 0; i < ci; i++) {
      var c = b.chapters[i];
      before.push('第' + (i + 1) + '章 ' + (c.title || '') + '：' + (c.brief || '') + ((c.text || '').trim() ? '（已写，结尾：' + String(c.text).replace(/\s/g, '').slice(-220) + '）' : '（未写）'));
    }
    var prevEnd = ci > 0 ? String(b.chapters[ci - 1].text || '').replace(/\s+/g, ' ').slice(-800) : '';
    var roster = (b.roster || []).map(function (r) { return '· ' + r.name + '（' + (r.role || '角色') + '）：' + (r.desc || ''); }).join('\n');
    var p = '你在写长篇小说《' + (b.title || '') + '》的第 ' + (ci + 1) + ' 章。\n\n';
    p += '【类型】' + (b.genres || []).join('、') + '\n【叙事视角】' + povName + '\n【主角聚焦度】' + (b.focus === 'pair' ? '以两位主角为主' : b.focus === 'semi' ? '双主角主线+配角支线' : '多线群像') + '\n';
    p += '【世界背景】' + (b.worldview || '') + '\n';
    p += '【人物谱】\n' + (roster || '（见正文）') + '\n';
    p += '【第二主角名】' + (b.secondName || '') + '，第一主角名 ' + (b.leadName || '') + '，两位都是主角，名字都要自然出现，不要只写其中一个。\n';
    if (before.length) p += '【前情进度】\n' + before.join('\n') + '\n';
    if (prevEnd) p += '【上一章结尾（务必自然衔接，不要重复）】\n' + prevEnd + '\n';
    p += '【本章】第' + (ci + 1) + '章 ' + (ch.title || '') + '\n本章概要：' + (ch.brief || '') + '\n';
    if (mode === 'continue') {
      p += '【本章已写内容（在其后自然续写，不要重复、不要回退剧情）】\n' + String(ch.text || '').slice(-1600) + '\n请直接输出【续写部分】正文。\n';
    } else if (mode === 'regen') {
      p += '请按概要【重新完整写】这一章。\n';
    } else {
      p += '请写出本章完整正文。\n';
    }
    p += '写作要求：1) 只输出小说正文，不要输出章节标题、解说、大纲或 JSON；2) 约 ' + b.chapterWords + ' 字，可分场景、有环境与配角、有对话和细节，不要全程只写两位主角互动；3) 人物名、设定与人物谱/前情保持一致，不要串名、不要崩人设；4) 文学化、有画面感，避免 AI 腔。';
    return p;
  }
  async function genChapter(ci, mode) {
    var b = storyState.book; if (!b) return;
    var ch = b.chapters[ci]; if (!ch) return;
    b._writeErr = ''; storyState.busy = true; render();
    try {
      var txt = await dfCallApi(buildChapterPrompt(b, ci, mode), { temperature: 0.92, maxTokens: 5000, timeout: 300000 });
      txt = String(txt || '').replace(/^```[\s\S]*?\n/, '').replace(/```$/g, '').trim();
      if (mode === 'continue') ch.text = String(ch.text || '') + '\n' + txt;
      else ch.text = txt;
      upsert(b);
    } catch (e) { b._writeErr = '写作失败：' + ((e && e.message) || e); }
    finally { storyState.busy = false; }
    render();
  }

  /* ============== 确认大纲 → 建书 ============== */
  function confirmOutline() {
    var d = storyState.draft, o = d.outline; if (!o) return;
    var book = {
      id: uid(), wid: wid(),
      title: o.title || '未命名小说',
      genres: d.genres.slice(), pov: d.pov, focus: d.focus,
      leadName: d.lead.name, secondName: d.second.name,
      worldview: o.worldview || '', logline: o.logline || '',
      roster: o.roster || [],
      chapters: (o.chapters || []).map(function (c) { return { i: c.i, title: c.title, brief: c.brief, text: '' }; }),
      chapterWords: d.chapterWords, _cur: 0,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    upsert(book); storyState.book = book; storyState.stage = 'write'; render();
    toast('已创建，开始写第 1 章吧');
  }

  /* ============== 导出 txt ============== */
  function exportTxt(book) {
    try {
      var t = '《' + (book.title || '未命名小说') + '》\n类型：' + (book.genres || []).join('、') + '\n\n【世界背景】\n' + (book.worldview || '') + '\n\n【一句话主线】' + (book.logline || '') + '\n\n【人物谱】\n'
        + (book.roster || []).map(function (r) { return r.name + '（' + (r.role || '') + '）：' + (r.desc || '') + (r.arc ? '　弧光：' + r.arc : ''); }).join('\n') + '\n\n';
      (book.chapters || []).forEach(function (c, i) {
        t += '\n\n第' + (i + 1) + '章　' + (c.title || '') + '\n\n' + (c.text || '（未写）') + '\n';
      });
      // APK 模式：交给原生保存到手机「下载」目录（WebView 里 a.download 不生效）
      if (window.AndroidFileSaver) {
        try {
          window.AndroidFileSaver.saveTextFile((book.title || '小说') + '.txt', t, 'text/plain;charset=utf-8');
          toast('已导出到下载目录');
          return;
        } catch (err) {}
      }
      var blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (book.title || '小说') + '.txt';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) { toast('导出失败：' + (e.message || e)); }
  }

  /* ============== 事件委托 ============== */
  function toggleIn(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function onDelegatedClick(e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, d = storyState.draft, b = storyState.book;
    try {
      switch (act) {
        /* 书架 */
        case 'ss-back': leavePage(); return;
        case 'ss-new': storyState.draft = newDraft(); storyState.stage = 'wizard'; render(); return;
        case 'ss-open': { var bk = findBook(el.dataset.id); if (bk) { storyState.book = bk; if (typeof bk._cur !== 'number') bk._cur = 0; storyState.stage = 'write'; render(); } return; }
        case 'ss-export': { var b2 = findBook(el.dataset.id); if (b2) exportTxt(b2); return; }
        case 'ss-del': if (confirm('确定删除这本小说？不可恢复。')) { removeBook(el.dataset.id); render(); } return;
        /* 向导 */
        case 'sg-back': storyState.stage = 'shelf'; render(); return;
        case 'sg-pick-lead': try { if (typeof dfOpenCharPicker === 'function') dfOpenCharPicker(); } catch (e2) {} return;
        case 'sg-genre': toggleIn(d.genres, el.dataset.v); render(); return;
        case 'sg-add-genre': { var g = prompt('新增一个小说类型：'); g = String(g || '').trim(); if (g) { if (storyState.customGenres.indexOf(g) < 0) storyState.customGenres.push(g); if (d.genres.indexOf(g) < 0) d.genres.push(g); render(); } return; }
        case 'sg-pov': d.pov = el.dataset.v; render(); return;
        case 'sg-focus': d.focus = el.dataset.v; render(); return;
        case 'sg-world': toggleIn(d.selWorld, el.dataset.v); return;
        case 'sg-life': toggleIn(d.selLife, el.dataset.v); return;
        case 'sg-aiadd': d.aiAdd = Number(el.dataset.v); render(); return;
        case 'sg-madd': d.manual.push({ name: '', desc: '' }); render(); return;
        case 'sg-mdel': d.manual.splice(Number(el.dataset.i), 1); render(); return;
        case 'sg-plan': d.chapterPlan = Number(el.dataset.v); render(); return;
        case 'sg-words': d.chapterWords = Number(el.dataset.v); render(); return;
        case 'sg-gen-outline': genOutline(); return;
        /* 大纲 */
        case 'so-back': storyState.stage = 'wizard'; render(); return;
        case 'so-roll': genOutline(); return;
        case 'so-parse': { var o = extractJson(d.rawOutline); if (o && Array.isArray(o.chapters)) { o.chapters = o.chapters.filter(function (c) { return c; }).map(function (c, i) { return { i: i + 1, title: String(c.title || ''), brief: String(c.brief || ''), text: '' }; }); o.roster = Array.isArray(o.roster) ? o.roster : []; d.outline = o; toast('解析成功'); render(); } else { toast('仍是无效 JSON，请检查格式'); } return; }
        case 'so-confirm': confirmOutline(); return;
        /* 写作 */
        case 'sw-shelf': storyState.stage = 'shelf'; storyState.book = null; render(); return;
        case 'sw-pick': b._cur = Number(el.dataset.i); render(); return;
        case 'sw-prev': b._cur = curChapterIdx(b) - 1; if (b._cur < 0) b._cur = 0; upsert(b); render(); return;
        case 'sw-next': { var mx = b.chapters.length - 1; b._cur = Math.min(mx, curChapterIdx(b) + 1); upsert(b); render(); return; }
        case 'sw-save': upsert(b); toast('已保存'); return;
        case 'sw-gen': genChapter(curChapterIdx(b), (b.chapters[curChapterIdx(b)].text || '').trim() ? 'regen' : 'gen'); return;
        case 'sw-cont': genChapter(curChapterIdx(b), 'continue'); return;
        default: return;
      }
    } catch (err) { toast('操作失败：' + (err.message || err)); }
  }
  function onDelegatedInput(e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, d = storyState.draft, b = storyState.book;
    if (act === 'sg-seed' && d) d.seed = el.value;
    else if (act === 'sg-mname' && d) { var m0 = d.manual[Number(el.dataset.i)]; if (m0) m0.name = el.value; }
    else if (act === 'sg-mdesc' && d) { var m1 = d.manual[Number(el.dataset.i)]; if (m1) m1.desc = el.value; }
    else if (act === 'so-title' && d && d.outline) { d.outline.title = el.value; }
    else if (act === 'so-raw' && d) d.rawOutline = el.value;
    else if (act === 'sw-text' && b) { var ch = b.chapters[curChapterIdx(b)]; if (ch) { ch.text = el.value; } }
  }
  function onDelegatedChange(e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act;
    if (act === 'sg-acc') {
      try { dfState.selectedUserAccId = el.value || null; } catch (e2) {}
      if (storyState.draft) storyState.draft.second = secondLead();
      render();
    }
  }

  /* ============== 入口：首页第 4 张类型卡（非侵入注入） ============== */
  function injectTypeCard() {
    try {
      var grid = document.querySelector('#dfHomeHeader .df-home-type-grid');
      if (!grid) return;
      if (grid.querySelector('[data-story-entry]')) return;
      var card = document.createElement('div');
      card.className = 'df-home-type-card';
      card.setAttribute('data-story-entry', '1');
      card.innerHTML = '<div class="df-home-type-icon">📖</div><div class="df-home-type-name">小说</div><div class="df-home-type-desc">长篇连载</div>';
      grid.appendChild(card);
    } catch (e) {}
  }
  function openHub() { ensurePage(); storyState.stage = 'shelf'; storyState.book = null; render(); }

  function patchHomeRenderer() {
    var tries = 0;
    (function wait() {
      if (typeof dfRenderHomeHeader === 'function') {
        if (!dfRenderHomeHeader.__storyPatched) {
          var orig = dfRenderHomeHeader;
          var wrapped = function () { var r = orig.apply(this, arguments); try { injectTypeCard(); } catch (e) {} return r; };
          wrapped.__storyPatched = true;
          try { window.dfRenderHomeHeader = dfRenderHomeHeader = wrapped; } catch (e) { window.dfRenderHomeHeader = wrapped; }
        }
        injectTypeCard();
      } else if (tries++ < 40) { setTimeout(wait, 250); }
    })();
  }
  /* 点小说卡（document 级委托，避免被 df 自己的类型卡逻辑截走；用独立属性名 data-story-entry） */
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-story-entry]');
    if (!c) return;
    e.preventDefault();
    try {
      /* 同步一次第一主角/第二主角，再进 */
      storyState.draft = newDraft();
      openHub();
    } catch (err) { toast('小说模块打开失败：' + (err.message || err)); }
  }, true);

  /* ============== 初始化 ============== */
  function init() {
    try {
      ensurePage();
      patchHomeRenderer();
      window.storyOpenHub = openHub;   // 调试/外部入口
    } catch (e) { console.warn('[story] init fail', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
