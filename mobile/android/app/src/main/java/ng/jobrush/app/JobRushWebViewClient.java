package ng.jobrush.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Extends Capacitor's default WebViewClient with exactly one change:
 * the three OAuth "start" URLs (the ones the Sign in with Google/
 * Facebook/Apple buttons on login.html navigate to) open in a Chrome
 * Custom Tab instead of this WebView.
 *
 * Why: Google explicitly detects and blocks its own OAuth consent
 * screen from completing inside an embedded WebView's user-agent (a
 * documented anti-phishing policy, not a bug) — signing in would just
 * fail with "This browser or app may not be secure." Facebook and
 * Apple aren't as strict today, but routing all three the same way
 * keeps the logic uniform and correct if that ever changes. A Custom
 * Tab is a real, separate Chrome instance the provider can't
 * distinguish from the user's normal browser.
 *
 * The `client=android` query param tells the backend (see
 * googleRedirect/facebookRedirect/appleRedirect in authController.js)
 * to sign that fact into the OAuth `state`, so the callback knows to
 * hand back a one-time code via the jobrush://oauth-complete deep link
 * (caught in MainActivity) instead of a cookie the Custom Tab's own
 * cookie jar would swallow uselessly.
 *
 * Every other URL — including genuinely external links (portfolio
 * sites, social profiles, external documents) — falls through to
 * super.shouldOverrideUrlLoading(), which is Capacitor's own default:
 * same-origin navigation stays in this WebView, anything else already
 * opens via a system ACTION_VIEW intent (the user's default browser or
 * app for that link) rather than getting trapped here.
 */
public class JobRushWebViewClient extends BridgeWebViewClient {

    public JobRushWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();

        if (path != null && path.startsWith("/api/auth/") && !path.contains("/callback") && isOAuthStartPath(path)) {
            Uri androidUrl = url.buildUpon().appendQueryParameter("client", "android").build();
            new CustomTabsIntent.Builder().build().launchUrl(view.getContext(), androidUrl);
            return true;
        }

        return super.shouldOverrideUrlLoading(view, request);
    }

    private boolean isOAuthStartPath(String path) {
        return path.equals("/api/auth/google") || path.equals("/api/auth/facebook") || path.equals("/api/auth/apple");
    }
}
