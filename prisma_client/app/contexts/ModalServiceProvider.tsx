/**
 * Modal queue context: fullscreen, sheet, and center modals via ModalServices.
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import ModalServices from "../utils/ModalServices";

// Types for modal configuration
export interface ModalConfig {
  id: string;
  component: ReactNode;
  title?: string;
  showCloseButton?: boolean;
  modalType?: "fullscreen" | "sheet" | "center";
  animationType?: "slide" | "fade" | "none";
  backgroundColor?: string;
  borderRadius?: number;
  maxHeight?: number;
  onClose?: () => void;
}

export interface ModalContextType {
  // Show modal methods
  showModal: (config: Omit<ModalConfig, "id">) => string;
  showFullscreenModal: (
    component: ReactNode,
    title?: string,
    onClose?: () => void,
  ) => string;
  showSheetModal: (
    component: ReactNode,
    title?: string,
    onClose?: () => void,
  ) => string;
  showCenterModal: (
    component: ReactNode,
    title?: string,
    onClose?: () => void,
  ) => string;

  // Modal management
  closeModal: (id?: string) => void;
  closeAllModals: () => void;
  updateModal: (id: string, updates: Partial<ModalConfig>) => void;

  // State
  isModalVisible: boolean;
  currentModal: ModalConfig | null;
  modalQueue: ModalConfig[];
}

// Create context
const ModalContext = createContext<ModalContextType | undefined>(undefined);

interface ModalServiceProviderProps {
  children: React.ReactNode;
}

/** Provider that manages a modal queue and renders the active modal. */
const ModalServiceProvider = ({ children }: ModalServiceProviderProps) => {
  const [modalQueue, setModalQueue] = useState<ModalConfig[]>([]);
  const [currentModal, setCurrentModal] = useState<ModalConfig | null>(null);

  // Generate unique ID for modals
  /** Generate a unique id for a queued modal. */
  const generateModalId = useCallback(() => {
    return `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /** Enqueue a modal; shows immediately if none is active. Returns modal id. */
  const showModal = useCallback(
    (config: Omit<ModalConfig, "id">): string => {
      const id = generateModalId();
      const modalConfig: ModalConfig = {
        id,
        ...config,
      };

      setModalQueue((prev) => [...prev, modalConfig]);

      // If no modal is currently shown, show this one
      if (!currentModal) {
        setCurrentModal(modalConfig);
      }

      return id;
    },
    [currentModal, generateModalId],
  );

  /** Show a fullscreen modal; returns modal id. */
  const showFullscreenModal = useCallback(
    (component: ReactNode, title?: string, onClose?: () => void): string => {
      return showModal({
        component,
        title,
        modalType: "fullscreen",
        onClose,
      });
    },
    [showModal],
  );

  /** Show a bottom sheet modal; returns modal id. */
  const showSheetModal = useCallback(
    (component: ReactNode, title?: string, onClose?: () => void): string => {
      return showModal({
        component,
        title,
        modalType: "sheet",
        onClose,
      });
    },
    [showModal],
  );

  /** Show a centered dialog modal; returns modal id. */
  const showCenterModal = useCallback(
    (component: ReactNode, title?: string, onClose?: () => void): string => {
      return showModal({
        component,
        title,
        modalType: "center",
        onClose,
      });
    },
    [showModal],
  );

  /** Close by id or dismiss the current modal. */
  const closeModal = useCallback(
    (id?: string) => {
      if (!id) {
        // Close current modal
        setCurrentModal(null);
        setModalQueue((prev) => prev.slice(1));
        return;
      }

      setModalQueue((prev) => {
        const filtered = prev.filter((modal) => modal.id !== id);

        // If we're closing the current modal, show the next one
        if (currentModal?.id === id) {
          setCurrentModal(filtered.length > 0 ? filtered[0] : null);
        }

        return filtered;
      });
    },
    [currentModal],
  );

  /** Clear the entire modal queue. */
  const closeAllModals = useCallback(() => {
    setCurrentModal(null);
    setModalQueue([]);
  }, []);

  /** Patch title, component, or options for a queued modal. */
  const updateModal = useCallback(
    (id: string, updates: Partial<ModalConfig>) => {
      setModalQueue((prev) =>
        prev.map((modal) =>
          modal.id === id ? { ...modal, ...updates } : modal,
        ),
      );

      // Update current modal if it matches
      if (currentModal?.id === id) {
        setCurrentModal((prev) => (prev ? { ...prev, ...updates } : null));
      }
    },
    [currentModal],
  );

  // Handle modal close with callback
  /** Run onClose callback then close the current modal. */
  const handleModalClose = useCallback(() => {
    if (currentModal?.onClose) {
      currentModal.onClose();
    }
    closeModal();
  }, [currentModal, closeModal]);

  // Show next modal in queue when current modal closes
  /** Advance to the next modal in the queue after close animation. */
  const handleModalCloseComplete = useCallback(() => {
    setModalQueue((prev) => {
      const next = prev.slice(1);
      setCurrentModal(next.length > 0 ? next[0] : null);
      return next;
    });
  }, []);

  const contextValue: ModalContextType = {
    showModal,
    showFullscreenModal,
    showSheetModal,
    showCenterModal,
    closeModal,
    closeAllModals,
    updateModal,
    isModalVisible: !!currentModal,
    currentModal,
    modalQueue,
  };

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
      {currentModal && (
        <ModalServices
          visible={true}
          onClose={handleModalClose}
          component={currentModal.component}
          title={currentModal.title}
          showCloseButton={currentModal.showCloseButton}
          modalType={currentModal.modalType}
          animationType={currentModal.animationType}
          backgroundColor={currentModal.backgroundColor}
          borderRadius={currentModal.borderRadius}
          maxHeight={currentModal.maxHeight}
        />
      )}
    </ModalContext.Provider>
  );
};

// Custom hook to use modal service
export const useModalService = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error(
      "useModalService must be used within a ModalServiceProvider",
    );
  }
  return context;
};

export default ModalServiceProvider;
