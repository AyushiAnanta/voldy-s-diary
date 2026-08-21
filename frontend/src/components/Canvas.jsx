import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { evaluateMathExpression } from "../utils/mathParser.js";

const THEME_COLORS = {
  arcane: {
    paper: "#f5ebe0",
    ink: "#2e231d",
    grid: "rgba(214, 204, 194, 0.45)",
    accent: "#bfa08f"
  },
  studio: {
    paper: "#110d1f",
    ink: "#dec0f1",
    grid: "rgba(222, 192, 241, 0.12)",
    accent: "#7161ef"
  }
};

const Canvas = forwardRef(({
  activeTool,
  theme,
  onDrawFinished,
  onViewportChange,
  drafts,
  isLocked,
  currentStyle,
  onSelectionChange,
  onToolAutoRevert
}, ref) => {
  const canvasRef = useRef(null);

  const stateRef = useRef({
    isDrawing: false,
    isPanning: false,
    isDraggingElement: false,
    isResizing: false,
    isRotating: false,
    activeHandle: null,
    dragStartPos: { x: 0, y: 0 },
    strokes: [],
    selectedIds: [],
    currentStroke: [],
    currentShape: null,
    lastPointerPos: { x: 0, y: 0 },
    lastAiTriggerTime: 0,
    hasLasso: false,
    lassoBounds: null,
    selectionBox: null,
    clipboardStyle: null,
    panX: 0,
    panY: 0,
    zoom: 1.0
  });

  const onViewportChangeRef = useRef(onViewportChange);
  const onDrawFinishedRef = useRef(onDrawFinished);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);
  useEffect(() => { onDrawFinishedRef.current = onDrawFinished; }, [onDrawFinished]);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);

  useEffect(() => { drawCanvas(); }, [drafts, theme]);

  useImperativeHandle(ref, () => ({
    clearCanvas: () => {
      stateRef.current.strokes = [];
      stateRef.current.currentStroke = [];
      stateRef.current.selectedIds = [];
      if (onSelectionChangeRef.current) onSelectionChangeRef.current([]);
      drawCanvas();
    },

    getCanvasState: () => {
      const { strokes, panX, panY, zoom } = stateRef.current;
      return { strokes, viewport: { panX, panY, zoom } };
    },

    recenterViewport: () => {
      stateRef.current.panX = 0;
      stateRef.current.panY = 0;
      stateRef.current.zoom = 1.0;
      drawCanvas();
      if (onViewportChangeRef.current) {
        onViewportChangeRef.current({ panX: 0, panY: 0, zoom: 1.0 });
      }
    },

    loadCanvasState: (savedStrokes, savedViewport) => {
      if (Array.isArray(savedStrokes)) {
        stateRef.current.strokes = savedStrokes.filter(s => s.elementType !== "text");
      }
      if (savedViewport) {
        const MAX_PAN = 12000;
        const panX = typeof savedViewport.panX === "number" && Number.isFinite(savedViewport.panX) ? savedViewport.panX : 0;
        const panY = typeof savedViewport.panY === "number" && Number.isFinite(savedViewport.panY) ? savedViewport.panY : 0;
        const zoom = typeof savedViewport.zoom === "number" && Number.isFinite(savedViewport.zoom) ? savedViewport.zoom : 1.0;

        stateRef.current.panX = Math.min(Math.max(panX, -MAX_PAN), MAX_PAN);
        stateRef.current.panY = Math.min(Math.max(panY, -MAX_PAN), MAX_PAN);
        stateRef.current.zoom = Math.min(Math.max(zoom, 0.15), 3.5);
        if (onViewportChangeRef.current) {
          onViewportChangeRef.current({ panX: stateRef.current.panX, panY: stateRef.current.panY, zoom: stateRef.current.zoom });
        }
      }
      drawCanvas();
    },

    isDrawingActive: () => {
      return stateRef.current.isDrawing || stateRef.current.isPanning;
    },

    captureCrop: () => {
      const state = stateRef.current;
      const allStrokes = state.strokes;
      if (!allStrokes || allStrokes.length === 0) return null;

      let targetStrokes = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      if (state.hasLasso && state.lassoBounds) {
        minX = state.lassoBounds.minX;
        minY = state.lassoBounds.minY;
        maxX = state.lassoBounds.maxX;
        maxY = state.lassoBounds.maxY;

        targetStrokes = allStrokes.filter(stroke => {
          return (stroke.points || []).some(pt => 
            pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY
          );
        });

        if (targetStrokes.length === 0) targetStrokes = allStrokes.slice(-3);
        state.hasLasso = false;
        state.lassoBounds = null;
      } else {
        targetStrokes = allStrokes.filter(s => s.timestamp > state.lastAiTriggerTime);
        if (targetStrokes.length === 0) {
          targetStrokes = allStrokes.slice(-3);
        }

        targetStrokes.forEach(stroke => {
          if (stroke.points && stroke.points.length > 0) {
            stroke.points.forEach(pt => {
              if (pt.x < minX) minX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y > maxY) maxY = pt.y;
            });
          } else if (stroke.x !== undefined) {
            const w = stroke.width || 100;
            const h = stroke.height || 100;
            if (stroke.x < minX) minX = stroke.x;
            if (stroke.y < minY) minY = stroke.y;
            if (stroke.x + w > maxX) maxX = stroke.x + w;
            if (stroke.y + h > maxY) maxY = stroke.y + h;
          }
        });
      }

      state.lastAiTriggerTime = Date.now();

      if (minX === Infinity || minY === Infinity) return null;

      const padding = 64;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const cropWidth = maxX - minX;
      const cropHeight = maxY - minY;

      if (cropWidth <= 0 || cropHeight <= 0) return null;

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.min(cropWidth, 2048);
      offscreen.height = Math.min(cropHeight, 1536);
      const oCtx = offscreen.getContext("2d");

      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const paperColor = activeColors.paper;
      oCtx.fillStyle = paperColor;
      oCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      oCtx.save();
      const scaleX = offscreen.width / cropWidth;
      const scaleY = offscreen.height / cropHeight;
      const scale = Math.min(scaleX, scaleY, 1.0);
      oCtx.scale(scale, scale);
      oCtx.translate(-minX, -minY);

      renderStrokesArray(oCtx, targetStrokes, activeColors.ink, paperColor);

      oCtx.restore();

      return {
        image: offscreen.toDataURL("image/png"),
        cropX: minX,
        cropY: minY,
        cropWidth,
        cropHeight
      };
    },

    bakeDrawCommand: (cmd) => {
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const inkColor = activeColors.ink;
      const newStrokes = convertDrawCommandToStrokes(cmd, inkColor);
      stateRef.current.strokes.push(...newStrokes);
      drawCanvas();
    },

    bakePlotCommand: (cmd) => {
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const inkColor = activeColors.ink;
      const newStrokes = convertPlotCommandToStrokes(cmd, inkColor);
      stateRef.current.strokes.push(...newStrokes);
      drawCanvas();
    },

    handleOverflowAction: (action) => {
      const state = stateRef.current;
      const selected = state.strokes.filter(s => state.selectedIds.includes(s.id));
      if (selected.length === 0) return;

      if (action === "duplicate") {
        const newEls = selected.map(el => ({
          ...JSON.parse(JSON.stringify(el)),
          id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          x: (el.x || 0) + 20,
          y: (el.y || 0) + 20,
          points: (el.points || []).map(p => ({ x: p.x + 20, y: p.y + 20 }))
        }));
        state.strokes.push(...newEls);
        state.selectedIds = newEls.map(e => e.id);
      } else if (action === "cut") {
        state.clipboardStyle = JSON.parse(JSON.stringify(selected));
        state.strokes = state.strokes.filter(s => !state.selectedIds.includes(s.id));
        state.selectedIds = [];
      } else if (action === "delete") {
        state.strokes = state.strokes.filter(s => !state.selectedIds.includes(s.id));
        state.selectedIds = [];
      }

      if (onSelectionChangeRef.current) onSelectionChangeRef.current(state.strokes.filter(s => state.selectedIds.includes(s.id)));
      drawCanvas();
      if (onDrawFinishedRef.current) onDrawFinishedRef.current();
    },

    updateSelectedStyle: (styleDiff) => {
      const state = stateRef.current;
      const selected = state.strokes.filter(s => state.selectedIds.includes(s.id));
      if (selected.length > 0) {
        selected.forEach(el => {
          Object.assign(el, styleDiff);
        });
        drawCanvas();
        if (onDrawFinishedRef.current) onDrawFinishedRef.current();
      }
    }
  }));

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const state = stateRef.current;

    // Reset transform matrix to identity & clear viewport completely to prevent smearing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
    const paperColor = activeColors.paper;
    const inkColor = activeColors.ink;
    const gridColor = activeColors.grid;
    const accentColor = activeColors.accent;

    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2 + state.panX, canvas.height / 2 + state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-10000, -10000);

    if (state.zoom >= 0.22) {
      const rawVisLeft  = -(canvas.width / 2 + state.panX) / state.zoom + 10000;
      const rawVisTop   = -(canvas.height / 2 + state.panY) / state.zoom + 10000;
      const rawVisRight = (canvas.width / 2 - state.panX) / state.zoom + 10000;
      const rawVisBottom = (canvas.height / 2 - state.panY) / state.zoom + 10000;

      const visLeft  = Math.max(0, Math.min(20000, rawVisLeft));
      const visTop   = Math.max(0, Math.min(20000, rawVisTop));
      const visRight = Math.max(0, Math.min(20000, rawVisRight));
      const visBottom = Math.max(0, Math.min(20000, rawVisBottom));

      const spacing = state.zoom < 0.65 ? 90 : 30;
      const startX = Math.floor(visLeft / spacing) * spacing;
      const startY = Math.floor(visTop / spacing) * spacing;

      ctx.fillStyle = gridColor;
      const dotRadius = 1.2;
      for (let gx = startX; gx <= visRight; gx += spacing) {
        for (let gy = startY; gy <= visBottom; gy += spacing) {
          ctx.beginPath();
          ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    renderStrokesArray(ctx, state.strokes, inkColor, paperColor);

    // Render active drawing shape preview
    if (state.isDrawing && state.currentShape) {
      renderSingleElement(ctx, state.currentShape, inkColor, paperColor);
    }

    // Render active freehand stroke preview
    if (state.isDrawing && state.currentStroke.length > 0 && activeTool === "pen") {
      const pts = state.currentStroke;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.lineWidth = currentStyle?.strokeWidth || 3;
      ctx.strokeStyle = currentStyle?.strokeColor || inkColor;
      ctx.stroke();
    }

    // Render active Selection Marquee Box
    if (state.selectionBox) {
      const { startX, startY, endX, endY } = state.selectionBox;
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = accentColor;
      ctx.fillStyle = "rgba(113, 97, 239, 0.08)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // Render Selection Handles for selected element(s)
    if (state.selectedIds.length > 0) {
      renderSelectionBoundingBox(ctx, state.strokes.filter(s => state.selectedIds.includes(s.id)), accentColor);
    }

    // Render Live Eraser Brush Cursor Circle Overlay
    if (activeTool === "eraser" && state.lastPointerPos && state.lastPointerPos.x !== undefined) {
      const eSize = currentStyle?.eraserSize || 24;
      const radius = eSize / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(state.lastPointerPos.x, state.lastPointerPos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(113, 97, 239, 0.2)";
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || window.innerWidth;
      canvas.height = rect.height || window.innerHeight;
      drawCanvas();
    };

    // Execute handleResize immediately on mount to sync 300x150 buffer size with actual DOM dimensions
    handleResize();

    const toGlobalCoords = (clientX, clientY) => {
      const state = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width ? canvas.width / rect.width : 1;
      const scaleY = rect.height ? canvas.height / rect.height : 1;

      const canvasX = (clientX - rect.left) * scaleX;
      const canvasY = (clientY - rect.top) * scaleY;

      const mx = canvasX - canvas.width / 2;
      const my = canvasY - canvas.height / 2;

      const x = (mx - state.panX) / state.zoom + 10000;
      const y = (my - state.panY) / state.zoom + 10000;
      return { x, y };
    };

    const handlePointerDown = (e) => {
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }

      const state = stateRef.current;
      const globalPos = toGlobalCoords(e.clientX, e.clientY);

      if (e.button === 0 && activeTool === "hand") {
        state.isPanning = true;
        state.lastPointerPos = { x: e.clientX, y: e.clientY };
        return;
      }

      if (e.button === 0 && activeTool === "select") {
        // Check handle hits if selection active
        const selected = state.strokes.filter(s => state.selectedIds.includes(s.id));
        if (selected.length > 0) {
          const bbox = getBoundingBox(selected);
          const handle = hitTestHandles(globalPos, bbox);
          if (handle) {
            if (handle === "rotate") {
              state.isRotating = true;
            } else {
              state.isResizing = true;
              state.activeHandle = handle;
            }
            state.dragStartPos = globalPos;
            return;
          }
        }

        // Hit test shapes
        const hit = state.strokes.slice().reverse().find(s => isPointInElement(globalPos, s));
        if (hit) {
          if (e.shiftKey) {
            state.selectedIds = state.selectedIds.includes(hit.id)
              ? state.selectedIds.filter(id => id !== hit.id)
              : [...state.selectedIds, hit.id];
          } else {
            state.selectedIds = [hit.id];
          }
          state.isDraggingElement = true;
          state.dragStartPos = globalPos;
        } else {
          // Clear selection or start rubberband marquee
          state.selectedIds = [];
          state.selectionBox = { startX: globalPos.x, startY: globalPos.y, endX: globalPos.x, endY: globalPos.y };
        }

        if (onSelectionChangeRef.current) onSelectionChangeRef.current(state.strokes.filter(s => state.selectedIds.includes(s.id)));
        drawCanvas();
        return;
      }

      // Dedicated Eraser Tool handling: Partial segment trimming & point splitting
      if (e.button === 0 && activeTool === "eraser") {
        state.isDrawing = true;
        state.selectedIds = [];
        state.selectionBox = null;
        state.lastPointerPos = globalPos;
        const eSize = currentStyle?.eraserSize || 24;
        const radius = eSize / 2;

        let nextStrokes = [];
        let changed = false;
        state.strokes.forEach(el => {
          const res = eraseElementPartial(el, globalPos, radius);
          if (res.length !== 1 || res[0] !== el) changed = true;
          nextStrokes.push(...res);
        });

        if (changed) {
          state.strokes = nextStrokes;
          if (onDrawFinishedRef.current) onDrawFinishedRef.current();
        }
        drawCanvas();
        return;
      }

      // Drawing tools
      if (e.button === 0 && ["rect", "diamond", "ellipse", "arrow", "line", "pen"].includes(activeTool)) {
        state.isDrawing = true;
        state.dragStartPos = globalPos;

        if (activeTool === "pen") {
          state.currentStroke = [globalPos];
        } else {
          state.currentShape = {
            id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            elementType: activeTool,
            x: globalPos.x,
            y: globalPos.y,
            width: 1,
            height: 1,
            strokeColor: currentStyle.strokeColor || "#2e231d",
            backgroundColor: currentStyle.backgroundColor || "transparent",
            strokeWidth: currentStyle.strokeWidth || 3,
            strokeStyle: currentStyle.strokeStyle || "solid",
            opacity: currentStyle.opacity !== undefined ? currentStyle.opacity : 100
          };
        }
      }
    };

    const handlePointerMove = (e) => {
      const state = stateRef.current;
      const globalPos = toGlobalCoords(e.clientX, e.clientY);

      if (state.isPanning) {
        const dx = e.clientX - state.lastPointerPos.x;
        const dy = e.clientY - state.lastPointerPos.y;
        const MAX_PAN = 12000;
        state.panX = Math.min(Math.max(state.panX + dx, -MAX_PAN), MAX_PAN);
        state.panY = Math.min(Math.max(state.panY + dy, -MAX_PAN), MAX_PAN);
        state.lastPointerPos = { x: e.clientX, y: e.clientY };
        drawCanvas();
        if (onViewportChangeRef.current) {
          onViewportChangeRef.current({ panX: state.panX, panY: state.panY, zoom: state.zoom });
        }
        return;
      }

      if (state.selectionBox) {
        state.selectionBox.endX = globalPos.x;
        state.selectionBox.endY = globalPos.y;
        drawCanvas();
        return;
      }

      if (state.isDraggingElement && state.selectedIds.length > 0) {
        const dx = globalPos.x - state.dragStartPos.x;
        const dy = globalPos.y - state.dragStartPos.y;
        state.dragStartPos = globalPos;

        state.strokes.forEach(el => {
          if (state.selectedIds.includes(el.id)) {
            if (el.points) {
              el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            }
            if (el.x !== undefined) el.x += dx;
            if (el.y !== undefined) el.y += dy;
          }
        });
        drawCanvas();
        return;
      }

      if (activeTool === "eraser") {
        state.lastPointerPos = globalPos;
        if (state.isDrawing) {
          const eSize = currentStyle?.eraserSize || 24;
          const radius = eSize / 2;

          let nextStrokes = [];
          let changed = false;
          state.strokes.forEach(el => {
            const res = eraseElementPartial(el, globalPos, radius);
            if (res.length !== 1 || res[0] !== el) changed = true;
            nextStrokes.push(...res);
          });

          if (changed) {
            state.strokes = nextStrokes;
            if (onDrawFinishedRef.current) onDrawFinishedRef.current();
          }
        }
        drawCanvas();
        return;
      }

      if (state.isDrawing) {
        if (activeTool === "pen") {
          state.currentStroke.push(globalPos);
          drawCanvas();
        } else if (state.currentShape) {
          let w = globalPos.x - state.dragStartPos.x;
          let h = globalPos.y - state.dragStartPos.y;

          if (e.shiftKey) {
            const side = Math.max(Math.abs(w), Math.abs(h));
            w = w < 0 ? -side : side;
            h = h < 0 ? -side : side;
          }

          state.currentShape.width = w;
          state.currentShape.height = h;

          // Arrow Snap to nearby shapes
          if (activeTool === "arrow" || activeTool === "line") {
            const snap = findNearestShapeBound(globalPos, state.strokes);
            if (snap) {
              state.currentShape.boundEndId = snap.shapeId;
            }
          }
          drawCanvas();
        }
      }
    };

    const handlePointerUp = (e) => {
      if (canvas.releasePointerCapture && e) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }

      const state = stateRef.current;

      if (state.selectionBox) {
        const { startX, startY, endX, endY } = state.selectionBox;
        const box = {
          minX: Math.min(startX, endX),
          minY: Math.min(startY, endY),
          maxX: Math.max(startX, endX),
          maxY: Math.max(startY, endY)
        };

        state.selectedIds = state.strokes
          .filter(s => isElementInBox(s, box))
          .map(s => s.id);

        state.selectionBox = null;
        if (onSelectionChangeRef.current) onSelectionChangeRef.current(state.strokes.filter(s => state.selectedIds.includes(s.id)));
        drawCanvas();
        return;
      }

      if (state.isDrawing) {
        state.isDrawing = false;
        if (activeTool === "pen") {
          if (state.currentStroke.length > 1) {
            const smoothedPoints = simplifyStrokePoints(state.currentStroke);
            state.strokes.push({
              id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              elementType: activeTool,
              points: smoothedPoints,
              strokeWidth: currentStyle?.strokeWidth || 3,
              strokeColor: currentStyle?.strokeColor || null,
              strokeStyle: currentStyle?.strokeStyle || "solid",
              opacity: currentStyle?.opacity !== undefined ? currentStyle.opacity : 100,
              timestamp: Date.now()
            });
          }
        } else if (state.currentShape) {
          state.strokes.push(state.currentShape);
          state.currentShape = null;
        }

        state.currentStroke = [];
        drawCanvas();
        if (onDrawFinishedRef.current) onDrawFinishedRef.current();

        if (!isLocked && onToolAutoRevert && activeTool !== "eraser") {
          onToolAutoRevert();
        }
      }

      state.isPanning = false;
      state.isDraggingElement = false;
      state.isResizing = false;
      state.isRotating = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const state = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;

      const oldZoom = state.zoom;
      const zoomFactor = 1.08;
      const newZoom = Math.min(Math.max(e.deltaY < 0 ? oldZoom * zoomFactor : oldZoom / zoomFactor, 0.15), 3.5);
      const zoomRatio = newZoom / oldZoom;

      const nextPanX = mx - (mx - state.panX) * zoomRatio;
      const nextPanY = my - (my - state.panY) * zoomRatio;
      const MAX_PAN = 12000;
      state.panX = Math.min(Math.max(nextPanX, -MAX_PAN), MAX_PAN);
      state.panY = Math.min(Math.max(nextPanY, -MAX_PAN), MAX_PAN);
      state.zoom = newZoom;

      drawCanvas();
      if (onViewportChangeRef.current) {
        onViewportChangeRef.current({ panX: state.panX, panY: state.panY, zoom: state.zoom });
      }
    };

    const handleContextMenu = (e) => e.preventDefault();

    const resizeObserver = new ResizeObserver(() => handleResize());
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    resizeObserver.observe(canvas);

    window.addEventListener("resize", handleResize);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeTool, theme, isLocked, currentStyle, onToolAutoRevert]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        touchAction: "none"
      }}
    />
  );
});

