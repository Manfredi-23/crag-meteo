// ═══════════════════════════════════════════
// BitWet — Zustand Crag Store
// ═══════════════════════════════════════════

import { create } from 'zustand';
import type { Crag } from '@/lib/types';
import { storage } from '@/lib/storage';

interface CragState {
  crags: Crag[];
  loadCrags: () => void;
  addCrag: (crag: Omit<Crag, 'id'>) => void;
  editCrag: (id: string, updates: Partial<Omit<Crag, 'id'>>) => void;
  removeCrag: (id: string) => void;
}

function generateId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Date.now();
}

export const useCragStore = create<CragState>((set, get) => ({
  crags: storage.getCrags(),

  loadCrags() {
    set({ crags: storage.getCrags() });
  },

  addCrag(crag) {
    const id = generateId(crag.name);
    const newCrag: Crag = { ...crag, id };
    const crags = [...get().crags, newCrag];
    storage.saveCrags(crags);
    set({ crags });
  },

  editCrag(id, updates) {
    const crags = get().crags.map(c =>
      c.id === id ? { ...c, ...updates } : c
    );
    storage.saveCrags(crags);
    set({ crags });
  },

  removeCrag(id) {
    const crags = get().crags.filter(c => c.id !== id);
    storage.saveCrags(crags);
    set({ crags });
  },
}));
