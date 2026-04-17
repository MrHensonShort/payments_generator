import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * AppConfig – persisted UI configuration for the Payments Generator.
 *
 * Field mapping (from CLA-9 spec):
 *   ZR-01  dateFrom      – generation start date (ISO date string)
 *   ZR-02  dateTo        – generation end date (ISO date string)
 *   ZR-03  timeFrom      – daily start time (HH:mm)
 *   ZR-04  timeTo        – daily end time (HH:mm)
 *   ZR-05  paymentMode   – 'sepa' | 'instant'
 *   AT-04  bundesland    – German/Austrian state code (e.g. 'DE-BY', 'AT-9')
 *   E-03   seed          – optional PRNG seed for deterministic generation
 */
export interface AppConfig {
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  paymentMode: 'sepa' | 'instant';
  bundesland: string;
  seed: number | null;
}

const DEFAULT_CONFIG: AppConfig = {
  dateFrom: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1 this year
  dateTo: new Date().toISOString().split('T')[0], // today
  timeFrom: '00:00',
  timeTo: '23:59',
  paymentMode: 'sepa',
  bundesland: 'DE-BY',
  seed: null,
};

interface AppConfigStore {
  config: AppConfig;
  setConfig: (patch: Partial<AppConfig>) => void;
  resetConfig: () => void;
}

/**
 * Singleton Zustand store for AppConfig.
 * Persists to localStorage under the key 'app-config'.
 * Can be migrated to an IndexedDB (Dexie) storage adapter in the future
 * by replacing the `storage` option in `createJSONStorage`.
 */
export const useAppConfigStore = create<AppConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      setConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
      resetConfig: () => set({ config: DEFAULT_CONFIG }),
    }),
    {
      name: 'app-config',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Selector: returns the current AppConfig (avoids re-renders on store fn changes). */
export const selectConfig = (state: AppConfigStore): AppConfig => state.config;