export default Canvas;

// Render subroutine for all elements
const renderStrokesArray = (ctx, strokes, inkColor, paperColor) => {
  strokes.forEach(el => renderSingleElement(ctx, el, inkColor, paperColor));
};

const renderSingleElement = (ctx, el, inkColor, paperColor) => {
  ctx.save();

  if (el.opacity !== undefined) {
    ctx.globalAlpha = el.opacity / 100;
  }

  const isDefaultThemeInk = !el.isCustomColor || el.strokeColor === null || el.strokeColor === "#2e231d" || el.strokeColor === "#dec0f1";
  const sColor = isDefaultThemeInk ? inkColor : el.strokeColor;
  const bgColor = el.backgroundColor || "transparent";
  const w = el.width || 0;
  const h = el.height || 0;
  const x = el.x || 0;
  const y = el.y || 0;

  ctx.lineWidth = el.strokeWidth || 3;
  ctx.strokeStyle = el.elementType === "eraser" ? paperColor : sColor;
  ctx.fillStyle = bgColor;

  if (el.elementType === "rect") {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    if (bgColor !== "transparent") ctx.fill();
    ctx.stroke();
  } else if (el.elementType === "diamond") {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    if (bgColor !== "transparent") ctx.fill();
    ctx.stroke();
  } else if (el.elementType === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    if (bgColor !== "transparent") ctx.fill();
    ctx.stroke();
  } else if (el.elementType === "line") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  } else if (el.elementType === "arrow") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    const angle = Math.atan2(h, w);
    const endX = x + w;
    const endY = y + h;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 12 * Math.cos(angle - Math.PI / 6), endY - 12 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - 12 * Math.cos(angle + Math.PI / 6), endY - 12 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = sColor;
    ctx.fill();
  } else {
    // Freehand pen stroke with Option A pressure tapering
    const pts = el.points;
    if (pts && pts.length >= 2) {
      if (el.strokeStyle === "pressure") {
        for (let i = 0; i < pts.length - 1; i++) {
          const pt1 = pts[i];
          const pt2 = pts[i + 1];
          const dist = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
          const dynamicWidth = Math.max(1, (el.strokeWidth || 3) * Math.min(2, 5 / (dist + 1)));
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.lineWidth = dynamicWidth;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }
    }
  }

  ctx.restore();
};

