package ng.jobrush.app;

import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Minimal cookie-authenticated HTTP client for the small amount of API
 * calling native code needs to do OUTSIDE the WebView (registering an
 * FCM token, polling/answering/declining a call from
 * IncomingCallService). Deliberately not a new dependency (OkHttp,
 * Retrofit, ...) — this is a handful of infrequent, small requests,
 * and android.webkit.CookieManager already shares the exact same
 * cookie jar the WebView itself uses, so a session established by
 * logging in through the app is picked up here automatically with no
 * separate auth step.
 */
final class ApiClient {

    private ApiClient() {}

    static String get(String path) throws IOException {
        HttpURLConnection conn = open(path, "GET");
        try {
            return readBody(conn);
        } finally {
            conn.disconnect();
        }
    }

    static String post(String path, String jsonBody) throws IOException {
        HttpURLConnection conn = open(path, "POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }
        try {
            return readBody(conn);
        } finally {
            conn.disconnect();
        }
    }

    private static HttpURLConnection open(String path, String method) throws IOException {
        URL url = new URL(BuildConfig.PRODUCTION_URL + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(10_000);

        String cookie = CookieManager.getInstance().getCookie(BuildConfig.PRODUCTION_URL);
        if (cookie != null) {
            conn.setRequestProperty("Cookie", cookie);
        }
        return conn;
    }

    private static String readBody(HttpURLConnection conn) throws IOException {
        int code = conn.getResponseCode();
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(code >= 400 ? conn.getErrorStream() : conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
        }
        if (code >= 400) {
            throw new IOException("HTTP " + code + ": " + sb);
        }
        return sb.toString();
    }
}
