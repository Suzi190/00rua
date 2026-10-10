
// ===== 关系链+照片墙 (relation-photo.js) =====
// ===== INJECTED FROM relation-photo.js =====
/* ============================================================
 * Relation Chain (关系链) + Photo Wall (照片墙)
 * Standalone Client-Side Module for rua小手机
 *
 * Dependencies (must exist in the page before calling init functions):
 *   callApi(messages)  : async, [{role,content}] -> reply string
 *   Store.get(key,def) / Store.set(key,value) : localStorage
 *   escapeHtml(str)    : HTML escape
 *   showToast(msg)     : toast notification
 *   config.characters   : [{id,name,persona,avatar,avatarBg,gender,chatHistory,memories}]
 *   config.user         : {name,wxId,avatar,persona}
 *   config.api          : {baseUrl,apiKey,model}
 *   config.npcs         : optional NPC array
 * ============================================================ */
(function () {
'use strict';

/* ============================================================
 * PART 0 - Shared Helpers
 * ============================================================ */

function rpEscapeHtml(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rpEscapeAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rpSvgEscape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rpToast(msg) {
  if (typeof showToast === 'function') { showToast(msg); return; }
}

function rpEl(id) {
  return document.getElementById(id);
}

function rpFormatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var now = new Date();
  var diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function rpSourceLabel(source) {
  if (source === 'upload') return '上传';
  if (source === 'ai') return 'AI生成';
  if (source === 'memory') return '记忆';
  return '未知';
}

/* Parse JSON from an AI reply string (handles ```json fences and extra text) */
function rpParseJsonReply(reply) {
  if (!reply) return null;
  var cleaned = String(reply)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/g, '')
    .trim();
  var jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch (e) {
    return null;
  }
}


/* ============================================================
 *                    FEATURE 1: 关系链系统
 *                    Relation Chain System
 * ============================================================ */

/* ---- Relationship type colors（低饱和柔和色，配合浅色温柔主题） ---- */
var RC_TYPE_COLORS = {
  '恋人': '#E0708A',
  '暧昧': '#F09BB8',
  '朋友': '#7FA8D8',
  '认识': '#ABA6B0',
  '家人': '#7CC79B'
};

/* ---- Node skin：浅色底 + 同色描边（取代早期深蓝/深紫实心圆，整体更温柔） ---- */
var RC_NODE_SOFT = {
  cur:  { bg: '#FFF2F7', ring: '#F3A3BC', ink: '#C4708F' },
  user: { bg: '#F7F1FD', ring: '#C6A8E8', ink: '#8E6FC0' },
  char: { bg: '#F0F5FD', ring: '#A9C7EA', ink: '#5E80AC' }
};

/* ---- State ---- */
var rcState = {
  initialized: false,
  selectedNode: null,
  generating: false,
  filling: false,
  showPlaceholder: false,
  showOrphan: false,
  detailA: null,
  detailB: null,
  editFrom: null,
  editTo: null,
  editIsNew: false
};

/* ============================================================
 * PART 1 - RELATION CSS
 * ============================================================ */

var RELATION_CSS = `/* ===== 关系链 · 温柔浅色主题（取代早期深色遗留，图谱区不再有黑色底） ===== */
.rc-overlay{position:fixed;inset:0;z-index:200;background:linear-gradient(175deg,#FDF8F5 0%,#FFFCFA 16%,#FFFEFD 46%,#FFFCFA 78%,#FBF6F3 100%);display:none;flex-direction:column;max-width:100vw;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;color:#4E464C}
.rc-overlay.active{display:flex}
.rc-overlay::before{content:'';position:absolute;top:0;left:0;right:0;height:260px;background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(244,154,180,.07) 0%,transparent 70%),radial-gradient(ellipse 40% 40% at 80% 10%,rgba(206,166,232,.05) 0%,transparent 70%);pointer-events:none;z-index:0}
.rc-nav{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:rgba(255,255,255,.78);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(150,118,132,.08);flex-shrink:0;z-index:5;position:relative}
.rc-nav-btn{width:38px;height:38px;display:grid;place-items:center;cursor:pointer;border:none;background:rgba(244,154,180,.10);color:#B07C8C;font-size:18px;line-height:1;border-radius:50%;transition:all .25s cubic-bezier(.4,0,.2,1)}
.rc-nav-btn:hover{background:rgba(244,154,180,.18);color:#9E6A7C;transform:scale(1.05)}
.rc-nav-btn:active{background:rgba(244,154,180,.26);transform:scale(.95)}
.rc-nav-btn svg{width:18px;height:18px;display:block}
.rc-nav-title{font-size:17px;font-weight:700;color:#4E464C;letter-spacing:.2px;position:absolute;left:50%;transform:translateX(-50%)}
.rc-content{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative;z-index:1}
.rc-content::-webkit-scrollbar{display:none}
.rc-graph-wrap{display:flex;justify-content:center;padding:18px 12px 10px;position:relative;background:transparent}
.rc-graph-wrap::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(244,154,180,.05) 0%,transparent 72%);pointer-events:none}
.rc-graph-wrap svg{max-width:100%;height:auto;display:block;position:relative;z-index:1}
.rc-svg-node{cursor:pointer;transition:transform .18s ease}
.rc-svg-node:hover{transform:scale(1.06)}
.rc-svg-node:hover .rc-node-bg{filter:brightness(1.05)}
.rc-legend{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 10px;padding:10px 20px 12px;position:relative;z-index:1}
.rc-legend-item{display:inline-flex;align-items:center;gap:5px;padding:4px 12px 4px 9px;background:rgba(255,255,255,.72);border:1px solid rgba(150,118,132,.09);border-radius:20px;font-size:11px;font-weight:600;color:#8C8288;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);transition:all .25s}
.rc-legend-item:hover{background:rgba(255,255,255,.95);transform:translateY(-1px);box-shadow:0 3px 10px rgba(170,132,150,.10)}
.rc-legend-dot{width:8px;height:8px;border-radius:50%;display:inline-block;box-shadow:0 1px 3px rgba(170,132,150,.25),inset 0 1px 1px rgba(255,255,255,.6);flex-shrink:0}
.rc-hint{text-align:center;color:#A9A0A6;font-size:11px;padding:2px 20px 12px;min-height:16px;letter-spacing:.1px}
.rc-gen-row{display:flex;gap:10px;padding:8px 16px 12px}
.rc-gen-row .rc-generate-btn{margin:0;flex:1;padding:13px 10px;font-size:13px;border-radius:16px}
.rc-generate-btn{display:block;margin:0 auto;padding:14px 40px;border:none;border-radius:16px;background:linear-gradient(135deg,#F7A3BC 0%,#FFC6D8 52%,#F7A3BC 100%);background-size:200% 200%;color:#fff;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.3px;transition:all .25s cubic-bezier(.4,0,.2,1);box-shadow:0 6px 18px rgba(244,154,180,.24),inset 0 1px 0 rgba(255,255,255,.35);position:relative;overflow:hidden;text-shadow:0 1px 1px rgba(196,124,150,.28)}
.rc-generate-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.22) 0%,transparent 55%);pointer-events:none}
.rc-generate-btn:hover{box-shadow:0 8px 24px rgba(244,154,180,.32),inset 0 1px 0 rgba(255,255,255,.40);transform:translateY(-1px);background-position:100% 100%}
.rc-generate-btn:active{transform:scale(.97) translateY(0);box-shadow:0 3px 10px rgba(244,154,180,.20)}
.rc-generate-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.rc-generate-btn.ghost{background:#FFFFFF;color:#D98BA5;text-shadow:none;box-shadow:0 2px 8px rgba(170,132,150,.08),0 0 0 1px rgba(244,154,180,.18);letter-spacing:.2px}
.rc-generate-btn.ghost::after{display:none}
.rc-generate-btn.ghost:hover{background:#FFF7FA;box-shadow:0 4px 14px rgba(244,154,180,.14),0 0 0 1px rgba(244,154,180,.30);transform:translateY(-1px)}
.rc-gen-time{text-align:center;color:#B3AAB0;font-size:10px;padding:0 0 4px;letter-spacing:.2px}
.rc-list{padding:0 0 40px;position:relative;z-index:1}
.rc-section-title{font-size:13px;font-weight:700;color:#5B5158;padding:20px 18px 12px;display:flex;align-items:center;gap:10px;letter-spacing:.2px}
.rc-section-title::before{content:'';display:block;width:3px;height:16px;border-radius:2px;background:linear-gradient(180deg,#F6A0BA,#FFC9DA);flex-shrink:0}
.rc-section-title::after{content:'';flex:1;height:1px;background:rgba(150,118,132,.10);margin-left:4px}
.rc-empty{text-align:center;color:#A9A0A6;font-size:13px;padding:40px 0;line-height:1.8}
.rc-edge-card{background:#FFFFFF;margin:7px 16px;border-radius:18px;overflow:hidden;box-shadow:0 2px 10px rgba(170,132,150,.07),0 0 0 1px rgba(170,132,150,.07);transition:all .3s cubic-bezier(.4,0,.2,1);position:relative}
.rc-edge-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(244,154,180,.22),transparent);opacity:0;transition:opacity .3s}
.rc-edge-card:hover{box-shadow:0 6px 20px rgba(170,132,150,.12),0 0 0 1px rgba(170,132,150,.10);transform:translateY(-1px)}
.rc-edge-card:hover::before{opacity:1}
.rc-edge-card.rc-edge-ph{opacity:.72}
.rc-edge-card.rc-edge-ph:hover{opacity:.9}
.rc-edge-header{display:flex;align-items:center;padding:14px 16px;cursor:pointer;gap:8px}
.rc-edge-header:active{background:rgba(244,154,180,.05)}
.rc-edge-names{flex:1;display:flex;align-items:center;gap:5px;font-size:14px;color:#50474D;min-width:0;overflow:hidden;font-weight:600;letter-spacing:.1px}
.rc-edge-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px}
.rc-edge-arrow{color:#D3C9CE;font-size:11px;flex-shrink:0;font-weight:400}
.rc-edge-type-pill{display:inline-block;padding:3px 11px;border-radius:11px;font-size:10px;color:#fff;flex-shrink:0;font-weight:600;letter-spacing:.2px;box-shadow:0 2px 5px rgba(170,132,150,.18)}
.rc-edge-strength{display:flex;align-items:center;gap:7px;flex-shrink:0}
.rc-edge-strength-bar{width:40px;height:4px;background:rgba(150,118,132,.12);border-radius:2px;overflow:hidden}
.rc-edge-strength-fill{height:100%;border-radius:2px;transition:width .4s ease}
.rc-edge-strength-num{color:#A9A0A6;font-size:11px;min-width:16px;text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.rc-edge-detail{padding:0 16px 16px;display:none}
.rc-edge-detail.show{display:block;animation:rcSlideDown .25s ease}
@keyframes rcSlideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.rc-view-box{background:#FDF8F6;border-radius:14px;padding:12px 14px;margin-bottom:8px;border:1px solid rgba(170,132,150,.08);position:relative}
.rc-view-box:last-child{margin-bottom:0}
.rc-view-label{font-size:11px;color:#A9A0A6;margin-bottom:4px;font-weight:600;letter-spacing:.3px}
.rc-view-text{font-size:13px;color:#5B5158;line-height:1.7}
.rc-edit-btn{margin-top:10px;padding:8px 22px;border-radius:20px;background:rgba(244,154,180,.10);color:#D98BA5;border:1px solid rgba(244,154,180,.20);font-size:12px;font-weight:600;cursor:pointer;transition:all .25s;letter-spacing:.1px}
.rc-edit-btn:hover{background:rgba(244,154,180,.16);border-color:rgba(244,154,180,.32);transform:translateY(-1px)}
.rc-edit-btn:active{background:rgba(244,154,180,.24);transform:scale(.97)}
.rc-ph-toggle{margin:8px 16px;padding:11px 16px;background:rgba(255,255,255,.66);border:1px solid rgba(150,118,132,.08);border-radius:14px;color:#8C8288;font-size:12px;font-weight:500;cursor:pointer;transition:all .25s;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rc-ph-toggle:hover{background:rgba(255,255,255,.90);border-color:rgba(150,118,132,.14);box-shadow:0 3px 12px rgba(170,132,150,.08)}
.rc-ph-toggle:active{background:rgba(244,154,180,.10);transform:scale(.985)}
.rc-ph-toggle.rc-ph-orphan{background:rgba(252,240,238,.70);border-color:rgba(186,120,120,.14);color:#B4878B}
.rc-ph-toggle.rc-ph-orphan:hover{background:rgba(252,236,234,.95)}
.rc-modal{position:fixed;inset:0;z-index:210;background:rgba(74,54,62,.30);display:none;align-items:center;justify-content:center;padding:28px;backdrop-filter:blur(10px) saturate(150%);-webkit-backdrop-filter:blur(10px) saturate(150%)}
.rc-modal.active{display:flex}
.rc-modal-content{background:#FFFFFF;border-radius:26px;padding:28px 24px;width:100%;max-width:340px;max-height:84vh;overflow-y:auto;animation:rcFadeIn .3s cubic-bezier(.4,0,.2,1);box-shadow:0 24px 60px rgba(120,90,105,.16),0 8px 22px rgba(120,90,105,.08),0 0 0 1px rgba(170,132,150,.08)}
@keyframes rcFadeIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
.rc-detail-title{font-size:18px;font-weight:700;color:#4E464C;text-align:center;margin-bottom:6px;line-height:1.4;letter-spacing:.1px}
.rc-detail-pair{color:#A9A0A6;font-size:12px;text-align:center;margin-bottom:20px;letter-spacing:.1px}
.rc-detail-type-row{text-align:center;margin-bottom:20px}
.rc-detail-type-row .rc-edge-type-pill{padding:4px 14px;font-size:12px;border-radius:12px}
.rc-detail-strength{background:#FDF8F6;border-radius:16px;padding:14px 16px;margin-bottom:18px}
.rc-detail-strength-label{color:#A9A0A6;font-size:11px;margin-bottom:8px;font-weight:600;letter-spacing:.4px}
.rc-detail-strength-bar-wrap{display:flex;align-items:center;gap:12px}
.rc-detail-strength-track{flex:1;height:6px;background:rgba(150,118,132,.12);border-radius:3px;overflow:hidden}
.rc-detail-strength-fill{height:100%;border-radius:3px;transition:width .5s cubic-bezier(.4,0,.2,1)}
.rc-detail-strength-bar-wrap span{font-size:14px;font-weight:700;color:#5B5158;min-width:30px;text-align:right;font-variant-numeric:tabular-nums}
.rc-form-group{margin-bottom:18px}
.rc-form-label{display:block;font-size:12px;color:#8C8288;margin-bottom:6px;font-weight:600;letter-spacing:.2px}
.rc-form-input,.rc-form-select,.rc-form-textarea{width:100%;background:#FBF7F6;border:1.5px solid rgba(170,132,150,.14);border-radius:14px;padding:11px 14px;color:#50474D;font-size:14px;outline:none;font-family:inherit;box-sizing:border-box;transition:all .22s}
.rc-form-input:focus,.rc-form-select:focus,.rc-form-textarea:focus{border-color:rgba(244,154,180,.50);background:#FFF;box-shadow:0 0 0 4px rgba(244,154,180,.10)}
.rc-form-textarea{min-height:64px;resize:vertical;line-height:1.6}
.rc-form-range{width:100%;accent-color:#F49AB4;height:4px}
.rc-form-actions{display:flex;gap:12px;margin-top:22px}
.rc-form-btn{flex:1;padding:12px;border-radius:16px;border:none;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.1px;transition:all .22s}
.rc-form-btn.cancel{background:#F6F1EF;color:#8C8288}
.rc-form-btn.cancel:hover{background:#EFE8E5}
.rc-form-btn.cancel:active{background:#E8E0DC;transform:scale(.97)}
.rc-form-btn.save{background:linear-gradient(135deg,#F7A3BC,#FFC6D8);color:#fff;box-shadow:0 4px 14px rgba(244,154,180,.24);text-shadow:0 1px 1px rgba(196,124,150,.25)}
.rc-form-btn.save:hover{box-shadow:0 6px 20px rgba(244,154,180,.32);transform:translateY(-1px)}
.rc-form-btn.save:active{transform:scale(.97);opacity:.92}
.rc-loading-spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(74,54,62,.14);border-top-color:#F49AB4;border-radius:50%;animation:rcSpin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes rcSpin{to{transform:rotate(360deg)}}`;

/* ============================================================
 * PART 2 - RELATION HTML
 * ============================================================ */

var RELATION_HTML = `
<div id="relationOverlay" class="rc-overlay">
  <div class="rc-nav">
    <button class="rc-nav-btn" onclick="closeRelationChain()">&#8592;</button>
    <div class="rc-nav-title">关系链</div>
    <button class="rc-nav-btn" id="rcRefreshBtn">&#8634;</button>
  </div>
  <div class="rc-content">
    <div class="rc-graph-wrap" id="rcGraphWrap"></div>
    <div class="rc-legend">
      <span class="rc-legend-item"><span class="rc-legend-dot" style="background:#E0708A"></span>恋人</span>
      <span class="rc-legend-item"><span class="rc-legend-dot" style="background:#F09BB8"></span>暧昧</span>
      <span class="rc-legend-item"><span class="rc-legend-dot" style="background:#7FA8D8"></span>朋友</span>
      <span class="rc-legend-item"><span class="rc-legend-dot" style="background:#ABA6B0"></span>认识</span>
      <span class="rc-legend-item"><span class="rc-legend-dot" style="background:#7CC79B"></span>家人</span>
    </div>
    <div class="rc-hint" id="rcHint">点击节点选择，再点击另一个节点查看关系</div>
    <div class="rc-gen-row">
      <button class="rc-generate-btn" id="rcGenerateBtn" onclick="relationGenerate()">AI生成/刷新关系</button>
      <button class="rc-generate-btn ghost" id="rcFillBtn" onclick="relationFillMissing()">补全缺失关系</button>
    </div>
    <div class="rc-gen-time" id="rcGenTime"></div>
    <div class="rc-section-title">关系列表</div>
    <div class="rc-list" id="rcList"></div>
  </div>
</div>
<div id="rcDetailModal" class="rc-modal">
  <div class="rc-modal-content" id="rcDetailContent"></div>
</div>
<div id="rcEditModal" class="rc-modal">
  <div class="rc-modal-content" id="rcEditContent"></div>
</div>
`;

/* ============================================================
 * PART 3 - Relation Data Helpers
 * ============================================================ */

/* Build fresh nodes from config (user + characters + npcs) */
function rcCurrentWorldId() {
  try { return (typeof waActiveWorldId === 'function' && waActiveWorldId()) ? waActiveWorldId() : 'default'; } catch (e) { return 'default'; }
}
function rcBuildNodes() {
  var nodes = [];
  var worldId = rcCurrentWorldId();
  /* 当前世界里的所有人设账号——每个账号都是一个独立的人，都要进关系链；当前登录账号标“（我）”且固定 id=user */
  var curAcc = null;
  try { curAcc = (typeof waCurrentAccount === 'function') ? waCurrentAccount() : null; } catch (e) {}
  var userAccs = [];
  try {
    var ws = config.worlds || [];
    var w = ws.filter(function (x) { return x.id === worldId; })[0] || ws[0];
    if (w && Array.isArray(w.users)) userAccs = w.users;
  } catch (e) {}
  if (!userAccs.length && config.user) userAccs = [config.user];
  var _seenAcc = {};
  userAccs.forEach(function (u, uai) {
    if (!u || _seenAcc[u.id || 'cur']) return; _seenAcc[u.id || 'cur'] = 1;
    var isCur = curAcc ? String(u.id) === String(curAcc.id) : (nodes.length === 0);
    // v111 关系链是“社会关系档案”，节点主名一律用身份证大名(name)；昵称/微信名只作小字副标，不再用昵称顶替大名
    var legal = (typeof userLegalName === 'function') ? userLegalName(u) : (u.name || u.personaName || u.wxName || '');
    var nm = legal || u.name || u.wxName || '我';
    var _sub = '';
    var _pn = (u.personaName || '').trim(), _wxn = (u.wxName || '').trim();
    if (_pn && _pn !== nm) _sub = _pn; else if (_wxn && _wxn !== nm) _sub = _wxn;
    if (_sub.length > 7) _sub = _sub.slice(0, 7) + '…';
    // v112 稳定绝对 id：用户=u::账号id，不随“当前登录”漂移（旧版当前登录写死'user'是换号丢关系的根因）
    nodes.push({
      id: 'u::' + (u.id || ('cur' + uai)),
      name: nm + (isCur ? '（我）' : ''),
      sub: _sub,
      avatar: u.avatar || '',
      type: 'user', _accId: u.id || null, _isCur: !!isCur,
      persona: u.persona || '', personaRelations: u.personaRelations || ''
    });
  });
  if (!nodes.length && config.user) {
    var _fbName = (typeof userLegalName === 'function' ? userLegalName(config.user) : (config.user.name || config.user.personaName)) || '我';
    nodes.push({ id: 'u::fb', name: _fbName, sub: '', avatar: config.user.avatar || '', type: 'user', _isCur: true });
  }
  /* Characters：只纳入当前世界的角色（每个世界一个社会）；稳定 id=c::角色id */
  if (config.characters) {
    config.characters.forEach(function (c, i) {
      if (c.worldId && c.worldId !== worldId) return;
      nodes.push({
        id: 'c::' + (c.id || ('idx' + i)),
        _charIdx: i,
        name: c.name || ('角色' + (i + 1)),
        avatar: c.avatar || '',
        type: 'character'
      });
    });
  }
  /* NPCs（同样限本世界）；稳定 id=n::NPCid */
  if (config.npcs && config.npcs.length) {
    config.npcs.forEach(function (n, i) {
      if (n.worldId && n.worldId !== worldId) return;
      nodes.push({
        id: 'n::' + (n.id || ('idx' + i)),
        _npcIdx: i,
        name: n.name || ('NPC' + (i + 1)),
        avatar: n.avatar || '',
        type: 'npc'
      });
    });
  }
  return nodes;
}
/* v112 旧版易漂移端点 → 稳定 sid 归一（幂等）。'user'→当前登录者；'uacc_X'→u::X；'char_i'→第i个角色sid；
   已是 u::/c::/n:: 的原样。无法对到当前节点的边收进 orphan（失效关系，折叠显示，绝不静默丢弃）。 */
function rcEdgeKey(a, b) { return [a, b].sort().join('|'); }
function rcNormalizeEdges(edges, nodes) {
  var valid = {}, curSid = null, charByOrd = [], i;
  nodes.forEach(function (n) {
    valid[n.id] = true;
    if (n._isCur && n.type === 'user') curSid = n.id;
  });
  nodes.filter(function (n) { return n.type === 'character'; }).forEach(function (n, ci) { charByOrd[ci] = n.id; });
  function mapId(old) {
    if (old == null) return null;
    old = String(old);
    if (valid[old]) return old;
    if (old === 'user') return curSid;
    var m;
    if ((m = old.match(/^uacc_(.+)$/))) { var u = 'u::' + m[1]; return valid[u] ? u : null; }
    if ((m = old.match(/^char_(\d+)$/))) { var ci = parseInt(m[1], 10); return charByOrd[ci] || null; }
    if ((m = old.match(/^npc_(\d+)$/))) { var nn = nodes.filter(function (x) { return x.type === 'npc'; })[parseInt(m[1], 10)]; return nn ? nn.id : null; }
    // 历史上可能直接存了角色原始 id（无前缀）
    var guessC = 'c::' + old; if (valid[guessC]) return guessC;
    return null;
  }
  var keep = [], orphan = [], seen = {};
  (edges || []).forEach(function (e) {
    if (!e) return;
    var f = mapId(e.from), t = mapId(e.to);
    if (!f || !t || f === t) { orphan.push(e); return; }
    var key = rcEdgeKey(f, t);
    if (seen[key]) return; // 同对去重，保留先到的
    seen[key] = 1;
    e.from = f; e.to = t;
    keep.push(e);
  });
  return { edges: keep, orphan: orphan };
}
/* v112 确定性补全骨架：保证“当前所有节点两两对”都在列表里；AI/手动没给的对补灰色占位边。
   图上不画占位边，列表里折叠为“无交集/待补充”。 */
function rcEnsureSkeleton(nodes, edges) {
  var have = {};
  edges.forEach(function (e) { have[rcEdgeKey(e.from, e.to)] = e; });
  for (var a = 0; a < nodes.length; a++) {
    for (var b = a + 1; b < nodes.length; b++) {
      var x = nodes[a].id, y = nodes[b].id, key = rcEdgeKey(x, y);
      if (have[key]) {
        // 已有真实内容则摘掉占位标记
        var ex = have[key];
        var hasContent = (ex.aViewsB && String(ex.aViewsB).trim()) || (ex.bViewsA && String(ex.bViewsA).trim()) ||
          (ex.label && ex.label !== '无交集');
        if (hasContent) delete ex._placeholder;
        continue;
      }
      edges.push({ from: x, to: y, label: '无交集', type: '认识', strength: 1, aViewsB: '', bViewsA: '', _placeholder: true });
    }
  }
  // 稳定分区：真实关系在前、无交集占位在后（保持各自原有顺序），列表下标才稳定
  var _re = edges.filter(function (e) { return !rcIsPlaceholder(e); });
  var _ph = edges.filter(function (e) { return rcIsPlaceholder(e); });
  edges.length = 0;
  Array.prototype.push.apply(edges, _re.concat(_ph));
  return edges;
}
function rcIsPlaceholder(e) {
  return !!e._placeholder;
}

/* Get relations object (auto-initialises and syncs nodes) */
function rcRelBucketKey() { return 'w_' + rcCurrentWorldId(); }
function rcGetRelations() {
  if (!config.relationsByWorld || typeof config.relationsByWorld !== 'object') config.relationsByWorld = {};
  var k = rcRelBucketKey();
  var r = config.relationsByWorld[k];
  if (!r) {
    // 默认世界首次使用：继承老版本的全局关系链，避免更新后关系丢失
    if (k === 'w_default' && config.relations && Array.isArray(config.relations.edges) && config.relations.edges.length) {
      r = config.relations;
    } else {
      r = { nodes: [], edges: [], generatedAt: 0 };
    }
    config.relationsByWorld[k] = r;
  }
  if (!r.edges) r.edges = [];
  if (!r.nodes) r.nodes = [];
  /* Always sync nodes with current config */
  r.nodes = rcBuildNodes();
  /* v112 端点归一：把旧版易漂移 id 迁到稳定 sid，悬空边收进 _orphanEdges 折叠显示（不静默丢） */
  try {
    var _nm = rcNormalizeEdges(r.edges, r.nodes);
    r.edges = _nm.edges; r._orphanEdges = _nm.orphan;
  } catch (enze) { r._orphanEdges = r._orphanEdges || []; }
  return r;
}

function rcSaveRelations() {
  try { Store.set('config', config); } catch (e) {}
}

/* Find an edge between two node ids (either direction) */
function rcFindEdge(idA, idB) {
  var edges = rcGetRelations().edges;
  for (var i = 0; i < edges.length; i++) {
    if ((edges[i].from === idA && edges[i].to === idB) ||
        (edges[i].from === idB && edges[i].to === idA)) {
      return edges[i];
    }
  }
  return null;
}

/* ============================================================
 * PART 4 - Relation Graph Rendering (SVG)
 * ============================================================ */

function rcRenderGraph() {
  var wrap = rpEl('rcGraphWrap');
  if (!wrap) return;
  var relations = rcGetRelations();
  var nodes = relations.nodes;
  rcEnsureSkeleton(nodes, relations.edges);
  var edges = relations.edges;

  if (nodes.length <= 1) {
    wrap.innerHTML = '<div style="text-align:center;padding:50px 20px;color:#A9A0A6;font-size:13px;line-height:1.8">还没有其他角色<br>请先创建角色后再查看关系链</div>';
    return;
  }

  var W = 375, H = 360;
  var cx = W / 2, cy = H / 2;
  var isCenter = function (n) { return !!n._isCur; }; // v112 仅当前登录账号居中（用稳定标记，不依赖易漂移id）
  var nonUser = nodes.filter(function (n) { return !isCenter(n); }); // 其他人设账号 + 角色一起围圈，避免多个用户节点叠在中心
  var radius = Math.max(80, Math.min(135, 300 / Math.max(nonUser.length, 3)));
  var nodeR = Math.max(18, Math.min(26, 180 / Math.max(nonUser.length, 1)));

  /* Compute positions */
  var pos = {};
  nodes.forEach(function (n) {
    if (isCenter(n)) pos[n.id] = { x: cx, y: cy };
  });
  nonUser.forEach(function (n, i) {
    var angle = (i / nonUser.length) * 2 * Math.PI - Math.PI / 2;
    pos[n.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:' + W + 'px">';

  /* Edges */
  edges.forEach(function (edge) {
    if (rcIsPlaceholder(edge)) return; // v112 无交集占位边不在图上拉线，保持关系图清爽
    var p1 = pos[edge.from], p2 = pos[edge.to];
    if (!p1 || !p2) return;
    var color = RC_TYPE_COLORS[edge.type] || '#ABA6B0';
    var sw = Math.max(1, Math.min(3, 0.9 + (edge.strength || 5) / 4));
    svg += '<line x1="' + rpSvgEscape(p1.x.toFixed(1)) + '" y1="' + rpSvgEscape(p1.y.toFixed(1)) +
           '" x2="' + rpSvgEscape(p2.x.toFixed(1)) + '" y2="' + rpSvgEscape(p2.y.toFixed(1)) +
           '" stroke="' + color + '" stroke-width="' + sw.toFixed(1) + '" stroke-opacity="0.5" stroke-linecap="round"/>';
    /* Label at midpoint */
    var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    var label = rpSvgEscape(edge.label || edge.type || '');
    var lw = Math.max(28, label.length * 6 + 12);
    svg += '<rect x="' + (mx - lw / 2) + '" y="' + (my - 8) + '" width="' + lw +
           '" height="16" rx="8" fill="#FFFFFF" stroke="' + color + '" stroke-width="0.8" stroke-opacity="0.38"/>';
    svg += '<text x="' + mx.toFixed(1) + '" y="' + (my + 3).toFixed(1) +
           '" text-anchor="middle" fill="' + color + '" font-size="9" font-weight="600" font-family="sans-serif">' +
           label + '</text>';
  });

  /* Nodes */
  nodes.forEach(function (node, idx) {
    var p = pos[node.id];
    if (!p) return;
    var selected = rcState.selectedNode === node.id;
    var skin = node._isCur ? RC_NODE_SOFT.cur : (node.type === 'user' ? RC_NODE_SOFT.user : RC_NODE_SOFT.char);
    var isImg = node.avatar && (node.avatar.indexOf('data:') === 0 || node.avatar.indexOf('http') === 0);
    var clipId = 'rcclip' + idx;

    svg += '<g class="rc-svg-node" data-node="' + rpSvgEscape(node.id) + '">';
    /* Soft halo（温柔光晕） */
    svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
           '" r="' + (nodeR + 6) + '" fill="' + skin.ring + '" fill-opacity="0.13"/>';
    /* Selection ring */
    if (selected) {
      svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
             '" r="' + (nodeR + 4) + '" fill="none" stroke="#F49AB4" stroke-width="2.2" stroke-dasharray="4 3"/>';
    }
    /* Background（浅色底，不再用深色实心圆） */
    svg += '<circle class="rc-node-bg" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
           '" r="' + nodeR + '" fill="' + skin.bg + '"/>';
    /* Avatar image or initial */
    if (isImg) {
      svg += '<clipPath id="' + clipId + '"><circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
             '" r="' + (nodeR - 1) + '"/></clipPath>';
      svg += '<image href="' + rpSvgEscape(node.avatar) + '" x="' + (p.x - nodeR).toFixed(1) +
             '" y="' + (p.y - nodeR).toFixed(1) + '" width="' + (nodeR * 2) + '" height="' + (nodeR * 2) +
             '" clip-path="url(#' + clipId + ')" preserveAspectRatio="xMidYMid slice"/>';
    } else {
      var initial = node.avatar || (node.name || '?').charAt(0);
      svg += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 4).toFixed(1) +
             '" text-anchor="middle" fill="' + skin.ink + '" font-size="' + Math.floor(nodeR * 0.8) +
             '" font-weight="600" font-family="sans-serif">' + rpSvgEscape(initial) + '</text>';
    }
    /* Soft rim（同色细边框，压在头像/首字母之上更清晰） */
    svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
           '" r="' + nodeR + '" fill="none" stroke="' + skin.ring + '" stroke-width="1.5"/>';
    /* Name label below（加白色描边，节点密集时文字依然清晰） */
    svg += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + nodeR + 13).toFixed(1) +
           '" text-anchor="middle" fill="#5B5158" stroke="#FFFFFF" stroke-width="2.6" paint-order="stroke" font-size="10" font-weight="600" font-family="sans-serif">' +
           rpSvgEscape(node.name || '') + '</text>';
    if (node.sub) {
      svg += '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + nodeR + 23).toFixed(1) +
             '" text-anchor="middle" fill="#A9A0A6" stroke="#FFFFFF" stroke-width="2.4" paint-order="stroke" font-size="7.5" font-weight="400" font-family="sans-serif">' +
             rpSvgEscape(node.sub) + '</text>';
    }
    svg += '</g>';
  });

  svg += '</svg>';
  wrap.innerHTML = svg;
}

/* ============================================================
 * PART 5 - Relation List Rendering
 * ============================================================ */

function rcEdgeCard(relations, edge, idx, isPh) {
  var fromNode = relations.nodes.find(function (n) { return n.id === edge.from; });
  var toNode = relations.nodes.find(function (n) { return n.id === edge.to; });
  if (!fromNode || !toNode) return '';
  var color = isPh ? '#C4BEC6' : (RC_TYPE_COLORS[edge.type] || '#ABA6B0');
  var strength = edge.strength || (isPh ? 1 : 5);
  var h = '';
  h += '<div class="rc-edge-card' + (isPh ? ' rc-edge-ph' : '') + '">';
  h += '<div class="rc-edge-header" data-edge-idx="' + idx + '">';
  h += '<div class="rc-edge-names">';
  h += '<span class="rc-edge-name">' + rpEscapeHtml(fromNode.name) + '</span>';
  h += '<span class="rc-edge-arrow">—</span>';
  h += '<span class="rc-edge-type-pill" style="background:' + color + '">' + rpEscapeHtml(isPh ? '无交集' : (edge.type || '关系')) + '</span>';
  h += '<span class="rc-edge-arrow">—</span>';
  h += '<span class="rc-edge-name">' + rpEscapeHtml(toNode.name) + '</span>';
  h += '</div>';
  h += '<div class="rc-edge-strength">';
  h += '<div class="rc-edge-strength-bar"><div class="rc-edge-strength-fill" style="width:' + (strength * 10) + '%;background:' + color + '"></div></div>';
  h += '<span class="rc-edge-strength-num">' + strength + '</span>';
  h += '</div>';
  h += '</div>';
  h += '<div class="rc-edge-detail" id="rcEdgeDetail' + idx + '">';
  if (isPh) {
    h += '<div class="rc-view-box"><div class="rc-view-text" style="color:#A9A0A6">还没有分析这对关系。点上方「补全缺失关系」让 AI 生成，或点下面手动添加。</div></div>';
  } else {
    h += '<div class="rc-view-box"><div class="rc-view-label">' + rpEscapeHtml(fromNode.name) + ' 看待 ' + rpEscapeHtml(toNode.name) + '</div><div class="rc-view-text">' + rpEscapeHtml(edge.aViewsB || '暂无') + '</div></div>';
    h += '<div class="rc-view-box"><div class="rc-view-label">' + rpEscapeHtml(toNode.name) + ' 看待 ' + rpEscapeHtml(fromNode.name) + '</div><div class="rc-view-text">' + rpEscapeHtml(edge.bViewsA || '暂无') + '</div></div>';
  }
  h += '<button class="rc-edit-btn" data-edit-idx="' + idx + '">' + (isPh ? '手动添加关系' : '编辑关系') + '</button>';
  h += '</div>';
  h += '</div>';
  return h;
}

function rcRenderList() {
  var listEl = rpEl('rcList');
  if (!listEl) return;
  var relations = rcGetRelations();
  rcEnsureSkeleton(relations.nodes, relations.edges);
  var edges = relations.edges;

  if (relations.nodes.length < 2) {
    listEl.innerHTML = '<div class="rc-empty">人物不足，先创建角色/人设账号</div>';
    return;
  }

  var real = [], ph = [];
  edges.forEach(function (edge, idx) {
    if (rcIsPlaceholder(edge)) ph.push({ e: edge, idx: idx });
    else real.push({ e: edge, idx: idx });
  });

  var html = '';
  if (real.length === 0) {
    html += '<div class="rc-empty">还没有生成真实关系<br>点上方「AI生成关系」，或点图上两个人物手动添加</div>';
  }
  html += '<div class="rc-section-title" style="padding-top:4px">已建立关系（' + real.length + '）</div>';
  real.forEach(function (it) { html += rcEdgeCard(relations, it.e, it.idx, false); });

  if (ph.length) {
    html += '<div class="rc-ph-toggle" data-rc-ph="1">' + (rcState.showPlaceholder ? '▾' : '▸') +
            ' 无交集 / 待补充（' + ph.length + ' 对）</div>';
    if (rcState.showPlaceholder) ph.forEach(function (it) { html += rcEdgeCard(relations, it.e, it.idx, true); });
  }

  var orphan = relations._orphanEdges || [];
  if (orphan.length) {
    html += '<div class="rc-ph-toggle rc-ph-orphan" data-rc-orphan="1">' + (rcState.showOrphan ? '▾' : '▸') +
            ' 失效关系（人物已删除或对不上，' + orphan.length + ' 条）</div>';
    if (rcState.showOrphan) {
      orphan.forEach(function (e) {
        html += '<div class="rc-edge-card rc-edge-ph"><div class="rc-edge-header"><div class="rc-edge-names">' +
                rpEscapeHtml(String(e.from)) + ' <span class="rc-edge-arrow">—</span> ' +
                rpEscapeHtml(e.label || e.type || '关系') + ' <span class="rc-edge-arrow">—</span> ' +
                rpEscapeHtml(String(e.to)) + '</div></div></div>';
      });
    }
  }

  listEl.innerHTML = html;
}

function rcToggleEdge(idx) {
  var detail = rpEl('rcEdgeDetail' + idx);
  if (detail) detail.classList.toggle('show');
}

function rcUpdateHint(text) {
  var hint = rpEl('rcHint');
  if (hint) hint.textContent = text;
}

function rcRenderGenTime() {
  var el = rpEl('rcGenTime');
  if (!el) return;
  var relations = rcGetRelations();
  if (relations.generatedAt) {
    el.textContent = '上次生成：' + rpFormatTime(relations.generatedAt);
  } else {
    el.textContent = '';
  }
}

/* ============================================================
 * PART 6 - Relation Node Click (two-node selection)
 * ============================================================ */

function rcHandleNodeClick(nodeId) {
  if (rcState.selectedNode === null) {
    rcState.selectedNode = nodeId;
    rcRenderGraph();
    rcUpdateHint('已选择一个节点，再点击另一个节点查看关系');
  } else if (rcState.selectedNode === nodeId) {
    rcState.selectedNode = null;
    rcRenderGraph();
    rcUpdateHint('点击节点选择，再点击另一个节点查看关系');
  } else {
    var idA = rcState.selectedNode;
    var idB = nodeId;
    rcState.selectedNode = null;
    rcRenderGraph();
    relationShowDetail(idA, idB);
  }
}

/* ============================================================
 * PART 7 - Relation Detail Modal
 * ============================================================ */

function relationShowDetail(idA, idB) {
  var relations = rcGetRelations();
  var nodeA = relations.nodes.find(function (n) { return n.id === idA; });
  var nodeB = relations.nodes.find(function (n) { return n.id === idB; });
  if (!nodeA || !nodeB) return;

  rcState.detailA = idA;
  rcState.detailB = idB;

  var edge = rcFindEdge(idA, idB);
  var modal = rpEl('rcDetailModal');
  var content = rpEl('rcDetailContent');
  if (!modal || !content) return;

  var html = '<div class="rc-detail-title">' + rpEscapeHtml(nodeA.name) + ' <span style="color:#C4BEC6">↔</span> ' + rpEscapeHtml(nodeB.name) + '</div>';

  if (edge) {
    var color = RC_TYPE_COLORS[edge.type] || '#ABA6B0';
    var strength = edge.strength || 5;

    /* Determine A's view of B and B's view of A based on edge direction */
    var aViewOfB, bViewOfA;
    if (edge.from === idA) {
      aViewOfB = edge.aViewsB; /* from(A) -> to(B) */
      bViewOfA = edge.bViewsA; /* to(B) -> from(A) */
    } else {
      aViewOfB = edge.bViewsA; /* to(A) -> from(B), i.e. A's view */
      bViewOfA = edge.aViewsB; /* from(B) -> to(A), i.e. B's view */
    }

    html += '<div class="rc-detail-type-row"><span class="rc-edge-type-pill" style="background:' + color + '">' + rpEscapeHtml(edge.type || '关系') + '</span>';
    if (edge.label) html += ' <span style="color:#A9A0A6;font-size:12px">' + rpEscapeHtml(edge.label) + '</span>';
    html += '</div>';

    html += '<div class="rc-detail-strength">';
    html += '<div class="rc-detail-strength-label">关系强度</div>';
    html += '<div class="rc-detail-strength-bar-wrap">';
    html += '<div class="rc-detail-strength-track"><div class="rc-detail-strength-fill" style="width:' + (strength * 10) + '%;background:' + color + '"></div></div>';
    html += '<span style="color:#5B5158;font-size:13px">' + strength + '/10</span>';
    html += '</div></div>';

    html += '<div class="rc-view-box"><div class="rc-view-label">' + rpEscapeHtml(nodeA.name) + ' 对 ' + rpEscapeHtml(nodeB.name) + '</div><div class="rc-view-text">' + rpEscapeHtml(aViewOfB || '暂无') + '</div></div>';
    html += '<div class="rc-view-box"><div class="rc-view-label">' + rpEscapeHtml(nodeB.name) + ' 对 ' + rpEscapeHtml(nodeA.name) + '</div><div class="rc-view-text">' + rpEscapeHtml(bViewOfA || '暂无') + '</div></div>';

    html += '<div style="text-align:center;margin-top:14px"><button class="rc-edit-btn" data-rc-action="edit">编辑关系</button></div>';
  } else {
    html += '<div style="text-align:center;color:#A9A0A6;font-size:13px;padding:16px 0">暂无关系数据</div>';
    html += '<div style="text-align:center"><button class="rc-edit-btn" data-rc-action="edit">添加关系</button></div>';
  }

  content.innerHTML = html;
  modal.classList.add('active');
}

function rcCloseDetailModal() {
  var modal = rpEl('rcDetailModal');
  if (modal) modal.classList.remove('active');
}

/* ============================================================
 * PART 8 - Relation Edit Modal
 * ============================================================ */

function relationEditEdge(idA, idB) {
  var relations = rcGetRelations();
  var nodeA = relations.nodes.find(function (n) { return n.id === idA; });
  var nodeB = relations.nodes.find(function (n) { return n.id === idB; });
  if (!nodeA || !nodeB) return;

  rcCloseDetailModal();

  var edge = rcFindEdge(idA, idB);
  var isNew = !edge;

  /* If edge exists keep its direction, otherwise A=from B=to */
  var fromId = edge ? edge.from : idA;
  var toId = edge ? edge.to : idB;
  var fromNode = relations.nodes.find(function (n) { return n.id === fromId; }) || nodeA;
  var toNode = relations.nodes.find(function (n) { return n.id === toId; }) || nodeB;

  rcState.editFrom = fromId;
  rcState.editTo = toId;
  rcState.editIsNew = isNew;

  var label = edge ? (edge.label || '') : '';
  var type = edge ? (edge.type || '认识') : '认识';
  var strength = edge ? (edge.strength || 5) : 5;
  var aViewsB = edge ? (edge.aViewsB || '') : '';
  var bViewsA = edge ? (edge.bViewsA || '') : '';

  var typeOptions = Object.keys(RC_TYPE_COLORS).map(function (t) {
    return '<option value="' + t + '"' + (t === type ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  var html = '<div class="rc-detail-title">' + (isNew ? '添加关系' : '编辑关系') + '</div>';
  html += '<div class="rc-detail-pair">' + rpEscapeHtml(fromNode.name) + ' ↔ ' + rpEscapeHtml(toNode.name) + '</div>';
  html += '<div class="rc-form-group"><label class="rc-form-label">关系标签</label><input class="rc-form-input" id="rcEditLabel" value="' + rpEscapeAttr(label) + '" placeholder="如：闺蜜、死对头、青梅竹马"></div>';
  html += '<div class="rc-form-group"><label class="rc-form-label">关系类型</label><select class="rc-form-select" id="rcEditType">' + typeOptions + '</select></div>';
  html += '<div class="rc-form-group"><label class="rc-form-label">关系强度：<span id="rcStrengthVal" style="color:#D98BA5">' + strength + '</span></label><input type="range" class="rc-form-range" min="1" max="10" value="' + strength + '" id="rcEditStrength"></div>';
  html += '<div class="rc-form-group"><label class="rc-form-label">' + rpEscapeHtml(fromNode.name) + ' 对 ' + rpEscapeHtml(toNode.name) + ' 的看法</label><textarea class="rc-form-textarea" id="rcEditAViewsB" placeholder="第一人称的看法...">' + rpEscapeAttr(aViewsB) + '</textarea></div>';
  html += '<div class="rc-form-group"><label class="rc-form-label">' + rpEscapeHtml(toNode.name) + ' 对 ' + rpEscapeHtml(fromNode.name) + ' 的看法</label><textarea class="rc-form-textarea" id="rcEditBViewsA" placeholder="第一人称的看法...">' + rpEscapeAttr(bViewsA) + '</textarea></div>';
  html += '<div class="rc-form-actions"><button class="rc-form-btn cancel" data-rc-action="cancel">取消</button><button class="rc-form-btn save" data-rc-action="save">保存</button></div>';

  var content = rpEl('rcEditContent');
  var modal = rpEl('rcEditModal');
  if (content) content.innerHTML = html;
  if (modal) modal.classList.add('active');

  /* Bind range display */
  var rangeInput = rpEl('rcEditStrength');
  if (rangeInput) {
    rangeInput.addEventListener('input', function () {
      var sv = rpEl('rcStrengthVal');
      if (sv) sv.textContent = this.value;
    });
  }
}

function rcSaveEdgeFromForm() {
  var labelEl = rpEl('rcEditLabel');
  var typeEl = rpEl('rcEditType');
  var strengthEl = rpEl('rcEditStrength');
  var aViewsBEl = rpEl('rcEditAViewsB');
  var bViewsAEl = rpEl('rcEditBViewsA');
  if (!labelEl || !typeEl || !strengthEl) return;

  var label = labelEl.value.trim();
  var type = typeEl.value;
  var strength = parseInt(strengthEl.value, 10) || 5;
  var aViewsB = aViewsBEl ? aViewsBEl.value.trim() : '';
  var bViewsA = bViewsAEl ? bViewsAEl.value.trim() : '';

  var fromId = rcState.editFrom;
  var toId = rcState.editTo;
  var isNew = rcState.editIsNew;

  var relations = rcGetRelations();

  function fillManual(ed) {
    ed.from = fromId; ed.to = toId; ed.label = label; ed.type = type; ed.strength = strength;
    ed.aViewsB = aViewsB; ed.bViewsA = bViewsA; ed._manual = true; delete ed._placeholder;
  }
  var edge = rcFindEdge(fromId, toId);
  if (edge) { fillManual(edge); }
  else { var ne = {}; fillManual(ne); relations.edges.push(ne); }

  rcSaveRelations();
  rcCloseEditModal();
  rcRenderGraph();
  rcRenderList();
  rpToast(isNew ? '关系已添加' : '关系已更新');
}

function rcCloseEditModal() {
  var modal = rpEl('rcEditModal');
  if (modal) modal.classList.remove('active');
}

function rcEditFromDetail() {
  relationEditEdge(rcState.detailA, rcState.detailB);
}

function rcEditFromList(idx) {
  var edge = rcGetRelations().edges[idx];
  if (edge) relationEditEdge(edge.from, edge.to);
}

/* ============================================================
 * PART 9 - Relation AI Generation
 * ============================================================ */

function rcNodeSourceChar(node) {
  if (node.type === 'user') return null;
  var i;
  if (config.characters) {
    i = config.characters.findIndex(function (c, ci) { return ('c::' + (c.id || ('idx' + ci))) === node.id; });
    if (i >= 0) return config.characters[i];
  }
  if (config.npcs) {
    i = config.npcs.findIndex(function (c, ci) { return ('n::' + (c.id || ('idx' + ci))) === node.id; });
    if (i >= 0) return config.npcs[i];
  }
  return null;
}

/* onlyPairs: 传入 [[sidA,sidB],...] 时只分析这些对（分批补全用）；不传则全量两两 */
function rcBuildGeneratePrompt(onlyPairs) {
  var relations = rcGetRelations();
  var nodes = relations.nodes;
  var _callName = function (u) { return (typeof userLegalName === 'function' ? (userLegalName(u) || u.name) : (u.name || u.personaName)) || u.name; };
  var useNodes = nodes;
  var pairLines = '';
  if (onlyPairs && onlyPairs.length) {
    var keep = {};
    onlyPairs.forEach(function (pr) { keep[pr[0]] = 1; keep[pr[1]] = 1; });
    useNodes = nodes.filter(function (n) { return keep[n.id]; });
    var nm = function (id) { var x = nodes.find(function (n) { return n.id === id; }); return x ? x.name : id; };
    pairLines = '\n【本次只需、且必须逐对分析下面列出的 ' + onlyPairs.length + ' 对，一对都不能漏，也不要输出列表外的对】\n' +
      onlyPairs.map(function (pr) { return '- ' + pr[0] + ' ↔ ' + pr[1] + '（' + nm(pr[0]) + ' / ' + nm(pr[1]) + '）'; }).join('\n') + '\n';
  }

  var userNodes = useNodes.filter(function (n) { return n.type === 'user'; });
  var info = '人物中的用户人设账号（每个都是独立的人，不是同一个人）：\n';
  userNodes.forEach(function (n) {
    info += 'ID: ' + n.id + '，姓名(身份证大名): ' + n.name + (n._isCur ? '（这是当前登录者）' : ''); if (n.sub) info += '，昵称/网名: ' + n.sub;
    var p = n.persona || (config.user && n._isCur ? config.user.persona : '') || '';
    var pr = n.personaRelations || '';
    if (p) info += '\n  人设: ' + String(p).slice(0, onlyPairs ? 900 : 1500);
    if (pr) info += '\n  人际关系设定: ' + String(pr).slice(0, onlyPairs ? 500 : 1000);
    info += '\n';
  });

  var charList = '\n角色/NPC列表：\n';
  useNodes.filter(function (n) { return n.type !== 'user'; }).forEach(function (node) {
    charList += 'ID: ' + node.id + '，名称: ' + node.name;
    var char = rcNodeSourceChar(node);
    if (char) {
      if (char.gender) charList += '，性别: ' + char.gender;
      if (char.persona) charList += '\n  人设: ' + String(char.persona).slice(0, onlyPairs ? 1000 : 2000);
      if (char.chatHistory && char.chatHistory.length > 0) {
        var _meName = (config.user && _callName(config.user)) || '我';
        var recent = char.chatHistory.slice(-4).map(function (m) {
          var speaker = m.role === 'user' ? _meName : (m.role === 'assistant' ? char.name : m.role);
          return speaker + ': ' + String(m.content || '').slice(0, 60);
        }).join('\n  ');
        charList += '\n  最近和' + _meName + '的聊天:\n  ' + recent;
      }
    }
    charList += '\n';
  });

  var scope = pairLines || ('请分析所有人物【两两之间】的关系，包括：每个用户账号与每个角色、角色与角色之间、以及不同用户人设账号之间。\n' +
    '注意：每个用户人设账号都是独立的人；角色人设里默认的“青梅竹马/恋人”等专属关系只属于创建该角色的那个账号，不要错误套到其他账号上，要依据各自人设判断。\n');

  return '你是一个关系链分析助手。下面是同一个世界里的多个“用户人设账号”（彼此是不同的人）和若干角色/NPC，请分析他们之间的社交关系。\n\n' +
    info + charList + '\n' + scope + pairLines +
    '对于每对关系，给出：\n' +
    '- from: 一方的ID（必须原样使用上面列出的 ID，形如 u:: / c:: / n:: 开头）\n' +
    '- to: 另一方的ID（同样必须是上面列出的真实 ID）\n' +
    '- label: 关系简称（2-6字，如“闺蜜”“死对头”“青梅竹马”“忘年交”；确实没有交集就写“无交集”）\n' +
    '- type: 关系类型，必须是以下之一：恋人、暧昧、朋友、认识、家人\n' +
    '- strength: 关系强度，1-10的整数（无交集为1）\n' +
    '- aViewsB: from对to的看法（一句话，第一人称口吻；无交集可留空字符串）\n' +
    '- bViewsA: to对from的看法（一句话，第一人称口吻；无交集可留空字符串）\n\n' +
    '注意：每对人物只生成一条edge，不要重复，from/to 严禁自造 ID。\n' +
    '返回JSON格式：\n' +
    '{"edges":[{"from":"u::abc","to":"c::xyz","label":"青梅竹马","type":"恋人","strength":9,"aViewsB":"她是我从小喜欢的人","bViewsA":"我们一起长大"}]}\n' +
    '只返回JSON，不要解释。';
}

/* v112 增量合并：AI 返回的边并入现有关系——手动锁定(_manual)的不覆盖，已有边更新，新对追加，
   AI 也判“无交集且无看法”的保持占位。绝不整体删除已有真实关系。 */
function rcMergeAiEdges(relations, aiEdges) {
  var nodes = relations.nodes, valid = {};
  nodes.forEach(function (n) { valid[n.id] = 1; });
  var byKey = {};
  relations.edges.forEach(function (e) { byKey[rcEdgeKey(e.from, e.to)] = e; });
  var added = 0, updated = 0;
  (aiEdges || []).forEach(function (e) {
    if (!e || !e.from || !e.to || !valid[e.from] || !valid[e.to] || e.from === e.to) return;
    var norm = {
      from: e.from, to: e.to,
      label: String(e.label || '').slice(0, 20),
      type: RC_TYPE_COLORS[e.type] ? e.type : '认识',
      strength: Math.max(1, Math.min(10, parseInt(e.strength, 10) || 5)),
      aViewsB: String(e.aViewsB || '').slice(0, 200),
      bViewsA: String(e.bViewsA || '').slice(0, 200)
    };
    var noContent = !norm.aViewsB && !norm.bViewsA && (!norm.label || norm.label === '无交集');
    var key = rcEdgeKey(norm.from, norm.to), ex = byKey[key];
    if (ex) {
      if (ex._manual) return;
      if (noContent) return;
      ex.label = norm.label; ex.type = norm.type; ex.strength = norm.strength;
      ex.aViewsB = norm.aViewsB; ex.bViewsA = norm.bViewsA; delete ex._placeholder; updated++;
    } else if (!noContent) {
      relations.edges.push(norm); byKey[key] = norm; added++;
    }
  });
  rcEnsureSkeleton(nodes, relations.edges);
  return { added: added, updated: updated };
}

async function relationGenerate() {
  if (rcState.generating) return;
  if (typeof callApi !== 'function') { rpToast('AI接口不可用'); return; }

  var btn = rpEl('rcGenerateBtn');
  rcState.generating = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="rc-loading-spin"></span>生成中...'; }

  try {
    var relations = rcGetRelations();
    var prompt = rcBuildGeneratePrompt();
    var messages = [
      { role: 'system', content: '你是一个关系链分析助手。请严格按照要求返回JSON格式数据，不要包含任何解释性文字。' },
      { role: 'user', content: prompt }
    ];
    var reply = await callApi(messages);
    var parsed = rpParseJsonReply(reply);
    var aiEdges = (parsed && Array.isArray(parsed.edges)) ? parsed.edges : [];

    /* v112 增量合并：保留已有真实/手动关系，只更新或追加 AI 这次给出的对，不再整体覆盖 */
    var st = rcMergeAiEdges(relations, aiEdges);
    relations.generatedAt = Date.now();
    rcSaveRelations();

    rcRenderGraph();
    rcRenderList();
    rcRenderGenTime();
    var realCnt = relations.edges.filter(function (e) { return !rcIsPlaceholder(e); }).length;
    rpToast('已刷新：新增' + st.added + '、更新' + st.updated + '，当前共' + realCnt + '对真实关系');
  } catch (e) {
    rpToast('生成失败：' + ((e && e.message) ? e.message : '请稍后重试'));
  }

  rcState.generating = false;
  if (btn) { btn.disabled = false; btn.textContent = 'AI生成关系链'; }
}

/* v112-C 分批补全：只对“无交集/待补充”的缺失对，每批少量问 AI，避免人多时大 JSON 被截断；可反复点继续补 */
async function relationFillMissing() {
  if (rcState.filling || rcState.generating) return;
  if (typeof callApi !== 'function') { rpToast('AI接口不可用'); return; }
  var relations = rcGetRelations();
  rcEnsureSkeleton(relations.nodes, relations.edges);
  var missing = relations.edges.filter(rcIsPlaceholder).map(function (e) { return [e.from, e.to]; });
  if (!missing.length) { rpToast('关系已完整，没有缺失对'); return; }

  var btn = rpEl('rcFillBtn');
  rcState.filling = true;
  var BATCH = 6, done = 0, total = missing.length, add = 0, upd = 0;
  try {
    for (var i = 0; i < missing.length; i += BATCH) {
      var batch = missing.slice(i, i + BATCH);
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="rc-loading-spin"></span>补全 ' + done + '/' + total; }
      var prompt = rcBuildGeneratePrompt(batch);
      var reply = await callApi([
        { role: 'system', content: '你是关系链分析助手，严格只返回指定 JSON，不要解释。' },
        { role: 'user', content: prompt }
      ]);
      var parsed = rpParseJsonReply(reply);
      var arr = (parsed && Array.isArray(parsed.edges)) ? parsed.edges : [];
      var st = rcMergeAiEdges(relations, arr);
      add += st.added; upd += st.updated; done += batch.length;
      relations.generatedAt = Date.now();
      rcSaveRelations(); rcRenderGraph(); rcRenderList(); rcRenderGenTime();
    }
    rpToast('补全完成：新增' + add + '、更新' + upd);
  } catch (e) {
    rpToast('补全中断（已补 ' + done + '/' + total + '）：' + ((e && e.message) ? e.message : '可再点继续'));
  } finally {
    rcState.filling = false;
    if (btn) { btn.disabled = false; btn.textContent = '补全缺失关系'; }
  }
}

/* ============================================================
 * PART 10 - Relation Open / Close / Init
 * ============================================================ */

var rcInitialized = false;

function initRelationChain() {
  if (rcInitialized) return;
  rcInitialized = true;

  /* Inject CSS */
  var style = document.createElement('style');
  style.setAttribute('data-rc-styles', 'true');
  style.textContent = RELATION_CSS;
  document.head.appendChild(style);

  /* Inject HTML */
  var container = document.createElement('div');
  container.innerHTML = RELATION_HTML;
  var rcHost = document.getElementById('phoneScreen') || document.body;
  while (container.firstChild) {
    rcHost.appendChild(container.firstChild);
  }

  /* Graph click (SVG event delegation via manual traversal) */
  var graphWrap = rpEl('rcGraphWrap');
  if (graphWrap) {
    graphWrap.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== graphWrap) {
        if (el.getAttribute && el.getAttribute('data-node')) {
          rcHandleNodeClick(el.getAttribute('data-node'));
          return;
        }
        el = el.parentNode;
      }
    });
  }

  /* List click (HTML event delegation) */
  var listEl = rpEl('rcList');
  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var phT = e.target.closest('[data-rc-ph]');
      if (phT) { rcState.showPlaceholder = !rcState.showPlaceholder; rcRenderList(); return; }
      var orT = e.target.closest('[data-rc-orphan]');
      if (orT) { rcState.showOrphan = !rcState.showOrphan; rcRenderList(); return; }
      var editBtn = e.target.closest('[data-edit-idx]');
      if (editBtn) {
        e.stopPropagation();
        rcEditFromList(parseInt(editBtn.dataset.editIdx, 10));
        return;
      }
      var header = e.target.closest('[data-edge-idx]');
      if (header) {
        rcToggleEdge(parseInt(header.dataset.edgeIdx, 10));
      }
    });
  }

  /* Refresh button */
  var refreshBtn = rpEl('rcRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      rcRenderGraph();
      rcRenderList();
      rcRenderGenTime();
    });
  }

  /* Detail modal */
  var detailModal = rpEl('rcDetailModal');
  if (detailModal) {
    detailModal.addEventListener('click', function (e) {
      if (e.target === detailModal) rcCloseDetailModal();
    });
    var detailContent = rpEl('rcDetailContent');
    if (detailContent) {
      detailContent.addEventListener('click', function (e) {
        if (e.target.closest('[data-rc-action="edit"]')) rcEditFromDetail();
      });
    }
  }

  /* Edit modal */
  var editModal = rpEl('rcEditModal');
  if (editModal) {
    editModal.addEventListener('click', function (e) {
      if (e.target === editModal) rcCloseEditModal();
    });
    var editContent = rpEl('rcEditContent');
    if (editContent) {
      editContent.addEventListener('click', function (e) {
        if (e.target.closest('[data-rc-action="cancel"]')) rcCloseEditModal();
        else if (e.target.closest('[data-rc-action="save"]')) rcSaveEdgeFromForm();
      });
    }
  }
}

