import { create } from 'zustand';

interface ConfirmDialogState {
  isOpen: boolean;
  message: string;
  resolve: ((value: boolean) => void) | null;
  openConfirm: (message: string) => Promise<boolean>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  isOpen: false,
  message: '',
  resolve: null,

  openConfirm: (message) => {
    return new Promise<boolean>((resolve) => {
      set({ isOpen: true, message, resolve });
    });
  },

  handleConfirm: () => {
    const { resolve } = get();
    resolve?.(true);
    set({ isOpen: false, message: '', resolve: null });
  },

  handleCancel: () => {
    const { resolve } = get();
    resolve?.(false);
    set({ isOpen: false, message: '', resolve: null });
  },
}));
