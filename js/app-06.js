
// ===== 把静态覆盖层收进手机框（fixed 定位以 phoneScreen 为包含块） =====
(function() {
  var ps = document.getElementById('phoneScreen');
  if (!ps) return;
  ['shopAppOverlay', 'foodAppOverlay'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode !== ps) ps.appendChild(el);
  });
})();

// ===== 初始化四大新功能模块 =====
try { initWorldSystem(); } catch(e) { console.error('World System init error:', e); }
// NPC系统在自身IIFE中自动初始化
try { initRelationChain(); } catch(e) { console.error('Relation Chain init error:', e); }
try { initPhotoWall(); } catch(e) { console.error('Photo Wall init error:', e); }

// ===== 渲染桌面小组件 + Dock 栏 =====
try { renderHomeWidgets(); } catch(e) { console.warn('Home widgets render error:', e); }
try { renderDock(); } catch(e) { console.warn('Dock render error:', e); }

// ===== Shopping & Food App =====

// ==================== Shopping App ====================

var SHOP_CATEGORIES = ['推荐', '女装', '男装', '数码', '美妆', '零食', '家居', '情趣用品'];
var shopCurrentCat = '推荐';
var shopCurrentProducts = [];
var shopViewMode = 'products';
var shopBgGenerating = {};
var SHOP_DEFAULT_CATS = ['推荐', '女装', '男装', '数码', '美妆', '零食', '家居', '情趣用品']; // 默认标签（可删除，可恢复）

/* 获取当前标签列表（默认+自定义） */
function shopGetCategories() {
  var custom = [];
  try { custom = Store.get('shop_custom_cats', []); } catch(e) { custom = []; }
  var deleted = shopGetDeletedDefaults();
  return SHOP_DEFAULT_CATS.filter(function(c) { return deleted.indexOf(c) < 0; }).concat(custom);
}

/* 获取自定义标签列表 */
function shopGetCustomCats() {
  try { return Store.get('shop_custom_cats', []); } catch(e) { return []; }
}

/* 保存自定义标签列表 */
function shopSaveCustomCats(cats) {
  try { Store.set('shop_custom_cats', cats); } catch(e) {}
}

/* 获取已删除的默认标签列表 */
function shopGetDeletedDefaults() {
  try { return Store.get('shop_deleted_default_cats', []); } catch(e) { return []; }
}

/* 保存已删除的默认标签列表 */
function shopSaveDeletedDefaults(list) {
  try { Store.set('shop_deleted_default_cats', list); } catch(e) {}
}

// --- Mock Data for Shopping ---
var catProductMap = {
  '推荐': ['轻盈针织开衫', '复古格纹衬衫', '高腰直筒牛仔裤', '纯棉宽松T恤', '法式碎花连衣裙', '加绒连帽卫衣', '显瘦西装外套', '百搭休闲裤'],
  '女装': ['法式碎花连衣裙', '高腰A字半身裙', '针织开衫薄款', '丝绸吊带睡衣', '韩系oversize卫衣', '复古牛仔阔腿裤', '收腰西装外套', '蕾丝拼接衬衫'],
  '男装': ['工装夹克外套', '纯棉圆领T恤', '修身直筒西裤', '连帽卫衣加绒', '商务POLO衫', '牛仔衬衫长袖', '运动休闲短裤', '羊毛混纺大衣'],
  '数码': ['头戴式主动降噪蓝牙耳机', '机械键盘红轴茶轴', '便携快充移动电源20000mAh', '智能手环心率血氧监测', '无线充电器15W快充', '便携蓝牙音箱防水', 'USB-C扩展坞七合一', '电竞游戏鼠标轻量化'],
  '美妆': ['玻尿酸烟酰胺补水精华液', '哑光雾面丝绒口红', '水润遮瑕粉底液持久', '氨基酸洁面乳温和不紧绷', '防晒霜SPF50+清爽不油腻', '睫毛纤长卷翘防水睫毛膏', '蜜粉饼控油持久定妆', '眼影盘大地色日常通勤'],
  '零食': ['每日坚果混合装30包', '手撕面包整箱早餐代餐', '魔芋爽辣条整箱', '冻干草莓脆水果干', '低脂全麦饼干代餐饱腹', '手剥核桃薄皮新鲜', '海苔脆夹心海苔卷', '无糖薄荷糖清新口气'],
  '家居': ['护腰透气人体工学办公椅', '5.5L大容量智能空气炸锅', '纯棉四件套磨毛床品', '北欧风落地灯遥控调光', '硅藻泥地垫吸水防滑', '保温壶316不锈钢大容量', '收纳箱可折叠加厚防潮', '香薰精油加湿器静音'],
  '情趣用品': ['静音按摩棒多频震动防水', '人体工学仿真器具硅胶', '无线遥控跳蛋APP互动', '水基润滑液玻尿酸温和', 'SM束缚丝绸眼罩绑带套装', '延时喷剂植物萃取温和', '冰火双重口感安全套超薄', '情侣遥控蝴蝶震动器静音']
};

var catDescMap = {
  '推荐': '采用高品质面料，触感柔软亲肤，透气性佳不易起球。版型修身不紧绷，兼顾舒适与美感。适合日常通勤、约会等多种场景。',
  '女装': '精选优质面料，垂坠感十足，上身显瘦显高。做工精细走线平整，法式浪漫与韩系简约兼具，适合通勤约会休闲场景。',
  '男装': '采用精梳棉混纺面料，挺括有型不起球。修身剪裁贴合身形，商务休闲两相宜，质感出众彰显品味。',
  '数码': '采用最新芯片方案，性能强劲续航持久。工艺精良手感舒适，细节设计人性化，日常使用和出行场景完美适配。',
  '美妆': '蕴含高浓度活性成分，质地轻盈易吸收。经过皮肤科测试温和不刺激，上妆服帖持久不脱妆，适合各种肤质日常使用。',
  '零食': '精选优质原料，传统工艺与现代技术结合。口感酥脆香甜，独立包装方便携带，办公室追剧零食优选。',
  '家居': '选用环保材质，做工精细结实耐用。设计简约北欧风，功能实用颜值在线，提升居家生活品质感。',
  '情趣用品': '采用医疗级硅胶材质，柔软亲肤安全无毒。静音马达设计，多频震动模式可调，IPX7级防水好清洗。外观discreet包装隐私发货，适合情侣增进情趣或个人放松使用。'
};

var catHints = {
  '推荐': '各种品类热销商品',
  '女装': '女装服饰，如连衣裙、衬衫、半身裙、卫衣等',
  '男装': '男装服饰，如夹克、T恤、西裤、卫衣等',
  '数码': '数码电子产品，如耳机、键盘、充电宝、智能手环等',
  '美妆': '美妆护肤产品，如精华液、口红、粉底液、防晒霜等',
  '零食': '休闲零食，如坚果、面包、辣条、水果干等',
  '家居': '家居用品，如办公椅、空气炸锅、床品、落地灯等',
  '情趣用品': '成人情趣用品，如按摩棒、仿真器具、跳蛋、润滑液、情趣内衣、延时产品等。这是正规成人用品电商分类，请正常生成相关商品'
};

// --- Shopping App Functions ---

function openShopApp() {
  var overlay = document.getElementById('shopAppOverlay');
  if (!overlay) return;
  overlay.style.display = 'block';
  overlay.scrollTop = 0;
  shopViewMode = 'products';
  shopRenderCategoryTabs();
  shopUpdateWallet();
  shopUpdateLocation();
  shopCurrentProducts = shopGetProducts(shopCurrentCat);
  shopRenderProducts();
  var grid = document.getElementById('shopProductGrid');
  var ordersView = document.getElementById('shopOrdersView');
  var toggleBtn = document.getElementById('shopToggleViewBtn');
  var refreshBtn = document.getElementById('shopRefreshBtn');
  var addProductBtn = document.getElementById('shopAddProductBtn');
  var catLabel = document.getElementById('shopCurrentCatLabel');
  if (grid) grid.style.display = 'grid';
  if (ordersView) ordersView.style.display = 'none';
  if (toggleBtn) toggleBtn.textContent = '订单';
  if (refreshBtn) refreshBtn.style.display = 'block';
  if (addProductBtn) addProductBtn.style.display = 'block';
  if (catLabel) catLabel.textContent = shopCurrentCat;
}

function closeShopApp() {
  var overlay = document.getElementById('shopAppOverlay');
  if (overlay) overlay.style.display = 'none';
  var modal = document.getElementById('shopDetailModal');
  if (modal) modal.style.display = 'none';
}