function openRelationChain() {
  initRelationChain();
  rcState.selectedNode = null;
  var overlay = rpEl('relationOverlay');
  if (overlay) overlay.classList.add('active');
  rcRenderGraph();
  rcRenderList();
  rcRenderGenTime();
}

function closeRelationChain() {
  var overlay = rpEl('relationOverlay');
  if (overlay) overlay.classList.remove('active');
  rcCloseDetailModal();
  rcCloseEditModal();
  rcState.selectedNode = null;
}


/* ============================================================
 *                    FEATURE 2: 照片墙
 *                    Photo Wall
 * ============================================================ */

var pwState = {
  initialized: false,
  generating: false
};

/* ============================================================
 * PART 11 - PHOTO CSS
 * ============================================================ */

var PHOTO_CSS = `
.pw-overlay{position:fixed;inset:0;z-index:200;background:#FFFFFF;display:none;flex-direction:column;max-width:100vw;margin:0 auto}
.pw-overlay.active{display:flex}
.pw-nav{display:flex;align-items:center;justify-content:space-between;padding:max(8px, env(safe-area-inset-top)) 16px;background:#FFFFFF;border-bottom:0.5px solid rgba(0,0,0,0.08);flex-shrink:0;z-index:5}
.pw-nav-btn{width:32px;height:32px;display:grid;place-items:center;cursor:pointer;border:none;background:none;color:#333;font-size:22px;line-height:1;border-radius:8px}
.pw-nav-btn:active{background:rgba(0,0,0,0.05)}
.pw-nav-title{font-size:17px;font-weight:600;color:#333}
.pw-content{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.pw-content::-webkit-scrollbar{display:none}
.pw-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:2px}
.pw-thumb{aspect-ratio:1;background-color:#F0F0F0;background-size:cover;background-position:center;cursor:pointer;position:relative;overflow:hidden}
.pw-thumb:active{opacity:0.75}
.pw-thumb-badge{position:absolute;bottom:4px;right:4px;padding:1px 6px;border-radius:8px;font-size:8px;color:#fff;font-weight:600}
.pw-thumb-badge.ai{background:rgba(255,107,157,0.85)}
.pw-thumb-badge.upload{background:rgba(74,144,217,0.85)}
.pw-thumb-badge.memory{background:rgba(52,199,89,0.85)}
.pw-empty{text-align:center;padding:80px 20px}
.pw-empty-icon{font-size:48px;margin-bottom:12px;opacity:0.25}
.pw-empty-text{color:#666;font-size:14px;margin-bottom:20px}
.pw-empty-btn{padding:10px 28px;border-radius:20px;background:#FF6B9D;color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer}
.pw-empty-btn:active{opacity:0.85}
.pw-modal{position:fixed;inset:0;z-index:210;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;flex-direction:column;padding:20px}
.pw-modal.active{display:flex}
.pw-modal-close{position:absolute;top:16px;right:16px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,0.1);border:none;color:#333;font-size:18px;cursor:pointer;display:grid;place-items:center;z-index:5}
.pw-modal-close:active{background:rgba(0,0,0,0.15)}
.pw-detail-img{max-width:100%;max-height:55vh;object-fit:contain;border-radius:8px}
.pw-detail-info{padding:16px 0 0;width:100%;max-width:335px}
.pw-detail-caption{color:#333;font-size:14px;line-height:1.5;margin-bottom:10px}
.pw-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.pw-detail-tag{padding:3px 10px;background:rgba(0,0,0,0.06);border-radius:12px;color:#333;font-size:11px}
.pw-detail-meta{color:#666;font-size:11px;margin-bottom:16px}
.pw-detail-delete{padding:8px 22px;border-radius:16px;background:rgba(231,76,60,0.2);color:#E74C3C;border:none;font-size:13px;font-weight:500;cursor:pointer}
.pw-detail-delete:active{background:rgba(231,76,60,0.3)}
.pw-ai-modal{position:fixed;inset:0;z-index:215;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.pw-ai-modal.active{display:flex}
.pw-ai-card{background:#FFFFFF;border-radius:16px;padding:20px;width:100%;max-width:335px;animation:pwFadeIn .2s ease}
@keyframes pwFadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
.pw-ai-title{font-size:16px;font-weight:600;color:#333;text-align:center;margin-bottom:14px}
.pw-ai-input{width:100%;background:#F5F5F5;border:1px solid rgba(0,0,0,0.1);border-radius:8px;padding:12px;color:#333;font-size:14px;outline:none;min-height:60px;resize:vertical;font-family:inherit;margin-bottom:14px;box-sizing:border-box;line-height:1.5}
.pw-ai-input:focus{border-color:rgba(255,107,157,0.5)}
.pw-ai-actions{display:flex;gap:10px}
.pw-ai-btn{flex:1;padding:10px;border-radius:8px;border:none;font-size:14px;font-weight:600;cursor:pointer}
.pw-ai-btn.cancel{background:#F0F0F0;color:#666}
.pw-ai-btn.cancel:active{background:#E0E0E0}
.pw-ai-btn.gen{background:#FF6B9D;color:#fff}
.pw-ai-btn.gen:active{opacity:0.85}
.pw-action-overlay{position:fixed;inset:0;z-index:213;background:rgba(0,0,0,0.5);display:none}
.pw-action-overlay.active{display:block}
.pw-action-sheet{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:100vw;z-index:214;background:#FFFFFF;border-radius:16px 16px 0 0;padding:8px 0 calc(8px + env(safe-area-inset-bottom));display:none;animation:pwSlideUp .25s ease}
@keyframes pwSlideUp{from{transform:translate(-50%,100%)}to{transform:translate(-50%,0)}}
.pw-action-sheet.active{display:block}
.pw-action-item{padding:15px 20px;color:#333;font-size:16px;text-align:center;cursor:pointer;border-bottom:0.5px solid rgba(0,0,0,0.06)}
.pw-action-item:last-child{border-bottom:none}
.pw-action-item:active{background:rgba(0,0,0,0.03)}
.pw-action-cancel{padding:15px 20px;color:#666;font-size:16px;text-align:center;cursor:pointer;margin-top:8px;border-top:8px solid #F0F0F0}
.pw-loading-overlay{position:fixed;inset:0;z-index:220;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px}
.pw-loading-overlay.active{display:flex}
.pw-spinner{width:36px;height:36px;border:3px solid rgba(255,255,255,0.2);border-top-color:#FF6B9D;border-radius:50%;animation:pwSpin .8s linear infinite}
@keyframes pwSpin{to{transform:rotate(360deg)}}
.pw-loading-text{color:#fff;font-size:14px}
`;

