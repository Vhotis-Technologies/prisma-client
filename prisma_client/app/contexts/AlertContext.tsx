/**
 * Global alert modal context: isVisible, title, message, type, onConfirm. Used for critical confirmations and errors.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import AlertModal from "../components/helpers/AlertModal";

interface AlertState {
  isVisible: boolean;
  title: string;
  message: string;
  type: "success" | "error" | "warning";
  onConfirm?: () => void;
  onClose?: () => void;
  confirmLabel?: string;
}

export type { AlertState };

interface AlertContextType {
  alertConfig: AlertState | undefined;
  setAlertConfig: (config: AlertState) => void;
  setIsVisible: (isVisible: boolean) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertState | undefined>(
    undefined,
  );

  // Stable setter so consumers can safely use it in useEffect deps (avoids maximum update depth)
  const handleSetAlertConfig = useCallback((config: AlertState) => {
    setAlertConfig(config);
    setIsVisible(config.isVisible);
  }, []);

  const value: AlertContextType = useMemo(
    () => ({
      alertConfig,
      setAlertConfig: handleSetAlertConfig,
      setIsVisible,
    }),
    [alertConfig, handleSetAlertConfig],
  );

  return (
    <AlertContext.Provider value={value}>
      {children}

      <AlertModal
        isVisible={isVisible}
        title={alertConfig?.title || ""}
        message={alertConfig?.message || ""}
        type={alertConfig?.type || "error"}
        confirmLabel={alertConfig?.confirmLabel}
        {...(alertConfig?.onClose && {
          onClose: () => alertConfig.onClose?.(),
        })}
        {...(alertConfig?.onConfirm && {
          onConfirm: () => alertConfig.onConfirm?.(),
        })}
      />
    </AlertContext.Provider>
  );
};

export const useAlertContext = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlertContext must be used within an AlertProvider");
  }
  return context;
};

export default AlertContext;
