
// ===== 世界系统 (world-system.js) =====
// ===== INJECTED FROM world-system.js =====
/* ============================================================
 * World System (世界系统) — Standalone Client-Side Module
 * for rua小手机.
 *
 * Host-environment dependencies (must exist before calling
 * initWorldSystem / openWorldSystem):
 *   - callApi(messages)          : async, messages=[{role,content}], returns AI reply string
 *   - Store.get(key, default)    : read from localStorage
 *   - Store.set(key, value)      : write to localStorage
 *   - escapeHtml(str)            : HTML escape
 *   - showToast(msg)             : toast notification
 *   - config                     : global config object (config.api, config.world, ...)
 *
 * The world data lives in `config.world` and is persisted via
 * Store.set('config', config), so it becomes the app's baseline.
 *
 * Public API:
 *   openWorldSystem()            — open the overlay
 *   closeWorldSystem()           — close the overlay
 *   initWorldSystem()            — inject CSS + HTML, bind events
 *   worldGenerateExpand()        — AI expand world from seed (generates settings, params, rules)
 *   worldSaveData()              — save world data (seed + fields)
 * ============================================================ */

(function () {
'use strict';

/* ============================================================
 * PART 1 - CSS
 * ============================================================ */

var WORLD_CSS = `
/* ===== World System Overlay (dark theme) ===== */
.ws-overlay{position:fixed;inset:0;z-index:200;background:#000;display:none;flex-direction:column;max-width:100vw;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.ws-overlay.active{display:flex}
.ws-nav-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1C1C1E;border-bottom:0.5px solid rgba(255,255,255,0.08);position:sticky;top:0;z-index:10;flex-shrink:0}
.ws-nav-btn{width:34px;height:34px;border-radius:8px;background:transparent;color:#fff;border:0;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background .2s;line-height:1}
.ws-nav-btn:active{background:rgba(255,255,255,0.1)}
.ws-nav-title{flex:1;text-align:center;font-size:17px;font-weight:600;letter-spacing:2px}
.ws-nav-world{background:transparent;border:0;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;padding:4px 8px;border-radius:8px;max-width:70%}
.ws-nav-world:active{background:rgba(255,255,255,0.12)}
.ws-nav-world span{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-wl-list{max-height:52vh;overflow-y:auto;margin:4px 0 12px}
.ws-wl-row{padding:13px 14px;border-radius:12px;background:#2C2C2E;margin-bottom:9px;cursor:pointer;border:1px solid transparent}
.ws-wl-row.active{border-color:#0A84FF}
.ws-wl-row:active{background:#3a3a3c}
.ws-wl-name{font-size:15px;color:#fff;font-weight:600;margin-bottom:3px}
.ws-wl-sub{font-size:12px;color:rgba(255,255,255,0.45)}
.ws-wl-tag{display:inline-block;font-size:10px;font-weight:500;color:#fff;background:rgba(10,132,255,.25);border-radius:6px;padding:1px 6px;margin-left:4px;vertical-align:middle}
.ws-nav-actions{display:flex;gap:2px}
.ws-content{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 0 90px}
.ws-section{padding:0 14px;margin-bottom:20px}
.ws-section-title{font-size:13px;font-weight:600;color:#8E8E93;margin:0 0 8px;display:flex;align-items:center;justify-content:space-between;letter-spacing:0.5px}
.ws-card{background:#1C1C1E;border-radius:14px;padding:14px}
.ws-label{font-size:13px;color:#8E8E93;margin-bottom:6px}
.ws-hint{font-size:11px;color:#555;margin-top:6px;line-height:1.5}
.ws-textarea{width:100%;min-height:90px;background:#000;border:0.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;color:#fff;font-size:14px;line-height:1.6;outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;transition:border-color .2s}
.ws-textarea:focus{border-color:#0A84FF}
.ws-textarea::placeholder{color:#555}
.ws-field{margin-bottom:14px}
.ws-field:last-child{margin-bottom:0}
.ws-field-label{font-size:12px;color:#0A84FF;font-weight:600;margin-bottom:5px;display:flex;align-items:center;gap:6px}
.ws-field-label .ws-field-icon{font-size:13px}
.ws-field-input{min-height:64px;font-size:13px}
.ws-btn{border:0;border-radius:10px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:transform .15s,opacity .15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.ws-btn:active{transform:scale(0.97)}
.ws-btn-primary{background:#0A84FF;color:#fff}
.ws-btn-save{background:#07C160;color:#fff;width:100%;margin-top:14px}
.ws-btn-secondary{background:#2C2C2E;color:#fff}
.ws-btn-danger{background:#FF3B30;color:#fff}
.ws-btn:disabled{opacity:0.5;pointer-events:none}
.ws-btn-block{width:100%}
/* time card */
.ws-time-card{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ws-time-display{display:flex;flex-direction:column;gap:3px;min-width:0}
.ws-time-day{font-size:20px;font-weight:700;color:#fff;line-height:1.2}
.ws-time-phase{font-size:13px;color:#0A84FF;font-weight:600}
.ws-time-actions{display:flex;flex-direction:column;align-items:flex-end;gap:9px;flex-shrink:0}
.ws-checkbox{display:flex;align-items:center;gap:6px;font-size:11px;color:#8E8E93;cursor:pointer;user-select:none}
.ws-checkbox input{accent-color:#0A84FF;cursor:pointer}
/* history */
.ws-add-history-btn{background:transparent;border:0;color:#0A84FF;font-size:13px;font-weight:600;cursor:pointer;padding:0}
.ws-history-card{padding:4px 8px}
.ws-empty{text-align:center;color:#555;font-size:13px;padding:26px 8px;line-height:1.6}
.ws-history-item{padding:11px 6px;border-bottom:0.5px solid rgba(255,255,255,0.06)}
.ws-history-item:last-child{border-bottom:0}
.ws-history-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.ws-history-time{font-size:12px;color:#8E8E93}
.ws-history-badge{font-size:10px;padding:2px 8px;border-radius:999px;font-weight:600;letter-spacing:0.5px}
.ws-badge-editable{background:rgba(10,132,255,0.16);color:#0A84FF}
.ws-badge-locked{background:rgba(142,142,147,0.22);color:#8E8E93}
.ws-history-text{font-size:14px;line-height:1.65;color:#fff;white-space:pre-wrap;word-break:break-word}
.ws-history-actions{display:flex;gap:18px;margin-top:9px}
.ws-history-action{font-size:12px;color:#0A84FF;cursor:pointer;font-weight:500}
.ws-history-action:active{opacity:0.6}
.ws-history-delete{color:#FF3B30}
/* loading overlay */
.ws-loading-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.78);display:none;align-items:center;justify-content:center;z-index:20;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.ws-loading-overlay.active{display:flex}
.ws-loading-box{display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 36px;background:#1C1C1E;border-radius:16px;max-width:80%}
.ws-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,0.15);border-top-color:#0A84FF;border-radius:50%;animation:wsSpin 0.8s linear infinite}
@keyframes wsSpin{to{transform:rotate(360deg)}}
.ws-loading-text{font-size:13px;color:#fff;text-align:center;line-height:1.5}
/* modal (bottom sheet) */
.ws-modal{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.6);display:none;align-items:flex-end;justify-content:center}
.ws-modal.active{display:flex}
.ws-modal-content{width:100%;max-width:100vw;background:#1C1C1E;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + var(--safe-bottom,0px));animation:wsSlideUp .3s ease;box-sizing:border-box}
@keyframes wsSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.ws-modal-title{font-size:16px;font-weight:600;color:#fff;margin-bottom:14px;text-align:center}
.ws-modal-actions{display:flex;gap:10px;margin-top:16px}
.ws-modal-actions .ws-btn{flex:1}
/* settings info rows */
.ws-settings-row{display:flex;align-items:center;justify-content:space-between;padding:11px 2px;border-bottom:0.5px solid rgba(255,255,255,0.06);font-size:13px}
.ws-settings-row:last-child{border-bottom:0}
.ws-settings-row span:first-child{color:#8E8E93}
.ws-settings-row span:last-child{color:#fff;font-weight:500;max-width:60%;text-align:right;word-break:break-word}
/* world parameters - param sliders */
.ws-param-slider{margin:0 0 14px;padding:14px 16px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px}
.ws-param-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.ws-param-label{font-size:14px;font-weight:600;color:#F0F0F5}
.ws-param-value{font-size:13px;color:#A29BFE;font-weight:700}
.ws-param-desc{font-size:11px;color:rgba(240,240,245,0.38);margin-bottom:8px}
.ws-param-slider input[type=range]{width:100%;height:6px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.08);border-radius:3px;outline:none}
.ws-param-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#6C5CE7;cursor:pointer}
.ws-param-slider input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#6C5CE7;cursor:pointer;border:none}
/* world rules */
.ws-rule-card{padding:14px 16px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;margin-bottom:10px;cursor:pointer;transition:background 0.15s ease;position:relative}
.ws-rule-card:active{background:rgba(255,255,255,0.08)}
.ws-rule-title{font-size:13px;font-weight:600;color:#F0F0F5;margin-bottom:4px}
.ws-rule-desc{font-size:12px;color:rgba(240,240,245,0.6);line-height:1.5}
.ws-rule-delete{position:absolute;top:10px;right:12px;width:22px;height:22px;border-radius:50%;background:rgba(255,107,107,0.15);color:#FF6B6B;font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none}
.ws-rule-delete:active{background:rgba(255,107,107,0.3)}
.ws-add-rule-btn{width:100%;padding:12px;background:transparent;border:0.5px dashed rgba(255,255,255,0.12);border-radius:14px;color:rgba(255,255,255,0.4);font-size:14px;cursor:pointer;transition:all 0.15s ease}
.ws-add-rule-btn:active{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.2)}
/* rule modal */
.ws-rule-modal-input{width:100%;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;font-size:14px;color:#fff;outline:none;font-family:inherit;margin-bottom:10px}
.ws-rule-modal-input:focus{border-color:#6C5CE7}
.ws-rule-modal-input::placeholder{color:rgba(255,255,255,0.3)}
/* world presets */
.ws-preset-section{margin-top:14px}
.ws-preset-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:10px;-webkit-overflow-scrolling:touch}
.ws-preset-tabs::-webkit-scrollbar{display:none}
.ws-preset-tab{padding:6px 14px;border-radius:14px;font-size:12px;color:#8A7E85;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 0.2s;display:flex;align-items:center;gap:4px}
.ws-preset-tab.active{background:linear-gradient(135deg,rgba(108,92,231,0.3),rgba(162,155,254,0.15));color:#A29BFE;border-color:rgba(108,92,231,0.4)}
.ws-preset-tab .del{width:16px;height:16px;border-radius:50%;display:grid;place-items:center;font-size:10px;color:rgba(255,255,255,0.3);margin-left:2px}
.ws-preset-tab .del:active{background:rgba(255,107,107,0.2);color:#FF6B6B}
.ws-preset-save-row{display:flex;gap:8px;align-items:center}
.ws-preset-save-row .ws-rule-modal-input{flex:1;margin-bottom:0}
.ws-preset-save-btn{padding:10px 16px;border-radius:10px;background:#6C5CE7;color:#fff;font-size:13px;font-weight:600;border:none;cursor:pointer;white-space:nowrap;flex-shrink:0}
.ws-preset-save-btn:active{opacity:0.8}
.ws-preset-empty{font-size:12px;color:rgba(255,255,255,0.3);text-align:center;padding:8px 0}
`;

/* ============================================================
 * PART 2 - HTML
 * ============================================================ */

var WORLD_HTML = `
<div id="worldSystemOverlay" class="ws-overlay">
  <div class="ws-nav-bar">
    <button class="ws-nav-btn" id="wsBackBtn" type="button" title="返回">&#8592;</button>
    <button class="ws-nav-title ws-nav-world" id="wsWorldSwitchBtn" type="button" title="切换/新建世界"><span id="wsNavWorldName">世界 ▾</span></button>
    <div class="ws-nav-actions">
      <button class="ws-nav-btn" id="wsSettingsBtn" type="button" title="设置">&#9881;</button>
      <button class="ws-nav-btn" id="wsCloseBtn" type="button" title="关闭">&#10005;</button>
    </div>
  </div>

  <div class="ws-content" id="wsContent">

    <!-- Section 1: 世界观输入区 -->
    <div class="ws-section">
      <div class="ws-section-title">世界观设定</div>
      <div class="ws-card">
        <div class="ws-label">世界观种子</div>
        <textarea id="wsSeedInput" class="ws-textarea" placeholder="在此输入你的世界设定，例如：一个由蒸汽机械与古老咒语共同驱动的浮空城邦世界……"></textarea>
        <button class="ws-btn ws-btn-primary ws-btn-block" id="wsGenerateBtn" type="button">&#10024; AI 扩写生成</button>
        <div class="ws-hint">AI 将基于种子扩写「时代背景 / 社会结构 / 科技水平 / 文化特征 / 地理环境 / 特殊规则」六维设定，生成后可逐项调整。</div>
      </div>
    </div>

    <!-- Section 2: 可调参数（AI 扩写结果，全部可编辑） -->
    <div class="ws-section">
      <div class="ws-section-title">世界设定（可调参数）</div>
      <div class="ws-card">
        <div class="ws-field">
          <div class="ws-field-label"><span class="ws-field-icon">&#9201;</span>时代背景</div>
          <textarea id="wsField_era" class="ws-textarea ws-field-input" placeholder="描述这个世界的时代与历史背景"></textarea>
        </div>
        <div class="ws-field">
          <div class="ws-field-label"><span class="ws-field-icon">&#9878;</span>社会结构</div>
          <textarea id="wsField_social" class="ws-textarea ws-field-input" placeholder="描述阶层、政体与权力结构"></textarea>
        </div>
        <div class="ws-field">
          <div class="ws-field-label"><span class="ws-field-icon">&#9881;</span>科技水平</div>
          <textarea id="wsField_tech" class="ws-textarea ws-field-input" placeholder="描述科技或力量的发展程度"></textarea>
        </div>
        <div class="ws-field">
          <div class="ws-field-label"><span class="ws-field-icon">&#127919;</span>文化特征</div>
          <textarea id="wsField_culture" class="ws-textarea ws-field-input" placeholder="描述信仰、习俗与价值观"></textarea>
        </div>
        <div class="ws-field">
          <div class="ws-field-label"><span class="ws-field-icon">&#127758;</span>地理环境</div>
          <textarea id="wsField_geography" class="ws-textarea ws-field-input" placeholder="描述地理地貌与重要地点"></textarea>
        </div>
        <div class="ws-field">
          <div class="ws-field-label"><span class="ws-field-icon">&#10024;</span>特殊规则</div>
          <textarea id="wsField_specialRules" class="ws-textarea ws-field-input" placeholder="描述独有的运行法则，如魔法体系、禁忌等"></textarea>
        </div>
      </div>
    </div>

    <!-- Section 2b: 世界参数 -->
    <div class="ws-section">
      <div class="ws-section-title">世界参数 · 可调节</div>
      <div class="ws-card" id="wsParamsContainer"></div>
      <button class="ws-add-rule-btn" id="wsAddParamBtn" type="button">+ 添加世界参数</button>
    </div>

    <!-- Section 2c: 世界规则 -->
    <div class="ws-section">
      <div class="ws-section-title">
        <span>世界规则</span>
      </div>
      <div class="ws-card" id="wsRulesContainer"></div>
      <button class="ws-add-rule-btn" id="wsAddRuleBtn" type="button">+ 添加世界规则</button>
    </div>

    <!-- Section 3: 世界预设（保存所有设定） -->
    <div class="ws-section">
      <div class="ws-section-title">世界预设</div>
      <div class="ws-preset-tabs" id="wsPresetTabs"></div>
      <div class="ws-preset-save-row">
        <input type="text" class="ws-rule-modal-input" id="wsPresetNameInput" placeholder="输入预设名称，如：蒸汽浮空城">
        <button class="ws-preset-save-btn" id="wsSavePresetBtn" type="button">保存为预设</button>
      </div>
    </div>

    <!-- Section 4: 保存为基调 -->
    <button class="ws-btn ws-btn-save ws-btn-block" id="wsSaveBtn" type="button" style="margin:6px 0 20px">&#128190; 保存为基调（保存以上所有设定）</button>

  </div>

  <!-- Loading overlay -->
  <div class="ws-loading-overlay" id="wsLoadingOverlay">
    <div class="ws-loading-box">
      <div class="ws-spinner"></div>
      <div class="ws-loading-text" id="wsLoadingText">AI 正在生成世界设定…</div>
    </div>
  </div>
</div>

<!-- Settings modal -->
<div class="ws-modal" id="wsSettingsModal">
  <div class="ws-modal-content">
    <div class="ws-modal-title">世界设置</div>
    <div id="wsSettingsInfo"></div>
    <div class="ws-modal-actions">
      <button class="ws-btn ws-btn-secondary" id="wsSettingsCancel" type="button">关闭</button>
      <button class="ws-btn ws-btn-danger" id="wsSettingsReset" type="button">重置世界</button>
    </div>
  </div>
</div>

<!-- Rule add/edit modal -->
<div class="ws-modal" id="wsRuleModal">
  <div class="ws-modal-content">
    <div class="ws-modal-title" id="wsRuleModalTitle">添加世界规则</div>
    <input type="text" class="ws-rule-modal-input" id="wsRuleTitleInput" placeholder="规则名称，如：灵能守恒">
    <textarea class="ws-rule-modal-input" id="wsRuleDescInput" placeholder="规则描述……" style="min-height:80px;resize:none;line-height:1.6"></textarea>
    <div class="ws-modal-actions">
      <button class="ws-btn ws-btn-secondary" id="wsRuleModalCancel" type="button">取消</button>
      <button class="ws-btn ws-btn-primary" id="wsRuleModalConfirm" type="button">确定</button>
    </div>
  </div>
</div>

<!-- Parameter add/edit modal -->
<div class="ws-modal" id="wsParamModal">
  <div class="ws-modal-content">
    <div class="ws-modal-title" id="wsParamModalTitle">添加世界参数</div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <input type="text" class="ws-rule-modal-input" id="wsParamIconInput" placeholder="图标" style="flex:0 0 50px;text-align:center" maxlength="2">
      <input type="text" class="ws-rule-modal-input" id="wsParamLabelInput" placeholder="参数名称，如：灵气浓度" style="flex:1;margin-bottom:0">
    </div>
    <input type="text" class="ws-rule-modal-input" id="wsParamSuffixInput" placeholder="单位后缀，如：%、/10、x（可留空）">
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1">
        <label style="font-size:11px;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px">最小值</label>
        <input type="number" class="ws-rule-modal-input" id="wsParamMinInput" placeholder="0" style="margin-bottom:0">
      </div>
      <div style="flex:1">
        <label style="font-size:11px;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px">最大值</label>
        <input type="number" class="ws-rule-modal-input" id="wsParamMaxInput" placeholder="100" style="margin-bottom:0">
      </div>
      <div style="flex:1">
        <label style="font-size:11px;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px">当前值</label>
        <input type="number" class="ws-rule-modal-input" id="wsParamValueInput" placeholder="50" style="margin-bottom:0">
      </div>
    </div>
    <input type="text" class="ws-rule-modal-input" id="wsParamDescInput" placeholder="参数说明，如：影响法术施展的威力">
    <div class="ws-modal-actions">
      <button class="ws-btn ws-btn-secondary" id="wsParamModalCancel" type="button">取消</button>
      <button class="ws-btn ws-btn-primary" id="wsParamModalConfirm" type="button">确定</button>
    </div>
  </div>
</div>

<!-- 多世界切换/新建面板 -->
<div class="ws-modal" id="wsWorldListModal">
  <div class="ws-modal-content">
    <div class="ws-modal-title">切换 / 新建世界</div>
    <div class="ws-hint" style="margin-bottom:8px">每个世界拥有独立的世界观设定、人设账号与角色。点一个世界即可切换编辑。</div>
    <div class="ws-wl-list" id="wsWorldListContainer"></div>
    <button class="ws-btn ws-btn-primary ws-btn-block" id="wsCreateWorldBtn" type="button">＋ 新建其他世界</button>
    <div class="ws-modal-actions">
      <button class="ws-btn ws-btn-secondary" id="wsWorldListClose" type="button" style="flex:1">关闭</button>
    </div>
  </div>
</div>
`;

/* ============================================================
 * PART 3 - Constants
 * ============================================================ */

/* Editable generated fields. */
var WS_FIELD_KEYS = ['era', 'social', 'tech', 'culture', 'geography', 'specialRules'];

/* Default world data shape. */
var WS_DEFAULT_WORLD = {
  seed: '',
  generated: {
    era: '',
    social: '',
    tech: '',
    culture: '',
    geography: '',
    specialRules: ''
  },
  parameters: {},     // 世界参数值 {key: value}，key由AI生成的paramDefs定义
  paramDefs: [],      // 世界参数定义 [{key, icon, label, suffix, min, max, desc, divide?}]
  rules: [],          // 世界规则数组 [{id, title, desc}]
  presets: [],        // 世界预设数组 [{id, name, seed, generated, parameters, rules, createdAt}]
  activePresetId: null, // 当前激活的预设ID
  createdAt: 0,
  updatedAt: 0
};

/* World parameter definitions for rendering */
var WS_PARAMS = [
  { key: 'climate',  icon: '🌧️', label: '气候湿度',   suffix: '%',   min: 0, max: 100, desc: '影响场景描述中的天气与环境氛围' },
  { key: 'conflict', icon: '⚔️', label: '冲突强度',   suffix: '/10', min: 0, max: 10,  desc: 'NPC之间发生矛盾的频率与激烈程度' },
  { key: 'mana',     icon: '✨', label: '灵能浓度',   suffix: '%',   min: 0, max: 100, desc: '决定异能事件的触发概率与强度' },
  { key: 'emotion',  icon: '💔', label: '情感深度',   suffix: '/10', min: 0, max: 10,  desc: '角色情感表达的丰富度与细腻程度' },
  { key: 'random',   icon: '🎲', label: '随机事件',   suffix: '%',   min: 0, max: 100, desc: '世界脉动中随机事件的触发概率' },
  { key: 'timeFlow', icon: '🕐', label: '时间流速',   suffix: 'x',   min: 1, max: 50,  desc: '游戏内时间与现实时间的比例', divide: 10 }
];

/* ============================================================
 * PART 4 - Helpers
 * ============================================================ */

var wsEl = function (id) {
  return document.getElementById(id);
};

var wsEscapeHtml = function (str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  var s = String(str == null ? '' : str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

var wsToast = function (msg) {
  if (typeof showToast === 'function') { showToast(msg); return; }
  if (typeof toast === 'function') { toast(msg); return; }
};

var wsClone = function (obj) {
  return JSON.parse(JSON.stringify(obj));
};

var wsGenId = function () {
  return 'ws-h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
};

var wsFormatTimeLabel = function (day, phase) {
  return '第' + (day || 1) + '天·' + (phase || '清晨');
};

var wsFormatDate = function (ts) {
  if (!ts) return '—';
  try {
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  } catch (e) { return '—'; }
};

/* Extract a JSON object from an AI reply (tolerant of ```json fences). */
var wsParseJson = function (reply) {
  if (!reply) return null;
  var cleaned = String(reply)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```$/g, '')
    .trim();
  var jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
  } catch (e) {
    return null;
  }
};

/* ============================================================
 * PART 5 - State
 * ============================================================ */

var wsState = {
  active: false,
  generating: false,  // AI expand in progress
  editingWorldId: null // 世界APP当前正在编辑的世界 id（多世界各自独立设定）
};

var wsInitialized = false;

/* ============================================================
 * PART 6 - Data access (config.world)
 * ============================================================ */

/* 一份空白世界设定 */
var wsFreshSetting = function () {
  var s = wsClone(WS_DEFAULT_WORLD);
  s.createdAt = Date.now(); s.updatedAt = Date.now();
  return s;
};
/* 补全一份世界设定的形状 */
var wsNormalizeSetting = function (w) {
  if (!w || typeof w !== 'object') return w;
  if (typeof w.seed !== 'string') w.seed = '';
  if (!w.generated || typeof w.generated !== 'object') w.generated = { era: '', social: '', tech: '', culture: '', geography: '', specialRules: '' };
  WS_FIELD_KEYS.forEach(function (k) { if (typeof w.generated[k] !== 'string') w.generated[k] = ''; });
  if (!Array.isArray(w.paramDefs)) w.paramDefs = [];
  if (!w.parameters || typeof w.parameters !== 'object') w.parameters = {};
  if (!Array.isArray(w.rules)) w.rules = [];
  if (!Array.isArray(w.presets)) w.presets = [];
  if (typeof w.activePresetId !== 'string' && w.activePresetId !== null) w.activePresetId = null;
  if (typeof w.createdAt !== 'number') w.createdAt = Date.now();
  if (typeof w.updatedAt !== 'number') w.updatedAt = 0;
  return w;
};
/* 确保多世界数组 config.worlds 存在（与微信选世界/账号体系同一数据源） */
var wsEnsureWorlds = function () {
  if (typeof config === 'undefined') { config = {}; }
  if (!Array.isArray(config.worlds)) config.worlds = [];
  if (!config.worlds.some(function (w) { return w && (w.isDefault || w.id === 'default'); })) {
    config.worlds.unshift({ id: 'default', name: '默认世界', isDefault: true, createdAt: Date.now(), users: [] });
  }
  return config.worlds;
};
var wsDefaultWorldObj = function () {
  var ws = wsEnsureWorlds();
  return ws.filter(function (w) { return w.isDefault || w.id === 'default'; })[0] || ws[0];
};
/* 当前正在世界APP里编辑的世界对象（含其独立 worldSetting） */
var wsGetEditingWorld = function () {
  var ws = wsEnsureWorlds();
  var id = wsState.editingWorldId;
  var cur = id ? ws.filter(function (w) { return w.id === id; })[0] : null;
  if (!cur) {
    try { var cw = (window.WA && WA.currentWorld) ? WA.currentWorld() : null; if (cw) cur = ws.filter(function (w) { return w.id === cw.id; })[0]; } catch (e) {}
    if (!cur) cur = wsDefaultWorldObj();
    wsState.editingWorldId = cur.id;
  }
  if (!cur.worldSetting || typeof cur.worldSetting !== 'object') {
    var legacy = config.world;
    var legacyHas = legacy && (legacy.seed || (legacy.generated && WS_FIELD_KEYS.some(function (k) { return !!legacy.generated[k]; })) || (Array.isArray(legacy.presets) && legacy.presets.length));
    if ((cur.isDefault || cur.id === 'default') && legacyHas) cur.worldSetting = legacy; // 默认世界沿用旧的全局设定
    else cur.worldSetting = wsFreshSetting();
  }
  wsNormalizeSetting(cur.worldSetting);
  return cur;
};
/* 返回当前编辑世界的设定对象（保持下游 w.xxx 全部兼容） */
var wsEnsureWorld = function () { return wsGetEditingWorld().worldSetting; };
/* 把当前编辑世界的设定同步为“活动设定” config.world，供既有 AI/线下逻辑读取 */
var wsSyncActive = function (wObj) { try { config.world = (wObj || wsGetEditingWorld()).worldSetting; } catch (e) {} };
var wsUpdateTitle = function () {
  var t = wsEl('wsNavWorldName'); if (!t) return;
  var w = wsGetEditingWorld();
  t.textContent = w.name + (w.isDefault ? '（默认）' : '') + ' ▾';
};
var wsRenderWorldList = function () {
  var c = wsEl('wsWorldListContainer'); if (!c) return;
  var ws = wsEnsureWorlds(); var eid = wsState.editingWorldId;
  var html = '';
  ws.forEach(function (w) {
    var un = Array.isArray(w.users) ? w.users.length : 0;
    var cn = (config.characters || []).filter(function (ch) { return (ch.worldId || 'default') === w.id; }).length;
    var act = w.id === eid;
    html += '<div class="ws-wl-row' + (act ? ' active' : '') + '" onclick="wsSelectEditingWorld(\'' + String(w.id).replace(/'/g, '') + '\')">'
      + '<div class="ws-wl-name">' + wsEscapeHtml(w.name) + (w.isDefault ? ' <span class="ws-wl-tag">默认</span>' : '') + (act ? ' <span class="ws-wl-tag">编辑中</span>' : '') + '</div>'
      + '<div class="ws-wl-sub">人设账号 ' + un + ' 个 · 角色 ' + cn + ' 个</div></div>';
  });
  c.innerHTML = html || '<div class="ws-empty">还没有世界，点下方按钮新建</div>';
};
var wsOpenWorldList = function () { try { worldSaveData(); } catch (e) {} wsRenderWorldList(); var m = wsEl('wsWorldListModal'); if (m) m.classList.add('active'); };
var wsCloseWorldList = function () { var m = wsEl('wsWorldListModal'); if (m) m.classList.remove('active'); };
var wsSelectEditingWorld = function (id) {
  try { worldSaveData(); } catch (e) {}           // 切走前先把当前世界输入存盘
  wsState.editingWorldId = id;
  var w = wsGetEditingWorld(); wsSyncActive(w);
  wsCloseWorldList(); wsRenderAll(); wsUpdateTitle(); wsPersist();
  wsToast('已切换到「' + w.name + '」');
};
var wsCreateWorld = function () {
  var name = (typeof prompt === 'function') ? prompt('新世界名称：', '新世界') : '新世界';
  if (name === null) return; name = (name || '').trim() || '新世界';
  var id = 'world_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  var w = { id: id, name: name, isDefault: false, createdAt: Date.now(), users: [], worldSetting: wsFreshSetting() };
  wsEnsureWorlds().push(w);
  wsState.editingWorldId = id; wsSyncActive(w);
  wsCloseWorldList(); wsRenderAll(); wsUpdateTitle(); wsPersist();
  wsToast('已创建世界「' + name + '」，可在此编辑其世界观');
};

/* Persist the whole config (so config.world becomes the app baseline). */
var wsPersist = function () {
  try {
    wsSyncActive();
    if (typeof config !== 'undefined' && typeof Store !== 'undefined' && Store && typeof Store.set === 'function') {
      Store.set('config', config);
    }
  } catch (e) {}
};

/* ============================================================
 * PART 7 - Render
 * ============================================================ */

var wsRenderAll = function () {
  var w = wsEnsureWorld();

  var seedInput = wsEl('wsSeedInput');
  if (seedInput) seedInput.value = w.seed || '';

  WS_FIELD_KEYS.forEach(function (k) {
    var el = wsEl('wsField_' + k);
    if (el) el.value = (w.generated && w.generated[k]) || '';
  });

  wsRenderParams();
  wsRenderRules();
  wsRenderPresets();
};

/* ===== Render world parameters (dynamic from paramDefs) ===== */
var wsRenderParams = function () {
  var w = wsEnsureWorld();
  var container = wsEl('wsParamsContainer');
  if (!container) return;
  var defs = w.paramDefs || [];
  if (!defs.length) {
    container.innerHTML = '<div class="ws-empty">暂无世界参数<br>输入种子并点击AI扩写后将自动生成</div>';
    return;
  }
  var html = '';
  defs.forEach(function (p) {
    var val = w.parameters[p.key];
    if (typeof val !== 'number') val = Math.round((p.min + p.max) / 2);
    html +=
      '<div class="ws-param-slider">' +
        '<div class="ws-param-header">' +
          '<div class="ws-param-label" onclick="wsOpenParamModal(\'' + wsEscapeHtml(p.key) + '\')" style="cursor:pointer">' + wsEscapeHtml(p.icon || '⚙️') + ' ' + wsEscapeHtml(p.label || p.key) + '</div>' +
          '<div class="ws-param-value" id="wsParamVal_' + wsEscapeHtml(p.key) + '">' + val + wsEscapeHtml(p.suffix || '') + '</div>' +
        '</div>' +
        '<div class="ws-param-desc">' + wsEscapeHtml(p.desc || '') + '</div>' +
        '<input type="range" min="' + p.min + '" max="' + p.max + '" value="' + val + '" data-param="' + wsEscapeHtml(p.key) + '" oninput="wsOnParamChange(\'' + wsEscapeHtml(p.key) + '\', this.value)">' +
        '<button class="ws-rule-delete" onclick="wsDeleteParam(\'' + wsEscapeHtml(p.key) + '\')">×</button>' +
      '</div>';
  });
  container.innerHTML = html;
};

var wsOnParamChange = function (key, val) {
  var w = wsEnsureWorld();
  var numVal = parseInt(val, 10);
  if (isNaN(numVal)) return;
  w.parameters[key] = numVal;
  // Update display
  var p = null;
  var defs = w.paramDefs || [];
  for (var i = 0; i < defs.length; i++) {
    if (defs[i].key === key) { p = defs[i]; break; }
  }
  if (p) {
    var el = wsEl('wsParamVal_' + key);
    if (el) el.textContent = numVal + (p.suffix || '');
  }
  w.updatedAt = Date.now();
  wsPersist();
};

/* ===== Parameter modal (add / edit) ===== */
var wsParamEditKey = null;

var wsOpenParamModal = function (key) {
  wsParamEditKey = key || null;
  var modal = wsEl('wsParamModal');
  if (!modal) return;
  var titleEl = wsEl('wsParamModalTitle');
  var iconInput = wsEl('wsParamIconInput');
  var labelInput = wsEl('wsParamLabelInput');
  var suffixInput = wsEl('wsParamSuffixInput');
  var minInput = wsEl('wsParamMinInput');
  var maxInput = wsEl('wsParamMaxInput');
  var valueInput = wsEl('wsParamValueInput');
  var descInput = wsEl('wsParamDescInput');

  if (key) {
    var w = wsEnsureWorld();
    var p = null;
    var defs = w.paramDefs || [];
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].key === key) { p = defs[i]; break; }
    }
    if (titleEl) titleEl.textContent = '编辑世界参数';
    if (iconInput) iconInput.value = p ? (p.icon || '') : '';
    if (labelInput) labelInput.value = p ? (p.label || '') : '';
    if (suffixInput) suffixInput.value = p ? (p.suffix || '') : '';
    if (minInput) minInput.value = p ? p.min : 0;
    if (maxInput) maxInput.value = p ? p.max : 100;
    if (valueInput) valueInput.value = (p && typeof w.parameters[key] === 'number') ? w.parameters[key] : 50;
    if (descInput) descInput.value = p ? (p.desc || '') : '';
  } else {
    if (titleEl) titleEl.textContent = '添加世界参数';
    if (iconInput) iconInput.value = '⚙️';
    if (labelInput) labelInput.value = '';
    if (suffixInput) suffixInput.value = '';
    if (minInput) minInput.value = 0;
    if (maxInput) maxInput.value = 100;
    if (valueInput) valueInput.value = 50;
    if (descInput) descInput.value = '';
  }
  modal.classList.add('active');
};

var wsCloseParamModal = function () {
  wsParamEditKey = null;
  var modal = wsEl('wsParamModal');
  if (modal) modal.classList.remove('active');
};

var wsConfirmParamModal = function () {
  var w = wsEnsureWorld();
  var labelInput = wsEl('wsParamLabelInput');
  var label = labelInput ? labelInput.value.trim() : '';
  if (!label) { wsToast('请输入参数名称'); return; }

  var iconInput = wsEl('wsParamIconInput');
  var suffixInput = wsEl('wsParamSuffixInput');
  var minInput = wsEl('wsParamMinInput');
  var maxInput = wsEl('wsParamMaxInput');
  var valueInput = wsEl('wsParamValueInput');
  var descInput = wsEl('wsParamDescInput');

  var icon = iconInput ? iconInput.value.trim() : '⚙️';
  var suffix = suffixInput ? suffixInput.value.trim() : '';
  var minVal = parseInt(minInput ? minInput.value : '0', 10);
  var maxVal = parseInt(maxInput ? maxInput.value : '100', 10);
  var val = parseInt(valueInput ? valueInput.value : '50', 10);
  var desc = descInput ? descInput.value.trim() : '';

  if (isNaN(minVal)) minVal = 0;
  if (isNaN(maxVal) || maxVal <= minVal) maxVal = minVal + 10;
  if (isNaN(val)) val = Math.round((minVal + maxVal) / 2);
  val = Math.max(minVal, Math.min(maxVal, val));

  if (wsParamEditKey) {
    /* Edit existing */
    var defs = w.paramDefs || [];
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].key === wsParamEditKey) {
        defs[i].icon = icon;
        defs[i].label = label;
        defs[i].suffix = suffix;
        defs[i].min = minVal;
        defs[i].max = maxVal;
        defs[i].desc = desc;
        break;
      }
    }
    w.parameters[wsParamEditKey] = val;
  } else {
    /* Add new — generate unique key from label */
    var newKey = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    if (!w.paramDefs) w.paramDefs = [];
    if (!w.parameters) w.parameters = {};
    w.paramDefs.push({
      key: newKey,
      icon: icon,
      label: label,
      suffix: suffix,
      min: minVal,
      max: maxVal,
      desc: desc
    });
    w.parameters[newKey] = val;
  }

  w.updatedAt = Date.now();
  wsPersist();
  wsRenderParams();
  wsCloseParamModal();
  wsToast('参数已保存');
};

var wsDeleteParam = function (key) {
  var w = wsEnsureWorld();
  w.paramDefs = (w.paramDefs || []).filter(function (p) { return p.key !== key; });
  if (w.parameters) delete w.parameters[key];
  w.updatedAt = Date.now();
  wsPersist();
  wsRenderParams();
  wsToast('参数已删除');
};

/* ===== Render world rules ===== */
var wsRenderRules = function () {
  var w = wsEnsureWorld();
  var container = wsEl('wsRulesContainer');
  if (!container) return;
  if (!w.rules.length) {
    container.innerHTML = '<div class="ws-empty">暂无世界规则<br>点击下方按钮添加</div>';
    return;
  }
  var html = '';
  w.rules.forEach(function (r) {
    html +=
      '<div class="ws-rule-card" data-rule-id="' + r.id + '" onclick="wsOpenRuleModal(\'' + r.id + '\')">' +
        '<div class="ws-rule-title">📜 ' + wsEscapeHtml(r.title || '未命名规则') + '</div>' +
        '<div class="ws-rule-desc">' + wsEscapeHtml(r.desc || '') + '</div>' +
        '<button class="ws-rule-delete" onclick="event.stopPropagation(); wsDeleteRule(\'' + r.id + '\')">×</button>' +
      '</div>';
  });
  container.innerHTML = html;
};

/* ===== Rule modal ===== */
var wsRuleEditId = null;

var wsOpenRuleModal = function (id) {
  wsRuleEditId = id || null;
  var modal = wsEl('wsRuleModal');
  if (!modal) return;
  var titleEl = wsEl('wsRuleModalTitle');
  var titleInput = wsEl('wsRuleTitleInput');
  var descInput = wsEl('wsRuleDescInput');
  if (id) {
    var w = wsEnsureWorld();
    var rule = null;
    for (var i = 0; i < w.rules.length; i++) {
      if (w.rules[i].id === id) { rule = w.rules[i]; break; }
    }
    if (titleEl) titleEl.textContent = '编辑世界规则';
    if (titleInput) titleInput.value = rule ? (rule.title || '') : '';
    if (descInput) descInput.value = rule ? (rule.desc || '') : '';
  } else {
    if (titleEl) titleEl.textContent = '添加世界规则';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
  }
  modal.classList.add('active');
};

var wsCloseRuleModal = function () {
  wsRuleEditId = null;
  var modal = wsEl('wsRuleModal');
  if (modal) modal.classList.remove('active');
};

var wsConfirmRuleModal = function () {
  var w = wsEnsureWorld();
  var titleInput = wsEl('wsRuleTitleInput');
  var descInput = wsEl('wsRuleDescInput');
  var title = titleInput ? titleInput.value.trim() : '';
  var desc = descInput ? descInput.value.trim() : '';
  if (!title) { wsToast('请输入规则名称'); return; }
  if (wsRuleEditId) {
    for (var i = 0; i < w.rules.length; i++) {
      if (w.rules[i].id === wsRuleEditId) {
        w.rules[i].title = title;
        w.rules[i].desc = desc;
        break;
      }
    }
  } else {
    w.rules.push({ id: 'r' + Date.now(), title: title, desc: desc });
  }
  w.updatedAt = Date.now();
  wsPersist();
  wsRenderRules();
  wsCloseRuleModal();
  wsToast('规则已保存');
};

var wsDeleteRule = function (id) {
  var w = wsEnsureWorld();
  w.rules = w.rules.filter(function (r) { return r.id !== id; });
  w.updatedAt = Date.now();
  wsPersist();
  wsRenderRules();
  wsToast('规则已删除');
};

/* ============================================================
 * PART 11b - World Presets (save / select / delete)
 * ============================================================ */

/* Render preset tabs. */
var wsRenderPresets = function () {
  var w = wsEnsureWorld();
  var container = wsEl('wsPresetTabs');
  if (!container) return;
  if (!w.presets.length) {
    container.innerHTML = '<div class="ws-preset-empty">暂无预设 · 保存当前设定创建第一个预设</div>';
    return;
  }
  var html = '';
  w.presets.forEach(function (p) {
    var active = (w.activePresetId === p.id) ? ' active' : '';
    html +=
      '<div class="ws-preset-tab' + active + '" onclick="wsSelectPreset(\'' + p.id + '\')">' +
        wsEscapeHtml(p.name) +
        '<span class="del" onclick="event.stopPropagation(); wsDeletePreset(\'' + p.id + '\')">×</span>' +
      '</div>';
  });
  container.innerHTML = html;
};

/* Save current world state (seed + generated + parameters + rules) as a named preset. */
var wsSavePreset = function () {
  var w = wsEnsureWorld();
  var nameInput = wsEl('wsPresetNameInput');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) { wsToast('请输入预设名称'); return; }

  /* Ensure current form values are captured before saving */
  var seedInput = wsEl('wsSeedInput');
  if (seedInput) w.seed = seedInput.value;
  WS_FIELD_KEYS.forEach(function (k) {
    var el = wsEl('wsField_' + k);
    if (el) w.generated[k] = el.value;
  });

  var preset = {
    id: 'p' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: name,
    seed: w.seed || '',
    generated: wsClone(w.generated || {}),
    paramDefs: wsClone(w.paramDefs || []),
    parameters: wsClone(w.parameters || {}),
    rules: wsClone(w.rules || []),
    createdAt: Date.now()
  };
  w.presets.push(preset);
  w.activePresetId = preset.id;
  w.updatedAt = Date.now();
  wsPersist();
  wsRenderPresets();
  if (nameInput) nameInput.value = '';
  wsToast('预设「' + name + '」已保存');
};

/* Select a preset: load its seed, generated, parameters, rules into the current world. */
var wsSelectPreset = function (id) {
  var w = wsEnsureWorld();
  var preset = null;
  for (var i = 0; i < w.presets.length; i++) {
    if (w.presets[i].id === id) { preset = w.presets[i]; break; }
  }
  if (!preset) return;

  w.seed = preset.seed || '';
  w.generated = wsClone(preset.generated || {});
  w.paramDefs = wsClone(preset.paramDefs || []);
  w.parameters = wsClone(preset.parameters || {});
  w.rules = wsClone(preset.rules || []);
  w.activePresetId = id;
  w.updatedAt = Date.now();
  wsPersist();
  wsRenderAll();
  wsToast('已切换到预设：' + preset.name);
};

/* Delete a preset by id. */
var wsDeletePreset = function (id) {
  var w = wsEnsureWorld();
  w.presets = w.presets.filter(function (p) { return p.id !== id; });
  if (w.activePresetId === id) w.activePresetId = null;
  w.updatedAt = Date.now();
  wsPersist();
  wsRenderPresets();
  wsToast('预设已删除');
};

/* ============================================================
 * PART 8 - Loading UI
 * ============================================================ */

var wsShowLoading = function (text) {
  var overlay = wsEl('wsLoadingOverlay');
  var txt = wsEl('wsLoadingText');
  if (txt) txt.textContent = text || '加载中…';
  if (overlay) overlay.classList.add('active');
};

var wsHideLoading = function () {
  var overlay = wsEl('wsLoadingOverlay');
  if (overlay) overlay.classList.remove('active');
};

/* ============================================================
 * PART 9 - AI Prompts
 * ============================================================ */

/* Build the Chinese, detailed expansion prompt. Returns JSON with 6 fields. */
var wsBuildExpandPrompt = function (seed) {
  return '请根据以下世界观种子，扩写生成一个完整、自洽、富有想象力的世界设定。\n\n' +
    '【世界观种子】\n' + seed + '\n\n' +
    '【任务】\n' +
    '请从以下六个维度进行详细扩写：\n' +
    '1. era（时代背景）：这个世界的时代设定、历史阶段、重要的时代特征与背景事件。\n' +
    '2. social（社会结构）：阶层划分、政治体制、权力结构、普通人的生活状态。\n' +
    '3. tech（科技水平）：科技或力量的发展程度、标志性技术或能力、与现实的差异。\n' +
    '4. culture（文化特征）：信仰、习俗、艺术、语言、价值观等文化面貌。\n' +
    '5. geography（地理环境）：主要地理地貌、气候、重要地点与文明分布。\n' +
    '6. specialRules（特殊规则）：这个世界独有的运行法则，如魔法体系、修炼体系、超自然规则、禁忌等（若为写实题材可写社会潜规则）。\n\n' +
    '同时，请根据世界观设定，生成相应的世界参数和世界规则：\n\n' +
    '【世界参数】\n' +
    '根据这个世界观的特点，设计4-8个最能体现该世界特征的可调节参数。不要固定使用某一套参数，而是根据世界观自由发挥。\n' +
    '每个参数包含：\n' +
    '- key：英文标识符（如 danger, faith, technology, corruption 等）\n' +
    '- icon：一个emoji图标\n' +
    '- label：中文名称（2-6字）\n' +
    '- suffix：单位后缀（如 %, /10, x, 级）\n' +
    '- min：最小值（整数）\n' +
    '- max：最大值（整数）\n' +
    '- value：当前值（整数，在min和max之间，要合理反映世界观）\n' +
    '- desc：一句话说明该参数的影响（10-30字）\n\n' +
    '例如：蒸汽朋克世界可能有「蒸汽压力」「齿轮技术」「雾霾浓度」「阶级矛盾」等参数；\n' +
    '修仙世界可能有「灵气浓度」「天道压制」「宗门势力」「凡仙之隔」等参数。\n\n' +
    '【世界规则】（3-5条具体规则）\n' +
    '每条规则包含 title（规则名称，简短）和 desc（规则描述，具体说明该规则如何影响世界和角色行为）。\n' +
    '规则应直接源自世界观设定，具有操作性，能指导角色扮演与世界运行。\n\n' +
    '【要求】\n' +
    '- 每个维度用2-4句具体描述，避免空泛。\n' +
    '- 各维度设定之间要相互自洽、相互呼应。\n' +
    '- 世界参数要贴合世界观特征，不要套用通用模板。\n' +
    '- 世界规则要具体、有操作性，每条规则title不超过10字，desc为1-2句。\n' +
    '- 语言为中文。\n' +
    '- 严格只返回如下JSON格式，不要包含任何解释性文字或代码块标记：\n' +
    '{"era":"","social":"","tech":"","culture":"","geography":"","specialRules":"","paramDefs":[{"key":"","icon":"","label":"","suffix":"","min":0,"max":100,"value":50,"desc":""}],"rules":[{"title":"","desc":""}]}';
};

/* ============================================================
 * PART 10 - Core actions
 * ============================================================ */

/* AI expand world from the seed textarea. */
var worldGenerateExpand = async function () {
  if (wsState.generating) return;
  if (typeof callApi !== 'function') { wsToast('AI 接口不可用'); return; }

  var seedInput = wsEl('wsSeedInput');
  var seed = seedInput ? seedInput.value.trim() : '';
  if (!seed) { wsToast('请先输入世界观种子'); return; }

  wsState.generating = true;
  wsShowLoading('AI 正在扩写世界设定…');
  try {
    var reply = await callApi([
      { role: 'system', content: '你是一位专业的世界观设定师。请严格按照要求返回JSON格式数据，不要包含任何解释性文字或代码块标记。' },
      { role: 'user', content: wsBuildExpandPrompt(seed) }
    ]);
    var data = wsParseJson(reply);
    if (!data) throw new Error('AI 返回格式错误');

    var w = wsEnsureWorld();
    w.seed = seed;
    w.generated = {
      era: String(data.era || '').trim(),
      social: String(data.social || '').trim(),
      tech: String(data.tech || '').trim(),
      culture: String(data.culture || '').trim(),
      geography: String(data.geography || '').trim(),
      specialRules: String(data.specialRules || data.special_rules || '').trim()
    };

    /* 应用 AI 生成的世界参数定义和值 */
    if (Array.isArray(data.paramDefs) && data.paramDefs.length > 0) {
      w.paramDefs = [];
      w.parameters = {};
      data.paramDefs.forEach(function (pd) {
        var key = String(pd.key || '').trim();
        if (!key) return;
        var minVal = parseInt(pd.min, 10); if (isNaN(minVal)) minVal = 0;
        var maxVal = parseInt(pd.max, 10); if (isNaN(maxVal)) maxVal = 100;
        if (maxVal <= minVal) maxVal = minVal + 10;
        var val = parseInt(pd.value, 10);
        if (isNaN(val)) val = Math.round((minVal + maxVal) / 2);
        val = Math.max(minVal, Math.min(maxVal, val));
        w.paramDefs.push({
          key: key,
          icon: String(pd.icon || '⚙️').trim(),
          label: String(pd.label || key).trim(),
          suffix: String(pd.suffix || '').trim(),
          min: minVal,
          max: maxVal,
          desc: String(pd.desc || '').trim()
        });
        w.parameters[key] = val;
      });
    }

    /* 应用 AI 生成的世界规则 */
    if (Array.isArray(data.rules) && data.rules.length > 0) {
      w.rules = data.rules.slice(0, 10).map(function (r) {
        return {
          id: 'r' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          title: String(r.title || r.name || '').trim(),
          desc: String(r.desc || r.description || '').trim()
        };
      }).filter(function (r) { return r.title || r.desc; });
    }

    if (!w.createdAt) w.createdAt = Date.now();
    w.updatedAt = Date.now();
    wsPersist();
    wsRenderAll();
    wsToast('世界观、参数与规则生成成功');
  } catch (e) {
    wsToast('生成失败：' + ((e && e.message) ? e.message : '请稍后重试'));
  } finally {
    wsState.generating = false;
    wsHideLoading();
  }
};

/* Save seed + all generated fields + parameters + rules from the form into config.world. */
var worldSaveData = function () {
  var w = wsEnsureWorld();

  var seedInput = wsEl('wsSeedInput');
  if (seedInput) w.seed = seedInput.value;

  WS_FIELD_KEYS.forEach(function (k) {
    var el = wsEl('wsField_' + k);
    if (el) w.generated[k] = el.value;
  });

  /* 参数值已在滑块变化时实时保存，此处无需额外处理 */

  if (!w.createdAt) w.createdAt = Date.now();
  w.updatedAt = Date.now();
  wsPersist();
  wsToast('世界基调已保存（含设定、参数、规则）');
};

/* ============================================================
 * PART 12 - Settings modal
 * ============================================================ */

var wsOpenSettings = function () {
  var w = wsEnsureWorld();
  var info = wsEl('wsSettingsInfo');
  if (info) {
    info.innerHTML =
      '<div class="ws-settings-row"><span>创建时间</span><span>' + wsEscapeHtml(wsFormatDate(w.createdAt)) + '</span></div>' +
      '<div class="ws-settings-row"><span>最后更新</span><span>' + wsEscapeHtml(wsFormatDate(w.updatedAt)) + '</span></div>' +
      '<div class="ws-settings-row"><span>世界规则</span><span>' + (w.rules ? w.rules.length : 0) + ' 条</span></div>' +
      '<div class="ws-settings-row"><span>世界预设</span><span>' + (w.presets ? w.presets.length : 0) + ' 个</span></div>';
  }
  var modal = wsEl('wsSettingsModal');
  if (modal) modal.classList.add('active');
};

var wsCloseSettings = function () {
  var modal = wsEl('wsSettingsModal');
  if (modal) modal.classList.remove('active');
};

var wsResetWorld = function () {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (!window.confirm('确定要重置世界吗？所有世界设定将被清空，预设保留，且不可恢复。')) return;
  }
  var now = Date.now();
  var wObj = wsGetEditingWorld();
  /* Preserve presets across reset（只重置当前编辑世界，不影响其他世界） */
  var savedPresets = wObj.worldSetting.presets || [];
  var savedActiveId = wObj.worldSetting.activePresetId || null;
  wObj.worldSetting = wsClone(WS_DEFAULT_WORLD);
  wObj.worldSetting.presets = savedPresets;
  wObj.worldSetting.activePresetId = savedActiveId;
  wObj.worldSetting.createdAt = now;
  wObj.worldSetting.updatedAt = now;
  wsSyncActive(wObj);
  wsPersist();
  wsRenderAll();
  wsCloseSettings();
  wsToast('世界已重置（预设保留）');
};

/* ============================================================
 * PART 13 - Open / Close
 * ============================================================ */

var openWorldSystem = function () {
  wsEnsureWorld();
  var overlay = wsEl('worldSystemOverlay');
  if (overlay) overlay.classList.add('active');
  wsState.active = true;
  wsRenderAll();
  wsUpdateTitle();
};

var closeWorldSystem = function () {
  wsState.active = false;
  var overlay = wsEl('worldSystemOverlay');
  if (overlay) overlay.classList.remove('active');
  wsHideLoading();
  wsCloseSettings();
  wsCloseRuleModal();
  wsCloseParamModal();
};

/* ============================================================
 * PART 14 - Event binding
 * ============================================================ */

var wsBindEvents = function () {
  var back = wsEl('wsBackBtn');
  if (back) back.addEventListener('click', closeWorldSystem);

  var close = wsEl('wsCloseBtn');
  if (close) close.addEventListener('click', closeWorldSystem);

  var settings = wsEl('wsSettingsBtn');
  if (settings) settings.addEventListener('click', wsOpenSettings);

  var switchW = wsEl('wsWorldSwitchBtn');
  if (switchW) switchW.addEventListener('click', wsOpenWorldList);
  var createW = wsEl('wsCreateWorldBtn');
  if (createW) createW.addEventListener('click', wsCreateWorld);
  var wlClose = wsEl('wsWorldListClose');
  if (wlClose) wlClose.addEventListener('click', wsCloseWorldList);
  var wlModal = wsEl('wsWorldListModal');
  if (wlModal) wlModal.addEventListener('click', function (e) { if (e.target === this) wsCloseWorldList(); });

  var gen = wsEl('wsGenerateBtn');
  if (gen) gen.addEventListener('click', worldGenerateExpand);

  var save = wsEl('wsSaveBtn');
  if (save) save.addEventListener('click', worldSaveData);

  /* settings modal */
  var settingsCancel = wsEl('wsSettingsCancel');
  if (settingsCancel) settingsCancel.addEventListener('click', wsCloseSettings);
  var settingsReset = wsEl('wsSettingsReset');
  if (settingsReset) settingsReset.addEventListener('click', wsResetWorld);
  var settingsModal = wsEl('wsSettingsModal');
  if (settingsModal) settingsModal.addEventListener('click', function (e) {
    if (e.target === this) wsCloseSettings();
  });

  /* rule modal */
  var addRule = wsEl('wsAddRuleBtn');
  if (addRule) addRule.addEventListener('click', function () { wsOpenRuleModal(null); });
  var ruleCancel = wsEl('wsRuleModalCancel');
  if (ruleCancel) ruleCancel.addEventListener('click', wsCloseRuleModal);
  var ruleConfirm = wsEl('wsRuleModalConfirm');
  if (ruleConfirm) ruleConfirm.addEventListener('click', wsConfirmRuleModal);
  var ruleModal = wsEl('wsRuleModal');
  if (ruleModal) ruleModal.addEventListener('click', function (e) {
    if (e.target === this) wsCloseRuleModal();
  });

  /* parameter modal */
  var addParam = wsEl('wsAddParamBtn');
  if (addParam) addParam.addEventListener('click', function () { wsOpenParamModal(null); });
  var paramCancel = wsEl('wsParamModalCancel');
  if (paramCancel) paramCancel.addEventListener('click', wsCloseParamModal);
  var paramConfirm = wsEl('wsParamModalConfirm');
  if (paramConfirm) paramConfirm.addEventListener('click', wsConfirmParamModal);
  var paramModal = wsEl('wsParamModal');
  if (paramModal) paramModal.addEventListener('click', function (e) {
    if (e.target === this) wsCloseParamModal();
  });

  /* preset save button */
  var savePreset = wsEl('wsSavePresetBtn');
  if (savePreset) savePreset.addEventListener('click', wsSavePreset);
};

/* ============================================================
 * PART 15 - Init (inject CSS + HTML, bind events)
 * ============================================================ */

var initWorldSystem = function () {
  if (wsInitialized) return;
  wsInitialized = true;

  /* Inject CSS */
  var style = document.createElement('style');
  style.setAttribute('data-ws-styles', 'true');
  style.textContent = WORLD_CSS;
  document.head.appendChild(style);

  /* Inject HTML */
  var container = document.createElement('div');
  container.innerHTML = WORLD_HTML;
  var wsHost = document.getElementById('phoneScreen') || document.body;
  while (container.firstChild) {
    wsHost.appendChild(container.firstChild);
  }

  wsEnsureWorld();
  wsBindEvents();
};

/* ============================================================
 * Export to global scope
 * ============================================================ */

window.WORLD_CSS = WORLD_CSS;
window.WORLD_HTML = WORLD_HTML;
window.WS_FIELD_KEYS = WS_FIELD_KEYS;
window.WS_DEFAULT_WORLD = WS_DEFAULT_WORLD;
window.wsState = wsState;
window.wsEl = wsEl;
window.wsEscapeHtml = wsEscapeHtml;
window.wsToast = wsToast;
window.wsEnsureWorld = wsEnsureWorld;
window.wsPersist = wsPersist;
window.wsRenderAll = wsRenderAll;
window.wsParseJson = wsParseJson;
window.wsBuildExpandPrompt = wsBuildExpandPrompt;
window.openWorldSystem = openWorldSystem;
window.closeWorldSystem = closeWorldSystem;
window.initWorldSystem = initWorldSystem;
window.worldGenerateExpand = worldGenerateExpand;
window.worldSaveData = worldSaveData;
window.wsOpenSettings = wsOpenSettings;
window.wsCloseSettings = wsCloseSettings;
window.wsResetWorld = wsResetWorld;
window.wsRenderParams = wsRenderParams;
window.wsOnParamChange = wsOnParamChange;
window.wsOpenParamModal = wsOpenParamModal;
window.wsCloseParamModal = wsCloseParamModal;
window.wsConfirmParamModal = wsConfirmParamModal;
window.wsDeleteParam = wsDeleteParam;
window.wsRenderRules = wsRenderRules;
window.wsOpenRuleModal = wsOpenRuleModal;
window.wsCloseRuleModal = wsCloseRuleModal;
window.wsConfirmRuleModal = wsConfirmRuleModal;
window.wsDeleteRule = wsDeleteRule;
window.wsRenderPresets = wsRenderPresets;
window.wsSavePreset = wsSavePreset;
window.wsSelectPreset = wsSelectPreset;
window.wsDeletePreset = wsDeletePreset;
window.wsEnsureWorlds = wsEnsureWorlds;
window.wsGetEditingWorld = wsGetEditingWorld;
window.wsSelectEditingWorld = wsSelectEditingWorld;
window.wsCreateWorld = wsCreateWorld;
window.wsOpenWorldList = wsOpenWorldList;
window.wsCloseWorldList = wsCloseWorldList;
window.wsRenderWorldList = wsRenderWorldList;
window.wsUpdateTitle = wsUpdateTitle;

})();

