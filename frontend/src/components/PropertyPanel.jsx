import React from "react";
import { Activity, Sliders } from "lucide-react";

const STROKE_SWATCHES = [
  "#2e231d", // Dark Walnut / Theme Ink
  "#e63946", // Red
  "#2a9d8f", // Teal
  "#457b9d", // Blue
  "#7161ef"  // Purple
];

const FILL_SWATCHES = [
  "transparent",
  "#f4a26133", // Soft Orange
  "#2a9d8f33", // Soft Teal
  "#e6394633", // Soft Red
  "#7161ef33"  // Soft Purple
];

export default function PropertyPanel({
  activeTool,
  selectedElements = [],
  currentStyle,
  onStyleChange
}) {
  // Hide panel if selection tool active and nothing selected
  const hasSelection = selectedElements.length > 0;
  const targetTool = hasSelection ? selectedElements[0].elementType || "pen" : activeTool;

  if (activeTool === "hand" || (activeTool === "select" && !hasSelection)) {
    return null;
  }

  const showBackground = ["rect", "diamond", "ellipse"].includes(targetTool);

  const strokeColor = (currentStyle && typeof currentStyle.strokeColor === "string") ? currentStyle.strokeColor : "#2e231d";
  const backgroundColor = (currentStyle && typeof currentStyle.backgroundColor === "string") ? currentStyle.backgroundColor : "transparent";
  const strokeWidth = (currentStyle && typeof currentStyle.strokeWidth === "number") ? currentStyle.strokeWidth : 3;
  const strokeStyle = (currentStyle && currentStyle.strokeStyle) || "solid";
  const opacity = (currentStyle && typeof currentStyle.opacity === "number" && Number.isFinite(currentStyle.opacity)) ? currentStyle.opacity : 100;
  const eraserSize = (currentStyle && typeof currentStyle.eraserSize === "number" && Number.isFinite(currentStyle.eraserSize)) ? currentStyle.eraserSize : 24;

  if (targetTool === "eraser") {
    return (
      <div className="property-panel chrome-container" style={{
        position: "fixed",
        top: "96px",
        left: "16px",
        zIndex: 8900,
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        width: "240px",
        boxSizing: "border-box",
        borderRadius: "12px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)"
      }}>
        <div style={{ fontSize: "12px", fontWeight: "bold", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Eraser Settings
        </div>

        {/* Eraser Size Presets */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>Eraser Size</div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
            {[
              { val: 12, label: "Small" },
              { val: 24, label: "Medium" },
              { val: 48, label: "Large" }
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => onStyleChange({ eraserSize: opt.val })}
                className={`control-btn ${eraserSize === opt.val ? "active" : ""}`}
                style={{
                  flex: 1,
                  height: "32px",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "600", marginBottom: "6px" }}>
            <span>Diameter</span>
            <span>{eraserSize}px</span>
          </div>

          <input
            type="range"
            min="8"
            max="64"
            value={eraserSize}
            onChange={(e) => onStyleChange({ eraserSize: parseInt(e.target.value, 10) })}
            style={{ width: "100%", accentColor: "var(--color-accent)", cursor: "pointer" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="property-panel chrome-container" style={{
      position: "fixed",
      top: "96px",
      left: "16px",
      zIndex: 8900,
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      width: "240px",
      boxSizing: "border-box",
      borderRadius: "12px",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)"
    }}>
      <div style={{ fontSize: "12px", fontWeight: "bold", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {hasSelection ? `${selectedElements.length} Selected` : `${targetTool.toUpperCase()} Style`}
      </div>

      {/* Stroke Color */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>Stroke</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {STROKE_SWATCHES.map(color => (
            <button
              key={color}
              onClick={() => onStyleChange({ strokeColor: color, isCustomColor: true })}
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: color,
                border: strokeColor === color ? "2px solid var(--color-accent)" : "1px solid rgba(0,0,0,0.15)",
                outline: strokeColor === color ? "2px solid var(--sigil-glow)" : "none",
                cursor: "pointer"
              }}
            />
          ))}
          <input
            type="color"
            value={typeof strokeColor === "string" && strokeColor.startsWith("#") ? strokeColor.slice(0, 7) : "#2e231d"}
            onChange={(e) => onStyleChange({ strokeColor: e.target.value, isCustomColor: true })}
            style={{ width: "24px", height: "24px", padding: 0, border: "none", background: "none", cursor: "pointer" }}
            title="Custom stroke color"
          />
        </div>
      </div>

      {/* Background Fill (closed shapes only) */}
      {showBackground && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>Background</div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {FILL_SWATCHES.map(color => (
              <button
                key={color}
                onClick={() => onStyleChange({ backgroundColor: color })}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  background: color === "transparent"
                    ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px"
                    : color,
                  border: backgroundColor === color ? "2px solid var(--color-accent)" : "1px solid rgba(0,0,0,0.15)",
                  outline: backgroundColor === color ? "2px solid var(--sigil-glow)" : "none",
                  cursor: "pointer"
                }}
                title={color === "transparent" ? "Transparent" : color}
              />
            ))}
            <input
              type="color"
              value={typeof backgroundColor === "string" && backgroundColor.startsWith("#") ? backgroundColor.slice(0, 7) : "#ffffff"}
              onChange={(e) => onStyleChange({ backgroundColor: e.target.value + "66" })}
              style={{ width: "24px", height: "24px", padding: 0, border: "none", background: "none", cursor: "pointer" }}
              title="Custom fill color"
            />
          </div>
        </div>
      )}

      {/* Stroke Width (3 discrete bars) */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>Stroke Width</div>
        <div style={{ display: "flex", gap: "8px" }}>
          {[
            { val: 2, label: "Thin", barHeight: "2px" },
            { val: 4, label: "Medium", barHeight: "4px" },
            { val: 8, label: "Thick", barHeight: "7px" }
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => onStyleChange({ strokeWidth: opt.val })}
              className={`control-btn ${strokeWidth === opt.val ? "active" : ""}`}
              style={{
                flex: 1,
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 8px",
                borderRadius: "6px",
                cursor: "pointer"
              }}
              title={opt.label}
            >
              <div style={{ width: "100%", height: opt.barHeight, background: "currentColor", borderRadius: "2px" }} />
            </button>
          ))}
        </div>
      </div>

      {/* Pressure / Stroke Style Option A */}
      <div>
        <div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>Stroke Pressure</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => onStyleChange({ strokeStyle: "solid" })}
            className={`control-btn ${strokeStyle === "solid" ? "active" : ""}`}
            style={{ flex: 1, padding: "6px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            <Sliders size={14} /> Uniform
          </button>
          <button
            onClick={() => onStyleChange({ strokeStyle: "pressure" })}
            className={`control-btn ${strokeStyle === "pressure" ? "active" : ""}`}
            style={{ flex: 1, padding: "6px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
          >
            <Activity size={14} /> Tapered
          </button>
        </div>
      </div>

      {/* Opacity Slider */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>
          <span>Opacity</span>
          <span>{opacity}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={opacity}
          onChange={(e) => onStyleChange({ opacity: parseInt(e.target.value, 10) })}
          style={{ width: "100%", accentColor: "var(--color-accent)", cursor: "pointer" }}
        />
      </div>
    </div>
  );
}
