package ng.jobrush.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Native (non-WebView) incoming-call screen. Deliberately minimal —
 * its only job is Answer/Reject; the actual call UI (mute, camera
 * toggle, speaker, end call) is call-room.html, reused unchanged the
 * moment Answer is tapped. Shown via a full-screen notification intent
 * from IncomingCallService, so it can appear over the lock screen the
 * way a real incoming call does.
 */
public class IncomingCallActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (keyguardManager != null) keyguardManager.requestDismissKeyguard(this, null);
        }

        setContentView(R.layout.activity_incoming_call);

        String callId = getIntent().getStringExtra(IncomingCallService.EXTRA_CALL_ID);
        String callType = getIntent().getStringExtra(IncomingCallService.EXTRA_CALL_TYPE);
        String title = getIntent().getStringExtra(IncomingCallService.EXTRA_TITLE);
        String body = getIntent().getStringExtra(IncomingCallService.EXTRA_BODY);

        ((TextView) findViewById(R.id.incoming_call_title)).setText(title != null ? title : "Incoming call");
        ((TextView) findViewById(R.id.incoming_call_body)).setText(body != null ? body : "");
        ((TextView) findViewById(R.id.incoming_call_type)).setText(
                "video".equals(callType) ? "Video call" : "Audio call");

        findViewById(R.id.btn_answer).setOnClickListener(v -> {
            sendServiceAction(IncomingCallService.ACTION_ANSWER, callId);
            finish();
        });
        findViewById(R.id.btn_reject).setOnClickListener(v -> {
            sendServiceAction(IncomingCallService.ACTION_REJECT, callId);
            finish();
        });
    }

    private void sendServiceAction(String action, String callId) {
        Intent intent = new Intent(this, IncomingCallService.class);
        intent.setAction(action);
        intent.putExtra(IncomingCallService.EXTRA_CALL_ID, callId);
        startService(intent);
    }
}
