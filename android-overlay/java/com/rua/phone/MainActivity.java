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
 * 承担两件事：
 *  1) 沉浸式全屏：隐藏状态栏（顶部灰色条）与导航栏，手势划出时半透明临时显示并自动再隐藏；
 *     刘海屏铺满；窗口底色由 res/values/styles.xml 的 ruaWindowBackground 指定。
 *     注意：故意不调用 setDecorFitsSystemWindows(false)，Capacitor 6 不做 insets 处理，
 *     关掉它会导致软键盘不再顶起输入框（聊天输入框会被键盘遮住）。
 *  2) 注册 window.AndroidFileSaver，让网页能把文件保存到手机「下载」目录。
 */
public class MainActivity extends BridgeActivity {

    private boolean fileSaverReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState); // 必须最先调用，之后 bridge / WebView 才存在

        installFileSaver();

        // 刘海屏 / 挖孔屏：允许内容铺满全屏
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

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

    @Override
    public void onStart() {
        super.onStart();
        installFileSaver(); // 兜底再说一次，确保接口一定在
        hideSystemUI();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI(); // 用户划出系统栏后，焦点回来时再次隐藏，形成沉浸式粘性效果
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
