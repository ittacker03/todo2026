const STORAGE_KEY = "todo.calendar.items.v1";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const NAV_LABELS = {
  day: ["이전 날", "다음 날"],
  week: ["이전 주", "다음 주"],
  month: ["이전 달", "다음 달"],
};

let view = "month";
let selected = startOfDay(new Date());
let todos = [];
let draft = "";
let formError = "";
let editingId = null;
let editDraft = "";
let editError = "";
let pendingDeleteId = null;
let persistError = false;

const board = document.getElementById("board");
const panel = document.getElementById("panel");
const layout = document.getElementById("layout");
const period = document.getElementById("period");
const summary = document.getElementById("summary");
const status = document.getElementById("status");

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

function startOfWeek(date) {
  return addDays(startOfDay(date), -date.getDay());
}

function isSameDay(a, b) {
  return toKey(a) === toKey(b);
}

function formatFull(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`;
}

function formatPeriod(date) {
  if (view === "day") return formatFull(date);
  if (view === "month") return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getFullYear()}년 ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }
  return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getDate()}일`;
}

function dayAriaLabel(date, items) {
  const base = formatFull(date);
  if (!items.length) return `${base}, 할 일 없음`;
  const open = items.filter((item) => !item.done).length;
  return `${base}, 할 일 ${items.length}개, 미완료 ${open}개`;
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        typeof item.text === "string"
    )
    .map((item) => ({
      id: item.id,
      date: item.date,
      text: item.text.slice(0, 200),
      done: Boolean(item.done),
      createdAt: Number(item.createdAt) || 0,
    }));
}

function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    persistError = false;
  } catch {
    persistError = true;
  }
}

function itemsOn(key) {
  return todos.filter((item) => item.date === key);
}

function periodItems() {
  if (view === "day") return itemsOn(toKey(selected));
  if (view === "week") {
    const start = toKey(startOfWeek(selected));
    const end = toKey(addDays(startOfWeek(selected), 6));
    return todos.filter((item) => item.date >= start && item.date <= end);
  }
  const prefix = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}`;
  return todos.filter((item) => item.date.startsWith(prefix));
}

function summaryText(items) {
  if (!items.length) return "할 일 없음";
  const done = items.filter((item) => item.done).length;
  return `할 일 ${items.length}개 · 완료 ${done}개`;
}

function announce(message) {
  status.textContent = "";
  window.setTimeout(() => {
    status.textContent = message;
  }, 20);
}

function focusKey(node) {
  if (!(node instanceof HTMLElement) || !node.dataset.action) return null;
  const { action, view: viewName, date, id } = node.dataset;
  if (action === "select-date" && date) {
    return `[data-action="select-date"][data-date="${date}"]`;
  }
  if (action === "set-view" && viewName) {
    return `[data-action="set-view"][data-view="${viewName}"]`;
  }
  if (id) return `[data-action="${action}"][data-id="${CSS.escape(id)}"]`;
  if (node.id) return `#${node.id}`;
  return `[data-action="${action}"]`;
}

function render() {
  const selector = focusKey(document.activeElement);
  renderChrome();
  renderBoard();
  renderPanel();
  if (selector) document.querySelector(selector)?.focus({ preventScroll: true });
}

function renderChrome() {
  const [prevLabel, nextLabel] = NAV_LABELS[view];
  const prev = document.getElementById("prev-btn");
  const next = document.getElementById("next-btn");
  prev.textContent = prevLabel;
  next.textContent = nextLabel;
  prev.setAttribute("aria-label", prevLabel);
  next.setAttribute("aria-label", nextLabel);
  period.textContent = formatPeriod(selected);
  document.title = `${period.textContent} · 할 일`;
  summary.textContent = summaryText(periodItems());
  layout.classList.toggle("is-day", view === "day");
  board.hidden = view === "day";
  board.setAttribute("aria-label", view === "week" ? "주간 일정" : "월간 달력");
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
}

function renderBoard() {
  board.replaceChildren();
  if (view === "month") renderMonth();
  if (view === "week") renderWeek();
}

function renderMonth() {
  const grid = el("div", "month");
  WEEKDAYS.forEach((label, index) => {
    const name = index === 0 ? "dow is-sun" : index === 6 ? "dow is-sat" : "dow";
    grid.append(el("div", name, label));
  });
  monthCells(selected).forEach((date) => grid.append(renderMonthCell(date)));
  board.append(grid);
}

