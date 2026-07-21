"use client";

import { generateAvatar } from "@/lib/avatar";

interface PixelAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

/**
 * Renders the deterministic 8x8 avatar as crisp SVG rectangles.
 */
export default function PixelAvatar({
  seed,
  size = 96,
  className = "",
}: PixelAvatarProps) {
  const { grid, color, bg } = generateAvatar(seed);
  const cells = grid.length;
  const cell = size / cells;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
    >
      <rect width={size} height={size} fill={bg} />
      {grid.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill={color}
            />
          ) : null
        )
      )}
    </svg>
  );
}
