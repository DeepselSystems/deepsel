import { create } from 'zustand';

const initialState = { user: null };

export default create((set) => ({
  ...initialState,
  setUser: (user) => set(() => ({ user })),
  logout: () => set(() => ({ user: null })),
}));