/* ============================================================
 * PART 12 - PHOTO HTML
 * ============================================================ */

var PHOTO_HTML = `
<div id="photoOverlay" class="pw-overlay">
  <div class="pw-nav">
    <button class="pw-nav-btn" onclick="closePhotoWall()">&#8592;</button>
    <div class="pw-nav-title">照片墙</div>
    <button class="pw-nav-btn" onclick="pwShowAddSheet()">+</button>
  </div>
  <div class="pw-content" id="pwGrid"></div>
</div>
<div id="pwDetailModal" class="pw-modal">
  <div id="pwDetailContent" style="display:flex;flex-direction:column;align-items:center;width:100%;max-width:335px"></div>
</div>
<div id="pwAiModal" class="pw-ai-modal">
  <div class="pw-ai-card">
    <div class="pw-ai-title">AI生成照片</div>
    <textarea class="pw-ai-input" id="pwAiPrompt" placeholder="描述你想要的照片，例如：夕阳下的海边，两个身影并肩而行..."></textarea>
    <div class="pw-ai-actions">
      <button class="pw-ai-btn cancel" onclick="pwCloseAiModal()">取消</button>
      <button class="pw-ai-btn gen" onclick="photoAiGenerate()">生成</button>
    </div>
  </div>
</div>
<div id="pwActionOverlay" class="pw-action-overlay" onclick="pwCloseAddSheet()"></div>
<div id="pwActionSheet" class="pw-action-sheet">
  <div class="pw-action-item" onclick="photoUpload()">上传照片</div>
  <div class="pw-action-item" onclick="pwShowAiModal()">AI生成</div>
  <div class="pw-action-cancel" onclick="pwCloseAddSheet()">取消</div>
</div>
<div id="pwLoadingOverlay" class="pw-loading-overlay">
  <div class="pw-spinner"></div>
  <div class="pw-loading-text" id="pwLoadingText">正在生成...</div>
</div>
<input type="file" id="pwFileInput" accept="image/*" style="display:none" />
`;

