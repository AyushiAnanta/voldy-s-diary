/**
 * Safe Recursive-Descent Mathematical Expression Parser & Evaluator.
 * 
 * Guarantees ZERO dynamic code execution (no eval, no Function, no setTimeout).
 * Includes DoS guards (length limit & unified nesting depth limit).
 * Distinguishes mathematical discontinuities (e.g., 1/0, tan(pi/2)) from invalid syntax or depth attacks.
 */

const MAX_EXPR_LENGTH = 500;
const MAX_RECURSION_DEPTH = 15;

/**
 * Token types for math expressions
 */
const TOKEN_TYPES = {
  NUMBER: "NUMBER",
  VARIABLE: "VARIABLE",
  OPERATOR: "OPERATOR",
  FUNCTION: "FUNCTION",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  EOF: "EOF"
};

const SUPPORTED_FUNCTIONS = new Set(["sin", "cos", "tan", "sqrt", "abs", "exp", "log", "ln"]);
const CONSTANTS = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E
};

/**
 * Tokenizer
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  
  while (i < expr.length) {
    const char = expr[i];
    
    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    
    // Numbers
    if (/[0-9.]/.test(char)) {
      let numStr = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      const val = parseFloat(numStr);
      if (isNaN(val)) return null;
      tokens.push({ type: TOKEN_TYPES.NUMBER, value: val });
      continue;
    }
    
    // Identifiers (variables, functions, constants)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      
      const lower = ident.toLowerCase();
      if (SUPPORTED_FUNCTIONS.has(lower)) {
        tokens.push({ type: TOKEN_TYPES.FUNCTION, value: lower });
      } else if (lower === "x") {
        tokens.push({ type: TOKEN_TYPES.VARIABLE, value: "x" });
      } else if (Object.hasOwn(CONSTANTS, ident)) {
        tokens.push({ type: TOKEN_TYPES.NUMBER, value: CONSTANTS[ident] });
      } else {
        // Unknown identifier -> invalid
        return null;
      }
      continue;
    }
    
    // Operators & Parentheses
    if ("+-*/^".includes(char)) {
      tokens.push({ type: TOKEN_TYPES.OPERATOR, value: char });
      i++;
      continue;
    }
    
    if (char === "(") {
      tokens.push({ type: TOKEN_TYPES.LPAREN, value: "(" });
      i++;
      continue;
    }
    
    if (char === ")") {
      tokens.push({ type: TOKEN_TYPES.RPAREN, value: ")" });
      i++;
      continue;
    }
    
    // Any unrecognized character -> invalid
    return null;
  }
  
  tokens.push({ type: TOKEN_TYPES.EOF });
  return tokens;
}

/**
 * Parser / Evaluator Class
 */
class MathParser {
  constructor(tokens, xVal) {
    this.tokens = tokens;
    this.xVal = xVal;
    this.pos = 0;
    this.depth = 0;
    this.hasDiscontinuity = false;
    this.hasDepthExceeded = false;
    this.hasSyntaxError = false;
  }

  peek() {
    return this.tokens[this.pos] || { type: TOKEN_TYPES.EOF };
  }

  consume() {
    const token = this.peek();
    this.pos++;
    return token;
  }

  match(type, value) {
    const token = this.peek();
    if (token.type === type && (value === undefined || token.value === value)) {
      this.consume();
      return true;
    }
    return false;
  }