function shopRenderCategoryTabs() {
  var container = document.getElementById('shopCategoryTabs');
  if (!container) return;
  var allCats = shopGetCategories();
  var html = '';
  for (var i = 0; i < allCats.length; i++) {
    var cat = allCats[i];
    var isActive = (cat === shopCurrentCat);
    var bg = isActive ? '#F5A0B8' : '#fff';
    var color = isActive ? '#fff' : '#666';
    var border = isActive ? 'none' : '1px solid #eee';
    var isCustom = SHOP_DEFAULT_CATS.indexOf(cat) < 0;
    html += '<button onclick="shopSwitchCategory(\'' + cat.replace(/'/g, "\\'") + '\')" style="background:' + bg + ';color:' + color + ';border:' + border + ';padding:6px 14px;border-radius:16px;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:4px;">' + cat;
    if (isCustom) {
      html += '<span style="font-size:10px;opacity:0.7;">✨</span>';
    }
    html += '</button>';
  }
  /* 管理标签按钮 */
  html += '<button onclick="shopShowManageCatModal()" style="background:#f5f5f5;color:#999;border:1px dashed #ccc;padding:6px 14px;border-radius:16px;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">+ 管理标签</button>';
  container.innerHTML = html;
}

function shopSwitchCategory(cat) {
  shopCurrentCat = cat;
  var label = document.getElementById('shopCurrentCatLabel');
  if (label) label.textContent = cat;
  shopRenderCategoryTabs();
  shopCurrentProducts = shopGetProducts(cat);
  shopRenderProducts();
}

function shopToggleView() {
  var grid = document.getElementById('shopProductGrid');
  var ordersView = document.getElementById('shopOrdersView');
  var btn = document.getElementById('shopToggleViewBtn');
  var catLabel = document.getElementById('shopCurrentCatLabel');
  var refreshBtn = document.getElementById('shopRefreshBtn');
  var addProductBtn = document.getElementById('shopAddProductBtn');
  if (shopViewMode === 'products') {
    shopViewMode = 'orders';
    if (grid) grid.style.display = 'none';
    if (ordersView) ordersView.style.display = 'block';
    if (btn) btn.textContent = '商品';
    if (catLabel) catLabel.textContent = '我的订单';
    if (refreshBtn) refreshBtn.style.display = 'none';
    if (addProductBtn) addProductBtn.style.display = 'none';
    shopRenderOrders();
  } else {
    shopViewMode = 'products';
    if (grid) grid.style.display = 'grid';
    if (ordersView) ordersView.style.display = 'none';
    if (btn) btn.textContent = '订单';
    if (catLabel) catLabel.textContent = shopCurrentCat;
    if (refreshBtn) refreshBtn.style.display = 'block';
    if (addProductBtn) addProductBtn.style.display = 'block';
    shopRenderProducts();
  }
}

function shopUpdateWallet() {
  var el = document.getElementById('shopWalletDisplay');
  if (el) el.textContent = (config.user.wallet || 0).toFixed(2);
}

function shopUpdateLocation() {
  /* Map MCP removed from shop app */
}

function shopGetWallet() {
  return config.user.wallet || 0;
}

function shopDeductWallet(amount) {
  if (!config.user.wallet) config.user.wallet = 0;
  config.user.wallet -= amount;
  if (!config.user.walletHistory) config.user.walletHistory = [];
  config.user.walletHistory.unshift({
    type: 'consume',
    amount: -amount,
    time: Date.now(),
    desc: '购物消费'
  });
  Store.set('config', config);
  shopUpdateWallet();
}

function shopGetProducts(cat) {
  try {
    return Store.get('shop_products_' + cat, []);
  } catch (e) {
    return [];
  }
}

function shopSaveProducts(cat, products) {
  try {
    Store.set('shop_products_' + cat, products);
  } catch (e) {}
}

function shopGetOrders() {
  try {
    return Store.get('shop_orders', []);
  } catch (e) {
    return [];
  }
}

function shopSaveOrders(orders) {
  try {
    Store.set('shop_orders', orders);
  } catch (e) {}
}

function shopGenerateMockProducts(cat) {
  var names = catProductMap[cat] || catProductMap['推荐'];
  var desc = catDescMap[cat] || catDescMap['推荐'];
  var platforms = ['淘宝', '京东', '拼多多', '天猫'];
  var tags = ['限时秒杀', '包邮', '热卖', '新品', ''];
  var products = [];
  for (var i = 0; i < names.length; i++) {
    products.push({
      name: names[i],
      price: (Math.floor(Math.random() * 400) + 29).toFixed(2),
      description: '【' + cat + '精选】' + desc,
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      tag: tags[Math.floor(Math.random() * tags.length)]
    });
  }
  return products;
}

/* 为自定义标签生成通用mock商品 */
function shopGenerateMockProductsForCustom(cat) {
  var genericNames = [
    cat + '精选款A', cat + '热卖款B', cat + '性价比款C', cat + '高端款D',
    cat + '入门款E', cat + '爆款F', cat + '新品G', cat + '经典款H'
  ];
  var platforms = ['淘宝', '京东', '拼多多', '天猫'];
  var tags = ['限时秒杀', '包邮', '热卖', '新品', ''];
  var products = [];
  for (var i = 0; i < genericNames.length; i++) {
    products.push({
      name: genericNames[i],
      price: (Math.floor(Math.random() * 400) + 29).toFixed(2),
      description: '【' + cat + '精选】优质好物，品质保证，值得购买。',
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      tag: tags[Math.floor(Math.random() * tags.length)]
    });
  }
  return products;
}

function shopRenderProducts() {
  var grid = document.getElementById('shopProductGrid');
  if (!grid) return;
  if (!shopCurrentProducts || shopCurrentProducts.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;padding:50px 0;"><div style="font-size:48px;margin-bottom:12px;">🛍️</div><div style="font-size:14px;">暂无商品</div><div style="font-size:12px;margin-top:4px;">点击刷新生成商品，或点击「+ 添加商品」手动添加</div></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < shopCurrentProducts.length; i++) {
    var p = shopCurrentProducts[i];
    var isUserAdded = !!p._userAdded;
    var cardBorder = isUserAdded ? '2px solid #F5A0B8' : 'none';
    html += '<div onclick="shopShowProductDetail(' + i + ')" style="background:#fff;border-radius:12px;overflow:hidden;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.06);border:' + cardBorder + ';">';
    var iconEmoji = isUserAdded ? '📦' : '🛍️';
    var bgGradient = isUserAdded ? 'linear-gradient(135deg,#FFF5E6,#FFE4E1)' : 'linear-gradient(135deg,#FFF0F5,#FFE4E1)';
    html += '<div style="height:110px;background:' + bgGradient + ';display:flex;align-items:center;justify-content:center;font-size:40px;position:relative;">' + iconEmoji;
    if (isUserAdded) {
      html += '<span style="position:absolute;top:6px;right:6px;background:#F5A0B8;color:#fff;font-size:9px;padding:2px 6px;border-radius:8px;">自添加</span>';
    }
    html += '</div>';
    html += '<div style="padding:10px;">';
    html += '<div style="font-size:13px;color:#333;font-weight:bold;line-height:1.4;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escapeHtml(p.name) + '</div>';
    html += '<div style="color:#F5A0B8;font-size:16px;font-weight:bold;margin-bottom:4px;">¥' + escapeHtml(p.price) + '</div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="color:#999;font-size:11px;">' + escapeHtml(p.platform || '') + '</span>';
    if (p.tag) {
      html += '<span style="background:#FFF0F5;color:#F5A0B8;padding:1px 6px;border-radius:6px;font-size:10px;">' + escapeHtml(p.tag) + '</span>';
    }
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }
  grid.innerHTML = html;
}

function shopShowProductDetail(idx) {
  var p = shopCurrentProducts[idx];
  if (!p) return;
  var modal = document.getElementById('shopDetailModal');
  var content = document.getElementById('shopDetailContent');
  if (!modal || !content) return;

  var isUserAdded = !!p._userAdded;
  var html = '';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  if (isUserAdded) {
    html += '<span style="background:#F5A0B8;color:#fff;font-size:11px;padding:2px 8px;border-radius:8px;">自添加商品</span>';
  } else {
    html += '<span></span>';
  }
  html += '<button onclick="document.getElementById(\'shopDetailModal\').style.display=\'none\'" style="background:#f0f0f0;border:none;border-radius:50%;width:30px;height:30px;font-size:16px;cursor:pointer;color:#666;">×</button>';
  html += '</div>';
  var detailIcon = isUserAdded ? '📦' : '🛍️';
  var detailBg = isUserAdded ? 'linear-gradient(135deg,#FFF5E6,#FFE4E1)' : 'linear-gradient(135deg,#FFF0F5,#FFE4E1)';
  html += '<div style="height:140px;background:' + detailBg + ';border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:56px;margin-bottom:12px;">' + detailIcon + '</div>';
  html += '<h3 style="margin:0 0 8px 0;color:#333;font-size:17px;">' + escapeHtml(p.name) + '</h3>';
  html += '<div style="color:#F5A0B8;font-size:22px;font-weight:bold;margin-bottom:8px;">¥' + escapeHtml(p.price) + '</div>';
  if (p.platform) html += '<div style="color:#999;font-size:13px;margin-bottom:4px;">📦 平台：' + escapeHtml(p.platform) + '</div>';
  if (p.tag) html += '<div style="margin-bottom:8px;"><span style="display:inline-block;background:#FFF0F5;color:#F5A0B8;padding:2px 8px;border-radius:8px;font-size:12px;">' + escapeHtml(p.tag) + '</span></div>';
  html += '<div style="color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;padding:10px;background:#FFF9F2;border-radius:8px;">' + escapeHtml(p.description) + '</div>';
  /* 用户添加的商品可以删除 */
  if (isUserAdded) {
    html += '<button onclick="shopDeleteUserProduct(' + idx + ')" style="width:100%;background:rgba(255,59,48,0.1);color:#FF3B30;border:none;padding:10px;border-radius:12px;font-size:14px;cursor:pointer;margin-bottom:12px;">🗑 删除此商品</button>';
  }
  html += '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:8px;">';
  html += '<button onclick="shopPlaceOrder(' + idx + ', \'self\', null)" style="width:100%;background:linear-gradient(135deg,#F5A0B8,#FFD1DC);color:#fff;border:none;padding:12px;border-radius:12px;font-size:15px;font-weight:bold;cursor:pointer;margin-bottom:8px;">为自己购买</button>';
  if (config.characters && config.characters.length > 0) {
    html += '<div style="color:#999;font-size:13px;margin:12px 0 6px 0;">买给角色：</div>';
    for (var i = 0; i < config.characters.length; i++) {
      var c = config.characters[i];
      var avatarChar = c.name ? c.name.charAt(0) : '?';
      var bg = c.avatarBg || '#F5A0B8';
      html += '<button onclick="shopPlaceOrder(' + idx + ', \'role\', \'' + c.id + '\')" style="display:flex;align-items:center;gap:8px;width:100%;background:#fff;border:1px solid #f0f0f0;padding:10px;border-radius:10px;font-size:14px;cursor:pointer;margin-bottom:6px;">';
      if (c.avatar) {
        html += '<img src="' + escapeHtml(c.avatar) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"  alt=""/>';
      } else {
        html += '<div style="width:32px;height:32px;border-radius:50%;background:' + bg + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;flex-shrink:0;">' + escapeHtml(avatarChar) + '</div>';
      }
      html += '<span style="color:#333;">买给 ' + escapeHtml(c.name) + '</span>';
      html += '</button>';
    }
  }
  html += '</div>';

  content.innerHTML = html;
  modal.style.display = 'block';
}

function shopPlaceOrder(idx, recipient, roleId) {
  var p = shopCurrentProducts[idx];
  if (!p) return;
  var price = parseFloat(p.price);
  var wallet = shopGetWallet();
  if (wallet < price) {
    showToast('钱包余额不足');
    return;
  }
  shopDeductWallet(price);

  var orderNo = genId();
  var recipientName = '自己';
  if (recipient === 'role' && roleId) {
    var char = null;
    for (var i = 0; i < config.characters.length; i++) {
      if (String(config.characters[i].id) === String(roleId)) {
        char = config.characters[i];
        break;
      }
    }
    if (char) {
      recipientName = char.name;
      var orderData = { productName: p.name, price: p.price, orderNo: orderNo, platform: p.platform, recipient: recipientName, orderType: 'shop' };
      var msgContent = '[order]' + JSON.stringify(orderData);
      if (!char.chatHistory) char.chatHistory = [];
      char.chatHistory.push({
        role: 'user',
        content: msgContent,
        time: Date.now(),
        type: 'order'
      });
      // 如果目标角色正好是当前聊天角色，同步config.chatHistory以确保界面即时刷新
      if (currentChatMode === 'online' && !isNpcChatMode && !isGroupChatMode &&
          config.characters && config.characters[currentCharIdx] === char) {
        config.chatHistory = char.chatHistory;
      }
      Store.set('config', config);
      if (typeof renderMessages === 'function') renderMessages();
      showToast('已买给' + char.name + '，订单已发送');
    }
  } else {
    showToast('购买成功');
  }

  var orders = shopGetOrders();
  orders.unshift({
    orderNo: orderNo,
    productName: p.name,
    price: p.price,
    platform: p.platform,
    recipient: recipientName,
    roleId: roleId,
    time: Date.now(),
    type: 'shop'
  });
  shopSaveOrders(orders);

  var modal = document.getElementById('shopDetailModal');
  if (modal) modal.style.display = 'none';
  shopUpdateWallet();
}

function shopRenderOrders() {
  var view = document.getElementById('shopOrdersView');
  if (!view) return;
  var orders = shopGetOrders();
  if (orders.length === 0) {
    view.innerHTML = '<div style="text-align:center;color:#999;padding:50px 0;"><div style="font-size:48px;margin-bottom:12px;">📋</div>暂无订单</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var date = new Date(o.time);
    var timeStr = date.getMonth() + 1 + '/' + date.getDate() + ' ' + date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
    html += '<div style="background:#fff;border-radius:12px;padding:12px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">';
    html += '<span style="font-weight:bold;color:#333;font-size:15px;flex:1;">' + escapeHtml(o.productName) + '</span>';
    html += '<span style="color:#F5A0B8;font-weight:bold;font-size:15px;">¥' + escapeHtml(o.price) + '</span>';
    html += '</div>';
    html += '<div style="color:#999;font-size:12px;margin-bottom:2px;">订单号：' + escapeHtml(o.orderNo) + '</div>';
    html += '<div style="color:#999;font-size:12px;margin-bottom:2px;">📦 ' + escapeHtml(o.platform || '') + ' | 收件人：' + escapeHtml(o.recipient) + '</div>';
    html += '<div style="color:#bbb;font-size:11px;">' + timeStr + '</div>';
    html += '</div>';
  }
  view.innerHTML = html;
}

async function shopRefreshCategory() {
  var cat = shopCurrentCat;
  if (shopBgGenerating[cat]) {
    showToast('正在生成中，请稍候...');
    return;
  }
  shopBgGenerating[cat] = true;
  var btn = document.getElementById('shopRefreshBtn');
  if (btn) btn.textContent = '⏳ 生成中...';

  try {
    var products;
    if (config.api && config.api.baseUrl && config.api.apiKey && config.api.model) {
      var hint = shopGetCatHint(cat);
      var prompt = '你是一个电商平台商品推荐助手。请为"' + cat + '"分类生成8个商品。\n' +
        '重要：商品必须属于"' + cat + '"分类（' + hint + '），严禁生成与该分类无关的商品。\n' +
        '要求返回JSON数组，每个商品包含：name(商品名，必须符合' + cat + '分类), price(价格字符串如"99.90"), description(50-100字详细描述，包含材质、功能、卖点等), platform(淘宝/京东/拼多多/天猫之一), tag(可选标签如"限时秒杀"或"包邮"或"同城速达"，可为空字符串)。\n' +
        '只返回JSON数组，不要其他文字。';
      var messages = [{ role: 'user', content: prompt }];
      var reply = await callApi(messages);
      products = parseAIJson(reply);
      if (!Array.isArray(products)) {
        throw new Error('AI返回格式错误');
      }
    } else {
      /* 自定义标签无mock数据时，生成通用商品 */
      if (catProductMap[cat]) {
        products = shopGenerateMockProducts(cat);
      } else {
        products = shopGenerateMockProductsForCustom(cat);
      }
    }
    /* 保留用户手动添加的商品，合并到AI生成结果前面 */
    var existing = shopGetProducts(cat);
    var userAdded = existing.filter(function(p) { return p._userAdded; });
    if (userAdded.length > 0) {
      products = userAdded.concat(products);
    }
    shopCurrentProducts = products;
    shopSaveProducts(cat, products);
    shopRenderProducts();
    shopNotifyComplete(cat);
  } catch (e) {
    shopNotifyError(cat, e.message || '生成失败');
  } finally {
    shopBgGenerating[cat] = false;
    if (btn) btn.textContent = '🔄 刷新';
  }
}

function shopNotifyComplete(cat) {
  showToast(cat + ' 商品已刷新');
}

function shopNotifyError(cat, msg) {
  showToast(cat + ' 生成失败: ' + msg);
}

/* ===== 自定义标签管理 ===== */

function shopShowManageCatModal() {
  var modal = document.getElementById('shopManageCatModal');
  if (!modal) return;
  shopRenderManageCatList();
  var input = document.getElementById('shopNewCatInput');
  if (input) input.value = '';
  modal.style.display = 'block';
}

function shopRenderManageCatList() {
  var list = document.getElementById('shopManageCatList');
  if (!list) return;
  var allCats = shopGetCategories();
  var customCats = shopGetCustomCats();
  var deletedDefaults = shopGetDeletedDefaults();
  var html = '';
  for (var i = 0; i < allCats.length; i++) {
    var cat = allCats[i];
    var isDefault = SHOP_DEFAULT_CATS.indexOf(cat) >= 0;
    var isCustom = !isDefault;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f9f9f9;border-radius:8px;margin-bottom:6px;">';
    html += '<span style="font-size:14px;color:#333;">' + escapeHtml(cat);
    if (isDefault) html += ' <span style="font-size:11px;color:#bbb;">默认</span>';
    if (isCustom) html += ' <span style="font-size:11px;color:#F5A0B8;">自定义</span>';
    html += '</span>';
    if (cat === '推荐') {
      html += '<span style="font-size:12px;color:#ccc;">不可删除</span>';
    } else {
      html += '<button onclick="shopDeleteCategory(\'' + cat.replace(/'/g, "\\'") + '\')" style="background:rgba(255,59,48,0.1);color:#FF3B30;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;">删除</button>';
    }
    html += '</div>';
  }
  list.innerHTML = html;
  /* 显示/隐藏恢复默认标签按钮 */
  var restoreBtn = document.getElementById('shopRestoreDefaultsBtn');
  if (restoreBtn) {
    restoreBtn.style.display = deletedDefaults.length > 0 ? 'block' : 'none';
  }
}

function shopAddCategory() {
  var input = document.getElementById('shopNewCatInput');
  if (!input) return;
  var name = input.value.trim();
  if (!name) { showToast('请输入标签名称'); return; }
  if (name.length > 10) { showToast('标签名称最多10个字'); return; }
  var allCats = shopGetCategories();
  if (allCats.indexOf(name) >= 0) { showToast('该标签已存在'); return; }
  var custom = shopGetCustomCats();
  custom.push(name);
  shopSaveCustomCats(custom);
  input.value = '';
  shopRenderManageCatList();
  showToast('已添加标签：' + name);
}

function shopDeleteCategory(cat) {
  if (cat === '推荐') { showToast('推荐标签不可删除'); return; }
  var isDefault = SHOP_DEFAULT_CATS.indexOf(cat) >= 0;
  if (isDefault) {
    /* 默认标签：加入已删除列表 */
    var deleted = shopGetDeletedDefaults();
    if (deleted.indexOf(cat) < 0) deleted.push(cat);
    shopSaveDeletedDefaults(deleted);
  } else {
    /* 自定义标签：从自定义列表中移除 */
    var custom = shopGetCustomCats();
    custom = custom.filter(function(c) { return c !== cat; });
    shopSaveCustomCats(custom);
  }
  /* 删除该标签的商品缓存 */
  try { Store.set('shop_products_' + cat, []); } catch(e) {}
  /* 如果当前正在看这个标签，切回推荐 */
  if (shopCurrentCat === cat) {
    shopCurrentCat = '推荐';
    shopCurrentProducts = shopGetProducts('推荐');
    shopRenderProducts();
    var label = document.getElementById('shopCurrentCatLabel');
    if (label) label.textContent = '推荐';
  }
  shopRenderCategoryTabs();
  shopRenderManageCatList();
  showToast('已删除标签：' + cat);
}

/* 恢复所有已删除的默认标签 */
function shopRestoreDefaults() {
  shopSaveDeletedDefaults([]);
  shopRenderCategoryTabs();
  shopRenderManageCatList();
  showToast('已恢复所有默认标签');
}

/* ===== 手动添加商品 ===== */

function shopShowAddProductModal() {
  var modal = document.getElementById('shopAddProductModal');
  if (!modal) return;
  var label = document.getElementById('shopAddProductCatLabel');
  if (label) label.textContent = shopCurrentCat;
  /* 清空输入 */
  var fields = ['shopAddProductName', 'shopAddProductPrice', 'shopAddProductTag', 'shopAddProductDesc'];
  fields.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  modal.style.display = 'block';
}

function shopConfirmAddProduct() {
  var name = (document.getElementById('shopAddProductName') || {}).value;
  var price = (document.getElementById('shopAddProductPrice') || {}).value;
  var platform = (document.getElementById('shopAddProductPlatform') || {}).value;
  var tag = (document.getElementById('shopAddProductTag') || {}).value;
  var desc = (document.getElementById('shopAddProductDesc') || {}).value;
  if (!name || !name.trim()) { showToast('请输入商品名称'); return; }
  var priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) { showToast('请输入有效价格'); return; }
  var product = {
    name: name.trim(),
    price: priceNum.toFixed(2),
    description: desc.trim() || '用户添加的商品',
    platform: platform || '其他',
    tag: (tag || '').trim(),
    _userAdded: true
  };
  /* 保存到当前标签 */
  var products = shopGetProducts(shopCurrentCat);
  products.unshift(product);
  shopSaveProducts(shopCurrentCat, products);
  /* 刷新当前显示 */
  shopCurrentProducts = products;
  shopRenderProducts();
  /* 关闭弹窗 */
  var modal = document.getElementById('shopAddProductModal');
  if (modal) modal.style.display = 'none';
  showToast('已添加商品：' + product.name);
}

/* ===== 刷新功能支持自定义标签 ===== */
function shopGetCatHint(cat) {
  if (catHints[cat]) return catHints[cat];
  /* 自定义标签：用标签名作为提示 */
  return '用户自定义分类"' + cat + '"的商品，根据标签名称智能推荐相关商品';
}

/* ===== 删除用户添加的商品 ===== */
function shopDeleteUserProduct(idx) {
  var p = shopCurrentProducts[idx];
  if (!p || !p._userAdded) return;
  /* 从当前列表删除 */
  shopCurrentProducts.splice(idx, 1);
  /* 保存到存储 */
  shopSaveProducts(shopCurrentCat, shopCurrentProducts);
  /* 关闭弹窗并重新渲染 */
  var modal = document.getElementById('shopDetailModal');
  if (modal) modal.style.display = 'none';
  shopRenderProducts();
  showToast('已删除商品：' + p.name);
}

// ==================== Food App ====================

var FOOD_CATEGORIES = ['推荐', '美食', '奶茶咖啡', '烧烤', '火锅', '快餐', '甜品', '夜宵'];
var foodCurrentCat = '推荐';
var foodCurrentItems = [];
var foodViewMode = 'items';
var foodBgGenerating = {};

// --- Mock Data for Food ---
var catFoodMap = {
  '推荐': ['宫保鸡丁饭', '珍珠奶茶', '炸鸡汉堡套餐', '水煮鱼片', '三文鱼寿司拼盘', '石锅拌饭', '酸辣粉', '提拉米苏'],
  '美食': ['红烧排骨饭', '酸菜鱼套餐', '黄焖鸡米饭', '麻婆豆腐盖饭', '糖醋里脊套餐', '蒜蓉粉丝蒸虾', '回锅肉炒饭', '番茄牛腩面'],
  '奶茶咖啡': ['波波珍珠奶茶', '生椰拿铁咖啡', '芝士葡萄乌龙茶', '杨枝甘露', '焦糖玛奇朵', '芋泥啵啵奶茶', '西柚茉莉绿茶', '脏脏红茶拿铁'],
  '烧烤': ['羊肉串十根', '烤五花肉串', '烤鸡翅中三只', '烤茄子蒜蓉', '烤金针菇培根卷', '烤生蚝半打', '烤鱿鱼须', '烤韭菜一把'],
  '火锅': ['麻辣牛肉卷套餐', '番茄锅底肥牛', '菌汤鸳鸯锅套餐', '毛肚鸭肠拼盘', '虾滑一份', '嫩牛肉片半斤', '蔬菜拼盘大份', '宽粉土豆粉双拼'],
  '快餐': ['香辣鸡腿堡套餐', '牛肉双层吉士堡', '照烧鸡腿饭', '卤肉饭套餐', '鸡排饭配饮料', '披萨单人套餐', '意大利肉酱面', '墨西哥卷饼'],
  '甜品': ['提拉米苏蛋糕', '草莓千层盒子', '芒果班戟', '杨枝甘露西米露', '双皮奶红豆沙', '巧克力熔岩蛋糕', '抹茶冰淇淋华夫饼', '桂花酒酿圆子'],
  '夜宵': ['小龙虾麻辣两斤', '炒花甲一份', '烤冷面加蛋加肠', '螺蛳粉加料', '臭豆腐一份', '关东煮拼盘', '皮蛋瘦肉粥', '炒方便面加蛋']
};

var catRestaurantMap = {
  '推荐': ['老王家常菜', '蜜雪冰城', '华莱士', '川味馆', '日料寿司店', '韩式烤肉店', '深夜食堂', '甜品工坊'],
  '美食': ['老王家常菜', '川味馆', '黄焖鸡米饭', '蜀香居', '粤式茶餐厅', '湘味小炒', '东北菜馆', '兰牛拉面'],
  '奶茶咖啡': ['蜜雪冰城', '瑞幸咖啡', '喜茶', '茶颜悦色', '星巴克', 'CoCo都可', '一点点', '奈雪的茶'],
  '烧烤': ['老张烧烤', '新疆烤肉王', '夜猫子烧烤', '东北串吧', '碳烤羊腿王', '海边生蚝吧', '鱿鱼王子', '韭菜大妈'],
  '火锅': ['海底捞外卖', '小龙坎老火锅', '蜀大侠', '德庄火锅', '大龙燚', '谭鸭血老火锅', '佩姐老火锅', '巴奴毛肚'],
  '快餐': ['华莱士', '肯德基', '麦当劳', '真功夫', '永和大王', '必胜客', '萨莉亚', '塔可钟'],
  '甜品': ['甜品工坊', '满记甜品', '鲜芋仙', '哈根达斯', '幸福西饼', '元祖食品', '巴黎贝甜', '好利来'],
  '夜宵': ['深夜食堂', '宵夜大排档', '小龙虾专线', '螺蛳粉王', '臭豆腐西施', '关东煮小摊', '砂锅粥铺', '夜市炒面']
};

var catFoodHints = {
  '推荐': '各种品类热销美食',
  '美食': '中式正餐美食，如排骨饭、酸菜鱼、黄焖鸡等',
  '奶茶咖啡': '奶茶和咖啡饮品，如珍珠奶茶、拿铁、果茶等',
  '烧烤': '烧烤类食物，如羊肉串、烤鸡翅、烤茄子等',
  '火锅': '火锅外卖，如牛肉卷、毛肚、虾滑、锅底等',
  '快餐': '西式快餐，如汉堡、炸鸡、披萨、卷饼等',
  '甜品': '甜品类，如蛋糕、千层、冰淇淋、班戟等',
  '夜宵': '夜宵类食物，如小龙虾、炒粉、螺蛳粉、臭豆腐等'
};

// --- Food App Functions ---

function openFoodApp() {
  var overlay = document.getElementById('foodAppOverlay');
  if (!overlay) return;
  overlay.style.display = 'block';
  overlay.scrollTop = 0;
  foodViewMode = 'items';
  foodRenderCategoryTabs();
  foodUpdateWallet();
  foodUpdateLocation();
  foodCurrentItems = foodGetItems(foodCurrentCat);
  foodRenderItems();
  var grid = document.getElementById('foodItemGrid');
  var ordersView = document.getElementById('foodOrdersView');
  var toggleBtn = document.getElementById('foodToggleViewBtn');
  var refreshBtn = document.getElementById('foodRefreshBtn');
  var catLabel = document.getElementById('foodCurrentCatLabel');
  if (grid) grid.style.display = 'grid';
  if (ordersView) ordersView.style.display = 'none';
  if (toggleBtn) toggleBtn.textContent = '订单';
  if (refreshBtn) refreshBtn.style.display = 'block';
  if (catLabel) catLabel.textContent = foodCurrentCat;
}

function closeFoodApp() {
  var overlay = document.getElementById('foodAppOverlay');
  if (overlay) overlay.style.display = 'none';
  var modal = document.getElementById('foodDetailModal');
  if (modal) modal.style.display = 'none';
}

function foodRenderCategoryTabs() {
  var container = document.getElementById('foodCategoryTabs');
  if (!container) return;
  var html = '';
  for (var i = 0; i < FOOD_CATEGORIES.length; i++) {
    var cat = FOOD_CATEGORIES[i];
    var isActive = (cat === foodCurrentCat);
    var bg = isActive ? '#FFA94D' : '#fff';
    var color = isActive ? '#fff' : '#666';
    var border = isActive ? 'none' : '1px solid #eee';
    html += '<button onclick="foodSwitchCategory(\'' + cat + '\')" style="background:' + bg + ';color:' + color + ';border:' + border + ';padding:6px 14px;border-radius:16px;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0;">' + cat + '</button>';
  }
  container.innerHTML = html;
}

function foodSwitchCategory(cat) {
  foodCurrentCat = cat;
  var label = document.getElementById('foodCurrentCatLabel');
  if (label) label.textContent = cat;
  foodRenderCategoryTabs();
  foodCurrentItems = foodGetItems(cat);
  foodRenderItems();
}

function foodToggleView() {
  var grid = document.getElementById('foodItemGrid');
  var ordersView = document.getElementById('foodOrdersView');
  var btn = document.getElementById('foodToggleViewBtn');
  var catLabel = document.getElementById('foodCurrentCatLabel');
  var refreshBtn = document.getElementById('foodRefreshBtn');
  if (foodViewMode === 'items') {
    foodViewMode = 'orders';
    if (grid) grid.style.display = 'none';
    if (ordersView) ordersView.style.display = 'block';
    if (btn) btn.textContent = '美食';
    if (catLabel) catLabel.textContent = '我的订单';
    if (refreshBtn) refreshBtn.style.display = 'none';
    foodRenderOrders();
  } else {
    foodViewMode = 'items';
    if (grid) grid.style.display = 'grid';
    if (ordersView) ordersView.style.display = 'none';
    if (btn) btn.textContent = '订单';
    if (catLabel) catLabel.textContent = foodCurrentCat;
    if (refreshBtn) refreshBtn.style.display = 'block';
    foodRenderItems();
  }
}

function foodUpdateWallet() {
  var el = document.getElementById('foodWalletDisplay');
  if (el) el.textContent = (config.user.wallet || 0).toFixed(2);
}

function foodUpdateLocation() {
  /* Map MCP removed from food app */
}

function foodGetWallet() {
  return config.user.wallet || 0;
}

function foodDeductWallet(amount) {
  if (!config.user.wallet) config.user.wallet = 0;
  config.user.wallet -= amount;
  if (!config.user.walletHistory) config.user.walletHistory = [];
  config.user.walletHistory.unshift({
    type: 'consume',
    amount: -amount,
    time: Date.now(),
    desc: '外卖消费'
  });
  Store.set('config', config);
  foodUpdateWallet();
}

function foodGetItems(cat) {
  try {
    return Store.get('food_items_' + cat, []);
  } catch (e) {
    return [];
  }
}

function foodSaveItems(cat, items) {
  try {
    Store.set('food_items_' + cat, items);
  } catch (e) {}
}

function foodGetOrders() {
  try {
    return Store.get('food_orders', []);
  } catch (e) {
    return [];
  }
}

function foodSaveOrders(orders) {
  try {
    Store.set('food_orders', orders);
  } catch (e) {}
}

function foodGenerateMockItems(cat) {
  var names = catFoodMap[cat] || catFoodMap['推荐'];
  var restaurants = catRestaurantMap[cat] || catRestaurantMap['推荐'];
  var items = [];
  for (var i = 0; i < names.length; i++) {
    items.push({
      name: names[i],
      restaurant: restaurants[i] || restaurants[0],
      price: (Math.floor(Math.random() * 50) + 15).toFixed(2),
      rating: (4 + Math.random()).toFixed(1),
      deliveryTime: (20 + Math.floor(Math.random() * 30)) + '分钟',
      monthlySales: '月售' + (Math.floor(Math.random() * 3000) + 500) + '+',
      description: '【' + cat + '人气美食】精选当日新鲜食材，由经验丰富的大厨精心烹制。口感层次丰富，入口鲜香四溢，回味悠长。分量充足，包装严实保温，确保送到手时依然热气腾腾。店家坚持现点现做，绝不使用隔夜食材，每一口都是家的味道。回头客超多，' + cat + '必点推荐！'
    });
  }
  return items;
}

function foodRenderItems() {
  var grid = document.getElementById('foodItemGrid');
  if (!grid) return;
  if (!foodCurrentItems || foodCurrentItems.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;padding:50px 0;"><div style="font-size:48px;margin-bottom:12px;">🍜</div><div style="font-size:14px;">暂无美食</div><div style="font-size:12px;margin-top:4px;">点击刷新按钮生成美食</div></div>';
    return;
  }
  var html = '';
  for (var i = 0; i < foodCurrentItems.length; i++) {
    var item = foodCurrentItems[i];
    html += '<div onclick="foodShowItemDetail(' + i + ')" style="background:#fff;border-radius:12px;overflow:hidden;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.06);">';
    html += '<div style="height:90px;background:linear-gradient(135deg,#FFF8E1,#FFE0B2);display:flex;align-items:center;justify-content:center;font-size:36px;">🍜</div>';
    html += '<div style="padding:10px;">';
    html += '<div style="font-size:13px;color:#333;font-weight:bold;line-height:1.4;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.name) + '</div>';
    html += '<div style="color:#999;font-size:11px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(item.restaurant) + '</div>';
    html += '<div style="color:#FFA94D;font-size:16px;font-weight:bold;margin-bottom:4px;">¥' + escapeHtml(item.price) + '</div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#999;">';
    if (item.rating) html += '<span>⭐' + escapeHtml(item.rating) + '</span>';
    if (item.monthlySales) html += '<span>' + escapeHtml(item.monthlySales) + '</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }
  grid.innerHTML = html;
}

function foodShowItemDetail(idx) {
  var item = foodCurrentItems[idx];
  if (!item) return;
  var modal = document.getElementById('foodDetailModal');
  var content = document.getElementById('foodDetailContent');
  if (!modal || !content) return;

  var html = '';
  html += '<div style="text-align:right;margin-bottom:8px;"><button onclick="document.getElementById(\'foodDetailModal\').style.display=\'none\'" style="background:#f0f0f0;border:none;border-radius:50%;width:30px;height:30px;font-size:16px;cursor:pointer;color:#666;">×</button></div>';
  html += '<div style="height:140px;background:linear-gradient(135deg,#FFF8E1,#FFE0B2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:56px;margin-bottom:12px;">🍜</div>';
  html += '<h3 style="margin:0 0 4px 0;color:#333;font-size:17px;">' + escapeHtml(item.name) + '</h3>';
  html += '<div style="color:#999;font-size:13px;margin-bottom:8px;">🏪 ' + escapeHtml(item.restaurant) + '</div>';
  html += '<div style="color:#FFA94D;font-size:22px;font-weight:bold;margin-bottom:8px;">¥' + escapeHtml(item.price) + '</div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">';
  if (item.rating) html += '<span style="color:#FFA94D;font-size:13px;">⭐ ' + escapeHtml(item.rating) + '</span>';
  if (item.deliveryTime) html += '<span style="color:#999;font-size:13px;">🚴 ' + escapeHtml(item.deliveryTime) + '</span>';
  if (item.monthlySales) html += '<span style="color:#999;font-size:13px;">📦 ' + escapeHtml(item.monthlySales) + '</span>';
  html += '</div>';
  html += '<div style="color:#666;font-size:14px;line-height:1.6;margin-bottom:16px;padding:10px;background:#FFF9F2;border-radius:8px;">' + escapeHtml(item.description) + '</div>';
  html += '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:8px;">';
  html += '<button onclick="foodPlaceOrder(' + idx + ', \'self\', null)" style="width:100%;background:linear-gradient(135deg,#FFA94D,#FFD43B);color:#fff;border:none;padding:12px;border-radius:12px;font-size:15px;font-weight:bold;cursor:pointer;margin-bottom:8px;">为自己下单</button>';
  if (config.characters && config.characters.length > 0) {
    html += '<div style="color:#999;font-size:13px;margin:12px 0 6px 0;">买给角色：</div>';
    for (var i = 0; i < config.characters.length; i++) {
      var c = config.characters[i];
      var avatarChar = c.name ? c.name.charAt(0) : '?';
      var bg = c.avatarBg || '#FFA94D';
      html += '<button onclick="foodPlaceOrder(' + idx + ', \'role\', \'' + c.id + '\')" style="display:flex;align-items:center;gap:8px;width:100%;background:#fff;border:1px solid #f0f0f0;padding:10px;border-radius:10px;font-size:14px;cursor:pointer;margin-bottom:6px;">';
      if (c.avatar) {
        html += '<img src="' + escapeHtml(c.avatar) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"  alt=""/>';
      } else {
        html += '<div style="width:32px;height:32px;border-radius:50%;background:' + bg + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;flex-shrink:0;">' + escapeHtml(avatarChar) + '</div>';
      }
      html += '<span style="color:#333;">买给 ' + escapeHtml(c.name) + '</span>';
      html += '</button>';
    }
  }
  html += '</div>';

  content.innerHTML = html;
  modal.style.display = 'block';
}

function foodPlaceOrder(idx, recipient, roleId) {
  var item = foodCurrentItems[idx];
  if (!item) return;
  var price = parseFloat(item.price);
  var wallet = foodGetWallet();
  if (wallet < price) {
    showToast('钱包余额不足');
    return;
  }
  foodDeductWallet(price);

  var orderNo = genId();
  var recipientName = '自己';
  if (recipient === 'role' && roleId) {
    var char = null;
    for (var i = 0; i < config.characters.length; i++) {
      if (String(config.characters[i].id) === String(roleId)) {
        char = config.characters[i];
        break;
      }
    }
    if (char) {
      recipientName = char.name;
      var orderData = { productName: item.name, price: item.price, orderNo: orderNo, restaurant: item.restaurant, recipient: recipientName, orderType: 'food' };
      var msgContent = '[order]' + JSON.stringify(orderData);
      if (!char.chatHistory) char.chatHistory = [];
      char.chatHistory.push({
        role: 'user',
        content: msgContent,
        time: Date.now(),
        type: 'order'
      });
      // 如果目标角色正好是当前聊天角色，同步config.chatHistory以确保界面即时刷新
      if (currentChatMode === 'online' && !isNpcChatMode && !isGroupChatMode &&
          config.characters && config.characters[currentCharIdx] === char) {
        config.chatHistory = char.chatHistory;
      }
      Store.set('config', config);
      if (typeof renderMessages === 'function') renderMessages();
      showToast('已买给' + char.name + '，订单已发送');
    }
  } else {
    showToast('下单成功');
  }

  var orders = foodGetOrders();
  orders.unshift({
    orderNo: orderNo,
    productName: item.name,
    price: item.price,
    restaurant: item.restaurant,
    recipient: recipientName,
    roleId: roleId,
    time: Date.now(),
    type: 'food'
  });
  foodSaveOrders(orders);

  var modal = document.getElementById('foodDetailModal');
  if (modal) modal.style.display = 'none';
  foodUpdateWallet();
}

function foodRenderOrders() {
  var view = document.getElementById('foodOrdersView');
  if (!view) return;
  var orders = foodGetOrders();
  if (orders.length === 0) {
    view.innerHTML = '<div style="text-align:center;color:#999;padding:50px 0;"><div style="font-size:48px;margin-bottom:12px;">📋</div>暂无订单</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var date = new Date(o.time);
    var timeStr = date.getMonth() + 1 + '/' + date.getDate() + ' ' + date.getHours() + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes();
    html += '<div style="background:#fff;border-radius:12px;padding:12px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">';
    html += '<span style="font-weight:bold;color:#333;font-size:15px;flex:1;">' + escapeHtml(o.productName) + '</span>';
    html += '<span style="color:#FFA94D;font-weight:bold;font-size:15px;">¥' + escapeHtml(o.price) + '</span>';
    html += '</div>';
    html += '<div style="color:#999;font-size:12px;margin-bottom:2px;">订单号：' + escapeHtml(o.orderNo) + '</div>';
    html += '<div style="color:#999;font-size:12px;margin-bottom:2px;">🏪 ' + escapeHtml(o.restaurant || '') + ' | 收件人：' + escapeHtml(o.recipient) + '</div>';
    html += '<div style="color:#bbb;font-size:11px;">' + timeStr + '</div>';
    html += '</div>';
  }
  view.innerHTML = html;
}

async function foodRefreshCategory() {
  var cat = foodCurrentCat;
  if (foodBgGenerating[cat]) {
    showToast('正在生成中，请稍候...');
    return;
  }
  foodBgGenerating[cat] = true;
  var btn = document.getElementById('foodRefreshBtn');
  if (btn) btn.textContent = '⏳ 生成中...';

  try {
    var items;
    if (config.api && config.api.baseUrl && config.api.apiKey && config.api.model) {
      var hint = catFoodHints[cat] || '';
      var prompt = '你是一个外卖平台美食推荐助手。请为"' + cat + '"分类生成8个美食。\n' +
        '重要：美食必须属于"' + cat + '"分类（' + hint + '），严禁生成与该分类无关的食物。\n' +
        '要求返回JSON数组，每个美食包含：name(美食名，必须符合' + cat + '分类), restaurant(餐厅名), price(价格字符串如"25.50"), description(50-100字详细描述，包含食材、口味、特色等), rating(评分4.0-5.0之间字符串), deliveryTime(配送时间如"30分钟"), monthlySales(月销量如"月售2000+")。\n' +
        '只返回JSON数组，不要其他文字。';
      var messages = [{ role: 'user', content: prompt }];
      var reply = await callApi(messages);
      items = parseAIJson(reply);
      if (!Array.isArray(items)) {
        throw new Error('AI返回格式错误');
      }
    } else {
      items = foodGenerateMockItems(cat);
    }
    foodCurrentItems = items;
    foodSaveItems(cat, items);
    foodRenderItems();
    foodNotifyComplete(cat);
  } catch (e) {
    foodNotifyError(cat, e.message || '生成失败');
  } finally {
    foodBgGenerating[cat] = false;
    if (btn) btn.textContent = '🔄 刷新';
  }
}

function foodNotifyComplete(cat) {
  showToast(cat + ' 美食已刷新');
}

function foodNotifyError(cat, msg) {
  showToast(cat + ' 生成失败: ' + msg);
}

// ==================== Window Exports ====================

// Shopping app variables
window.SHOP_CATEGORIES = SHOP_CATEGORIES;
window.shopCurrentCat = shopCurrentCat;
window.shopCurrentProducts = shopCurrentProducts;
window.shopViewMode = shopViewMode;
window.shopBgGenerating = shopBgGenerating;
window.catProductMap = catProductMap;
window.catDescMap = catDescMap;
window.catHints = catHints;

// Shopping app functions
window.openShopApp = openShopApp;
window.closeShopApp = closeShopApp;
window.shopRenderCategoryTabs = shopRenderCategoryTabs;
window.shopSwitchCategory = shopSwitchCategory;
window.shopToggleView = shopToggleView;
window.shopUpdateWallet = shopUpdateWallet;
window.shopUpdateLocation = shopUpdateLocation;
window.shopGetWallet = shopGetWallet;
window.shopDeductWallet = shopDeductWallet;
window.shopGetProducts = shopGetProducts;
window.shopSaveProducts = shopSaveProducts;
window.shopGetOrders = shopGetOrders;
window.shopSaveOrders = shopSaveOrders;
window.shopGenerateMockProducts = shopGenerateMockProducts;
window.shopRenderProducts = shopRenderProducts;
window.shopShowProductDetail = shopShowProductDetail;
window.shopPlaceOrder = shopPlaceOrder;
window.shopRenderOrders = shopRenderOrders;
window.shopRefreshCategory = shopRefreshCategory;
window.shopNotifyComplete = shopNotifyComplete;
window.shopNotifyError = shopNotifyError;
window.shopGetCategories = shopGetCategories;
window.shopGetCustomCats = shopGetCustomCats;
window.shopSaveCustomCats = shopSaveCustomCats;
window.shopShowManageCatModal = shopShowManageCatModal;
window.shopRenderManageCatList = shopRenderManageCatList;
window.shopAddCategory = shopAddCategory;
window.shopDeleteCategory = shopDeleteCategory;
window.shopRestoreDefaults = shopRestoreDefaults;
window.shopGetDeletedDefaults = shopGetDeletedDefaults;
window.shopSaveDeletedDefaults = shopSaveDeletedDefaults;
window.shopShowAddProductModal = shopShowAddProductModal;
window.shopConfirmAddProduct = shopConfirmAddProduct;
window.shopDeleteUserProduct = shopDeleteUserProduct;
window.shopGetCatHint = shopGetCatHint;
window.shopGenerateMockProductsForCustom = shopGenerateMockProductsForCustom;
window.SHOP_DEFAULT_CATS = SHOP_DEFAULT_CATS;

// Food app variables
window.FOOD_CATEGORIES = FOOD_CATEGORIES;
window.foodCurrentCat = foodCurrentCat;
window.foodCurrentItems = foodCurrentItems;
window.foodViewMode = foodViewMode;
window.foodBgGenerating = foodBgGenerating;
window.catFoodMap = catFoodMap;
window.catRestaurantMap = catRestaurantMap;
window.catFoodHints = catFoodHints;

// Food app functions
window.openFoodApp = openFoodApp;
window.closeFoodApp = closeFoodApp;
window.foodRenderCategoryTabs = foodRenderCategoryTabs;
window.foodSwitchCategory = foodSwitchCategory;
window.foodToggleView = foodToggleView;
window.foodUpdateWallet = foodUpdateWallet;
window.foodUpdateLocation = foodUpdateLocation;
window.foodGetWallet = foodGetWallet;
window.foodDeductWallet = foodDeductWallet;
window.foodGetItems = foodGetItems;
window.foodSaveItems = foodSaveItems;
window.foodGetOrders = foodGetOrders;
window.foodSaveOrders = foodSaveOrders;
window.foodGenerateMockItems = foodGenerateMockItems;
window.foodRenderItems = foodRenderItems;
window.foodShowItemDetail = foodShowItemDetail;
window.foodPlaceOrder = foodPlaceOrder;
window.foodRenderOrders = foodRenderOrders;
window.foodRefreshCategory = foodRefreshCategory;
window.foodNotifyComplete = foodNotifyComplete;
window.foodNotifyError = foodNotifyError;


// ============================================================
// 地图APP - 使用Leaflet + OpenStreetMap（真实地图数据）
// ============================================================
var mapInstance = null;
var mapMarkers = [];
var mapRouteLayer = null;
var mapCurrentLocation = null;
var mapSavedLocations = []; // 保存的地点

function openMapApp() {
  navigateTo('view-map');
  // 延迟初始化地图，确保DOM已渲染
  setTimeout(function() {
    if (!mapInstance) {
      initMap();
    } else {
      // 多次调用 invalidateSize 确保地图正确渲染
      mapInstance.invalidateSize();
      setTimeout(function() { mapInstance.invalidateSize(); }, 100);
      setTimeout(function() { mapInstance.invalidateSize(); }, 300);
    }
    // 加载保存的地点标记
    mapLoadSavedLocations();
    // 首次打开提示
    if (!getAmapKey() && !localStorage.getItem('amapKeyPrompted')) {
      localStorage.setItem('amapKeyPrompted', '1');
      setTimeout(function() {
        showToast('搜索和导航可直接使用，点击⚙️可升级完整模式');
      }, 800);
    }
    // 如果没有设置城市，自动弹出城市选择器（IP定位在国内经常不准，直接让用户选）
    if (typeof config !== 'undefined' && !config.userCity && !config.mapMyLocation && !localStorage.getItem('cityPrompted')) {
      localStorage.setItem('cityPrompted', '1');
      setTimeout(function() {
        openCityPicker();
      }, 600);
    }
  }, 100);
}

// 关闭地图APP：销毁地图实例，防止瓦片残留
function closeMapApp() {
  // 先销毁地图实例
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  // 清理标记和图层
  mapMarkers = [];
  mapRouteLayer = null;
  mapCurrentLocation = null;
  // 清空地图容器内容，防止残留
  var mapEl = document.getElementById('leafletMap');
  if (mapEl) {
    mapEl.innerHTML = '';
  }
  // 返回首页
  goHome();
}

function initMap() {
  if (typeof L === 'undefined') {
    showToast('地图库未加载，请检查网络');
    return;
  }
  // 默认位置：北京天安门
  var defaultLat = 39.9087;
  var defaultLng = 116.3975;

  // 最优先：用户选择的城市（最准确，解决IP定位到北京的问题）
  if (typeof config !== 'undefined' && config.userCity) {
    defaultLat = config.userCity.lat;
    defaultLng = config.userCity.lng;
  } else if (typeof config !== 'undefined' && config.mapMyLocation) {
    defaultLat = config.mapMyLocation.lat;
    defaultLng = config.mapMyLocation.lng;
  } else if (typeof config !== 'undefined' && config.mapLastPos) {
    defaultLat = config.mapLastPos.lat || defaultLat;
    defaultLng = config.mapLastPos.lng || defaultLng;
  }

  mapInstance = L.map('leafletMap', {
    zoomControl: true,
    attributionControl: true
  }).setView([defaultLat, defaultLng], 13);

  // 使用高德地图瓦片（国内速度快，无需API key）
  var normalLayer = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'],
    maxZoom: 20,
    attribution: '© 高德地图'
  });

  // 卫星图层
  var satelliteLayer = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'],
    maxZoom: 20,
    attribution: '© 高德地图'
  });

  // 默认使用标准地图
  normalLayer.addTo(mapInstance);

  // 图层切换控件
  L.control.layers({
    '标准地图': normalLayer,
    '卫星地图': satelliteLayer
  }, null, { position: 'bottomleft' }).addTo(mapInstance);

  // 瓦片加载错误处理
  normalLayer.on('tileerror', function() {
    console.warn('高德瓦片加载失败，尝试备用源');
  });

  // 尝试获取用户当前位置（本地文件可能被拒绝）
  // 优先级1：用户选择的城市（最准确，彻底解决IP定位到北京的问题）
  if (typeof config !== 'undefined' && config.userCity) {
    var uc = config.userCity;
    mapCurrentLocation = { lat: uc.lat, lng: uc.lng };
    mapInstance.setView([uc.lat, uc.lng], 14);
    var locIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
      className: 'map-loc-icon', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    L.marker([uc.lat, uc.lng], { icon: locIcon })
      .addTo(mapInstance)
      .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">' + uc.province + ' · ' + uc.city + '</div>');
  } else if (typeof config !== 'undefined' && config.mapMyLocation) {
    var saved = config.mapMyLocation;
    mapCurrentLocation = { lat: saved.lat, lng: saved.lng };
    mapInstance.setView([saved.lat, saved.lng], 14);
    var locIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
      className: 'map-loc-icon', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    L.marker([saved.lat, saved.lng], { icon: locIcon })
      .addTo(mapInstance)
      .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">' + mapEscapeHtml(saved.name || '手动设置') + '</div>');
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        mapCurrentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapInstance.setView([pos.coords.latitude, pos.coords.longitude], 15);
        var locIcon = L.divIcon({
          html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
          className: 'map-loc-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        L.marker([pos.coords.latitude, pos.coords.longitude], { icon: locIcon })
          .addTo(mapInstance)
          .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">GPS定位 · 当前位置</div>');
      },
      function(err) {
        // GPS定位失败，尝试IP定位作为备用（精度较低，可能不准）
        mapIPLocate(function(ipLat, ipLng, ipCity) {
          if (ipLat && ipLng) {
            mapCurrentLocation = { lat: ipLat, lng: ipLng };
            mapInstance.setView([ipLat, ipLng], 13);
            var locIcon = L.divIcon({
              html: '<div style="width:20px;height:20px;background:#FF9500;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
              className: 'map-loc-icon',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            L.marker([ipLat, ipLng], { icon: locIcon })
              .addTo(mapInstance)
              .bindPopup('<div class="map-popup-title">我的位置（网络定位·可能不准）</div><div class="map-popup-addr">' + (ipCity || '当前位置') + ' · 网络定位可能有偏差，建议点击右上角设置你的城市</div>');
            showToast('网络定位到' + (ipCity || '当前位置') + '（可能不准），建议设置你的城市');
          } else {
            showToast('定位失败，请搜索你的城市并设为我的位置');
          }
        });
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  // 点击地图添加标记
  mapInstance.on('click', function(e) {
    mapShowAddMarkerPrompt(e.latlng.lat, e.latlng.lng);
  });
}

// IP定位（备用方案，本地文件打开时GPS不可用）
function mapIPLocate(callback) {
  // ip-api.com 免费版只支持HTTP，在HTTPS/本地文件环境下会被浏览器拦截
  // 使用 ipwho.is（免费、支持HTTPS、无需key）
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 6000);
  fetch('https://ipwho.is/', {
    signal: controller.signal
  })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      if (data && data.success !== false && data.latitude && data.longitude) {
        callback(data.latitude, data.longitude, data.city || data.region || null);
      } else {
        // 备用：尝试 ipapi.co
        fetch('https://ipapi.co/json/', { signal: controller.signal })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d && d.latitude && d.longitude) {
              callback(d.latitude, d.longitude, d.city || null);
            } else {
              callback(null, null, null);
            }
          })
          .catch(function() { callback(null, null, null); });
      }
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      // 备用：尝试 ipapi.co
      fetch('https://ipapi.co/json/')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d && d.latitude && d.longitude) {
            callback(d.latitude, d.longitude, d.city || null);
          } else {
            callback(null, null, null);
          }
        })
        .catch(function() { callback(null, null, null); });
    });
}

