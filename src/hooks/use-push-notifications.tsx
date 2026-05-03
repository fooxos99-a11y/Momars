import { useEffect, useState } from "react";
import { deletePushSubscription, savePushSubscription } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const getPushAskedKey = (loginCode: string) => `mmars_push_asked_${loginCode}`;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const isIosDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

const isStandalonePwa = () => {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
};

const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
};

export const subscribeAndSave = async (loginCode: string): Promise<boolean> => {
  if (!VAPID_PUBLIC_KEY) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    // Refresh stale subscriptions proactively. iOS/Android endpoints can become invalid
    // after reinstalling the PWA or restoring device backups.
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Continue and try to create a fresh subscription below.
      }
      subscription = null;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await savePushSubscription(loginCode, subscription.toJSON());
    return true;
  } catch {
    return false;
  }
};

export const activatePushFromUserGesture = async (
  loginCode: string,
): Promise<{ ok: boolean; note?: string }> => {
  if (!isPushSupported()) {
    return { ok: false, note: "المتصفح لا يدعم إشعارات Push على هذا الجهاز." };
  }

  if (isIosDevice() && !isStandalonePwa()) {
    return {
      ok: false,
      note: "في iPhone يجب فتح المنصة كتطبيق من الشاشة الرئيسية (Add to Home Screen) لتعمل إشعارات الخلفية.",
    };
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (permission !== "granted") {
    return { ok: false, note: "لم يتم منح إذن الإشعارات من النظام." };
  }

  const ok = await subscribeAndSave(loginCode);
  return ok
    ? { ok: true }
    : { ok: false, note: "تم منح الإذن لكن فشل تسجيل اشتراك الإشعارات." };
};

export const unsubscribeAndRemovePushForLogin = async (loginCode: string): Promise<void> => {
  if (!loginCode || !isPushSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return;
    }

    const endpoint = subscription.endpoint ?? "";
    if (endpoint) {
      await deletePushSubscription(loginCode, endpoint);
    }

    await subscription.unsubscribe();
  } catch {
    // Best-effort cleanup on logout.
  }
};

export const usePushNotifications = (loginCode: string | null) => {
  const [showPrompt, setShowPrompt] = useState(false);
  // "granted" | "denied" | "default" | "unsupported"
  const [pushPermission, setPushPermission] = useState<string>(() => {
    if (!isPushSupported()) return "unsupported";
    return Notification.permission;
  });
  const [isPushRegistered, setIsPushRegistered] = useState(false);
  const [pushStatusNote, setPushStatusNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported() || !loginCode) return;

    // Do not auto-prompt on desktop browsers.
    if (!isMobileDevice()) {
      setShowPrompt(false);
      return;
    }

    if (isIosDevice() && !isStandalonePwa()) {
      setPushStatusNote("في iPhone يجب فتح المنصة كتطبيق من الشاشة الرئيسية (Add to Home Screen) لتعمل إشعارات الخلفية.");
      setIsPushRegistered(false);
      return;
    }

    setPushStatusNote(null);

    const pushAskedKey = getPushAskedKey(loginCode);
    const permission = Notification.permission;
    setPushPermission(permission);

    if (permission === "granted") {
      void subscribeAndSave(loginCode).then((ok) => setIsPushRegistered(ok));
      return;
    }

    if (permission === "denied") return;

    // "default" → show our custom prompt once per session
    if (!sessionStorage.getItem(pushAskedKey)) {
      setShowPrompt(true);
    }
  }, [loginCode]);

  const handleAllow = async () => {
    if (!loginCode) return;

    if (isIosDevice() && !isStandalonePwa()) {
      setPushStatusNote("في iPhone يجب فتح المنصة كتطبيق من الشاشة الرئيسية (Add to Home Screen) لتعمل إشعارات الخلفية.");
      setIsPushRegistered(false);
      return;
    }

    const pushAskedKey = getPushAskedKey(loginCode);
    sessionStorage.setItem(pushAskedKey, "1");
    setShowPrompt(false);

    const result = await activatePushFromUserGesture(loginCode);
    setPushPermission(Notification.permission);
    setIsPushRegistered(result.ok);
    if (!result.ok && result.note) {
      setPushStatusNote(result.note);
    }
  };

  const handleDismiss = () => {
    if (!loginCode) {
      setShowPrompt(false);
      return;
    }

    const pushAskedKey = getPushAskedKey(loginCode);
    sessionStorage.setItem(pushAskedKey, "1");
    setShowPrompt(false);
  };

  // Allow re-triggering the permission request (e.g. from a settings button)
  const requestPushPermission = async () => {
    if (!loginCode || !isPushSupported()) return;

    if (isIosDevice() && !isStandalonePwa()) {
      setPushStatusNote("في iPhone يجب فتح المنصة كتطبيق من الشاشة الرئيسية (Add to Home Screen) لتعمل إشعارات الخلفية.");
      setIsPushRegistered(false);
      return false;
    }

    setPushStatusNote(null);
    setShowPrompt(false);

    const result = await activatePushFromUserGesture(loginCode);
    setPushPermission(Notification.permission);
    setIsPushRegistered(result.ok);
    if (!result.ok && result.note) {
      setPushStatusNote(result.note);
    }
    return result.ok;
  };

  return {
    showPrompt,
    handleAllow,
    handleDismiss,
    pushPermission,
    requestPushPermission,
    isPushRegistered,
    pushStatusNote,
  };
};
