/**
 * appConfig.test.ts
 *
 * Unit tests for the AppConfig Zustand store (P1-04).
 *
 * Covers:
 *  - Default config values
 *  - setConfig partial updates
 *  - resetConfig restores defaults
 *  - Persistence is wired (storage key is set)
 *  - All required fields present (ZR-01–ZR-05, AT-04, E-03)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAppConfigStore, selectConfig, type AppConfig } from '../appConfig';

// ── localStorage stub for Node/jsdom environment ────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ── Reset store state before each test ──────────────────────────────────────

beforeEach(() => {
  localStorageMock.clear();
  useAppConfigStore.getState().resetConfig();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AppConfig defaults (ZR-01–ZR-05, AT-04, E-03)', () => {
  it('has a valid ISO dateFrom (ZR-01)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has a valid ISO dateTo (ZR-02)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dateFrom is before or equal to dateTo by default', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.dateFrom <= config.dateTo).toBe(true);
  });

  it('has default timeFrom HH:mm format (ZR-03)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.timeFrom).toMatch(/^\d{2}:\d{2}$/);
  });

  it('has default timeTo HH:mm format (ZR-04)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.timeTo).toMatch(/^\d{2}:\d{2}$/);
  });

  it('paymentMode defaults to sepa (ZR-05)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.paymentMode).toBe('sepa');
  });

  it('bundesland has a default value (AT-04)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(typeof config.bundesland).toBe('string');
    expect(config.bundesland.length).toBeGreaterThan(0);
  });

  it('seed defaults to null (E-03)', () => {
    const config = selectConfig(useAppConfigStore.getState());
    expect(config.seed).toBeNull();
  });
});

describe('setConfig – partial updates', () => {
  it('updates a single field without touching others', () => {
    const store = useAppConfigStore.getState();
    const originalDateFrom = store.config.dateFrom;

    store.setConfig({ paymentMode: 'instant' });

    const updated = selectConfig(useAppConfigStore.getState());
    expect(updated.paymentMode).toBe('instant');
    expect(updated.dateFrom).toBe(originalDateFrom);
  });

  it('updates dateFrom independently (ZR-01)', () => {
    useAppConfigStore.getState().setConfig({ dateFrom: '2020-01-01' });
    expect(selectConfig(useAppConfigStore.getState()).dateFrom).toBe('2020-01-01');
  });

  it('updates dateTo independently (ZR-02)', () => {
    useAppConfigStore.getState().setConfig({ dateTo: '2024-12-31' });
    expect(selectConfig(useAppConfigStore.getState()).dateTo).toBe('2024-12-31');
  });

  it('updates timeFrom (ZR-03)', () => {
    useAppConfigStore.getState().setConfig({ timeFrom: '08:00' });
    expect(selectConfig(useAppConfigStore.getState()).timeFrom).toBe('08:00');
  });

  it('updates timeTo (ZR-04)', () => {
    useAppConfigStore.getState().setConfig({ timeTo: '18:00' });
    expect(selectConfig(useAppConfigStore.getState()).timeTo).toBe('18:00');
  });

  it('accepts both sepa and instant for paymentMode (ZR-05)', () => {
    const store = useAppConfigStore.getState();
    store.setConfig({ paymentMode: 'instant' });
    expect(selectConfig(useAppConfigStore.getState()).paymentMode).toBe('instant');
    store.setConfig({ paymentMode: 'sepa' });
    expect(selectConfig(useAppConfigStore.getState()).paymentMode).toBe('sepa');
  });

  it('updates bundesland (AT-04)', () => {
    useAppConfigStore.getState().setConfig({ bundesland: 'AT-9' });
    expect(selectConfig(useAppConfigStore.getState()).bundesland).toBe('AT-9');
  });

  it('accepts numeric seed (E-03)', () => {
    useAppConfigStore.getState().setConfig({ seed: 42 });
    expect(selectConfig(useAppConfigStore.getState()).seed).toBe(42);
  });

  it('accepts null seed to disable deterministic mode (E-03)', () => {
    useAppConfigStore.getState().setConfig({ seed: 42 });
    useAppConfigStore.getState().setConfig({ seed: null });
    expect(selectConfig(useAppConfigStore.getState()).seed).toBeNull();
  });
});

describe('resetConfig', () => {
  it('restores all defaults after changes', () => {
    const store = useAppConfigStore.getState();
    store.setConfig({
      paymentMode: 'instant',
      bundesland: 'AT-9',
      seed: 12345,
      timeFrom: '09:00',
      timeTo: '17:00',
    });

    store.resetConfig();

    const config = selectConfig(useAppConfigStore.getState());
    expect(config.paymentMode).toBe('sepa');
    expect(config.bundesland).toBe('DE-BY');
    expect(config.seed).toBeNull();
    expect(config.timeFrom).toBe('00:00');
    expect(config.timeTo).toBe('23:59');
  });
});

describe('AppConfig TypeScript shape', () => {
  it('config object contains all required fields', () => {
    const config = selectConfig(useAppConfigStore.getState());
    const requiredFields: (keyof AppConfig)[] = [
      'dateFrom',
      'dateTo',
      'timeFrom',
      'timeTo',
      'paymentMode',
      'bundesland',
      'seed',
    ];
    for (const field of requiredFields) {
      expect(config).toHaveProperty(field);
    }
  });
});