/* ============================================================
 * PART 13 - Photo Data Helpers
 * ============================================================ */

function pwGetPhotos() {
  if (!config.photos) config.photos = [];
  return config.photos;
}

function pwSavePhotos() {
  try { Store.set('config', config); } catch (e) {}
}

function pwNextId() {
  var photos = pwGetPhotos();
  if (photos.length === 0) return 1;
  return Math.max.apply(null, photos.map(function (p) { return p.id || 0; })) + 1;
}

/* ============================================================
 * PART 14 - Photo Grid Rendering
 * ============================================================ */

function pwRenderGrid() {
  var grid = rpEl('pwGrid');
  if (!grid) return;
  var photos = pwGetPhotos();

  if (photos.length === 0) {
    grid.innerHTML = '<div class="pw-empty"><div class="pw-empty-icon">📷</div><div class="pw-empty-text">还没有照片</div><button class="pw-empty-btn" onclick="pwShowAddSheet()">添加照片</button></div>';
    return;
  }

  /* Sort by createdAt descending */
  var sorted = photos.slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  var html = '<div class="pw-grid">';
  sorted.forEach(function (photo) {
    var badge = '';
    if (photo.source === 'ai') badge = '<div class="pw-thumb-badge ai">AI</div>';
    else if (photo.source === 'memory') badge = '<div class="pw-thumb-badge memory">记忆</div>';
    html += '<div class="pw-thumb" style="background-image:url(\'' + rpEscapeAttr(photo.src) + '\')" data-photo-id="' + photo.id + '">' + badge + '</div>';
  });
  html += '</div>';
  grid.innerHTML = html;
}

