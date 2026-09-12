export const WORLD_ORIGIN = 10000;

export const clampViewport = (viewport = {}) => {
  const panX = typeof viewport.panX === "number" && Number.isFinite(viewport.panX) ? viewport.panX : 0;
  const panY = typeof viewport.panY === "number" && Number.isFinite(viewport.panY) ? viewport.panY : 0;
  const zoom = typeof viewport.zoom === "number" && Number.isFinite(viewport.zoom) ? viewport.zoom : 1;

  return {
    panX: Math.min(Math.max(panX, -12000), 12000),
    panY: Math.min(Math.max(panY, -12000), 12000),
    zoom: Math.min(Math.max(zoom, 0.15), 3.5)
  };
};

export const screenToWorld = ({
  x,
  y,
  canvasWidth,
  canvasHeight,
  panX,
  panY,
  zoom
}) => ({
  x: WORLD_ORIGIN + (x - canvasWidth / 2 - panX) / zoom,
  y: WORLD_ORIGIN + (y - canvasHeight / 2 - panY) / zoom
});

export const worldToScreen = ({
  x,
  y,
  canvasWidth,
  canvasHeight,
  panX,
  panY,
  zoom
}) => ({
  x: canvasWidth / 2 + panX + (x - WORLD_ORIGIN) * zoom,
  y: canvasHeight / 2 + panY + (y - WORLD_ORIGIN) * zoom
});
