import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { evaluateMathExpression } from "../utils/mathParser.js";

/**
 * In-memory Javascript mapping of colors matching theme names.
 * Completely resolves race conditions when switching themes by bypassing getComputedStyle.
 */
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

/**
 * High-performance Canvas component for drawing, panning, and zooming.
 * Uses a forwardRef to expose helper utilities to the parent App component
 * (such as capturing visual crops, clearing canvas, and persistence hooks).
 */
const Canvas = forwardRef(({ activeTool, theme, onDrawFinished, onViewportChange, drafts }, ref) => {
  const canvasRef = useRef(null);
  
  // Keep all coordinate data, zoom parameters, and active strokes in mutable references
  // to prevent standard React re-renders from causing drawing lag.
  const stateRef = useRef({
    isDrawing: false,
    isPanning: false,
    panX: 0,
    panY: 0,
    zoom: 1.0,
    strokes: [],       // Array of completed user ink strokes: [{ points: [{x, y}], tool, color, timestamp }]
    currentStroke: [],  // Points of the active stroke
    lastPointerPos: { x: 0, y: 0 },
    lastAiTriggerTime: 0, // Timestamp of last AI crop for temporal segmentation
    hasLasso: false,
    lassoBounds: null
  });

  // Keep callback refs updated to avoid stale closures and infinite re-render loops
  const onViewportChangeRef = useRef(onViewportChange);
  const onDrawFinishedRef = useRef(onDrawFinished);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    onDrawFinishedRef.current = onDrawFinished;
  }, [onDrawFinished]);

  // Redraw canvas to render in-flight preview shapes when draft list updates
  useEffect(() => {
    drawCanvas();
  }, [drafts]);

  // Expose methods to the parent App component using useImperativeHandle
  useImperativeHandle(ref, () => ({
    /**
     * Clears all in-memory ink strokes and updates the canvas display.
     */
    clearCanvas: () => {
      stateRef.current.strokes = [];
      stateRef.current.currentStroke = [];
      drawCanvas();
    },

    /**
     * Retrieves full state for persistence
     */
    getCanvasState: () => {
      const { strokes, panX, panY, zoom } = stateRef.current;
      return { strokes, viewport: { panX, panY, zoom } };
    },

    /**
     * Loads persisted state into canvas memory
     */
    /**
     * Resets canvas pan and zoom to initial centered viewport position (0, 0, 1.0)
     */
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

    /**
     * Active drawing check for multi-tab sync lock
     */
    isDrawingActive: () => {
      return stateRef.current.isDrawing || stateRef.current.isPanning;
    },

    /**
     * Captures a cropped visual representation of the active drawing area
     * and returns it as a Base64-encoded PNG Data URL with crop metadata.
     */
    captureCrop: () => {
      const state = stateRef.current;
      const allStrokes = state.strokes;
      if (!allStrokes || allStrokes.length === 0) return null;

      let targetStrokes = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let isLassoSelection = false;

      if (state.hasLasso && state.lassoBounds) {
        // Targeted Lasso Crop: Crop exclusively around the lasso selection bounds
        isLassoSelection = true;
        minX = state.lassoBounds.minX;
        minY = state.lassoBounds.minY;
        maxX = state.lassoBounds.maxX;
        maxY = state.lassoBounds.maxY;

        // Collect all strokes that intersect the lasso selection box
        targetStrokes = allStrokes.filter(stroke => {
          return stroke.points.some(pt => 
            pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY
          );
        });

        if (targetStrokes.length === 0) targetStrokes = allStrokes.slice(-3);

        // Reset lasso selection after capture
        state.hasLasso = false;
        state.lassoBounds = null;
      } else {
        // Temporal segmentation: only crop strokes drawn since the last AI call
        targetStrokes = allStrokes.filter(s => s.timestamp > state.lastAiTriggerTime);

        // Fallback: if no new strokes since last call, crop the most recent 3 strokes
        if (targetStrokes.length === 0) {
          targetStrokes = allStrokes.slice(-3);
        }

        // Calculate bounding box of recent target strokes
        targetStrokes.forEach(stroke => {
          stroke.points.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
          });
        });
      }

      // Update the trigger timestamp for the next call
      state.lastAiTriggerTime = Date.now();

      // If coordinates are invalid, fallback
      if (minX === Infinity || minY === Infinity) return null;

      // Add a margin around the drawing (e.g. 64px on each side)
      const padding = 64;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const cropWidth = maxX - minX;
      const cropHeight = maxY - minY;

      if (cropWidth <= 0 || cropHeight <= 0) return null;

      // Create offscreen canvas to render the crop
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.min(cropWidth, 2048); // limit bounds to keep payload small
      offscreen.height = Math.min(cropHeight, 1536);
      const oCtx = offscreen.getContext("2d");

      // Read theme paper color synchronously from JS map (bypasses getComputedStyle race conditions)
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const paperColor = activeColors.paper;
      oCtx.fillStyle = paperColor;
      oCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      // Translate context to render drawings relative to calculated minX, minY bounding box
      oCtx.save();
      
      // Handle scaling if dimensions exceeded limits
      const scaleX = offscreen.width / cropWidth;
      const scaleY = offscreen.height / cropHeight;
      const scale = Math.min(scaleX, scaleY, 1.0);
      oCtx.scale(scale, scale);
      oCtx.translate(-minX, -minY);

      // Draw all ink strokes onto offscreen canvas
      targetStrokes.forEach(stroke => {
        if (!stroke.points || stroke.points.length < 2) return;
        oCtx.beginPath();
        oCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          oCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        oCtx.lineWidth = stroke.tool === "eraser" ? 24 : 3;
        // Erase strokes draw with paper color on the crop, pen strokes use active theme ink
        oCtx.strokeStyle = stroke.tool === "eraser" ? paperColor : (stroke.isCustomColor ? stroke.color : activeColors.ink);
        oCtx.stroke();
      });

      oCtx.restore();

      // Return Data URL and crop geometry meta-data
      return {
        image: offscreen.toDataURL("image/png"),
        cropX: Math.round(minX),
        cropY: Math.round(minY),
        cropWidth: Math.round(cropWidth),
        cropHeight: Math.round(cropHeight),
        selectionContext: isLassoSelection
      };
    },

    /**
     * Retrieves the current panning translation values and zoom scale.
     */
    getViewportData: () => {
      const { panX, panY, zoom } = stateRef.current;
      return { panX, panY, zoom };
    },

    /**
     * Converts a vector draw command into standard canvas ink strokes
     * and bakes them permanently into the drawing coordinate database.
     */
    bakeDrawCommand: (cmd) => {
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const inkColor = activeColors.ink;
      const newStrokes = convertDrawCommandToStrokes(cmd, inkColor);
      stateRef.current.strokes.push(...newStrokes);
      drawCanvas();
    },

    /**
     * Converts a mathematical plot command into standard canvas ink strokes
     * and bakes them permanently into the drawing coordinate database.
     */
    bakePlotCommand: (cmd) => {
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
      const inkColor = activeColors.ink;
      const newStrokes = convertPlotCommandToStrokes(cmd, inkColor);
      stateRef.current.strokes.push(...newStrokes);
      drawCanvas();
    }
  }));

  // Define canvas drawing subroutine
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const state = stateRef.current;

    // Read theme colors directly from Javascript mapping to prevent browser styling race conditions
    const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;
    const paperColor = activeColors.paper;
    const inkColor = activeColors.ink;
    const gridColor = activeColors.grid;
    const accentColor = activeColors.accent;

    // 1. Fill entire viewport with paper color (infinite paper — no edges)
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Translate from center of screen and apply current pan coordinates and zoom scale
    ctx.translate(canvas.width / 2 + state.panX, canvas.height / 2 + state.panY);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-10000, -10000); // Shift logical space center to (10000, 10000)

    // 2. Draw dynamic grid dots only in the visible viewport area
    if (state.zoom >= 0.22) {
      // Calculate visible bounds in logical coordinates clamped to logical 20000x20000 space
      const rawVisLeft  = -(canvas.width / 2 + state.panX) / state.zoom + 10000;
      const rawVisTop   = -(canvas.height / 2 + state.panY) / state.zoom + 10000;
      const rawVisRight = (canvas.width / 2 - state.panX) / state.zoom + 10000;
      const rawVisBottom = (canvas.height / 2 - state.panY) / state.zoom + 10000;

      const visLeft  = Math.max(0, Math.min(20000, rawVisLeft));
      const visTop   = Math.max(0, Math.min(20000, rawVisTop));
      const visRight = Math.max(0, Math.min(20000, rawVisRight));
      const visBottom = Math.max(0, Math.min(20000, rawVisBottom));

      // Increase spacing when zoomed out to prevent congestion
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

    // 3. Render completed historical strokes
    strokesListRender(ctx, state.strokes, inkColor, paperColor);

    // 4. Render current active stroke with midpoint quadratic Bezier vector curve smoothing
    if (state.isDrawing && state.currentStroke.length > 0) {
      const pts = state.currentStroke;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
      } else if (pts.length > 2) {
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }

      if (activeTool === "lasso") {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = accentColor;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.lineWidth = activeTool === "eraser" ? 24 : 3;
        ctx.strokeStyle = activeTool === "eraser" ? "rgba(239, 68, 68, 0.4)" : inkColor;
        ctx.stroke();
      }
    }

    // Render active Lasso Selection Box Overlay
    if (state.hasLasso && state.lassoBounds) {
      const { minX, minY, maxX, maxY } = state.lassoBounds;
      const pad = 12;
      const lw = maxX - minX + pad * 2;
      const lh = maxY - minY + pad * 2;

      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = accentColor;
      ctx.fillStyle = "rgba(113, 97, 239, 0.08)";
      ctx.fillRect(minX - pad, minY - pad, lw, lh);
      ctx.strokeRect(minX - pad, minY - pad, lw, lh);
      ctx.restore();
    }

    // 5. Draw pending AI draw previews in-flight (represented as dashed purple lines)
    if (drafts && drafts.length > 0) {
      ctx.save();
      ctx.setLineDash([6, 6]); // dashed strokes for drafts
      ctx.strokeStyle = accentColor;
      ctx.fillStyle = accentColor;
      ctx.lineWidth = 2.5;

      drafts.forEach(draft => {
        if (draft.accepted || !draft.rawCommand || draft.rawCommand.tool !== "draw") return;
        const cmd = draft.rawCommand;
        const [ox, oy] = cmd.origin;

        for (let i = 0; i < cmd.types.length; i++) {
          const type = cmd.types[i];
          const item = cmd.items[i];
          if (!item) continue;

          ctx.beginPath();
          if (type === "line" || type === "smooth") {
            if (item.length < 2) continue;
            ctx.moveTo(ox + item[0], oy + item[1]);
            for (let j = 2; j < item.length; j += 2) {
              ctx.lineTo(ox + item[j], oy + item[j+1]);
            }
          } else if (type === "rect") {
            ctx.rect(ox + item[0], oy + item[1], item[2], item[3]);
          } else if (type === "circle") {
            ctx.arc(ox + item[0], oy + item[1], item[2], 0, Math.PI * 2);
          } else if (type === "ellipse") {
            ctx.ellipse(ox + item[0], oy + item[1], item[2], item[3], 0, 0, Math.PI * 2);
          } else if (type === "arc") {
            const startRad = (item[4] * Math.PI) / 180;
            const sweepRad = (item[5] * Math.PI) / 180;
            ctx.arc(ox + item[0], oy + item[1], item[2], startRad, startRad + sweepRad);
          }
          ctx.stroke();

          // Render arrowhead preview if marked
          if (cmd.arrows && cmd.arrows.includes(i)) {
            let lastX, lastY, prevX, prevY;
            if (type === "line" || type === "smooth") {
              const len = item.length;
              lastX = ox + item[len - 2];
              lastY = oy + item[len - 1];
              prevX = ox + item[len - 4];
              prevY = oy + item[len - 3];
            }
            if (lastX !== undefined) {
              const dx = lastX - prevX;
              const dy = lastY - prevY;
              const angle = Math.atan2(dy, dx);
              ctx.beginPath();
              ctx.moveTo(lastX, lastY);
              ctx.lineTo(lastX - 12 * Math.cos(angle - Math.PI/6), lastY - 12 * Math.sin(angle - Math.PI/6));
              ctx.lineTo(lastX - 12 * Math.cos(angle + Math.PI/6), lastY - 12 * Math.sin(angle + Math.PI/6));
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // Render plot_function preview using safe evaluator
        if (cmd.tool === "plot_function") {
          const { x, y, w = 400, h = 300, expression } = cmd;
          const xMin = -6, xMax = 6, yMin = -6, yMax = 6;
          const toCanvasCoords = (xm, ym) => ({
            x: x + ((xm - xMin) / (xMax - xMin)) * w,
            y: y + ((yMax - ym) / (yMax - yMin)) * h
          });

          // Draw preview bounding box & axes
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          const orig = toCanvasCoords(0, 0);
          ctx.moveTo(x, orig.y); ctx.lineTo(x + w, orig.y);
          ctx.moveTo(orig.x, y + h); ctx.lineTo(orig.x, y);
          ctx.stroke();

          // Draw evaluated mathematical function curve preview
          ctx.beginPath();
          let isDrawingCurve = false;
          for (let i = 0; i <= 100; i++) {
            const xm = xMin + (i / 100) * (xMax - xMin);
            const evalRes = evaluateMathExpression(expression, xm);
            if (evalRes.ok && evalRes.value >= yMin && evalRes.value <= yMax) {
              const pt = toCanvasCoords(xm, evalRes.value);
              if (!isDrawingCurve) {
                ctx.moveTo(pt.x, pt.y);
                isDrawingCurve = true;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            } else {
              isDrawingCurve = false;
            }
          }
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    ctx.restore();
  };

  // Helper routine to draw array of strokes using midpoint quadratic Bezier curve smoothing
  const strokesListRender = (ctx, strokes, inkColor, paperColor) => {
    strokes.forEach(stroke => {
      const pts = stroke.points;
      if (!pts || pts.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      }

      ctx.lineWidth = stroke.tool === "eraser" ? 24 : (stroke.width || 3);
      // Dynamically adapt drawn ink strokes to active theme ink color
      ctx.strokeStyle = stroke.tool === "eraser" ? paperColor : (stroke.isCustomColor ? stroke.color : inkColor);
      ctx.stroke();
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle container resize updates
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawCanvas();
      if (onViewportChangeRef.current) {
        onViewportChangeRef.current({ panX: stateRef.current.panX, panY: stateRef.current.panY, zoom: stateRef.current.zoom });
      }
    };

    // Helper: Map client screen coordinate to logic board global coordinate space
    const toGlobalCoords = (clientX, clientY) => {
      const state = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left - rect.width / 2;
      const my = clientY - rect.top - rect.height / 2;
      const x = (mx - state.panX) / state.zoom + 10000;
      const y = (my - state.panY) / state.zoom + 10000;
      return { x, y };
    };

    const handlePointerDown = (e) => {
      // Capture pointer to guarantee pointerup fires even if pointer leaves canvas bounds
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }

      const state = stateRef.current;
      
      // Pen/Eraser/Lasso acts on primary click
      if (e.button === 0 && (activeTool === "pen" || activeTool === "eraser" || activeTool === "lasso")) {
        state.isDrawing = true;
        const globalPos = toGlobalCoords(e.clientX, e.clientY);
        state.currentStroke = [globalPos];
        if (activeTool === "lasso") {
          state.hasLasso = false;
          state.lassoBounds = null;
        }
      } else {
        // Panning mode acts on middle mouse, right click, or when selected
        state.isPanning = true;
        state.lastPointerPos = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerMove = (e) => {
      const state = stateRef.current;
      if (state.isDrawing) {
        const globalPos = toGlobalCoords(e.clientX, e.clientY);
        state.currentStroke.push(globalPos);
        drawCanvas();
      } else if (state.isPanning) {
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
      }
    };

    const handlePointerUp = (e) => {
      if (canvas.releasePointerCapture && e) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }

      const state = stateRef.current;
      const activeColors = THEME_COLORS[theme] || THEME_COLORS.arcane;

      if (state.isDrawing) {
        state.isDrawing = false;
        if (state.currentStroke.length > 1) {
          if (activeTool === "lasso") {
            // Process Lasso Selection: Compute bounding box of loop
            let lMinX = Infinity, lMinY = Infinity, lMaxX = -Infinity, lMaxY = -Infinity;
            state.currentStroke.forEach(pt => {
              if (pt.x < lMinX) lMinX = pt.x;
              if (pt.y < lMinY) lMinY = pt.y;
              if (pt.x > lMaxX) lMaxX = pt.x;
              if (pt.y > lMaxY) lMaxY = pt.y;
            });
            state.lassoBounds = { minX: lMinX, minY: lMinY, maxX: lMaxX, maxY: lMaxY };
            state.hasLasso = true;
          } else {
            // Commit smoothed stroke to memory list with timestamp; pen strokes adapt dynamically to active theme ink
            const smoothedPoints = simplifyStrokePoints(state.currentStroke);
            state.strokes.push({
              points: smoothedPoints,
              tool: activeTool,
              timestamp: Date.now()
            });
          }
        }
        state.currentStroke = [];
        drawCanvas();
        if (onDrawFinishedRef.current) onDrawFinishedRef.current();
      }
      state.isPanning = false;
    };

    const handlePointerCancel = (e) => {
      if (canvas.releasePointerCapture && e) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      const state = stateRef.current;
      state.isDrawing = false;
      state.isPanning = false;
      state.currentStroke = [];
      state.hasLasso = false;
      state.lassoBounds = null;
      drawCanvas();
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const state = stateRef.current;
      
      // Compute mouse offset relative to actual canvas bounding rect (insulates against toolbars/layout shifts)
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;

      const oldZoom = state.zoom;
      const zoomFactor = 1.08;
      const newZoom = Math.min(Math.max(e.deltaY < 0 ? oldZoom * zoomFactor : oldZoom / zoomFactor, 0.15), 3.5);
      const zoomRatio = newZoom / oldZoom;

      // Mathematically precise cursor-centered zoom with pan bounds clamping
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

    // Prevent context menu from popping up when right-clicking/panning
    const handleContextMenu = (e) => e.preventDefault();

    // Attach listeners
    window.addEventListener("resize", handleResize);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    // Initial draw pass
    handleResize();

    // Clean up connections on release
    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activeTool, theme]);

  return (
    <div className="canvas-wrapper">
      <canvas 
        ref={canvasRef} 
        className="imperative-canvas" 
      />
    </div>
  );
});

/**
 * Converts a structured vector draw command into standard canvas stroke elements.
 */
const convertDrawCommandToStrokes = (cmd, inkColor) => {
  const [ox, oy] = cmd.origin;
  const strokes = [];
  const width = cmd.width ? cmd.width / 10 : 3;

  for (let i = 0; i < cmd.types.length; i++) {
    const type = cmd.types[i];
    const item = cmd.items[i];
    if (!item) continue;

    let points = [];

    if (type === "line" || type === "smooth") {
      for (let j = 0; j < item.length; j += 2) {
        points.push({ x: ox + item[j], y: oy + item[j+1] });
      }
    } else if (type === "rect") {
      const [rx, ry, rw, rh] = item;
      points = [
        { x: ox + rx, y: oy + ry },
        { x: ox + rx + rw, y: oy + ry },
        { x: ox + rx + rw, y: oy + ry + rh },
        { x: ox + rx, y: oy + ry + rh },
        { x: ox + rx, y: oy + ry }
      ];
    } else if (type === "circle") {
      const [cx, cy, r] = item;
      const steps = 60;
      for (let j = 0; j <= steps; j++) {
        const theta = (j / steps) * Math.PI * 2;
        points.push({
          x: ox + cx + r * Math.cos(theta),
          y: oy + cy + r * Math.sin(theta)
        });
      }
    } else if (type === "ellipse") {
      const [cx, cy, rx, ry] = item;
      const steps = 60;
      for (let j = 0; j <= steps; j++) {
        const theta = (j / steps) * Math.PI * 2;
        points.push({
          x: ox + cx + rx * Math.cos(theta),
          y: oy + cy + ry * Math.sin(theta)
        });
      }
    } else if (type === "arc") {
      const [cx, cy, rx, ry, startDeg, sweepDeg] = item;
      const steps = Math.max(12, Math.round(Math.abs(sweepDeg) / 5));
      const startRad = (startDeg * Math.PI) / 180;
      const sweepRad = (sweepDeg * Math.PI) / 180;
      for (let j = 0; j <= steps; j++) {
        const theta = startRad + (j / steps) * sweepRad;
        points.push({
          x: ox + cx + rx * Math.cos(theta),
          y: oy + cy + ry * Math.sin(theta)
        });
      }
    }

    if (points.length > 0) {
      strokes.push({
        points,
        tool: "pen",
        color: inkColor,
        width,
        timestamp: Date.now()
      });

      // Append arrowhead stroke if specified
      if (cmd.arrows && cmd.arrows.includes(i)) {
        addArrowHead(points, strokes, inkColor, width);
      }
    }
  }
  return strokes;
};

/**
 * Utility to calculate and append arrowhead lines to a drawing path's end.
 */
const addArrowHead = (points, strokes, inkColor, width) => {
  if (points.length < 2) return;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const udx = dx / len;
  const udy = dy / len;

  const arrowSize = 12;
  const angle = Math.PI / 6;

  const x1 = last.x - arrowSize * (udx * Math.cos(angle) - udy * Math.sin(angle));
  const y1 = last.y - arrowSize * (udy * Math.cos(angle) + udx * Math.sin(angle));
  const x2 = last.x - arrowSize * (udx * Math.cos(angle) + udy * Math.sin(angle));
  const y2 = last.y - arrowSize * (udy * Math.cos(angle) - udx * Math.sin(angle));

  strokes.push({
    points: [{ x: x1, y: y1 }, last, { x: x2, y: y2 }],
    tool: "pen",
    color: inkColor,
    width,
    timestamp: Date.now()
  });
};

export default Canvas;

/**
 * Simplifies a sequence of stroke points by removing redundant micro-jitter points.
 */
const simplifyStrokePoints = (points) => {
  if (!points || points.length <= 2) return points || [];
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const distSq = (curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2;
    if (distSq >= 2.25) { // at least 1.5px apart
      result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
};

/**
 * Converts a plot_function command into a collection of stroke paths (axes, ticks, grid, and curve).
 */
const convertPlotCommandToStrokes = (cmd, inkColor) => {
  const { x, y, w = 400, h = 300, expression } = cmd;
  const strokes = [];
  const axisColor = inkColor;

  // Domain & Range in Math Coordinates
  const xMin = -6, xMax = 6;
  const yMin = -6, yMax = 6;

  // Function to map math (xMath, yMath) -> global canvas coordinates
  const toCanvasCoords = (xm, ym) => {
    const cx = x + ((xm - xMin) / (xMax - xMin)) * w;
    const cy = y + ((yMax - ym) / (yMax - yMin)) * h;
    return { x: cx, y: cy };
  };

  // 1. Outer Box Border
  strokes.push({
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y }
    ],
    tool: "pen",
    color: inkColor,
    width: 2,
    timestamp: Date.now()
  });

  // 2. X-Axis and Y-Axis Lines (passing through Math origin 0,0)
  const originCanvas = toCanvasCoords(0, 0);

  // X Axis Line (horizontal)
  const xAxisPoints = [{ x, y: originCanvas.y }, { x: x + w, y: originCanvas.y }];
  strokes.push({
    points: xAxisPoints,
    tool: "pen",
    color: axisColor,
    width: 2,
    timestamp: Date.now()
  });
  addArrowHead(xAxisPoints, strokes, axisColor, 2);

  // Y Axis Line (vertical)
  const yAxisPoints = [{ x: originCanvas.x, y: y + h }, { x: originCanvas.x, y }];
  strokes.push({
    points: yAxisPoints,
    tool: "pen",
    color: axisColor,
    width: 2,
    timestamp: Date.now()
  });
  addArrowHead(yAxisPoints, strokes, axisColor, 2);

  // 3. Grid Ticks & Labels
  for (let tickX = -5; tickX <= 5; tickX += 1) {
    if (tickX === 0) continue;
    const pt = toCanvasCoords(tickX, 0);
    strokes.push({
      points: [{ x: pt.x, y: pt.y - 4 }, { x: pt.x, y: pt.y + 4 }],
      tool: "pen",
      color: axisColor,
      width: 1.5,
      timestamp: Date.now()
    });
  }
  for (let tickY = -5; tickY <= 5; tickY += 1) {
    if (tickY === 0) continue;
    const pt = toCanvasCoords(0, tickY);
    strokes.push({
      points: [{ x: pt.x - 4, y: pt.y }, { x: pt.x + 4, y: pt.y }],
      tool: "pen",
      color: axisColor,
      width: 1.5,
      timestamp: Date.now()
    });
  }

  // 4. Sample and Evaluate the Function Curve over 120 points using safe evaluator
  const steps = 120;
  let currentCurvePoints = [];

  for (let i = 0; i <= steps; i++) {
    const xm = xMin + (i / steps) * (xMax - xMin);
    const evalRes = evaluateMathExpression(expression, xm);

    if (evalRes.ok && evalRes.value >= yMin && evalRes.value <= yMax) {
      const pt = toCanvasCoords(xm, evalRes.value);
      currentCurvePoints.push(pt);
    } else {
      // Break stroke path on mathematical discontinuities (e.g. 1/0, tan asymptote)
      if (currentCurvePoints.length > 1) {
        strokes.push({
          points: [...currentCurvePoints],
          tool: "pen",
          color: inkColor,
          width: 3,
          timestamp: Date.now()
        });
      }
      currentCurvePoints = [];
    }
  }

  if (currentCurvePoints.length > 1) {
    strokes.push({
      points: currentCurvePoints,
      tool: "pen",
      color: inkColor,
      width: 3,
      timestamp: Date.now()
    });
  }

  return strokes;
};
