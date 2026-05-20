/**
 * Global snackbar/toast context: show success, error, warning, or info messages.
 */
import React, { createContext, useContext, useState } from "react";
import { Snackbar, Portal } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SnackbarState {
  visible: boolean;
  message: any;
  type: "success" | "error" | "warning" | "info";
  duration?: number;
}

interface SnackbarConfig {
  message: any;
  type?: "success" | "error" | "warning" | "info";
  duration?: number;
}

interface SnackbarContextType {
  showSnackbar: (
    message: any,
    type?: "success" | "error" | "warning" | "info",
    duration?: number,
  ) => void;
  showSnackbarWithConfig: (config: SnackbarConfig) => void;
  hideSnackbar: () => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(
  undefined,
);

/** Provider that renders a themed snackbar and exposes show/hide helpers. */
export const SnackbarProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const insets = useSafeAreaInsets();

  const [snackbarState, setSnackbarState] = useState<SnackbarState>({
    visible: false,
    message: "",
    type: "info",
    duration: 3000,
  });

  /** Show a snackbar with message, type, and optional duration. */
  const showSnackbar = (
    message: any,
    type: "success" | "error" | "warning" | "info" = "info",
    duration: number = 3000,
  ) => {
    setSnackbarState({
      visible: true,
      message,
      type,
      duration,
    });
  };

  /** Show a snackbar from a config object. */
  const showSnackbarWithConfig = (config: SnackbarConfig) => {
    setSnackbarState({
      visible: true,
      message: config.message,
      type: config.type || "info",
      duration: config.duration || 3000,
    });
  };

  /** Dismiss the current snackbar. */
  const hideSnackbar = () => {
    setSnackbarState((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  const value: SnackbarContextType = {
    showSnackbar,
    showSnackbarWithConfig,
    hideSnackbar,
  };

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        visible={snackbarState.visible}
        onDismiss={hideSnackbar}
        duration={snackbarState.duration}
        style={{
          backgroundColor:
            snackbarState.type === "success"
              ? "#4CAF50"
              : snackbarState.type === "error"
                ? "#F44336"
                : snackbarState.type === "warning"
                  ? "#FF9800"
                  : "#F44336",
        }}
      >
        {snackbarState.message}
      </Snackbar>
    </SnackbarContext.Provider>
  );
};

/** Access snackbar show/hide methods; must be used within SnackbarProvider. */
export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
};

export default SnackbarContext;
