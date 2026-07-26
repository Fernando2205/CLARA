import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// No hay JWT ni cookies de sesión: esto solo evita que una recarga de
// página te saque de la app en medio de una toma. No reemplaza
// autenticación real (no hay expiración, revocación ni verificación en
// el backend más allá del login inicial).
export const useAuthStore = create(persist((set) => ({
  user: null,
  authenticated: false,
  login: (user) => set({ user, authenticated: true }),
  logout: () => set({ user: null, authenticated: false }),
}), {
  name: 'clara-auth',
}))
