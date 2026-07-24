import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: null,
  authenticated: false,
  login: (user) => set({ user, authenticated: true }),
  logout: () => set({ user: null, authenticated: false }),
}))
