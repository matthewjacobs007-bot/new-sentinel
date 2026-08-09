// lib/alerts.js — outbound drift alerting.
// When a scan shows new regressions since the previous scan, optionally POST a
// summary to a webhook (Slack/Teams/Discord-compatible `{text}` shape, which
// most generic webhook receivers also accept as JSON). Fully optional: if
// ALERT_WEBHOOK_URL isn't set, this is a no-op. Never throws — a failed alert
// must never break the scan/dashboard flow that triggered it.

export async function notifyDrift(webhookUrl, tenant, drift, score) {
  if (!webhookUrl || !drift || !drift.regressions?.length) return;
  const lines = drift.regressions.map((r) => `• *${r.title}* (${r.severity}) — ${r.from} → ${r.to}`);
  const text = `⚠️ *Sentinel: posture regression on ${tenant}*\n` +
    `Compliance score: ${score}%${drift.scoreDelta != null ? ` (${drift.scoreDelta >= 0 ? '+' : ''}${drift.scoreDelta}%)` : ''}\n` +
    lines.join('\n');
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Best-effort only — a broken webhook shouldn't fail the scan.
  }
}

// A tenant is "stale" once its last scan is older than the given threshold.
// Used to surface a re-scan reminder in the UI (MSP org view + tenant sidebar).
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 864e5);
}
export function isStale(dateStr, thresholdDays = 30) {
  const d = daysSince(dateStr);
  return d != null && d > thresholdDays;
}
