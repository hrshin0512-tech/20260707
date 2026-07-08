const numberSlots = document.querySelector("#numberSlots");
const bonusSlot = document.querySelector("#bonusSlot");
const drawButton = document.querySelector("#drawButton");
const quickButton = document.querySelector("#quickButton");
const copyButton = document.querySelector("#copyButton");
const resetButton = document.querySelector("#resetButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const historyList = document.querySelector("#historyList");
const archiveSearch = document.querySelector("#archiveSearch");
const refreshArchiveButton = document.querySelector("#refreshArchiveButton");
const archiveSummary = document.querySelector("#archiveSummary");
const archiveBody = document.querySelector("#archiveBody");
const loadMoreButton = document.querySelector("#loadMoreButton");

const STORAGE_KEY = "lotto-draw-history";
const ARCHIVE_CACHE_KEY = "lotto-official-archive";
const OFFICIAL_API = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=";
const FALLBACK_LATEST_DRAW = 1148;
const pageSize = 40;
const slotCount = 6;
let currentDraw = null;
let history = loadHistory();
let isDrawing = false;
let archive = [];
let filteredArchive = [];
let visibleArchiveCount = pageSize;

const supabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseEnabled = Boolean(
  supabaseConfig.url &&
    supabaseConfig.anonKey &&
    supabaseConfig.url !== "https://YOUR_PROJECT_REF.supabase.co"
);
let supabaseClient = null;

if (supabaseEnabled && window.supabase) {
  supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
}

function createSlots() {
  numberSlots.innerHTML = "";
  for (let index = 0; index < slotCount; index += 1) {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.textContent = "?";
    slot.setAttribute("aria-label", `${index + 1}번째 번호`);
    numberSlots.append(slot);
  }
}

function drawLottoNumbers() {
  const pool = Array.from({ length: 45 }, (_, index) => index + 1);
  shuffle(pool);
  const numbers = pool.slice(0, 6).sort((a, b) => a - b);
  const bonus = pool[6];
  return { numbers, bonus, createdAt: new Date().toISOString() };
}

function shuffle(items) {
  const randomValues = new Uint32Array(items.length);
  crypto.getRandomValues(randomValues);

  for (let index = items.length - 1; index > 0; index -= 1) {
    const next = randomValues[index] % (index + 1);
    [items[index], items[next]] = [items[next], items[index]];
  }
}

async function animatedDraw() {
  if (isDrawing) return;
  setDrawingState(true);
  clearSlots();

  const draw = drawLottoNumbers();
  currentDraw = draw;
  const slots = [...document.querySelectorAll(".slot")];

  for (let index = 0; index < draw.numbers.length; index += 1) {
    await wait(430);
    revealBall(slots[index], draw.numbers[index]);
  }

  await wait(520);
  revealBall(bonusSlot, draw.bonus);
  addToHistory(draw);
  setDrawingState(false);
}

function instantDraw() {
  if (isDrawing) return;
  const draw = drawLottoNumbers();
  currentDraw = draw;
  const slots = [...document.querySelectorAll(".slot")];
  draw.numbers.forEach((number, index) => revealBall(slots[index], number));
  revealBall(bonusSlot, draw.bonus);
  addToHistory(draw);
}

function revealBall(element, number) {
  element.textContent = number;
  element.style.background = getBallColor(number);
  element.classList.remove("pop");
  void element.offsetWidth;
  element.classList.add("pop");
}

function getBallColor(number) {
  if (number <= 10) return "var(--yellow)";
  if (number <= 20) return "var(--blue)";
  if (number <= 30) return "var(--red)";
  if (number <= 40) return "var(--gray)";
  return "var(--green)";
}

function clearSlots() {
  document.querySelectorAll(".slot").forEach((slot) => {
    slot.textContent = "?";
    slot.style.background = "";
    slot.style.color = "";
    slot.classList.remove("pop");
  });
  bonusSlot.textContent = "?";
  bonusSlot.style.background = "";
  bonusSlot.style.color = "";
  bonusSlot.classList.remove("pop");
}

function setDrawingState(active) {
  isDrawing = active;
  drawButton.disabled = active;
  quickButton.disabled = active;
  drawButton.textContent = active ? "추첨 중..." : "추첨하기";
}

async function saveDrawToSupabase(draw) {
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.from("lotto_draws").insert([
      {
        numbers: draw.numbers,
        bonus: draw.bonus,
        created_at: draw.createdAt,
        source: "app",
      },
    ]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn("Supabase 저장에 실패했습니다.", error);
  }
}

function addToHistory(draw) {
  history = [draw, ...history].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistory();
  void saveDrawToSupabase(draw);
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function renderHistory() {
  historyList.innerHTML = "";

  if (history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history-item";
    empty.textContent = "아직 추첨 기록이 없습니다.";
    historyList.append(empty);
    return;
  }

  history.forEach((draw, index) => {
    const item = document.createElement("li");
    item.className = "history-item";

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `${history.length - index}회차 저장 · ${formatTime(draw.createdAt)}`;

    const numbers = document.createElement("div");
    numbers.className = "history-numbers";
    [...draw.numbers, draw.bonus].forEach((number, numberIndex) => {
      if (numberIndex === slotCount) {
        const plus = document.createElement("span");
        plus.className = "plus";
        plus.textContent = "+";
        numbers.append(plus);
      }

      const ball = document.createElement("span");
      ball.className = "history-ball";
      ball.textContent = number;
      ball.style.background = getBallColor(number);
      numbers.append(ball);
    });

    item.append(meta, numbers);
    historyList.append(item);
  });
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function copyCurrentDraw() {
  if (!currentDraw) {
    showToast("먼저 추첨해 주세요");
    return;
  }

  const text = `로또 번호: ${currentDraw.numbers.join(", ")} + 보너스 ${currentDraw.bonus}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("복사했습니다");
  } catch {
    showToast(text);
  }
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

function resetCurrent() {
  if (isDrawing) return;
  currentDraw = null;
  clearSlots();
}

function clearHistory() {
  history = [];
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
}

async function loadArchive({ force = false } = {}) {
  setArchiveLoading(true);
  visibleArchiveCount = pageSize;

  try {
    const draws = await fetchArchiveData();
    archive = draws.sort((a, b) => b.round - a.round);
    localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(archive));
    applyArchiveFilter();
    archiveSummary.textContent = `${archive[0].round}회부터 ${archive[archive.length - 1].round}회까지 ${archive.length.toLocaleString("ko-KR")}개 회차를 표시합니다.`;
  } catch (error) {
    if (archive.length === 0) {
      archiveSummary.textContent = "역대 번호를 불러오지 못했습니다. 잠시 후 새로고침을 눌러 주세요.";
      archiveBody.innerHTML = `<tr><td colspan="4">공식 데이터 연결에 실패했습니다.</td></tr>`;
    } else {
      archiveSummary.textContent = "공식 데이터 연결에 실패해 저장된 데이터를 계속 표시합니다.";
    }
  } finally {
    setArchiveLoading(false);
  }
}

async function fetchArchiveData() {
  try {
    if (window.LOTTO_ARCHIVE_DATA && Array.isArray(window.LOTTO_ARCHIVE_DATA)) {
      return window.LOTTO_ARCHIVE_DATA.map((draw) => ({
        round: draw.round,
        date: draw.date,
        numbers: draw.numbers,
        bonus: draw.bonus,
      }));
    }

    const response = await fetch("archive-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("local archive data unavailable");
    const data = await response.json();
    return data.map((draw) => ({
      round: draw.round,
      date: draw.date,
      numbers: draw.numbers,
      bonus: draw.bonus,
    }));
  } catch (error) {
    return [
      {
        round: FALLBACK_LATEST_DRAW,
        date: "2025-06-14",
        numbers: [3, 8, 15, 21, 34, 42],
        bonus: 10,
      },
    ];
  }
}

function loadArchiveCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(ARCHIVE_CACHE_KEY));
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}

function applyArchiveFilter() {
  const keyword = archiveSearch.value.trim();
  visibleArchiveCount = pageSize;

  filteredArchive = archive.filter((draw) => {
    if (!keyword) return true;
    if (String(draw.round).includes(keyword)) return true;
    return [...draw.numbers, draw.bonus].some((number) => String(number) === keyword);
  });

  renderArchive();
}

function renderArchive() {
  archiveBody.innerHTML = "";
  const rows = filteredArchive.slice(0, visibleArchiveCount);

  if (rows.length === 0) {
    archiveBody.innerHTML = `<tr><td colspan="4">표시할 회차가 없습니다.</td></tr>`;
  } else {
    rows.forEach((draw) => archiveBody.append(createArchiveRow(draw)));
  }

  loadMoreButton.hidden = visibleArchiveCount >= filteredArchive.length;
  if (archive.length > 0) {
    archiveSummary.textContent = `${filteredArchive.length.toLocaleString("ko-KR")}개 회차 중 ${Math.min(visibleArchiveCount, filteredArchive.length).toLocaleString("ko-KR")}개 표시`;
  }
}

function createArchiveRow(draw) {
  const row = document.createElement("tr");
  const round = document.createElement("td");
  const date = document.createElement("td");
  const numbers = document.createElement("td");
  const bonus = document.createElement("td");

  round.textContent = `${draw.round}회`;
  date.textContent = draw.date;
  numbers.append(createNumberGroup(draw.numbers));
  bonus.append(createBall(draw.bonus));
  row.append(round, date, numbers, bonus);
  return row;
}

function createNumberGroup(numbers) {
  const group = document.createElement("div");
  group.className = "archive-numbers";
  numbers.forEach((number) => group.append(createBall(number)));
  return group;
}

function createBall(number) {
  const ball = document.createElement("span");
  ball.className = "archive-ball";
  ball.textContent = number;
  ball.style.background = getBallColor(number);
  return ball;
}

function setArchiveLoading(active) {
  refreshArchiveButton.disabled = active;
  refreshArchiveButton.textContent = active ? "불러오는 중..." : "새로고침";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

createSlots();
clearSlots();
renderHistory();
loadArchive();

drawButton.addEventListener("click", animatedDraw);
quickButton.addEventListener("click", instantDraw);
copyButton.addEventListener("click", copyCurrentDraw);
resetButton.addEventListener("click", resetCurrent);
clearHistoryButton.addEventListener("click", clearHistory);
archiveSearch.addEventListener("input", applyArchiveFilter);
refreshArchiveButton.addEventListener("click", () => loadArchive({ force: true }));
loadMoreButton.addEventListener("click", () => {
  visibleArchiveCount += 40;
  renderArchive();
});
