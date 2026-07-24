import React from "react";

export default function VoldemortSigil({ size = 42, className = "", style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`voldemort-chibi-svg ${className}`}
      style={{ display: "inline-block", verticalAlign: "middle", filter: "drop-shadow(0 0 10px rgba(0, 230, 64, 0.45))", ...style }}
    >
      <defs>
        {/* Avada Kedavra Green Magic Glow Filter */}
        <filter id="chibiMagicGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <radialGradient id="spellOrbGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#70ff85" />
          <stop offset="65%" stopColor="#00e640" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#00b32c" stopOpacity="0" />
        </radialGradient>

        {/* Head skin gradient */}
        <linearGradient id="headSkin" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#eff4db" />
          <stop offset="60%" stopColor="#e3eabf" />
          <stop offset="100%" stopColor="#ccd5a3" />
        </linearGradient>

        {/* Robe gradient */}
        <linearGradient id="robeShade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a2c30" />
          <stop offset="40%" stopColor="#181a1c" />
          <stop offset="100%" stopColor="#0c0d0e" />
        </linearGradient>

        {/* Nagini Skin gradient */}
        <linearGradient id="snakeSkin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#556e29" />
          <stop offset="50%" stopColor="#3c5218" />
          <stop offset="100%" stopColor="#24330b" />
        </linearGradient>
      </defs>

      {/* Ground Shadow */}
      <ellipse cx="120" cy="245" rx="75" ry="8" fill="#141812" opacity="0.18" />

      {/* Nagini Lower Body */}
      <path
        d="M 125 180 C 100 185, 75 195, 75 220 C 75 240, 95 248, 105 248 C 115 248, 85 240, 85 220 C 85 200, 110 195, 130 190 Z"
        fill="url(#snakeSkin)"
        stroke="#222b0f"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M 85 210 Q 90 220 82 230" stroke="#1f2c09" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.6" />

      {/* Chibi Robe */}
      <path
        d="M 70 148 C 70 148, 90 145, 120 145 C 150 145, 175 152, 190 190 L 195 240 L 90 242 L 68 185 Z"
        fill="url(#robeShade)"
        stroke="#26292c"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M 120 145 L 142 240" stroke="#101113" strokeWidth="3" />
      <path d="M 120 145 L 98 220" stroke="#36393e" strokeWidth="2.5" />
      <path d="M 115 145 L 130 180 L 105 200" stroke="#36393e" strokeWidth="2.5" fill="none" />

      {/* Bare Feet/Toes */}
      <g fill="#d8e2b2" stroke="#3d453d" strokeWidth="1.8">
        <ellipse cx="115" cy="242" rx="4" ry="2.5" />
        <ellipse cx="121" cy="242" rx="3.5" ry="2.2" />
        <ellipse cx="127" cy="242" rx="3" ry="2" />
      </g>

      {/* Sleeve holding Wand */}
      <path
        d="M 70 148 L 100 190 L 70 195 L 60 148 Z"
        fill="url(#robeShade)"
        stroke="#26292c"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      {/* Skeleton Hand & Magic Wand */}
      <g>
        <circle cx="58" cy="154" r="5" fill="#e3eabf" stroke="#3d453d" strokeWidth="2" />
        <path d="M 60 156 L 22 130" stroke="#704b28" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M 60 156 L 22 130" stroke="#4a3017" strokeWidth="2" strokeLinecap="round" />

        {/* Green Magic Orb Glow */}
        <circle cx="18" cy="127" r="22" fill="url(#spellOrbGrad)" filter="url(#chibiMagicGlow)" />
        <circle cx="18" cy="127" r="12" fill="#80ff95" filter="url(#chibiMagicGlow)" />
        <circle cx="18" cy="127" r="5" fill="#ffffff" />
      </g>

      {/* Nagini Upper Body & Head */}
      <g>
        <path
          d="M 160 135 C 160 115, 175 115, 195 120 C 215 125, 220 150, 205 170 C 190 185, 170 180, 160 155 Z"
          fill="url(#snakeSkin)"
          stroke="#222b0f"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        <circle cx="190" cy="140" r="10" fill="#ffd000" stroke="#222b0f" strokeWidth="2" />
        <ellipse cx="190" cy="140" r="2.5" ry="7" fill="#cc0000" />
        <circle cx="187" cy="136" r="2.5" fill="#ffffff" />

        <path d="M 172 152 Q 165 156 160 152 M 160 152 L 155 148 M 160 152 L 155 156" stroke="#ff3333" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="178" cy="144" r="1.5" fill="#1c240b" />
        <path d="M 175 148 Q 185 150 195 147" stroke="#1c240b" strokeWidth="2" fill="none" />
      </g>

      {/* Big Chibi Bald Head */}
      <ellipse cx="130" cy="85" rx="72" ry="70" fill="url(#headSkin)" stroke="#3d453d" strokeWidth="4" />

      {/* Green Reflection Outline */}
      <path d="M 64 85 C 64 125, 90 148, 125 148" stroke="#00e640" strokeWidth="4.5" strokeLinecap="round" fill="none" filter="url(#chibiMagicGlow)" opacity="0.85" />

      {/* Right Ear */}
      <path d="M 198 88 C 205 85, 206 98, 198 104 Z" fill="#e3eabf" stroke="#3d453d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M 198 92 Q 201 96 198 99" stroke="#3d453d" strokeWidth="2" fill="none" />

      {/* Eyebrows */}
      <path d="M 85 66 L 100 78" stroke="#3d453d" strokeWidth="4" strokeLinecap="round" />
      <path d="M 155 66 L 140 78" stroke="#3d453d" strokeWidth="4" strokeLinecap="round" />

      {/* Squinting Eyes */}
      <path d="M 78 86 Q 92 98 104 88" stroke="#3d453d" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M 160 86 Q 146 98 134 88" stroke="#3d453d" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Slit Nose */}
      <path d="M 116 100 L 112 106 M 122 100 L 126 106" stroke="#3d453d" strokeWidth="3" strokeLinecap="round" />

      {/* Frown Mouth */}
      <path d="M 108 120 Q 120 114 132 121" stroke="#3d453d" strokeWidth="3.5" strokeLinecap="round" fill="none" />

      {/* Cheekbone Line */}
      <path d="M 156 120 Q 170 105 166 90" stroke="#bcc599" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
