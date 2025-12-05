import { create } from "zustand";

interface AlertState {
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

interface UIState {
  alert: AlertState | null;
  isLoading: boolean;
  setAlert: (alert: AlertState | null) => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  clearAlert: () => void;
  setLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  alert: null,
  isLoading: false,

  setAlert: (alert) => set({ alert }),

  showSuccess: (title, message) =>
    set({ alert: { type: "success", title, message } }),

  showError: (title, message) =>
    set({ alert: { type: "error", title, message } }),

  clearAlert: () => set({ alert: null }),

  setLoading: (isLoading) => set({ isLoading }),
}));
