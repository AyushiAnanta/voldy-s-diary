import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function CustomSelect({ value, onChange, options, title }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="control-btn"
        onClick={() => setIsOpen(prev => !prev)}
        title={title}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          padding: "8px 14px",
          borderRadius: "10px",
          fontSize: "13px",
          fontWeight: "600",
          fontFamily: "inherit",
          userSelect: "none"
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {selectedOption.icon}
          <span>{selectedOption.label}</span>
        </span>
        <ChevronDown size={14} style={{ opacity: 0.6, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
      </button>

      {isOpen && (
        <div
          className="chrome-container"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 9999,
            minWidth: "200px",
            padding: "6px",
            borderRadius: "12px",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.35)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            animation: "fade-in 0.15s ease"
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className="orb-action-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: isSelected ? "600" : "500",
                  cursor: "pointer",
                  background: isSelected ? "rgba(113, 97, 239, 0.15)" : "transparent",
                  color: isSelected ? "var(--color-accent)" : "inherit",
                  border: "none",
                  textAlign: "left"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{opt.icon}</span>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span>{opt.label}</span>
                    {opt.description && (
                      <span style={{ fontSize: "10px", opacity: 0.55, fontWeight: "normal" }}>
                        {opt.description}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && <Check size={14} style={{ color: "var(--color-accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
