const STORAGE_KEY = "daily-schedule-board:v2";
const LEGACY_STORAGE_KEY = "daily-schedule-board:v1";
const PRIORITY_ORDER = { important: 0, normal: 1, low: 2 };

const defaultCategories = [
  { id: "morning", name: "Morning", color: "#357a5b", builtIn: true },
  { id: "afternoon", name: "Afternoon", color: "#3e6c97", builtIn: true },
  { id: "evening", name: "Evening", color: "#bb5e4f", builtIn: true }
];

const defaultState = {
  selectedDate: getTodayISO(),
  categories: defaultCategories,
  tasks: [
    createDefaultTask("task-1", "Drink water and get ready", "morning", "normal", -3),
    createDefaultTask("task-2", "Finish one important goal", "afternoon", "important", -2),
    createDefaultTask("task-3", "Plan tomorrow before bed", "evening", "low", -1)
  ]
};

let state = loadState();

const taskInput = document.querySelector("#taskInput");
const dateInput = document.querySelector("#dateInput");
const slotInput = document.querySelector("#slotInput");
const priorityInput = document.querySelector("#priorityInput");
const addTaskButton = document.querySelector("#addTaskButton");
const categoryInput = document.querySelector("#categoryInput");
const categoryColorInput = document.querySelector("#categoryColorInput");
const addCategoryButton = document.querySelector("#addCategoryButton");
const exportButton = document.querySelector("#exportButton");
const importButton = document.querySelector("#importButton");
const importFileInput = document.querySelector("#importFileInput");
const clearCompletedButton = document.querySelector("#clearCompletedButton");
const categoryMessage = document.querySelector("#categoryMessage");
const plannedCount = document.querySelector("#plannedCount");
const doneCount = document.querySelector("#doneCount");
const emptyState = document.querySelector("#emptyState");
const board = document.querySelector("#board");
const notificationToast = document.querySelector("#notificationToast");
const laneTemplate = document.querySelector("#laneTemplate");
const taskTemplate = document.querySelector("#taskTemplate");
let reminderInterval = null;
let toastTimeout = null;
const openReminderTaskIds = new Set();

dateInput.value = state.selectedDate;
render();
startReminderClock();
syncActiveReminders();

addTaskButton.addEventListener("click", addTask);
taskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTask();
  }
});

dateInput.addEventListener("change", () => {
  state.selectedDate = dateInput.value || getTodayISO();
  dateInput.value = state.selectedDate;
  persist();
  render();
});

addCategoryButton.addEventListener("click", addCategory);
categoryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addCategory();
  }
});

exportButton.addEventListener("click", exportBoard);
importButton.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", importBoard);
clearCompletedButton.addEventListener("click", clearCompletedTasks);

function createDefaultTask(id, title, categoryId, priority, offset) {
  return {
    id,
    title,
    categoryId,
    priority,
    date: getTodayISO(),
    done: false,
    createdAt: Date.now() + offset,
    alarmAt: null,
    alarmFired: false,
    timerEndsAt: null,
    timerFired: false
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tasks)) {
      return structuredClone(defaultState);
    }

    return normalizeState(stored);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(rawState) {
  const categories = normalizeCategories(rawState.categories);
  const validCategoryIds = new Set(categories.map((category) => category.id));
  const selectedDate = isValidDateString(rawState.selectedDate) ? rawState.selectedDate : getTodayISO();

  return {
    selectedDate,
    categories,
    tasks: rawState.tasks.map((task) => ({
      id: String(task.id || `task-${crypto.randomUUID()}`),
      title: String(task.title || "Untitled plan").trim() || "Untitled plan",
      categoryId: validCategoryIds.has(task.categoryId || task.lane)
        ? task.categoryId || task.lane
        : categories[0].id,
      priority: ["important", "normal", "low"].includes(task.priority) ? task.priority : "normal",
      date: isValidDateString(task.date) ? task.date : selectedDate,
      done: Boolean(task.done),
      createdAt: Number(task.createdAt) || Date.now(),
      alarmAt: task.alarmAt || null,
      alarmFired: Boolean(task.alarmFired),
      timerEndsAt: task.timerEndsAt || null,
      timerFired: Boolean(task.timerFired)
    }))
  };
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return structuredClone(defaultCategories);
  }

  const normalized = categories
    .filter((category) => category && category.id && category.name)
    .map((category, index) => ({
      id: String(category.id),
      name: String(category.name),
      color: isValidColor(category.color) ? category.color : defaultCategories[index % defaultCategories.length].color,
      builtIn: Boolean(category.builtIn)
    }));

  return normalized.length > 0 ? normalized : structuredClone(defaultCategories);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addTask() {
  const title = taskInput.value.trim();
  if (!title) {
    taskInput.focus();
    return;
  }

  state.tasks.push({
    id: `task-${crypto.randomUUID()}`,
    title,
    categoryId: slotInput.value,
    priority: priorityInput.value,
    date: state.selectedDate,
    done: false,
    createdAt: Date.now(),
    alarmAt: null,
    alarmFired: false,
    timerEndsAt: null,
    timerFired: false
  });

  taskInput.value = "";
  persist();
  render();
}

