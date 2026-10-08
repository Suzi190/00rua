# 签名密钥说明（rua-release.jks）

## 这个文件是什么
`rua-release.jks` 是 rua小手机 的**正式（release）签名密钥**。CI 打包时会把它复制到
`android/app/rua-release.jks`，再由 `android-overlay/gradle/rua-signing.gradle` 引用。

生成方式（JDK 17 自带 keytool，本机用的是 Android Studio 的 JBR）：

```shell
keytool -genkeypair -v \
  -keystore rua-release.jks -storetype PKCS12 \
  -alias rua -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=rua, OU=rua, O=rua, L=Beijing, ST=Beijing, C=CN" \
  -storepass rua2026apk -keypass rua2026apk
```

| 项目 | 值 |
| --- | --- |
| 密钥库类型 | PKCS12 |
| 别名 | `rua` |
| 口令（store 与 key 相同） | `rua2026apk` |
| 签名算法 | SHA384withRSA（2048 位 RSA） |
| 有效期 | 2026-10-08 ~ 2054-02-23 |
| 证书 SHA-256 指纹 | `F3:4E:79:FF:6B:03:2B:A6:70:4F:1D:B5:D1:7F:89:04:66:16:0F:22:77:2E:65:55:C8:2A:14:79:DE:86:17:D9` |

CI 日志里 `apksigner verify --print-certs` 打印的 `Signer #1 certificate SHA-256 digest`
应当与上面的指纹一致，可以据此确认装到手机上的是「自己构建的包」。

## 版本号从哪来
`package.json` 的 `version` 是**唯一来源**：CI 打包时会把它写进 APK 的 `versionName`，并换算成
`versionCode = major*10000 + minor*100 + patch`（1.0.1 → 10001），产物文件名也是
`rua-xiaoshouji-<version>-release.apk`。所以以后升级版本**只改 `package.json` 一处**。

`android-overlay/gradle/rua-signing.gradle` 里的 `versionName` / `versionCode` 只是「本地不走 CI
构建」时的默认值，CI 会覆盖它（Capacitor 模板自带的 `versionName "1.0"` / `versionCode 1` 也会一起覆盖）。

## CI 里做了哪几步（`.github/workflows/build-apk.yml`）
1. `npx cap add android` 生成 Android 工程；
2. **注入正式签名配置**：复制 `rua-release.jks` 到 `android/app/`，把本目录的
   `gradle/rua-signing.gradle` 追加到 `android/app/build.gradle`，并写死版本号；
3. `./gradlew assembleRelease` 出包（不再用 `assembleDebug`）；
4. **校验签名**：用 `apksigner verify --verbose --print-certs` 断言
   `Verified using v1/v2/v3 ...: true`，缺 v1 或 v2 直接让 CI 失败（就是这两个导致 vivo 拒装）；
5. 上传 artifact，并把 APK 挂到固定 tag 的 Release：`rua-latest`。

## 为什么必须换掉调试签名
以前 CI 跑的是 `./gradlew assembleDebug`，用的是 Android 自动生成的**调试密钥**
（CN=Android Debug）。vivo / OPPO 等国产 ROM 的安装器会把调试签名判成「没有开发者证书」，
安装时提示：

```
应用未安装：软件包似乎无效。
安装包缺乏开发者证书，建议联系安装包的开发者。
```

改成正式密钥签名 + 同时开启 v1(JAR) / v2 / v3 签名方案 + `debuggable=false` 后即可正常安装。

## ⚠️ 安全提示（重要）
本仓库是**公开仓库**，这个密钥文件连同口令任何人都能看到。所以它只适合「个人侧载的小应用」：

- 别人可以拿它签发一个同包名的 APK 来覆盖安装（前提是能装进你手机）；
- **不要**用它上架应用商店，也不要复用到其它项目。

想更安全就把密钥挪到 GitHub Secrets（`RUA_KEYSTORE_BASE64` / `RUA_STORE_PASS` / `RUA_KEY_ALIAS` /
`RUA_KEY_PASS`），CI 里用 `base64 -d` 还原后再签名，本文件即可从仓库删除。

## 轮换密钥要注意
Android 只允许「同一包名 + 同一签名」覆盖安装。换密钥后必须先**卸载旧版本**才能装新包。
