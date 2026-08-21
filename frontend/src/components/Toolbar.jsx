import React, { useState, useEffect } from "react";
import {
  Lock,
  Unlock,
  Hand,
  MousePointer,
  Square,
  Diamond,
  Circle,
  ArrowRight,
  Minus,
  PenTool,
  Eraser,
  MoreVertical,
  Copy,
  Scissors,
  Trash2
} from "lucide-react";

export default function Toolbar({
  activeTool,
  setActiveTool,
  isLocked,
  setIsLocked,
  onAction
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs or contenteditables
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
        e.target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.key === "1" || key === "v") setActiveTool("select");
      else if (e.key === "2" || key === "r") setActiveTool("rect");
      else if (e.key === "3" || key === "d") setActiveTool("diamond");
      else if (e.key === "4" || key === "o") setActiveTool("ellipse");
      else if (e.key === "5" || key === "a") setActiveTool("arrow");
      else if (e.key === "6" || key === "l") setActiveTool("line");
      else if (e.key === "7" || key === "p") setActiveTool("pen");
      else if (e.key === "0" || key === "e") setActiveTool("eraser");
      else if (key === "h") setActiveTool("hand");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool]);

  const tools = [
    { id: "select", label: "Selection", icon: MousePointer, key: "1" },
    { id: "rect", label: "Rectangle", icon: Square, key: "2" },
    { id: "diamond", label: "Diamond", icon: Diamond, key: "3" },
    { id: "ellipse", label: "Ellipse", icon: Circle, key: "4" },
    { id: "arrow", label: "Arrow", icon: ArrowRight, key: "5" },
    { id: "line", label: "Line", icon: Minus, key: "6" },
    { id: "pen", label: "Draw", icon: PenTool, key: "7" },
    { id: "eraser", label: "Eraser", icon: Eraser, key: "0" },
    { id: "hand", label: "Hand (Pan)", icon: Hand, key: "H" }
  ];

  return (
    <div className="main-toolbar" style={{
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      borderRadius: "10px",
      background: "rgba(255, 255, 255, 0.08)",
      border: "1px solid rgba(255, 255, 255, 0.12)"
    }}>
      {/* Lock Toggle Button */}
      <button
        className={`tool-item ${isLocked ? "active" : ""}`}
        onClick={() => setIsLocked(prev => !prev)}
        title={isLocked ? "Keep tool active after drawing" : "Auto-revert to Selection after drawing"}
        style={{ padding: "6px", borderRadius: "6px", border: "none", cursor: "pointer" }}
      >
        {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
      </button>

      <div style={{ width: "1px", height: "18px", background: "var(--color-chrome-border)", margin: "0 2px" }} />

      {/* Main Tool Buttons */}
      {tools.map(tool => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            className={`tool-item ${isActive ? "active" : ""}`}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} (${tool.key})`}
            style={{
              position: "relative",
              padding: "6px 8px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isActive ? "rgba(113, 97, 239, 0.16)" : "transparent",
              color: isActive ? "var(--color-accent)" : "inherit",
              border: isActive ? "1px solid var(--color-accent)" : "1px solid transparent",
              boxShadow: isActive ? "0 2px 8px rgba(113, 97, 239, 0.2)" : "none",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
            }}
          >
            <Icon size={16} style={{ color: isActive ? "var(--color-accent)" : "inherit" }} />
            <span style={{
              position: "absolute",
              bottom: "1px",
              right: "3px",
              fontSize: "8px",
              fontWeight: "bold",
              color: isActive ? "var(--color-accent)" : "inherit",
              opacity: isActive ? 1 : 0.55
            }}>
              {tool.key}
            </span>
          </button>
        );
      })}

      <div style={{ width: "1px", height: "18px", background: "var(--color-chrome-border)", margin: "0 2px" }} />

      {/* More Options Overflow Menu */}
      <div style={{ position: "relative" }}>
        <button
          className="tool-item"
          onClick={() => setIsMenuOpen(prev => !prev)}
          title="More options"
          style={{ padding: "6px", borderRadius: "6px", border: "none", cursor: "pointer" }}
        >
          <MoreVertical size={16} />
        </button>

        {isMenuOpen && (
          <div className="overflow-menu chrome-container" style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            padding: "6px",
            minWidth: "140px",
            borderRadius: "10px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            zIndex: 9001
          }}>
            <button className="orb-action-btn" onClick={() => { onAction("duplicate"); setIsMenuOpen(false); }}>
              <Copy size={15} /> <span>Duplicate</span>
            </button>
            <button className="orb-action-btn" onClick={() => { onAction("cut"); setIsMenuOpen(false); }}>
              <Scissors size={15} /> <span>Cut</span>
            </button>
            <button className="orb-action-btn" onClick={() => { onAction("delete"); setIsMenuOpen(false); }}>
              <Trash2 size={15} /> <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
