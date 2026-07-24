import { create } from "zustand";
import type { ClientKind, MultiClientSnapshot, Settings } from "../../../shared/desktop";

interface UsageState {
  activeClient: ClientKind;
  snapshot: MultiClientSnapshot | null;
  error: string | null;
  /**
   * 用户 UI 切换客户端（乐观更新 + 写主进程 IPC）。
   * 主进程广播回来时由 hydrateFromPreferences 幂等覆盖。
   */
  setActiveClient(clientId: ClientKind): void;
  /** Milestone E-F/G：从主进程 Settings 应用 activeClient（启动 + 广播）。幂等。 */
  hydrateFromPreferences(settings: Settings): void;
  setSnapshot(snapshot: MultiClientSnapshot): void;
  setError(error: string | null): void;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  activeClient: "codex",
  snapshot: null,
  error: null,
  setActiveClient: (activeClient) => {
    set({ activeClient });
    // Milestone E-F/G：写主进程持久化（乐观更新已发生；广播回来幂等覆盖）。
    if (typeof window !== "undefined" && window.monitor?.setPreference) {
      window.monitor.setPreference("activeClient", activeClient);
    }
  },
  hydrateFromPreferences(settings) {
    if (get().activeClient === settings.activeClient) return;
    set({ activeClient: settings.activeClient });
  },
  setSnapshot: (snapshot) => set({ snapshot, error: null }),
  setError: (error) => set({ error }),
}));