  parseExpression() {
    let left = this.parseTerm();
    if (left === null) return null;

    while (this.peek().type === TOKEN_TYPES.OPERATOR && ("+-".includes(this.peek().value))) {
      const op = this.consume().value;
      const right = this.parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  parseTerm() {
    let left = this.parsePower();
    if (left === null) return null;

    while (this.peek().type === TOKEN_TYPES.OPERATOR && ("*/".includes(this.peek().value))) {
      const op = this.consume().value;
      const right = this.parsePower();
      if (right === null) return null;
      
      if (op === "*") {
        left = left * right;
      } else {
        if (right === 0) {
          this.hasDiscontinuity = true;
          return null;
        }
        left = left / right;
      }
    }
    return left;
  }

  parsePower() {
    let left = this.parseUnary();
    if (left === null) return null;

    if (this.peek().type === TOKEN_TYPES.OPERATOR && this.peek().value === "^") {
      this.consume();
      const right = this.parsePower(); // right-associative
      if (right === null) return null;
      left = Math.pow(left, right);
    }
    return left;
  }

  parseUnary() {
    if (this.match(TOKEN_TYPES.OPERATOR, "-")) {
      const val = this.parseUnary();
      return val !== null ? -val : null;
    }
    if (this.match(TOKEN_TYPES.OPERATOR, "+")) {
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    this.depth++;
    if (this.depth > MAX_RECURSION_DEPTH) {
      this.hasDepthExceeded = true;
      return null; // Recursion limit reached
    }

    try {
      const token = this.peek();

      if (token.type === TOKEN_TYPES.NUMBER) {
        this.consume();
        return token.value;
      }

      if (token.type === TOKEN_TYPES.VARIABLE) {
        this.consume();
        return this.xVal;
      }

      if (token.type === TOKEN_TYPES.FUNCTION) {
        const fnName = this.consume().value;
        if (!this.match(TOKEN_TYPES.LPAREN)) {
          this.hasSyntaxError = true;
          return null;
        }

        const arg = this.parseExpression();
        if (!this.match(TOKEN_TYPES.RPAREN)) {
          this.hasSyntaxError = true;
          return null;
        }
        if (arg === null) return null;

        let res = null;
        switch (fnName) {
          case "sin": res = Math.sin(arg); break;
          case "cos": res = Math.cos(arg); break;
          case "tan": 
            // tan(x) is undefined at (k + 0.5) * PI
            if (Math.abs(Math.cos(arg)) < 1e-10) {
              this.hasDiscontinuity = true;
              return null;
            }
            res = Math.tan(arg);
            break;
          case "sqrt": 
            if (arg < 0) {
              this.hasDiscontinuity = true;
              return null;
            }
            res = Math.sqrt(arg);
            break;
          case "abs": res = Math.abs(arg); break;
          case "exp": res = Math.exp(arg); break;
          case "log":
          case "ln":
            if (arg <= 0) {
              this.hasDiscontinuity = true;
              return null;
            }
            res = Math.log(arg);
            break;
          default:
            this.hasSyntaxError = true;
            return null;
        }
        return res;
      }

      if (token.type === TOKEN_TYPES.LPAREN) {
        this.consume();
        const val = this.parseExpression();
        if (!this.match(TOKEN_TYPES.RPAREN)) {
          this.hasSyntaxError = true;
          return null;
        }
        return val;
      }

      this.hasSyntaxError = true;
      return null;
    } finally {
      this.depth--;
    }
  }
}

/**
 * Main evaluation entry point
 * @param {string} exprStr - Mathematical expression string
 * @param {number} xVal - Value for variable 'x'
 * @returns {{ ok: boolean, value?: number, reason?: string }}
 */
export function evaluateMathExpression(exprStr, xVal) {
  if (!exprStr || typeof exprStr !== "string") {
    return { ok: false, reason: "invalid_syntax" };
  }

  const trimmed = exprStr.trim();
  if (trimmed.length > MAX_EXPR_LENGTH) {
    return { ok: false, reason: "length_exceeded" };
  }

  // Pre-process implicit multiplication (e.g., "3x" -> "3*x", "3sin(x)" -> "3*sin(x)")
  const sanitized = trimmed
    .replace(/(\d)\s*([a-zA-Z\(])/g, "$1*$2")
    .replace(/(\))\s*([0-9a-zA-Z\(])/g, "$1*$2");

  const tokens = tokenize(sanitized);
  if (!tokens) {
    return { ok: false, reason: "invalid_syntax" };
  }

  const parser = new MathParser(tokens, xVal);
  const result = parser.parseExpression();

  if (parser.hasDepthExceeded) {
    return { ok: false, reason: "depth_exceeded" };
  }

  if (parser.hasSyntaxError || parser.peek().type !== TOKEN_TYPES.EOF) {
    return { ok: false, reason: "invalid_syntax" };
  }

  if (result === null) {
    if (parser.hasDiscontinuity) {
      return { ok: false, reason: "discontinuity" };
    }
    return { ok: false, reason: "invalid_syntax" };
  }

  if (isNaN(result) || !isFinite(result)) {
    return { ok: false, reason: "discontinuity" };
  }

  return { ok: true, value: result };
}
