const CANVAS_SIZE = 20000;
const MAX_COMMANDS = 16;
const MAX_TEXT_LENGTH = 800;
const TOOL_NAMES = new Set(["write_text", "draw_formula", "plot_function", "draw"]);
const PLOT_EXPRESSION_PATTERN = /^[0-9a-zA-Z_+\-*/^().,\s]+$/;
const PLOT_IDENTIFIERS = new Set(["x", "pi", "e", "sin", "cos", "tan", "sqrt", "abs", "exp", "log", "ln"]);
const DRAW_TYPES = new Set(["line", "smooth", "rect", "ellipse", "circle", "arc"]);

const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);
const isInteger = value => Number.isInteger(value);
const isInsideCanvas = (x, y) => x >= 0 && x <= CANVAS_SIZE && y >= 0 && y <= CANVAS_SIZE;
const hasOnlySupportedIdentifiers = expression => {
  const identifiers = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  return identifiers.every(identifier => PLOT_IDENTIFIERS.has(identifier.toLowerCase()));
};

const validPoint = point => (
  Array.isArray(point) &&
  point.length === 2 &&
  isFiniteNumber(point[0]) &&
  isFiniteNumber(point[1])
);

const validateCommand = command => {
  if (!command || typeof command !== "object" || !TOOL_NAMES.has(command.tool)) {
    return false;
  }

  if (command.tool === "write_text") {
    return (
      isFiniteNumber(command.x) &&
      isFiniteNumber(command.y) &&
      isInsideCanvas(command.x, command.y) &&
      typeof command.text === "string" &&
      command.text.length > 0 &&
      command.text.length <= MAX_TEXT_LENGTH &&
      isFiniteNumber(command.fontSize) &&
      command.fontSize >= 8 &&
      command.fontSize <= 144 &&
      isFiniteNumber(command.maxWidth) &&
      command.maxWidth >= 40 &&
      command.maxWidth <= 2000 &&
      isFiniteNumber(command.lineHeight) &&
      command.lineHeight >= 0.8 &&
      command.lineHeight <= 3
    );
  }

  if (command.tool === "draw_formula") {
    return (
      isFiniteNumber(command.x) &&
      isFiniteNumber(command.y) &&
      isInsideCanvas(command.x, command.y) &&
      typeof command.latex === "string" &&
      command.latex.length > 0 &&
      command.latex.length <= MAX_TEXT_LENGTH &&
      isFiniteNumber(command.fontSize) &&
      command.fontSize >= 8 &&
      command.fontSize <= 144
    );
  }

  if (command.tool === "plot_function") {
    return (
      isFiniteNumber(command.x) &&
      isFiniteNumber(command.y) &&
      isInsideCanvas(command.x, command.y) &&
      isFiniteNumber(command.w) &&
      isFiniteNumber(command.h) &&
      command.w >= 240 &&
      command.h >= 180 &&
      command.w <= CANVAS_SIZE &&
      command.h <= CANVAS_SIZE &&
      command.x + command.w <= CANVAS_SIZE &&
      command.y + command.h <= CANVAS_SIZE &&
      typeof command.expression === "string" &&
      command.expression.length > 0 &&
      command.expression.length <= 500 &&
      PLOT_EXPRESSION_PATTERN.test(command.expression) &&
      hasOnlySupportedIdentifiers(command.expression)
    );
  }

  if (
    !Array.isArray(command.origin) ||
    command.origin.length !== 2 ||
    !isInteger(command.origin[0]) ||
    !isInteger(command.origin[1]) ||
    !isInsideCanvas(command.origin[0], command.origin[1]) ||
    !Array.isArray(command.types) ||
    !Array.isArray(command.items) ||
    command.types.length === 0 ||
    command.types.length !== command.items.length ||
    command.types.length > 64
  ) {
    return false;
  }

  if (command.types.some(type => typeof type !== "string" || !DRAW_TYPES.has(type))) {
    return false;
  }

  if (command.items.some(item => !Array.isArray(item) || item.length === 0 || item.some(value => !isFiniteNumber(value)))) {
    return false;
  }

  if (command.width !== undefined && (!isInteger(command.width) || command.width < 2 || command.width > 200)) {
    return false;
  }

  return true;
};

export function validateAiCommands(commands) {
  if (!Array.isArray(commands)) return [];
  return commands.slice(0, MAX_COMMANDS).filter(validateCommand);
}
