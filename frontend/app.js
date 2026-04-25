async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} en ${url}`);
  }
  return response.json();
}

function renderList(items, mountNode, formatter) {
  mountNode.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = formatter(item);
    mountNode.appendChild(li);
  });
}

function renderError(message) {
  const issueList = document.getElementById("issue-list");
  issueList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = `Fallo cargando datos: ${message}`;
  issueList.appendChild(li);
}

function setStatus(text, kind) {
  const node = document.getElementById("test-status");
  node.textContent = text;
  node.className = `status ${kind}`;
}

async function runQuickTest() {
  setStatus("Probando...", "loading");

  try {
    await Promise.all([
      fetchJson("/health"),
      fetchJson("/api/courses"),
      fetchJson("/api/tasks"),
      fetchJson("/api/issues")
    ]);
    setStatus("✅ ¡Todo bien! La app está funcionando.", "ok");
  } catch (error) {
    setStatus(`❌ Algo falló: ${error.message}`, "error");
  }
}

async function loadDashboard() {
  try {
    const [courses, tasks, issues] = await Promise.all([
      fetchJson("/api/courses"),
      fetchJson("/api/tasks"),
      fetchJson("/api/issues")
    ]);

    renderList(courses, document.getElementById("course-list"), (course) => `${course.name} — ${course.professor}`);
    renderList(tasks, document.getElementById("task-list"), (task) => `${task.title} (entrega: ${task.dueDate})`);
    renderList(issues, document.getElementById("issue-list"), (issue) => issue);
    setStatus("Lista para probar. Apretá el botón.", "idle");
  } catch (error) {
    renderError(error.message);
    setStatus(`❌ No se pudo cargar: ${error.message}`, "error");
  }
}

document.getElementById("test-button").addEventListener("click", runQuickTest);

loadDashboard();
