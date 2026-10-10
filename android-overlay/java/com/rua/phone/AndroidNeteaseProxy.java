package com.rua.phone;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.GZIPInputStream;

/**
 * 网易云音乐「原生直连」代理：让网页能在 APK 里拿到官方 API 的数据。
 *
 * ★ 为什么必须要有它（根因）：
 *   WebView 里 fetch('https://music.163.com/api/...') 会被 CORS 拦掉。实测官方接口
 *   返回 HTTP 200、数据也完全正常，但响应头里就是没有 Access-Control-Allow-Origin，
 *   浏览器/WebView 一律拒绝把结果交给 JS。现象是「网易云 App 里推荐、排行榜、搜索、
 *   歌词全部空白」，控制台只有一条 CORS 报错，服务端一切正常。
 *   公共 CORS 代理实测已全部失效（cors.sh 连接被关闭、allorigins / codetabs 超时、
 *   cors.eu.org 429、corsproxy.io 403），所以这里直接绕开 WebView 的网络栈：
 *   用原生 HttpURLConnection 取回内容，再以字符串交回网页，问题从根上消失。
 *
 * ★ 为什么对外是「异步回调」而不是直接 return：
 *   @JavascriptInterface 方法运行在 WebView 的 JavaBridge 线程上，而网页端是同步等返回值的。
 *   一旦在这里阻塞做网络请求，网页的 JS 线程会整体停住 —— 一次慢请求就等于 App 假死
 *   （最坏 连接 + 读取 = 20 秒白屏）。所以只暴露 getAsync()：立刻返回，在后台线程取数据，
 *   完成后用 evaluateJavascript 把结果投回网页；万一回调没回来，网页侧 12 秒超时后会自动降级。
 *
 * ★ 与 AndroidFileSaver 完全同款模式（addJavascriptInterface）：
 *   不依赖 Capacitor 的 Plugin / registerPlugin，因此不需要改动 MainActivity 里
 *   「super.onCreate 必须最先调用」这条既有约束（那条是上一轮真机排查全屏问题的成果）。
 *
 * ★ 安全：网页里任何脚本都能调这个接口，不做限制等于给页面开了一个任意 HTTP 代理
 *   （第三方注入脚本可以拿它去打内网）。所以只放行网易云自己的域名、只允许 https，
 *   回调 token 也做了字符白名单 + JSON 转义，杜绝拼进 JS 时的注入。
 */
public class AndroidNeteaseProxy {

    /** 网页侧固定的回调入口（见 js/app-06.js 的 __ruaNeteaseCb） */
    private static final String CALLBACK_JS = "__ruaNeteaseCb";

    /** 允许直连的域名白名单（网易云音乐官方 API 域名） */
    private static final String[] ALLOWED_HOSTS = {
        "music.163.com",
        "interface.music.163.com",
        "interface3.music.163.com"
    };

    /** 官方接口对 UA / Referer 有校验，缺失时会返回网页而不是 JSON */
    private static final String UA =
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) "
            + "Chrome/120.0.0.0 Mobile Safari/537.36";

    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 12000;
    /** 单次响应体积上限，防止异常大包撑爆 JS 侧（热歌榜歌单实测约 600KB） */
    private static final int MAX_BODY_BYTES = 4 * 1024 * 1024;

    private final WebView webView;

    public AndroidNeteaseProxy(WebView webView) {
        this.webView = webView;
    }

    /**
     * 异步直连取回指定 URL 的内容；结果通过 window.__ruaNeteaseCb(token, payload) 回投。
     *
     * @param url   必须是白名单域名下的 https 地址
     * @param token 网页侧生成的请求标识，原样回传（只允许字母数字下划线）
     */
    @JavascriptInterface
    public void getAsync(final String url, final String token) {
        if (token == null || !token.matches("[A-Za-z0-9_]{1,64}")) {
            return; // 非法 token 直接丢弃，绝不把它拼进 JS
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String payload = get(url);
                if (webView == null) {
                    return;
                }
                final String script =
                    "window." + CALLBACK_JS + " && window." + CALLBACK_JS + "("
                        + JSONObject.quote(token) + "," + JSONObject.quote(payload) + ")";
                webView.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            webView.evaluateJavascript(script, null);
                        } catch (Throwable ignored) {
                            // 投递失败不致命：网页侧 12 秒超时后会降级到镜像源
                        }
                    }
                });
            }
        }, "rua-netease").start();
    }

    /**
     * 同步取回内容（getAsync 内部使用，也方便将来做一次性自检）。
     *
     * @return JSON 字符串：成功 {"ok":true,"status":200,"body":"<原始响应体>"}；
     *                     失败 {"ok":false,"error":"<原因>"}
     */
    public String get(String url) {
        try {
            return request(url).toString();
        } catch (Throwable t) {
            // 任何异常都必须转成结构化返回值：直接抛出去网页端只会拿到 undefined，无法判断原因
            try {
                return new JSONObject().put("ok", false).put("error", String.valueOf(t)).toString();
            } catch (Throwable ignored) {
                return "{\"ok\":false,\"error\":\"unknown\"}";
            }
        }
    }

    private JSONObject request(String url) throws Exception {
        if (url == null || url.length() == 0) {
            return new JSONObject().put("ok", false).put("error", "empty url");
        }
        URL target = new URL(url);
        String host = target.getHost();
        if (host == null || !isAllowed(host)) {
            return new JSONObject().put("ok", false).put("error", "host not allowed: " + host);
        }
        if (!"https".equalsIgnoreCase(target.getProtocol())) {
            return new JSONObject().put("ok", false).put("error", "only https is allowed");
        }

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) target.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", UA);
            conn.setRequestProperty("Referer", "https://music.163.com/");
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setRequestProperty("Accept-Encoding", "gzip");

            int status = conn.getResponseCode();
            InputStream raw =
                (status >= 200 && status < 300) ? conn.getInputStream() : conn.getErrorStream();
            String body = (raw == null) ? "" : readAll(raw, conn.getContentEncoding());
            return new JSONObject().put("ok", true).put("status", status).put("body", body);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static boolean isAllowed(String host) {
        String h = host.toLowerCase();
        for (String allowed : ALLOWED_HOSTS) {
            if (h.equals(allowed) || h.endsWith("." + allowed)) {
                return true;
            }
        }
        return false;
    }

    /** 读取响应体：支持 gzip，按 UTF-8 解码（网易云返回 UTF-8） */
    private static String readAll(InputStream in, String contentEncoding) throws Exception {
        InputStream stream = in;
        if (contentEncoding != null && contentEncoding.toLowerCase().contains("gzip")) {
            stream = new GZIPInputStream(in);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream(8192);
        byte[] buf = new byte[8192];
        int total = 0;
        int n;
        while ((n = stream.read(buf)) != -1) {
            total += n;
            if (total > MAX_BODY_BYTES) {
                break;
            }
            out.write(buf, 0, n);
        }
        stream.close();
        return out.toString("UTF-8");
    }
}
