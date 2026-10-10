package com.rua.phone;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * rua小手机 主 Activity。
 *
 * 承担三件事：
 *  1) 沉浸式全屏（真·铺满）：隐藏状态栏/导航栏，网页内容从屏幕最顶端 (0,0) 开始绘制，刘海/挖孔也铺满；
 *     手势划出系统栏后，焦点回来会自动再隐藏（粘性沉浸式）。
 *  2) 注册 window.AndroidFileSaver，让网页能把文件保存到手机「下载」目录。
 *  3) 注册 window.AndroidNetease，让网易云 App 能绕过 WebView 的 CORS 直连官方 API
 *     （官方接口实测返回 200 但不发 Access-Control-Allow-Origin，纯网页侧无解）。
 *
 * ★「顶部一条状态栏高度的纯色带子」的根因（AOSP com.android.internal.policy.PhoneWindow）：
 *
 *      private static final OnContentApplyWindowInsetsListener sDefaultContentInsetsApplier =
 *              (view, insets) -> {
 *                  if ((view.getWindowSystemUiVisibility() & SYSTEM_UI_LAYOUT_FLAGS) != 0) {
 *                      return new Pair&lt;&gt;(Insets.NONE, insets);   // 有 layout flag → 内容区不动
 *                  }
 *                  Insets insetsToApply = insets.getSystemWindowInsets(); // 否则把状态栏高度加到内容区
 *                  return new Pair&lt;&gt;(insetsToApply, insets.inset(insetsToApply).consumeSystemWindowInsets());
 *              };
 *
 *      private void applyDecorFitsSystemWindows() {
 *          ViewRootImpl impl = getViewRootImplOrNull();
 *          if (impl != null) {
 *              impl.setOnContentApplyWindowInsetsListener(
 *                      mDecorFitsSystemWindows ? sDefaultContentInsetsApplier : null);
 *          }
 *      }
 *
 *   而 ViewRootImpl.setOnContentApplyWindowInsetsListener() 自带注释：
 *      // System windows will be fitted on first traversal ...
 *      if (!mFirst) { requestFitSystemWindows(); }
 *   ——「首次遍历」之前把它设成 null 会被直接采纳，之后设置还会自动补一次 inset 分发。
 *
 *   结论：Android 11(API 30) 及以上，只要没调用 setDecorFitsSystemWindows(false)，
 *   内容区就会被加上「状态栏高度」的 inset —— 那条带子其实是窗口底色
 *   (res/values/styles.xml 的 ruaWindowBackground) 从内容区上方露出来，既不是真状态栏，也不是真全屏
 *   （android:windowFullscreen 在 API 30+ 已被系统忽略，只有旧系统才认）。
 *   所以下面显式关掉 decorFitsSystemWindows，并额外补上 layout flag 做双保险。
 *
 * ★ 软键盘：关掉 decorFitsSystemWindows 后系统不再替我们把内容顶起来，
 *   因此自己监听 IME inset，把键盘高度作为内容区底部内边距；
 *   若窗口本身已被系统 resize（adjustResize 生效），ime inset 会自然为 0，不会重复上移。
 */
public class MainActivity extends BridgeActivity {

    /** 让内容铺满系统栏区域的 layout flag：API 30 以下是旧沉浸式方案的前提，API 30+ 用来短路上面的默认 applier */
    private static final int EDGE_TO_EDGE_FLAGS =
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;