const renderSelectionBoundingBox = (ctx, elements, accentColor) => {
  if (!elements || elements.length === 0) return;
  const bbox = getBoundingBox(elements);
  const { minX, minY, maxX, maxY } = bbox;

  ctx.save();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX - 4, minY - 4, maxX - minX + 8, maxY - minY + 8);
  ctx.setLineDash([]);

  // 8 Handles + Rotate handle
  const handles = [
    { x: minX - 4, y: minY - 4 }, // nw
    { x: (minX + maxX) / 2, y: minY - 4 }, // n
    { x: maxX + 4, y: minY - 4 }, // ne
    { x: maxX + 4, y: (minY + maxY) / 2 }, // e
    { x: maxX + 4, y: maxY + 4 }, // se
    { x: (minX + maxX) / 2, y: maxY + 4 }, // s
    { x: minX - 4, y: maxY + 4 }, // sw
    { x: minX - 4, y: (minY + maxY) / 2 } // w
  ];

  ctx.fillStyle = "#ffffff";
  handles.forEach(h => {
    ctx.beginPath();
    ctx.rect(h.x - 4, h.y - 4, 8, 8);
    ctx.fill();
    ctx.stroke();
  });

  // Rotation Handle
  const rotX = (minX + maxX) / 2;
  const rotY = minY - 20;
  ctx.beginPath();
  ctx.moveTo(rotX, minY - 4);
  ctx.lineTo(rotX, rotY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rotX, rotY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
};