// ===== MCP：城市选择 + 天气 + 时间 + 热搜 + 节假日 =====

// 省市区数据（主要城市坐标）
var CHINA_CITIES = {
  '北京': {'北京':{lat:39.9042,lng:116.4074}},
  '上海': {'上海':{lat:31.2304,lng:121.4737}},
  '天津': {'天津':{lat:39.0850,lng:117.1994}},
  '重庆': {'重庆':{lat:29.4316,lng:106.9123}},
  '广东': {'广州':{lat:23.1291,lng:113.2644}, '深圳':{lat:22.5431,lng:114.0579}, '东莞':{lat:23.0207,lng:113.7518}, '佛山':{lat:23.0218,lng:113.1219}, '珠海':{lat:22.2710,lng:113.5767}, '中山':{lat:22.5170,lng:113.3927}, '惠州':{lat:23.1116,lng:114.4161}, '汕头':{lat:23.3540,lng:116.6818}, '江门':{lat:22.5789,lng:113.0823}, '湛江':{lat:21.2706,lng:110.3594}, '茂名':{lat:21.6630,lng:110.9254}, '梅州':{lat:24.2884,lng:116.1228}, '肇庆':{lat:23.0470,lng:112.4658}, '汕尾':{lat:22.7862,lng:115.3753}, '河源':{lat:23.7432,lng:114.6978}, '阳江':{lat:21.8580,lng:111.9821}, '清远':{lat:23.6817,lng:113.0560}, '揭阳':{lat:23.5500,lng:116.3729}, '云浮':{lat:22.9151,lng:112.0445}, '潮州':{lat:23.6568,lng:116.6226}, '韶关':{lat:24.8107,lng:113.5976}},
  '浙江': {'杭州':{lat:30.2741,lng:120.1551}, '宁波':{lat:29.8683,lng:121.5440}, '温州':{lat:27.9938,lng:120.6993}, '绍兴':{lat:30.0303,lng:120.5802}, '嘉兴':{lat:30.7522,lng:120.7555}, '金华':{lat:29.0784,lng:119.6473}, '湖州':{lat:30.8949,lng:120.0865}, '丽水':{lat:28.4517,lng:119.9229}, '衢州':{lat:28.9358,lng:118.8595}, '舟山':{lat:29.9853,lng:122.2072}, '台州':{lat:28.6562,lng:121.4209}},
  '江苏': {'南京':{lat:32.0603,lng:118.7969}, '苏州':{lat:31.2989,lng:120.5853}, '无锡':{lat:31.4912,lng:120.3119}, '常州':{lat:31.7727,lng:119.9469}, '徐州':{lat:34.2654,lng:117.1849}, '南通':{lat:31.9802,lng:120.8943}, '扬州':{lat:32.3946,lng:119.4127}, '镇江':{lat:32.2044,lng:119.4528}, '泰州':{lat:32.4554,lng:119.9229}, '盐城':{lat:33.3496,lng:120.1633}, '宿迁':{lat:33.9630,lng:118.2754}, '连云港':{lat:34.5969,lng:119.2216}, '淮安':{lat:33.5100,lng:119.0218}},
  '四川': {'成都':{lat:30.5728,lng:104.0668}, '绵阳':{lat:31.4680,lng:104.6796}, '自贡':{lat:29.3392,lng:104.7784}, '南充':{lat:30.8373,lng:106.1102}, '宜宾':{lat:28.7513,lng:104.6234}, '德阳':{lat:31.1270,lng:104.3981}, '泸州':{lat:28.8717,lng:105.4425}, '乐山':{lat:29.5525,lng:103.7662}, '攀枝花':{lat:26.5823,lng:101.7188}, '内江':{lat:29.5800,lng:105.0586}, '达州':{lat:31.2090,lng:107.4682}, '广元':{lat:32.4353,lng:105.8256}, '广安':{lat:30.4741,lng:106.6333}, '巴中':{lat:31.8691,lng:106.7478}, '遂宁':{lat:30.5333,lng:105.5928}, '资阳':{lat:30.1222,lng:104.6279}, '眉山':{lat:30.0491,lng:103.8314}, '雅安':{lat:29.9805,lng:103.0010}},
  '山东': {'济南':{lat:36.6512,lng:117.1201}, '青岛':{lat:36.0671,lng:120.3826}, '烟台':{lat:37.4638,lng:121.4478}, '潍坊':{lat:36.7068,lng:119.1620}, '临沂':{lat:35.1045,lng:118.3564}, '淄博':{lat:36.8131,lng:118.0548}, '威海':{lat:37.5128,lng:122.1201}, '德州':{lat:37.4360,lng:116.3575}, '泰安':{lat:36.2000,lng:117.0880}, '聊城':{lat:36.4567,lng:115.9855}, '滨州':{lat:37.3830,lng:117.9700}, '菏泽':{lat:35.2325,lng:115.4811}, '枣庄':{lat:34.8105,lng:117.3237}, '日照':{lat:35.4164,lng:119.5269}, '东营':{lat:37.4335,lng:118.6747}, '济宁':{lat:35.4145,lng:116.5873}},
  '河南': {'郑州':{lat:34.7466,lng:113.6253}, '洛阳':{lat:34.6197,lng:112.4540}, '开封':{lat:34.7971,lng:114.3081}, '南阳':{lat:32.9909,lng:112.5283}, '信阳':{lat:32.1471,lng:114.0913}, '安阳':{lat:36.0972,lng:114.3924}, '新乡':{lat:35.3030,lng:113.9268}, '焦作':{lat:35.2340,lng:113.2418}, '许昌':{lat:34.0357,lng:113.8523}, '平顶山':{lat:33.7662,lng:113.1925}, '商丘':{lat:34.4147,lng:115.6562}, '周口':{lat:33.6259,lng:114.6498}, '驻马店':{lat:32.9802,lng:114.0228}, '濮阳':{lat:35.7627,lng:115.0293}, '三门峡':{lat:34.7734,lng:111.2005}, '漯河':{lat:33.5816,lng:114.0166}, '鹤壁':{lat:35.7475,lng:114.2974}},
  '湖南': {'长沙':{lat:28.2278,lng:112.9388}, '株洲':{lat:27.8274,lng:113.1340}, '湘潭':{lat:27.8297,lng:112.9442}, '衡阳':{lat:26.8935,lng:112.5719}, '岳阳':{lat:29.3563,lng:113.1289}, '常德':{lat:29.0316,lng:111.6986}, '郴州':{lat:25.7703,lng:113.0147}, '永州':{lat:26.4345,lng:111.6132}, '怀化':{lat:27.5492,lng:110.0017}, '益阳':{lat:28.5530,lng:112.3553}, '张家界':{lat:29.1170,lng:110.4793}, '娄底':{lat:27.7282,lng:112.0084}, '湘西':{lat:28.3119,lng:109.7391}},
  '湖北': {'武汉':{lat:30.5928,lng:114.3055}, '宜昌':{lat:30.6918,lng:111.2864}, '襄阳':{lat:32.0091,lng:112.1228}, '荆州':{lat:30.3349,lng:112.2410}, '十堰':{lat:32.6292,lng:110.7980}, '黄石':{lat:30.1991,lng:115.0385}, '荆门':{lat:31.0354,lng:112.2046}, '鄂州':{lat:30.3903,lng:114.8949}, '孝感':{lat:30.9244,lng:113.9268}, '黄冈':{lat:30.4539,lng:114.8724}, '咸宁':{lat:29.8413,lng:114.3224}, '随州':{lat:31.6901,lng:113.3826}, '恩施':{lat:30.2720,lng:109.4880}, '仙桃':{lat:30.3620,lng:113.4540}, '天门':{lat:30.6534,lng:113.1660}, '潜江':{lat:30.4213,lng:112.8968}, '神农架':{lat:31.7440,lng:110.6710}},
  '福建': {'福州':{lat:26.0745,lng:119.2965}, '厦门':{lat:24.4798,lng:118.0894}, '泉州':{lat:24.8741,lng:118.6757}, '莆田':{lat:25.4309,lng:119.0077}, '漳州':{lat:24.5130,lng:117.6471}, '宁德':{lat:26.6656,lng:119.5479}, '三明':{lat:26.2654,lng:117.6389}, '龙岩':{lat:25.0916,lng:117.0173}, '南平':{lat:26.6437,lng:118.1782}},
  '安徽': {'合肥':{lat:31.8206,lng:117.2272}, '芜湖':{lat:31.3345,lng:118.4326}, '蚌埠':{lat:32.9168,lng:117.3893}, '黄山':{lat:29.7147,lng:118.3374}, '安庆':{lat:30.5430,lng:117.0631}, '阜阳':{lat:32.8908,lng:115.8142}, '宿州':{lat:33.6461,lng:116.9641}, '滁州':{lat:32.3019,lng:118.3167}, '六安':{lat:31.7350,lng:116.5078}, '亳州':{lat:33.8693,lng:115.7785}, '池州':{lat:30.6650,lng:117.4912}, '宣城':{lat:30.9457,lng:118.7593}, '铜陵':{lat:30.9446,lng:117.8122}, '淮南':{lat:32.6264,lng:116.9999}, '淮北':{lat:33.9717,lng:116.7945}, '马鞍山':{lat:31.6706,lng:118.5068}},
  '江西': {'南昌':{lat:28.6820,lng:115.8579}, '九江':{lat:29.7055,lng:116.0003}, '赣州':{lat:25.8310,lng:114.9353}, '上饶':{lat:28.4553,lng:117.9434}, '吉安':{lat:27.1138,lng:114.9863}, '抚州':{lat:27.9538,lng:116.3581}, '宜春':{lat:27.8043,lng:114.4161}, '萍乡':{lat:27.6229,lng:113.8544}, '新余':{lat:27.8108,lng:114.9303}, '鹰潭':{lat:28.2602,lng:117.0693}, '景德镇':{lat:29.2687,lng:117.1784}},
  '河北': {'石家庄':{lat:38.0428,lng:114.5149}, '唐山':{lat:39.6306,lng:118.1804}, '保定':{lat:38.8740,lng:115.4646}, '邯郸':{lat:36.6253,lng:114.5391}, '张家口':{lat:40.7686,lng:114.8869}, '承德':{lat:40.9515,lng:117.9626}, '廊坊':{lat:39.5377,lng:116.6833}, '沧州':{lat:38.3104,lng:116.8388}, '衡水':{lat:37.7339,lng:115.6705}, '邢台':{lat:37.0709,lng:114.5046}, '秦皇岛':{lat:39.9354,lng:119.6005}},
  '山西': {'太原':{lat:37.8706,lng:112.5489}, '大同':{lat:40.0768,lng:113.3001}, '临汾':{lat:36.0880,lng:111.5190}, '运城':{lat:35.0264,lng:111.0070}, '长治':{lat:36.1953,lng:113.1163}, '晋城':{lat:35.4905,lng:112.8513}, '吕梁':{lat:37.5186,lng:111.1448}, '阳泉':{lat:37.8576,lng:113.5760}, '朔州':{lat:39.3315,lng:112.4329}, '忻州':{lat:38.4163,lng:112.7339}, '晋中':{lat:37.6877,lng:112.7528}},
  '辽宁': {'沈阳':{lat:41.8057,lng:123.4315}, '大连':{lat:38.9140,lng:121.6147}, '鞍山':{lat:41.1100,lng:122.9942}, '锦州':{lat:41.0954,lng:121.1268}, '抚顺':{lat:41.8807,lng:123.9572}, '本溪':{lat:41.2945,lng:123.7659}, '丹东':{lat:40.1295,lng:124.3936}, '营口':{lat:40.6675,lng:122.2349}, '阜新':{lat:42.0218,lng:121.6700}, '辽阳':{lat:41.2693,lng:123.1738}, '盘锦':{lat:41.1245,lng:122.0698}, '铁岭':{lat:42.2997,lng:123.8442}, '朝阳':{lat:41.5738,lng:120.4587}, '葫芦岛':{lat:40.7110,lng:120.8369}},
  '吉林': {'长春':{lat:43.8868,lng:125.3245}, '吉林':{lat:43.8378,lng:126.5500}, '延边':{lat:42.8917,lng:129.5096}, '四平':{lat:43.1664,lng:124.3506}, '通化':{lat:41.7211,lng:125.9398}, '白城':{lat:45.6196,lng:122.8388}, '辽源':{lat:42.8877,lng:125.1452}, '松原':{lat:45.1411,lng:124.8259}, '白山':{lat:41.9385,lng:126.4276}},
  '黑龙江': {'哈尔滨':{lat:45.8038,lng:126.5350}, '齐齐哈尔':{lat:47.3540,lng:123.9183}, '大庆':{lat:46.5907,lng:125.1037}, '牡丹江':{lat:44.5527,lng:129.6325}, '佳木斯':{lat:46.7996,lng:130.3180}, '鸡西':{lat:45.2952,lng:130.9694}, '鹤岗':{lat:47.3322,lng:130.2776}, '双鸭山':{lat:46.6464,lng:131.1591}, '伊春':{lat:47.7345,lng:128.8993}, '七台河':{lat:45.7713,lng:131.0034}, '黑河':{lat:50.2456,lng:127.5286}, '绥化':{lat:46.6374,lng:126.9689}},
  '陕西': {'西安':{lat:34.3416,lng:108.9398}, '宝鸡':{lat:34.3736,lng:107.2383}, '咸阳':{lat:34.3296,lng:108.7089}, '渭南':{lat:34.4998,lng:109.5098}, '汉中':{lat:33.0674,lng:107.0238}, '延安':{lat:36.5853,lng:109.4898}, '榆林':{lat:38.2854,lng:109.7347}, '安康':{lat:32.6900,lng:109.0293}, '商洛':{lat:33.8700,lng:109.9400}, '铜川':{lat:34.8966,lng:108.9451}},
  '甘肃': {'兰州':{lat:36.0611,lng:103.8343}, '天水':{lat:34.5810,lng:105.7249}, '酒泉':{lat:39.7320,lng:98.4941}, '庆阳':{lat:35.7341,lng:107.6380}, '平凉':{lat:35.5428,lng:106.6652}, '定西':{lat:35.5806,lng:104.6264}, '陇南':{lat:33.3886,lng:104.9217}, '武威':{lat:37.9299,lng:102.6346}, '张掖':{lat:38.9262,lng:100.4495}, '白银':{lat:36.5447,lng:104.1389}, '嘉峪关':{lat:39.7726,lng:98.2894}, '金昌':{lat:38.5160,lng:102.1877}, '临夏':{lat:35.6012,lng:103.2106}, '甘南':{lat:34.9834,lng:102.9110}},
  '云南': {'昆明':{lat:24.8801,lng:102.8329}, '大理':{lat:25.6065,lng:100.2679}, '丽江':{lat:26.8721,lng:100.2272}, '曲靖':{lat:25.4900,lng:103.7966}, '玉溪':{lat:24.3518,lng:102.5465}, '楚雄':{lat:25.0292,lng:101.5280}, '红河':{lat:23.3640,lng:103.3756}, '文山':{lat:23.3694,lng:104.2447}, '普洱':{lat:22.8252,lng:100.9660}, '西双版纳':{lat:22.0074,lng:100.7972}, '德宏':{lat:24.4364,lng:98.5854}, '保山':{lat:25.1120,lng:99.1671}, '昭通':{lat:27.3400,lng:103.7250}, '临沧':{lat:23.8770,lng:100.0899}, '怒江':{lat:25.8500,lng:98.8543}, '迪庆':{lat:27.8190,lng:99.7063}},
  '贵州': {'贵阳':{lat:26.6470,lng:106.6302}, '遵义':{lat:27.6865,lng:106.8795}, '六盘水':{lat:26.5930,lng:104.8333}, '安顺':{lat:26.2455,lng:105.9462}, '毕节':{lat:27.2813,lng:105.2847}, '铜仁':{lat:27.7183,lng:109.1892}, '黔东南':{lat:26.5835,lng:107.9829}, '黔南':{lat:26.2582,lng:107.5170}, '黔西南':{lat:25.0880,lng:104.9063}},
  '广西': {'南宁':{lat:22.8170,lng:108.3669}, '桂林':{lat:25.2734,lng:110.2907}, '柳州':{lat:24.3264,lng:109.4281}, '北海':{lat:21.4812,lng:109.1190}, '防城港':{lat:21.6146,lng:108.3545}, '钦州':{lat:21.9813,lng:108.6543}, '贵港':{lat:23.0936,lng:109.4526}, '玉林':{lat:22.6542,lng:110.1540}, '百色':{lat:23.9027,lng:106.6182}, '贺州':{lat:24.4033,lng:111.5527}, '河池':{lat:24.6960,lng:108.0853}, '来宾':{lat:23.7335,lng:109.2214}, '崇左':{lat:22.4041,lng:107.3646}, '梧州':{lat:23.4767,lng:111.2791}},
  '海南': {'海口':{lat:20.0444,lng:110.1989}, '三亚':{lat:18.2528,lng:109.5119}, '儋州':{lat:19.5171,lng:109.5769}, '三沙':{lat:16.8314,lng:112.3372}, '五指山':{lat:18.7754,lng:109.5167}, '琼海':{lat:19.2581,lng:110.4747}, '文昌':{lat:19.5436,lng:110.7537}, '万宁':{lat:18.7953,lng:110.3894}, '东方':{lat:19.0951,lng:108.6537}},
  '内蒙古': {'呼和浩特':{lat:40.8426,lng:111.7510}, '包头':{lat:40.6574,lng:109.8403}, '赤峰':{lat:42.2570,lng:118.8892}, '鄂尔多斯':{lat:39.6087,lng:109.7814}, '通辽':{lat:43.6527,lng:122.2438}, '呼伦贝尔':{lat:49.2120,lng:119.7659}, '巴彦淖尔':{lat:40.7433,lng:107.3879}, '乌兰察布':{lat:41.0340,lng:113.1330}, '锡林郭勒':{lat:43.9333,lng:116.0500}, '兴安盟':{lat:46.0763,lng:122.0700}, '阿拉善':{lat:38.8440,lng:105.7289}, '乌海':{lat:39.6734,lng:106.8256}},
  '新疆': {'乌鲁木齐':{lat:43.8256,lng:87.6168}, '喀什':{lat:39.4677,lng:75.9893}, '伊犁':{lat:43.9191,lng:81.3254}, '阿克苏':{lat:41.1673,lng:80.2610}, '和田':{lat:37.1104,lng:79.9264}, '昌吉':{lat:44.0145,lng:87.3082}, '塔城':{lat:46.7453,lng:82.9857}, '阿勒泰':{lat:47.8484,lng:88.1396}, '吐鲁番':{lat:42.9513,lng:89.1895}, '哈密':{lat:42.8185,lng:93.5151}, '博尔塔拉':{lat:44.9702,lng:82.0752}, '克孜勒苏':{lat:39.7134,lng:76.1677}, '巴音郭楞':{lat:41.7680,lng:86.1510}, '石河子':{lat:44.3023,lng:86.0229}},
  '西藏': {'拉萨':{lat:29.6500,lng:91.1409}, '日喀则':{lat:29.2671,lng:88.8808}, '林芝':{lat:29.6486,lng:94.3624}, '昌都':{lat:31.1369,lng:97.1786}, '山南':{lat:29.2360,lng:91.7728}, '那曲':{lat:31.4762,lng:92.0513}, '阿里':{lat:32.5017,lng:80.1055}},
  '宁夏': {'银川':{lat:38.4872,lng:106.2309}, '石嘴山':{lat:38.9840,lng:106.3763}, '吴忠':{lat:37.9987,lng:106.1990}, '固原':{lat:36.0160,lng:106.2425}, '中卫':{lat:37.5149,lng:105.1967}},
  '青海': {'西宁':{lat:36.6171,lng:101.7782}, '海东':{lat:36.4826,lng:102.1043}, '海北':{lat:36.9540,lng:100.9010}, '海南州':{lat:36.2864,lng:100.6198}, '海西':{lat:37.3746,lng:97.3708}, '玉树':{lat:33.0042,lng:97.0070}, '果洛':{lat:34.4714,lng:100.2447}, '黄南':{lat:35.5177,lng:102.0153}},
  '香港': {'香港':{lat:22.3193,lng:114.1694}},
  '澳门': {'澳门':{lat:22.1987,lng:113.5439}},
  '台湾': {'台北':{lat:25.0330,lng:121.5654}, '高雄':{lat:22.6273,lng:120.3014}, '台中':{lat:24.1477,lng:120.6736}, '台南':{lat:22.9908,lng:120.2133}, '基隆':{lat:25.1276,lng:121.7392}, '新竹':{lat:24.8016,lng:120.9686}, '嘉义':{lat:23.4800,lng:120.4491}, '花莲':{lat:23.9871,lng:121.6016}, '台东':{lat:22.7583,lng:121.1444}, '屏东':{lat:22.6692,lng:120.4866}, '桃园':{lat:24.9936,lng:121.3010}}
};

