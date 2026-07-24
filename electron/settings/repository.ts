/**
 * SettingsRepository — 用户偏好的持久化读写（Milestone E-F/G）。
 *
 * 单一真相源：主进程持有唯一实例，托盘和 renderer 都经它读写（计划步骤 1-2）。
 *
 * 设计：
 * - 文件路径构造时注入（测试用临时目录，生产用 app.getPath("userData")）。
 * - 只用 node:fs，不依赖 electron 的 app，便于 node:test 单元测试。
 * - load() 容错：文件缺失 / JSON 损坏 / 校验失败 → 回退默认值，不阻塞启动。
 * - **写盘严格串行**（P1 修复）：维护单一 in-flight Promise 链，新 update 排到队尾；
 *   每次写盘用唯一计数 tmp 文件（settings.json.tmp.N），写完即删，绝不共用 tmp 并发 rename。
 * - flush() await 整个队列尾部——保证返回时所有已排队写入完成，磁盘是最新完整 Settings。
 * - 不保存任何敏感数据（schema 见 shared/settings.ts，只有偏好字段）。
 *
 * 纪律 B：load 返回可判别的 Settings（永远是合法值，无 null/error 态需要调用方判别）。
 */
import { existsSync, readFileSync } from "node:fs";
import { writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  validateSettings,
  DEFAULT_SETTINGS,
  type Settings,
  type PreferenceKey,
  normalizePreference,
} from "../../shared/settings.js";
import { validateSurfaceKind, type SurfaceKind } from "../../shared/desktop.js";
import {
  normalizeWindowPlacement,
  sameWindowPlacement,
  type WindowPlacement,
} from "../../shared/window-placement.js";

export interface SettingsRepositoryOptions {
  /** settings.json 所在目录（生产用 app.getPath("userData")，测试用 tmpdir）。 */
  dir: string;
  /** 文件名（默认 settings.json）。 */
  filename?: string;
  /**
   * 首次文件缺失时的默认值（生产注入按 app.getLocale() 解析 language 的默认；
   * 测试默认 undefined → 用 DEFAULT_SETTINGS）。用户已保存的值不受影响（走文件读取分支）。
   */
  initialDefaults?: Settings;
}

export class SettingsRepository {
  readonly #filePath: string;
  #current: Settings;
  /**
   * 写盘队列尾部。串行保证：每次 #persist 只在上一份完成后才开始。
   * flush() await 它 → 等到所有已排队写盘完成。
   */
  #queueTail: Promise<void> = Promise.resolve();
  /** tmp 文件计数器：每次写盘唯一 tmp 名，避免并发 rename 撞同一文件。 */
  #tmpCounter = 0;
  #loaded = false;

  constructor(opts: SettingsRepositoryOptions) {
    const filename = opts.filename ?? "settings.json";
    this.#filePath = join(opts.dir, filename);
    this.#current = opts.initialDefaults ?? { ...DEFAULT_SETTINGS };
  }

  /** 文件绝对路径（测试和调试用）。 */
  get filePath(): string {
    return this.#filePath;
  }

  /**
   * 从磁盘加载并校验。文件缺失/损坏/校验失败 → 回退默认值，不抛异常。
   * 幂等：重复调用只首次读盘，之后返回缓存（update 后缓存同步更新）。
   * 文件缺失时用构造注入的 initialDefaults（问题 4：按 locale 解析 language）。
   */
  load(): Settings {
    if (this.#loaded) return this.#current;
    this.#loaded = true;
    if (!existsSync(this.#filePath)) {
      // 首次启动：用 initialDefaults（已含 locale 解析后的 language，由 main.ts 注入）。
      return this.#current;
    }
    try {
      const raw = readFileSync(this.#filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      this.#current = validateSettings(parsed);
    } catch {
      // JSON 解析失败 / 读盘 IO 错误 → 回退默认，不阻塞应用启动。
      this.#current = { ...DEFAULT_SETTINGS };
    }
    return this.#current;
  }

  /** 当前设置（load 后的缓存值；未 load 则返回构造默认）。 */
  get(): Settings {
    return this.#current;
  }

  /**
   * 更新单个偏好字段，排入串行写盘队列并返回新值。
   * key/value 非法时忽略，返回当前值不变（normalizePreference 返 null）。
   * 写盘异步串行；需确保落盘时 await flush()。
   */
  update(key: PreferenceKey, value: unknown): Settings {
    const normalized = normalizePreference(key, value);
    if (!normalized) return this.#current;
    // 值未变则不写盘、不产生新引用（调用方可据此判别是否真正变化）。
    if (this.#current[normalized.key] === normalized.value) return this.#current;
    this.#current = { ...this.#current, [normalized.key]: normalized.value };
    // 排到队列尾：上一个写盘完成后才写本次。保证严格串行，无并发 rename。
    this.#queueTail = this.#queueTail.then(() => this.#persist());
    return this.#current;
  }

  /**
   * 主进程专用：更新某个 surface 的窗口位置。
   * 不进入 renderer setPreference 契约，避免不受信任的 renderer 直接写屏幕坐标。
   */
  updateWindowPlacement(kind: SurfaceKind, value: unknown): Settings {
    const normalizedKind = validateSurfaceKind(kind);
    const normalizedPlacement = normalizeWindowPlacement(value);
    if (!normalizedKind || !normalizedPlacement) return this.#current;
    const previous = this.#current.windowPlacements[normalizedKind];
    if (sameWindowPlacement(previous, normalizedPlacement)) return this.#current;
    this.#current = {
      ...this.#current,
      windowPlacements: {
        ...this.#current.windowPlacements,
        [normalizedKind]: normalizedPlacement,
      },
    };
    this.#queueTail = this.#queueTail.then(() => this.#persist());
    return this.#current;
  }

  /** 当前某个 surface 的已保存位置；未保存返回 null。 */
  getWindowPlacement(kind: SurfaceKind): WindowPlacement | null {
    return this.#current.windowPlacements[kind];
  }

  /** 等待所有已排队的写盘完成（测试和优雅关闭用）。 */
  async flush(): Promise<void> {
    await this.#queueTail;
  }

  /**
   * 单次写盘（只在队列里串行调用）：写唯一 tmp → rename → 删 tmp。
   * 每次 tmp 名唯一（.tmp.N），即使前一次写盘因异常未清理也不撞同名。
   * 写当前完整 #current（最新值），保证磁盘内容是最新完整 Settings。
   */
  async #persist(): Promise<void> {
    const tmpPath = `${this.#filePath}.tmp.${++this.#tmpCounter}`;
    try {
      await mkdir(dirname(this.#filePath), { recursive: true });
      await writeFile(tmpPath, JSON.stringify(this.#current, null, 2), "utf8");
      await rename(tmpPath, this.#filePath);
    } catch (error) {
      // 持久化失败不应崩溃应用；下次 update 会重试。清理残留 tmp。
      try {
        await unlink(tmpPath);
      } catch {
        // tmp 可能已 rename 走或根本没创建，忽略。
      }
      console.error(
        `[settings] persist failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