const getBoundingBox = (elements) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  elements.forEach(el => {
    if (el.points && el.points.length > 0) {
      el.points.forEach(pt => {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      });
    } else {
      const x = el.x || 0;
      const y = el.y || 0;
      const w = el.width || 0;
      const h = el.height || 0;
      const ex = x + w;
      const ey = y + h;
      if (Math.min(x, ex) < minX) minX = Math.min(x, ex);
      if (Math.min(y, ey) < minY) minY = Math.min(y, ey);
      if (Math.max(x, ex) > maxX) maxX = Math.max(x, ex);
      if (Math.max(y, ey) > maxY) maxY = Math.max(y, ey);
    }
  });
  return { minX, minY, maxX, maxY };
};

const hitTestHandles = (pos, bbox) => {
  const { minX, minY, maxX, maxY } = bbox;
  const handles = {
    nw: { x: minX - 4, y: minY - 4 },
    n: { x: (minX + maxX) / 2, y: minY - 4 },
    ne: { x: maxX + 4, y: minY - 4 },
    e: { x: maxX + 4, y: (minY + maxY) / 2 },
    se: { x: maxX + 4, y: maxY + 4 },
    s: { x: (minX + maxX) / 2, y: maxY + 4 },
    sw: { x: minX - 4, y: maxY + 4 },
    w: { x: minX - 4, y: (minY + maxY) / 2 },
    rotate: { x: (minX + maxX) / 2, y: minY - 20 }
  };

  for (const [key, h] of Object.entries(handles)) {
    if (Math.hypot(pos.x - h.x, pos.y - h.y) <= 8) return key;
  }
  return null;
};