// 天气代码映射
var WEATHER_CODES = {
  0: {desc:'晴', icon:'☀️'}, 1: {desc:'晴', icon:'☀️'}, 2: {desc:'多云', icon:'⛅'},
  3: {desc:'阴', icon:'☁️'}, 45: {desc:'雾', icon:'🌫️'}, 48: {desc:'雾凇', icon:'🌫️'},
  51: {desc:'小毛毛雨', icon:'🌦️'}, 53: {desc:'毛毛雨', icon:'🌦️'}, 55: {desc:'大毛毛雨', icon:'🌧️'},
  61: {desc:'小雨', icon:'🌦️'}, 63: {desc:'中雨', icon:'🌧️'}, 65: {desc:'大雨', icon:'🌧️'},
  66: {desc:'冻雨', icon:'🌧️'}, 67: {desc:'强冻雨', icon:'🌧️'},
  71: {desc:'小雪', icon:'🌨️'}, 73: {desc:'中雪', icon:'🌨️'}, 75: {desc:'大雪', icon:'❄️'},
  77: {desc:'米雪', icon:'🌨️'},
  80: {desc:'阵雨', icon:'🌦️'}, 81: {desc:'强阵雨', icon:'🌧️'}, 82: {desc:'暴雨', icon:'⛈️'},
  85: {desc:'阵雪', icon:'🌨️'}, 86: {desc:'强阵雪', icon:'❄️'},
  95: {desc:'雷暴', icon:'⛈️'}, 96: {desc:'雷暴冰雹', icon:'⛈️'}, 99: {desc:'强雷暴冰雹', icon:'⛈️'}
};

// 节假日数据
var HOLIDAYS_2026 = [
  {date:'01-01', name:'元旦', days:3},
  {date:'02-17', name:'春节', days:7, lunar:true},
  {date:'04-04', name:'清明节', days:3},
  {date:'05-01', name:'劳动节', days:5},
  {date:'06-19', name:'端午节', days:3},
  {date:'09-25', name:'中秋节', days:3},
  {date:'10-01', name:'国庆节', days:7}
];
var HOLIDAYS_2025 = [
  {date:'01-01', name:'元旦', days:3},
  {date:'01-29', name:'春节', days:7, lunar:true},
  {date:'04-04', name:'清明节', days:3},
  {date:'05-01', name:'劳动节', days:5},
  {date:'05-31', name:'端午节', days:3},
  {date:'10-06', name:'中秋节', days:3},
  {date:'10-01', name:'国庆节', days:7}
];

// 城市选择器
function openCityPicker() {
  var modal = document.getElementById('cityPickerModal');
  var provSelect = document.getElementById('cityPickerProvince');
  var citySelect = document.getElementById('cityPickerCity');
  var status = document.getElementById('cityPickerStatus');

  // 填充省份
  provSelect.innerHTML = '<option value="">选择省份</option>';
  Object.keys(CHINA_CITIES).forEach(function(prov) {
    provSelect.innerHTML += '<option value="' + prov + '">' + prov + '</option>';
  });

  // 如果已有保存的城市，预选
  if (typeof config !== 'undefined' && config.userCity) {
    var saved = config.userCity;
    if (saved.province && CHINA_CITIES[saved.province]) {
      provSelect.value = saved.province;
      updateCityPickerCities();
      if (saved.city) citySelect.value = saved.city;
    }
    status.textContent = '当前：' + (saved.province || '') + ' ' + (saved.city || '');
  }

  modal.classList.add('show');
}

/* 城市选择器：使用当前定位城市 */
function cityPickerUseCurrentLocation() {
  var btn = document.getElementById('cityPickerLocateBtn');
  var iconEl = document.getElementById('cityPickerLocateIcon');
  var textEl = document.getElementById('cityPickerLocateText');
  var status = document.getElementById('cityPickerStatus');
  
  btn.disabled = true;
  iconEl.textContent = '⏳';
  textEl.textContent = '正在定位...';
  status.textContent = '';
  
  var done = function(lat, lng, cityName) {
    if (lat && lng) {
      /* 在 CHINA_CITIES 中找最近的城市 */
      var bestProv = '', bestCity = '', bestDist = Infinity;
      for (var prov in CHINA_CITIES) {
        for (var city in CHINA_CITIES[prov]) {
          var c = CHINA_CITIES[prov][city];
          var d = (c.lat - lat) * (c.lat - lat) + (c.lng - lng) * (c.lng - lng);
          if (d < bestDist) { bestDist = d; bestProv = prov; bestCity = city; }
        }
      }
      if (bestProv && bestCity) {
        /* 自动选中 */
        document.getElementById('cityPickerProvince').value = bestProv;
        updateCityPickerCities();
        document.getElementById('cityPickerCity').value = bestCity;
        var distKm = Math.round(Math.sqrt(bestDist) * 111);
        status.innerHTML = '<span style="color:#0A84FF">📍 定位到最近城市：' + bestProv + ' ' + bestCity + (distKm > 5 ? '（距定位点约' + distKm + 'km）' : '') + '</span>';
        if (cityName) {
          status.innerHTML += '<br><span style="color:#8E8E93;font-size:11px">原始定位城市：' + cityName + '</span>';
        }
        showToast('已定位到：' + bestProv + ' ' + bestCity);
      } else {
        status.textContent = '定位成功但未找到匹配城市，请手动选择';
      }
    } else {
      status.textContent = '定位失败，请手动选择城市';
      showToast('定位失败，请手动选择');
    }
    btn.disabled = false;
    iconEl.textContent = '📍';
    textEl.textContent = '使用当前定位城市';
  };
  
  /* 先尝试 GPS 定位 */
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        done(pos.coords.latitude, pos.coords.longitude, null);
      },
      function(err) {
        /* GPS 失败，尝试 IP 定位 */
        status.textContent = 'GPS不可用，正在尝试网络定位...';
        if (typeof mapIPLocate === 'function') {
          mapIPLocate(function(ipLat, ipLng, ipCity) {
            done(ipLat, ipLng, ipCity);
          });
        } else {
          done(null, null, null);
        }
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else if (typeof mapIPLocate === 'function') {
    mapIPLocate(function(ipLat, ipLng, ipCity) {
      done(ipLat, ipLng, ipCity);
    });
  } else {
    done(null, null, null);
  }
}
window.cityPickerUseCurrentLocation = cityPickerUseCurrentLocation;

function closeCityPicker() {
  document.getElementById('cityPickerModal').classList.remove('show');
}

function updateCityPickerCities() {
  var prov = document.getElementById('cityPickerProvince').value;
  var citySelect = document.getElementById('cityPickerCity');
  citySelect.innerHTML = '<option value="">选择城市</option>';
  if (prov && CHINA_CITIES[prov]) {
    Object.keys(CHINA_CITIES[prov]).forEach(function(city) {
      citySelect.innerHTML += '<option value="' + city + '">' + city + '</option>';
    });
  }
}

function updateCityPickerDistricts() {
  // 预留区县选择
}

function confirmCityPicker() {
  var prov = document.getElementById('cityPickerProvince').value;
  var city = document.getElementById('cityPickerCity').value;
  if (!prov) { showToast('请选择省份'); return; }
  if (!city) { showToast('请选择城市'); return; }

  var coords = CHINA_CITIES[prov][city];
  if (!coords) { showToast('城市数据缺失'); return; }

  if (typeof config !== 'undefined') {
    config.userCity = { province: prov, city: city, lat: coords.lat, lng: coords.lng };
    Store.set('config', config);
  }

  // 同时设置地图位置（如果地图已初始化）
  if (typeof mapInstance !== 'undefined' && mapInstance && typeof mapSetMyLocation === 'function') {
    mapSetMyLocation(coords.lat, coords.lng, prov + ' · ' + city);
  } else if (typeof config !== 'undefined') {
    // 地图未初始化，先存到config，initMap时会读取
    config.mapMyLocation = { lat: coords.lat, lng: coords.lng, name: prov + ' · ' + city };
    Store.set('config', config);
  }

  closeCityPicker();
  showToast('已设置：' + prov + ' ' + city);

  // 刷新天气
  fetchWeather();
}

// 打开天气详情（点击天气小组件）
function openWeatherDetail() {
  if (typeof config === 'undefined' || !config.userCity) {
    openCityPicker();
    return;
  }
  // 显示天气详情toast
  if (window._weatherCache) {
    var w = window._weatherCache;
    var msg = w.city + ' · ' + w.desc + ' · ' + w.temp + '°C';
    if (w.humidity) msg += ' · 湿度' + w.humidity + '%';
    if (w.wind) msg += ' · ' + w.wind;
    showToast(msg);
  } else {
    fetchWeather();
  }
}

// ===== 天气获取（open-meteo，完全免费无需key） =====
function fetchWeather() {
  var lat, lng, cityName;
  if (typeof config !== 'undefined' && config.userCity) {
    lat = config.userCity.lat;
    lng = config.userCity.lng;
    cityName = config.userCity.city;
  } else if (typeof config !== 'undefined' && config.mapMyLocation) {
    lat = config.mapMyLocation.lat;
    lng = config.mapMyLocation.lng;
    cityName = config.mapMyLocation.name || '当前位置';
  } else {
    return; // 没有位置信息，不获取
  }

  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset' +
    '&timezone=Asia%2FShanghai&forecast_days=3';

  fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data || !data.current) return;
      var cur = data.current;
      var code = cur.weather_code;
      var wInfo = WEATHER_CODES[code] || {desc:'未知', icon:'🌡️'};
      var temp = Math.round(cur.temperature_2m);
      var humidity = cur.relative_humidity_2m;
      var wind = cur.wind_speed_10m ? Math.round(cur.wind_speed_10m) + 'km/h' : '';
      var feelsLike = cur.apparent_temperature ? Math.round(cur.apparent_temperature) + '°' : '';

      // 缓存天气
      window._weatherCache = {
        city: cityName,
        temp: temp,
        desc: wInfo.desc,
        icon: wInfo.icon,
        humidity: humidity,
        wind: wind,
        feelsLike: feelsLike,
        code: code,
        daily: data.daily || null
      };

      // 更新UI
      var iconEl = document.getElementById('weatherIcon');
      var tempEl = document.getElementById('weatherTemp');
      var descEl = document.getElementById('weatherDesc');
      var cityEl = document.getElementById('weatherCity');
      if (iconEl) iconEl.textContent = wInfo.icon;
      if (tempEl) tempEl.textContent = temp + '°';
      if (descEl) descEl.textContent = wInfo.desc + (feelsLike ? ' · 体感' + feelsLike : '');
      if (cityEl) cityEl.textContent = cityName;
    })
    .catch(function(err) {
      console.warn('天气获取失败:', err);
    });
}

// 获取天气上下文文本（注入AI）
function getWeatherContext() {
  if (!window._weatherCache) return '';
  var w = window._weatherCache;
  // 真实地图关闭时不包含城市名，避免泄露位置
  var mapOff = (typeof config !== 'undefined' && config.settings && config.settings.realMapEnabled === false);
  var ctx = '当前天气' + (mapOff ? '' : '（' + w.city + '）') + '：' + w.desc + '，' + w.temp + '°C';
  if (w.humidity) ctx += '，湿度' + w.humidity + '%';
  if (w.feelsLike) ctx += '，体感' + w.feelsLike + '°C';
  if (w.wind) ctx += '，风速' + w.wind;
  // 明天预报
  if (w.daily && w.daily.time && w.daily.time.length > 1) {
    var tomorrowCode = w.daily.weather_code[1];
    var tInfo = WEATHER_CODES[tomorrowCode] || {desc:''};
    var tMax = w.daily.temperature_2m_max[1];
    var tMin = w.daily.temperature_2m_min[1];
    ctx += '。明天：' + tInfo.desc + '，' + tMin + '°~' + tMax + '°C';
  }
  return ctx;
}

// ===== 真实时间上下文 =====
function getTimeContext() {
  var now = new Date();
  var weekdays = ['日','一','二','三','四','五','六'];
  var h = now.getHours();
  var m = now.getMinutes();
  var period;
  if (h < 5) period = '凌晨';
  else if (h < 9) period = '早上';
  else if (h < 12) period = '上午';
  else if (h < 14) period = '中午';
  else if (h < 17) period = '下午';
  else if (h < 19) period = '傍晚';
  else if (h < 23) period = '晚上';
  else period = '深夜';

  var month = now.getMonth() + 1;
  var date = now.getDate();
  var day = weekdays[now.getDay()];
  var timeStr = h + ':' + (m < 10 ? '0' + m : m);

  // 季节
  var season;
  if (month >= 3 && month <= 5) season = '春季';
  else if (month >= 6 && month <= 8) season = '夏季';
  else if (month >= 9 && month <= 11) season = '秋季';
  else season = '冬季';

  var ctx = '当前时间：' + now.getFullYear() + '年' + month + '月' + date + '日 星期' + day + ' ' + timeStr + '（' + period + '），' + season;

  // 节假日感知
  var mmdd = (month < 10 ? '0' + month : month) + '-' + (date < 10 ? '0' + date : date);
  var holidays = now.getFullYear() === 2026 ? HOLIDAYS_2026 : HOLIDAYS_2025;
  // 检查今天是否是节假日
  for (var i = 0; i < holidays.length; i++) {
    if (holidays[i].date === mmdd) {
      ctx += '，今天是' + holidays[i].name + '假期';
      break;
    }
  }
  // 检查3天内是否有节假日
  for (var j = 0; j < holidays.length; j++) {
    var hParts = holidays[j].date.split('-');
    var hDate = new Date(now.getFullYear(), parseInt(hParts[0]) - 1, parseInt(hParts[1]));
    var diff = Math.ceil((hDate - now) / (1000 * 60 * 60 * 24));
    if (diff > 0 && diff <= 7) {
      ctx += '，' + diff + '天后是' + holidays[j].name;
      break;
    }
  }

  // 周末感知
  if (now.getDay() === 6) ctx += '，今天是周六';
  else if (now.getDay() === 0) ctx += '，今天是周日';
  else {
    var daysToWeekend = 6 - now.getDay();
    if (daysToWeekend === 1) ctx += '，明天就是周末了';
    else if (daysToWeekend <= 3) ctx += '，还有' + daysToWeekend + '天到周末';
  }

  return ctx;
}

// ===== 热搜获取 =====
var _hotSearchCache = null;
var _hotSearchTime = 0;
function fetchHotSearch(callback) {
  // 30分钟缓存
  if (_hotSearchCache && Date.now() - _hotSearchTime < 30 * 60 * 1000) {
    callback(_hotSearchCache);
    return;
  }
  // 使用多个免费热搜源
  fetch('https://tenapi.cn/v2/weibohot')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.data && Array.isArray(data.data)) {
        var items = data.data.slice(0, 8).map(function(item) {
          return item.name || item.title || item.word || '';
        }).filter(Boolean);
        if (items.length > 0) {
          _hotSearchCache = items;
          _hotSearchTime = Date.now();
          callback(items);
          return;
        }
      }
      callback(null);
    })
    .catch(function() {
      // 备用源
      fetch('https://api.vvhan.com/api/hotlist/wbHot')
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.data && Array.isArray(data.data)) {
            var items = data.data.slice(0, 8).map(function(item) {
              return item.title || item.name || '';
            }).filter(Boolean);
            _hotSearchCache = items;
            _hotSearchTime = Date.now();
            callback(items);
          } else {
            callback(null);
          }
        })
        .catch(function() { callback(null); });
    });
}

function getHotSearchContext() {
  if (!_hotSearchCache || _hotSearchCache.length === 0) return '';
  return '当前微博热搜：' + _hotSearchCache.slice(0, 5).join('、');
}

// 异步获取热搜（不阻塞对话）
function refreshHotSearch() {
  fetchHotSearch(function() {});
}

// ===== 网易云音乐APP + MCP =====

// 修复图片URL：强制HTTPS，防止混合内容被浏览器拦截
function neFixImgUrl(url) {
  if (!url) return '';
  if (url.indexOf('http://') === 0) return 'https://' + url.substring(7);
  return url;
}

// 构建带尺寸参数的图片URL（仅对网易云CDN域名追加?param=，避免破坏其他URL）
function neImgUrl(url, size) {
  if (!url) return '';
  url = neFixImgUrl(url);
  // 仅对网易云音乐CDN域名追加尺寸参数
  if (url.indexOf('music.126.net') !== -1) {
    // 如果URL已有查询参数，用&连接；否则用?
    return url + (url.indexOf('?') !== -1 ? '&' : '?') + 'param=' + size;
  }
  return url;
}

// 图片加载失败的统一处理：先去掉?param=重试，再显示兜底背景色
function neImgOnError(img, fallbackText) {
  var origSrc = img.getAttribute('data-orig-src') || '';
  // 第一次失败：尝试用不带?param=的原始URL重试
  if (!img.getAttribute('data-retried') && origSrc) {
    img.setAttribute('data-retried', '1');
    img.src = origSrc;
    return;
  }
  // 第二次失败：清空图片，显示兜底背景色（不替换DOM，保留元素引用）
  img.removeAttribute('onerror');
  img.src = '';
  img.style.background = '#333';
}

// CORS代理列表（用于绕过网易云音乐API跨域限制，带逐个回退）
// 2026-08更新：cors.eu.org限流、corsproxy.io需付费、codetabs不稳定
// 改用 cors.sh（基于Cloudflare Workers，稳定）作为首选
var NE_PROXY_LIST = [
  function(url) { return 'https://proxy.cors.sh/' + url; },
  function(url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
  function(url) { return 'https://cors.eu.org/' + url; },
  function(url) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url); }
];

