import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  user: {
    id: 1,
    nombre: 'Sofía Valencia',
    nombreCorto: 'Sofía',
    iniciales: 'SV',
    cargo: 'Auxiliar de Cocina 2',
    turno: 'Turno mañana',
    bodega: 'Restaurante Fuentes · AyB',
  },
  authenticated: false,
  authenticate: () => set({ authenticated: true }),
  signOut: () => set({ authenticated: false }),
}))