const isPointInElement = (pos, el) => {
  return isElementIntersectingPoint(el, pos, 10);
};

const isElementIntersectingPoint = (el, pos, radius = 16) => {
  if (el.points && el.points.length > 0) {
    return el.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) <= radius + (el.strokeWidth || 3) / 2);
  }
  const x1 = Math.min(el.x, el.x + (el.width || 0));
  const x2 = Math.max(el.x, el.x + (el.width || 0));
  const y1 = Math.min(el.y, el.y + (el.height || 0));
  const y2 = Math.max(el.y, el.y + (el.height || 0));

  return pos.x >= x1 - radius && pos.x <= x2 + radius && pos.y >= y1 - radius && pos.y <= y2 + radius;
};

const eraseElementPartial = (el, pos, radius) => {
  // Freehand stroke: split point array around eraser circle into continuous sub-strokes
  if (el.points && el.points.length > 0) {
    const pts = el.points;
    const subStrokes = [];
    let currentSub = [];

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const dist = Math.hypot(pt.x - pos.x, pt.y - pos.y);
      if (dist > radius) {
        currentSub.push(pt);
      } else {
        if (currentSub.length >= 2) {
          subStrokes.push({
            ...el,
            id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${subStrokes.length}`,
            points: currentSub
          });
        }
        currentSub = [];
      }
    }
    if (currentSub.length >= 2) {
      subStrokes.push({
        ...el,
        id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${subStrokes.length}`,
        points: currentSub
      });
    }

    return subStrokes;
  }

  // Geometric shapes/lines: convert perimeter to polyline points on contact and trim touched segments
  if (isElementIntersectingPoint(el, pos, radius)) {
    const x = el.x || 0;
    const y = el.y || 0;
    const w = el.width || 0;
    const h = el.height || 0;

    let polyPoints = [];
    if (el.elementType === "rect") {
      const STEPS = 30;
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: x + (w * i) / STEPS, y });
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: x + w, y: y + (h * i) / STEPS });
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: x + w - (w * i) / STEPS, y: y + h });
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x, y: y + h - (h * i) / STEPS });
    } else if (el.elementType === "line" || el.elementType === "arrow") {
      const STEPS = 40;
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: x + (w * i) / STEPS, y: y + (h * i) / STEPS });
    } else if (el.elementType === "ellipse") {
      const STEPS = 60;
      const cx = x + w / 2, cy = y + h / 2, rx = Math.abs(w / 2), ry = Math.abs(h / 2);
      for (let i = 0; i <= STEPS; i++) {
        const a = (i / STEPS) * Math.PI * 2;
        polyPoints.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
      }
    } else if (el.elementType === "diamond") {
      const STEPS = 20;
      const cx = x + w / 2, cy = y + h / 2;
      const pTop = { x: cx, y }, pRight = { x: x + w, y: cy }, pBottom = { x: cx, y: y + h }, pLeft = { x, y: cy };
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: pTop.x + ((pRight.x - pTop.x) * i) / STEPS, y: pTop.y + ((pRight.y - pTop.y) * i) / STEPS });
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: pRight.x + ((pBottom.x - pRight.x) * i) / STEPS, y: pRight.y + ((pBottom.y - pRight.y) * i) / STEPS });
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: pBottom.x + ((pLeft.x - pBottom.x) * i) / STEPS, y: pBottom.y + ((pLeft.y - pBottom.y) * i) / STEPS });
      for (let i = 0; i <= STEPS; i++) polyPoints.push({ x: pLeft.x + ((pTop.x - pLeft.x) * i) / STEPS, y: pLeft.y + ((pTop.y - pLeft.y) * i) / STEPS });
    }

    if (polyPoints.length > 0) {
      const convertedElement = {
        ...el,
        elementType: "pen",
        points: polyPoints
      };
      return eraseElementPartial(convertedElement, pos, radius);
    }
  }

  return [el];
};

