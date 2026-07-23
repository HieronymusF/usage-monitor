/**
 * ForegroundWindowAdapter — 前台窗口检测的抽象（D-3 切片 1 + P2-2 修复）。
 *
 * DEVELOPMENT-PLAN §7.4 要求「先定义接口和测试替身，再做 Windows 实现」。
 * 本文件只放接口和测试用的 Fake 实现，不引入任何 Windows 依赖，便于：
 * - AutoSurfaceWatcher 注入任意 adapter（生产用 PowerShell daemon，测试用 Fake）。
 * - 未来切片扩展字段（窗口矩形 / DPI / 显示器）时只改这里，不改 watcher。
 *
 * 红线：只读进程名，不读 PID / 路径 / 窗口标题 / 凭据。输出经小写化后交给 resolver。
 *
 * P2-2（2026-07-23）：结果改为可判别 union，区分"成功检测（含无前台窗口）"和"探针失败"。
 * 探针失败时 watcher 保持当前 surface，不误切 orb。
 */

/**
 * 前台窗口探针的可判别结果（P2-2）。
 * - `ok`：成功检测。processName 可为 null（无前台窗口，按产品规则→orb）。
 * - `error`：探针执行失败（超时/守护进程崩/解析错）。watcher 应保持当前 surface。
 */
export type ForegroundProbeResult = { kind: "ok"; processName: string | null } | { kind: "error" };

/**
 * 读一次前台窗口进程名。幂等。允许抛错（AutoSurfaceWatcher 会捕获并保持当前 surface）。
 */
export interface ForegroundWindowAdapter {
  getForegroundProcess(): Promise<ForegroundProbeResult>;
}

/**
 * 测试替身：按调用顺序返回预设结果。
 * @param sequence 每次 getForegroundProcess 返回的值；`null` 表示该次应 reject（模拟检测失败）。
 *
 * 用法：
 *   const fake = new FakeForegroundWindowAdapter([{kind:"ok",processName:"code"}, null, {kind:"ok",processName:null}]);
 */
export class FakeForegroundWindowAdapter implements ForegroundWindowAdapter {
  readonly #sequence: readonly (ForegroundProbeResult | null)[];
  #index = 0;

  constructor(sequence: readonly (ForegroundProbeResult | null)[]) {
    this.#sequence = sequence;
  }

  async getForegroundProcess(): Promise<ForegroundProbeResult> {
    const item = this.#sequence[this.#index] ?? { kind: "error" };
    this.#index += 1;
    if (item === null) {
      throw new Error("FakeForegroundWindowAdapter: simulated detection failure");
    }
    return item;
  }
}

/**
 * 永远返回 error 的 stub（探针永远失败）。
 * 用于非 win32 平台（mac/linux 无 GetForegroundWindow 语义）——watcher 见 error 保持当前
 * surface（不误切 orb），与"无前台检测能力"语义一致。
 */
export class NullForegroundWindowAdapter implements ForegroundWindowAdapter {
  async getForegroundProcess(): Promise<ForegroundProbeResult> {
    return { kind: "error" };
  }
}