function monthCells(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const cells = [];
  for (let cursor = startOfWeek(first); cursor <= last; cursor = addDays(cursor, 1)) {
    cells.push(new Date(cursor));
  }
  while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1));
  return cells;
}

function renderMonthCell(date) {
  const key = toKey(date);
  const items = itemsOn(key);
  const button = el("button", "day");
  button.type = "button";
  button.dataset.action = "select-date";
  button.dataset.date = key;
  button.setAttribute("aria-label", dayAriaLabel(date, items));
  button.setAttribute("aria-pressed", String(isSameDay(date, selected)));
  if (date.getMonth() !== selected.getMonth()) button.classList.add("is-out");
  if (isSameDay(date, startOfDay(new Date()))) button.classList.add("is-today");
  if (isSameDay(date, selected)) button.classList.add("is-selected");

  const visual = el("span", "day-visual");
  visual.setAttribute("aria-hidden", "true");
  const top = el("span", "day-top");
  const weekday = date.getDay();
  const numClass = weekday === 0 ? "num is-sun" : weekday === 6 ? "num is-sat" : "num";
  top.append(el("span", numClass, String(date.getDate())));
  if (items.length) top.append(el("span", "mobile-count", String(items.length)));
  visual.append(top);
  items.slice(0, 3).forEach((item) => {
    const chip = el("span", item.done ? "chip is-done" : "chip", item.text);
    chip.title = item.text;
    visual.append(chip);
  });
  if (items.length > 3) visual.append(el("span", "more", `+${items.length - 3}`));
  button.append(visual);
  return button;
}

function renderWeek() {
  const scroll = el("div", "week-scroll");
  const grid = el("div", "week");
  const start = startOfWeek(selected);
  for (let index = 0; index < 7; index += 1) {
    grid.append(renderWeekColumn(addDays(start, index)));
  }
  scroll.append(grid);
  board.append(scroll);
}

function renderWeekColumn(date) {
  const key = toKey(date);
  const items = itemsOn(key);
  const column = el("div", "week-col");
  column.dataset.date = key;
  if (isSameDay(date, selected)) column.classList.add("is-selected");
  if (isSameDay(date, startOfDay(new Date()))) column.classList.add("is-today");

  const head = el("button", "week-head");
  head.type = "button";
  head.dataset.action = "select-date";
  head.dataset.date = key;
  head.setAttribute("aria-label", dayAriaLabel(date, items));
  head.setAttribute("aria-pressed", String(isSameDay(date, selected)));
  const weekday = date.getDay();
  head.append(el("span", "week-num", String(date.getDate())));
  const wdClass = weekday === 0 ? "week-wd is-sun" : weekday === 6 ? "week-wd is-sat" : "week-wd";
  head.append(el("span", wdClass, WEEKDAYS[weekday]));
  column.append(head);

  if (!items.length) {
    column.append(el("p", "mini-empty", "없음"));
  } else {
    const list = el("ul", "week-list");
    items.forEach((item) => {
      const row = el("li", item.done ? "mini is-done" : "mini", item.text);
      row.title = item.text;
      list.append(row);
    });
    column.append(list);
  }
  return column;
}

function renderPanel() {
  const key = toKey(selected);
  const items = itemsOn(key);
  const open = items.filter((item) => !item.done).length;
  const today = isSameDay(selected, startOfDay(new Date()));
  panel.replaceChildren();

  const card = el("div", "panel");
  if (persistError) {
    card.append(el("p", "banner", "저장 공간이 가득 차 이 브라우저에 기록하지 못했습니다."));
  }

  const title = el("h3", "panel-title");
  if (view === "day") {
    title.textContent = "이 날의 할 일";
  } else {
    title.append(document.createTextNode(`${selected.getMonth() + 1}월 ${selected.getDate()}일 `));
    const weekday = selected.getDay();
    const wdClass = weekday === 0 ? "is-sun" : weekday === 6 ? "is-sat" : "";
    title.append(el("span", wdClass, `${WEEKDAYS[weekday]}요일`));
  }
  if (today) title.append(el("span", "badge", "오늘"));
  card.append(title);

  let meta = "등록된 할 일이 없습니다.";
  if (items.length && open === 0) meta = `전체 ${items.length}개를 모두 완료했습니다.`;
  else if (items.length) meta = `전체 ${items.length}개 · 남음 ${open}개`;
  card.append(el("p", "panel-meta", meta));

  const form = el("form", "add-form");
  form.id = "add-form";
  const input = el("input");
  input.id = "todo-input";
  input.type = "text";
  input.maxLength = 200;
  input.placeholder = "새로운 할 일을 입력하세요";
  input.value = draft;
  input.setAttribute("aria-label", "새로운 할 일");
  input.setAttribute("aria-invalid", formError ? "true" : "false");
  if (formError) input.setAttribute("aria-describedby", "form-error");
  if (formError) input.classList.add("is-invalid");
  const addButton = el("button", "btn btn-primary", "추가");
  addButton.type = "submit";
  form.append(input, addButton);
  card.append(form);
  if (formError) {
    const error = el("p", "error", formError);
    error.id = "form-error";
    card.append(error);
  }

  if (!items.length) {
    card.append(el("p", "empty", "이 날짜에 적힌 할 일이 없습니다."));
  } else {
    const list = el("ul", "todo-list");
    items.forEach((item) => list.append(renderTodo(item)));
    card.append(list);
  }
  panel.append(card);
}

