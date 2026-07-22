import { create } from "zustand";
import type { MultiClientSnapshot } from "../../../shared/desktop";

interface UsageState {
  activeClient: string;
  snapshot: MultiClientSnapshot | null;
  error: string | null;
  setActiveClient(clientId: string): void;
  setSnapshot(snapshot: MultiClientSnapshot): void;
  setError(error: string | null): void;
}

export const useUsageStore = create<UsageState>((set) => ({
  activeClient: "codex",
  snapshot: null,
  error: null,
  setActiveClient: (activeClient) => set({ activeClient }),
  setSnapshot: (snapshot) => set({ snapshot, error: null }),
  setError: (error) => set({ error }),
}));