/* ============================================================
 * PART 15 - Photo Detail Modal
 * ============================================================ */

function photoShowDetail(id) {
  var photos = pwGetPhotos();
  var photo = photos.find(function (p) { return p.id === id; });
  if (!photo) return;

  var content = rpEl('pwDetailContent');
  var modal = rpEl('pwDetailModal');
  if (!content || !modal) return;

  var tagsHtml = (photo.tags || []).map(function (t) {
    return '<span class="pw-detail-tag">' + rpEscapeHtml(t) + '</span>';
  }).join('');

  var html = '<button class="pw-modal-close" onclick="pwCloseDetail()">&#10005;</button>';
  html += '<img class="pw-detail-img" src="' + rpEscapeAttr(photo.src) + '" alt="">';
  html += '<div class="pw-detail-info">';
  if (photo.caption) {
    html += '<div class="pw-detail-caption">' + rpEscapeHtml(photo.caption) + '</div>';
  }
  if (tagsHtml) {
    html += '<div class="pw-detail-tags">' + tagsHtml + '</div>';
  }
  html += '<div class="pw-detail-meta">' + rpFormatTime(photo.createdAt) + ' · ' + rpSourceLabel(photo.source) + '</div>';
  html += '<button class="pw-detail-delete" onclick="photoDelete(' + photo.id + ')">删除照片</button>';
  html += '</div>';

  content.innerHTML = html;
  modal.classList.add('active');
}

