import { useEffect } from "react";
import { initFirebasePerformance } from "@/lib/firebasePerformance";

/** Bootstraps Firebase Performance Monitoring on Android. */
export function useFirebasePerformance() {
  useEffect(() => {
    void initFirebasePerformance();
  }, []);
}
