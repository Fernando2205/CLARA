import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const initialRecords = [
  { id: 5, name: 'ACEITE', quantity: 12, unit: 'litros', catalogUnit: 'Liter', stock: 851.43, sku: '7290', badge: 'sincronizado' },
  { id: 4, name: 'HUEVO AA', quantity: 35, unit: 'unidades', catalogUnit: 'Unidad', stock: 40, sku: '7432', badge: 'corregido' },
  { id: 3, name: 'GUISO CRIOLLO', quantity: 45, unit: 'porciones', catalogUnit: 'Portion', stock: -12, sku: null, badge: 'sincronizado' },
  { id: 2, name: 'ARROZ', quantity: 18, unit: 'kilogramos', catalogUnit: 'Kilogram', stock: 210.02, sku: '6005', badge: 'sincronizado' },
  { id: 1, name: 'AZUCAR', quantity: 8, unit: 'kilogramos', catalogUnit: 'Kilogram', stock: 9, sku: '6012', badge: 'sincronizado' },
]

export const useSessionStore = create(persist((set) => ({
  bodega: 'STOCK RESTAURANTE FUENTES AYB',
  bodegaLabel: 'Restaurante Fuentes · AyB',
  mode: 'toma',
  totalRefs: 344,
  baselineCount: 42,
  records: initialRecords,
  online: true,
  corrections: 3,
  alertsResolved: 3,
  signed: false,
  sessionId: null,
  setSessionId: (sessionId) => set({ sessionId }),
  setBodega: (bodega, bodegaLabel) => set((state) => ({
    bodega,
    bodegaLabel,
    sessionId: state.bodega === bodega ? state.sessionId : null,
  })),
  setMode: (mode) => set({ mode }),
  toggleOnline: () => set((state) => ({
    online: !state.online,
    records: state.online
      ? state.records
      : state.records.map((record) => (
        record.badge === 'pendiente' ? { ...record, badge: 'sincronizado' } : record
      )),
  })),
  addRecord: (record) =>
    set((state) => ({
      records: [{ ...record, id: Date.now(), badge: state.online ? 'sincronizado' : 'pendiente' }, ...state.records],
      alertsResolved: state.alertsResolved + (record.resolvedAlertCount || 0),
    })),
  updateRecord: (id, updates) =>
    set((state) => ({
      records: state.records.map((record) => (
        record.id === id
          ? { ...record, ...updates, badge: 'corregido' }
          : record
      )),
      corrections: state.corrections + 1,
      alertsResolved: state.alertsResolved + (updates.resolvedAlertCount || 0),
    })),
  undoLast: () => set((state) => ({ records: state.records.slice(1) })),
  sign: () => set({ signed: true }),
  reset: () => set({
    records: initialRecords,
    corrections: 3,
    alertsResolved: 3,
    signed: false,
    sessionId: null,
  }),
}), {
  name: 'clara-session',
  partialize: (state) => ({
    bodega: state.bodega,
    bodegaLabel: state.bodegaLabel,
    mode: state.mode,
    records: state.records,
    online: state.online,
    corrections: state.corrections,
    alertsResolved: state.alertsResolved,
    signed: state.signed,
    sessionId: state.sessionId,
  }),
}))
