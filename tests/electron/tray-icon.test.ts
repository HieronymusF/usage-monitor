/** 多分辨率 Windows ICO 资源结构验证（Milestone H 切片 2）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const iconPath = resolve("resources/usage-monitor.ico");

test("正式托盘图标是包含 16–256px 的多分辨率 ICO", async () => {
  const data = await readFile(iconPath);
  assert.equal(data.readUInt16LE(0), 0, "ICO reserved 字段");
  assert.equal(data.readUInt16LE(2), 1, "ICO type=1");
  const count = data.readUInt16LE(4);
  assert.ok(count >= 8, `应含至少 8 个尺寸，实际 ${count}`);

  const sizes = new Set<number>();
  for (let index = 0; index < count; index++) {
    const offset = 6 + index * 16;
    const widthByte = data.readUInt8(offset);
    const heightByte = data.readUInt8(offset + 1);
    const width = widthByte === 0 ? 256 : widthByte;
    const height = heightByte === 0 ? 256 : heightByte;
    assert.equal(width, height, `entry ${index} 应为正方形`);
    sizes.add(width);
  }

  for (const required of [16, 20, 24, 32, 40, 48, 64, 128, 256]) {
    assert.ok(sizes.has(required), `ICO 缺少 ${required}x${required}`);
  }
});

test("electron-builder 同一图标用于 exe，并复制到打包态 resources 供托盘读取", async () => {
  const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
    build?: {
      win?: { icon?: string };
      extraResources?: Array<{ from?: string; to?: string }>;
    };
  };
  assert.equal(packageJson.build?.win?.icon, "resources/usage-monitor.ico");
  assert.ok(
    packageJson.build?.extraResources?.some(
      (item) => item.from === "resources/usage-monitor.ico" && item.to === "usage-monitor.ico",
    ),
    "正式 ICO 必须复制到 resources/usage-monitor.ico",
  );
});
