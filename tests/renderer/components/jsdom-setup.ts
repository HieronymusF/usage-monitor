/**
 * React 组件测试的 jsdom 环境 setup。
 *
 * 必须在任何 @testing-library 模块前 import（命令行 --import 保证此文件最先）。
 * 注入 jsdom 的 document/window/HTMLElement 等 globals，让 RTL 的 screen 可用。
 *
 * Node v24 注意：globalThis.navigator 已是只读 getter，不强行覆盖。
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

function defineGlobal(name: string, value: unknown): void {
  try {
    (globalThis as unknown as Record<string, unknown>)[name] = value;
  } catch {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
}

// 必须在测试文件 import @testing-library 前完成
defineGlobal("window", window);
defineGlobal("document", window.document);
defineGlobal("HTMLElement", window.HTMLElement);
defineGlobal("SVGElement", window.SVGElement);
defineGlobal("Element", window.Element);
defineGlobal("Node", window.Node);
defineGlobal("getComputedStyle", window.getComputedStyle.bind(window));
defineGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(cb, 0));
defineGlobal("cancelAnimationFrame", (id: unknown) => clearTimeout(id as number));

window.matchMedia =
  window.matchMedia ||
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