function renderTodo(item) {
  const row = el("li", item.done ? "todo is-done" : "todo");
  if (editingId === item.id) {
    row.append(renderEditForm(item));
    return row;
  }
  if (pendingDeleteId === item.id) {
    row.append(renderDeleteConfirm(item));
    return row;
  }

  const label = el("label");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.done;
  checkbox.dataset.action = "toggle";
  checkbox.dataset.id = item.id;
  checkbox.setAttribute("aria-label", item.done ? `${item.text} 완료 해제` : `${item.text} 완료`);
  label.append(checkbox, el("span", "todo-text", item.text));

  const actions = el("div", "todo-actions");
  const edit = el("button", "btn btn-ghost", "수정");
  edit.type = "button";
  edit.dataset.action = "edit";
  edit.dataset.id = item.id;
  const remove = el("button", "btn btn-ghost", "삭제");
  remove.type = "button";
  remove.dataset.action = "delete";
  remove.dataset.id = item.id;
  actions.append(edit, remove);
  row.append(label, actions);
  return row;
}

function renderEditForm(item) {
  const form = el("form", "edit-form");
  form.id = "edit-form";
  const input = el("input");
  input.id = "edit-input";
  input.type = "text";
  input.maxLength = 200;
  input.value = editDraft;
  input.setAttribute("aria-label", "할 일 내용");
  input.setAttribute("aria-invalid", editError ? "true" : "false");
  if (editError) input.classList.add("is-invalid");
  const actions = el("div", "edit-actions");
  const saveButton = el("button", "btn btn-primary", "저장");
  saveButton.type = "submit";
  const cancel = el("button", "btn", "취소");
  cancel.type = "button";
  cancel.dataset.action = "cancel-edit";
  actions.append(saveButton, cancel);
  form.append(input, actions);
  if (editError) form.append(el("p", "error", editError));
  return form;
}

function renderDeleteConfirm(item) {
  const box = el("div", "confirm");
  box.append(el("p", "confirm-text", `“${item.text}” 항목을 삭제할까요?`));
  const actions = el("div", "confirm-actions");
  const yes = el("button", "btn btn-danger", "삭제");
  yes.type = "button";
  yes.dataset.action = "confirm-delete";
  yes.dataset.id = item.id;
  const no = el("button", "btn", "취소");
  no.type = "button";
  no.dataset.action = "cancel-delete";
  actions.append(yes, no);
  box.append(actions);
  return box;
}

function setSelected(date) {
  const next = startOfDay(date);
  if (!isSameDay(next, selected)) {
    draft = "";
    formError = "";
    editingId = null;
    editDraft = "";
    editError = "";
    pendingDeleteId = null;
  }
  selected = next;
  render();
}

function shift(direction) {
  if (view === "day") setSelected(addDays(selected, direction));
  else if (view === "week") setSelected(addDays(selected, direction * 7));
  else setSelected(addMonths(selected, direction));
}

function addTodo() {
  const text = (document.getElementById("todo-input")?.value || "").trim();
  if (!text) {
    formError = "내용을 입력하세요.";
    render();
    document.getElementById("todo-input")?.focus();
    return;
  }
  todos.push({
    id: uid(),
    date: toKey(selected),
    text,
    done: false,
    createdAt: Date.now(),
  });
  save();
  draft = "";
  formError = "";
  announce("할 일을 추가했습니다.");
  render();
  document.getElementById("todo-input")?.focus();
}

function beginEdit(id) {
  const item = todos.find((entry) => entry.id === id);
  if (!item || item.date !== toKey(selected)) return;
  editingId = id;
  editDraft = item.text;
  editError = "";
  pendingDeleteId = null;
  render();
  const input = document.getElementById("edit-input");
  input?.focus();
  input?.select();
}

