import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  CircleAlert,
  RotateCcw,
  BotOff,
  HelpCircle,
  FastForward,
  BookOpen,
  CheckCircle2,
  LineChart,
  CheckCheck,
  Type,
  Sun,
  Moon,
  Zap,
  Brain
} from "lucide-react";
import Canvas from "./components/Canvas.jsx";
import Toolbar from "./components/Toolbar.jsx";
import PropertyPanel from "./components/PropertyPanel.jsx";
import ZoomControl from "./components/ZoomControl.jsx";
import CustomSelect from "./components/CustomSelect.jsx";
import VoldemortSigil from "./components/VoldemortSigil.jsx";
import { 
  saveSessionState, 
  loadSessionState, 
  clearSessionState, 
  subscribeToCrossTabSync,
  normalizeReasoningLevel,
  normalizeTheme
} from "./utils/storage.js";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const THEME_OPTIONS = [
  { value: "arcane", label: "Arcane Parchment", icon: <Sun size={15} style={{ color: "#d97706" }} />, description: "Warm parchment paper theme" },
  { value: "studio", label: "Studio Void", icon: <Moon size={15} style={{ color: "#957fef" }} />, description: "Sleek dark void theme" }
];

const REASONING_OPTIONS = [
  { value: "normal", label: "Fast Thinking", icon: <Zap size={15} style={{ color: "#eab308" }} />, description: "Quick & responsive math solving" },
  { value: "deep", label: "Deep Thinking", icon: <Brain size={15} style={{ color: "#7161ef" }} />, description: "Heightened multi-step reasoning" }
];