// 通过代理获取网易云音乐API数据
function neFetch(url, callback) {
  // 先尝试直连（短超时），失败再用代理
  fetch(url, { method: 'GET', mode: 'cors', signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined })
    .then(function(res) { if (!res.ok) throw new Error('direct failed'); return res.text(); })
    .then(function(text) {
      if (!text || text.length < 2) throw new Error('empty');
      try { var data = JSON.parse(text); callback(data, null); return; }
      catch(e) { throw new Error('parse error'); }
    })
    .catch(function() {
      // 直连失败，逐个尝试代理
      tryProxy(0);
    });

  function tryProxy(i) {
    if (i >= NE_PROXY_LIST.length) { callback(null, 'all proxies failed'); return; }
    var proxyUrl = NE_PROXY_LIST[i](url);
    fetch(proxyUrl, { method: 'GET', signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(text) {
        if (!text || text.length < 2) { tryProxy(i + 1); return; }
        try {
          var data = JSON.parse(text);
          callback(data, null);
        } catch(e) {
          tryProxy(i + 1);
        }
      })
      .catch(function(err) { tryProxy(i + 1); });
  }
}

// 播放器状态
var _nePlayer = { audio: null, playlist: [], currentIndex: -1, isPlaying: false, currentSong: null, context: 'hot' };
// 各列表独立存储，避免互相覆盖
var _neHotSongs = [];   // 热门歌曲列表
var _neSearchResults = []; // 搜索结果列表
var _neChartResults = [];  // 排行榜歌曲列表

// 排行榜配置
var NE_CHARTS = [
  { id: '19723756', name: '飙升榜' },
  { id: '3778678',  name: '热歌榜' },
  { id: '3772529',  name: '新歌榜' },
  { id: '2884035',  name: '原创榜' },
  { id: '991319590',name: '说唱榜' },
  { id: '71385702', name: '电音榜' }
];

// 打开网易云APP
function openNeteaseApp() {
  navigateTo('view-netease');
  if (!_nePlayer.audio) {
    _nePlayer.audio = new Audio();
    _nePlayer.audio.addEventListener('timeupdate', neOnTimeUpdate);
    _nePlayer.audio.addEventListener('ended', neNextSong);
    _nePlayer.audio.addEventListener('loadedmetadata', function() {
      var totalEl = document.getElementById('neTotalTime');
      if (totalEl) totalEl.textContent = neFormatTime(_nePlayer.audio.duration);
    });
    _nePlayer.audio.addEventListener('error', function() {
      neSetPlayIcon(false); _nePlayer.isPlaying = false;
      neRefreshListHighlight();
    });
  }
  // 首次加载推荐歌曲和排行榜
  if (!document.getElementById('neHotSongs').dataset.loaded) {
    neFetchHotSongs();
    neRenderCharts();
  }
}

// Tab切换
function neSwitchTab(tab) {
  var tabs = ['recommend', 'charts', 'search'];
  tabs.forEach(function(t) {
    var cap = t.charAt(0).toUpperCase() + t.slice(1);
    var tabEl = document.getElementById('neTab' + cap);
    var panelEl = document.getElementById('nePanel' + cap);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (panelEl) panelEl.classList.toggle('active', t === tab);
  });
}

// 获取热门歌曲（推荐页）
function neFetchHotSongs() {
  var container = document.getElementById('neHotSongs');
  container.innerHTML = '<div class="ne-loading">加载中...</div>';
  var url = 'https://music.163.com/api/playlist/detail?id=3778678';
  neFetch(url, function(data, err) {
    if (err || !data || (!data.result && !data.playlist)) {
      neSearchFallback(container, '热门 华语', true); return;
    }
    var tracks = (data.result && data.result.tracks) || (data.playlist && data.playlist.tracks) || [];
    if (!tracks.length) { neSearchFallback(container, '热门 华语', true); return; }
    var songs = tracks.slice(0, 25).map(function(t, i) {
      return {
        id: t.id, name: t.name,
        artist: (t.artists || []).map(function(a) { return a.name; }).join(' / ') || '未知歌手',
        cover: (t.album && t.album.picUrl) ? neFixImgUrl(t.album.picUrl) : '',
        duration: t.duration || 0, rank: i + 1
      };
    });
    container.dataset.loaded = '1';
    _neHotSongs = songs;
    _nePlayer.playlist = songs; _nePlayer.context = 'hot';
    neRenderSongList(container, songs, 'hot');
    // MCP缓存
    _neMusicCache = songs.slice(0, 8).map(function(s) { return s.name + ' - ' + s.artist; });
    _neMusicTime = Date.now();
  });
}

// 备用搜索（当歌单API失败时）
function neSearchFallback(container, keyword, isHot) {
  var url = 'https://music.163.com/api/search/get?s=' + encodeURIComponent(keyword) + '&type=1&limit=25';
  neFetch(url, function(data, err) {
    if (err || !data || !data.result || !data.result.songs) {
      container.innerHTML = '<div class="ne-empty"><div class="ne-empty-icon">🎵</div><div class="ne-empty-text">加载失败，请检查网络</div></div>';
      return;
    }
    var songs = data.result.songs.map(function(t, i) {
      return {
        id: t.id, name: t.name,
        artist: (t.artists || []).map(function(a) { return a.name; }).join(' / ') || '未知歌手',
        cover: (t.album && t.album.picUrl) ? neFixImgUrl(t.album.picUrl) : '',
        duration: (t.duration || 0), rank: i + 1
      };
    });
    if (isHot) { _neHotSongs = songs; _nePlayer.playlist = songs; _nePlayer.context = 'hot'; _neMusicCache = songs.slice(0, 8).map(function(s) { return s.name + ' - ' + s.artist; }); _neMusicTime = Date.now(); }
    neRenderSongList(container, songs, isHot ? 'hot' : 'search');
  });
}

// 渲染歌曲列表
function neRenderSongList(container, songs, context) {
  if (!songs || !songs.length) {
    container.innerHTML = '<div class="ne-empty"><div class="ne-empty-icon">🎵</div><div class="ne-empty-text">暂无歌曲</div></div>';
    return;
  }
  var playIcon = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#666"/></svg>';
  var html = songs.map(function(s, i) {
    var isPlaying = (_nePlayer.currentSong && _nePlayer.currentSong.id === s.id && _nePlayer.isPlaying);
    var coverHtml = s.cover
      ? '<img class="ne-song-cover" src="' + neImgUrl(s.cover, '100x100') + '" data-orig-src="' + neFixImgUrl(s.cover) + '" alt="" onerror="neImgOnError(this,\'🎵\')">'
      : '<div class="ne-song-cover" style="display:flex;align-items:center;justify-content:center;font-size:18px">🎵</div>';
    var rankHtml = context === 'hot' || context === 'chart'
      ? '<div class="ne-song-rank' + (s.rank <= 3 ? ' top3' : '') + '">' + (s.rank || (i+1)) + '</div>'
      : '';
    return '<div class="ne-song-item' + (isPlaying ? ' playing' : '') + '" onclick="nePlayFromList(' + i + ',\'' + context + '\')">' +
      rankHtml + coverHtml +
      '<div class="ne-song-info"><div class="ne-song-title' + (isPlaying ? ' playing' : '') + '">' + neEsc(s.name) + '</div>' +
      '<div class="ne-song-artist">' + neEsc(s.artist) + '</div></div>' +
      '<div class="ne-song-play">' + playIcon + '</div></div>';
  }).join('');
  container.innerHTML = html;
}

// 根据context获取对应列表
function neGetListByContext(context) {
  context = context || _nePlayer.context;
  if (context === 'search') return _neSearchResults || [];
  if (context === 'chart') return _neChartResults || [];
  return _neHotSongs || _nePlayer.playlist || [];
}

// 从列表播放歌曲
function nePlayFromList(index, context) {
  var list = neGetListByContext(context);
  if (!list[index]) return;
  _nePlayer.playlist = list;
  _nePlayer.context = context;
  _nePlayer.currentIndex = index;
  nePlaySong(list[index]);
}

// 搜索歌曲
function neSearch() {
  var keyword = (document.getElementById('neSearchInput').value || '').trim();
  if (!keyword) return;
  neSwitchTab('search');
  var container = document.getElementById('neSearchResults');
  container.innerHTML = '<div class="ne-loading">搜索中...</div>';
  var url = 'https://music.163.com/api/search/get?s=' + encodeURIComponent(keyword) + '&type=1&limit=30';
  neFetch(url, function(data, err) {
    if (err || !data || !data.result || !data.result.songs) {
      container.innerHTML = '<div class="ne-empty"><div class="ne-empty-icon">🔍</div><div class="ne-empty-text">搜索失败，请重试</div></div>';
      return;
    }
    _neSearchResults = data.result.songs.map(function(t, i) {
      return {
        id: t.id, name: t.name,
        artist: (t.artists || []).map(function(a) { return a.name; }).join(' / ') || '未知歌手',
        cover: (t.album && t.album.picUrl) ? neFixImgUrl(t.album.picUrl) : '',
        duration: t.duration || 0, rank: i + 1
      };
    });
    neRenderSongList(container, _neSearchResults, 'search');
    // 搜索API不返回封面图，批量获取歌曲详情补充封面
    neFetchSearchCovers();
  });
}

// 批量获取搜索结果的封面图
function neFetchSearchCovers() {
  if (!_neSearchResults.length) return;
  // 收集没有封面的歌曲ID
  var needCovers = _neSearchResults.filter(function(s) { return !s.cover; });
  if (!needCovers.length) return;
  var ids = needCovers.map(function(s) { return s.id; }).join(',');
  var url = 'https://music.163.com/api/song/detail?ids=[' + ids + ']';
  neFetch(url, function(data, err) {
    if (err || !data || !data.songs) return;
    var coverMap = {};
    data.songs.forEach(function(s) {
      if (s.album && s.album.picUrl) coverMap[s.id] = neFixImgUrl(s.album.picUrl);
    });
    var updated = false;
    _neSearchResults.forEach(function(s) {
      if (!s.cover && coverMap[s.id]) { s.cover = coverMap[s.id]; updated = true; }
    });
    // 如果有更新，重新渲染列表
    if (updated) {
      var container = document.getElementById('neSearchResults');
      if (container) neRenderSongList(container, _neSearchResults, 'search');
    }
  });
}

// 排行榜
function neRenderCharts() {
  var grid = document.getElementById('neChartGrid');
  if (!grid) return;
  var colors = ['#E8342D', '#FF6B35', '#4A90D9', '#7B68EE', '#2ECC71', '#E67E22'];
  grid.innerHTML = NE_CHARTS.map(function(c, i) {
    return '<div class="ne-chart-card" onclick="neOpenChart(\'' + c.id + '\',\'' + c.name + '\')" style="background:linear-gradient(135deg,' + colors[i%colors.length] + ',' + colors[i%colors.length] + 'cc)">' +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;opacity:0.3">📊</div>' +
      '<div class="ne-chart-name">' + c.name + '</div></div>';
  }).join('');
}

function neOpenChart(chartId, chartName) {
  var songListEl = document.getElementById('neChartSongs');
  var listEl = document.getElementById('neChartSongList');
  var titleEl = document.getElementById('neChartTitle');
  songListEl.style.display = 'block';
  titleEl.textContent = '📊 ' + chartName;
  listEl.innerHTML = '<div class="ne-loading">加载中...</div>';
  var url = 'https://music.163.com/api/playlist/detail?id=' + chartId;
  neFetch(url, function(data, err) {
    if (err || !data || (!data.result && !data.playlist)) {
      listEl.innerHTML = '<div class="ne-empty"><div class="ne-empty-text">加载失败</div></div>'; return;
    }
    var tracks = (data.result && data.result.tracks) || (data.playlist && data.playlist.tracks) || [];
    _neChartResults = tracks.slice(0, 25).map(function(t, i) {
      return {
        id: t.id, name: t.name,
        artist: (t.artists || []).map(function(a) { return a.name; }).join(' / ') || '未知歌手',
        cover: (t.album && t.album.picUrl) ? neFixImgUrl(t.album.picUrl) : '',
        duration: t.duration || 0, rank: i + 1
      };
    });
    neRenderSongList(listEl, _neChartResults, 'chart');
  });
}

// 播放歌曲
function nePlaySong(song) {
  _nePlayer.currentSong = song;
  _nePlayer.isPlaying = true;
  // 更新播放栏
  var bar = document.getElementById('nePlayerBar');
  var progressWrap = document.getElementById('neProgressWrap');
  bar.classList.remove('hidden');
  progressWrap.classList.remove('hidden');
  document.getElementById('nePlayerTitle').textContent = song.name;
  document.getElementById('nePlayerArtist').textContent = song.artist;
  var coverEl = document.getElementById('nePlayerCover');
  if (song.cover) {
    coverEl.removeAttribute('data-retried');
    coverEl.src = neImgUrl(song.cover, '100x100');
    coverEl.setAttribute('data-orig-src', neFixImgUrl(song.cover));
    coverEl.setAttribute('onerror', "neImgOnError(this,'🎵')");
    coverEl.style.display = '';
    coverEl.style.background = '';
  }
  else { coverEl.style.background = '#C20C0C'; coverEl.src = ''; }
  neSetPlayIcon(true);
  // 播放
  var audio = _nePlayer.audio;
  audio.src = 'https://music.163.com/song/media/outer/url?id=' + song.id + '.mp3';
  audio.play().catch(function(e) {
    showToast('播放失败，部分歌曲需要VIP');
    neSetPlayIcon(false); _nePlayer.isPlaying = false;
    neRefreshListHighlight();
  });
  // 更新列表高亮
  neRefreshListHighlight();
  // 自动获取歌词（切歌时重新加载）
  _neLyrics = [];
  neFetchLyrics(song.id);
  // 如果歌词面板已打开，重新渲染
  var overlay = document.getElementById('neDetailOverlay');
  if (overlay && overlay.classList.contains('show')) {
    document.getElementById('neDetailSongTitle').textContent = song.name;
  }
  // 一起听模式同步
  if (typeof _neTg !== 'undefined' && _neTg.active) { neTgOnSongChange(); neTgUpdatePlayIcon(); }
}

// 切换播放/暂停
function neTogglePlay() {
  if (!_nePlayer.currentSong) return;
  var audio = _nePlayer.audio;
  if (_nePlayer.isPlaying) { audio.pause(); _nePlayer.isPlaying = false; }
  else { audio.play().catch(function(){}); _nePlayer.isPlaying = true; }
  neSetPlayIcon(_nePlayer.isPlaying);
  neRefreshListHighlight();
  // 一起听模式同步
  if (typeof _neTg !== 'undefined' && _neTg.active) neTgUpdatePlayIcon();
}

// 下一首
function neNextSong() {
  var list = neGetListByContext();
  if (!list.length) return;
  _nePlayer.playlist = list;
  _nePlayer.currentIndex = (_nePlayer.currentIndex + 1) % list.length;
  nePlaySong(list[_nePlayer.currentIndex]);
}

// 设置播放/暂停图标
function neSetPlayIcon(playing) {
  var btn = document.getElementById('nePlayBtn');
  if (!btn) return;
  var path = playing
    ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="#E8E8E8"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#E8E8E8"/></svg>';
  btn.innerHTML = path;
}

// 进度更新
function neOnTimeUpdate() {
  if (!_nePlayer.audio) return;
  var cur = _nePlayer.audio.currentTime || 0;
  var dur = _nePlayer.audio.duration || 0;
  var pct = dur > 0 ? (cur / dur * 100) : 0;
  // 拖拽中不更新进度条（避免拖拽时跳回）
  if (!_neSeeking) {
    var fill = document.getElementById('neProgressFill');
    var curEl = document.getElementById('neCurrentTime');
    if (fill) fill.style.width = pct + '%';
    if (curEl) curEl.textContent = neFormatTime(cur);
    // 一起听模式进度条同步
    if (typeof _neTg !== 'undefined' && _neTg.active) {
      var tgFill = document.getElementById('neTgProgressFill');
      var tgCurEl = document.getElementById('neTgCurTime');
      if (tgFill) tgFill.style.width = pct + '%';
      if (tgCurEl) tgCurEl.textContent = neFormatTime(cur);
    }
  }
  // 歌词高亮（拖拽时也要更新，两个面板都更新）
  neUpdateLyricHighlight(cur);
  if (typeof _neTg !== 'undefined' && _neTgMode === 'lyrics') {
    neTgUpdateLyricHighlight();
  }
}

// 拖动进度
var _neSeeking = false;
function neSeek(event) {
  if (!_nePlayer.audio) return;
  var dur = _nePlayer.audio.duration;
  if (!dur || !isFinite(dur) || isNaN(dur)) return;
  // 从事件中获取进度条元素（支持点击和拖拽两种来源）
  var bar = event.currentTarget || document.getElementById('neProgressBar');
  if (!bar) return;
  var rect = bar.getBoundingClientRect();
  var clientX = event.clientX !== undefined ? event.clientX : (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
  var pct = (clientX - rect.left) / rect.width;
  pct = Math.max(0, Math.min(1, pct));
  _nePlayer.audio.currentTime = pct * dur;
  // 立即更新进度条显示（同时更新普通和一起听模式）
  var fill = document.getElementById('neProgressFill');
  var curEl = document.getElementById('neCurrentTime');
  if (fill) fill.style.width = (pct * 100) + '%';
  if (curEl) curEl.textContent = neFormatTime(pct * dur);
  var tgFill = document.getElementById('neTgProgressFill');
  var tgCurEl = document.getElementById('neTgCurTime');
  if (tgFill) tgFill.style.width = (pct * 100) + '%';
  if (tgCurEl) tgCurEl.textContent = neFormatTime(pct * dur);
}

// 进度条拖拽支持
function neSeekStart(event) {
  _neSeeking = true;
  neSeek(event);
  event.preventDefault();
}
function neSeekMove(event) {
  if (!_neSeeking) return;
  neSeek(event);
}
function neSeekEnd() {
  _neSeeking = false;
}

// 格式化时间
function neFormatTime(sec) {
  sec = Math.floor(sec || 0);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// 刷新列表高亮
function neRefreshListHighlight() {
  var containers = [
    { id: 'neHotSongs', list: _neHotSongs },
    { id: 'neSearchResults', list: _neSearchResults },
    { id: 'neChartSongList', list: _neChartResults }
  ];
  containers.forEach(function(c) {
    var el = document.getElementById(c.id);
    if (!el || !c.list) return;
    var items = el.querySelectorAll('.ne-song-item');
    items.forEach(function(item, i) {
      var song = c.list[i];
      var isCurrent = (_nePlayer.currentSong && song && _nePlayer.currentSong.id === song.id);
      item.classList.toggle('playing', isCurrent && _nePlayer.isPlaying);
      item.classList.toggle('current', isCurrent);
      var titleEl = item.querySelector('.ne-song-title');
      if (titleEl) {
        titleEl.classList.toggle('playing', isCurrent && _nePlayer.isPlaying);
        titleEl.classList.toggle('current', isCurrent);
      }
    });
  });
}

// ===== 歌词 =====
var _neLyrics = []; // [{time, text}]
var _neLyricCache = {}; // 歌词缓存 {songId: lyrics}

function neOpenLyrics() {
  if (!_nePlayer.currentSong) return;
  var overlay = document.getElementById('neDetailOverlay');
  document.getElementById('neDetailSongTitle').textContent = _nePlayer.currentSong.name;
  document.getElementById('neLyricsPanel').style.display = '';
  document.getElementById('neCommentsPanel').style.display = 'none';
  overlay.classList.add('show');
  if (!_neLyrics.length) neFetchLyrics(_nePlayer.currentSong.id);
  else neRenderLyrics();
}

function neFetchLyrics(songId) {
  // 检查缓存
  if (_neLyricCache[songId]) {
    _neLyrics = _neLyricCache[songId];
    neRenderLyrics();
    // 如果一起听模式激活且当前在歌词模式，同步渲染
    if (typeof _neTg !== 'undefined' && _neTg.active && _neTgMode === 'lyrics') neTgRenderLyrics();
    return;
  }
  var container = document.getElementById('neLyricsContainer');
  if (container) container.innerHTML = '<div class="ne-loading">加载歌词中...</div>';
  var url = 'https://music.163.com/api/song/lyric?id=' + songId + '&lv=1&kv=1&tv=-1';
  neFetch(url, function(data, err) {
    if (err || !data || !data.lrc || !data.lrc.lyric) {
      _neLyrics = [];
      if (container) container.innerHTML = '<div class="ne-lyric-empty">暂无歌词</div>';
      // 同步一起听歌词
      if (typeof _neTg !== 'undefined' && _neTg.active && _neTgMode === 'lyrics') neTgRenderLyrics();
      return;
    }
    _neLyrics = neParseLyrics(data.lrc.lyric);
    if (data.tlyric && data.tlyric.lyric) {
      var tLyrics = neParseLyrics(data.tlyric.lyric);
      _neLyrics = neMergeLyrics(_neLyrics, tLyrics);
    }
    // 缓存歌词（最多缓存50首）
    _neLyricCache[songId] = _neLyrics;
    var cacheKeys = Object.keys(_neLyricCache);
    if (cacheKeys.length > 50) delete _neLyricCache[cacheKeys[0]];
    neRenderLyrics();
    // 同步一起听歌词
    if (typeof _neTg !== 'undefined' && _neTg.active && _neTgMode === 'lyrics') neTgRenderLyrics();
  });
}

function neParseLyrics(text) {
  var lines = text.split('\n');
  var result = [];
  lines.forEach(function(line) {
    // 每行创建新的正则实例，避免 g 标志的 lastIndex 状态问题
    var timeReg = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g;
    var matches = [];
    var m;
    while ((m = timeReg.exec(line)) !== null) {
      matches.push(parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 1000);
    }
    var lyricText = line.replace(timeReg, '').trim();
    if (matches.length && lyricText) {
      matches.forEach(function(t) { result.push({ time: t, text: lyricText }); });
    }
  });
  result.sort(function(a, b) { return a.time - b.time; });
  return result;
}

function neMergeLyrics(main, trans) {
  var map = {};
  trans.forEach(function(t) { map[t.time] = t.text; });
  return main.map(function(l) {
    return { time: l.time, text: l.text, translation: map[l.time] || '' };
  });
}

function neRenderLyrics() {
  var container = document.getElementById('neLyricsContainer');
  if (!_neLyrics.length) { container.innerHTML = '<div class="ne-lyric-empty">暂无歌词</div>'; return; }
  container.innerHTML = _neLyrics.map(function(l, i) {
    var t = l.translation ? '<br><span style="font-size:12px;color:#888">' + neEsc(l.translation) + '</span>' : '';
    return '<div class="ne-lyric-line" data-time="' + l.time + '" data-index="' + i + '">' + neEsc(l.text) + t + '</div>';
  }).join('');
  // 渲染后先重置到顶部
  var scrollEl = document.getElementById('neLyricsPanel');
  if (scrollEl) scrollEl.scrollTop = 0;
  neUpdateLyricHighlight(_nePlayer.audio ? _nePlayer.audio.currentTime : 0);
}

function neUpdateLyricHighlight(curTime) {
  if (!_neLyrics.length) return;
  var container = document.getElementById('neLyricsContainer');
  if (!container) return;
  var activeIdx = -1;
  for (var i = 0; i < _neLyrics.length; i++) {
    if (_neLyrics[i].time <= curTime) activeIdx = i;
    else break;
  }
  var lines = container.querySelectorAll('.ne-lyric-line');
  lines.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
  var scrollEl = document.getElementById('neLyricsPanel');
  if (!scrollEl) return;
  if (activeIdx >= 0 && lines[activeIdx]) {
    var lineEl = lines[activeIdx];
    var targetTop = lineEl.offsetTop - scrollEl.clientHeight / 2 + lineEl.clientHeight / 2;
    scrollEl.scrollTop = targetTop;
  } else {
    // 还没到第一句歌词，滚到顶部显示第一句
    scrollEl.scrollTop = 0;
  }
}

// ===== 热评 =====
function neOpenComments() {
  if (!_nePlayer.currentSong) return;
  document.getElementById('neLyricsPanel').style.display = 'none';
  document.getElementById('neCommentsPanel').style.display = '';
  neFetchComments(_nePlayer.currentSong.id);
}

function neFetchComments(songId) {
  var container = document.getElementById('neCommentsList');
  container.innerHTML = '<div class="ne-loading">加载评论中...</div>';
  var url = 'https://music.163.com/api/v1/resource/comments/R_SO_4_' + songId + '?limit=15';
  neFetch(url, function(data, err) {
    if (err || !data || !data.hotComments) {
      // 尝试另一个评论API格式
      if (data && data.data && data.data.hotComments) {
        neRenderComments(container, data.data.hotComments); return;
      }
      container.innerHTML = '<div class="ne-comment-empty">暂无热门评论</div>'; return;
    }
    neRenderComments(container, data.hotComments);
  });
}

function neRenderComments(container, comments) {
  if (!comments || !comments.length) {
    container.innerHTML = '<div class="ne-comment-empty">暂无热门评论</div>'; return;
  }
  var colors = ['#E8342D', '#FF6B35', '#4A90D9', '#7B68EE', '#2ECC71', '#E67E22', '#9B59B6', '#1ABC9C'];
  container.innerHTML = comments.map(function(c) {
    var name = (c.user && c.user.nickname) || '匿名用户';
    var avatar = (c.user && c.user.avatarUrl) ? neFixImgUrl(c.user.avatarUrl) : '';
    var color = colors[name.charCodeAt(0) % colors.length];
    var avatarHtml = avatar
      ? '<img class="ne-comment-avatar" src="' + neImgUrl(avatar, '60x60') + '" data-orig-src="' + neFixImgUrl(avatar) + '" alt="" style="object-fit:cover" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="ne-comment-avatar" style="display:none;background:' + color + '">' + neEsc(name.charAt(0)) + '</div>'
      : '<div class="ne-comment-avatar" style="background:' + color + '">' + neEsc(name.charAt(0)) + '</div>';
    var content = neEsc(c.content || '');
    var likedCount = c.likedCount || 0;
    return '<div class="ne-comment-item">' +
      '<div class="ne-comment-user">' + avatarHtml + '<div class="ne-comment-name">' + neEsc(name) + '</div></div>' +
      '<div class="ne-comment-content">' + content + '</div>' +
      '<div class="ne-comment-meta"><span>👍 ' + neFormatCount(likedCount) + '</span></div>' +
      '</div>';
  }).join('');
}

function neFormatCount(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  return String(n);
}

// 关闭详情面板
function neCloseDetail() {
  document.getElementById('neDetailOverlay').classList.remove('show');
}

// ===== 网易云同款「一起听」模式 =====

var _neTg = {
  active: false,
  startTime: 0,
  autoTalkTimer: null,
  bubbleCount: 0,
  maxBubbles: 4,
  busy: false,
  dialogue: []
};

// 获取用户头像HTML
function neTgGetUserAvatarHtml() {
  if (typeof config !== 'undefined' && config.user && config.user.avatar) {
    return '<img src="' + config.user.avatar + '" alt="">';
  }
  var name = (config && config.user && config.user.name) ? config.user.name.charAt(0) : '我';
  return '<span style="font-size:24px">' + neEsc(name) + '</span>';
}

// 获取角色头像HTML（使用当前选择的角色）
function neTgGetCharAvatarHtml() {
  var char = (typeof config !== 'undefined' && config.characters) ? config.characters[currentCharIdx || 0] : null;
  // 优先用角色列表中的头像
  if (char && char.avatar) {
    if (char.avatar.startsWith('data:')) return '<img src="' + char.avatar + '" alt="">';
    return '<span style="font-size:24px">' + neEsc(char.avatar) + '</span>';
  }
  // 角色名首字
  var name = (char && char.name) ? char.name : ((config && config.role && config.role.name) ? config.role.name.charAt(0) : '?');
  return '<span style="font-size:24px">' + neEsc(name.charAt ? name.charAt(0) : name) + '</span>';
}

// 生成星空背景（只生成一次）
var _neTgStarsGenerated = false;
function neTgGenerateStars() {
  if (_neTgStarsGenerated) return;
  var container = document.getElementById('neTgStars');
  if (!container) return;
  container.innerHTML = '';
  for (var i = 0; i < 40; i++) {
    var star = document.createElement('div');
    star.className = 'ne-together-star';
    var size = Math.random() * 2 + 0.5;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 70 + '%';
    star.style.animationDelay = Math.random() * 3 + 's';
    container.appendChild(star);
  }
  var bokehColors = ['#C20C0C', '#4A90D9', '#7B68EE', '#FF6B35'];
  for (var j = 0; j < 3; j++) {
    var b = document.createElement('div');
    b.className = 'ne-together-bokeh';
    b.style.background = bokehColors[j];
    b.style.width = (Math.random() * 80 + 60) + 'px';
    b.style.height = b.style.width;
    b.style.left = Math.random() * 80 + '%';
    b.style.top = Math.random() * 60 + '%';
    b.style.animationDelay = (j * 2) + 's';
    container.appendChild(b);
  }
  _neTgStarsGenerated = true;
}

// 点击聊天卡片 → 搜索歌曲 → 打开角色选择
// 打开角色选择面板
function neOpenTogetherSelect() {
  if (!_nePlayer.currentSong) { showToast('请先播放一首歌'); return; }
  var selectPanel = document.getElementById('neTogetherSelect');
  var scroll = document.getElementById('neTsScroll');
  if (!selectPanel || !scroll) return;
  // 渲染角色列表
  var chars = (config.characters || []);
  var html = '<div class="ne-ts-section-title">选择角色一起听</div><div class="ne-ts-char-grid">';
  if (chars.length === 0) {
    html += '<div style="color:#666;font-size:14px;padding:20px;text-align:center;width:100%">还没有角色，请先在设置中创建角色</div>';
  } else {
    chars.forEach(function(char, idx) {
      var name = char.name || '角色' + (idx + 1);
      var avatar = '';
      if (char.avatar) {
        if (char.avatar.startsWith('data:')) avatar = '<img src="' + char.avatar + '" alt="">';
        else avatar = '<span style="font-size:22px">' + neEsc(char.avatar) + '</span>';
      } else {
        avatar = '<span style="font-size:22px">' + neEsc(name.charAt(0)) + '</span>';
      }
      html += '<div class="ne-ts-char-item" onclick="neStartTogetherWithChar(' + idx + ')">' +
        '<div class="ne-ts-char-avatar">' + avatar + '</div>' +
        '<div class="ne-ts-char-name">' + neEsc(name) + '</div>' +
        '</div>';
    });
  }
  html += '</div>';
  scroll.innerHTML = html;
  selectPanel.classList.add('show');
}

// 关闭角色选择面板（= 自己听）
function neCloseTogetherSelect() {
  document.getElementById('neTogetherSelect').classList.remove('show');
}

// 自己听：进入播放界面（黑胶模式），可切换歌词，无角色对话
function neStartSoloListen() {
  document.getElementById('neTogetherSelect').classList.remove('show');
  if (!_nePlayer.currentSong) { showToast('请先播放一首歌'); return; }
  var api = config.api;
  if (!api.baseUrl || !api.apiKey || !api.model) {
    // 无API也允许进入，只是没有角色对话
  }
  if (_neTg.active) return;

  _neTg.active = true;
  _neTg.soloMode = true; // 标记为自己听模式
  _neTg.startTime = Date.now();
  _neTg.dialogue = [];
  _neTg.busy = false;
  _neTgMode = 'vinyl';

  // 渲染星空
  neTgGenerateStars();
  // 渲染头像（自己听模式只显示用户头像，隐藏角色头像）
  document.getElementById('neTgUserAvatar').innerHTML = neTgGetUserAvatarHtml();
  var charAvatarEl = document.getElementById('neTgCharAvatar');
  if (charAvatarEl) charAvatarEl.style.display = 'none';
  // 歌曲信息
  neTgOnSongChange();
  // 连接信息
  neTgUpdateConnectInfo();
  // 清空气泡区
  document.getElementById('neTgBubbles').innerHTML = '';
  // 重置模式为黑胶
  var vinylWrap = document.getElementById('neTgVinylWrap');
  var lyricsMode = document.getElementById('neTgLyricsMode');
  if (vinylWrap) vinylWrap.style.display = '';
  if (lyricsMode) lyricsMode.classList.remove('show');
  // 播放图标
  neTgUpdatePlayIcon();
  // 显示覆盖层
  document.getElementById('neTogetherOverlay').classList.add('show');
  // 如果没在播放，自动播放
  if (!_nePlayer.isPlaying) neTogglePlay();
  // 不启动角色自动说话定时器（自己听模式）
}

// 选择了角色 → 发送邀请，等好友同意
function neStartTogetherWithChar(charIdx) {
  // 关闭选择面板
  document.getElementById('neTogetherSelect').classList.remove('show');
  // 设置当前角色
  if (typeof currentCharIdx !== 'undefined') currentCharIdx = charIdx;
  // 检查 API 配置
  var api = config.api;
  if (!api.baseUrl || !api.apiKey || !api.model) { showToast('请先配置AI API'); return; }
  // 发送邀请（好友同意流程）
  neTgSendInvite(charIdx);
}

// 发送一起听邀请，等好友同意
async function neTgSendInvite(charIdx) {
  var char = config.characters ? config.characters[charIdx] : null;
  if (!char) { showToast('角色不存在'); return; }
  var charName = (config.role && config.role.name) || char.name || '好友';
  var song = _nePlayer.currentSong;

  // 显示邀请弹窗
  var overlay = document.getElementById('neTogetherOverlay');
  if (!overlay) return;

  // 创建邀请等待界面
  var inviteHtml = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;background:rgba(0,0,0,0.85)" id="neTgInviteWait">' +
    '<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:20px;animation:neTgPulse 1.5s ease-in-out infinite">' +
      '<svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:none;stroke:#fff;stroke-width:2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' +
    '</div>' +
    '<div style="color:#fff;font-size:17px;font-weight:600;margin-bottom:8px">邀请' + neEsc(charName) + '一起听</div>' +
    '<div style="color:rgba(255,255,255,0.6);font-size:13px;margin-bottom:30px" id="neTgInviteStatus">等待对方接受邀请...</div>' +
    '<div style="color:rgba(255,255,255,0.4);font-size:12px;margin-bottom:24px;text-align:center;max-width:240px">《' + neEsc(song.name) + '》-' + neEsc(song.artist) + '</div>' +
    '<div style="display:flex;gap:12px">' +
      '<button onclick="neTgCancelInvite()" style="padding:10px 24px;border-radius:20px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:rgba(255,255,255,0.7);font-size:14px;cursor:pointer">取消</button>' +
    '</div>' +
  '</div>';

  // 显示覆盖层
  overlay.classList.add('show');
  // 渲染星空背景
  neTgGenerateStars();

  // 插入邀请等待界面
  var oldInvite = document.getElementById('neTgInviteWait');
  if (oldInvite) oldInvite.remove();
  overlay.insertAdjacentHTML('beforeend', inviteHtml);

  // AI 判断是否接受邀请
  try {
    var accept = await neTgCheckInviteAccept(charIdx);
    var waitEl = document.getElementById('neTgInviteWait');
    var statusEl = document.getElementById('neTgInviteStatus');
    if (accept) {
      if (statusEl) statusEl.textContent = '对方已接受邀请！';
      // 延迟后进入一起听
      setTimeout(function() {
        if (waitEl) waitEl.remove();
        neShareWithChar();
      }, 1200);
    } else {
      if (statusEl) statusEl.textContent = '对方暂时不方便，稍后再试吧';
      setTimeout(function() {
        if (waitEl) waitEl.remove();
        overlay.classList.remove('show');
      }, 1000);
    }
  } catch(e) {
    var statusEl2 = document.getElementById('neTgInviteStatus');
    if (statusEl2) statusEl2.textContent = '网络异常，请重试';
    setTimeout(function() {
      var waitEl2 = document.getElementById('neTgInviteWait');
      if (waitEl2) waitEl2.remove();
      overlay.classList.remove('show');
    }, 1500);
  }
}

// AI 判断是否接受一起听邀请
async function neTgCheckInviteAccept(charIdx) {
  var char = config.characters ? config.characters[charIdx] : null;
  if (!char) return false;
  var role = config.role;
  var charName = role ? role.name : '角色';
  var song = _nePlayer.currentSong;

  // 简短上下文
  var mood = getCharLastMood ? getCharLastMood(char) : '';
  var recentChat = '';
  var hist = char.chatHistory || [];
  var recent = hist.slice(-5);
  if (recent.length) {
    recentChat = recent.map(function(m) {
      var who = m.role === 'user' ? '用户' : charName;
      return who + ': ' + (m.content || '').substring(0, 80);
    }).join('\n');
  }

  var sys = '你是' + charName + '。' + (role.persona || '').substring(0, 1500) +
    (mood ? '\n你最近的心情：' + mood : '') +
    (recentChat ? '\n\n最近聊天：\n' + recentChat : '') +
    '\n\n用户邀请你一起听《' + song.name + '》-' + song.artist + '。' +
    '\n请判断你是否接受邀请。考虑你的性格、当前心情、和用户的关系。' +
    '\n只回复"接受"或"拒绝"，不要有其他内容。';

  try {
    var reply = await callApi([
      { role: 'system', content: sys },
      { role: 'user', content: '一起听《' + song.name + '》吗？' }
    ], { maxTokens: 10, temperature: 0.7 });
    reply = (reply || '').trim();
    // 判断回复内容
    if (reply.indexOf('接受') >= 0 || reply.indexOf('好') >= 0 || reply.indexOf('嗯') >= 0 || reply.indexOf('可以') >= 0 || reply.indexOf('行') >= 0) {
      return true;
    }
    return false;
  } catch(e) {
    return true; // 网络异常默认接受
  }
}

// 取消邀请
function neTgCancelInvite() {
  var waitEl = document.getElementById('neTgInviteWait');
  if (waitEl) waitEl.remove();
  var overlay = document.getElementById('neTogetherOverlay');
  if (overlay) overlay.classList.remove('show');
}

// 打开一起听模式（入口）
function neShareWithChar() {
  if (!_nePlayer.currentSong) { showToast('请先播放一首歌'); return; }
  var api = config.api;
  if (!api.baseUrl || !api.apiKey || !api.model) { showToast('请先配置AI API'); return; }
  if (_neTg.active) return;

  _neTg.active = true;
  _neTg.soloMode = false; // 一起听模式
  _neTg.startTime = Date.now();
  _neTg.dialogue = [];
  _neTg.busy = false;
  _neTgMode = 'vinyl';

  // 渲染星空（只生成一次）
  neTgGenerateStars();
  // 渲染头像
  document.getElementById('neTgUserAvatar').innerHTML = neTgGetUserAvatarHtml();
  var charAvatarEl = document.getElementById('neTgCharAvatar');
  if (charAvatarEl) { charAvatarEl.style.display = ''; charAvatarEl.innerHTML = neTgGetCharAvatarHtml(); }
  // 歌曲信息
  neTgOnSongChange();
  // 连接信息
  neTgUpdateConnectInfo();
  // 清空气泡区
  document.getElementById('neTgBubbles').innerHTML = '';
  // 重置模式为黑胶
  var vinylWrap = document.getElementById('neTgVinylWrap');
  var lyricsMode = document.getElementById('neTgLyricsMode');
  if (vinylWrap) vinylWrap.style.display = '';
  if (lyricsMode) lyricsMode.classList.remove('show');
  // 播放图标
  neTgUpdatePlayIcon();
  // 显示覆盖层
  document.getElementById('neTogetherOverlay').classList.add('show');
  // 如果没在播放，自动播放
  if (!_nePlayer.isPlaying) neTogglePlay();

  // 延迟后角色主动说话（10秒后，让用户先适应界面）
  _neTg.autoTalkTimer = setTimeout(function() {
    neTgCharAutoTalk();
  }, 10000);

  // 定期更新连接信息（10秒一次，减少卡顿）
  _neTg.connectTimer = setInterval(neTgUpdateConnectInfo, 10000);
}

// 关闭一起听
function neTgClose() {
  document.getElementById('neTogetherOverlay').classList.remove('show');
  _neTg.active = false;
  _neTg.soloMode = false;
  if (_neTg.autoTalkTimer) { clearTimeout(_neTg.autoTalkTimer); _neTg.autoTalkTimer = null; }
  if (_neTg.connectTimer) { clearInterval(_neTg.connectTimer); _neTg.connectTimer = null; }
  // 恢复角色头像显示
  var charAvatarEl = document.getElementById('neTgCharAvatar');
  if (charAvatarEl) charAvatarEl.style.display = '';
}

// 添加气泡（单气泡模式：新消息替换旧消息）
function neTgAddBubble(type, text) {
  var container = document.getElementById('neTgBubbles');
  if (!container) return;
  // 淡出旧气泡
  var old = container.querySelector('.ne-tg-bubble');
  if (old) {
    old.classList.add('fading');
    setTimeout(function() { if (old.parentNode) old.parentNode.removeChild(old); }, 300);
  }
  // 移除typing
  var typing = container.querySelector('.ne-tg-bubble-typing');
  if (typing) typing.remove();
  // 延迟显示新气泡（让旧的淡出）
  setTimeout(function() {
    var bubble = document.createElement('div');
    bubble.className = 'ne-tg-bubble ' + type;
    bubble.textContent = text;
    container.appendChild(bubble);
  }, 150);
  _neTg.dialogue.push({ role: type, text: text, time: Date.now(), song: _nePlayer.currentSong ? _nePlayer.currentSong.name + ' - ' + _nePlayer.currentSong.artist : '' });
}

// 显示角色正在输入（单气泡）
function neTgShowCharTyping() {
  var container = document.getElementById('neTgBubbles');
  // 先淡出旧气泡
  var old = container.querySelector('.ne-tg-bubble');
  if (old) {
    old.classList.add('fading');
    setTimeout(function() { if (old.parentNode) old.parentNode.removeChild(old); }, 300);
  }
  var existing = container.querySelector('.ne-tg-bubble-typing');
  if (existing) existing.remove();
  setTimeout(function() {
    var typing = document.createElement('div');
    typing.className = 'ne-tg-bubble char ne-tg-bubble-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typing);
  }, 150);
}

// 构建角色说话的上下文（强化歌曲关联 + 完整人设/记忆/聊天/歌词）
function neTgBuildContext(extraUserMsg) {
  var role = config.role;
  var char = config.characters ? config.characters[currentCharIdx || 0] : null;
  var song = _nePlayer.currentSong;
  var mood = char ? getCharLastMood(char) : '';
  var userName = (config.user && (config.user.personaName || config.user.name)) || '用户';

  // 1. 角色人设（优先 role.system，其次 role.persona）
  var charPersona = (role.system || role.persona || '').substring(0, 3000);

  // 2. 用户人设
  var userPersona = '';
  if (config.user) {
    var up = [];
    if (config.user.personaName || config.user.name) up.push('称呼：' + (config.user.personaName || config.user.name));
    if (config.user.persona) up.push('人设描述：' + config.user.persona);
    if (config.user.personaRelations) up.push('人际关系：' + config.user.personaRelations);
    if (up.length) userPersona = up.join('\n');
  }

  // 3. 角色位置
  var charLocation = '';
  if (char && char.location) charLocation = char.location;

  // 4. 歌词上下文（当前句 + 前后各2句，提供更丰富的歌词感知）
  var lyricSnippet = '';
  if (typeof _neLyrics !== 'undefined' && _neLyrics.length) {
    var curTime = (_nePlayer.audio && _nePlayer.audio.currentTime) || 0;
    var activeIdx = -1;
    for (var i = 0; i < _neLyrics.length; i++) {
      if (_neLyrics[i].time <= curTime) activeIdx = i;
      else break;
    }
    if (activeIdx >= 0) {
      var lyricLines = [];
      for (var j = Math.max(0, activeIdx - 2); j <= Math.min(_neLyrics.length - 1, activeIdx + 2); j++) {
        var prefix = (j === activeIdx) ? '▶ ' : '  ';
        lyricLines.push(prefix + (_neLyrics[j].text || ''));
      }
      lyricSnippet = '当前歌词（▶为正在唱的句）：\n' + lyricLines.join('\n');
    }
  }

  // 5. 最近聊天记录（增加到15条，截断放宽到150字）
  var recentChat = '';
  var hist = (char && char.chatHistory) ? char.chatHistory : (config.chatHistory || []);
  var recent = hist.slice(-15);
  if (recent.length) {
    recentChat = recent.map(function(m) {
      var who = m.role === 'user' ? userName : (role.name || '角色');
      var c = m.content || '';
      // 清理标签
      c = c.replace(/<inner_voice[^>]*>[\s\S]*?<\/inner_voice>/gi, '')
           .replace(THINK_CLOSED_RE, '')
           .replace(/<miyavoice>[\s\S]*?<\/miyavoice>/gi, '').trim();
      return who + ': ' + c.substring(0, 150);
    }).join('\n');
  }

  // 6. 记忆摘要（增加到5条，截断放宽到200字）
  var memory = '';
  if (char && char.memories && char.memories.length) {
    memory = char.memories.slice(-5).map(function(m) {
      return (m.content || m.summary || m.text || '').substring(0, 200);
    }).join('\n');
  }

  // 7. 一起听对话历史
  var tgDialogue = '';
  if (_neTg.dialogue.length) {
    tgDialogue = _neTg.dialogue.map(function(d) {
      var who = d.role === 'char' ? (role.name || '角色') : userName;
      return who + ': ' + d.text;
    }).join('\n');
  }

  // 组装完整系统提示
  var sys = '你是' + (role.name || '对方') + '。\n\n=== 角色设定 ===\n' + charPersona +
    (charLocation ? '\n\n=== 所在位置 ===\n你当前所在的城市/位置是：' + charLocation + '。' : '') +
    (userPersona ? '\n\n=== 用户人设 ===\n以下是与你对话的用户的人设信息。请在对话中参考此人设，自然地称呼用户、回应用户的性格特征：\n' + userPersona : '') +
    '\n\n=== 当前场景 ===\n你和' + userName + '正在用网易云「一起听」功能一起听歌。' +
    '当前播放：《' + song.name + '》-' + song.artist + '。' +
    (lyricSnippet ? '\n\n' + lyricSnippet : '') +
    (mood ? '\n你最近的心情：' + mood : '') +
    (recentChat ? '\n\n=== 最近聊天 ===\n' + recentChat : '') +
    (memory ? '\n\n=== 你的记忆 ===\n' + memory : '') +
    (tgDialogue ? '\n\n=== 一起听对话 ===\n' + tgDialogue : '');

  var userContent = extraUserMsg || ('你们正在一起听《' + song.name + '》这首歌。结合这首歌的风格、歌词或歌名，说一句和这首歌有关的话——可以是你的感受、这首歌让你想到的回忆、或者想跟' + userName + '分享的关于这首歌的想法。');

  return { sys: sys, userContent: userContent };
}

// 角色自动说话（强化歌曲关联）
async function neTgCharAutoTalk() {
  if (!_neTg.active || _neTg.busy) return;
  _neTg.busy = true;

  neTgShowCharTyping();
  try {
    var ctx = neTgBuildContext();
    var reply = await callApi([
      { role: 'system', content: ctx.sys + '\n\n你现在想主动说一句话。要求：1. 说1-2句口语化短消息（50字以内），像微信聊天一样随意自然 2. 内容可以和当前播放的《' + _nePlayer.currentSong.name + '》这首歌有关，也可以是联想到的事 3. 要符合你的角色设定和性格，用你的语气说话 4. 不要解释、不要加引号、不要用[卡片]格式、不要输出thinking标签 5. 把话说完整，不要超过60字' },
      { role: 'user', content: ctx.userContent }
    ], { maxTokens: 1200, temperature: 0.95 });
    reply = (reply || '').trim();
    reply = reply.replace(/^\[.*?\]\s*/g, '').replace(/^["""']|["""']$/g, '').trim();
    // 移除可能残留的thinking标签和其他格式标记
    reply = reply.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/<\/?thinking>/gi, '').trim();
    if (reply.length > 120) reply = reply.substring(0, 120);
    if (reply) neTgAddBubble('char', reply);
    else neTgAddBubble('char', '这首歌好好听啊~');
  } catch(e) {
    neTgAddBubble('char', '这首歌好好听啊~');
  } finally {
    _neTg.busy = false;
    // 下一次自动说话（60-150秒随机，偶尔才说话，不频繁打扰）
    if (_neTg.active) {
      // 40%概率不说话，直接等下一轮（让角色只在恰当时偶尔开口）
      var skip = Math.random() < 0.4;
      var nextDelay = skip ? (60000 + Math.random() * 60000) : (90000 + Math.random() * 90000);
      _neTg.autoTalkTimer = setTimeout(function() {
        neTgCharAutoTalk();
      }, nextDelay);
    }
  }
}

// 用户回复（强化歌曲关联）
async function neTgSendReply() {
  var input = document.getElementById('neTgReplyInput');
  var text = (input.value || '').trim();
  if (!text || _neTg.busy) return;
  input.value = '';
  // 显示用户气泡（角色的会自动消失）
  neTgAddBubble('user', text);
  // 角色回复
  _neTg.busy = true;
  neTgShowCharTyping();
  try {
    var ctx = neTgBuildContext(text);
    var reply = await callApi([
      { role: 'system', content: ctx.sys + '\n\n用户在「一起听」里给你发了消息。请回复：1. 说1-2句口语化短消息（60字以内），像微信聊天一样 2. 自然地回应TA说的话 3. 如果合适的话，可以结合当前播放的《' + _nePlayer.currentSong.name + '》来回应 4. 要符合你的角色设定和性格，用你的语气说话 5. 不要解释、不要加引号、不要用[卡片]格式、不要输出thinking标签 6. 把话说完整' },
      { role: 'user', content: text }
    ], { maxTokens: 1500, temperature: 0.9 });
    reply = (reply || '').trim();
    reply = reply.replace(/^\[.*?\]\s*/g, '').replace(/^["""']|["""']$/g, '').trim();
    // 移除可能残留的thinking标签和其他格式标记
    reply = reply.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/<\/?thinking>/gi, '').trim();
    if (reply.length > 500) reply = reply.substring(0, 500);
    if (reply) neTgAddBubble('char', reply);
    else neTgAddBubble('char', '嗯嗯~');
  } catch(e) {
    neTgAddBubble('char', '嗯嗯~');
  } finally {
    _neTg.busy = false;
  }
}

// 点击屏幕切换黑胶/歌词模式
var _neTgMode = 'vinyl'; // 'vinyl' or 'lyrics'
function neTgToggleMode() {
  var vinylWrap = document.getElementById('neTgVinylWrap');
  var lyricsMode = document.getElementById('neTgLyricsMode');
  if (!vinylWrap || !lyricsMode) return;
  if (_neTgMode === 'vinyl') {
    _neTgMode = 'lyrics';
    vinylWrap.style.display = 'none';
    lyricsMode.classList.add('show');
    neTgRenderLyrics();
    neTgSyncLyricCover();
  } else {
    _neTgMode = 'vinyl';
    vinylWrap.style.display = '';
    lyricsMode.classList.remove('show');
  }
}

// 渲染歌词到一起听字幕模式
function neTgRenderLyrics() {
  var container = document.getElementById('neTgLyricsContainer');
  if (!container) return;
  if (typeof _neLyrics === 'undefined' || !_neLyrics.length) {
    container.innerHTML = '<div class="ne-tg-lyric-line empty">暂无歌词</div>';
    return;
  }
  container.innerHTML = _neLyrics.map(function(l, i) {
    return '<div class="ne-tg-lyric-line" data-time="' + l.time + '" data-index="' + i + '">' + neEsc(l.text) + '</div>';
  }).join('');
  // 渲染后先重置到顶部
  var tgScrollEl = document.getElementById('neTgLyricsScroll');
  if (tgScrollEl) tgScrollEl.scrollTop = 0;
  neTgUpdateLyricHighlight();
}

// 歌词高亮同步（一起听模式）
function neTgUpdateLyricHighlight() {
  if (_neTgMode !== 'lyrics') return;
  var container = document.getElementById('neTgLyricsContainer');
  var scrollEl = document.getElementById('neTgLyricsScroll');
  if (!container || typeof _neLyrics === 'undefined' || !_neLyrics.length) return;
  var curTime = (_nePlayer.audio && _nePlayer.audio.currentTime) || 0;
  var activeIdx = -1;
  for (var i = 0; i < _neLyrics.length; i++) {
    if (_neLyrics[i].time <= curTime) activeIdx = i;
    else break;
  }
  var lines = container.querySelectorAll('.ne-tg-lyric-line');
  lines.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
  if (activeIdx >= 0 && lines[activeIdx] && scrollEl) {
    var scrollTarget = lines[activeIdx].offsetTop - scrollEl.clientHeight / 2 + lines[activeIdx].clientHeight / 2;
    scrollEl.scrollTop = scrollTarget;
  } else if (scrollEl) {
    scrollEl.scrollTop = 0;
  }
}

// 同步歌词模式封面
function neTgSyncLyricCover() {
  var coverImg = document.getElementById('neTgLyricCoverImg');
  if (!coverImg || !_nePlayer.currentSong) return;
  if (_nePlayer.currentSong.cover) {
    coverImg.removeAttribute('data-retried');
    coverImg.src = neImgUrl(_nePlayer.currentSong.cover, '200x200');
    coverImg.setAttribute('data-orig-src', neFixImgUrl(_nePlayer.currentSong.cover));
    coverImg.setAttribute('onerror', "neImgOnError(this,'🎵')");
    coverImg.style.background = '';
  }
  else { coverImg.style.background = '#C20C0C'; coverImg.src = ''; }
}

// 一起听模式：打开评论面板
function neTgOpenComments() {
  if (!_nePlayer.currentSong) return;
  var overlay = document.getElementById('neTogetherOverlay');
  if (!overlay) return;
  // 移除已存在的评论面板
  var oldPanel = document.getElementById('neTgCommentsPanel');
  if (oldPanel) oldPanel.remove();
  // 创建评论面板（叠加在了一起听覆盖层上）
  var panel = document.createElement('div');
  panel.id = 'neTgCommentsPanel';
  panel.style.cssText = 'position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;background:#1C1C1E;animation:neTogetherFadeIn 0.3s ease';
  panel.innerHTML =
    '<div class="ne-tg-nav">' +
      '<div class="ne-tg-nav-btn" onclick="neTgCloseComments()">' +
        '<svg viewBox="0 0 24 24"><path d="M7.4 15.4L6 14l6-6 6 6-1.4 1.4L12 10.8z" fill="#E8E8E8"/></svg>' +
      '</div>' +
      '<div class="ne-tg-song-info"><div class="ne-tg-song-title">热门评论</div></div>' +
      '<div style="width:32px"></div>' +
    '</div>' +
    '<div style="flex:1;overflow-y:auto;padding:16px" id="neTgCommentsList">' +
      '<div class="ne-loading">加载评论中...</div>' +
    '</div>';
  overlay.appendChild(panel);
  // 获取评论
  neTgFetchComments();
}

// 一起听模式：关闭评论面板
function neTgCloseComments() {
  var panel = document.getElementById('neTgCommentsPanel');
  if (panel) panel.remove();
}

// 一起听模式：获取评论
function neTgFetchComments() {
  var container = document.getElementById('neTgCommentsList');
  if (!container || !_nePlayer.currentSong) return;
  var url = 'https://music.163.com/api/v1/resource/comments/R_SO_4_' + _nePlayer.currentSong.id + '?limit=15';
  neFetch(url, function(data, err) {
    if (err || !data) { container.innerHTML = '<div class="ne-lyric-empty">加载失败</div>'; return; }
    var comments = data.hotComments || (data.data && data.data.hotComments) || [];
    if (!comments.length) { container.innerHTML = '<div class="ne-comment-empty">暂无热门评论</div>'; return; }
    neTgRenderComments(container, comments);
  });
}

// 一起听模式：渲染评论
function neTgRenderComments(container, comments) {
  var colors = ['#E8342D', '#FF6B35', '#4A90D9', '#7B68EE', '#2ECC71', '#E67E22', '#9B59B6', '#1ABC9C'];
  container.innerHTML = comments.map(function(c) {
    var name = (c.user && c.user.nickname) || '匿名用户';
    var avatar = (c.user && c.user.avatarUrl) ? neFixImgUrl(c.user.avatarUrl) : '';
    var color = colors[name.charCodeAt(0) % colors.length];
    var avatarHtml = avatar
      ? '<img class="ne-comment-avatar" src="' + neImgUrl(avatar, '60x60') + '" data-orig-src="' + neFixImgUrl(avatar) + '" alt="" style="object-fit:cover" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"><div class="ne-comment-avatar" style="display:none;background:' + color + '">' + neEsc(name.charAt(0)) + '</div>'
      : '<div class="ne-comment-avatar" style="background:' + color + '">' + neEsc(name.charAt(0)) + '</div>';
    var content = neEsc(c.content || '');
    var likes = c.likedCount || 0;
    return '<div style="display:flex;gap:10px;padding:12px 0;border-bottom:0.5px solid rgba(255,255,255,0.06)">' +
      avatarHtml +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;color:#8E8E93;margin-bottom:4px">' + name + '</div>' +
        '<div style="font-size:14px;color:#fff;line-height:1.5;word-break:break-word">' + content + '</div>' +
        '<div style="font-size:12px;color:#8E8E93;margin-top:6px">👍 ' + likes + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// 历史记录面板
function neTgOpenHistory() {
  var panel = document.getElementById('neTgHistoryPanel');
  var scroll = document.getElementById('neTgHistoryScroll');
  if (!panel || !scroll) return;
  if (!_neTg.dialogue.length) {
    scroll.innerHTML = '<div class="ne-tg-history-empty">还没有对话记录</div>';
  } else {
    var role = config.role;
    var charName = role ? role.name : '角色';
    var userName = (config.user && config.user.name) ? config.user.name : '我';
    var userAvatar = neTgGetUserAvatarHtml();
    var charAvatar = neTgGetCharAvatarHtml();
    scroll.innerHTML = _neTg.dialogue.map(function(d) {
      var isChar = d.role === 'char';
      var cls = isChar ? 'char' : 'user';
      var avatar = isChar ? charAvatar : userAvatar;
      var name = isChar ? charName : userName;
      var songInfo = d.song ? '<div class="ne-tg-history-song">🎵 ' + neEsc(d.song) + '</div>' : '';
      return '<div class="ne-tg-history-item ' + cls + '">' +
        '<div class="ne-tg-history-avatar">' + avatar + '</div>' +
        '<div><div class="ne-tg-history-bubble ' + cls + '">' + neEsc(d.text) + '</div>' + songInfo + '</div>' +
        '</div>';
    }).join('');
    scroll.scrollTop = scroll.scrollHeight;
  }
  panel.classList.add('show');
}

function neTgCloseHistory() {
  document.getElementById('neTgHistoryPanel').classList.remove('show');
}

// 存入记忆（标注网易云APP）
function neTgSaveToMemory() {
  if (!_neTg.dialogue.length) { showToast('没有对话可保存'); return; }
  var char = config.characters ? config.characters[currentCharIdx || 0] : null;
  if (!char) { showToast('请先选择角色'); return; }
  // 构建记忆文本
  var role = config.role;
  var charName = role ? role.name : '角色';
  var summary = _neTg.dialogue.map(function(d) {
    var who = d.role === 'char' ? charName : '用户';
    return who + ': ' + d.text;
  }).join('\n');
  // 限制长度
  if (summary.length > 500) summary = summary.substring(0, 500) + '...';
  var songName = _nePlayer.currentSong ? _nePlayer.currentSong.name + ' - ' + _nePlayer.currentSong.artist : '未知歌曲';
  var memoryText = '【网易云APP·一起听】一起听了《' + songName + '》时的对话：\n' + summary;
  // 添加到角色记忆
  if (!char.memories) char.memories = [];
  char.memories.push({ content: memoryText, time: Date.now(), source: '网易云APP·一起听' });
  // 限制记忆数量
  if (char.memories.length > 50) char.memories = char.memories.slice(-50);
  Store.set('config', config);
  showToast('已存入记忆（网易云APP·一起听）');
}

// 进度条拖动
function neTgSeek(event) {
  neSeek(event);
}

// 进度更新同步
function neTgSyncProgress() {
  if (!_nePlayer.audio) return;
  var cur = _nePlayer.audio.currentTime || 0;
  var dur = _nePlayer.audio.duration || 0;
  var pct = dur > 0 ? (cur / dur * 100) : 0;
  var fill = document.getElementById('neTgProgressFill');
  var curEl = document.getElementById('neTgCurTime');
  if (fill) fill.style.width = pct + '%';
  if (curEl) curEl.textContent = neFormatTime(cur);
  // 歌词模式高亮同步
  if (_neTgMode === 'lyrics') neTgUpdateLyricHighlight();
}

// 歌曲变化时更新一起听界面
function neTgOnSongChange() {
  if (!_nePlayer.currentSong) return;
  document.getElementById('neTgSongTitle').textContent = _nePlayer.currentSong.name;
  document.getElementById('neTgSongArtist').textContent = _nePlayer.currentSong.artist;
  var cover = document.getElementById('neTgVinylCover');
  if (_nePlayer.currentSong.cover) {
    cover.removeAttribute('data-retried');
    cover.src = neImgUrl(_nePlayer.currentSong.cover, '200x200');
    cover.setAttribute('data-orig-src', neFixImgUrl(_nePlayer.currentSong.cover));
    cover.setAttribute('onerror', "neImgOnError(this,'🎵')");
    cover.style.background = '';
  }
  else { cover.style.background = '#C20C0C'; cover.src = ''; }
  neTgSyncLyricCover();
  // 歌词已在nePlaySong中重新加载，这里重新渲染一起听歌词界面
  if (_neTgMode === 'lyrics') {
    neTgRenderLyrics();
  }
  if (_nePlayer.audio) {
    var totalEl = document.getElementById('neTgTotalTime');
    if (totalEl && _nePlayer.audio.duration) totalEl.textContent = neFormatTime(_nePlayer.audio.duration);
  }
}

// 更新播放图标
function neTgUpdatePlayIcon() {
  var btn = document.getElementById('neTgPlayBtn');
  var vinyl = document.getElementById('neTgVinyl');
  var lyricCover = document.getElementById('neTgLyricCover');
  if (!btn) return;
  var playing = _nePlayer.isPlaying;
  var path = playing
    ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="rgba(255,255,255,0.8)"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="rgba(255,255,255,0.8)"/></svg>';
  btn.innerHTML = path;
  if (vinyl) { if (playing) vinyl.classList.add('spinning'); else vinyl.classList.remove('spinning'); }
  if (lyricCover) { if (playing) lyricCover.classList.add('spinning'); else lyricCover.classList.remove('spinning'); }
}

// 更新连接信息
function neTgUpdateConnectInfo() {
  var el = document.getElementById('neTgConnectInfo');
  if (!el) return;
  var elapsed = Math.floor((Date.now() - _neTg.startTime) / 1000);
  var min = Math.floor(elapsed / 60);
  var sec = elapsed % 60;
  var timeStr = min > 0 ? min + '分' + sec + '秒' : sec + '秒';
  el.textContent = '一起听了 ' + timeStr;
}

// 搜索对方推荐的歌曲并预加载（保留旧功能）
function neSearchAndPreload(keyword) {
  var url = 'https://music.163.com/api/search/get?s=' + encodeURIComponent(keyword) + '&type=1&limit=1';
  neFetch(url, function(data, err) {
    if (err || !data || !data.result || !data.result.songs || !data.result.songs.length) return;
    var s = data.result.songs[0];
    var song = {
      id: s.id, name: s.name,
      artist: (s.artists || []).map(function(a) { return a.name; }).join(' / ') || '未知歌手',
      cover: (s.album && s.album.picUrl) ? neFixImgUrl(s.album.picUrl) : ''
    };
    if (_nePlayer.playlist && _nePlayer.currentIndex >= 0) {
      _nePlayer.playlist.splice(_nePlayer.currentIndex + 1, 0, song);
      showToast('🎵 对方推荐了《' + song.name + '》，已加入播放列表');
    }
  });
}

// HTML转义
function neEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 网易云MCP：热门歌曲上下文注入 =====
var _neMusicCache = null;
var _neMusicTime = 0;

function fetchNeteaseMusic(callback) {
  // 30分钟缓存
  if (_neMusicCache && Date.now() - _neMusicTime < 30 * 60 * 1000) {
    callback(_neMusicCache); return;
  }
  var url = 'https://music.163.com/api/playlist/detail?id=3778678';
  neFetch(url, function(data, err) {
    if (err || !data || (!data.result && !data.playlist)) {
      // 备用搜索
      var sUrl = 'https://music.163.com/api/search/get?s=' + encodeURIComponent('热门歌曲') + '&type=1&limit=10';
      neFetch(sUrl, function(sData, sErr) {
        if (sErr || !sData || !sData.result || !sData.result.songs) { callback(null); return; }
        _neMusicCache = sData.result.songs.slice(0, 8).map(function(s) {
          return s.name + ' - ' + (s.artists || []).map(function(a) { return a.name; }).join('/');
        });
        _neMusicTime = Date.now();
        callback(_neMusicCache);
      });
      return;
    }
    var tracks = (data.result && data.result.tracks) || (data.playlist && data.playlist.tracks) || [];
    _neMusicCache = tracks.slice(0, 8).map(function(t) {
      return t.name + ' - ' + (t.artists || []).map(function(a) { return a.name; }).join('/');
    });
    _neMusicTime = Date.now();
    callback(_neMusicCache);
  });
}

function getNeteaseMusicContext() {
  if (!_neMusicCache || !_neMusicCache.length) return '';
  return '当前网易云音乐热歌榜：' + _neMusicCache.join('、') + '。你平时会用网易云听歌，可以在聊天中自然地聊到这些歌、推荐音乐或分享听歌感受，但不要生硬地列歌单。';
}

function refreshNeteaseMusic() {
  fetchNeteaseMusic(function() {});
}

// ===== 综合MCP上下文注入 =====
// 获取用户位置字符串（供各APP共用）
function getUserLocationStr() {
  // 真实地图关闭时，不返回用户位置（论坛、同人文、手机克隆等均依赖此函数）
  if (typeof config !== 'undefined' && config.settings && config.settings.realMapEnabled === false) {
    return '';
  }
  if (typeof config !== 'undefined' && config.userCity) {
    return config.userCity.province + config.userCity.city;
  }
  if (typeof config !== 'undefined' && config.mapMyLocation && config.mapMyLocation.name) {
    return config.mapMyLocation.name;
  }
  return '';
}

// 获取角色位置字符串
function getCharLocationStr(char) {
  if (!char) return '';
  if (char.location) return char.location;
  return '';
}

function getMCPContext() {
  var parts = [];

  // 时间
  if (config.settings.timeAwarenessEnabled) {
    var timeCtx = getTimeContext();
    if (timeCtx) parts.push('=== 实时时间感知（重要） ===\n' + timeCtx + '\n\n【时间感知要求】你必须真正感知并使用上述真实时间信息：\n1. 根据当前时段自然问候（早上说"早啊"、晚上说"还没睡？"、深夜说"怎么这么晚还醒着"）；\n2. 根据星期几调整行为（工作日可以提到上班/上课的疲惫，周末可以表现出放松或约出去玩的意愿）；\n3. 根据季节提及应季事物（夏天说热/吃冰、冬天说冷/穿衣服）；\n4. 如果临近节假日，自然地表达期待或计划；\n5. 你的生物钟要和时间一致——凌晨不会说"刚吃完午饭"，深夜不会说"出去跑步"；\n6. 可以在回复中自然穿插时间信息，但不要像报时器一样生硬地念出完整时间。');
  }

  // 天气（真实地图关闭时不注入，避免通过天气间接推断位置）
  if (typeof config !== 'undefined' && config.settings && config.settings.realMapEnabled !== false) {
    var weatherCtx = getWeatherContext();
    if (weatherCtx) parts.push('=== 实时天气感知（MCP） ===\n' + weatherCtx + '。请在对话中自然地参考天气（如提醒带伞、穿衣服、适合出门等），但不要每次都提天气。');
  }

  // 用户城市（真实地图关闭时不注入位置）
  if (typeof config !== 'undefined' && config.settings && config.settings.realMapEnabled !== false && config.userCity) {
    var locInfo = '用户当前在' + config.userCity.province + config.userCity.city + '。';
    // 同时注入角色位置，让AI感知是否异地
    if (config.characters && config.characters[currentCharIdx] && config.characters[currentCharIdx].location) {
      var charLoc = config.characters[currentCharIdx].location;
      locInfo += '你当前在' + charLoc + '。';
      if (charLoc.indexOf(config.userCity.city) === -1 && config.userCity.city.indexOf(charLoc) === -1) {
        locInfo += '你们目前在不同的城市，可能存在异地感。';
      }
    }
    locInfo += '请在推荐美食、活动等时参考此位置。';
    parts.push('=== 用户所在地 ===\n' + locInfo);
  } else if (typeof config !== 'undefined' && config.settings && config.settings.realMapEnabled !== false && config.characters && config.characters[currentCharIdx] && config.characters[currentCharIdx].location) {
    // 只设置了角色位置，没有用户位置
    parts.push('=== 角色所在地 ===\n你当前在' + config.characters[currentCharIdx].location + '。请在对话中自然地体现对这个城市的感知。');
  }

  // 热搜
  var hotCtx = getHotSearchContext();
  if (hotCtx) parts.push('=== 实时热搜（MCP） ===\n' + hotCtx + '。你了解这些热搜话题，可以在聊天中自然地提及，但不要生硬地列热搜。');

  // 网易云音乐
  var musicCtx = getNeteaseMusicContext();
  if (musicCtx) parts.push('=== 网易云音乐感知（MCP） ===\n' + musicCtx);

  return parts.join('\n\n');
}

// ===== 天气小组件初始化 =====
function initWeatherWidget() {
  if (typeof config !== 'undefined' && config.userCity) {
    fetchWeather();
  } else {
    // 尝试用地图位置
    if (typeof config !== 'undefined' && config.mapMyLocation) {
      fetchWeather();
    } else {
      // 首次提示
      var descEl = document.getElementById('weatherDesc');
      if (descEl) descEl.textContent = '点击设置你的城市';
    }
  }
  // 刷新热搜
  refreshHotSearch();
  // 刷新网易云音乐热歌榜（MCP）
  refreshNeteaseMusic();
}

// ===== 高德地图API Key管理 =====
function getAmapKey() {
  if (typeof config !== 'undefined' && config.amapKey) return config.amapKey;
  return '';
}

function mapShowKeyDialog() {
  var modal = document.getElementById('amapKeyModal');
  var input = document.getElementById('amapKeyInput');
  var status = document.getElementById('amapKeyStatus');
  input.value = getAmapKey();
  if (getAmapKey()) {
    status.textContent = '✅ 完整模式：搜索和导航在APP内完成';
    status.style.color = '#34C759';
  } else {
    status.textContent = '✅ 基础模式：搜索和导航跳转高德网页版（可直接使用）';
    status.style.color = '#34C759';
  }
  modal.classList.add('show');
}

function mapCloseKeyDialog() {
  document.getElementById('amapKeyModal').classList.remove('show');
}

function mapSaveAmapKey() {
  var key = document.getElementById('amapKeyInput').value.trim();
  if (!key) { showToast('请输入API Key'); return; }
  if (typeof config !== 'undefined') {
    config.amapKey = key;
    Store.set('config', config);
  } else {
    localStorage.setItem('amapKey', key);
  }
  mapCloseKeyDialog();
  showToast('API Key已保存，搜索和导航可正常使用了');
}

function mapRequireKey() {
  if (getAmapKey()) return true;
  showToast('请先设置高德地图API Key');
  mapShowKeyDialog();
  return false;
}

// ===== 坐标转换 WGS84 → GCJ02（高德坐标系） =====
function wgs84ToGcj02(lng, lat) {
  var a = 6378245.0;
  var ee = 0.00669342162296594323;
  function _transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function _transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
  }
  var dLat = _transformLat(lng - 105.0, lat - 35.0);
  var dLng = _transformLng(lng - 105.0, lat - 35.0);
  var radLat = lat / 180.0 * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { lng: lng + dLng, lat: lat + dLat };
}

// ===== 高德polyline字符串转GeoJSON =====
function amapPolylineToGeoJSON(polyline) {
  var coords = polyline.split(';').map(function(pt) {
    var p = pt.split(',');
    return [parseFloat(p[0]), parseFloat(p[1])]; // [lng, lat]
  });
  return { type: 'LineString', coordinates: coords };
}

// 高德polyline转Leaflet [lat,lng]数组
function amapPolylineToLatLngs(polyline) {
  return polyline.split(';').map(function(pt) {
    var p = pt.split(',');
    return [parseFloat(p[1]), parseFloat(p[0])]; // [lat, lng]
  });
}

// 高德搜索结果统一格式化
function amapFormatPoi(poi) {
  var loc = poi.location ? poi.location.split(',') : ['0', '0'];
  return {
    name: poi.name || '未知地点',
    lat: parseFloat(loc[1]),
    lng: parseFloat(loc[0]),
    address: (poi.pname || '') + (poi.cityname || '') + (poi.adname || '') + (poi.address || ''),
    type: poi.type || ''
  };
}

function mapSearch() {
  var query = document.getElementById('mapSearchInput').value.trim();
  if (!query) return;
  if (typeof L === 'undefined') { showToast('地图库未加载'); return; }

  // 无API Key时，跳转高德地图网页版搜索
  if (!getAmapKey()) {
    showToast('跳转高德地图搜索...');
    window.open('https://uri.amap.com/search?keyword=' + encodeURIComponent(query) + '&src=mochi-phone', '_blank');
    return;
  }

  var resultsDiv = document.getElementById('mapSearchResults');
  resultsDiv.innerHTML = '<div class="map-search-item"><div class="map-search-item-icon">⏳</div><div class="map-search-item-info"><div class="map-search-item-name">搜索中...</div></div></div>';
  resultsDiv.classList.add('active');

  var key = getAmapKey();
  var url = 'https://restapi.amap.com/v3/place/text?keywords=' + encodeURIComponent(query) +
    '&key=' + key + '&offset=10&page=1&extensions=all&output=JSON';

  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
  fetch(url, { signal: controller.signal })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      if (!data || data.status !== '1' || !data.pois || data.pois.length === 0) {
        resultsDiv.innerHTML = '<div class="map-search-item"><div class="map-search-item-icon">🔍</div><div class="map-search-item-info"><div class="map-search-item-name">未找到结果</div><div class="map-search-item-addr">试试其他关键词</div></div></div>';
        return;
      }
      var pois = data.pois.map(amapFormatPoi);
      resultsDiv.innerHTML = pois.map(function(item, idx) {
        var addr = item.address.length > 50 ? item.address.substring(0, 50) + '...' : item.address;
        return '<div class="map-search-item" onclick="mapSelectResult(' + idx + ')">' +
          '<div class="map-search-item-icon">📍</div>' +
          '<div class="map-search-item-info">' +
          '<div class="map-search-item-name">' + mapEscapeHtml(item.name) + '</div>' +
          '<div class="map-search-item-addr">' + mapEscapeHtml(addr) + '</div>' +
          '</div></div>';
      }).join('');
      })
    .catch(function(err) {
      clearTimeout(timeoutId);
      var errMsg = '搜索失败';
      if (err.name === 'AbortError') errMsg = '搜索超时，请重试';
      resultsDiv.innerHTML = '<div class="map-search-item"><div class="map-search-item-icon">❌</div><div class="map-search-item-info"><div class="map-search-item-name">' + errMsg + '</div><div class="map-search-item-addr">请检查API Key是否正确</div></div></div>';
    });
}

function mapSelectResult(idx) {
  var data = window._mapSearchResults;
  if (!data || !data[idx]) return;
  var item = data[idx];
  var lat = item.lat;
  var lng = item.lng;
  var name = item.name || '选中地点';
  var addr = item.address || '';

  // 关闭搜索结果
  document.getElementById('mapSearchResults').classList.remove('active');

  // 移动到位置
  mapInstance.setView([lat, lng], 16);

  // 添加标记
  mapClearMarkers();
  var marker = L.marker([lat, lng]).addTo(mapInstance);
  marker.bindPopup(
    '<div class="map-popup-title">' + mapEscapeHtml(name) + '</div>' +
    '<div class="map-popup-addr">' + mapEscapeHtml(addr.substring(0, 60)) + '</div>' +
    '<button class="map-popup-btn" onclick="mapSetMyLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(name).replace(/'/g, "\\'") + '\')">📍设为我的位置</button>' +
    '<button class="map-popup-btn" style="margin-left:4px" onclick="mapSaveLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(name).replace(/'/g, "\\'") + '\')">⭐收藏</button>' +
    (mapCurrentLocation ? '<button class="map-popup-btn" style="margin-left:4px;background:#34C759" onclick="mapShowRoute(' + mapCurrentLocation.lat + ',' + mapCurrentLocation.lng + ',' + lat + ',' + lng + ',\'' + mapEscapeHtml(name).replace(/'/g, "\\'") + '\')">🧭导航</button>' : '') +
    '<button class="map-popup-btn" style="margin-left:4px;background:#0A84FF" onclick="mapSendLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(name).replace(/'/g, "\\'") + '\')">📤发送</button>'
  ).openPopup();
  mapMarkers.push(marker);
}

function mapLocateMe() {
  // 最优先：用户选择的城市
  if (typeof config !== 'undefined' && config.userCity) {
    var uc = config.userCity;
    mapCurrentLocation = { lat: uc.lat, lng: uc.lng };
    mapInstance.setView([uc.lat, uc.lng], 15);
    mapClearMarkers();
    var locIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
      className: 'map-loc-icon', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    var locMarker = L.marker([uc.lat, uc.lng], { icon: locIcon })
      .addTo(mapInstance)
      .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">' + uc.province + ' · ' + uc.city + '</div>');
    mapMarkers.push(locMarker);
    showToast('我的位置：' + uc.province + ' ' + uc.city);
    return;
  }
  // 其次：手动保存的位置
  if (typeof config !== 'undefined' && config.mapMyLocation) {
    var saved = config.mapMyLocation;
    mapCurrentLocation = { lat: saved.lat, lng: saved.lng };
    mapInstance.setView([saved.lat, saved.lng], 15);
    mapClearMarkers();
    var locIcon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
      className: 'map-loc-icon', iconSize: [20, 20], iconAnchor: [10, 10]
    });
    var locMarker = L.marker([saved.lat, saved.lng], { icon: locIcon })
      .addTo(mapInstance)
      .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">' + mapEscapeHtml(saved.name) + '（已保存）</div>');
    mapMarkers.push(locMarker);
    showToast('我的位置：' + saved.name);
    return;
  }
  showToast('定位中...');
  // 先尝试GPS定位
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        // GPS返回WGS84坐标，高德瓦片使用GCJ02，需要转换
        var gcj = wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude);
        mapCurrentLocation = { lat: gcj.lat, lng: gcj.lng };
        mapInstance.setView([gcj.lat, gcj.lng], 16);
        mapClearMarkers();
        var locIcon = L.divIcon({
          html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
          className: 'map-loc-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        var locMarker = L.marker([gcj.lat, gcj.lng], { icon: locIcon })
          .addTo(mapInstance)
          .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">GPS定位 · 当前所在位置</div>');
        mapMarkers.push(locMarker);
        showToast('已定位到当前位置');
      },
      function(err) {
        // GPS定位失败，尝试IP定位
        showToast('GPS不可用，尝试网络定位...');
        mapIPLocate(function(ipLat, ipLng, ipCity) {
          if (ipLat && ipLng) {
            // IP定位返回WGS84，转换为GCJ02
            var gcj = wgs84ToGcj02(ipLng, ipLat);
            mapCurrentLocation = { lat: gcj.lat, lng: gcj.lng };
            mapInstance.setView([gcj.lat, gcj.lng], 14);
            mapClearMarkers();
            var locIcon = L.divIcon({
              html: '<div style="width:20px;height:20px;background:#FF9500;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
              className: 'map-loc-icon',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });
            var locMarker = L.marker([gcj.lat, gcj.lng], { icon: locIcon })
              .addTo(mapInstance)
              .bindPopup('<div class="map-popup-title">我的位置（网络定位）</div><div class="map-popup-addr">' + (ipCity || '当前城市') + '</div>');
            mapMarkers.push(locMarker);
            showToast('已通过网络定位到' + (ipCity || '当前位置'));
          } else {
            showToast('定位失败，请手动搜索地点或点击地图选位置');
          }
        });
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else {
    // 不支持GPS，直接IP定位
    showToast('尝试网络定位...');
    mapIPLocate(function(ipLat, ipLng, ipCity) {
      if (ipLat && ipLng) {
        mapCurrentLocation = { lat: ipLat, lng: ipLng };
        mapInstance.setView([ipLat, ipLng], 14);
        mapClearMarkers();
        var locIcon = L.divIcon({
          html: '<div style="width:20px;height:20px;background:#FF9500;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
          className: 'map-loc-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        var locMarker = L.marker([ipLat, ipLng], { icon: locIcon })
          .addTo(mapInstance)
          .bindPopup('<div class="map-popup-title">我的位置（网络定位）</div><div class="map-popup-addr">' + (ipCity || '当前城市') + '</div>');
        mapMarkers.push(locMarker);
        showToast('已通过网络定位到' + (ipCity || '当前位置'));
      } else {
        showToast('定位失败，请手动搜索地点');
      }
    });
  }
}

function mapShowAddMarkerPrompt(lat, lng) {
  mapClearMarkers();
  var marker = L.marker([lat, lng]).addTo(mapInstance);
  var displayName = '自定义位置';
  // 尝试逆地理编码获取真实地址名
  if (getAmapKey()) {
    mapReverseGeocode(lat, lng, function(err, info) {
      if (!err && info && info.name && info.name !== '未知位置') {
        displayName = info.name;
        marker.setPopupContent(
          '<div class="map-popup-title">' + mapEscapeHtml(displayName) + '</div>' +
          '<div class="map-popup-addr">' + (info.structured || info.fullName || (lat.toFixed(6) + ', ' + lng.toFixed(6))) + '</div>' +
          '<button class="map-popup-btn" onclick="mapSetMyLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(displayName).replace(/'/g, "\\'") + '\')">📍设为我的位置</button>' +
          '<button class="map-popup-btn" style="margin-left:4px" onclick="mapSaveLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(displayName).replace(/'/g, "\\'") + '\')">⭐收藏</button>' +
          (mapCurrentLocation ? '<button class="map-popup-btn" style="margin-left:4px;background:#34C759" onclick="mapShowRoute(' + mapCurrentLocation.lat + ',' + mapCurrentLocation.lng + ',' + lat + ',' + lng + ',\'' + mapEscapeHtml(displayName).replace(/'/g, "\\'") + '\')">🧭导航</button>' : '') +
          '<button class="map-popup-btn" style="margin-left:4px;background:#0A84FF" onclick="mapSendLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(displayName).replace(/'/g, "\\'") + '\')">📤发送</button>'
        );
      }
    });
  }
  marker.bindPopup(
    '<div class="map-popup-title">选中位置</div>' +
    '<div class="map-popup-addr">坐标: ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</div>' +
    '<button class="map-popup-btn" onclick="mapSetMyLocation(' + lat + ',' + lng + ',\'自定义位置\')">📍设为我的位置</button>' +
    '<button class="map-popup-btn" style="margin-left:4px" onclick="mapSaveLocation(' + lat + ',' + lng + ',\'自定义位置\')">⭐收藏</button>' +
    (mapCurrentLocation ? '<button class="map-popup-btn" style="margin-left:4px;background:#34C759" onclick="mapShowRoute(' + mapCurrentLocation.lat + ',' + mapCurrentLocation.lng + ',' + lat + ',' + lng + ',\'目标位置\')">🧭导航</button>' : '') +
    '<button class="map-popup-btn" style="margin-left:4px;background:#0A84FF" onclick="mapSendLocation(' + lat + ',' + lng + ',\'自定义位置\')">📤发送</button>'
  ).openPopup();
  mapMarkers.push(marker);
}

// 设置"我的位置"（手动设置，解决IP定位不准的问题）
function mapSetMyLocation(lat, lng, name) {
  if (typeof config === 'undefined') return;
  config.mapMyLocation = { lat: lat, lng: lng, name: name };
  Store.set('config', config);
  mapCurrentLocation = { lat: lat, lng: lng };
  mapInstance.closePopup();

  // 在地图上添加"我的位置"标记
  mapClearMarkers();
  var locIcon = L.divIcon({
    html: '<div style="width:20px;height:20px;background:#0A84FF;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
    className: 'map-loc-icon', iconSize: [20, 20], iconAnchor: [10, 10]
  });
  var marker = L.marker([lat, lng], { icon: locIcon })
    .addTo(mapInstance)
    .bindPopup('<div class="map-popup-title">我的位置</div><div class="map-popup-addr">' + mapEscapeHtml(name) + ' · 已保存</div>')
    .openPopup();
  mapMarkers.push(marker);

  mapInstance.setView([lat, lng], 15);
  showToast('已设为我的位置：' + name);
}

function mapSaveLocation(lat, lng, name) {
  if (typeof config === 'undefined') return;
  if (!config.mapLocations) config.mapLocations = [];
  // 避免重复
  var exists = config.mapLocations.some(function(l) {
    return Math.abs(l.lat - lat) < 0.0001 && Math.abs(l.lng - lng) < 0.0001;
  });
  if (!exists) {
    config.mapLocations.push({ lat: lat, lng: lng, name: name, time: Date.now() });
    Store.set('config', config);
    showToast('已收藏: ' + name);
  } else {
    showToast('该地点已收藏');
  }
  mapLoadSavedLocations();
}

function mapLoadSavedLocations() {
  if (!mapInstance || typeof config === 'undefined') return;
  if (!config.mapLocations || config.mapLocations.length === 0) return;
  config.mapLocations.forEach(function(loc) {
    var marker = L.marker([loc.lat, loc.lng]).addTo(mapInstance);
    marker.bindPopup(
      '<div class="map-popup-title">' + mapEscapeHtml(loc.name) + '</div>' +
      '<div class="map-popup-addr">' + loc.lat.toFixed(4) + ', ' + loc.lng.toFixed(4) + '</div>'
    );
    mapMarkers.push(marker);
  });
}

function mapShowRoute(fromLat, fromLng, toLat, toLng, destName) {
  if (!mapInstance) return;
  // 无API Key时，跳转高德地图网页版导航
  if (!getAmapKey()) {
    showToast('跳转高德地图导航...');
    var navUrl = 'https://uri.amap.com/navigation?to=' + toLng + ',' + toLat + ',' + encodeURIComponent(destName) +
      '&from=' + fromLng + ',' + fromLat + '&mode=car&src=mochi-phone';
    window.open(navUrl, '_blank');
    return;
  }
  showToast('正在规划路线...');
  mapInstance.closePopup();

  var key = getAmapKey();
  var url = 'https://restapi.amap.com/v3/direction/driving?origin=' + fromLng + ',' + fromLat +
    '&destination=' + toLng + ',' + toLat + '&key=' + key + '&extensions=all&strategy=0';

  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 10000);
  fetch(url, { signal: controller.signal })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      if (!data || data.status !== '1' || !data.route || !data.route.paths || data.route.paths.length === 0) {
        showToast('无法规划路线：' + (data && data.info ? data.info : '请检查API Key'));
        return;
      }
      var path = data.route.paths[0];
      // 合并所有步骤的polyline为一条完整路线
      var allCoords = [];
      (path.steps || []).forEach(function(step) {
        if (step.polyline) {
          step.polyline.split(';').forEach(function(pt) {
            var p = pt.split(',');
            allCoords.push([parseFloat(p[0]), parseFloat(p[1])]);
          });
        }
      });
      if (mapRouteLayer) mapInstance.removeLayer(mapRouteLayer);
      mapRouteLayer = L.geoJSON({ type: 'LineString', coordinates: allCoords }, {
        style: { color: '#0A84FF', weight: 5, opacity: 0.8 }
      }).addTo(mapInstance);
      mapInstance.fitBounds(mapRouteLayer.getBounds(), { padding: [50, 50] });
      var distance = (parseFloat(path.distance) / 1000).toFixed(1);
      var duration = Math.round(parseFloat(path.duration) / 60);
      document.getElementById('mapRouteTitle').textContent = '🧭 导航到: ' + destName;
      document.getElementById('mapRouteDetail').textContent = '距离 ' + distance + ' 公里 · 约 ' + duration + ' 分钟';
      document.getElementById('mapRouteInfo').classList.add('active');
      showToast('路线已规划');
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      var msg = '路线规划失败';
      if (err.name === 'AbortError') msg = '路线规划超时，请重试';
      showToast(msg);
    });
}

function mapCloseRoute() {
  if (mapRouteLayer) {
    mapInstance.removeLayer(mapRouteLayer);
    mapRouteLayer = null;
  }
  document.getElementById('mapRouteInfo').classList.remove('active');
}

function mapClearMarkers() {
  mapMarkers.forEach(function(m) { mapInstance.removeLayer(m); });
  mapMarkers = [];
}

function mapEscapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 导航功能 =====
var navState = {
  mode: 'driving',
  startPoint: null,   // {lat, lng, name}
  endPoint: null,     // {lat, lng, name}
  searchTarget: null,  // 'start' | 'end'
  isNavigating: false,
  routeData: null,
  startMarker: null,
  endMarker: null
};

function mapOpenNavPanel() {
  var panel = document.getElementById('mapNavPanel');
  panel.classList.toggle('active');
  // 如果已有当前位置，自动填入起点
  if (mapCurrentLocation && !navState.startPoint) {
    document.getElementById('navStartInput').value = '我的位置';
    navState.startPoint = { lat: mapCurrentLocation.lat, lng: mapCurrentLocation.lng, name: '我的位置' };
  }
}

function mapCloseNavPanel() {
  document.getElementById('mapNavPanel').classList.remove('active');
  document.getElementById('navSearchResults').classList.remove('active');
}

function mapNavSetMode(mode) {
  navState.mode = mode;
  document.querySelectorAll('.map-nav-mode').forEach(function(el) {
    el.classList.toggle('active', el.dataset.mode === mode);
  });
}

// 搜索起点/终点
function mapNavSearchStart() {
  navState.searchTarget = 'start';
  var query = document.getElementById('navStartInput').value.trim();
  if (!query || query === '我的位置') return;
  mapNavSearchPlace(query);
}

function mapNavSearchEnd() {
  navState.searchTarget = 'end';
  var query = document.getElementById('navEndInput').value.trim();
  if (!query) return;
  mapNavSearchPlace(query);
}

function mapNavSearchPlace(query) {
  // 无API Key时，跳转高德地图网页版搜索
  if (!getAmapKey()) {
    showToast('跳转高德地图搜索...');
    window.open('https://uri.amap.com/search?keyword=' + encodeURIComponent(query) + '&src=mochi-phone', '_blank');
    return;
  }
  var resultsDiv = document.getElementById('navSearchResults');
  resultsDiv.innerHTML = '<div class="map-search-item"><div class="map-search-item-icon">⏳</div><div class="map-search-item-info"><div class="map-search-item-name">搜索中...</div></div></div>';
  resultsDiv.classList.add('active');

  var key = getAmapKey();
  var url = 'https://restapi.amap.com/v3/place/text?keywords=' + encodeURIComponent(query) +
    '&key=' + key + '&offset=8&page=1&extensions=all&output=JSON';

  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
  fetch(url, { signal: controller.signal })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      if (!data || data.status !== '1' || !data.pois || data.pois.length === 0) {
        resultsDiv.innerHTML = '<div class="map-search-item"><div class="map-search-item-icon">🔍</div><div class="map-search-item-info"><div class="map-search-item-name">未找到结果</div></div></div>';
        return;
      }
      var pois = data.pois.map(amapFormatPoi);
      resultsDiv.innerHTML = pois.map(function(item, idx) {
        var addr = item.address.length > 50 ? item.address.substring(0, 50) + '...' : item.address;
        return '<div class="map-search-item" onclick="mapNavSelectPlace(' + idx + ')">' +
          '<div class="map-search-item-icon">📍</div>' +
          '<div class="map-search-item-info">' +
          '<div class="map-search-item-name">' + mapEscapeHtml(item.name) + '</div>' +
          '<div class="map-search-item-addr">' + mapEscapeHtml(addr) + '</div>' +
          '</div></div>';
      }).join('');
      })
    .catch(function(err) {
      clearTimeout(timeoutId);
      resultsDiv.innerHTML = '<div class="map-search-item"><div class="map-search-item-icon">❌</div><div class="map-search-item-info"><div class="map-search-item-name">搜索失败</div><div class="map-search-item-addr">请稍后重试</div></div></div>';
    });
}

