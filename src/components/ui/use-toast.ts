import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const currentToasts = get().toasts;
    // Suppress repeated announcements from a single action while the first is visible.
    const isDuplicate = currentToasts.some(
      (current) => current.message === toast.message && current.description === toast.description && current.type === toast.type,
    );
    if (isDuplicate) return;

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }].slice(-5),
    }));

    if (toast.duration !== 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, toast.duration || 4000);
    }
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

export const toast = (toast: Omit<Toast, 'id'>) => useToastStore.getState().addToast(toast);
