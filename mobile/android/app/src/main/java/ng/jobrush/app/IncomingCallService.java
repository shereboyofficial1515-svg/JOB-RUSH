package ng.jobrush.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Owns the entire lifecycle of one incoming call notification: posts
 * the full-screen call notification, plays/loops the ringtone, and
 * stops both the instant the call is answered, rejected, or resolved
 * some other way (the caller cancels, or nobody answers in time).
 *
 * There is no server push for "the caller hung up before you
 * answered" — the web client (call-room.html's startRingback) doesn't
 * have one either, it polls. This does the same: GET
 * /messaging/calls/:id every 2.5s and stops ringing the moment the
 * call's status turns into anything terminal, exactly mirroring the
 * existing web behaviour instead of inventing a new push-based signal
 * the backend doesn't have.
 */
public class IncomingCallService extends Service {

    static final String ACTION_INCOMING = "ng.jobrush.app.action.INCOMING_CALL";
    static final String ACTION_ANSWER = "ng.jobrush.app.action.ANSWER_CALL";
    static final String ACTION_REJECT = "ng.jobrush.app.action.REJECT_CALL";

    static final String EXTRA_CALL_ID = "callId";
    static final String EXTRA_CALL_TYPE = "callType";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";

    private static final int NOTIFICATION_ID = 7301;
    private static final long POLL_INTERVAL_SECONDS = 3; // matches incomingCallWatcher.js's own 3s poll
    private static final long RING_TIMEOUT_SECONDS = 45; // matches call-room.html's RINGBACK_TIMEOUT_MS

    private MediaPlayer ringtonePlayer;
    private Vibrator vibrator;
    private ScheduledExecutorService scheduler;
    private String currentCallId;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_NOT_STICKY;

        switch (intent.getAction()) {
            case ACTION_INCOMING:
                startIncoming(intent);
                break;
            case ACTION_ANSWER:
                answer();
                break;
            case ACTION_REJECT:
                reject();
                break;
        }
        return START_NOT_STICKY;
    }

    private void startIncoming(Intent intent) {
        currentCallId = intent.getStringExtra(EXTRA_CALL_ID);
        String callType = intent.getStringExtra(EXTRA_CALL_TYPE);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        if (currentCallId == null) {
            stopSelf();
            return;
        }

        startForeground(NOTIFICATION_ID, buildNotification(title, body, callType));
        startRingtoneAndVibration();
        startPolling();
    }

    private Notification buildNotification(String title, String body, String callType) {
        Intent fullScreenIntent = new Intent(this, IncomingCallActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        fullScreenIntent.putExtra(EXTRA_CALL_ID, currentCallId);
        fullScreenIntent.putExtra(EXTRA_CALL_TYPE, callType);
        fullScreenIntent.putExtra(EXTRA_TITLE, title);
        fullScreenIntent.putExtra(EXTRA_BODY, body);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                this, 0, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent answerIntent = actionPendingIntent(ACTION_ANSWER, 1);
        PendingIntent rejectIntent = actionPendingIntent(ACTION_REJECT, 2);

        return new NotificationCompat.Builder(this, JobRushFirebaseMessagingService.CHANNEL_CALLS)
                .setSmallIcon(android.R.drawable.sym_call_incoming) // replace with a branded call icon — see ANDROID.md
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .addAction(0, "Decline", rejectIntent)
                .addAction(0, "Answer", answerIntent)
                .setContentIntent(fullScreenPendingIntent)
                .build();
    }

    private PendingIntent actionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, IncomingCallService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void startRingtoneAndVibration() {
        try {
            Uri ringtoneUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            ringtonePlayer = new MediaPlayer();
            ringtonePlayer.setDataSource(this, ringtoneUri);
            ringtonePlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            ringtonePlayer.setLooping(true);
            ringtonePlayer.prepare();
            ringtonePlayer.start();
        } catch (Exception ignored) {
            // No default ringtone available (rare, e.g. silent devices/emulators) —
            // the notification + vibration + full-screen UI still make the call known.
        }

        vibrator = getSystemService(Vibrator.class);
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = {0, 1000, 1000};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }
    }

    private void stopRingtoneAndVibration() {
        if (ringtonePlayer != null) {
            try { ringtonePlayer.stop(); } catch (IllegalStateException ignored) {}
            ringtonePlayer.release();
            ringtonePlayer = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
    }

    private void startPolling() {
        scheduler = Executors.newSingleThreadScheduledExecutor();
        long startTime = System.currentTimeMillis();

        scheduler.scheduleWithFixedDelay(() -> {
            if (System.currentTimeMillis() - startTime >= RING_TIMEOUT_SECONDS * 1000) {
                resolveAsMissed();
                return;
            }
            try {
                String body = ApiClient.get("/api/messaging/calls/" + currentCallId);
                String status = new JSONObject(body).getJSONObject("call").getString("status");
                if (isTerminal(status)) {
                    stopForSelf();
                }
            } catch (Exception ignored) {
                // A single failed poll just tries again next tick — never
                // tear down an otherwise-live incoming call over one
                // network hiccup.
            }
        }, POLL_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS, TimeUnit.SECONDS);
    }

    private boolean isTerminal(String status) {
        return "declined".equals(status) || "missed".equals(status) || "cancelled".equals(status)
                || "ended".equals(status) || "failed".equals(status) || "busy".equals(status);
    }

    private void resolveAsMissed() {
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                ApiClient.post("/api/messaging/calls/" + currentCallId + "/status", "{\"status\":\"missed\"}");
            } catch (Exception ignored) {}
        });
        stopForSelf();
    }

    private void answer() {
        if (scheduler != null) scheduler.shutdownNow();
        stopRingtoneAndVibration();

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openApp.setData(Uri.parse(BuildConfig.PRODUCTION_URL + "/pages/call-room.html?type=call&id=" + currentCallId));
        startActivity(openApp);

        stopForeground(true);
        stopSelf();
    }

    private void reject() {
        if (scheduler != null) scheduler.shutdownNow();
        stopRingtoneAndVibration();
        String callId = currentCallId;
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                ApiClient.post("/api/messaging/calls/" + callId + "/status", "{\"status\":\"declined\"}");
            } catch (Exception ignored) {}
        });
        stopForSelf();
    }

    private void stopForSelf() {
        if (scheduler != null) scheduler.shutdownNow();
        stopRingtoneAndVibration();
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (scheduler != null) scheduler.shutdownNow();
        stopRingtoneAndVibration();
    }
}