function addCategory() {
  const name = categoryInput.value.trim();
  if (!name) {
    categoryInput.focus();
    return;
  }

  const duplicate = state.categories.some(
    (category) => category.name.toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    showCategoryMessage("That category already exists.");
    return;
  }

  const category = {
    id: `category-${crypto.randomUUID()}`,
    name,
    color: categoryColorInput.value,
    builtIn: false
  };

  state.categories.push(category);
  categoryInput.value = "";
  categoryMessage.textContent = "";
  persist();
  render();
  slotInput.value = category.id;
}

function removeCategory(categoryId) {
  const category = state.categories.find((item) => item.id === categoryId);
  const hasTasks = state.tasks.some((task) => task.categoryId === categoryId);

  if (!category || category.builtIn || hasTasks) {
    return;
  }

  state.categories = state.categories.filter((item) => item.id !== categoryId);
  persist();
  render();
}

function moveTask(taskId, categoryId) {
  const task = findTask(taskId);
  const categoryExists = state.categories.some((category) => category.id === categoryId);
  if (!task || !categoryExists) {
    return;
  }

  task.categoryId = categoryId;
  persist();
  render();
}

function moveTaskDate(taskId, date) {
  const task = findTask(taskId);
  if (!task || !isValidDateString(date)) {
    return;
  }

  task.date = date;
  persist();
  render();
}

function updateTaskPriority(taskId, priority) {
  const task = findTask(taskId);
  if (!task || !["important", "normal", "low"].includes(priority)) {
    return;
  }

  task.priority = priority;
  persist();
  render();
}

function renameTask(taskId, title) {
  const task = findTask(taskId);
  const nextTitle = title.trim();
  if (!task) {
    return;
  }

  if (!nextTitle) {
    render();
    showNotification("Task name cannot be empty.");
    return;
  }

  task.title = nextTitle;
  persist();
  render();
}

function toggleDone(taskId, done) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  task.done = done;
  persist();
  render();
}