const isElementInBox = (el, box) => {
  if (el.points && el.points.length > 0) {
    return el.points.some(p => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY);
  }
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  return x >= box.minX && x + Math.abs(el.width) <= box.maxX && y >= box.minY && y + Math.abs(el.height) <= box.maxY;
};

const findNearestShapeBound = (pos, elements) => {
  const SNAP_DIST = 20;
  for (const el of elements) {
    if (!["rect", "diamond", "ellipse"].includes(el.elementType)) continue;

    const x = el.x || 0;
    const y = el.y || 0;
    const w = el.width || 0;
    const h = el.height || 0;

    let edgeX = pos.x;
    let edgeY = pos.y;

    if (el.elementType === "rect") {
      edgeX = Math.max(x, Math.min(pos.x, x + w));
      edgeY = Math.max(y, Math.min(pos.y, y + h));

      if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
        const dLeft = pos.x - x;
        const dRight = (x + w) - pos.x;
        const dTop = pos.y - y;
        const dBottom = (y + h) - pos.y;
        const minD = Math.min(dLeft, dRight, dTop, dBottom);
        if (minD === dLeft) edgeX = x;
        else if (minD === dRight) edgeX = x + w;
        else if (minD === dTop) edgeY = y;
        else edgeY = y + h;
      }
    } else if (el.elementType === "ellipse") {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = Math.abs(w / 2);
      const ry = Math.abs(h / 2);
      const angle = Math.atan2(pos.y - cy, pos.x - cx);
      edgeX = cx + rx * Math.cos(angle);
      edgeY = cy + ry * Math.sin(angle);
    } else if (el.elementType === "diamond") {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const top = { x: cx, y };
      const right = { x: x + w, y: cy };
      const bottom = { x: cx, y: y + h };
      const left = { x, y: cy };

      const edgeSegments = [[top, right], [right, bottom], [bottom, left], [left, top]];
      let minDist = Infinity;
      edgeSegments.forEach(([p1, p2]) => {
        const proj = projectPointToSegment(pos, p1, p2);
        const d = Math.hypot(pos.x - proj.x, pos.y - proj.y);
        if (d < minDist) {
          minDist = d;
          edgeX = proj.x;
          edgeY = proj.y;
        }
      });
    }

    const dist = Math.hypot(pos.x - edgeX, pos.y - edgeY);
    if (dist <= SNAP_DIST) {
      return { shapeId: el.id, x: edgeX, y: edgeY };
    }
  }
  return null;
};

const projectPointToSegment = (p, a, b) => {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return a;
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
};

const simplifyStrokePoints = (points) => {
  if (!points || points.length <= 2) return points || [];
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const distSq = (curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2;
    if (distSq >= 2.25) {
      result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
};

const convertDrawCommandToStrokes = (cmd, inkColor) => {
  const strokes = [];
  const [ox, oy] = cmd.origin || [0, 0];
  for (let i = 0; i < (cmd.types || []).length; i++) {
    const type = cmd.types[i];
    const item = cmd.items[i];
    if (!item) continue;
    if (type === "rect") {
      strokes.push({ id: `el_${Date.now()}_${i}`, elementType: "rect", x: ox + item[0], y: oy + item[1], width: item[2], height: item[3], strokeColor: inkColor });
    }
  }
  return strokes;
};

const convertPlotCommandToStrokes = (cmd, inkColor) => {
  const strokes = [];
  const { x = 0, y = 0, w = 400, h = 300 } = cmd;
  strokes.push({ id: `el_${Date.now()}_plot`, elementType: "rect", x, y, width: w, height: h, strokeColor: inkColor });
  return strokes;
};
