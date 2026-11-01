package app.telitol;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    public static final String LIVE_URL = "https://telitol-67uk.vercel.app/";
    private static final java.util.Set<String> IN_APP_HOSTS = new java.util.HashSet<>(java.util.Arrays.asList(
            "telitol-67uk.vercel.app",
            "telitol.vercel.app",
            "accounts.google.com",
            "x.com",
            "api.x.com",
            "twitter.com",
            "api.twitter.com"));
    private WebView web;
    private boolean isError = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(0xFFFFFFFF);
        window.setNavigationBarColor(0xFFFFFFFF);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        setContentView(web);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(web, true);
        }

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUserAgentString(settings.getUserAgentString() + " TeliTolApp/1.1");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            private boolean handleUrl(Uri uri) {
                if (uri == null) return false;
                String scheme = uri.getScheme();
                if ("tel".equalsIgnoreCase(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_DIAL, uri);
                    startActivity(intent);
                    return true;
                }
                if ("mailto".equalsIgnoreCase(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
                    startActivity(intent);
                    return true;
                }
                // Only TeliTol itself and its sign-in providers stay inside the
                // app; every other site opens in the browser. Exact hosts, so
                // look-alikes (other *.vercel.app apps, "dropbox.com") don't.
                String host = uri.getHost();
                if (host != null && IN_APP_HOSTS.contains(host.toLowerCase())) {
                    return false;
                }
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                isError = false;
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    isError = true;
                    showOfflinePage();
                }
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                isError = true;
                showOfflinePage();
            }
        });

        web.loadUrl(LIVE_URL);
    }

    private void showOfflinePage() {
        String offlineHtml = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                + "<style>body{font-family:sans-serif;text-align:center;padding:3rem 1.5rem;background:#f4f7f5;color:#0b2340;}"
                + "h2{font-size:1.5rem;margin-bottom:0.5rem;}p{color:#5c6d7e;margin-bottom:1.5rem;}"
                + "button{background:#0e9f6e;color:#fff;border:none;border-radius:999px;padding:0.75rem 2rem;font-size:1rem;font-weight:600;cursor:pointer;}"
                + "</style></head><body>"
                + "<h2>You're offline</h2>"
                + "<p>TeliTol couldn't connect to the live community. Check your internet connection and try again.</p>"
                + "<button onclick='location.href=\"" + LIVE_URL + "\"'>Retry</button>"
                + "</body></html>";
        web.loadDataWithBaseURL(LIVE_URL, offlineHtml, "text/html", "UTF-8", null);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
