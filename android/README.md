# 安卓 APK（WebView 壳）

给没有谷歌服务（GMS）的安卓手机用的安装包。壳只负责打开线上地址 `https://ctianzhuo2567-cloud.github.io/desaer-memory/`，界面、产品数据与学习进度都在网页侧，网页更新后 APK 无需重装。

- 最低系统：Android 10（API 29）。
- 需要联网才能使用；不支持离线。
- 学习进度保存在本机 WebView 中，覆盖安装新版不会丢失；卸载会清空，请先导出备份。
- 导出会把 JSON 存到手机的“下载”目录；导入通过系统文件选择器。

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File android\build.ps1
```

产物在 `android\dist\desaer-memory.apk`。签名密钥 `android\desaer-release.jks` 与口令 `android\keystore.pass` 未纳入版本库，换电脑或重装系统前请自行备份，否则以后无法生成同签名的更新包（覆盖安装会失败）。

## 发新版

壳本身很少需要更新。如果改了 `MainActivity.java`、清单或图标，把 `android:versionCode` 加 1 后重新构建，把新 APK 发给同事覆盖安装即可，进度不会丢。