function pwCloseDetail() {
  var modal = rpEl('pwDetailModal');
  if (modal) modal.classList.remove('active');
}

/* ============================================================
 * PART 16 - Photo Upload
 * ============================================================ */

function photoUpload() {
  pwCloseAddSheet();
  var input = rpEl('pwFileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function pwHandleFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    rpToast('请选择图片文件');
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    rpToast('图片不能超过3MB');
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var photos = pwGetPhotos();
    photos.push({
      id: pwNextId(),
      src: e.target.result,
      caption: '',
      tags: [],
      source: 'upload',
      createdAt: Date.now()
    });
    pwSavePhotos();
    pwRenderGrid();
    rpToast('照片已添加');
  };
  reader.onerror = function () {
    rpToast('读取文件失败');
  };
  reader.readAsDataURL(file);
}

/* ============================================================
 * PART 17 - Photo AI Generate
 * ============================================================ */

/* Create an SVG gradient placeholder with prompt text */
function pwCreatePlaceholder(prompt) {
  var palettes = [
    ['#FF6B9D', '#FFC7D9'],
    ['#4A90D9', '#7BB3E8'],
    ['#34C759', '#6DD4A0'],
    ['#FF9500', '#FFCC80'],
    ['#5856D6', '#9B96E8'],
    ['#AF52DE', '#D4A0E8'],
    ['#30B0C7', '#7DD3DD']
  ];
  var c = palettes[Math.floor(Math.random() * palettes.length)];
  var shortPrompt = String(prompt || '').slice(0, 24);
  var gid = 'pwg' + Date.now();
  var lines = [];
  /* Word-wrap the prompt into lines of ~10 chars */
  for (var i = 0; i < shortPrompt.length; i += 10) {
    lines.push(shortPrompt.slice(i, i + 10));
  }
  var lineTags = lines.map(function (line, i) {
    var y = 200 + i * 18 - (lines.length - 1) * 9;
    return '<text x="200" y="' + y + '" text-anchor="middle" fill="#fff" font-size="15" opacity="0.85" font-family="sans-serif">' +
           rpSvgEscape(line) + '</text>';
  }).join('');

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + c[0] + '"/>' +
    '<stop offset="1" stop-color="' + c[1] + '"/>' +
    '</linearGradient></defs>' +
    '<rect width="400" height="400" fill="url(#' + gid + ')"/>' +
    '<circle cx="200" cy="140" r="36" fill="rgba(255,255,255,0.2)"/>' +
    '<text x="200" y="152" text-anchor="middle" fill="#fff" font-size="36" opacity="0.6">&#128247;</text>' +
    lineTags +
    '<text x="200" y="320" text-anchor="middle" fill="#fff" font-size="10" opacity="0.4" font-family="sans-serif">AI生成照片</text>' +
    '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

async function photoAiGenerate() {
  if (pwState.generating) return;
  if (typeof callApi !== 'function') { rpToast('AI接口不可用'); return; }

  var input = rpEl('pwAiPrompt');
  var prompt = input ? input.value.trim() : '';
  if (!prompt) { rpToast('请输入描述'); return; }

  pwState.generating = true;
  pwCloseAiModal();
  pwShowLoading('正在生成照片...');

  try {
    /* Use AI to generate a caption and tags for the photo */
    var messages = [
      { role: 'system', content: '你是一个照片描述生成器。根据用户的描述，生成一段简短的照片说明文字和标签。只返回JSON。' },
      { role: 'user', content: '用户想生成一张照片，描述是：' + prompt + '\n请返回JSON：{"caption":"照片说明（10-30字）","tags":["标签1","标签2","标签3"]}\n只返回JSON，不要解释。' }
    ];
    var reply = await callApi(messages);
    var parsed = rpParseJsonReply(reply);

    var caption = prompt;
    var tags = [];
    if (parsed) {
      if (parsed.caption) caption = String(parsed.caption).slice(0, 100);
      if (Array.isArray(parsed.tags)) {
        tags = parsed.tags.slice(0, 5).map(function (t) { return String(t).slice(0, 12); });
      }
    }

    /* Try to use a real image generator if one is available globally,
       otherwise fall back to a colourful SVG placeholder. */
    var src = '';
    if (typeof window.generateImage === 'function') {
      try { src = await window.generateImage(prompt); } catch (e) { src = ''; }
    }
    if (!src) src = pwCreatePlaceholder(prompt);

    /* Save photo */
    var photos = pwGetPhotos();
    photos.push({
      id: pwNextId(),
      src: src,
      caption: caption,
      tags: tags,
      source: 'ai',
      createdAt: Date.now()
    });
    pwSavePhotos();
    pwRenderGrid();
    rpToast('照片已生成');
  } catch (e) {
    rpToast('生成失败：' + ((e && e.message) ? e.message : '请稍后重试'));
  }

  pwHideLoading();
  pwState.generating = false;

  /* Clear input */
  if (input) input.value = '';
}

/* ============================================================
 * PART 18 - Photo Delete
 * ============================================================ */

function photoDelete(id) {
  if (!confirm('确定删除这张照片吗？')) return;
  config.photos = pwGetPhotos().filter(function (p) { return p.id !== id; });
  pwSavePhotos();
  pwCloseDetail();
  pwRenderGrid();
  rpToast('照片已删除');
}

/* ============================================================
 * PART 19 - Photo Action Sheet & Loading
 * ============================================================ */

function pwShowAddSheet() {
  rpEl('pwActionOverlay') && rpEl('pwActionOverlay').classList.add('active');
  rpEl('pwActionSheet') && rpEl('pwActionSheet').classList.add('active');
}

function pwCloseAddSheet() {
  rpEl('pwActionOverlay') && rpEl('pwActionOverlay').classList.remove('active');
  rpEl('pwActionSheet') && rpEl('pwActionSheet').classList.remove('active');
}

function pwShowAiModal() {
  pwCloseAddSheet();
  var modal = rpEl('pwAiModal');
  if (modal) modal.classList.add('active');
  var input = rpEl('pwAiPrompt');
  if (input) setTimeout(function () { input.focus(); }, 100);
}

function pwCloseAiModal() {
  var modal = rpEl('pwAiModal');
  if (modal) modal.classList.remove('active');
}

function pwShowLoading(text) {
  var overlay = rpEl('pwLoadingOverlay');
  var textEl = rpEl('pwLoadingText');
  if (textEl) textEl.textContent = text || '加载中...';
  if (overlay) overlay.classList.add('active');
}

function pwHideLoading() {
  var overlay = rpEl('pwLoadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

/* ============================================================
 * PART 20 - Photo Open / Close / Init
 * ============================================================ */

var pwInitialized = false;

function initPhotoWall() {
  if (pwInitialized) return;
  pwInitialized = true;

  /* Inject CSS */
  var style = document.createElement('style');
  style.setAttribute('data-pw-styles', 'true');
  style.textContent = PHOTO_CSS;
  document.head.appendChild(style);

  /* Inject HTML */
  var container = document.createElement('div');
  container.innerHTML = PHOTO_HTML;
  var pwHost = document.getElementById('phoneScreen') || document.body;
  while (container.firstChild) {
    pwHost.appendChild(container.firstChild);
  }

  /* Grid click (event delegation) */
  var grid = rpEl('pwGrid');
  if (grid) {
    grid.addEventListener('click', function (e) {
      var thumb = e.target.closest('[data-photo-id]');
      if (thumb) {
        var id = parseInt(thumb.dataset.photoId, 10);
        if (!isNaN(id)) photoShowDetail(id);
      }
    });

    /* Long press to delete */
    var pressTimer = null;
    grid.addEventListener('touchstart', function (e) {
      var thumb = e.target.closest('[data-photo-id]');
      if (!thumb) return;
      var id = parseInt(thumb.dataset.photoId, 10);
      if (isNaN(id)) return;
      pressTimer = setTimeout(function () {
        pressTimer = null;
        photoDelete(id);
      }, 600);
    });
    grid.addEventListener('touchend', function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
    grid.addEventListener('touchmove', function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });
  }

  /* Detail modal close on backdrop */
  var detailModal = rpEl('pwDetailModal');
  if (detailModal) {
    detailModal.addEventListener('click', function (e) {
      if (e.target === detailModal) pwCloseDetail();
    });
  }

  /* AI modal close on backdrop */
  var aiModal = rpEl('pwAiModal');
  if (aiModal) {
    aiModal.addEventListener('click', function (e) {
      if (e.target === aiModal) pwCloseAiModal();
    });
  }

  /* File input change */
  var fileInput = rpEl('pwFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        pwHandleFile(this.files[0]);
      }
    });
  }
}

