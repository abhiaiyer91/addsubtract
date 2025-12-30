/**
 * Keyboard Shortcuts Store
 *
 * Zustand store for managing keyboard shortcuts state, including
 * custom bindings, disabled shortcuts, and preset schemes.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ShortcutDefinition,
  ShortcutConflict,
  ShortcutContext,
} from './types';
import { DEFAULT_SHORTCUTS } from './defaults';
import { PRESETS, getPresetById } from './presets';
import { normalizeShortcut } from './utils';

interface ShortcutStoreState {
  // State
  shortcuts: ShortcutDefinition[];
  customBindings: Record<string, string>;
  disabledShortcuts: string[];
  activePreset: string | null;

  // Computed getters
  getShortcut: (id: string) => ShortcutDefinition | undefined;
  getShortcutsByContext: (context: ShortcutContext) => ShortcutDefinition[];
  getShortcutsByCategory: () => Map<string, ShortcutDefinition[]>;
  getEffectiveKeys: (id: string) => string;
  isShortcutDisabled: (id: string) => boolean;
  isShortcutCustomized: (id: string) => boolean;
  detectConflicts: () => ShortcutConflict[];

  // Actions
  setCustomBinding: (id: string, keys: string) => void;
  resetBinding: (id: string) => void;
  resetAllBindings: () => void;
  toggleShortcut: (id: string, enabled: boolean) => void;
  applyPreset: (presetId: string) => void;
  exportBindings: () => string;
  importBindings: (json: string) => boolean;
}

export const useShortcutStore = create<ShortcutStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      shortcuts: DEFAULT_SHORTCUTS,
      customBindings: {},
      disabledShortcuts: [],
      activePreset: null,

      // Get a shortcut by ID
      getShortcut: (id) => {
        return get().shortcuts.find((s) => s.id === id);
      },

      // Get all shortcuts for a specific context
      getShortcutsByContext: (context) => {
        const { shortcuts, disabledShortcuts } = get();
        return shortcuts.filter(
          (s) => s.context === context && !disabledShortcuts.includes(s.id)
        );
      },

      // Get shortcuts grouped by category
      getShortcutsByCategory: () => {
        const { shortcuts } = get();
        const map = new Map<string, ShortcutDefinition[]>();
        for (const shortcut of shortcuts) {
          const list = map.get(shortcut.category) || [];
          list.push(shortcut);
          map.set(shortcut.category, list);
        }
        return map;
      },

      // Get effective keys for a shortcut (custom or default)
      getEffectiveKeys: (id) => {
        const { customBindings, shortcuts, activePreset } = get();

        // Check custom binding first
        if (customBindings[id] !== undefined) {
          return customBindings[id];
        }

        // Check preset
        if (activePreset) {
          const preset = getPresetById(activePreset);
          if (preset?.shortcuts[id] !== undefined) {
            return preset.shortcuts[id]!;
          }
        }

        // Fall back to default
        const shortcut = shortcuts.find((s) => s.id === id);
        return shortcut?.keys || '';
      },

      // Check if a shortcut is disabled
      isShortcutDisabled: (id) => {
        return get().disabledShortcuts.includes(id);
      },

      // Check if a shortcut has been customized
      isShortcutCustomized: (id) => {
        return get().customBindings[id] !== undefined;
      },

      // Detect conflicts between shortcuts
      detectConflicts: () => {
        const { shortcuts, disabledShortcuts } = get();
        const { getEffectiveKeys } = get();
        const conflicts: ShortcutConflict[] = [];
        const keyMap = new Map<string, ShortcutDefinition>();

        for (const shortcut of shortcuts) {
          if (disabledShortcuts.includes(shortcut.id)) continue;

          const keys = getEffectiveKeys(shortcut.id);
          if (!keys) continue;

          const normalizedKeys = normalizeShortcut(keys);
          const key = `${shortcut.context}:${normalizedKeys}`;

          const existing = keyMap.get(key);
          if (existing) {
            conflicts.push({
              shortcutId: shortcut.id,
              conflictingId: existing.id,
              keys,
              context: shortcut.context,
            });
          } else {
            keyMap.set(key, shortcut);
          }

          // Also check for global conflicts (global shortcuts conflict with all)
          if (shortcut.context !== 'global') {
            const globalKey = `global:${normalizedKeys}`;
            const globalExisting = keyMap.get(globalKey);
            if (globalExisting) {
              conflicts.push({
                shortcutId: shortcut.id,
                conflictingId: globalExisting.id,
                keys,
                context: shortcut.context,
              });
            }
          }
        }

        return conflicts;
      },

      // Set a custom binding for a shortcut
      setCustomBinding: (id, keys) => {
        set((state) => ({
          customBindings: { ...state.customBindings, [id]: keys },
          activePreset: null, // Clear preset when customizing
        }));
      },

      // Reset a single binding to default
      resetBinding: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.customBindings;
          return { customBindings: rest };
        });
      },

      // Reset all bindings to default
      resetAllBindings: () => {
        set({
          customBindings: {},
          disabledShortcuts: [],
          activePreset: null,
        });
      },

      // Enable or disable a shortcut
      toggleShortcut: (id, enabled) => {
        set((state) => {
          const newDisabled = [...state.disabledShortcuts];
          const idx = newDisabled.indexOf(id);

          if (enabled && idx !== -1) {
            newDisabled.splice(idx, 1);
          } else if (!enabled && idx === -1) {
            newDisabled.push(id);
          }

          return { disabledShortcuts: newDisabled };
        });
      },

      // Apply a preset
      applyPreset: (presetId) => {
        const preset = PRESETS.find((p) => p.id === presetId);
        if (!preset) return;

        set({
          customBindings: {},
          activePreset: presetId,
        });
      },

      // Export current bindings as JSON
      exportBindings: () => {
        const { customBindings, disabledShortcuts, activePreset } = get();
        return JSON.stringify(
          {
            version: 1,
            customBindings,
            disabledShortcuts,
            activePreset,
          },
          null,
          2
        );
      },

      // Import bindings from JSON
      importBindings: (json) => {
        try {
          const data = JSON.parse(json);
          if (data.version !== 1) return false;

          set({
            customBindings: data.customBindings || {},
            disabledShortcuts: data.disabledShortcuts || [],
            activePreset: data.activePreset || null,
          });

          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'wit-keyboard-shortcuts',
      partialize: (state) => ({
        customBindings: state.customBindings,
        disabledShortcuts: state.disabledShortcuts,
        activePreset: state.activePreset,
      }),
    }
  )
);

/**
 * Get effective keys for a shortcut ID (non-reactive helper).
 */
export function getEffectiveKeysStatic(id: string): string {
  return useShortcutStore.getState().getEffectiveKeys(id);
}

/**
 * Check if a shortcut is disabled (non-reactive helper).
 */
export function isShortcutDisabledStatic(id: string): boolean {
  return useShortcutStore.getState().isShortcutDisabled(id);
}
