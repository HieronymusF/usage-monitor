/**
 * validateSurfaceKind 测试 — showSurface IPC payload 运行时校验（item 3）。
 *
 * 校验 shared/desktop.ts 的 validateSurfaceKind：
 * - 合法 surfaceKinds 值（card/indicator-bar/orb/edge-capsule）→ 返回原值
 * - 非法值（字符串但不在白名单、数字、undefined、null、对象）→ 返回 null
 *
 * 这覆盖 showSurface IPC handler 的运行时校验：非法 payload 被忽略，不传给 showOnly。
 * ipc.ts 的 .catch() 覆盖 showOnly rejection（结构保证，不在此测试 main 进程）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateSurfaceKind, surfaceKinds } from "../../shared/desktop";

test("validateSurfaceKind: 合法 surface 值通过", () => {
  for (const kind of surfaceKinds) {
    assert.equal(validateSurfaceKind(kind), kind, `${kind} 应通过`);
  }
});

test("validateSurfaceKind: 非法字符串返回 null", () => {
  assert.equal(validateSurfaceKind("bad"), null);
  assert.equal(validateSurfaceKind("Card"), null, "大小写敏感");
  assert.equal(validateSurfaceKind("orb "), null, "含空格");
  assert.equal(validateSurfaceKind(""), null, "空串");
  assert.equal(validateSurfaceKind("window"), null);
});

test("validateSurfaceKind: 非字符串类型返回 null", () => {
  assert.equal(validateSurfaceKind(123), null, "数字");
  assert.equal(validateSurfaceKind(undefined), null, "undefined");
  assert.equal(validateSurfaceKind(null), null, "null");
  assert.equal(validateSurfaceKind({ kind: "orb" }), null, "对象");
  assert.equal(validateSurfaceKind(["orb"]), null, "数组");
  assert.equal(validateSurfaceKind(true), null, "布尔");
});
