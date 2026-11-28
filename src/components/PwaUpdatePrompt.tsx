import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

type DeferredPwaInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const UPDATE_ACTIVATION_TIMEOUT_MS = 15_000;
const UPDATE_FAILURE_MESSAGE = "تعذر تفعيل التحديث. بقي التطبيق الحالي كما هو؛ يمكنك إعادة المحاولة.";

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [available, setAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activationError, setActivationError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<DeferredPwaInstallPrompt | null>(null);
  const reloadAfterControllerChange = useRef(false);
  const updateTimeout = useRef<number | null>(null);

  const clearUpdateTimeout = useCallback(() => {
    if (updateTimeout.current === null) return;
    window.clearTimeout(updateTimeout.current);
    updateTimeout.current = null;
  }, []);

  const resetUpdateAttempt = useCallback((message: string) => {
    reloadAfterControllerChange.current = false;
    clearUpdateTimeout();
    setApplying(false);
    setActivationError(message);
  }, [clearUpdateTimeout]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredPwaInstallPrompt);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let mounted = true;
    let activeRegistration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;
    let onInstallingStateChange: (() => void) | null = null;

    const announceWaitingWorker = () => {
      if (!mounted || !activeRegistration?.waiting || !navigator.serviceWorker.controller) return;
      setRegistration(activeRegistration);
      setAvailable(true);
    };

    const onUpdateFound = () => {
      const installing = activeRegistration?.installing;
      if (!installing) return;
      if (installingWorker && onInstallingStateChange) {
        installingWorker.removeEventListener("statechange", onInstallingStateChange);
      }
      installingWorker = installing;
      onInstallingStateChange = () => {
        if (installing.state === "installed") announceWaitingWorker();
      };
      installing.addEventListener("statechange", onInstallingStateChange);
    };

    const onControllerChange = () => {
      if (!reloadAfterControllerChange.current || typeof window === "undefined") return;
      reloadAfterControllerChange.current = false;
      clearUpdateTimeout();
      window.location.reload();
    };

    const onServiceWorkerMessage = (event: MessageEvent<unknown>) => {
      if (!reloadAfterControllerChange.current || typeof event.data !== "object" || event.data === null) return;
      const message = event.data as { type?: unknown; code?: unknown };
      if (
        message.type === "aghbari:service-worker-diagnostic" &&
        message.code === "service-worker-skip-waiting-failed"
      ) {
        resetUpdateAttempt(UPDATE_FAILURE_MESSAGE);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeRegistration) {
        void activeRegistration.update().catch(() => undefined);
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void navigator.serviceWorker.register("/sw.js")
      .then((nextRegistration) => {
        if (!mounted) return;
        activeRegistration = nextRegistration;
        setRegistration(nextRegistration);
        nextRegistration.addEventListener("updatefound", onUpdateFound);
        announceWaitingWorker();
        if (document.visibilityState === "visible") {
          void nextRegistration.update().catch(() => undefined);
        }
      })
      .catch(() => {
        // PWA registration failure must not block the storefront.
      });

    return () => {
      mounted = false;
      clearUpdateTimeout();
      if (installingWorker && onInstallingStateChange) {
        installingWorker.removeEventListener("statechange", onInstallingStateChange);
      }
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      activeRegistration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, [clearUpdateTimeout, resetUpdateAttempt]);

  function applyUpdate() {
    if (!registration?.waiting || applying) return;
    setActivationError("");
    setApplying(true);
    reloadAfterControllerChange.current = true;
    updateTimeout.current = window.setTimeout(() => {
      if (!reloadAfterControllerChange.current) return;
      resetUpdateAttempt(UPDATE_FAILURE_MESSAGE);
    }, UPDATE_ACTIVATION_TIMEOUT_MS);

    try {
      registration.waiting.postMessage({ type: "AGHBARI_ACTIVATE_UPDATE" });
    } catch {
      resetUpdateAttempt(UPDATE_FAILURE_MESSAGE);
    }
  }

  async function installApp() {
    const deferred = installPrompt;
    if (!deferred) return;
    setInstallPrompt(null);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // The browser may dismiss or reject its native installation prompt.
    }
  }

  const hasWaitingUpdate = available && Boolean(registration?.waiting);
  if (!hasWaitingUpdate && !installPrompt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="no-print"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "#e8f3ed",
        color: "#164734",
        borderBottom: "1px solid #b8d6c6",
        fontFamily: "Cairo, system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {installPrompt ? (
        <>
          <span>ثبّت متجر الأغبري على جهازك للوصول إليه كتطبيق.</span>
          <button
            type="button"
            onClick={() => void installApp()}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-800 px-3 py-2 font-semibold text-white"
          >
            تثبيت التطبيق
          </button>
        </>
      ) : null}
      {hasWaitingUpdate ? (
        <>
          <span>تحديث جديد لمتجر الأغبري جاهز. احفظ العمل الجاري قبل التحديث؛ سيُعاد تحميل الصفحة بعد تفعيل النسخة الجديدة.</span>
          {activationError ? <p role="alert" style={{ flexBasis: "100%", margin: 0 }}>{activationError}</p> : null}
          <button
            type="button"
            onClick={applyUpdate}
            disabled={applying}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-800 px-3 py-2 font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw size={15}/>
            {applying ? "جارٍ تطبيق التحديث..." : "تحديث التطبيق"}
          </button>
          <button
            type="button"
            onClick={() => setAvailable(false)}
            disabled={applying}
            aria-label="تأجيل تحديث التطبيق"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-800/30 px-2 py-2 disabled:opacity-60"
          >
            <X size={14}/>
            لاحقاً
          </button>
        </>
      ) : null}
    </div>
  );
}
