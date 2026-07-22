/**
 * App — 根据 URL ?surface= 决定渲染哪个 surface 组件。
 * 单一 renderer bundle，多 surface 共用。默认 card。
 */
import React from "react";
import { CodexCard } from "./components/card/CodexCard";
import { IndicatorBar } from "./components/bar/IndicatorBar";
import { Orb } from "./components/orb/Orb";
import { EdgeCapsule } from "./components/capsule/EdgeCapsule";

function readSurface(): string {
  if (typeof window === "undefined") return "card";
  return new URLSearchParams(window.location.search).get("surface") ?? "card";
}

export function App(): React.ReactElement {
  const surface = readSurface();
  return (
    <main
      style={
        {
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "transparent",
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    >
      {surface === "indicator-bar" ? (
        <IndicatorBar />
      ) : surface === "orb" ? (
        <Orb />
      ) : surface === "edge-capsule" ? (
        <EdgeCapsule />
      ) : (
        <CodexCard />
      )}
    </main>
  );
}
