import { Platform } from "react-native";
import perf, { type FirebasePerformanceTypes } from "@react-native-firebase/perf";

let initialized = false;

/**
 * Enable Firebase Performance Monitoring on Android (dev and release).
 */
export async function initFirebasePerformance(): Promise<void> {
  if (Platform.OS !== "android" || initialized) return;

  initialized = true;
  try {
    perf().dataCollectionEnabled = true;
  } catch (error) {
    initialized = false;
    if (__DEV__) {
      console.warn("[Firebase Performance] init failed:", error);
    }
  }
}

/** Start a custom performance trace (Android only). */
export async function startPerfTrace(
  name: string,
): Promise<FirebasePerformanceTypes.Trace | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await perf().startTrace(name);
  } catch {
    return null;
  }
}
