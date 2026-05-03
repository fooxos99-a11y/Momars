import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@mmars.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
);

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "VAPID keys not configured." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase credentials are not configured." });
  }

  const { title, message, loginCodes, url } = req.body as {
    title: string;
    message: string;
    loginCodes?: string[];
    url?: string | null;
  };

  if (!title || !message) {
    return res.status(400).json({ error: "title and message are required." });
  }

  if (!Array.isArray(loginCodes)) {
    return res.status(400).json({ error: "loginCodes array is required." });
  }

  const targetLoginCodes = [...new Set(loginCodes.map((code) => String(code ?? "").trim()).filter(Boolean))];

  if (targetLoginCodes.length === 0) {
    return res.status(200).json({ sent: 0, failed: 0, gone: 0, reason: "no-target-login-codes" });
  }

  const query = supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("login_code", targetLoginCodes);

  const { data: subscriptions, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const payload = JSON.stringify({ title, message, url: url || "/" });

  const staleEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;
  let gone = 0;

  const failedReasons: string[] = [];

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          TTL: 60 * 60,
          urgency: "high",
          topic: "mmars-notification",
        },
      );
      sent += 1;
    } catch (pushError: unknown) {
      failed += 1;

      const statusCode = typeof pushError === "object" && pushError !== null && "statusCode" in pushError
        ? Number((pushError as { statusCode?: number }).statusCode)
        : undefined;

      const body = typeof pushError === "object" && pushError !== null && "body" in pushError
        ? String((pushError as { body?: unknown }).body ?? "")
        : "";

      failedReasons.push(`${statusCode ?? "unknown"}${body ? `:${body.slice(0, 160)}` : ""}`);

      // 404/410 means subscription no longer valid on provider side.
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);

    if (!deleteError) {
      gone = staleEndpoints.length;
    }
  }

  return res.status(200).json({
    sent,
    failed,
    gone,
    reason: failedReasons[0] ?? null,
  });
}