function mapNavSelectPlace(idx) {
  var data = window._navSearchResults;
  if (!data || !data[idx]) return;
  var item = data[idx];
  var lat = item.lat;
  var lng = item.lng;
  var name = item.name || '选中地点';

  var point = { lat: lat, lng: lng, name: name };
  if (navState.searchTarget === 'start') {
    navState.startPoint = point;
    document.getElementById('navStartInput').value = name;
  } else {
    navState.endPoint = point;
    document.getElementById('navEndInput').value = name;
  }
  document.getElementById('navSearchResults').classList.remove('active');
}

// 开始导航
function mapStartNavigation() {
  if (!navState.startPoint) {
    if (mapCurrentLocation) {
      navState.startPoint = { lat: mapCurrentLocation.lat, lng: mapCurrentLocation.lng, name: '我的位置' };
    } else {
      showToast('请设置起点，或先定位');
      return;
    }
  }
  if (!navState.endPoint) {
    showToast('请设置终点');
    return;
  }

  // 无API Key时，跳转高德地图网页版导航
  if (!getAmapKey()) {
    mapCloseNavPanel();
    showToast('跳转高德地图导航...');
    var modeMap = { driving: 'car', walking: 'walk', cycling: 'ride' };
    var navUrl = 'https://uri.amap.com/navigation?to=' + navState.endPoint.lng + ',' + navState.endPoint.lat + ',' + encodeURIComponent(navState.endPoint.name) +
      '&from=' + navState.startPoint.lng + ',' + navState.startPoint.lat + ',' + encodeURIComponent(navState.startPoint.name) +
      '&mode=' + (modeMap[navState.mode] || 'car') + '&src=mochi-phone';
    window.open(navUrl, '_blank');
    return;
  }

  mapCloseNavPanel();
  showToast('正在规划' + mapNavGetModeName(navState.mode) + '路线...');

  var key = getAmapKey();
  var origin = navState.startPoint.lng + ',' + navState.startPoint.lat;
  var dest = navState.endPoint.lng + ',' + navState.endPoint.lat;
  var url;

  if (navState.mode === 'driving') {
    url = 'https://restapi.amap.com/v3/direction/driving?origin=' + origin + '&destination=' + dest + '&key=' + key + '&extensions=all&strategy=0';
  } else if (navState.mode === 'walking') {
    url = 'https://restapi.amap.com/v3/direction/walking?origin=' + origin + '&destination=' + dest + '&key=' + key;
  } else {
    url = 'https://restapi.amap.com/v4/direction/bicycling?origin=' + origin + '&destination=' + dest + '&key=' + key;
  }

  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 10000);
  fetch(url, { signal: controller.signal })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      // 高德v3返回 route.paths，v4骑行返回 data.paths
      var path = null;
      if (navState.mode === 'cycling') {
        if (data && data.data && data.data.paths && data.data.paths.length > 0) {
          path = data.data.paths[0];
        }
      } else {
        if (data && data.route && data.route.paths && data.route.paths.length > 0) {
          path = data.route.paths[0];
        }
      }
      if (!path) {
        showToast('无法规划路线：' + (data && data.info ? data.info : '请检查起终点'));
        return;
      }
      // 合并步骤polyline为完整路线GeoJSON
      var allCoords = [];
      var steps = (path.steps || []).map(function(step) {
        if (step.polyline) {
          step.polyline.split(';').forEach(function(pt) {
            var p = pt.split(',');
            allCoords.push([parseFloat(p[0]), parseFloat(p[1])]);
          });
        }
        // 提取步骤起点坐标
        var startLoc = [0, 0];
        if (step.polyline) {
          var firstPt = step.polyline.split(';')[0].split(',');
          startLoc = [parseFloat(firstPt[1]), parseFloat(firstPt[0])]; // [lat, lng]
        }
        return {
          instruction: step.instruction || '',
          action: step.action || '',
          road: step.road || '',
          distance: parseFloat(step.distance) || 0,
          duration: parseFloat(step.duration) || 0,
          polyline: step.polyline || '',
          startLocation: startLoc
        };
      });
      // 构建统一的路线数据
      navState.routeData = {
        distance: parseFloat(path.distance) || 0,
        duration: parseFloat(path.duration) || 0,
        geometry: { type: 'LineString', coordinates: allCoords },
        steps: steps
      };
      navState.isNavigating = true;
      mapNavRenderRoute();
      mapNavShowStatus();
      mapNavShowSteps();
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      var msg = '路线规划失败';
      if (err.name === 'AbortError') msg = '规划超时，请重试';
      showToast(msg);
    });
}

