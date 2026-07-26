import { deflateSync } from "node:zlib";
import type { MultiClientSnapshot } from "../../server/types.js";
import type { ClientKind } from "../../shared/settings.js";

const WEEKLY_WINDOW_MINUTES = 10_080;
const FIVE_HOUR_WINDOW_MINUTES = 300;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SUPERSAMPLE = 4;

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const BORDER: Rgba = [105, 126, 153, 210];
const RAIL: Rgba = [51, 68, 94, 255];
const ARC_START: Rgba = [92, 166, 255, 255];
const ARC_END: Rgba = [56, 210, 255, 255];

/**
 * 托盘只在 Codex 有真实配额时表达百分比。周额度优先，缺失时回退 5h；
 * ZCode / 无数据保持中性图标，避免用静态弧伪造配额。
 */
export function selectTrayRemainingPercent(
  snapshot: MultiClientSnapshot,
  activeClient: ClientKind,
): number | null {
  if (activeClient !== "codex") return null;
  const codex = snapshot.clients.codex;
  if (!codex?.available) return null;

  const weekly = codex.limits.find((limit) => limit.windowMinutes === WEEKLY_WINDOW_MINUTES);
  const weeklyPercent = normalizePercent(weekly?.remainingPercent);
  if (weeklyPercent !== null) return weeklyPercent;

  const fiveHour = codex.limits.find((limit) => limit.windowMinutes === FIVE_HOUR_WINDOW_MINUTES);
  return normalizePercent(fiveHour?.remainingPercent);
}

function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

/**
 * 生成透明 RGBA 像素。几何按图标内部坐标表达，4× supersampling 保证 16px 托盘缩放仍平滑。
 */
export function renderUsageTrayIconRgba(remainingPercent: number | null, size = 32): Uint8Array {
  if (!Number.isInteger(size) || size < 16 || size > 256) {
    throw new RangeError("Tray icon size must be an integer between 16 and 256");
  }
  const progress = normalizePercent(remainingPercent);
  const pixels = new Uint8Array(size * size * 4);
  const sampleCount = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX += 1) {
          const unitX = (x + (sampleX + 0.5) / SUPERSAMPLE) / size;
          const unitY = (y + (sampleY + 0.5) / SUPERSAMPLE) / size;
          const color = sampleIcon(unitX, unitY, progress);
          for (let channel = 0; channel < 4; channel += 1) {
            sum[channel] = (sum[channel] ?? 0) + (color[channel] ?? 0);
          }
        }
      }
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[offset + channel] = Math.round((sum[channel] ?? 0) / sampleCount);
      }
    }
  }
  return pixels;
}

function sampleIcon(x: number, y: number, progress: number | null): Rgba {
  const outer = insideRoundedSquare(x, y, 0.03, 0.2);
  if (!outer) return [0, 0, 0, 0];

  const innerBorder = insideRoundedSquare(x, y, 0.045, 0.185);
  if (!innerBorder) return BORDER;

  const distanceFromLight = Math.min(1, Math.hypot(x - 0.3, y - 0.2) / 1.05);
  const background = interpolate([10, 91, 107, 255], [7, 27, 51, 255], distanceFromLight);

  const dx = x - 0.5;
  const dy = y - 0.5;
  const distance = Math.hypot(dx, dy);
  const ringRadius = 0.265;
  const ringHalfStroke = 0.042;
  if (Math.abs(distance - ringRadius) > ringHalfStroke) return background;
  if (progress === null || progress === 0) return RAIL;

  const startAngle = -Math.PI / 2;
  const safetyGap = Math.PI / 180;
  const sweep = (progress / 100) * (Math.PI * 2 - safetyGap);
  const angle = normalizeAngle(Math.atan2(dy, dx) - startAngle);
  const onArc = angle <= sweep;
  const startX = 0.5;
  const startY = 0.5 - ringRadius;
  const endAngle = startAngle + sweep;
  const endX = 0.5 + Math.cos(endAngle) * ringRadius;
  const endY = 0.5 + Math.sin(endAngle) * ringRadius;
  const onRoundCap =
    Math.hypot(x - startX, y - startY) <= ringHalfStroke ||
    Math.hypot(x - endX, y - endY) <= ringHalfStroke;
  if (!onArc && !onRoundCap) return RAIL;

  const arcPosition = sweep > 0 ? Math.min(1, angle / sweep) : 0;
  return interpolate(ARC_START, ARC_END, arcPosition);
}

function insideRoundedSquare(x: number, y: number, inset: number, radius: number): boolean {
  const half = 0.5 - inset;
  const dx = Math.max(Math.abs(x - 0.5) - (half - radius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (half - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

function normalizeAngle(angle: number): number {
  const fullCircle = Math.PI * 2;
  return ((angle % fullCircle) + fullCircle) % fullCircle;
}

function interpolate(from: Rgba, to: Rgba, amount: number): Rgba {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
    Math.round(from[3] + (to[3] - from[3]) * amount),
  ];
}

/** 把 RGBA 编码成无需运行时依赖的 PNG，供 Electron nativeImage.createFromBuffer 使用。 */
export function renderUsageTrayIconPng(remainingPercent: number | null, size = 32): Buffer {
  const rgba = renderUsageTrayIconRgba(remainingPercent, size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const rowBytes = size * 4;
  const scanlines = Buffer.alloc((rowBytes + 1) * size);
  for (let row = 0; row < size; row += 1) {
    const outputOffset = row * (rowBytes + 1);
    scanlines[outputOffset] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + row * rowBytes, rowBytes).copy(
      scanlines,
      outputOffset + 1,
    );
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: "IHDR" | "IDAT" | "IEND", data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
