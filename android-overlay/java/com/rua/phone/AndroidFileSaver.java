package com.rua.phone;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

/**
 * 网页 → 原生 的文件保存接口。注册名固定为 window.AndroidFileSaver（见 MainActivity）。
 *
 * 可用方法：
 *   window.AndroidFileSaver.saveTextFile(name, text, mime)     保存纯文本（json / txt / js / css）
 *   window.AndroidFileSaver.saveBase64File(name, base64, mime) 保存二进制（base64 或 dataURL）
 *
 * 保存位置：
 *   Android 10(Q, API 29) 及以上 —— 公共「下载」目录（MediaStore，无需任何存储权限）
 *   Android 9 及以下        —— 有权限时写公共「下载」目录，否则退回应用专属外部目录
 */
public class AndroidFileSaver {

    private static final Charset UTF8 = Charset.forName("UTF-8");

    private final Activity activity;

    public AndroidFileSaver(Activity activity) {
        this.activity = activity;
    }

    /** 保存文本文件，返回 "OK: ..." 或 "ERROR: ..."（网页端一般不使用返回值） */
    @JavascriptInterface
    public String saveTextFile(String filename, String content, String mimeType) {
        byte[] data = (content == null ? "" : content).getBytes(UTF8);
        return save(filename, mimeType, data);
    }

    /** 保存 base64 / dataURL 二进制，例如 "data:image/png;base64,xxxx" 或纯 base64 */
    @JavascriptInterface
    public String saveBase64File(String filename, String base64, String mimeType) {
        try {
            String raw = (base64 == null ? "" : base64);
            int comma = raw.indexOf(',');
            if (comma >= 0) {
                raw = raw.substring(comma + 1); // 去掉 data:xxx;base64, 前缀
            }
            return save(filename, mimeType, Base64.decode(raw, Base64.DEFAULT));
        } catch (Exception e) {
            return report("保存失败：" + e.getMessage(), false);
        }
    }

    private String save(String filename, String mimeType, byte[] data) {
        try {
            String name = safeName(filename);
            String mime = (mimeType == null || mimeType.trim().isEmpty())
                ? "application/octet-stream"
                : mimeType.trim();
            String where = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ? writeToMediaStoreDownloads(name, mime, data)
                : writeLegacy(name, data);
            return report("已保存到 " + where, true);
        } catch (Exception e) {
            return report("保存失败：" + e.getMessage(), false);
        }
    }

    /** Android 10+：写入公共「下载」目录，无需申请任何权限 */
    private String writeToMediaStoreDownloads(String name, String mime, byte[] data) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        ContentResolver resolver = activity.getContentResolver();
        Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) {
            throw new Exception("无法在下载目录创建文件");
        }

        OutputStream out = null;
        try {
            out = resolver.openOutputStream(item);
            if (out == null) {
                throw new Exception("无法写入文件");
            }
            out.write(data);
            out.flush();
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (Exception ignored) {
                }
            }
        }

        ContentValues done = new ContentValues();
        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(item, done, null, null);

        return "下载/" + name;
    }

    /** Android 9 及以下：优先公共下载目录（需 WRITE_EXTERNAL_STORAGE），否则用应用专属目录（无需权限） */
    private String writeLegacy(String name, byte[] data) throws Exception {
        File pub = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (pub != null && (pub.exists() || pub.mkdirs()) && pub.canWrite()) {
            writeFile(new File(pub, name), data);
            return "下载/" + name;
        }

        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = activity.getFilesDir();
        }
        if (dir != null && !dir.exists() && !dir.mkdirs()) {
            throw new Exception("无法创建保存目录");
        }
        File target = new File(dir, name);
        writeFile(target, data);
        return target.getAbsolutePath();
    }

    private void writeFile(File file, byte[] data) throws Exception {
        FileOutputStream os = new FileOutputStream(file, false);
        try {
            os.write(data);
            os.flush();
        } finally {
            try {
                os.close();
            } catch (Exception ignored) {
            }
        }
    }

    /** 去掉路径分隔符等文件名非法字符，空名给个默认名 */
    private String safeName(String filename) {
        String name = (filename == null || filename.trim().isEmpty())
            ? ("rua-export-" + System.currentTimeMillis() + ".txt")
            : filename.trim();
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    /** JS 接口运行在后台线程，Toast 必须切回主线程；返回值同时给网页用于提示 */
    private String report(final String message, final boolean ok) {
        if (activity != null) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
                    } catch (Exception ignored) {
                    }
                }
            });
        }
        return (ok ? "OK: " : "ERROR: ") + message;
    }
}
