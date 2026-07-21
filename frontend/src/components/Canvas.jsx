import React, { useRef, useEffect } from "react";

function Canvas({ activeTool, theme, onDrawFinished }) {
  const canvasRef = useRef(null);
  
  // Keep coordinate, translation, and stroke data in imperative refs
  // to avoid causing React re-renders on every animation frame/pointer move.
  const stateRef = useRef({
    isDrawing: false,
    panX: 0,
    panY: 0,
    zoom: 1.0,
    strokes: [], // list of user drawn lines/shapes
    currentStroke: [],
    lastPointerPos: { x: 0, y: 0 },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Handle viewport resize
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawCanvas();
    };

    // Imperative drawing function called on frame update / mouse move
    const drawCanvas = () => {
      // Clear screen
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      // Apply zoom & pan translation transformations
      ctx.translate(canvas.width / 2 + stateRef.current.panX, canvas.height / 2 + stateRef.current.panY);
      ctx.scale(stateRef.current.zoom, stateRef.current.zoom);

      // 1. Draw logical paper border (e.g. 20000x20000 limit)
      ctx.strokeStyle = "var(--color-chrome-border)";
      ctx.lineWidth = 4;
      ctx.strokeRect(-10000, -10000, 20000, 20000);

      // 2. Draw all existing strokes
      ctx.lineWidth = activeTool === "eraser" ? 20 : 3;
      stateRef.current.strokes.forEach(stroke => {
        if (stroke.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.strokeStyle = stroke.color || "#1f2937";
        ctx.stroke();
      });

      // 3. Draw active/current stroke
      if (stateRef.current.isDrawing && stateRef.current.currentStroke.length > 1) {
        ctx.beginPath();
        ctx.moveTo(stateRef.current.currentStroke[0].x, stateRef.current.currentStroke[0].y);
        for (let i = 1; i < stateRef.current.currentStroke.length; i++) {
          ctx.lineTo(stateRef.current.currentStroke[i].x, stateRef.current.currentStroke[i].y);
        }
        ctx.strokeStyle = activeTool === "eraser" ? "rgba(255, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.7)";
        ctx.stroke();
      }

      ctx.restore();
    };

    // Helper: Map viewport coordinates to logical global canvas coordinates
    const toGlobalCoords = (clientX, clientY) => {
      const state = stateRef.current;
      const x = (clientX - window.innerWidth / 2 - state.panX) / state.zoom;
      const y = (clientY - window.innerHeight / 2 - state.panY) / state.zoom;
      return { x, y };
    };

    // Event handlers attached directly to DOM (imperative logic)
    const handlePointerDown = (e) => {
      // Draw with primary button (stylus/mouse left click)
      if (e.button === 0 && (activeTool === "pen" || activeTool === "eraser")) {
        stateRef.current.isDrawing = true;
        const globalPos = toGlobalCoords(e.clientX, e.clientY);
        stateRef.current.currentStroke = [globalPos];
      } else {
        // Pan with right click or middle click
        stateRef.current.isPanning = true;
        stateRef.current.lastPointerPos = { x: e.clientX, y: e.clientY };
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
      }
    };

    const handlePointerUp = () => {
      const state = stateRef.current;
      if (state.isDrawing) {
        state.isDrawing = false;
        if (state.currentStroke.length > 0) {
          state.strokes.push([...state.currentStroke]);
        }
        state.currentStroke = [];
        drawCanvas();
        if (onDrawFinished) onDrawFinished();
      }
      state.isPanning = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const state = stateRef.current;
      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        state.zoom = Math.min(state.zoom * zoomFactor, 4.0);
      } else {
        state.zoom = Math.max(state.zoom / zoomFactor, 0.1);
      }
      drawCanvas();
    };

    // Register event listeners
    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    // Initial setup
    resizeCanvas();

    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [activeTool, theme, onDrawFinished]);

  return (
    <div className="canvas-wrapper">
      <canvas 
        ref={canvasRef} 
        className="imperative-canvas"
      />
    </div>
  );
}

export default Canvas;
