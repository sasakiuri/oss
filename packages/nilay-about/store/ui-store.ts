import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

// Types
export type AlertType = "success" | "error" | "info" | "warning";

export interface AlertState {
  type: AlertType;
  title: string;
  message: string;
  dismissible?: boolean;
  duration?: number;
}

interface UIState {
  alert: AlertState | null;
  isLoading: boolean;
}

interface UIActions {
  setAlert: (alert: AlertState | null) => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showInfo: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  clearAlert: () => void;
  setLoading: (loading: boolean) => void;
}

type UIStore = UIState & UIActions;

// Initial state
export const initialUIState: UIState = {
  alert: null,
  isLoading: false,
};

// Helper to create alert
const createAlert = (
  type: AlertType,
  title: string,
  message: string
): AlertState => ({
  type,
  title,
  message,
  dismissible: true,
});

// Store
export const useUIStore = create<UIStore>((set) => ({
  ...initialUIState,

  setAlert: (alert) => set({ alert }),

  showSuccess: (title, message) =>
    set({ alert: createAlert("success", title, message) }),

  showError: (title, message) =>
    set({ alert: createAlert("error", title, message) }),

  showInfo: (title, message) =>
    set({ alert: createAlert("info", title, message) }),

  showWarning: (title, message) =>
    set({ alert: createAlert("warning", title, message) }),

  clearAlert: () => set({ alert: null }),

  setLoading: (isLoading) => set({ isLoading }),
}));

// Selectors
export const useAlert = () => useUIStore((state) => state.alert);

export const useIsLoading = () => useUIStore((state) => state.isLoading);

export const useUIActions = () =>
  useUIStore(
    useShallow((state) => ({
      showSuccess: state.showSuccess,
      showError: state.showError,
      showInfo: state.showInfo,
      showWarning: state.showWarning,
      clearAlert: state.clearAlert,
      setLoading: state.setLoading,
    }))
  );
