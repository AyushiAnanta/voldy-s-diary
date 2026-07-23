import React from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught UI error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0914",
          color: "#efd9ce",
          fontFamily: "'Outfit', 'Inter', sans-serif"
        }}>
          <div style={{
            background: "rgba(17, 13, 31, 0.85)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "20px",
            padding: "40px",
            maxWidth: "500px",
            textAlign: "center",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px"
          }}>
            <div style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444"
            }}>
              <CircleAlert size={32} />
            </div>

            <h2 style={{ fontSize: "22px", fontWeight: "700" }}>Workspace Encountered an Error</h2>
            
            <p style={{ fontSize: "14px", color: "rgba(239, 217, 206, 0.7)", lineHeight: "1.5" }}>
              Voldy's Diary caught an unexpected runtime error. Your drawing data is safely preserved in IndexedDB.
            </p>

            <button
              onClick={this.handleReload}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 24px",
                background: "linear-gradient(135deg, #7161ef, #957fef)",
                border: "none",
                borderRadius: "12px",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(113, 97, 239, 0.4)"
              }}
            >
              <RotateCcw size={16} />
              Restore Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