function saveEdit() {
  const item = todos.find((entry) => entry.id === editingId);
  if (!item) return;
  const text = (document.getElementById("edit-input")?.value || "").trim();
  if (!text) {
    editError = "내용을 입력하세요.";
    render();
    document.getElementById("edit-input")?.focus();
    return;
  }
  item.text = text;
  const id = item.id;
  editingId = null;
  editError = "";
  save();
  announce("할 일을 수정했습니다.");
  render();
  document.querySelector(`[data-action="edit"][data-id="${CSS.escape(id)}"]`)?.focus();
}

function cancelEdit() {
  const id = editingId;
  editingId = null;
  editError = "";
  render();
  if (id) document.querySelector(`[data-action="edit"][data-id="${CSS.escape(id)}"]`)?.focus();
}

function toggleTodo(id) {
  const item = todos.find((entry) => entry.id === id);
  if (!item) return;
  item.done = !item.done;
  save();
  announce(item.done ? "할 일을 완료했습니다." : "할 일을 미완료로 바꿨습니다.");
  render();
}

function removeTodo(id) {
  const item = todos.find((entry) => entry.id === id);
  todos = todos.filter((entry) => entry.id !== id);
  pendingDeleteId = null;
  if (editingId === id) editingId = null;
  save();
  announce(item ? `“${item.text}” 항목을 삭제했습니다.` : "할 일을 삭제했습니다.");
  render();
  document.getElementById("todo-input")?.focus();
}

function onClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (actionEl && actionEl.dataset.action !== "toggle") {
    const { action, view: viewName, date, id } = actionEl.dataset;
    if (action === "prev") shift(-1);
    else if (action === "next") shift(1);
    else if (action === "today") setSelected(new Date());
    else if (action === "set-view" && NAV_LABELS[viewName] && view !== viewName) {
      view = viewName;
      editingId = null;
      pendingDeleteId = null;
      editError = "";
      render();
    } else if (action === "select-date") setSelected(parseKey(date));
    else if (action === "edit") beginEdit(id);
    else if (action === "delete") {
      pendingDeleteId = id;
      editingId = null;
      render();
      document.querySelector(`[data-action="confirm-delete"][data-id="${CSS.escape(id)}"]`)?.focus();
    } else if (action === "cancel-delete") {
      pendingDeleteId = null;
      render();
    } else if (action === "confirm-delete") removeTodo(id);
    else if (action === "cancel-edit") cancelEdit();
    return;
  }
  const hit = event.target.closest("[data-date]");
  if (hit?.dataset.date) setSelected(parseKey(hit.dataset.date));
}

function onSubmit(event) {
  event.preventDefault();
  if (event.target.id === "add-form") addTodo();
  if (event.target.id === "edit-form") saveEdit();
}

function onInput(event) {
  if (event.target.id === "todo-input") {
    draft = event.target.value;
    if (formError) {
      formError = "";
      event.target.classList.remove("is-invalid");
      event.target.removeAttribute("aria-describedby");
      document.getElementById("form-error")?.remove();
    }
  }
  if (event.target.id === "edit-input") {
    editDraft = event.target.value;
    if (editError) {
      editError = "";
      event.target.classList.remove("is-invalid");
      event.target.parentElement?.querySelector(".error")?.remove();
    }
  }
}

function onChange(event) {
  const input = event.target.closest('[data-action="toggle"]');
  if (!input) return;
  toggleTodo(input.dataset.id);
}

function onKeydown(event) {
  if (event.key !== "Escape" || (!editingId && !pendingDeleteId)) return;
  editingId = null;
  pendingDeleteId = null;
  editError = "";
  render();
  document.getElementById("todo-input")?.focus();
}

function onStorage(event) {
  if (event.key !== STORAGE_KEY) return;
  todos = load();
  if (editingId && !todos.some((item) => item.id === editingId)) editingId = null;
  if (pendingDeleteId && !todos.some((item) => item.id === pendingDeleteId)) pendingDeleteId = null;
  render();
}

function init() {
  todos = load();
  const app = document.getElementById("app");
  app.addEventListener("click", onClick);
  app.addEventListener("submit", onSubmit);
  app.addEventListener("input", onInput);
  app.addEventListener("change", onChange);
  app.addEventListener("keydown", onKeydown);
  window.addEventListener("storage", onStorage);
  render();
}

init();