function openPhotoWall() {
  initPhotoWall();
  var overlay = rpEl('photoOverlay');
  if (overlay) overlay.classList.add('active');
  pwRenderGrid();
}

function closePhotoWall() {
  var overlay = rpEl('photoOverlay');
  if (overlay) overlay.classList.remove('active');
  pwCloseDetail();
  pwCloseAiModal();
  pwCloseAddSheet();
  pwHideLoading();
}


/* ============================================================
 * Export to global scope
 * ============================================================ */

/* Relation Chain - public API */
window.RELATION_CSS = RELATION_CSS;
window.RELATION_HTML = RELATION_HTML;
window.initRelationChain = initRelationChain;
window.openRelationChain = openRelationChain;
window.rcGetRelations = rcGetRelations;
window.rcBuildNodes = rcBuildNodes;
window.rcCurrentWorldId = rcCurrentWorldId;
window.closeRelationChain = closeRelationChain;
window.relationGenerate = relationGenerate;
window.relationFillMissing = relationFillMissing;
window.rcMergeAiEdges = rcMergeAiEdges;
window.rcEnsureSkeleton = rcEnsureSkeleton;
window.rcNormalizeEdges = rcNormalizeEdges;
window.relationShowDetail = relationShowDetail;
window.relationEditEdge = relationEditEdge;