    private boolean fileSaverReady = false;
    private boolean neteaseProxyReady = false;
    private boolean cutoutApplied = false;
    private boolean imeInsetsHooked = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState); // 必须最先调用，之后 bridge / WebView 才存在

        installFileSaver();
        installNeteaseProxy(); // 网易云直连接口（失败会自动降级到镜像源，不影响其它功能）
        applyEdgeToEdge(); // ★ 真全屏的关键：decorFits=false + 刘海铺满 + layout flag 双保险
        hideSystemUI();
    }

    /** 注册网页调用接口；重复调用无害（addJavascriptInterface 同名会覆盖）。 */
    private void installFileSaver() {
        if (fileSaverReady) {
            return;
        }
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.addJavascriptInterface(new AndroidFileSaver(this), "AndroidFileSaver");
                fileSaverReady = true;
            }
        } catch (Throwable ignored) {
            // 极端情况下（布局异常）注册失败也不应让 App 崩溃，网页端会自动走 Blob 兜底
        }
    }

    /**
     * 注册 window.AndroidNetease，让网页能绕过 WebView 的 CORS 限制直连网易云官方 API。
     *
     * 与 installFileSaver 同理：重复调用无害，任何异常都不让 App 崩溃 ——
     * 注册失败时网页端 window.AndroidNetease 是 undefined，会自动降级到第三方镜像源，
     * 只是数据来源不同，不会白屏、也不会影响其它功能。
     */
    private void installNeteaseProxy() {
        if (neteaseProxyReady) {
            return;
        }
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.addJavascriptInterface(new AndroidNeteaseProxy(webView), "AndroidNetease");
                neteaseProxyReady = true;
            }
        } catch (Throwable ignored) {
            // 注册失败不致命：网页端会自动降级到镜像源（见 js/app-06.js 的 neFetch）
        }
    }

    /**
     * 真·铺满全屏：★ 关闭 decorFitsSystemWindows（根因修复）+ 刘海/挖孔铺满 + layout flag 双保险。
     * 可重复调用：ViewRootImpl 只在「非首次遍历」时才会补一次 inset 分发，开销可忽略。
     */
    private void applyEdgeToEdge() {
        // 1) 刘海屏 / 挖孔屏：允许内容铺到挖孔区域（只设一次，避免反复触发布局）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !cutoutApplied) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            if (lp.layoutInDisplayCutoutMode
                    != WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES) {
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(lp);
            }
            cutoutApplied = true;
        }

        // 2) ★ 根因修复：decorFits=false → PhoneWindow 不再把「状态栏高度」加到内容区上
        //    （等价于 androidx 的 enableEdgeToEdge() 在 API 30+ 做的事）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }

        // 3) 双保险：layout flag 会让 PhoneWindow 的 sDefaultContentInsetsApplier 直接返回 Insets.NONE
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(decor.getSystemUiVisibility() | EDGE_TO_EDGE_FLAGS);

        // 4) 自己接管软键盘顶起（API 30 以下由 adjustResize 缩放窗口，无需干预）
        installImeInsets();
    }

    /**
     * 把软键盘高度作为内容区（android.R.id.content）的底部内边距，保证聊天输入框不被键盘遮住。
     * 不消费 inset，WebView / 页面仍能拿到完整 WindowInsets；窗口若已被系统 resize，
     * ime().bottom 会自然为 0，不会重复上移。
     */
    private void installImeInsets() {
        if (imeInsetsHooked || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        View content = findViewById(android.R.id.content);
        if (content == null) {
            return; // 布局尚未就绪：onStart / onWindowFocusChanged 里会再试
        }
        content.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int imeBottom = insets.getInsets(WindowInsets.Type.ime()).bottom;
                if (v.getPaddingBottom() != imeBottom) {
                    v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), imeBottom);
                }
                return insets;
            }
        });
        imeInsetsHooked = true;
        content.requestApplyInsets(); // 按当前 inset 立即布局一次
    }

    @Override
    public void onStart() {
        super.onStart();
        installFileSaver(); // 兜底再说一次，确保接口一定在
        installNeteaseProxy(); // 同理再确认一次，避免 WebView 重建后接口丢失
        applyEdgeToEdge();  // 内容区已就绪，再确认一次全屏设置（含软键盘监听）
        hideSystemUI();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyEdgeToEdge();
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyEdgeToEdge(); // 此时 view root 必然存在，确保 decorFits=false 被真正采纳
            hideSystemUI();    // 用户划出系统栏后，焦点回来时再次隐藏，形成沉浸式粘性效果
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }
}
