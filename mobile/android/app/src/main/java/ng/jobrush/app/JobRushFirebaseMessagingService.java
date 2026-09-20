package ng.jobrush.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Receives every Job Rush push while the app is backgrounded or fully
 * killed. Every message the backend sends here is DATA-ONLY (see
 * pushService.js/fcmService.js) rather than a `notification` payload —
 * that's what makes onMessageReceived() run at all in those states,
 * and it's what lets an incoming call get its own full-screen UI +
 * ringtone instead of a plain OS notification.
 */
public class JobRushFirebaseMessagingService extends FirebaseMessagingService {

    static final String CHANNEL_GENERAL = "jobrush_general";
    static final String CHANNEL_CALLS = "jobrush_calls";

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);

        NotificationChannel general = new NotificationChannel(
                CHANNEL_GENERAL, "Messages & activity", NotificationManager.IMPORTANCE_DEFAULT);
        general.setDescription("New messages, application updates, payments, and verification status.");
        manager.createNotificationChannel(general);

        // IMPORTANCE_HIGH + no sound of its own (the ringtone is played
        // explicitly by IncomingCallService instead, so it can be looped
        // and stopped precisely on answer/reject/timeout — a channel
        // sound would play once and can't be controlled that way).
        NotificationChannel calls = new NotificationChannel(
                CHANNEL_CALLS, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("Incoming audio and video calls.");
        calls.setSound(null, null);
        manager.createNotificationChannel(calls);
    }

    /** New/rotated token — tell the backend so it can actually reach this device. Fire-and-forget, off the main thread. */
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                ApiClient.post("/api/notifications/push/fcm-token", "{\"token\":\"" + token + "\"}");
            } catch (Exception ignored) {
                // Best-effort, same as the web-push subscribe call this mirrors —
                // the app still works without it, just without background push
                // until the next successful registration attempt.
            }
        });
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.getOrDefault("type", "");

        if ("incoming_call".equals(type)) {
            Intent serviceIntent = new Intent(this, IncomingCallService.class);
            serviceIntent.setAction(IncomingCallService.ACTION_INCOMING);
            serviceIntent.putExtra(IncomingCallService.EXTRA_CALL_ID, data.get("callId"));
            serviceIntent.putExtra(IncomingCallService.EXTRA_CALL_TYPE, data.getOrDefault("callType", "video"));
            serviceIntent.putExtra(IncomingCallService.EXTRA_TITLE, data.getOrDefault("title", "Incoming call"));
            serviceIntent.putExtra(IncomingCallService.EXTRA_BODY, data.getOrDefault("body", "Someone is calling you"));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            return;
        }

        showGeneralNotification(data);
    }

    /**
     * Every non-call notification (new message, application status,
     * payment, verification, ...) — a normal heads-up notification whose
     * tap target is computed the same way the existing service worker's
     * notificationclick handler already does (see service-worker.js),
     * just re-implemented natively since a Web Push service worker does
     * not run inside this WebView.
     */
    private void showGeneralNotification(Map<String, String> data) {
        String title = data.getOrDefault("title", "JOB RUSH");
        String body = data.getOrDefault("body", "");
        String conversationId = data.get("conversationId");

        String targetPath = conversationId != null
                ? "/pages/messages.html?conversation=" + conversationId
                : "/pages/dashboard.html";

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.setData(android.net.Uri.parse(BuildConfig.PRODUCTION_URL + targetPath));

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, targetPath.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_GENERAL)
                .setSmallIcon(android.R.drawable.ic_dialog_info) // replaced by the real notification icon in res/drawable — see ANDROID.md
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(targetPath.hashCode(), builder.build());
    }
}