function mapNavGetModeName(mode) {
  var names = { driving: '驾车', walking: '步行', cycling: '骑行' };
  return names[mode] || '驾车';
}

function mapNavGetModeIcon(mode) {
  var icons = { driving: '🚗', walking: '🚶', cycling: '🚴' };
  return icons[mode] || '🧭';
}

// 渲染路线
function mapNavRenderRoute() {
  // 清除旧路线
  if (mapRouteLayer) { mapInstance.removeLayer(mapRouteLayer); mapRouteLayer = null; }
  if (navState.startMarker) { mapInstance.removeLayer(navState.startMarker); navState.startMarker = null; }
  if (navState.endMarker) { mapInstance.removeLayer(navState.endMarker); navState.endMarker = null; }

  var route = navState.routeData;
  // 绘制路线
  var routeColor = navState.mode === 'walking' ? '#34C759' : (navState.mode === 'cycling' ? '#FF9500' : '#0A84FF');
  mapRouteLayer = L.geoJSON(route.geometry, {
    style: { color: routeColor, weight: 5, opacity: 0.85, lineJoin: 'round' }
  }).addTo(mapInstance);

  // 起点标记
  var startIcon = L.divIcon({
    html: '<div style="width:24px;height:24px;background:#34C759;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:grid;place-items:center;font-size:12px">A</div>',
    className: 'nav-start-icon', iconSize: [24, 24], iconAnchor: [12, 12]
  });
  navState.startMarker = L.marker([navState.startPoint.lat, navState.startPoint.lng], { icon: startIcon })
    .addTo(mapInstance).bindPopup('<div class="map-popup-title">起点</div><div class="map-popup-addr">' + mapEscapeHtml(navState.startPoint.name) + '</div>');

  // 终点标记
  var endIcon = L.divIcon({
    html: '<div style="width:24px;height:24px;background:#FF3B30;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:grid;place-items:center;font-size:12px;color:#fff">B</div>',
    className: 'nav-end-icon', iconSize: [24, 24], iconAnchor: [12, 12]
  });
  navState.endMarker = L.marker([navState.endPoint.lat, navState.endPoint.lng], { icon: endIcon })
    .addTo(mapInstance).bindPopup('<div class="map-popup-title">终点</div><div class="map-popup-addr">' + mapEscapeHtml(navState.endPoint.name) + '</div>');

  // 调整视野
  mapInstance.fitBounds(mapRouteLayer.getBounds(), { padding: [60, 60] });
}