/* Relation Chain - internal (used in event handlers / onclick) */
window.rcHandleNodeClick = rcHandleNodeClick;
window.rcToggleEdge = rcToggleEdge;
window.rcEditFromDetail = rcEditFromDetail;
window.rcEditFromList = rcEditFromList;
window.rcSaveEdgeFromForm = rcSaveEdgeFromForm;
window.rcCloseEditModal = rcCloseEditModal;
window.rcCloseDetailModal = rcCloseDetailModal;

/* Photo Wall - public API */
window.PHOTO_CSS = PHOTO_CSS;
window.PHOTO_HTML = PHOTO_HTML;
window.initPhotoWall = initPhotoWall;
window.openPhotoWall = openPhotoWall;
window.closePhotoWall = closePhotoWall;
window.photoUpload = photoUpload;
window.photoAiGenerate = photoAiGenerate;
window.photoShowDetail = photoShowDetail;
window.photoDelete = photoDelete;

/* Photo Wall - internal (used in onclick) */
window.pwShowAddSheet = pwShowAddSheet;
window.pwCloseAddSheet = pwCloseAddSheet;
window.pwShowAiModal = pwShowAiModal;
window.pwCloseAiModal = pwCloseAiModal;
window.pwCloseDetail = pwCloseDetail;
window.pwShowLoading = pwShowLoading;
window.pwHideLoading = pwHideLoading;
window.pwRenderGrid = pwRenderGrid;

})();