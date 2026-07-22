import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  PenTool, 
  Eraser, 
  MousePointer, 
  Undo, 
  RotateCcw, 
  Settings,
  CircleAlert,
  HelpCircle,
  FastForward,
  BookOpen,
  CheckCircle2,
  LineChart,
  CheckCheck,
  Type
} from "lucide-react";
import Canvas from "./components/Canvas.jsx";

function App() {
  const canvasRef = useRef(null);
  const autoTriggerTimer = useRef(null);
  const statusRef = useRef("ready"); // mirror of status state for use inside timers (avoids stale closures)
  
  // React State variables
  const [theme, setTheme] = useState("arcane");
  const [activeTool, setActiveTool] = useState("pen");
  const [reasoning, setReasoning] = useState("medium");
  const [status, setStatus] = useState("ready");
  const [errorMessage, setErrorMessage] = useState(null);
  const [isOrbMenuOpen, setIsOrbMenuOpen] = useState(false);

  const errorTimeoutRef = useRef(null);

  // Custom function to show graceful on-screen toast messages instead of browser alerts
  const showError = (msg) => {
    setErrorMessage(msg);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
    }, 6000);
  };

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  // Keep statusRef in sync with status state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  
  // Track high-frequency pan & zoom state to transform overlay layer dynamically
  const [viewport, setViewport] = useState({ panX: 0, panY: 0, zoom: 1.0 });
  
  // List of active AI drafts overlay objects
  const [drafts, setDrafts] = useState([]);

  // Apply visual theme to the document body element
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  // Redraw LaTeX equations when draft list updates
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [drafts]);

  // Hook up viewport callback triggers from the child drawing board
  const handleViewportChange = (vp) => {
    setViewport(vp);
  };

  // Auto-trigger AI after 2.5s of drawing inactivity
  const handleDrawFinished = () => {
    // Clear any existing pending timer
    if (autoTriggerTimer.current) {
      clearTimeout(autoTriggerTimer.current);
    }
    // Set a new timer — if user doesn't draw again within 2.5s, trigger AI
    autoTriggerTimer.current = setTimeout(() => {
      if (statusRef.current === "ready" && canvasRef.current) {
        handleTriggerAI();
      }
    }, 2500);
  };

  // Triggers API pipeline request to the backend server with optional prompt modes
  const handleTriggerAI = async (mode = "auto") => {
    if (status !== "ready") return;
    setIsOrbMenuOpen(false); // Close menu if open

    const cropData = canvasRef.current.captureCrop();
    if (!cropData || !cropData.image) {
      showError("Please write or draw something on the canvas first!");
      return;
    }

    setStatus("observing");

    // Formulate custom prompt text based on user's selected mode
    let customPromptText = "Analyze the handwriting/drawings in the visual crop and provide responses/continuations.";
    if (mode === "hint") {
      customPromptText = "Provide a subtle, encouraging hint for the next step of the equation/drawing. Do not reveal the full answer.";
    } else if (mode === "continue") {
      customPromptText = "Continue the next logical line/step of the equation or diagram.";
    } else if (mode === "explain") {
      customPromptText = "Explain the step-by-step mathematical reasoning and core concept behind the canvas content clearly.";
    } else if (mode === "plot") {
      customPromptText = "Generate a mathematical function plot (plot_function) or diagram for the equation or data on canvas.";
    } else if (mode === "check") {
      customPromptText = "Check and verify the math/writing for errors. Point out mistakes or confirm correctness.";
    } else if (mode === "typeset") {
      customPromptText = "Typeset and clean up the handwritten text/math into clean machine-rendered text.";
    } else if (mode === "answer") {
      customPromptText = "Solve the problem fully and show the final answer step-by-step.";
    }

    try {
      // 2. Fetch structured drawing/text commands from Express server
      const response = await fetch("/api/canvas-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: cropData.image,
          cropX: cropData.cropX,
          cropY: cropData.cropY,
          cropWidth: cropData.cropWidth,
          cropHeight: cropData.cropHeight,
          text: customPromptText,
          mode: mode,
          intent: (mode === "typeset" || activeTool === "lasso" || cropData.selectionContext) ? "typeset" : (mode === "plot" ? "plot" : "auto")
        })
      });

      setStatus("writing");
      const data = await response.json();

      if (data.error) {
        throw new Error(data.detail || data.error);
      }

      // 3. Convert returned commands (write_text, draw, draw_formula) to overlay draft cards
      if (data.commands && data.commands.length > 0) {
        const newDrafts = data.commands.map((cmd, index) => {
          let content = "";
          
          if (cmd.tool === "write_text") {
            content = cmd.text;
          } else if (cmd.tool === "draw_formula") {
            // Render Math equations wrapped in LaTeX delimiters
            content = `$$${cmd.latex}$$`;
          } else if (cmd.tool === "plot_function") {
            content = `Plotting Function: ${cmd.expression}`;
          } else {
            content = `AI Stroke/Draw Path [${cmd.tool}]`;
          }

          let x = cmd.x;
          let y = cmd.y;

          // Fallback: If coordinates are out of bounds or missing, 
          // position the draft card directly to the right of the drawing crop
          const isInvalidX = (!x || x < 100 || x > 19900);
          const isInvalidY = (!y || y < 100 || y > 19900);

          if (isInvalidX || isInvalidY) {
            x = cropData.cropX + cropData.cropWidth + 30;
            y = cropData.cropY + (index * 40);

            // Double fallback: if crop coordinates are missing, center in viewport
            if (isNaN(x) || x < 100 || x > 19900) {
              x = 10000 - viewport.panX / viewport.zoom + (index * 40);
              y = 10000 - viewport.panY / viewport.zoom + (index * 40);
            }
          }

          return {
            id: `draft-${Date.now()}-${index}`,
            x,
            y,
            width: cmd.maxWidth || 260,
            text: content,
            rawCommand: cmd // keep command references for canvas writing later
          };
        });

        setDrafts(prev => [...prev, ...newDrafts]);
      } else {
        showError("Gemini returned no commands. Try writing a clearer prompt.");
      }

      setStatus("ready");

    } catch (error) {
      console.error("Gemini AI request failed:", error);
      showError(`AI Error: ${error.message}`);
      setStatus("ready");
    }
  };

  const handleClear = () => {
    if (window.confirm("Clear the entire canvas workspace and drafts?")) {
      canvasRef.current.clearCanvas();
      setDrafts([]);
    }
  };

  const handleAcceptDraft = (id) => {
    const draft = drafts.find(d => d.id === id);
    if (draft && draft.rawCommand) {
      if (draft.rawCommand.tool === "draw") {
        // Bake the vector shape into permanent canvas strokes
        canvasRef.current.bakeDrawCommand(draft.rawCommand);
        setDrafts(prev => prev.filter(d => d.id !== id));
      } else if (draft.rawCommand.tool === "plot_function") {
        // Bake the function plot curve & axes into permanent canvas strokes
        canvasRef.current.bakePlotCommand(draft.rawCommand);
        setDrafts(prev => prev.filter(d => d.id !== id));
      } else {
        // Keep draft on screen permanently by marking it accepted
        setDrafts(prev => prev.map(d => d.id === id ? { ...d, accepted: true } : d));
      }
    }
  };

  const handleDiscardDraft = (id) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="app-container" style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* 1. Glassmorphic Top Controls Bar */}
      <header className="topbar chrome-container">
        <div className="brand-section">
          <div className="brand-sigil">✨</div>
          <div className="brand-title">
            <span>Voldy's</span><strong>Diary</strong>
          </div>
        </div>

        <div className="toolbar-controls">
          {/* AI Status Indicator */}
          <div className="control-btn" style={{ cursor: "default" }}>
            {status === "ready" && <><Sparkles size={14} style={{ color: "var(--color-accent)" }} /> Ready</>}
            {status === "observing" && <><span className="loading-spinner"></span> Observing...</>}
            {status === "writing" && <><span className="loading-spinner"></span> Writing...</>}
          </div>

          {/* Reasoning Settings */}
          <select 
            className="control-btn" 
            value={reasoning} 
            onChange={(e) => setReasoning(e.target.value)}
          >
            <option value="none">Effort: None</option>
            <option value="low">Effort: Low</option>
            <option value="medium">Effort: Medium</option>
            <option value="high">Effort: High</option>
            <option value="max">Effort: Max</option>
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

      {/* Graceful Toast notification banner (replaces window.alert) */}
      {errorMessage && (
        <div className="toast-notification chrome-container" style={{
          position: "fixed",
          top: "96px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 20px",
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.45)",
          color: "#f87171",
          borderRadius: "10px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          fontSize: "14px",
          maxWidth: "90%",
          width: "max-content",
          pointerEvents: "auto",
          animation: "fade-in 0.25s ease"
        }}>
          <CircleAlert size={16} />
          <span>{errorMessage}</span>
          <button 
            onClick={() => setErrorMessage(null)} 
            style={{
              background: "transparent",
              border: "none",
              color: "#f87171",
              cursor: "pointer",
              marginLeft: "10px",
              fontSize: "14px",
              fontWeight: "bold",
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Interactive Canvas Component */}
      <Canvas 
        ref={canvasRef}
        activeTool={activeTool} 
        theme={theme}
        onViewportChange={handleViewportChange}
        onDrawFinished={handleDrawFinished}
        drafts={drafts}
      />

      {/* 3. GPU-Accelerated Absolute Positioning Draft Layer */}
      <div 
        className="drafts-overlay-layer"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          pointerEvents: "none"
        }}
      >
        {drafts.map((draft) => (
          <div 
            key={draft.id} 
            className={`draft-item ${draft.accepted ? "accepted" : ""}`}
            style={{
              position: "absolute",
              left: `${draft.x - 10000}px`,
              top: `${draft.y - 10000}px`,
              width: `${draft.width}px`,
              pointerEvents: draft.accepted ? "none" : "auto"
            }}
          >
            <div style={{ fontSize: "14px", lineHeight: "1.4" }} className="draft-content">
              {draft.text}
            </div>
            
            {!draft.accepted && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                <button 
                  onClick={() => handleDiscardDraft(draft.id)}
                  style={{
                    padding: "4px 10px", 
                    cursor: "pointer", 
                    background: "transparent", 
                    border: "1px solid rgba(239, 68, 68, 0.4)", 
                    borderRadius: "6px", 
                    color: "#ef4444",
                    fontSize: "12px",
                    fontWeight: "600"
                  }}
                >
                  Discard
                </button>
                <button 
                  onClick={() => handleAcceptDraft(draft.id)}
                  style={{
                    padding: "4px 10px", 
                    cursor: "pointer", 
                    background: "var(--color-accent)", 
                    border: "none", 
                    borderRadius: "6px", 
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: "600"
                  }}
                >
                  Accept
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 4. Left Sidebar Tool Dock */}
      <div className="tool-dock chrome-container">
        <button 
          className={`tool-item ${activeTool === "pen" ? "active" : ""}`} 
          onClick={() => setActiveTool("pen")}
          title="Drawing Pen"
        >
          <PenTool size={18} />
        </button>
        <button 
          className={`tool-item ${activeTool === "eraser" ? "active" : ""}`} 
          onClick={() => setActiveTool("eraser")}
          title="Eraser brush"
        >
          <Eraser size={18} />
        </button>
        <button 
          className={`tool-item ${activeTool === "lasso" ? "active" : ""}`} 
          onClick={() => setActiveTool("lasso")}
          title="Lasso Selection"
        >
          <MousePointer size={18} />
        </button>
        
        <hr style={{ border: "none", borderTop: "1px solid var(--color-chrome-border)", margin: "4px 0" }} />
        
        <button 
          className="tool-item" 
          onClick={handleClear}
          title="Clear Board"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* 5. Glowing Magic AI Orb with Interactive Action Menu */}
      <div className="ai-orb-container">
        {/* Interactive Radial Popover Action Menu */}
        {isOrbMenuOpen && (
          <div className="ai-orb-menu chrome-container">
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("hint")}
              title="Get a helpful hint"
            >
              <HelpCircle size={16} />
              <span>Hint</span>
            </button>
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("continue")}
              title="Continue next step"
            >
              <FastForward size={16} />
              <span>Continue</span>
            </button>
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("explain")}
              title="Explain reasoning"
            >
              <BookOpen size={16} />
              <span>Explain</span>
            </button>
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("plot")}
              title="Plot function / graph"
            >
              <LineChart size={16} />
              <span>Plot</span>
            </button>
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("check")}
              title="Verify & check for errors"
            >
              <CheckCheck size={16} />
              <span>Check</span>
            </button>
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("typeset")}
              title="Clean up handwriting into text"
            >
              <Type size={16} />
              <span>Typeset</span>
            </button>
            <button 
              className="orb-action-btn" 
              onClick={() => handleTriggerAI("answer")}
              title="Solve & show final answer"
            >
              <CheckCircle2 size={16} />
              <span>Solve</span>
            </button>
          </div>
        )}

        <div 
          className={`ai-magic-orb ${isOrbMenuOpen ? "active-menu" : ""}`} 
          onClick={() => setIsOrbMenuOpen(prev => !prev)}
          title="Click to select AI action (Hint, Continue, Explain, Solve)"
        >
          <Sparkles size={28} />
        </div>
      </div>
    </div>
  );
}

export default App;