// 显示导航状态栏
function mapNavShowStatus() {
  var route = navState.routeData;
  var distance = route.distance;
  var duration = route.duration;
  var distText, durText;
  if (distance < 1000) {
    distText = Math.round(distance) + '米';
  } else {
    distText = (distance / 1000).toFixed(1) + '公里';
  }
  if (duration < 60) {
    durText = Math.round(duration) + '秒';
  } else if (duration < 3600) {
    durText = Math.round(duration / 60) + '分钟';
  } else {
    var h = Math.floor(duration / 3600);
    var m = Math.round((duration % 3600) / 60);
    durText = h + '小时' + m + '分';
  }

  document.getElementById('navStatusIcon').textContent = mapNavGetModeIcon(navState.mode);
  document.getElementById('navStatusText').textContent = '前往：' + navState.endPoint.name;
  document.getElementById('navStatusMeta').textContent = mapNavGetModeName(navState.mode) + ' · ' + distText + ' · 约' + durText;
  document.getElementById('mapNavStatus').classList.add('active');
}

// 显示导航步骤
function mapNavShowSteps() {
  var route = navState.routeData;
  var allSteps = route.steps || [];

  if (allSteps.length === 0) {
    document.getElementById('navStepsList').innerHTML = '<div class="map-nav-step"><div class="map-nav-step-text" style="color:#8E8E93">无详细导航步骤</div></div>';
  } else {
    var html = allSteps.map(function(step, idx) {
      var icon = mapNavGetStepIcon(step.action);
      var text = step.instruction || mapNavGetStepText(step);
      var distText = '';
      if (step.distance > 0) {
        distText = step.distance < 1000 ? Math.round(step.distance) + '米' : (step.distance / 1000).toFixed(1) + '公里';
      }
      return '<div class="map-nav-step' + (idx === 0 ? ' current' : '') + '" data-step-idx="' + idx + '" onclick="mapNavStepClick(' + idx + ')">' +
        '<div class="map-nav-step-icon">' + icon + '</div>' +
        '<div class="map-nav-step-text">' + mapEscapeHtml(text) +
        (distText ? '<div class="map-nav-step-dist">' + distText + '</div>' : '') +
        '</div></div>';
    }).join('');
    document.getElementById('navStepsList').innerHTML = html;
  }

  var distText = route.distance < 1000 ? Math.round(route.distance) + '米' : (route.distance / 1000).toFixed(1) + '公里';
  var durText = route.duration < 3600 ? Math.round(route.duration / 60) + '分钟' : Math.floor(route.duration / 3600) + '小时' + Math.round((route.duration % 3600) / 60) + '分';
  document.getElementById('navStepsHeader').textContent = '共' + allSteps.length + '步 · ' + distText + ' · 约' + durText;
  document.getElementById('mapNavSteps').classList.add('active');
}

// 获取步骤图标（高德action中文描述）
function mapNavGetStepIcon(action) {
  if (!action) return '⬆️';
  if (action === '到达终点' || action === '到达途经点' || action === '到达目的地') return '🏁';
  if (action === '出发' || action === '起点') return '🚩';
  if (action === '左转') return '⬅️';
  if (action === '右转') return '➡️';
  if (action === '直行' || action === '保持直行') return '⬆️';
  if (action === '掉头' || action === '调头') return '↩️';
  if (action === '左前方行驶' || action === '向左前方') return '↖️';
  if (action === '右前方行驶' || action === '向右前方') return '↗️';
  if (action === '左后方行驶' || action === '向左后方') return '↙️';
  if (action === '右后方行驶' || action === '向右后方') return '↘️';
  if (action === '进入环岛' || action === '环岛') return '🔄';
  if (action === '离开环岛') return '🔄';
  if (action === '进入道路' || action === '并入主路') return '🔀';
  if (action === '上匝道' || action === '进入高速') return '↗️';
  if (action === '下匝道' || action === '离开高速') return '↘️';
  if (action === '到达交叉路口') return '🛑';
  return '⬆️';
}

// 获取步骤文字描述（高德已提供instruction，此函数作为备用）
function mapNavGetStepText(step) {
  if (step.instruction) return step.instruction;
  var action = step.action || '';
  var road = step.road || '';
  if (action === '到达终点' || action === '到达目的地') return '到达终点';
  if (action === '出发') return '出发' + (road ? '，沿' + road + '行驶' : '');
  if (action === '左转') return '左转' + (road ? '，进入' + road : '');
  if (action === '右转') return '右转' + (road ? '，进入' + road : '');
  if (action === '直行') return '继续直行' + (road ? '，沿' + road : '');
  if (action === '掉头') return '掉头' + (road ? '，进入' + road : '');
  return action + (road ? '，' + road : '') || '继续前进';
}

// 停止导航
function mapStopNavigation() {
  navState.isNavigating = false;
  navState.routeData = null;
  if (mapRouteLayer) { mapInstance.removeLayer(mapRouteLayer); mapRouteLayer = null; }
  if (navState.startMarker) { mapInstance.removeLayer(navState.startMarker); navState.startMarker = null; }
  if (navState.endMarker) { mapInstance.removeLayer(navState.endMarker); navState.endMarker = null; }
  document.getElementById('mapNavStatus').classList.remove('active');
  document.getElementById('mapNavSteps').classList.remove('active');
  showToast('已结束导航');
}

// 点击导航步骤跳转到该位置
function mapNavStepClick(idx) {
  var route = navState.routeData;
  if (!route || !route.steps) return;
  var step = route.steps[idx];
  if (!step) return;
  if (step.startLocation && step.startLocation[0] !== 0) {
    mapInstance.setView([step.startLocation[0], step.startLocation[1]], 17);
    document.querySelectorAll('.map-nav-step').forEach(function(el, i) {
      el.classList.toggle('current', i === idx);
    });
  }
}

// 微信位置分享：在聊天中发送位置卡片
function mapShareLocationToChat(lat, lng, name) {
  if (typeof config === 'undefined') return;
  var idx = currentCharIdx || 0;
  var char = (config.characters || [])[idx];
  if (!char) { showToast('请先打开一个聊天'); return; }
  if (!char.chatHistory) char.chatHistory = [];
  var locData = { lat: lat, lng: lng, name: name };
  char.chatHistory.push({
    role: 'user',
    content: '[location]' + JSON.stringify(locData),
    time: Date.now(),
    type: 'location'
  });
  // 同步config.chatHistory以确保界面一致
  if (currentChatMode === 'online' && !isNpcChatMode && !isGroupChatMode &&
      config.characters && config.characters[currentCharIdx] === char) {
    config.chatHistory = char.chatHistory;
  }
  Store.set('config', config);

  // 清除分享模式提示
  var hint = document.getElementById('mapShareHint');
  if (hint) hint.remove();

  goHome();
  setTimeout(function() {
    openChat(idx);
    // 延迟触发AI回复（等聊天界面渲染完成）
    setTimeout(function() {
      mapEnrichLocationAndReply(idx, locData);
    }, 500);
  }, 100);
  showToast('已发送位置');
}

// ===== 地图分享模式 & MCP集成 =====
var mapShareMode = false; // 是否处于"选择位置分享"模式

// 从聊天界面点击"位置"按钮 → 打开地图选择位置
function shareLocationFromChat() {
  if (config.settings && config.settings.realMapEnabled === false) {
    showToast('真实地图功能已关闭，可在设置中开启');
    return;
  }
  // 关闭加号面板
  var panel = document.getElementById('chatPlusPanel');
  if (panel) panel.classList.remove('show');
  var plusBtn = document.getElementById('plusBtn');
  if (plusBtn) plusBtn.classList.remove('hide');

  mapShareMode = true;
  openMapApp();

  // 在地图顶部显示提示
  setTimeout(function() {
    var existing = document.getElementById('mapShareHint');
    if (!existing) {
      var hint = document.createElement('div');
      hint.id = 'mapShareHint';
      hint.style.cssText = 'position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:1002;background:rgba(10,132,255,0.95);color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,0.3)';
      hint.innerHTML = '📍 选择一个位置发送给对方 <span style="margin-left:8px;cursor:pointer;text-decoration:underline" onclick="cancelMapShare()">取消</span>';
      document.getElementById('mapContainer').appendChild(hint);
    }
  }, 300);
}

function cancelMapShare() {
  mapShareMode = false;
  var hint = document.getElementById('mapShareHint');
  if (hint) hint.remove();
  goHome();
}

// 从聊天中点击位置卡片 → 打开地图查看该位置
function openMapAtLocation(lat, lng, name) {
  mapShareMode = false;
  openMapApp();
  setTimeout(function() {
    if (mapInstance) {
      mapInstance.setView([lat, lng], 16);
      mapClearMarkers();
      var marker = L.marker([lat, lng]).addTo(mapInstance);
      marker.bindPopup(
        '<div class="map-popup-title">' + mapEscapeHtml(name || '位置') + '</div>' +
        '<div class="map-popup-addr">坐标: ' + lat.toFixed(6) + ', ' + lng.toFixed(6) + '</div>' +
        '<button class="map-popup-btn" onclick="mapSaveLocation(' + lat + ',' + lng + ',\'' + mapEscapeHtml(name || '位置').replace(/'/g, "\\'") + '\')">收藏地点</button>' +
        (mapCurrentLocation ? '<button class="map-popup-btn" style="margin-left:4px;background:#34C759" onclick="mapShowRoute(' + mapCurrentLocation.lat + ',' + mapCurrentLocation.lng + ',' + lat + ',' + lng + ',\'' + mapEscapeHtml(name || '位置').replace(/'/g, "\\'") + '\')">导航到这里</button>' : '')
      ).openPopup();
      mapMarkers.push(marker);
    }
  }, 300);
}

// 发送选中的位置到聊天（带分享模式判断）
function mapSendLocation(lat, lng, name) {
  if (mapShareMode) {
    mapShareMode = false;
    var hint = document.getElementById('mapShareHint');
    if (hint) hint.remove();
    mapShareLocationToChat(lat, lng, name);
  } else {
    // 非分享模式：直接发送
    mapShareLocationToChat(lat, lng, name);
  }
}

// ===== MCP工具：实时地理信息查询 =====
// 使用高德逆地理编码
function mapReverseGeocode(lat, lng, callback) {
  var key = getAmapKey();
  if (!key) {
    callback(null, {
      name: '未知位置', fullName: '', address: {},
      structured: '', lat: lat, lng: lng
    });
    return;
  }
  var url = 'https://restapi.amap.com/v3/geocode/regeo?location=' + lng + ',' + lat + '&key=' + key + '&extensions=all';
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 5000);
  fetch(url, { signal: controller.signal })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      if (data && data.status === '1' && data.regeocode) {
        var rg = data.regeocode;
        var ac = rg.addressComponent || {};
        var info = {
          name: rg.formatted_address ? rg.formatted_address.substring(0, 30) : '未知位置',
          fullName: rg.formatted_address || '',
          address: ac,
          lat: lat,
          lng: lng
        };
        info.structured = [
          ac.province, ac.city, ac.district, ac.township, ac.street
        ].filter(function(v) { return v && typeof v === 'string'; }).join('');
        callback(null, info);
      } else {
        callback(null, {
          name: '未知位置', fullName: '', address: {},
          structured: '', lat: lat, lng: lng
        });
      }
    })
    .catch(function(err) {
      clearTimeout(timeoutId);
      callback(null, {
        name: '未知位置', fullName: '', address: {},
        structured: '', lat: lat, lng: lng
      });
    });
}

// 搜索附近兴趣点（高德place/around API）
function mapSearchNearby(lat, lng, keyword, callback) {
  var key = getAmapKey();
  if (!key) { callback(new Error('未设置API Key'), null); return; }
  var url = 'https://restapi.amap.com/v3/place/around?location=' + lng + ',' + lat +
    '&keywords=' + encodeURIComponent(keyword) + '&radius=1000&key=' + key + '&offset=5&output=JSON';
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, 8000);
  fetch(url, { signal: controller.signal })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      clearTimeout(timeoutId);
      if (data && data.status === '1' && data.pois) {
        var results = data.pois.slice(0, 5).map(function(poi) {
          var loc = poi.location ? poi.location.split(',') : [lng, lat];
          return {
            name: poi.name || '未命名地点',
            type: poi.type || '地点',
            lat: parseFloat(loc[1]),
            lng: parseFloat(loc[0]),
            distance: poi.distance ? poi.distance + '米' : ''
          };
        });
        callback(null, results);
      } else {
        callback(null, []);
      }
    })
    .catch(function(err) { clearTimeout(timeoutId); callback(err, null); });
}

// 构建位置信息文本（用于AI上下文）
function mapBuildLocationContext(locData) {
  var text = '用户分享了一个位置：' + (locData.name || '未知位置') + '\n';
  text += '坐标：' + locData.lat.toFixed(6) + ', ' + locData.lng.toFixed(6) + '\n';
  return text;
}

// 异步获取真实位置详情并触发AI回复（MCP工具调用）
function mapEnrichLocationAndReply(chatIdx, locData) {
  var char = (config.characters || [])[chatIdx];
  if (!char) return;

  var api = config.api;
  if (!api.baseUrl || !api.apiKey || !api.model) {
    // 无API配置时给一个默认回复
    setTimeout(function() {
      config.chatHistory.push({
        role: 'assistant',
        content: '我收到了你分享的位置：' + (locData.name || '某个地方') + '。看起来是个不错的地方呢！',
        time: Date.now()
      });
      syncCharHistory();
      Store.set('config', config);
      renderMessages();
      scrollChatToBottom();
    }, 1000);
    return;
  }

  // 异步查询真实地址信息（逆地理编码 - MCP工具）
  mapReverseGeocode(locData.lat, locData.lng, function(err, info) {
    var locContext = '';
    if (!err && info) {
      // 更新位置消息中的真实地址信息
      var lastMsg = config.chatHistory[config.chatHistory.length - 1];
      if (lastMsg && lastMsg.type === 'location') {
        try {
          var ld = JSON.parse(lastMsg.content.replace('[location]', ''));
          ld.realAddress = info.structured || info.fullName || '';
          ld.city = (info.address && (info.address.city || info.address.district)) || '';
          ld.country = (info.address && info.address.province) || '';
          lastMsg.content = '[location]' + JSON.stringify(ld);
        } catch(e) {}
      }

      locContext = '用户通过地图APP分享了一个真实位置：\n';
      locContext += '地点名称：' + (locData.name || info.name) + '\n';
      locContext += '坐标：' + locData.lat.toFixed(6) + ', ' + locData.lng.toFixed(6) + '\n';
      if (info.structured) locContext += '详细地址：' + info.structured + '\n';
      if (info.address) {
        if (info.address.province) locContext += '省份：' + info.address.province + '\n';
        if (info.address.city || info.address.district) locContext += '城市：' + (info.address.city || info.address.district) + '\n';
      }
      locContext += '（以上是用户通过地图APP分享的真实位置信息，来自高德地图真实地理数据。你可以对这个地点发表看法、评论周边环境、或讨论相关话题）';
    } else {
      locContext = '用户通过地图APP分享了一个真实位置：' + (locData.name || '未知位置') + '\n坐标：' + locData.lat.toFixed(6) + ', ' + locData.lng.toFixed(6) + '\n（你可以对这个地点发表看法或讨论相关话题）';
    }

    syncCharHistory();
    Store.set('config', config);

    // 构建AI请求 - 使用现有的buildMessages并注入位置上下文
    showTypingIndicator();
    var messages = buildMessages();
    // 在消息末尾（聊天历史之前）注入位置上下文系统消息
    messages.splice(messages.length - 1, 0, { role: 'system', content: '=== 地图位置分享（MCP实时地理数据） ===\n' + locContext });

    callApi(messages).then(function(reply) {
      hideTypingIndicator();
      config.chatHistory.push({ role: 'assistant', content: reply, time: Date.now() });
      syncCharHistory();
      Store.set('config', config);
      renderMessages();
      scrollChatToBottom();
    }).catch(function(err) {
      hideTypingIndicator();
      config.chatHistory.push({
        role: 'assistant',
        content: '我收到了你分享的位置：' + (locData.name || '某个地方') + '。不过我暂时无法详细回复，稍后再聊吧。',
        time: Date.now()
      });
      syncCharHistory();
      Store.set('config', config);
      renderMessages();
      scrollChatToBottom();
    });
  });
}

// 暴露给全局
window.openMapApp = openMapApp;
window.initMap = initMap;
window.mapSearch = mapSearch;
window.mapSelectResult = mapSelectResult;
window.mapLocateMe = mapLocateMe;
window.mapShowAddMarkerPrompt = mapShowAddMarkerPrompt;
window.mapSaveLocation = mapSaveLocation;
window.mapLoadSavedLocations = mapLoadSavedLocations;
window.mapShowRoute = mapShowRoute;
window.mapCloseRoute = mapCloseRoute;
window.mapClearMarkers = mapClearMarkers;
window.mapShareLocationToChat = mapShareLocationToChat;
window.mapEscapeHtml = mapEscapeHtml;
window.shareLocationFromChat = shareLocationFromChat;
window.cancelMapShare = cancelMapShare;
window.openMapAtLocation = openMapAtLocation;
window.mapSendLocation = mapSendLocation;
window.mapReverseGeocode = mapReverseGeocode;
window.mapSearchNearby = mapSearchNearby;
window.mapEnrichLocationAndReply = mapEnrichLocationAndReply;
window.mapIPLocate = mapIPLocate;
window.mapOpenNavPanel = mapOpenNavPanel;
window.mapCloseNavPanel = mapCloseNavPanel;
window.mapNavSetMode = mapNavSetMode;
window.mapNavSearchStart = mapNavSearchStart;
window.mapNavSearchEnd = mapNavSearchEnd;
window.mapNavSelectPlace = mapNavSelectPlace;
window.mapStartNavigation = mapStartNavigation;
window.mapStopNavigation = mapStopNavigation;
window.mapNavStepClick = mapNavStepClick;
window.mapSetMyLocation = mapSetMyLocation;
window.mapShowKeyDialog = mapShowKeyDialog;
window.mapCloseKeyDialog = mapCloseKeyDialog;
window.mapSaveAmapKey = mapSaveAmapKey;
window.getAmapKey = getAmapKey;
window.wgs84ToGcj02 = wgs84ToGcj02;
window.openCityPicker = openCityPicker;
window.closeCityPicker = closeCityPicker;
window.confirmCityPicker = confirmCityPicker;
window.updateCityPickerCities = updateCityPickerCities;
window.getUserLocationStr = getUserLocationStr;
window.getCharLocationStr = getCharLocationStr;
window.openCharLocationPicker = openCharLocationPicker;
window.confirmCharLocation = confirmCharLocation;
window.clearCharLocation = clearCharLocation;
window.openEditCharPersona = openEditCharPersona;
window.dissolveGroupChat = dissolveGroupChat;
window._doDissolveGroup = _doDissolveGroup;
// 以下论坛私信函数封装在 app-02 的 IIFE 内（局部作用域，外部不可见）；
// 用 typeof 守卫安全导出：可见则挂 window，不可见也不会抛 ReferenceError 而中断本文件尾部的事件注册
if (typeof openForumDMWithCharacter !== 'undefined') window.openForumDMWithCharacter = openForumDMWithCharacter;
if (typeof sfShowDMActionMenu !== 'undefined') window.sfShowDMActionMenu = sfShowDMActionMenu;
if (typeof sfHideDMActionMenu !== 'undefined') window.sfHideDMActionMenu = sfHideDMActionMenu;
if (typeof sfDMDeleteMessage !== 'undefined') window.sfDMDeleteMessage = sfDMDeleteMessage;
if (typeof sfDMQuoteMessage !== 'undefined') window.sfDMQuoteMessage = sfDMQuoteMessage;
if (typeof sfDMEditMessage !== 'undefined') window.sfDMEditMessage = sfDMEditMessage;
if (typeof sfCancelDMQuote !== 'undefined') window.sfCancelDMQuote = sfCancelDMQuote;

// 点击空白处关闭论坛私信操作菜单
document.addEventListener('click', function(e) {
  var dmMenu = document.getElementById('sfDMActionMenu');
  if (dmMenu && dmMenu.classList.contains('show')) {
    if (!e.target.closest('#sfDMActionMenu') && !e.target.closest('.sf-dm-bubble')) {
      if (typeof sfHideDMActionMenu === 'function') sfHideDMActionMenu();
    }
  }
});

// 导航步骤点击事件委托
document.addEventListener('click', function(e) {
  var stepEl = e.target.closest('.map-nav-step[data-step-idx]');
  if (stepEl) {
    var idx = parseInt(stepEl.dataset.stepIdx, 10);
    if (!isNaN(idx) && typeof mapNavStepClick === 'function') mapNavStepClick(idx);
  }
});

// ===== 覆盖层收进手机框 =====
// .phone-screen 带 transform，position:fixed 的后代会以它为包含块定位，并被圆角 overflow 裁剪；
// 这里把 body 下所有 fixed 顶层元素（论坛/查手机/世界/关系链/照片墙/商店/外卖等覆盖层）移入手机屏
(function() {
  var screen = document.getElementById('phoneScreen');
  if (!screen) return;
  Array.prototype.slice.call(document.body.children).forEach(function(el) {
    if (el.id === 'phoneFrame') return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
    var pos = '';
    try { pos = window.getComputedStyle(el).position; } catch (e) {}
    if (pos === 'fixed') screen.appendChild(el);
  });
})();