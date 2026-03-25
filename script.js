const levels = [
  { expression: "9 + 5 - 3 + 2", hint: "Start with addition/subtraction from left to right." },
  { expression: "8 + 3 * 2 - 4 / 2", hint: "Solve multiplication/division before addition/subtraction." },
  { expression: "( 8 + 4 ) / 2 + 3 * ( 2 + 1 )", hint: "Clear inner brackets first." },
  { expression: "( 12 - ( 2 + 1 ) ) * 2 + 18 / ( 3 + 3 ) - 5", hint: "Use BODMAS carefully with nested brackets." }
];

const state = {
  levelIndex: 0,
  score: 0,
  expression: [],
  levelMistakes: 0,
  isLocked: false,
  isComplete: false,
  timerStart: 0,
  timerHandle: null
};

const board = document.getElementById("expressionBoard");
const hintBox = document.getElementById("hintBox");
const scoreValue = document.getElementById("scoreValue");
const levelValue = document.getElementById("levelValue");
const timerValue = document.getElementById("timerValue");
const nextLevelButton = document.getElementById("nextLevelButton");
const resetButton = document.getElementById("resetButton");
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");

function generateExpression() {
  const level = levels[state.levelIndex];
  state.expression = tokenize(level.expression);
  state.levelMistakes = 0;
  state.isComplete = false;
  state.isLocked = false;
  state.timerStart = Date.now();
  nextLevelButton.classList.add("hidden");
  hintBox.textContent = level.hint;
  updateHeader();
  updateUI();
  restartTimer();
}

function validateMove(operatorIndex) {
  const token = state.expression[operatorIndex];
  if (!token || token.type !== "operator") {
    return { valid: false, hint: "Select an operator card to continue." };
  }

  const validIndex = findNextValidOperatorIndex(state.expression);
  if (validIndex === -1) {
    return { valid: false, hint: "No valid operation available yet. Resolve brackets first." };
  }

  if (operatorIndex === validIndex) {
    return { valid: true, hint: "Great move." };
  }

  const expected = state.expression[validIndex]?.value;
  return {
    valid: false,
    hint: buildPriorityHint(expected)
  };
}

function performOperation(operatorIndex) {
  const left = state.expression[operatorIndex - 1];
  const operator = state.expression[operatorIndex];
  const right = state.expression[operatorIndex + 1];

  if (!left || !operator || !right || left.type !== "number" || right.type !== "number") {
    return { success: false, message: "Invalid operation pattern. Pick a highlighted operator." };
  }

  const a = left.value;
  const b = right.value;
  let result = 0;

  if (operator.value === "+") result = a + b;
  if (operator.value === "-") result = a - b;
  if (operator.value === "*") result = a * b;
  if (operator.value === "^") result = a ** b;
  if (operator.value === "/") {
    if (Math.abs(b) < Number.EPSILON) {
      return { success: false, message: "Division by zero is not allowed. Choose a different path." };
    }
    result = a / b;
  }

  const safe = normalizeNumber(result);
  state.expression.splice(operatorIndex - 1, 3, { type: "number", value: safe });
  unwrapParentheses(state.expression);
  return { success: true, result: safe };
}

function updateUI(animateIndex = -1) {
  board.innerHTML = "";
  const validIndex = findNextValidOperatorIndex(state.expression);

  state.expression.forEach((token, index) => {
    const card = document.createElement("button");
    card.className = "card";
    card.type = "button";
    card.textContent = displayToken(token);

    if (token.type === "number") {
      card.classList.add("number");
      card.disabled = true;
    }

    if (token.type === "paren") {
      card.classList.add("paren");
      card.disabled = true;
    }

    if (token.type === "operator") {
      card.classList.add("operator");
      if (index === validIndex && !state.isLocked) card.classList.add("selectable");
      card.addEventListener("click", () => handleOperatorClick(index, card));
    } else {
      card.style.cursor = "default";
    }

    if (animateIndex === index) card.classList.add("merge");
    board.appendChild(card);
  });
}

function checkWin() {
  if (state.expression.length === 1 && state.expression[0].type === "number") {
    state.isComplete = true;
    state.isLocked = true;
    clearInterval(state.timerHandle);
    const answer = displayToken(state.expression[0]);
    const elapsed = Math.floor((Date.now() - state.timerStart) / 1000);
    const speedBonus = Math.max(0, 180 - elapsed);
    const cleanBonus = state.levelMistakes === 0 ? 180 : 0;
    state.score += speedBonus + cleanBonus;
    updateHeader();
    hintBox.textContent = `🎉 Correct! Final answer: ${answer}. Speed bonus +${speedBonus}${cleanBonus ? `, flawless bonus +${cleanBonus}` : ""}.`;
    nextLevelButton.textContent = state.levelIndex < levels.length - 1 ? "Next Level" : "Play Again";
    nextLevelButton.classList.remove("hidden");
    launchConfetti();
    playTone("win");
  }
}

function handleOperatorClick(index, card) {
  if (state.isLocked || state.isComplete) return;
  const result = validateMove(index);
  card.classList.remove("wrong", "correct");
  void card.offsetWidth;

  if (!result.valid) {
    state.levelMistakes += 1;
    state.score = Math.max(0, state.score - 20);
    updateHeader();
    card.classList.add("wrong");
    hintBox.textContent = `❌ ${result.hint}${state.levelMistakes >= 3 ? ` Next best move: ${describeExpectedMove()}.` : ""}`;
    playTone("error");
    return;
  }

  state.isLocked = true;
  card.classList.add("selected", "correct");
  hintBox.textContent = "✅ Nice! Resolving operation...";
  playTone("success");

  setTimeout(() => {
    const operation = performOperation(index);
    if (!operation.success) {
      state.levelMistakes += 1;
      state.score = Math.max(0, state.score - 20);
      state.isLocked = false;
      updateHeader();
      hintBox.textContent = `❌ ${operation.message}`;
      playTone("error");
      updateUI();
      return;
    }

    state.score += 100;
    updateHeader();
    const targetIndex = Math.max(0, index - 1);
    hintBox.textContent = "✅ Correct step. Keep going in BODMAS order.";
    updateUI(targetIndex);
    state.isLocked = false;
    checkWin();
  }, 260);
}

