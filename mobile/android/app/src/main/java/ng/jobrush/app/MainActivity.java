package ng.jobrush.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * Job Rush's only Activity that hosts the real web application (the
 * rest — IncomingCallActivity — is native UI, never a WebView). Three
 * responsibilities beyond Capacitor's defaults, none of which touch
 * the frontend codebase at all:
 *
 *  1. A custom WebViewClient (JobRushWebViewClient) that routes the
 *     Google/Facebook/Apple sign-in buttons to a Custom Tab instead of
 *     loading them in this WebView — see that class for why.
 *  2. Deep link handling (jobrush://oauth-complete and the production
 *     HTTPS App Link) by loading the right URL directly into the
 *     WebView — no JS bridge required, since a plain page load is all
 *     either case needs.
 *  3. Back-button behaviour matching Android convention: step back
 *     through the WebView's own history first, and only minimize (not
 *     kill) the app once there's nothing left to go back to.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().setWebViewClient(new JobRushWebViewClient(getBridge()));
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    /**
     * Both deep link shapes just resolve to "load this URL in the
     * WebView" — the mobile-handoff endpoint and any production page a
     * notification/App Link points at are both ordinary same-origin
     * pages once loaded, so there's nothing native-side left to do
     * after this.
     */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;

        WebView webView = getBridge().getWebView();

        if ("jobrush".equals(data.getScheme()) && "oauth-complete".equals(data.getHost())) {
            String code = data.getQueryParameter("code");
            if (code != null && !code.isEmpty()) {
                String handoffUrl = BuildConfig.PRODUCTION_URL + "/api/auth/mobile-handoff?code=" + Uri.encode(code);
                webView.loadUrl(handoffUrl);
            }
        } else if ("https".equals(data.getScheme())) {
            webView.loadUrl(data.toString());
        }
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            // Android convention for a launcher app's root screen: send it
            // to the background, don't kill the process — matches what
            // happens when the user presses Home, and keeps the WebView's
            // JS state (unsent draft, open modal, in-progress upload) alive
            // if they come straight back.
            moveTaskToBack(true);
        }
    }
}
