import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { evaluateMathExpression } from "../utils/mathParser.js";
import { WORLD_ORIGIN, clampViewport, screenToWorld } from "../utils/coordinates.js";

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
  onDrawStart,
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
  const onDrawStartRef = useRef(onDrawStart);
  const onDrawFinishedRef = useRef(onDrawFinished);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);
  useEffect(() => { onDrawStartRef.current = onDrawStart; }, [onDrawStart]);
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
        stateRef.current.strokes = savedStrokes;
      }
      if (savedViewport) {
        const viewport = clampViewport(savedViewport);
        stateRef.current.panX = viewport.panX;
        stateRef.current.panY = viewport.panY;
        stateRef.current.zoom = viewport.zoom;
        if (onViewportChangeRef.current) {
          onViewportChangeRef.current({ panX: stateRef.current.panX, panY: stateRef.current.panY, zoom: stateRef.current.zoom });
        }
      }
      drawCanvas();
    },

    setViewport: (nextViewport) => {
      const viewport = clampViewport({
        panX: stateRef.current.panX,
        panY: stateRef.current.panY,
        zoom: stateRef.current.zoom,
        ...nextViewport
      });
      stateRef.current.panX = viewport.panX;
      stateRef.current.panY = viewport.panY;
      stateRef.current.zoom = viewport.zoom;
      drawCanvas();
      if (onViewportChangeRef.current) {
        onViewportChangeRef.current(viewport);
      }
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

    bakeTextCommand: (cmd) => {
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const inkColor = activeColors.ink;
      const newStrokes = convertTextCommandToStrokes(cmd, inkColor);
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
      } else if (action === "paste") {
        if (!state.clipboardStyle || state.clipboardStyle.length === 0) return;
        const newEls = state.clipboardStyle.map(el => ({
          ...JSON.parse(JSON.stringify(el)),
          id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          x: el.x !== undefined ? el.x + 20 : el.x,
          y: el.y !== undefined ? el.y + 20 : el.y,
          points: (el.points || []).map(p => ({ x: p.x + 20, y: p.y + 20 }))
        }));
        state.strokes.push(...newEls);
        state.selectedIds = newEls.map(e => e.id);
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
    ctx.translate(-WORLD_ORIGIN, -WORLD_ORIGIN);

    if (state.zoom >= 0.22) {
      const rawVisLeft  = -(canvas.width / 2 + state.panX) / state.zoom + WORLD_ORIGIN;
      const rawVisTop   = -(canvas.height / 2 + state.panY) / state.zoom + WORLD_ORIGIN;
      const rawVisRight = (canvas.width / 2 - state.panX) / state.zoom + WORLD_ORIGIN;
      const rawVisBottom = (canvas.height / 2 - state.panY) / state.zoom + WORLD_ORIGIN;

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

    // Render unaccepted drafts visual previews (draw vector shapes & plot_function curves)
    if (drafts && drafts.length > 0) {
      ctx.save();
      drafts.forEach(draft => {
        if (!draft.accepted && draft.rawCommand) {
          const cmd = draft.rawCommand;
          if (cmd.tool === "plot_function") {
            const plotStrokes = convertPlotCommandToStrokes(cmd, accentColor);
            renderStrokesArray(ctx, plotStrokes, accentColor, paperColor);
          } else if (cmd.tool === "draw") {
            const drawStrokes = convertDrawCommandToStrokes(cmd, accentColor);
            renderStrokesArray(ctx, drawStrokes, accentColor, paperColor);
          }
        }
      });
      ctx.restore();
    }

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

      return screenToWorld({
        x: canvasX,
        y: canvasY,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom
      });
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
              state.rotationPointerAngle = null;
              state.rotationCenter = {
                x: (bbox.minX + bbox.maxX) / 2,
                y: (bbox.minY + bbox.maxY) / 2
              };
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
        if (onDrawStartRef.current) onDrawStartRef.current();
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
        if (onDrawStartRef.current) onDrawStartRef.current();
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

      if (state.isResizing && state.selectedIds.length > 0) {
        resizeSelectedElements(state, globalPos, state.activeHandle);
        drawCanvas();
        return;
      }

      if (state.isRotating && state.selectedIds.length > 0) {
        rotateSelectedElements(state, globalPos);
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
      }

      if (state.isDraggingElement || state.isResizing || state.isRotating) {
        if (onDrawFinishedRef.current) onDrawFinishedRef.current();
      }

      state.isPanning = false;
      state.isDraggingElement = false;
      state.isResizing = false;
      state.isRotating = false;
      state.activeHandle = null;
      state.rotationPointerAngle = null;
      state.rotationCenter = null;
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

const wrapTextLines = (text, maxWidth, fontSize, ctx) => {
  const raw = String(text ?? "");
  if (!raw) return [""];
  const segments = raw.split(/\n/);
  const lines = [];

  for (const segment of segments) {
    if (!segment.trim()) {
      lines.push("");
      continue;
    }

    const words = segment.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || current === "") {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
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

  if (el.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(el.rotation);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  ctx.lineWidth = el.strokeWidth || 3;
  ctx.strokeStyle = el.elementType === "eraser" ? paperColor : sColor;
  ctx.fillStyle = bgColor;

  if (el.elementType === "text" || el.elementType === "formula") {
    const textContent = String(el.text || el.latex || "");
    const fontSize = el.fontSize || 20;
    const lineHeight = el.lineHeight || 1.3;
    const textWidth = Math.max(80, w || 180);
    ctx.font = `${el.fontWeight || 600} ${fontSize}px "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = sColor;

    const lines = wrapTextLines(textContent, textWidth, fontSize, ctx);
    lines.forEach((line, index) => {
      const ty = y + index * fontSize * lineHeight;
      ctx.fillText(line, x, ty);
    });
  } else if (el.elementType === "rect") {
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

  const resizeSelectedElements = (state, pointer, handle) => {
    const selected = state.strokes.filter(el => state.selectedIds.includes(el.id));
    const oldBox = getBoundingBox(selected);
    const anchorX = handle.includes("w") ? oldBox.maxX : handle.includes("e") ? oldBox.minX : (oldBox.minX + oldBox.maxX) / 2;
    const anchorY = handle.includes("n") ? oldBox.maxY : handle.includes("s") ? oldBox.minY : (oldBox.minY + oldBox.maxY) / 2;
    const nextLeft = handle.includes("w") ? pointer.x : handle.includes("e") ? oldBox.minX : oldBox.minX;
    const nextRight = handle.includes("e") ? pointer.x : handle.includes("w") ? oldBox.maxX : oldBox.maxX;
    const nextTop = handle.includes("n") ? pointer.y : handle.includes("s") ? oldBox.minY : oldBox.minY;
    const nextBottom = handle.includes("s") ? pointer.y : handle.includes("n") ? oldBox.maxY : oldBox.maxY;
    const oldWidth = Math.max(1, oldBox.maxX - oldBox.minX);
    const oldHeight = Math.max(1, oldBox.maxY - oldBox.minY);
    const newWidth = Math.max(1, Math.abs(nextRight - nextLeft));
    const newHeight = Math.max(1, Math.abs(nextBottom - nextTop));
    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;
    const left = Math.min(nextLeft, nextRight);
    const top = Math.min(nextTop, nextBottom);

    selected.forEach(el => {
      if (el.points?.length) {
        el.points = el.points.map(point => ({
          x: left + (point.x - oldBox.minX) * scaleX,
          y: top + (point.y - oldBox.minY) * scaleY
        }));
      } else {
        const x = el.x || 0;
        const y = el.y || 0;
        el.x = left + (x - oldBox.minX) * scaleX;
        el.y = top + (y - oldBox.minY) * scaleY;
        el.width = (el.width || 0) * scaleX;
        el.height = (el.height || 0) * scaleY;
      }
    });
  };

  const rotateSelectedElements = (state, pointer) => {
    const selected = state.strokes.filter(el => state.selectedIds.includes(el.id));
    const bbox = getBoundingBox(selected);
    const center = state.rotationCenter || { x: (bbox.minX + bbox.maxX) / 2, y: (bbox.minY + bbox.maxY) / 2 };
    const previousAngle = state.rotationPointerAngle ?? Math.atan2(state.dragStartPos.y - center.y, state.dragStartPos.x - center.x);
    const nextAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
    const delta = nextAngle - previousAngle;
    state.rotationPointerAngle = nextAngle;

    selected.forEach(el => {
      if (el.points?.length) {
        el.points = el.points.map(point => rotatePoint(point, center, delta));
      } else {
        const elementCenter = { x: (el.x || 0) + (el.width || 0) / 2, y: (el.y || 0) + (el.height || 0) / 2 };
        const rotatedCenter = rotatePoint(elementCenter, center, delta);
        el.x = rotatedCenter.x - (el.width || 0) / 2;
        el.y = rotatedCenter.y - (el.height || 0) / 2;
        el.rotation = (el.rotation || 0) + delta;
      }
    });
  };

  const rotatePoint = (point, center, angle) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos
    };
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

const estimateTextBlockSize = (text, maxWidth, fontSize, lineHeight) => {
  const raw = String(text ?? "");
  if (!raw) return { width: maxWidth, height: fontSize * lineHeight };

  const charWidth = fontSize * 0.58;
  const lines = raw.split(/\n/);
  let width = 0;
  lines.forEach(line => {
    const approx = line.length * charWidth;
    if (approx > width) width = approx;
  });

  const wrappedLines = raw.split(/\s+/).reduce((acc, word) => {
    const candidate = acc.current ? `${acc.current} ${word}` : word;
    if (candidate.length * charWidth <= maxWidth || !acc.current) {
      acc.current = candidate;
    } else {
      acc.lines.push(acc.current);
      acc.current = word;
    }
    return acc;
  }, { current: "", lines: [] });

  if (wrappedLines.current) wrappedLines.lines.push(wrappedLines.current);
  const lineCount = wrappedLines.lines.length || 1;
  const height = lineCount * fontSize * lineHeight;
  return { width: Math.max(maxWidth, Math.min(600, width + 12)), height };
};

const convertTextCommandToStrokes = (cmd, inkColor) => {
  const x = Number.isFinite(cmd.x) ? cmd.x : 0;
  const y = Number.isFinite(cmd.y) ? cmd.y : 0;
  const value = String(cmd.text || cmd.latex || cmd.content || "");
  const elementType = cmd.tool === "draw_formula" ? "formula" : "text";
  const fontSize = Number.isFinite(cmd.fontSize) ? cmd.fontSize : (elementType === "formula" ? 24 : 22);
  const lineHeight = Number.isFinite(cmd.lineHeight) ? cmd.lineHeight : 1.3;
  const maxWidth = Number.isFinite(cmd.width) ? cmd.width : (elementType === "formula" ? 280 : 240);
  const size = estimateTextBlockSize(value, maxWidth, fontSize, lineHeight);

  return [{
    id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_text`,
    elementType,
    x,
    y,
    width: size.width,
    height: size.height,
    text: value,
    latex: elementType === "formula" ? value : undefined,
    fontSize,
    lineHeight,
    strokeColor: inkColor,
    strokeWidth: 1,
    strokeStyle: "solid",
    opacity: 100
  }];
};

const convertDrawCommandToStrokes = (cmd, inkColor) => {
  const strokes = [];
  const [ox, oy] = cmd.origin || [0, 0];
  const strokeWidth = cmd.width || 3;
  const closedSet = new Set(cmd.closed || []);
  const fillSet = new Set(cmd.fill || []);

  for (let i = 0; i < (cmd.types || []).length; i++) {
    const type = cmd.types[i];
    const item = cmd.items[i];
    if (!item) continue;
    const uid = `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${i}`;

    if (type === "line" || type === "smooth") {
      // item is a flat array of [x1,y1,x2,y2,...] coordinate pairs relative to origin
      const points = [];
      for (let j = 0; j < item.length; j += 2) {
        points.push({ x: ox + item[j], y: oy + item[j + 1] });
      }
      // Close the path if index is in the closed list
      if (closedSet.has(i) && points.length > 1) {
        points.push({ ...points[0] });
      }
      if (points.length >= 2) {
        strokes.push({
          id: uid,
          elementType: "pen",
          points,
          strokeColor: inkColor,
          strokeWidth,
          strokeStyle: "solid",
          opacity: 100
        });
      }
    } else if (type === "rect") {
      // item is [x, y, w, h] relative to origin
      strokes.push({
        id: uid,
        elementType: "rect",
        x: ox + item[0],
        y: oy + item[1],
        width: item[2],
        height: item[3],
        strokeColor: inkColor,
        backgroundColor: fillSet.has(i) ? inkColor : "transparent",
        strokeWidth,
        strokeStyle: "solid",
        opacity: 100
      });
    } else if (type === "ellipse") {
      // item is [cx, cy, rx, ry] relative to origin
      const cx = ox + item[0], cy = oy + item[1], rx = item[2], ry = item[3];
      strokes.push({
        id: uid,
        elementType: "ellipse",
        x: cx - rx,
        y: cy - ry,
        width: rx * 2,
        height: ry * 2,
        strokeColor: inkColor,
        backgroundColor: fillSet.has(i) ? inkColor : "transparent",
        strokeWidth,
        strokeStyle: "solid",
        opacity: 100
      });
    } else if (type === "circle") {
      // item is [cx, cy, r] relative to origin
      const cx = ox + item[0], cy = oy + item[1], r = item[2];
      strokes.push({
        id: uid,
        elementType: "ellipse",
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        strokeColor: inkColor,
        backgroundColor: fillSet.has(i) ? inkColor : "transparent",
        strokeWidth,
        strokeStyle: "solid",
        opacity: 100
      });
    } else if (type === "arc") {
      // item is [cx, cy, rx, ry, startDeg, sweepDeg] — generate polyline approximation
      const cx = ox + item[0], cy = oy + item[1];
      const rx = item[2], ry = item[3];
      const startDeg = item[4], sweepDeg = item[5];
      const STEPS = Math.max(20, Math.abs(sweepDeg));
      const points = [];
      for (let s = 0; s <= STEPS; s++) {
        const angle = ((startDeg + (sweepDeg * s) / STEPS) * Math.PI) / 180;
        points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
      }
      if (points.length >= 2) {
        strokes.push({
          id: uid,
          elementType: "pen",
          points,
          strokeColor: inkColor,
          strokeWidth,
          strokeStyle: "solid",
          opacity: 100
        });
      }
    }
  }
  return strokes;
};

const convertPlotCommandToStrokes = (cmd, inkColor) => {
  const { x = 0, y = 0, w = 400, h = 300, expression } = cmd;
  const strokes = [];
  const axisColor = inkColor;

  // Clean expression: remove leading "y=", "y =", "f(x)=", "f(x) =" if present
  let cleanExpr = typeof expression === "string" ? expression.trim() : "x";
  cleanExpr = cleanExpr.replace(/^(y\s*=\s*|f\s*\(\s*x\s*\)\s*=\s*)/i, "");

  // Domain & Range in Math Coordinates
  const xMin = -6, xMax = 6;
  const yMin = -6, yMax = 6;

  // Coordinate mapper from Math coords (xm, ym) -> Canvas coords (cx, cy)
  const toCanvasCoords = (xm, ym) => {
    const cx = x + ((xm - xMin) / (xMax - xMin)) * w;
    const cy = y + ((yMax - ym) / (yMax - yMin)) * h;
    return { x: cx, y: cy };
  };

  const originCanvas = toCanvasCoords(0, 0);

  // 1. Outer Frame Box (rect)
  strokes.push({
    id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_frame`,
    elementType: "rect",
    x,
    y,
    width: w,
    height: h,
    strokeColor: inkColor,
    backgroundColor: "transparent",
    strokeWidth: 2,
    strokeStyle: "solid",
    opacity: 50
  });

  // 2. X-Axis (horizontal arrow through 0,0)
  strokes.push({
    id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_xaxis`,
    elementType: "arrow",
    x: x + 4,
    y: originCanvas.y,
    width: w - 8,
    height: 0,
    strokeColor: axisColor,
    strokeWidth: 1.5,
    strokeStyle: "solid",
    opacity: 70
  });

  // 3. Y-Axis (vertical arrow through 0,0)
  strokes.push({
    id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_yaxis`,
    elementType: "arrow",
    x: originCanvas.x,
    y: y + h - 4,
    width: 0,
    height: -(h - 8),
    strokeColor: axisColor,
    strokeWidth: 1.5,
    strokeStyle: "solid",
    opacity: 70
  });

  // 4. Tick Marks
  for (let tickX = -5; tickX <= 5; tickX += 1) {
    if (tickX === 0) continue;
    const pt = toCanvasCoords(tickX, 0);
    strokes.push({
      id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_tickx_${tickX}`,
      elementType: "line",
      x: pt.x,
      y: pt.y - 4,
      width: 0,
      height: 8,
      strokeColor: axisColor,
      strokeWidth: 1.2,
      strokeStyle: "solid",
      opacity: 60
    });
  }
  for (let tickY = -5; tickY <= 5; tickY += 1) {
    if (tickY === 0) continue;
    const pt = toCanvasCoords(0, tickY);
    strokes.push({
      id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_ticky_${tickY}`,
      elementType: "line",
      x: pt.x - 4,
      y: pt.y,
      width: 8,
      height: 0,
      strokeColor: axisColor,
      strokeWidth: 1.2,
      strokeStyle: "solid",
      opacity: 60
    });
  }

  // 5. Axis labels
  const labelStyle = {
    strokeColor: axisColor,
    strokeWidth: 1,
    strokeStyle: "solid",
    opacity: 90,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.2
  };

  strokes.push({
    id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_xlabel`,
    elementType: "text",
    x: x + w - 18,
    y: originCanvas.y + 8,
    width: 24,
    height: 22,
    text: "x",
    ...labelStyle
  });

  strokes.push({
    id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_ylabel`,
    elementType: "text",
    x: originCanvas.x + 8,
    y: y + 6,
    width: 24,
    height: 22,
    text: "y",
    ...labelStyle
  });

  // 6. Adaptively sample the function curve. Midpoint subdivision adds points
  // where the curve bends and stops segments at discontinuities/asymptotes.
  const MIN_INTERVAL = (xMax - xMin) / 4096;
  const MAX_DEPTH = 10;
  const FLATNESS_TOLERANCE = Math.max(0.75, Math.min(w, h) / 500);
  const MAX_POINTS = 2500;
  let generatedPoints = 0;

  const evaluatePoint = (xm) => {
    const result = evaluateMathExpression(cleanExpr, xm);
    if (
      !result ||
      !result.ok ||
      typeof result.value !== "number" ||
      !Number.isFinite(result.value) ||
      result.value < yMin ||
      result.value > yMax
    ) {
      return null;
    }
    return { x: xm, y: result.value, canvas: toCanvasCoords(xm, result.value) };
  };

  const distanceFromChord = (point, start, end) => {
    const dx = end.canvas.x - start.canvas.x;
    const dy = end.canvas.y - start.canvas.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return Math.hypot(point.canvas.x - start.canvas.x, point.canvas.y - start.canvas.y);
    return Math.abs(
      dy * point.canvas.x -
      dx * point.canvas.y +
      end.canvas.x * start.canvas.y -
      end.canvas.y * start.canvas.x
    ) / length;
  };

  const subdivide = (start, end, depth) => {
    if (generatedPoints >= MAX_POINTS) return [];

    const midpointX = (start.x + end.x) / 2;
    const midpoint = evaluatePoint(midpointX);
    const intervalWidth = end.x - start.x;

    if (depth >= MAX_DEPTH || intervalWidth <= MIN_INTERVAL) {
      if (start && end && midpoint && distanceFromChord(midpoint, start, end) <= FLATNESS_TOLERANCE) {
        generatedPoints += 2;
        return [[start.canvas, end.canvas]];
      }
      return [];
    }

    if (start && end && midpoint) {
      const deviation = distanceFromChord(midpoint, start, end);

      if (deviation <= FLATNESS_TOLERANCE) {
        generatedPoints += 2;
        return [[start.canvas, end.canvas]];
      }
    }

    const leftStart = start;
    const leftEnd = midpoint;
    const rightStart = midpoint;
    const rightEnd = end;
    const leftSegments = leftStart && leftEnd ? subdivide(leftStart, leftEnd, depth + 1) : [];
    const rightSegments = rightStart && rightEnd ? subdivide(rightStart, rightEnd, depth + 1) : [];
    return [...leftSegments, ...rightSegments];
  };

  const mergeSegments = (segments) => {
    const merged = [];
    segments.forEach(([start, end]) => {
      const previous = merged[merged.length - 1];
      if (previous && Math.hypot(previous[previous.length - 1].x - start.x, previous[previous.length - 1].y - start.y) < 0.01) {
        previous.push(end);
      } else {
        merged.push([start, end]);
      }
    });
    return merged;
  };

  const initialSteps = 32;
  const adaptiveSegments = [];
  for (let i = 0; i < initialSteps; i++) {
    const start = evaluatePoint(xMin + (i / initialSteps) * (xMax - xMin));
    const end = evaluatePoint(xMin + ((i + 1) / initialSteps) * (xMax - xMin));
    if (start && end) adaptiveSegments.push(...subdivide(start, end, 0));
  }

  mergeSegments(adaptiveSegments).forEach(points => {
    strokes.push({
      id: `el_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_curve_${strokes.length}`,
      elementType: "pen",
      points,
      strokeColor: inkColor,
      strokeWidth: 3,
      strokeStyle: "solid",
      opacity: 100
    });
  });

  return strokes;
};
