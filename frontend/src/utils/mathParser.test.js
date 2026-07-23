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
