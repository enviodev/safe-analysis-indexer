"use client";

import { useState } from "react";

const ENVIO_TEXT = "envio ".repeat(200);

export function EnvioBorder() {
  const [hovered, setHovered] = useState(false);

  const handlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };

  const shared: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
    overflow: "hidden",
    whiteSpace: "nowrap",
    userSelect: "none",
    textDecoration: "none",
    fontFamily: "monospace",
    lineHeight: 1,
    letterSpacing: "0.05em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.4s ease",
    fontSize: "7px",
    opacity: hovered ? 0.55 : 0.26,
    color: hovered ? "#FF9056" : "var(--muted-foreground, #3a4455)",
    padding: 0,
    margin: 0,
  };

  const thickness = "16px";
  const fade = "40px";
  const hMask = `linear-gradient(to right, black, black calc(100% - ${fade}), transparent)`;
  const vMask = `linear-gradient(to bottom, black, black calc(100% - ${fade}), transparent)`;

  return (
    <div className="hidden sm:block">
      {/* Top - reads left to right */}
      <a
        href="https://envio.dev"
        target="_blank"
        rel="noopener noreferrer"
        {...handlers}
        style={{ ...shared, top: 0, left: 0, right: 0, height: thickness, maskImage: hMask, WebkitMaskImage: hMask }}
      >
        {ENVIO_TEXT}
      </a>

      {/* Bottom - rotated 180° so text reads right to left (upside down) */}
      <a
        href="https://envio.dev"
        target="_blank"
        rel="noopener noreferrer"
        {...handlers}
        style={{
          ...shared,
          bottom: 0,
          left: 0,
          right: 0,
          height: thickness,
          transform: "rotate(180deg)",
          maskImage: hMask,
          WebkitMaskImage: hMask,
        }}
      >
        {ENVIO_TEXT}
      </a>

      {/* Left - text flows bottom to top (rotated 180° from vertical-lr) */}
      <a
        href="https://envio.dev"
        target="_blank"
        rel="noopener noreferrer"
        {...handlers}
        style={{
          ...shared,
          top: thickness,
          bottom: thickness,
          left: 0,
          width: thickness,
          writingMode: "vertical-lr",
          transform: "rotate(180deg)",
          maskImage: vMask,
          WebkitMaskImage: vMask,
        }}
      >
        {ENVIO_TEXT}
      </a>

      {/* Right - text flows top to bottom (vertical-lr natural direction) */}
      <a
        href="https://envio.dev"
        target="_blank"
        rel="noopener noreferrer"
        {...handlers}
        style={{
          ...shared,
          top: thickness,
          bottom: thickness,
          right: 0,
          width: thickness,
          writingMode: "vertical-lr",
          maskImage: vMask,
          WebkitMaskImage: vMask,
        }}
      >
        {ENVIO_TEXT}
      </a>
    </div>
  );
}
