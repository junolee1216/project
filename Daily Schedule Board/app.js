const STORAGE_KEY = "daily-schedule-board:v1";
const LANES = ["morning", "afternoon", "evening"];

const defaultState = {
  tasks: [
    { id: "task-1", title: "Drink water and get ready", lane: "morning", done: false, createdAt: Date.now() - 3 },
    { id: "task-2", title: "Finish one important goal", lane: "afternoon", done: false, createdAt: Date.now() - 2 },
    { id: "task-3", title: "Plan tomorrow before bed", lane: "evening", done: false, createdAt: Date.now() - 1 }
  ]
};

let state = loadState();

const taskInput = document.querySelector("#taskInput");
const slotInput = document.querySelector("#slotInput");
const addTaskButton = document.querySelector("#addTaskButton");
const plannedCount = document.querySelector("#plannedCount");
const doneCount = document.querySelector("#doneCount");
const template = document.querySelector("#taskTemplate");
const lists = Array.from(document.querySelectorAll(".task-list"));

render();

addTaskButton.addEventListener("click", addTask);
taskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTask();
  }
});

lists.forEach((list) => {
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
    moveTask(taskId, list.dataset.lane);
    list.classList.remove("is-over");
  });
});

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tasks)) {
      return structuredClone(defaultState);
    }

    return {
      tasks: stored.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        lane: LANES.includes(task.lane) ? task.lane : "morning",
        done: Boolean(task.done),
        createdAt: task.createdAt || Date.now()
      }))
    };
  } catch {
    return structuredClone(defaultState);
  }
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
    lane: slotInput.value,
    done: false,
    createdAt: Date.now()
  });

  taskInput.value = "";
  persist();
  render();
}

function moveTask(taskId, lane) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !LANES.includes(lane)) {
    return;
  }

  task.lane = lane;
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

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  persist();
  render();
}

function render() {
  lists.forEach((list) => {
    list.replaceChildren();
    const laneTasks = state.tasks
      .filter((task) => task.lane === list.dataset.lane)
      .sort((a, b) => a.createdAt - b.createdAt);

    laneTasks.forEach((task) => {
      list.append(createTaskElement(task));
    });

    if (laneTasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Open";
      list.append(empty);
    }
  });

  document.querySelectorAll("[data-count-for]").forEach((count) => {
    const lane = count.dataset.countFor;
    count.textContent = state.tasks.filter((task) => task.lane === lane).length;
  });

  plannedCount.textContent = state.tasks.length;
  doneCount.textContent = state.tasks.filter((task) => task.done).length;
  persist();
}

function createTaskElement(task) {
  const element = template.content.firstElementChild.cloneNode(true);
  const checkbox = element.querySelector(".complete-checkbox");
  const laneSelect = element.querySelector(".lane-select");

  element.dataset.taskId = task.id;
  element.classList.toggle("is-complete", task.done);
  element.querySelector("p").textContent = task.title;
  checkbox.checked = task.done;
  laneSelect.value = task.lane;

  element.addEventListener("dragstart", (event) => {
    element.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  });

  element.addEventListener("dragend", () => {
    element.classList.remove("dragging");
  });

  checkbox.addEventListener("change", (event) => toggleDone(task.id, event.target.checked));
  laneSelect.addEventListener("change", (event) => moveTask(task.id, event.target.value));
  element.querySelector(".delete-button").addEventListener("click", () => deleteTask(task.id));

  return element;
}
