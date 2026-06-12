const STORAGE_KEY = "daily-schedule-board:v1";

const defaultCategories = [
  { id: "morning", name: "Morning", builtIn: true },
  { id: "afternoon", name: "Afternoon", builtIn: true },
  { id: "evening", name: "Evening", builtIn: true }
];

const defaultState = {
  categories: defaultCategories,
  tasks: [
    { id: "task-1", title: "Drink water and get ready", categoryId: "morning", done: false, createdAt: Date.now() - 3 },
    { id: "task-2", title: "Finish one important goal", categoryId: "afternoon", done: false, createdAt: Date.now() - 2 },
    { id: "task-3", title: "Plan tomorrow before bed", categoryId: "evening", done: false, createdAt: Date.now() - 1 }
  ]
};

let state = loadState();

const taskInput = document.querySelector("#taskInput");
const slotInput = document.querySelector("#slotInput");
const addTaskButton = document.querySelector("#addTaskButton");
const categoryInput = document.querySelector("#categoryInput");
const addCategoryButton = document.querySelector("#addCategoryButton");
const categoryMessage = document.querySelector("#categoryMessage");
const plannedCount = document.querySelector("#plannedCount");
const doneCount = document.querySelector("#doneCount");
const board = document.querySelector("#board");
const notificationToast = document.querySelector("#notificationToast");
const laneTemplate = document.querySelector("#laneTemplate");
const taskTemplate = document.querySelector("#taskTemplate");
let reminderInterval = null;
let toastTimeout = null;
const openReminderTaskIds = new Set();

render();
startReminderClock();
syncActiveReminders();

addTaskButton.addEventListener("click", addTask);
taskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTask();
  }
});

addCategoryButton.addEventListener("click", addCategory);
categoryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addCategory();
  }
});

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tasks)) {
      return structuredClone(defaultState);
    }

    const categories = normalizeCategories(stored.categories);
    const validCategoryIds = new Set(categories.map((category) => category.id));

    return {
      categories,
      tasks: stored.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        categoryId: validCategoryIds.has(task.categoryId || task.lane)
          ? task.categoryId || task.lane
          : categories[0].id,
        done: Boolean(task.done),
        createdAt: task.createdAt || Date.now(),
        alarmAt: task.alarmAt || null,
        alarmFired: Boolean(task.alarmFired),
        timerEndsAt: task.timerEndsAt || null,
        timerFired: Boolean(task.timerFired)
      }))
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return structuredClone(defaultCategories);
  }

  const normalized = categories
    .filter((category) => category && category.id && category.name)
    .map((category) => ({
      id: String(category.id),
      name: String(category.name),
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
  const task = state.tasks.find((item) => item.id === taskId);
  const categoryExists = state.categories.some((category) => category.id === categoryId);
  if (!task || !categoryExists) {
    return;
  }

  task.categoryId = categoryId;
  persist();
  render();
}

function toggleDone(taskId, done) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  task.done = done;
  persist();
  render();
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
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

async function setAlarm(taskId, value) {
  const task = state.tasks.find((item) => item.id === taskId);
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
  const task = state.tasks.find((item) => item.id === taskId);
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
  const task = state.tasks.find((item) => item.id === taskId);
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
  const task = state.tasks.find((item) => item.id === taskId);
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
  renderCategoryOptions();
  board.replaceChildren();

  state.categories.forEach((category) => {
    board.append(createLaneElement(category));
  });

  plannedCount.textContent = state.tasks.length;
  doneCount.textContent = state.tasks.filter((task) => task.done).length;
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
  const categoryTasks = state.tasks
    .filter((task) => task.categoryId === category.id)
    .sort((a, b) => a.createdAt - b.createdAt);

  element.dataset.categoryId = category.id;
  element.querySelector("h2").textContent = category.name;
  element.querySelector(".lane-count").textContent = categoryTasks.length;
  list.dataset.categoryId = category.id;

  categoryTasks.forEach((task) => {
    list.append(createTaskElement(task));
  });

  if (categoryTasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Open";
    list.append(empty);
  }

  removeButton.hidden = category.builtIn;
  removeButton.disabled = categoryTasks.length > 0;
  removeButton.title = categoryTasks.length > 0 ? "Remove its plans first" : `Delete ${category.name}`;
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
    moveTask(taskId, category.id);
    list.classList.remove("is-over");
  });

  return element;
}

function createTaskElement(task) {
  const element = taskTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = element.querySelector(".complete-checkbox");
  const categorySelect = element.querySelector(".lane-select");
  const reminderToggle = element.querySelector(".reminder-toggle");
  const reminderPanel = element.querySelector(".reminder-panel");
  const alarmInput = element.querySelector(".alarm-input");
  const timerInput = element.querySelector(".timer-input");

  element.dataset.taskId = task.id;
  element.classList.toggle("is-complete", task.done);
  element.classList.toggle("has-reminder", hasActiveReminder(task));
  element.querySelector("p").textContent = task.title;
  checkbox.checked = task.done;

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
    element.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  });

  element.addEventListener("dragend", () => {
    element.classList.remove("dragging");
  });

  checkbox.addEventListener("change", (event) => toggleDone(task.id, event.target.checked));
  categorySelect.addEventListener("change", (event) => moveTask(task.id, event.target.value));
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
    const task = state.tasks.find((item) => item.id === element.dataset.taskId);
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