async function deleteTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  if (hasActiveReminder(task)) {
    const confirmed = window.confirm(
      `"${task.title}" has an active reminder. Delete the task and cancel its reminders?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await cancelAllServerReminders(task);
    } catch {
      showNotification("Could not cancel the reminder. The task was not deleted.");
      return;
    }
  }

  openReminderTaskIds.delete(taskId);
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  persist();
  render();
}

async function clearCompletedTasks() {
  const completedTasks = getVisibleTasks().filter((task) => task.done);
  if (completedTasks.length === 0) {
    showNotification("No completed tasks to clear.");
    return;
  }

  const hasReminders = completedTasks.some(hasActiveReminder);
  if (hasReminders && !window.confirm("Some completed tasks have reminders. Clear them and cancel reminders?")) {
    return;
  }

  try {
    await Promise.all(completedTasks.map((task) => cancelAllServerReminders(task)));
  } catch {
    showNotification("Could not cancel every reminder. Nothing was cleared.");
    return;
  }

  const completedIds = new Set(completedTasks.map((task) => task.id));
  completedIds.forEach((id) => openReminderTaskIds.delete(id));
  state.tasks = state.tasks.filter((task) => !completedIds.has(task.id));
  persist();
  render();
}

async function setAlarm(taskId, value) {
  const task = findTask(taskId);
  const alarmTime = new Date(value).getTime();

  if (!task || !value || Number.isNaN(alarmTime) || alarmTime <= Date.now()) {
    showNotification("Choose a future date and time.");
    return;
  }

  try {
    await scheduleServerReminder(task, "alarm", alarmTime);
  } catch {
    showNotification("Could not schedule the Discord alarm.");
    return;
  }

  task.alarmAt = alarmTime;
  task.alarmFired = false;
  openReminderTaskIds.delete(taskId);
  requestNotificationPermission();
  persist();
  render();
}

async function clearAlarm(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  try {
    await cancelServerReminder(getReminderId(task.id, "alarm"));
  } catch {
    showNotification("Could not cancel the Discord alarm.");
    return;
  }

  task.alarmAt = null;
  task.alarmFired = false;
  persist();
  render();
}

async function startTimer(taskId, minutes) {
  const task = findTask(taskId);
  const duration = Number(minutes);

  if (!task || !Number.isFinite(duration) || duration < 1 || duration > 1440) {
    showNotification("Enter a timer from 1 to 1440 minutes.");
    return;
  }

  const timerEndsAt = Date.now() + duration * 60 * 1000;
  try {
    await scheduleServerReminder(task, "timer", timerEndsAt);
  } catch {
    showNotification("Could not schedule the Discord timer.");
    return;
  }

  task.timerEndsAt = timerEndsAt;
  task.timerFired = false;
  openReminderTaskIds.delete(taskId);
  requestNotificationPermission();
  persist();
  render();
}

async function clearTimer(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  try {
    await cancelServerReminder(getReminderId(task.id, "timer"));
  } catch {
    showNotification("Could not cancel the Discord timer.");
    return;
  }

  task.timerEndsAt = null;
  task.timerFired = false;
  persist();
  render();
}

function render() {
  dateInput.value = state.selectedDate;
  renderCategoryOptions();
  board.replaceChildren();

  const visibleTasks = getVisibleTasks();
  emptyState.hidden = visibleTasks.length > 0;

  state.categories.forEach((category) => {
    board.append(createLaneElement(category));
  });

  plannedCount.textContent = visibleTasks.length;
  doneCount.textContent = visibleTasks.filter((task) => task.done).length;
  persist();
}

function renderCategoryOptions() {
  const selectedCategory = slotInput.value;
  slotInput.replaceChildren();

  state.categories.forEach((category) => {
    slotInput.append(createOption(category));
  });

  if (state.categories.some((category) => category.id === selectedCategory)) {
    slotInput.value = selectedCategory;
  }
}

function createLaneElement(category) {
  const element = laneTemplate.content.firstElementChild.cloneNode(true);
  const list = element.querySelector(".task-list");
  const removeButton = element.querySelector(".remove-category-button");
  const categoryTasks = getVisibleTasks()
    .filter((task) => task.categoryId === category.id)
    .sort(sortTasks);

  element.dataset.categoryId = category.id;
  element.style.setProperty("--category-color", category.color);
  element.querySelector("h2").textContent = category.name;
  element.querySelector(".lane-count").textContent = categoryTasks.length;
  list.dataset.categoryId = category.id;

  categoryTasks.forEach((task) => {
    list.append(createTaskElement(task));
  });

  if (categoryTasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No plans here";
    list.append(empty);
  }

  removeButton.hidden = category.builtIn;
  removeButton.disabled = state.tasks.some((task) => task.categoryId === category.id);
  removeButton.title = removeButton.disabled ? "Remove its plans first" : `Delete ${category.name}`;
  removeButton.addEventListener("click", () => removeCategory(category.id));

  list.addEventListener("dragover", (event) => {
    event.preventDefault();
    list.classList.add("is-over");
  });

  list.addEventListener("dragleave", () => {
    list.classList.remove("is-over");
  });

  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    const task = findTask(taskId);
    if (task) {
      task.date = state.selectedDate;
    }
    moveTask(taskId, category.id);
    list.classList.remove("is-over");
  });

  return element;
}

function createTaskElement(task) {
  const element = taskTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = element.querySelector(".complete-checkbox");
  const title = element.querySelector(".task-title");
  const categorySelect = element.querySelector(".lane-select");
  const prioritySelect = element.querySelector(".priority-select");
  const taskDateInput = element.querySelector(".task-date-input");
  const reminderToggle = element.querySelector(".reminder-toggle");
  const reminderPanel = element.querySelector(".reminder-panel");
  const alarmInput = element.querySelector(".alarm-input");
  const timerInput = element.querySelector(".timer-input");

  element.dataset.taskId = task.id;
  element.dataset.priority = task.priority;
  element.classList.toggle("is-complete", task.done);
  element.classList.toggle("has-reminder", hasActiveReminder(task));
  title.textContent = task.title;
  checkbox.checked = task.done;
  prioritySelect.value = task.priority;
  taskDateInput.value = task.date;

  state.categories.forEach((category) => {
    categorySelect.append(createOption(category));
  });
  categorySelect.value = task.categoryId;
  alarmInput.value = task.alarmAt ? toLocalDateTimeValue(task.alarmAt) : "";

  const reminderIsOpen = openReminderTaskIds.has(task.id);
  reminderToggle.setAttribute("aria-expanded", String(reminderIsOpen));
  reminderPanel.hidden = !reminderIsOpen;
  updateReminderStatus(element, task);

  if (hasActiveReminder(task)) {
    reminderToggle.classList.add("is-active");
  }

  element.addEventListener("dragstart", (event) => {
    if (document.activeElement === title) {
      event.preventDefault();
      return;
    }
    element.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  });

  element.addEventListener("dragend", () => {
    element.classList.remove("dragging");
  });

  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    }
  });
  title.addEventListener("blur", () => renameTask(task.id, title.textContent));
  checkbox.addEventListener("change", (event) => toggleDone(task.id, event.target.checked));
  categorySelect.addEventListener("change", (event) => moveTask(task.id, event.target.value));
  prioritySelect.addEventListener("change", (event) => updateTaskPriority(task.id, event.target.value));
  taskDateInput.addEventListener("change", (event) => moveTaskDate(task.id, event.target.value));
  reminderToggle.addEventListener("click", () => {
    const isOpen = reminderToggle.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      openReminderTaskIds.delete(task.id);
    } else {
      openReminderTaskIds.add(task.id);
    }
    reminderToggle.setAttribute("aria-expanded", String(!isOpen));
    reminderPanel.hidden = isOpen;
  });
  element.querySelector(".set-alarm-button").addEventListener("click", () => setAlarm(task.id, alarmInput.value));
  element.querySelector(".cancel-alarm-button").addEventListener("click", () => clearAlarm(task.id));
  element.querySelector(".start-timer-button").addEventListener("click", () => startTimer(task.id, timerInput.value));
  element.querySelector(".cancel-timer-button").addEventListener("click", () => clearTimer(task.id));
  element.querySelector(".delete-button").addEventListener("click", () => deleteTask(task.id));

  return element;
}

function getVisibleTasks() {
  return state.tasks.filter((task) => task.date === state.selectedDate);
}

function sortTasks(a, b) {
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.createdAt - b.createdAt;
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function exportBoard() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daily-schedule-board-${getTodayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importBoard(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      state = normalizeState(imported);
      dateInput.value = state.selectedDate;
      persist();
      render();
      showNotification("Board imported.");
    } catch {
      showNotification("Could not import that file.");
    } finally {
      importFileInput.value = "";
    }
  });
  reader.readAsText(file);
}

function startReminderClock() {
  window.clearInterval(reminderInterval);
  reminderInterval = window.setInterval(checkReminders, 1000);
  checkReminders();
}

function checkReminders() {
  const now = Date.now();
  let changed = false;

  state.tasks.forEach((task) => {
    if (task.alarmAt && !task.alarmFired && now >= task.alarmAt) {
      task.alarmFired = true;
      notifyTask(task, "Alarm");
      changed = true;
    }

    if (task.timerEndsAt && !task.timerFired && now >= task.timerEndsAt) {
      task.timerFired = true;
      notifyTask(task, "Timer finished");
      changed = true;
    }
  });

  if (changed) {
    persist();
    render();
    return;
  }

  document.querySelectorAll(".task").forEach((element) => {
    const task = findTask(element.dataset.taskId);
    if (task) {
      updateReminderStatus(element, task);
    }
  });
}

function updateReminderStatus(element, task) {
  const status = element.querySelector(".reminder-status");
  const parts = [];

  if (task.alarmAt && !task.alarmFired) {
    parts.push(`Alarm: ${formatDateTime(task.alarmAt)}`);
  }

  if (task.timerEndsAt && !task.timerFired) {
    parts.push(`Timer: ${formatRemaining(task.timerEndsAt - Date.now())}`);
  }

  status.textContent = parts.length > 0 ? parts.join(" | ") : "No active reminder";
}

function hasActiveReminder(task) {
  return Boolean(
    (task.alarmAt && !task.alarmFired) ||
    (task.timerEndsAt && !task.timerFired)
  );
}

function notifyTask(task, type) {
  const message = `${type}: ${task.title}`;
  showNotification(message);
  playAlertSound();

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Daily Schedule Board", { body: message });
  }
}

async function syncActiveReminders() {
  const activeReminders = [];

  state.tasks.forEach((task) => {
    if (task.alarmAt && !task.alarmFired && task.alarmAt > Date.now()) {
      activeReminders.push(scheduleServerReminder(task, "alarm", task.alarmAt));
    }
    if (task.timerEndsAt && !task.timerFired && task.timerEndsAt > Date.now()) {
      activeReminders.push(scheduleServerReminder(task, "timer", task.timerEndsAt));
    }
  });

  if (activeReminders.length === 0) {
    return;
  }

  try {
    await Promise.all(activeReminders);
  } catch {
    showNotification("Some Discord reminders could not be synchronized.");
  }
}

async function scheduleServerReminder(task, kind, dueAt) {
  const response = await fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reminderId: getReminderId(task.id, kind),
      taskTitle: task.title,
      type: kind === "alarm" ? "Alarm" : "Timer finished",
      dueAt
    })
  });

  if (!response.ok) {
    throw new Error("Reminder scheduling failed.");
  }
}

async function cancelServerReminder(reminderId) {
  const response = await fetch("/api/reminders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reminderId })
  });

  if (!response.ok) {
    throw new Error("Reminder cancellation failed.");
  }
}

async function cancelAllServerReminders(task) {
  const cancellations = [];
  if (task.alarmAt && !task.alarmFired) {
    cancellations.push(cancelServerReminder(getReminderId(task.id, "alarm")));
  }
  if (task.timerEndsAt && !task.timerFired) {
    cancellations.push(cancelServerReminder(getReminderId(task.id, "timer")));
  }
  await Promise.all(cancellations);
}

function getReminderId(taskId, kind) {
  return `${taskId}:${kind}`;
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showNotification(message) {
  window.clearTimeout(toastTimeout);
  notificationToast.textContent = message;
  notificationToast.classList.add("is-visible");
  toastTimeout = window.setTimeout(() => {
    notificationToast.classList.remove("is-visible");
  }, 5000);
}

function playAlertSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = 760;
  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.7);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.7);
}

function toLocalDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function createOption(category) {
  const option = document.createElement("option");
  option.value = category.id;
  option.textContent = category.name;
  return option;
}

function showCategoryMessage(message) {
  categoryMessage.textContent = message;
  window.setTimeout(() => {
    if (categoryMessage.textContent === message) {
      categoryMessage.textContent = "";
    }
  }, 2500);
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
