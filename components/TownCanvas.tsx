"use client";

import { useEffect, useMemo, useRef } from "react";

export type TileType = "grass" | "path" | "water" | "field" | "home" | "tree" | "plaza";

export interface TownNpc {
  id: string;
  name: string;
  role: string;
  mood?: string;
  summary?: string;
  currentAction?: string;
  energy?: number;
  hunger?: number;
  social?: number;
  palette?: {
    body?: string;
    accent?: string;
  };
  position?: {
    x: number;
    y: number;
  };
}

export interface TownEvent {
  id: string;
  label: string;
  tone?: "good" | "neutral" | "alert";
}

export interface TownData {
  id: string;
  name: string;
  description?: string;
  timeOfDay?: string;
  weather?: string;
  seedLabel?: string;
  notes?: string[];
  activityFeed?: TownEvent[];
  map: TileType[][];
  npcs: TownNpc[];
}

interface TownCanvasProps {
  className?: string;
  tileSize?: number;
  town?: TownData | null;
}

const tilePalette: Record<TileType, string> = {
  grass: "#6cbe5f",
  path: "#c59b5d",
  water: "#4a8fe7",
  field: "#8bc34a",
  home: "#b86b48",
  tree: "#2f6f3e",
  plaza: "#d7c7a2",
};

const tileShadow: Partial<Record<TileType, string>> = {
  field: "#6d9f37",
  grass: "#4a9342",
  home: "#8f4c30",
  path: "#a87c42",
  plaza: "#bba780",
  tree: "#214d2b",
  water: "#2f65a5",
};

function drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number, tileSize: number) {
  ctx.fillStyle = "#132119";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let x = 0; x < width; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = "#f4efd8";
  ctx.font = "16px monospace";
  ctx.fillText("Awaiting town seed…", 20, height / 2);
}

function drawTile(ctx: CanvasRenderingContext2D, tile: TileType, x: number, y: number, tileSize: number) {
  const fill = tilePalette[tile] ?? tilePalette.grass;
  const shadow = tileShadow[tile] ?? "rgba(0,0,0,0.25)";

  ctx.fillStyle = fill;
  ctx.fillRect(x, y, tileSize, tileSize);

  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + tileSize - 4, tileSize, 4);

  if (tile === "water") {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 4, y + 4, tileSize - 8, 3);
  }

  if (tile === "field") {
    ctx.fillStyle = "rgba(255, 236, 179, 0.3)";
    for (let i = 0; i < tileSize; i += 6) {
      ctx.fillRect(x + i, y + 3, 2, tileSize - 8);
    }
  }

  if (tile === "home") {
    ctx.fillStyle = "#7d4632";
    ctx.fillRect(x + 3, y + 4, tileSize - 6, tileSize - 8);
    ctx.fillStyle = "#f5e3ba";
    ctx.fillRect(x + tileSize / 2 - 3, y + tileSize / 2, 6, tileSize / 2 - 4);
  }

  if (tile === "tree") {
    ctx.fillStyle = "#744c28";
    ctx.fillRect(x + tileSize / 2 - 3, y + tileSize / 2, 6, tileSize / 2 - 2);
    ctx.fillStyle = "#1f5b31";
    ctx.fillRect(x + 4, y + 3, tileSize - 8, tileSize / 2 + 2);
  }
}

function drawNpc(ctx: CanvasRenderingContext2D, npc: TownNpc, tileSize: number) {
  if (!npc.position) {
    return;
  }

  const spriteX = npc.position.x * tileSize;
  const spriteY = npc.position.y * tileSize;
  const bodyColor = npc.palette?.body ?? "#f7d66d";
  const accentColor = npc.palette?.accent ?? "#2f3b4b";

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(spriteX + 7, spriteY + tileSize - 8, tileSize - 14, 4);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(spriteX + 8, spriteY + 8, tileSize - 16, tileSize - 15);

  ctx.fillStyle = accentColor;
  ctx.fillRect(spriteX + 11, spriteY + 11, tileSize - 22, 5);
  ctx.fillRect(spriteX + 10, spriteY + tileSize - 14, tileSize - 20, 3);

  ctx.fillStyle = "#101010";
  ctx.fillRect(spriteX + 12, spriteY + 13, 2, 2);
  ctx.fillRect(spriteX + tileSize - 14, spriteY + 13, 2, 2);
}

export default function TownCanvas({ className, tileSize = 32, town }: TownCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dimensions = useMemo(() => {
    const rows = town?.map?.length || 10;
    const columns = Math.max(...(town?.map?.map((row) => row.length) || [12]));

    return {
      height: rows * tileSize,
      width: columns * tileSize,
    };
  }, [tileSize, town?.map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.imageSmoothingEnabled = false;

    if (!town?.map?.length) {
      drawPlaceholder(context, dimensions.width, dimensions.height, tileSize);
      return;
    }

    context.clearRect(0, 0, dimensions.width, dimensions.height);

    town.map.forEach((row, y) => {
      row.forEach((tile, x) => {
        drawTile(context, tile, x * tileSize, y * tileSize, tileSize);
      });
    });

    town.npcs.forEach((npc) => drawNpc(context, npc, tileSize));

    context.strokeStyle = "rgba(19, 33, 25, 0.75)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, dimensions.width - 2, dimensions.height - 2);
  }, [dimensions.height, dimensions.width, tileSize, town]);

  return (
    <canvas
      aria-label={town ? `${town.name} village map` : "Village map placeholder"}
      className={className}
      height={dimensions.height}
      ref={canvasRef}
      width={dimensions.width}
    />
  );
}
