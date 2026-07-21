import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

/**
 * High-performance Canvas component for drawing, panning, and zooming.
 * Uses a forwardRef to expose helper utilities to the parent App component
 * (such as capturing visual crops and clearing canvas elements).
 */
const Canvas = forwardRef(({ activeTool, theme, onDrawFinished, onViewportChange }, ref) => {
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
    lastAiTriggerTime: 0  // Timestamp of last AI crop for temporal segmentation
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
     * Captures a cropped visual representation of the active drawing area
     * and returns it as a Base64-encoded PNG Data URL with crop metadata.
     */
    captureCrop: () => {
      const state = stateRef.current;
      const allStrokes = state.strokes;
      if (!allStrokes || allStrokes.length === 0) return null;

      // Temporal segmentation: only consider strokes drawn since last AI call
      let targetStrokes = allStrokes.filter(s => s.timestamp > state.lastAiTriggerTime);

      // Fallback: if no new strokes since last call, use the most recent 3
      if (targetStrokes.length === 0) {
        targetStrokes = allStrokes.slice(-3);
      }

      // Update the trigger timestamp for the next call
      state.lastAiTriggerTime = Date.now();

      // 1. Calculate bounding box of target strokes only
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      targetStrokes.forEach(stroke => {
        stroke.points.forEach(pt => {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        });
      });

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

      // 2. Create offscreen canvas to render the crop
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.min(cropWidth, 2048); // limit bounds to keep payload small
      offscreen.height = Math.min(cropHeight, 1536);
      const oCtx = offscreen.getContext("2d");

      // Draw paper background matching active theme
      const cssStyles = getComputedStyle(document.body);
      const paperColor = cssStyles.getPropertyValue("--color-paper").trim() || "#ffffff";
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
        // Erase strokes draw with paper color on the crop
        oCtx.strokeStyle = stroke.tool === "eraser" ? paperColor : (stroke.color || "#1f2937");
        oCtx.stroke();
      });

      oCtx.restore();

      // Return Data URL and crop geometry meta-data
      return {
        image: offscreen.toDataURL("image/png"),
        cropX: Math.round(minX),
        cropY: Math.round(minY),
        cropWidth: Math.round(cropWidth),
        cropHeight: Math.round(cropHeight)
      };
    },

    /**
     * Retrieves the current panning translation values and zoom scale.
     */
    getViewportData: () => {
      const { panX, panY, zoom } = stateRef.current;
      return { panX, panY, zoom };
    }
  }));

  // Define canvas drawing subroutine
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const state = stateRef.current;

    // Fetch theme variables from document styling properties
    const cssStyles = getComputedStyle(document.body);
    const paperColor = cssStyles.getPropertyValue("--color-paper").trim() || "#ffffff";
    const inkColor = cssStyles.getPropertyValue("--color-text-dark").trim() || "#1f2937";
    const gridColor = cssStyles.getPropertyValue("--color-paper-grid").trim() || "rgba(0,0,0,0.06)";

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
      // Calculate visible bounds in logical coordinates
      const visLeft  = -(canvas.width / 2 + state.panX) / state.zoom + 10000;
      const visTop   = -(canvas.height / 2 + state.panY) / state.zoom + 10000;
      const visRight = (canvas.width / 2 - state.panX) / state.zoom + 10000;
      const visBottom = (canvas.height / 2 - state.panY) / state.zoom + 10000;

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

    // 4. Render current active stroke
    if (state.isDrawing && state.currentStroke.length > 0) {
      ctx.beginPath();
      ctx.moveTo(state.currentStroke[0].x, state.currentStroke[0].y);
      for (let i = 1; i < state.currentStroke.length; i++) {
        ctx.lineTo(state.currentStroke[i].x, state.currentStroke[i].y);
      }
      ctx.lineWidth = activeTool === "eraser" ? 24 : 3;
      ctx.strokeStyle = activeTool === "eraser" ? "rgba(239, 68, 68, 0.4)" : inkColor;
      ctx.stroke();
    }

    ctx.restore();
  };

  // Helper routine to draw array of strokes
  const strokesListRender = (ctx, strokes, inkColor, paperColor) => {
    strokes.forEach(stroke => {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.lineWidth = stroke.tool === "eraser" ? 24 : 3;
      ctx.strokeStyle = stroke.tool === "eraser" ? paperColor : (stroke.color || inkColor);
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
      const x = (clientX - window.innerWidth / 2 - state.panX) / state.zoom + 10000;
      const y = (clientY - window.innerHeight / 2 - state.panY) / state.zoom + 10000;
      return { x, y };
    };

    const handlePointerDown = (e) => {
      // Alternate brush mode drawing actions on click/touch
      const state = stateRef.current;
      
      // Pen/Eraser acts on primary click
      if (e.button === 0 && (activeTool === "pen" || activeTool === "eraser")) {
        state.isDrawing = true;
        const globalPos = toGlobalCoords(e.clientX, e.clientY);
        state.currentStroke = [globalPos];
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
        state.panX += dx;
        state.panY += dy;
        state.lastPointerPos = { x: e.clientX, y: e.clientY };
        drawCanvas();
        if (onViewportChangeRef.current) {
          onViewportChangeRef.current({ panX: state.panX, panY: state.panY, zoom: state.zoom });
        }
      }
    };

    const handlePointerUp = () => {
      const state = stateRef.current;
      if (state.isDrawing) {
        state.isDrawing = false;
        if (state.currentStroke.length > 1) {
          // Commit stroke to memory list with timestamp for temporal segmentation
          state.strokes.push({
            points: [...state.currentStroke],
            tool: activeTool,
            color: activeTool === "eraser" ? null : null, // fallback dynamic theme colors
            timestamp: Date.now()
          });
        }
        state.currentStroke = [];
        drawCanvas();
        if (onDrawFinishedRef.current) onDrawFinishedRef.current();
      }
      state.isPanning = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const state = stateRef.current;
      const zoomFactor = 1.08;
      
      // Calculate dynamic mouse focus position zoom updates
      if (e.deltaY < 0) {
        state.zoom = Math.min(state.zoom * zoomFactor, 3.5);
      } else {
        state.zoom = Math.max(state.zoom / zoomFactor, 0.15);
      }
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

export default Canvas;
