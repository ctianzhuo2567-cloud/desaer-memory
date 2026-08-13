package com.desaer.memory;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://ctianzhuo2567-cloud.github.io/desaer-memory/";
    private static final int REQ_IMPORT = 1001;
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                startActivityForResult(Intent.createChooser(intent, "选择进度文件"), REQ_IMPORT);
                return true;
            }
        });
        web.setDownloadListener(new android.webkit.DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                if (url != null && url.startsWith("blob:")) {
                    String script = "(function(){var x=new XMLHttpRequest();x.open('GET','" + url + "',true);"
                        + "x.responseType='blob';x.onload=function(){var r=new FileReader();"
                        + "r.onload=function(){AndroidBridge.saveBase64('desaer-progress.json',String(r.result).split(',')[1]);};"
                        + "r.readAsDataURL(x.response);};x.send();})()";
                    web.evaluateJavascript(script, null);
                }
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME_URL);
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void saveText(String filename, String text) {
            saveToDownloads(filename, text.getBytes(StandardCharsets.UTF_8));
            notifySaved();
        }

        @JavascriptInterface
        public void saveBase64(String filename, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                saveToDownloads(filename, data);
                notifySaved();
            } catch (Exception ignored) {
            }
        }
    }

    private void saveToDownloads(String filename, byte[] data) {
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri != null) {
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os != null) {
                    os.write(data);
                    os.close();
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void notifySaved() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.loadUrl("javascript:toast('已导出到手机的下载目录')");
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_IMPORT && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }
}
