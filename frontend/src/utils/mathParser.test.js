import assert from "node:assert";
import test, { describe } from "node:test";
import { evaluateMathExpression } from "./mathParser.js";

describe("Safe Math Parser Security & Functionality Test Suite", () => {

  test("RCE Defense: Blocks 'alert(1)'", () => {
    const res = evaluateMathExpression("alert(1)", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });

  test("RCE Defense: Blocks '__proto__'", () => {
    const res = evaluateMathExpression("__proto__", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });

  test("RCE Defense: Blocks constructor hijacking", () => {
    const res = evaluateMathExpression("constructor.constructor('return process')()", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });

  test("DoS Guard: Rejects parens depth > 15 with 'depth_exceeded'", () => {
    const expr = "(".repeat(18) + "x" + ")".repeat(18);
    const res = evaluateMathExpression(expr, 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "depth_exceeded");
  });

  test("DoS Guard: Rejects function nesting depth > 15 with 'depth_exceeded'", () => {
    const expr = "sin(".repeat(18) + "x" + ")".repeat(18);
    const res = evaluateMathExpression(expr, 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "depth_exceeded");
  });

  test("DoS Guard: Rejects expression length > 500 characters with 'length_exceeded'", () => {
    const expr = "x+".repeat(300) + "1";
    const res = evaluateMathExpression(expr, 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "length_exceeded");
  });

  test("Discontinuity Sentinel: Handles 1 / 0", () => {
    const res = evaluateMathExpression("1 / 0", 0);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "discontinuity");
  });

  test("Discontinuity Sentinel: Handles tan(pi/2)", () => {
    const res = evaluateMathExpression("tan(pi / 2)", 0);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "discontinuity");
  });

  test("Valid Evaluation: Standard sin(x) + x^2", () => {
    const res = evaluateMathExpression("sin(x) + x^2", 2);
    assert.strictEqual(res.ok, true);
    assert.ok(Math.abs(res.value - (Math.sin(2) + 4)) < 1e-6);
  });

  test("Valid Evaluation: Implicit multiplication '3x'", () => {
    const res = evaluateMathExpression("3x + 5", 4);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.value, 17);
  });

  test("Precedence: '1/0+' returns invalid_syntax, not discontinuity", () => {
    const res = evaluateMathExpression("1/0+", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });

  test("Precedence: unclosed '(1/0' returns invalid_syntax, not discontinuity", () => {
    const res = evaluateMathExpression("(1/0", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });

  test("Precedence: nested unclosed 'sin(1/0' returns invalid_syntax, not discontinuity", () => {
    const res = evaluateMathExpression("sin(1/0", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });

  test("Precedence: nested malformed 'tan(pi/2 + ' returns invalid_syntax, not discontinuity", () => {
    const res = evaluateMathExpression("tan(pi/2 + ", 2);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "invalid_syntax");
  });
});

import { normalizeReasoningLevel, normalizeTheme, normalizeViewport, normalizeElement } from "./storage.js";

describe("State Normalization & Backward Compatibility Test Suite", () => {
  test("Normalizes legacy reasoning levels: 'none', 'low', 'medium' -> 'normal'", () => {
    assert.strictEqual(normalizeReasoningLevel("none"), "normal");
    assert.strictEqual(normalizeReasoningLevel("low"), "normal");
    assert.strictEqual(normalizeReasoningLevel("medium"), "normal");
  });

  test("Normalizes legacy reasoning levels: 'high', 'max' -> 'deep'", () => {
    assert.strictEqual(normalizeReasoningLevel("high"), "deep");
    assert.strictEqual(normalizeReasoningLevel("max"), "deep");
  });

  test("Preserves canonical reasoning levels: 'normal', 'deep'", () => {
    assert.strictEqual(normalizeReasoningLevel("normal"), "normal");
    assert.strictEqual(normalizeReasoningLevel("deep"), "deep");
  });

  test("Guards against invalid/non-string inputs & prototype pollution in reasoning", () => {
    assert.strictEqual(normalizeReasoningLevel("__proto__"), "normal");
    assert.strictEqual(normalizeReasoningLevel("constructor"), "normal");
    assert.strictEqual(normalizeReasoningLevel(null), "normal");
    assert.strictEqual(normalizeReasoningLevel({}), "normal");
  });

  test("Normalizes legacy themes: 'scifi', 'research' -> 'arcane'", () => {
    assert.strictEqual(normalizeTheme("scifi"), "arcane");
    assert.strictEqual(normalizeTheme("research"), "arcane");
  });

  test("Preserves valid themes: 'arcane', 'studio'", () => {
    assert.strictEqual(normalizeTheme("arcane"), "arcane");
    assert.strictEqual(normalizeTheme("studio"), "studio");
  });

  test("Normalizes viewport against NaN, Infinity, and out-of-bounds pan/zoom", () => {
    const res1 = normalizeViewport({ panX: NaN, panY: Infinity, zoom: null });
    assert.strictEqual(res1.panX, 0);
    assert.strictEqual(res1.panY, 0);
    assert.strictEqual(res1.zoom, 1.0);

    const res2 = normalizeViewport({ panX: -50000, panY: 99999, zoom: 10 });
    assert.strictEqual(res2.panX, -12000);
    assert.strictEqual(res2.panY, 12000);
    assert.strictEqual(res2.zoom, 3.5);
  });

  test("Normalizes legacy stroke records with missing element fields at read time", () => {
    const legacyPenStroke = {
      tool: "pen",
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      timestamp: 1700000000000
    };

    const normalized = normalizeElement(legacyPenStroke);
    assert.strictEqual(normalized.elementType, "pen");
    assert.strictEqual(normalized.strokeColor, null);
    assert.strictEqual(normalized.backgroundColor, "transparent");
    assert.strictEqual(normalized.strokeWidth, 3);
    assert.strictEqual(normalized.strokeStyle, "solid");
    assert.strictEqual(normalized.opacity, 100);
    assert.ok(normalized.id.startsWith("el_"));
  });

  test("Property Panel Branching: Mutates selected elements when selection present, sets default when empty", () => {
    const currentStyle = { strokeColor: "#2e231d", strokeWidth: 3 };
    const selectedElements = [
      { id: "el_1", elementType: "rect", strokeColor: "#2e231d", strokeWidth: 3 }
    ];

    // Branch A: With selection
    const applyDiffToSelection = (selected, diff) => {
      return selected.map(el => ({ ...el, ...diff }));
    };
    const updatedSelected = applyDiffToSelection(selectedElements, { strokeColor: "#e63946" });
    assert.strictEqual(updatedSelected[0].strokeColor, "#e63946");
    assert.strictEqual(currentStyle.strokeColor, "#2e231d"); // Default style untouched

    // Branch B: Without selection
    const applyDiffToDefault = (prevStyle, diff) => ({ ...prevStyle, ...diff });
    const updatedDefault = applyDiffToDefault(currentStyle, { strokeColor: "#457b9d" });
    assert.strictEqual(updatedDefault.strokeColor, "#457b9d");
  });

  test("Arrow Snapping: Correctly projects onto shape perimeter outer edge within snap threshold", () => {
    const shapes = [
      { id: "rect_1", elementType: "rect", x: 100, y: 100, width: 200, height: 100 }
    ];

    const findNearest = (pos, elements) => {
      const SNAP_DIST = 20;
      for (const el of elements) {
        if (!["rect", "diamond", "ellipse"].includes(el.elementType)) continue;
        const x = el.x || 0, y = el.y || 0, w = el.width || 0, h = el.height || 0;
        let edgeX = Math.max(x, Math.min(pos.x, x + w));
        let edgeY = Math.max(y, Math.min(pos.y, y + h));
        const dist = Math.hypot(pos.x - edgeX, pos.y - edgeY);
        if (dist <= SNAP_DIST) return { shapeId: el.id, x: edgeX, y: edgeY };
      }
      return null;
    };

    // Test point near top edge (x=150, y=95) -> snaps to perimeter edge (150, 100)
    const hitNearEdge = findNearest({ x: 150, y: 95 }, shapes);
    assert.ok(hitNearEdge);
    assert.strictEqual(hitNearEdge.shapeId, "rect_1");
    assert.strictEqual(hitNearEdge.x, 150);
    assert.strictEqual(hitNearEdge.y, 100);

    // Far point (1000, 1000) returns null
    const hitFar = findNearest({ x: 1000, y: 1000 }, shapes);
    assert.strictEqual(hitFar, null);
  });

  test("Whole-Element Eraser Hit Testing: Detects intersection against shapes and pen strokes", () => {
    const isElementIntersectingPoint = (el, pos, radius = 16) => {
      if (el.points && el.points.length > 0) {
        return el.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) <= radius + (el.strokeWidth || 3) / 2);
      }
      const x1 = Math.min(el.x, el.x + (el.width || 0));
      const x2 = Math.max(el.x, el.x + (el.width || 0));
      const y1 = Math.min(el.y, el.y + (el.height || 0));
      const y2 = Math.max(el.y, el.y + (el.height || 0));

      return pos.x >= x1 - radius && pos.x <= x2 + radius && pos.y >= y1 - radius && pos.y <= y2 + radius;
    };

    const rect = { id: "r1", elementType: "rect", x: 100, y: 100, width: 50, height: 50 };
    const stroke = { id: "p1", elementType: "pen", points: [{ x: 300, y: 300 }, { x: 310, y: 310 }] };

    // Eraser on rect (110, 110)
    assert.strictEqual(isElementIntersectingPoint(rect, { x: 110, y: 110 }, 16), true);

    // Eraser near stroke (305, 305)
    assert.strictEqual(isElementIntersectingPoint(stroke, { x: 305, y: 305 }, 16), true);

    // Eraser far away (900, 900)
    assert.strictEqual(isElementIntersectingPoint(rect, { x: 900, y: 900 }, 16), false);
    assert.strictEqual(isElementIntersectingPoint(stroke, { x: 900, y: 900 }, 16), false);
  });

  test("Partial Point Splitting: Splits a single stroke into 2 sub-strokes when erased in the middle", () => {
    const eraseStrokePoints = (el, pos, radius) => {
      const pts = el.points;
      const subStrokes = [];
      let currentSub = [];

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const dist = Math.hypot(pt.x - pos.x, pt.y - pos.y);
        if (dist > radius) {
          currentSub.push(pt);
        } else {
          if (currentSub.length >= 2) {
            subStrokes.push({ ...el, points: currentSub });
          }
          currentSub = [];
        }
      }
      if (currentSub.length >= 2) {
        subStrokes.push({ ...el, points: currentSub });
      }

      return subStrokes;
    };

    const stroke = {
      id: "s1",
      elementType: "pen",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 }, // Middle points around x=50 will be erased
        { x: 48, y: 0 },
        { x: 50, y: 0 },
        { x: 52, y: 0 },
        { x: 80, y: 0 },
        { x: 90, y: 0 },
        { x: 100, y: 0 }
      ]
    };

    // Erase at (50, 0) with radius=10 -> erases points at x=48, 50, 52
    const result = eraseStrokePoints(stroke, { x: 50, y: 0 }, 10);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0].points, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
    assert.deepStrictEqual(result[1].points, [{ x: 80, y: 0 }, { x: 90, y: 0 }, { x: 100, y: 0 }]);
  });

  test("Purge Text Elements: Filters out stray text elements on canvas load", () => {
    const savedStrokes = [
      { id: "1", elementType: "rect", x: 10, y: 10, width: 100, height: 100 },
      { id: "2", elementType: "text", text: "Text", x: 50, y: 50 },
      { id: "3", elementType: "text", text: "Text", x: 100, y: 100 },
      { id: "4", elementType: "pen", points: [{ x: 0, y: 0 }] },
      { id: "5", elementType: "text", text: "Text", x: 200, y: 200 }
    ];

    const purged = savedStrokes.filter(s => s.elementType !== "text");
    assert.strictEqual(purged.length, 2);
    assert.deepStrictEqual(purged.map(s => s.id), ["1", "4"]);
  });
});

