/**
 * Expo OTA update monitor.
 *
 * - Reactively tracks update state via `Updates.useUpdates()`.
 * - Checks on mount and whenever the app returns to the foreground
 *   (throttled to avoid hammering the EAS Update server).
 * - Auto-downloads any available update in the background so the user-facing
 *   reload prompt is instantaneous.
 * - Handles rollback-to-embedded directives.
 * - No-ops in development, in Expo Go, or when `expo-updates` is disabled.
 */
import { useCallback, useEffect, useRef } from "react";
import * as Updates from "expo-updates";
import { AppState, type AppStateStatus } from "react-native";
import { useAlertContext, type AlertState } from "@/app/contexts/AlertContext";

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const hiddenAlert = (): AlertState => ({
  isVisible: false,
  title: "",
  message: "",
  type: "error",
});

/** Monitor, download, and prompt reload for Expo OTA updates. */
export const useUpdateMonitor = () => {
  const { setAlertConfig } = useAlertContext();
  const {
    currentlyRunning,
    availableUpdate,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
    checkError,
    downloadError,
  } = Updates.useUpdates();

  const lastCheckRef = useRef(0);
  const fetchedForRef = useRef<string | null>(null);
  const promptedForRef = useRef<string | null>(null);

  /** Check EAS for OTA updates (throttled unless force). */
  const checkForUpdates = useCallback(async (force = false) => {
    if (__DEV__ || !Updates.isEnabled) return;
    const now = Date.now();
    if (!force && now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;
    try {
      await Updates.checkForUpdateAsync();
    } catch {
      // `checkError` from useUpdates() captures the failure reactively;
      // swallow here to avoid an unhandled rejection in production.
    }
  }, []);

  useEffect(() => {
    void checkForUpdates(true);
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void checkForUpdates();
    });
    return () => sub.remove();
  }, [checkForUpdates]);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    if (!isUpdateAvailable || isDownloading || isUpdatePending) return;

    const id = availableUpdate?.updateId ?? "rollback-to-embedded";
    if (fetchedForRef.current === id) return;
    fetchedForRef.current = id;

    Updates.fetchUpdateAsync().catch(() => {
      fetchedForRef.current = null;
    });
  }, [isUpdateAvailable, isDownloading, isUpdatePending, availableUpdate]);

  useEffect(() => {
    if (!isUpdatePending) return;

    const id = availableUpdate?.updateId ?? "rollback-to-embedded";
    if (promptedForRef.current === id) return;
    promptedForRef.current = id;

    setAlertConfig({
      isVisible: true,
      title: "Update Ready",
      message:
        "A new version of the app has been downloaded. Reload now to apply it?",
      type: "success",
      confirmLabel: "Reload",
      cancelLabel: "Later",
      onClose: () => setAlertConfig(hiddenAlert()),
      onConfirm: () => {
        Updates.reloadAsync().catch((err: unknown) => {
          setAlertConfig({
            isVisible: true,
            title: "Reload Failed",
            message:
              err instanceof Error
                ? err.message
                : "Please close and reopen the app to apply the update.",
            type: "error",
            confirmLabel: "OK",
            onConfirm: () => setAlertConfig(hiddenAlert()),
          });
        });
      },
    });
  }, [isUpdatePending, availableUpdate, setAlertConfig]);

  useEffect(() => {
    if (!__DEV__) return;
    if (checkError) {
      setAlertConfig({
        isVisible: true,
        title: "Update Check Failed",
        message: checkError.message,
        type: "error",
        confirmLabel: "OK",
        onConfirm: () => setAlertConfig(hiddenAlert()),
      });
    }
    if (downloadError) {
      setAlertConfig({
        isVisible: true,
        title: "Update Download Failed",
        message: downloadError.message,
        type: "error",
        confirmLabel: "OK",
        onConfirm: () => setAlertConfig(hiddenAlert()),
      });
    }
  }, [checkError, downloadError, setAlertConfig]);

  return {
    currentlyRunning,
    isCheckingForUpdate: isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    checkError,
    downloadError,
    checkForUpdates,
  };
};
