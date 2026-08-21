import React from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

export default function ZoomControl({ zoom, onZoomChange, onReset }) {
  const percentage = Math.round((zoom || 1.0) * 100);

  const handleZoomIn = () => {
    const nextZoom = Math.min(Math.round((zoom + 0.1) * 10) / 10, 3.5);
    onZoomChange(nextZoom);
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(Math.round((zoom - 0.1) * 10) / 10, 0.15);
    onZoomChange(nextZoom);
  };

  return (
    <div className="zoom-control chrome-container" style={{
      position: "fixed",
      bottom: "24px",
      left: "24px",
      zIndex: 8900,
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      borderRadius: "10px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)"
    }}>
      <button
        className="tool-item"
        onClick={handleZoomOut}
        title="Zoom out (10%)"
        style={{ padding: "6px", borderRadius: "6px", border: "none", cursor: "pointer" }}
      >
        <Minus size={16} />
      </button>

      <button
        className="tool-item"
        onClick={onReset}
        title="Reset zoom to 100%"
        style={{
          padding: "4px 10px",
          borderRadius: "6px",
          border: "none",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "600",
          minWidth: "54px"
        }}
      >
        {percentage}%
      </button>

      <button
        className="tool-item"
        onClick={handleZoomIn}
        title="Zoom in (10%)"
        style={{ padding: "6px", borderRadius: "6px", border: "none", cursor: "pointer" }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
