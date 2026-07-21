import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  PenTool, 
  Eraser, 
  MousePointer, 
  Type, 
  Undo2, 
  Redo2, 
  Download, 
  RefreshCw 
} from "lucide-react";
import Canvas from "./components/Canvas.jsx";

function App() {
  const [theme, setTheme] = useState("arcane");
  const [activeTool, setActiveTool] = useState("pen");
  const [reasoning, setReasoning] = useState("medium");
  const [status, setStatus] = useState("ready");
  
  // React state for tracking AI drafts (which are declarative overlays)
  const [drafts, setDrafts] = useState([
    {
      id: "scaffold-welcome",
      x: 10500, // global coordinates
      y: 9800,
      width: 350,
      height: 180,
      text: "### PenEcho Clone\nDraw inside the canvas or type text. Use the Magic Orb to trigger AI reasoning (Gemini API)!"
    }
  ]);

  // Synchronize CSS body data-theme attribute
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  // Handler to trigger the AI call
  const handleTriggerAI = async () => {
    if (status !== "ready") return;
    
    setStatus("observing");
    
    try {
      // TODO: Gather canvas visual crops + ink coordinates from the Canvas renderer ref,
      // and send them to the backend server '/api/canvas-ai' endpoint.
      console.log("Triggering AI request with reasoning effort:", reasoning);
      
      const response = await fetch("/api/canvas-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Help me solve or continue this",
          intent: "auto",
          reasoningEffort: reasoning
        })
      });
      
      setStatus("writing");
      const data = await response.json();
      
      // Place draft items returned from Express server
      if (data.commands) {
        const newDrafts = data.commands.map((cmd, index) => ({
          id: `ai-draft-${Date.now()}-${index}`,
          x: cmd.x,
          y: cmd.y,
          width: cmd.maxWidth || 300,
          height: 150,
          text: cmd.text
        }));
        setDrafts(prev => [...prev, ...newDrafts]);
      }
      
      setStatus("ready");
    } catch (err) {
      console.error("AI trigger failed:", err);
      setStatus("ready");
    }
  };

  const handleClearCanvas = () => {
    if (window.confirm("Clear the entire canvas?")) {
      // TODO: Dispatch clear action to canvas renderer ref
      setDrafts([]);
    }
  };

  const handleAcceptDraft = (id) => {
    // TODO: Write draft text/strokes permanently onto the canvas tiles
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const handleDiscardDraft = (id) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="app-container">
      {/* Top Header Chrome */}
      <header className="topbar chrome-container">
        <div className="brand-section">
          <div className="brand-sigil">✨</div>
          <div className="brand-title">
            <span>Pen</span><strong>Echo</strong>
          </div>
        </div>

        <div className="toolbar-controls">
          {/* Status Display */}
          <div className="control-btn" style={{ cursor: "default" }}>
            {status === "ready" && "Ready"}
            {status === "observing" && <><span className="loading-spinner"></span> Observing...</>}
            {status === "writing" && <><span className="loading-spinner"></span> Writing...</>}
          </div>

          {/* Reasoning Control */}
          <select 
            className="control-btn" 
            value={reasoning} 
            onChange={(e) => setReasoning(e.target.value)}
          >
            <option value="none">Reasoning: None</option>
            <option value="low">Reasoning: Low</option>
            <option value="medium">Reasoning: Medium</option>
            <option value="high">Reasoning: High</option>
            <option value="max">Reasoning: Max</option>
          </select>

          {/* Theme Selector */}
          <select 
            className="control-btn" 
            value={theme} 
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="arcane">Arcane</option>
            <option value="scifi">Sci-fi</option>
            <option value="research">Research</option>
            <option value="studio">Studio</option>
          </select>
        </div>
      </header>

      {/* Main Canvas Workspace */}
      <Canvas 
        activeTool={activeTool} 
        theme={theme} 
        onDrawFinished={() => {
          // Trigger automatic AI if desired
        }}
      />

      {/* Declarative AI Drafts Overlay */}
      <div className="drafts-overlay-layer">
        {drafts.map((draft) => {
          // Example positioning translation relative to viewport pan/zoom
          // The canvas component can expose values or we can absolute position them in local units
          return (
            <div 
              key={draft.id} 
              className="draft-item"
              style={{
                left: `${(draft.x - 10000) + window.innerWidth / 2}px`, // basic coordinate offset for demo
                top: `${(draft.y - 10000) + window.innerHeight / 2}px`,
                width: `${draft.width}px`
              }}
            >
              <div style={{ marginBottom: "8px", fontSize: "14px" }}>
                {draft.text}
              </div>
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button 
                  onClick={() => handleDiscardDraft(draft.id)}
                  style={{ padding: "4px 8px", cursor: "pointer", background: "none", border: "1px solid #ff4444", borderRadius: "4px", color: "#ff4444" }}
                >
                  Discard
                </button>
                <button 
                  onClick={() => handleAcceptDraft(draft.id)}
                  style={{ padding: "4px 8px", cursor: "pointer", background: "var(--color-accent)", border: "none", borderRadius: "4px", color: "white" }}
                >
                  Accept
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Left Dock Tools */}
      <div className="tool-dock chrome-container">
        <button 
          className={`tool-item ${activeTool === "pen" ? "active" : ""}`} 
          onClick={() => setActiveTool("pen")}
          title="Pen Tool"
        >
          <PenTool size={20} />
        </button>
        <button 
          className={`tool-item ${activeTool === "eraser" ? "active" : ""}`} 
          onClick={() => setActiveTool("eraser")}
          title="Eraser Tool"
        >
          <Eraser size={20} />
        </button>
        <button 
          className={`tool-item ${activeTool === "lasso" ? "active" : ""}`} 
          onClick={() => setActiveTool("lasso")}
          title="Lasso Selection"
        >
          <MousePointer size={20} />
        </button>
        <button 
          className={`tool-item ${activeTool === "text" ? "active" : ""}`} 
          onClick={() => setActiveTool("text")}
          title="Text Tool"
        >
          <Type size={20} />
        </button>
        <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
        <button className="tool-item" onClick={handleClearCanvas} title="Clear Board">
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Right floating Magic Orb to invoke AI manually */}
      <div 
        className="ai-magic-orb" 
        onClick={handleTriggerAI}
        title="Summon AI Reasoning"
      >
        <Sparkles size={28} />
      </div>
    </div>
  );
}

export default App;