function buildPriorityHint(expectedOperator) {
  if (expectedOperator === "*" || expectedOperator === "/") {
    return "Try solving multiplication/division first!";
  }
  if (expectedOperator === "+" || expectedOperator === "-") {
    return "Now solve addition/subtraction from left to right.";
  }
  if (expectedOperator === "^") {
    return "Evaluate powers before multiplication or addition.";
  }
  return "Resolve the leftmost valid operation in the current bracket scope.";
}

function describeExpectedMove() {
  const index = findNextValidOperatorIndex(state.expression);
  if (index < 0) return "No move available";
  const left = state.expression[index - 1];
  const op = state.expression[index];
  const right = state.expression[index + 1];
  if (!left || !op || !right) return "Pick the highlighted operator";
  return `${displayToken(left)} ${displayToken(op)} ${displayToken(right)}`;
}

function findNextValidOperatorIndex(tokens) {
  const scope = findCurrentScope(tokens);
  if (!scope) return -1;
  const [start, end] = scope;
  const precedence = [["^"], ["*", "/"], ["+", "-"]];

  for (const group of precedence) {
    for (let i = start; i <= end; i += 1) {
      const token = tokens[i];
      if (token?.type === "operator" && group.includes(token.value)) {
        return i;
      }
    }
  }
  return -1;
}

function findCurrentScope(tokens) {
  const stack = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type === "paren" && tokens[i].value === "(") stack.push(i);
    if (tokens[i].type === "paren" && tokens[i].value === ")") {
      const left = stack.pop();
      return [left + 1, i - 1];
    }
  }
  return [0, tokens.length - 1];
}

function unwrapParentheses(tokens) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < tokens.length - 2; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      const c = tokens[i + 2];
      if (
        a?.type === "paren" &&
        a.value === "(" &&
        b?.type === "number" &&
        c?.type === "paren" &&
        c.value === ")"
      ) {
        tokens.splice(i, 3, { type: "number", value: b.value });
        changed = true;
        break;
      }
    }
  }
}

function tokenize(expression) {
  const source = expression.replaceAll("×", "*").replaceAll("÷", "/").replace(/\s+/g, "");
  const raw = source.match(/\d+(?:\.\d+)?|[()+\-*/^]/g) || [];
  return raw.map((value) => {
    if (/^\d/.test(value)) return { type: "number", value: Number(value) };
    if (value === "(" || value === ")") return { type: "paren", value };
    return { type: "operator", value };
  });
}

function displayToken(token) {
  if (token.type === "number") return formatNumber(token.value);
  if (token.value === "*") return "×";
  if (token.value === "/") return "÷";
  return token.value;
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function normalizeNumber(value) {
  const normalized = Number(value.toFixed(10));
  return Object.is(normalized, -0) ? 0 : normalized;
}

function updateHeader() {
  scoreValue.textContent = String(state.score);
  levelValue.textContent = `${state.levelIndex + 1} / ${levels.length}`;
}

function restartTimer() {
  clearInterval(state.timerHandle);
  timerValue.textContent = "00:00";
  state.timerHandle = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.timerStart) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    timerValue.textContent = `${mm}:${ss}`;
  }, 250);
}

function playTone(kind) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!playTone.ctx) playTone.ctx = new AudioContextClass();
  const audio = playTone.ctx;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.connect(gain);
  gain.connect(audio.destination);

  if (kind === "success") oscillator.frequency.value = 520;
  if (kind === "error") oscillator.frequency.value = 180;
  if (kind === "win") oscillator.frequency.value = 760;

  gain.gain.value = kind === "error" ? 0.05 : 0.04;
  oscillator.type = kind === "error" ? "sawtooth" : "triangle";
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
  oscillator.stop(audio.currentTime + 0.2);
}

function launchConfetti() {
  resizeConfettiCanvas();
  const count = 120;
  const pieces = Array.from({ length: count }, () => ({
    x: Math.random() * confettiCanvas.width,
    y: -20 - Math.random() * confettiCanvas.height * 0.2,
    size: 4 + Math.random() * 8,
    speedY: 1.5 + Math.random() * 4,
    speedX: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: -0.1 + Math.random() * 0.2,
    color: ["#92a3ff", "#89f3ce", "#ff92c8", "#ffd984", "#a98cff"][Math.floor(Math.random() * 5)]
  }));

  let frame = 0;
  const draw = () => {
    frame += 1;
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    pieces.forEach((p) => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rot += p.rotSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    if (frame < 210) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  };

  requestAnimationFrame(draw);
}

function resizeConfettiCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

nextLevelButton.addEventListener("click", () => {
  if (state.levelIndex < levels.length - 1) {
    state.levelIndex += 1;
    generateExpression();
    return;
  }
  state.levelIndex = 0;
  state.score = 0;
  generateExpression();
});

resetButton.addEventListener("click", () => {
  state.score = 0;
  state.levelIndex = 0;
  generateExpression();
});

window.addEventListener("resize", resizeConfettiCanvas);

generateExpression();
