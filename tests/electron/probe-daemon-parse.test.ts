/**
 * ProbeDaemon 解析纯函数测试 — D-3 性能修复的守护进程响应解析（CI 安全）。
 *
 * 测 parseProcessName / parseGeometry（probe-daemon.ts 导出的纯函数）。
 * 覆盖五类输入（正常/null/空/非法 JSON/字段缺失/error 字段）。
 * ProbeDaemon 类本身（spawn 长驻进程）不在此测——它依赖真实 powershell.exe，
 * 靠真机/集成验证。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseProcessName, parseGeometry } from "../../electron/windows/probe-daemon";

// ─── parseProcessName（可判别结果：ok / error，P2-2）───

test("parseProcessName: 正常进程名 → ok", () => {
  assert.deepEqual(parseProcessName('{"processName":"code"}'), { kind: "ok", processName: "code" });
  assert.deepEqual(parseProcessName('{"processName":"chatgpt"}'), {
    kind: "ok",
    processName: "chatgpt",
  });
});

test("parseProcessName: null 进程名（无前台窗口）→ ok null", () => {
  assert.deepEqual(parseProcessName('{"processName":null}'), { kind: "ok", processName: null });
});

test("parseProcessName: 非法 JSON / 空串 → error", () => {
  assert.deepEqual(parseProcessName(""), { kind: "error" });
  assert.deepEqual(parseProcessName("not json"), { kind: "error" });
  assert.deepEqual(parseProcessName("{broken"), { kind: "error" });
});

test("parseProcessName: 字段缺失 / 类型错 → error", () => {
  assert.deepEqual(parseProcessName("{}"), { kind: "error" }, "无 processName 字段");
  assert.deepEqual(parseProcessName('{"processName":123}'), { kind: "error" }, "数字非字符串");
  assert.deepEqual(parseProcessName('{"processName":""}'), { kind: "error" }, "空串");
  assert.deepEqual(parseProcessName('{"other":"x"}'), { kind: "error" });
});

test("parseProcessName: error 字段 → error（探针失败）", () => {
  assert.deepEqual(parseProcessName('{"error":"boom"}'), { kind: "error" });
  assert.deepEqual(parseProcessName('{"error":"hover-unavailable"}'), { kind: "error" });
});

test("parseProcessName: 非对象 JSON → error", () => {
  assert.deepEqual(parseProcessName("[1,2]"), { kind: "error" });
  assert.deepEqual(parseProcessName('"code"'), { kind: "error" });
  assert.deepEqual(parseProcessName("42"), { kind: "error" });
});

// ─── parseGeometry ───

const VALID_GEOM =
  '{"cursorX":100,"cursorY":200,"windowLeft":10,"windowTop":20,"windowWidth":82,"windowHeight":136,"dpi":96,"primaryButtonPressed":true}';

test("parseGeometry: 正常几何", () => {
  const g = parseGeometry(VALID_GEOM);
  assert.ok(g !== null);
  assert.equal(g?.cursorX, 100);
  assert.equal(g?.cursorY, 200);
  assert.equal(g?.windowLeft, 10);
  assert.equal(g?.windowTop, 20);
  assert.equal(g?.dpi, 96);
  assert.equal(g?.primaryButtonPressed, true);
});

test("parseGeometry: error 字段 → null（降级）", () => {
  assert.equal(parseGeometry('{"error":"hover-unavailable"}'), null);
  assert.equal(parseGeometry('{"error":"boom"}'), null);
});

test("parseGeometry: 非法 JSON / 空串 → null", () => {
  assert.equal(parseGeometry(""), null);
  assert.equal(parseGeometry("nope"), null);
});

test("parseGeometry: 字段缺失 → null", () => {
  assert.equal(parseGeometry('{"cursorX":1}'), null, "缺其他字段");
  assert.equal(
    parseGeometry('{"cursorX":1,"cursorY":2,"windowLeft":3,"windowTop":4}'),
    null,
    "缺 dpi",
  );
  assert.equal(
    parseGeometry('{"cursorX":1,"cursorY":2,"windowLeft":3,"windowTop":4,"dpi":96}'),
    null,
    "缺 primaryButtonPressed",
  );
});

test("parseGeometry: 字段类型错 → null", () => {
  assert.equal(
    parseGeometry('{"cursorX":"x","cursorY":2,"windowLeft":3,"windowTop":4,"dpi":96}'),
    null,
    "cursorX 非数字",
  );
  assert.equal(
    parseGeometry('{"cursorX":1,"cursorY":2,"windowLeft":3,"windowTop":4,"dpi":"96"}'),
    null,
    "dpi 非数字",
  );
  assert.equal(
    parseGeometry(
      '{"cursorX":1,"cursorY":2,"windowLeft":3,"windowTop":4,"dpi":96,"primaryButtonPressed":1}',
    ),
    null,
    "primaryButtonPressed 非布尔值",
  );
});

test("parseGeometry: 非对象 JSON → null", () => {
  assert.equal(parseGeometry("[1,2]"), null);
  assert.equal(parseGeometry("null"), null);
});
