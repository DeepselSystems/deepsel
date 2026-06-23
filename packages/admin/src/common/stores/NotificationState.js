import { create } from 'zustand';

const initialState = {
  open: false,
  message: '',
  type: 'info',
  duration: 3000,
};

export default create((set) => ({
  ...initialState,
  setOpen: (open) => set(() => ({ open })),
  notify: ({ message, type, duration = 3000 }) =>
    set(() => ({
      message,
      open: true,
      type,
      duration,
    })),
}));