export default function App() {
  const canvasRef = useRef(null);
  const autoTriggerTimer = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const statusRef = useRef("ready");
  const isLoadedRef = useRef(false);
  
  // React State variables
  const [theme, setTheme] = useState("arcane");
  const [activeTool, setActiveTool] = useState("pen");
  const [reasoning, setReasoning] = useState("normal");
  const [status, setStatus] = useState("ready");
  const [errorMessage, setErrorMessage] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isOrbMenuOpen, setIsOrbMenuOpen] = useState(false);
  const [isAiEnabled, setIsAiEnabled] = useState(true);

  const isAiEnabledRef = useRef(isAiEnabled);

  // Excalidraw-parity Toolset State
  const [isLocked, setIsLocked] = useState(true);
  const [selectedElements, setSelectedElements] = useState([]);
  const [currentStyle, setCurrentStyle] = useState({
    strokeColor: "#2e231d",
    backgroundColor: "transparent",
    strokeWidth: 3,
    strokeStyle: "solid",
    opacity: 100
  });

  const errorTimeoutRef = useRef(null);

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

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isAiEnabledRef.current = isAiEnabled;
    if (!isAiEnabled && autoTriggerTimer.current) {
      clearTimeout(autoTriggerTimer.current);
    }
  }, [isAiEnabled]);
  
  const [viewport, setViewport] = useState({ panX: 0, panY: 0, zoom: 1.0 });
  const [drafts, setDrafts] = useState([]);

  useEffect(() => {
    async function restoreSession() {
      const saved = await loadSessionState();
      if (saved) {
        if (saved.settings) {
          if (saved.settings.theme) setTheme(normalizeTheme(saved.settings.theme));
          if (saved.settings.activeTool) setActiveTool(saved.settings.activeTool);
          if (saved.settings.reasoning) setReasoning(normalizeReasoningLevel(saved.settings.reasoning));
          if (typeof saved.settings.isAiEnabled === "boolean") setIsAiEnabled(saved.settings.isAiEnabled);
        }
        if (saved.viewport) setViewport(saved.viewport);
        if (saved.drafts) setDrafts(saved.drafts);

        if (canvasRef.current) {
          canvasRef.current.loadCanvasState(saved.strokes || [], saved.viewport || { panX: 0, panY: 0, zoom: 1.0 });
        }
      }
      isLoadedRef.current = true;
    }
    restoreSession();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToCrossTabSync(
      (remoteState) => {
        if (!remoteState) return;
        if (remoteState.settings?.theme) setTheme(normalizeTheme(remoteState.settings.theme));
        if (remoteState.settings?.reasoning) setReasoning(normalizeReasoningLevel(remoteState.settings.reasoning));
        if (typeof remoteState.settings?.isAiEnabled === "boolean") setIsAiEnabled(remoteState.settings.isAiEnabled);
        if (remoteState.viewport) setViewport(remoteState.viewport);
        if (remoteState.drafts) setDrafts(remoteState.drafts);
        if (canvasRef.current) {
          canvasRef.current.loadCanvasState(remoteState.strokes || [], remoteState.viewport);
        }
      },
      () => canvasRef.current?.isDrawingActive()
    );
    return () => unsubscribe();
  }, []);

  const triggerAutoSave = () => {
    if (!isLoadedRef.current || !canvasRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      const canvasData = canvasRef.current.getCanvasState();
      const res = await saveSessionState({
        strokes: canvasData.strokes,
        viewport: canvasData.viewport,
        drafts: drafts,
        settings: { theme, activeTool, reasoning, isAiEnabled }
      });

      if (res && res.prunedStrokes) {
        showError("Storage space critical: Oldest stroke history was compacted to preserve current session.");
      }
    }, 600);
  };

  useEffect(() => {
    triggerAutoSave();
  }, [theme, activeTool, reasoning, isAiEnabled, drafts, viewport]);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, [drafts]);

  const handleViewportChange = (vp) => {
    setViewport(vp);
  };

  const handleDrawStart = () => {
    if (autoTriggerTimer.current) {
      clearTimeout(autoTriggerTimer.current);
      autoTriggerTimer.current = null;
    }
  };

  const handleDrawFinished = () => {
    triggerAutoSave();
    
    if (autoTriggerTimer.current) {
      clearTimeout(autoTriggerTimer.current);
    }
    // Only schedule auto AI response if AI is enabled
    if (isAiEnabledRef.current) {
      autoTriggerTimer.current = setTimeout(() => {
        if (statusRef.current === "ready" && isAiEnabledRef.current && canvasRef.current) {
          handleTriggerAI();
        }
      }, 2500);
    }
  };

  const handleTriggerAI = async (mode = "auto") => {
    if (status !== "ready") return;
    setIsOrbMenuOpen(false);

    const cropData = canvasRef.current.captureCrop();
    if (!cropData || !cropData.image) {
      showError("Please write or draw something on the canvas first!");
      return;
    }

    setStatus("observing");

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
      const response = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/canvas-ai`, { 
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
          reasoning: reasoning,
          intent: (mode === "typeset" || activeTool === "select" || cropData.selectionContext) ? "typeset" : (mode === "plot" ? "plot" : "auto")
        })
      });

      setStatus("writing");
      const data = await response.json();

      if (data.error) {
        throw new Error(data.detail || data.error);
      }

      if (data.commands && data.commands.length > 0) {
        const newDrafts = data.commands.map((cmd, index) => {
          let content = "";
          
          if (cmd.tool === "write_text") {
            content = cmd.text;
          } else if (cmd.tool === "draw_formula") {
            content = `$$\n${cmd.formula}\n$$`;
          } else if (cmd.tool === "draw") {
            content = `🎨 Vector Shape: ${cmd.types ? cmd.types.join(", ") : "Diagram"}`;
          } else if (cmd.tool === "plot_function") {
            content = `📈 Plot: y = ${cmd.expression || "f(x)"}`;
          } else {
            content = "AI Generated Content";
          }

          const [x, y] = cmd.position || [cropData.cropX + cropData.cropWidth + 40, cropData.cropY + index * 120];

          return {
            id: `draft_${Date.now()}_${index}`,
            x,
            y,
            width: cmd.maxWidth || 260,
            text: content,
            rawCommand: cmd
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
    setConfirmClear(true);
  };

  const executeClear = async () => {
    setConfirmClear(false);
    canvasRef.current.clearCanvas();
    setDrafts([]);
    setSelectedElements([]);
    await clearSessionState();
  };

  const handleAcceptDraft = (id) => {
    const draft = drafts.find(d => d.id === id);
    if (draft && draft.rawCommand) {
      if (draft.rawCommand.tool === "draw") {
        canvasRef.current.bakeDrawCommand(draft.rawCommand);
        setDrafts(prev => prev.filter(d => d.id !== id));
        triggerAutoSave();
      } else if (draft.rawCommand.tool === "plot_function") {
        canvasRef.current.bakePlotCommand(draft.rawCommand);
        setDrafts(prev => prev.filter(d => d.id !== id));
        triggerAutoSave();
      } else {
        setDrafts(prev => prev.map(d => d.id === id ? { ...d, accepted: true } : d));
        triggerAutoSave();
      }
    }
  };

  const handleDiscardDraft = (id) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const handleStyleChange = (styleDiff) => {
    setCurrentStyle(prev => ({ ...prev, ...styleDiff }));
    if (canvasRef.current) {
      canvasRef.current.updateSelectedStyle(styleDiff);
    }
  };

  const handleToolbarAction = (action) => {
    if (canvasRef.current) {
      canvasRef.current.handleOverflowAction(action);
    }
  };

  return (
    <div className="app-container" style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* 1. Integrated Glassmorphic Header */}
      <header className="topbar chrome-container">
        <div className="brand-section">
          <div className="brand-sigil-portrait" style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Voldemort Sigil">
            <VoldemortSigil size={38} />
          </div>
          <div className="brand-title">
            <span>Voldy's</span><strong>Diary</strong>
          </div>
        </div>

        {/* Integrated Top Center Whiteboard Toolbar */}
        <Toolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          isLocked={isLocked}
          setIsLocked={setIsLocked}
          onAction={handleToolbarAction}
        />

        <div className="toolbar-controls">
          {/* Custom Interactive AI Switch Pill */}
          <button
            type="button"
            onClick={() => setIsAiEnabled(prev => !prev)}
            title={isAiEnabled ? "AI Active: Click to pause automatic AI responses" : "AI Paused: Click to enable automatic AI responses"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 12px 4px 6px",
              borderRadius: "20px",
              cursor: "pointer",
              background: isAiEnabled ? "rgba(113, 97, 239, 0.15)" : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${isAiEnabled ? "rgba(113, 97, 239, 0.45)" : "rgba(0, 0, 0, 0.15)"}`,
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
            }}
          >
            <div style={{
              width: "34px",
              height: "18px",
              borderRadius: "10px",
              background: isAiEnabled ? "var(--color-accent)" : "rgba(150, 150, 150, 0.3)",
              position: "relative",
              transition: "background 0.25s ease"
            }}>
              <div style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: "#ffffff",
                position: "absolute",
                top: "2px",
                left: isAiEnabled ? "18px" : "2px",
                transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {isAiEnabled ? <Sparkles size={8} style={{ color: "var(--color-accent)" }} /> : <BotOff size={8} style={{ color: "#888" }} />}
              </div>
            </div>
            <span style={{ fontSize: "12px", fontWeight: "600", color: isAiEnabled ? "var(--color-accent)" : "inherit", opacity: isAiEnabled ? 1 : 0.6 }}>
              {isAiEnabled ? "Auto AI: ON" : "Auto AI: OFF"}
            </span>
          </button>

          {/* Explicit Clear Screen Button */}
          <button
            className="control-btn"
            onClick={handleClear}
            title="Clear Board & Saved Session"
            style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
          >
            <RotateCcw size={14} style={{ color: "#f87171" }} />
            <span>Clear</span>
          </button>

          {/* AI Status Indicator */}
          {isAiEnabled && (
            <div className="control-btn" style={{ cursor: "default" }}>
              {status === "ready" && <><Sparkles size={14} style={{ color: "var(--color-accent)" }} /> Ready</>}
              {status === "observing" && <><span className="loading-spinner"></span> Observing...</>}
              {status === "writing" && <><span className="loading-spinner"></span> Writing...</>}
            </div>
          )}

          {/* Custom Glassmorphic Reasoning Select */}
          <CustomSelect
            value={reasoning}
            onChange={setReasoning}
            options={REASONING_OPTIONS}
            title="Reasoning Effort: Adjusts Gemini thinking depth & token budget"
          />

          {/* Custom Glassmorphic Theme Select */}
          <CustomSelect
            value={theme}
            onChange={setTheme}
            options={THEME_OPTIONS}
            title="Visual Theme: Arcane Parchment vs Studio Void"
          />
        </div>
      </header>

      {/* 2. Left Property Panel */}
      <PropertyPanel
        activeTool={activeTool}
        selectedElements={selectedElements}
        currentStyle={currentStyle}
        onStyleChange={handleStyleChange}
      />

      {/* 3. Bottom Left Zoom Control */}
      <ZoomControl
        zoom={viewport.zoom}
        onZoomChange={(newZoom) => {
          setViewport(prev => ({ ...prev, zoom: newZoom }));
          if (canvasRef.current) {
            canvasRef.current.loadCanvasState(undefined, { ...viewport, zoom: newZoom });
          }
        }}
        onReset={() => {
          if (canvasRef.current) {
            canvasRef.current.recenterViewport();
          }
        }}
      />

      {/* Graceful Toast notification banner */}
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

      {/* Confirmation toast for clearing canvas */}
      {confirmClear && (
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
          background: "rgba(251, 191, 36, 0.15)",
          border: "1px solid rgba(251, 191, 36, 0.45)",
          color: "#fbbf24",
          borderRadius: "10px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          fontSize: "14px",
          maxWidth: "90%",
          width: "max-content",
          pointerEvents: "auto",
          animation: "fade-in 0.25s ease"
        }}>
          <CircleAlert size={16} />
          <span>Clear entire canvas workspace and saved session?</span>
          <button
            onClick={executeClear}
            style={{
              background: "rgba(239, 68, 68, 0.25)",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              color: "#f87171",
              cursor: "pointer",
              marginLeft: "8px",
              padding: "4px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              fontFamily: "inherit"
            }}
          >
            Yes, clear
          </button>
          <button
            onClick={() => setConfirmClear(false)}
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "var(--color-text)",
              cursor: "pointer",
              padding: "4px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
              fontFamily: "inherit"
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* 4. Interactive Canvas Component */}
      <Canvas 
        ref={canvasRef}
        activeTool={activeTool} 
        theme={theme}
        onViewportChange={handleViewportChange}
        onDrawStart={handleDrawStart}
        onDrawFinished={handleDrawFinished}
        drafts={drafts}
        isLocked={isLocked}
        currentStyle={currentStyle}
        onSelectionChange={(selected) => setSelectedElements(selected)}
        onToolAutoRevert={() => setActiveTool("select")}
      />

      {/* 5. GPU-Accelerated Absolute Positioning Draft Layer */}
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

      {/* 6. Glowing Magic AI Orb with Interactive Action Menu */}
      <div className="ai-orb-container">
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
