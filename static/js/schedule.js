// Глобальные переменные
let currentSchedule = {};
let saturdayEnabled = false;
let cachedSchedule = null;
let cachedHomework = new Map();
let isAdmin = false;
let lastVersion = 0;
let pendingProposals = [];

// ИЗМЕНЕНИЯ: Удален 8-й урок, 7-й начинается в 14:25 и заканчивается в 15:10
const LESSON_TIMES = [
  "8:30 - 9:15",
  "9:30 - 10:15",
  "10:30 - 11:15",
  "11:30 - 12:15",
  "12:30 - 13:15",
  "13:30 - 14:15",
  "14:25 - 15:10",
];

const DAYS_ORDER = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];

// Проверка обновлений
async function checkForUpdates() {
  if (isAdmin) return;
  try {
    const versionDoc = await db.collection("system").doc("version").get();
    if (versionDoc.exists && versionDoc.data().number > lastVersion) {
      lastVersion = versionDoc.data().number;
      window.location.reload();
    }
  } catch (e) {}
}

setInterval(checkForUpdates, 5000);

document.addEventListener("DOMContentLoaded", async () => {
  isAdmin =
    new URLSearchParams(window.location.search).get("admin") === "yes" &&
    getCookie("isAdmin") === "true";

  if (isAdmin) {
    document.getElementById("adminControls").style.display = "flex";
    document.getElementById("regularControls").style.display = "none";
    setupProposalsListener();
  } else {
    document
      .getElementById("mobileProposeHint")
      .classList.add("show-on-mobile");
    try {
      const v = await db.collection("system").doc("version").get();
      if (v.exists) lastVersion = v.data().number || 0;
    } catch (e) {}
  }

  updateCurrentDate();
  await loadSchedule();
});

function getCookie(name) {
  return document.cookie.split("; ").reduce((r, v) => {
    const parts = v.split("=");
    return parts[0] === name ? decodeURIComponent(parts[1]) : r;
  }, "");
}

// Глобальные функции для кнопок админки
window.deleteCookie = function (name) {
  document.cookie = name + "=; Max-Age=0; path=/";
};

window.logout = function () {
  deleteCookie("isAdmin");
  window.location.href = "/";
};

function updateCurrentDate() {
  document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("ru-RU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
}

function normalizeDocId(day, lesson) {
  return `${day}_${lesson}`.replace(/[\s\/()\.]/g, "_");
}

// Загрузка расписания
async function loadSchedule() {
  const container = document.querySelector(".schedule-container");
  container.innerHTML = "";

  try {
    const hwSnap = await db.collection("homework").get();
    cachedHomework.clear();
    hwSnap.forEach((doc) =>
      cachedHomework.set(
        normalizeDocId(doc.data().day, doc.data().lesson),
        doc.data(),
      ),
    );

    if (!cachedSchedule) {
      const res = await fetch("/api/schedule");
      cachedSchedule = await res.json();
    }
    currentSchedule = { ...cachedSchedule };

    const schedDoc = await db.collection("schedule").doc("main").get();
    if (schedDoc.exists) Object.assign(currentSchedule, schedDoc.data());

    const satDoc = await db.collection("settings").doc("saturday").get();
    if (satDoc.exists && satDoc.data().enabled) {
      saturdayEnabled = true;
      currentSchedule["Суббота"] = [
        ...currentSchedule[satDoc.data().scheduleFrom],
      ];
      if (isAdmin) {
        document.getElementById("saturdayToggle").textContent =
          "Убрать субботу";
        document.getElementById("saturdaySchedule").style.display = "block";
        document.getElementById("saturdaySchedule").value =
          satDoc.data().scheduleFrom;
      }
    }

    DAYS_ORDER.forEach((day) => {
      if (currentSchedule[day] && (day !== "Суббота" || saturdayEnabled)) {
        container.appendChild(createDayCard(day, currentSchedule[day]));
      }
    });

    // Рисуем inline-предложения для админа
    if (isAdmin) renderInlineProposals();
  } catch (e) {
    container.innerHTML = `<div style="color:red">Ошибка: ${e.message}</div>`;
  }
}

window.toggleSaturday = async function () {
  const toggleBtn = document.getElementById("saturdayToggle");
  const scheduleSelect = document.getElementById("saturdaySchedule");

  saturdayEnabled = !saturdayEnabled;

  if (saturdayEnabled) {
    toggleBtn.textContent = "Убрать субботу";
    scheduleSelect.style.display = "block";
    currentSchedule["Суббота"] = [...currentSchedule[scheduleSelect.value]];
  } else {
    toggleBtn.textContent = "Добавить субботу";
    scheduleSelect.style.display = "none";
    delete currentSchedule["Суббота"];
  }

  try {
    await db
      .collection("settings")
      .doc("saturday")
      .set({
        enabled: saturdayEnabled,
        scheduleFrom: saturdayEnabled ? scheduleSelect.value : null,
      });
    await db
      .collection("system")
      .doc("version")
      .set(
        { number: firebase.firestore.FieldValue.increment(1) },
        { merge: true },
      );

    cachedSchedule = null;
    cachedHomework.clear();
    await loadSchedule();
  } catch (error) {
    alert("Ошибка при обновлении настроек субботы");
  }
};

document
  .getElementById("saturdaySchedule")
  ?.addEventListener("change", async (e) => {
    if (saturdayEnabled) {
      currentSchedule["Суббота"] = [...currentSchedule[e.target.value]];
      try {
        await db.collection("settings").doc("saturday").set({
          enabled: true,
          scheduleFrom: e.target.value,
        });
        await db
          .collection("system")
          .doc("version")
          .set(
            { number: firebase.firestore.FieldValue.increment(1) },
            { merge: true },
          );
        loadSchedule();
      } catch (error) {}
    }
  });

function createLessonItem(day, lesson, index) {
  const item = document.createElement("div");
  item.className = "lesson-item";
  item.dataset.index = index;

  const hw = cachedHomework.get(normalizeDocId(day, lesson));
  const isLang = lesson.includes("Иностранный");
  const isSplit = lesson.includes("(м.)") || lesson.includes("(д.)");

  let hwHTML = "";
  if (isLang) {
    hwHTML = `<div class="special-homework-container">
            <div class="special-homework ${hw?.englishTest ? "test" : ""} ${hw?.englishExam ? "exam" : ""}">
                <span class="subject-label">🇬🇧 Английский</span>${hw?.englishText ? `<div class="homework-text">${hw.englishText}</div>` : ""}
            </div>
            <div class="special-homework ${hw?.germanTest ? "test" : ""} ${hw?.germanExam ? "exam" : ""}">
                <span class="subject-label">🇩🇪 Немецкий</span>${hw?.germanText ? `<div class="homework-text">${hw.germanText}</div>` : ""}
            </div>
        </div>`;
  } else if (isSplit) {
    hwHTML = `<div class="special-homework-container">
            <div class="special-homework ${hw?.firstGroupTest ? "test" : ""} ${hw?.firstGroupExam ? "exam" : ""}">
                <span class="subject-label">💻 Информатика</span>${hw?.firstGroupText ? `<div class="homework-text">${hw.firstGroupText}</div>` : ""}
            </div>
            <div class="special-homework ${hw?.secondGroupTest ? "test" : ""} ${hw?.secondGroupExam ? "exam" : ""}">
                <span class="subject-label">🛠️ Труды</span>${hw?.secondGroupText ? `<div class="homework-text">${hw.secondGroupText}</div>` : ""}
            </div>
        </div>`;
  } else if (hw) {
    if (hw.isTest) item.classList.add("test");
    if (hw.isExam) item.classList.add("exam");
    if (hw.text) hwHTML = `<div class="homework-text">${hw.text}</div>`;
  }

  item.innerHTML = `
        <div class="lesson-header"><span class="lesson-name">${lesson}</span><span class="lesson-time">${LESSON_TIMES[index] || ""}</span></div>
        ${hwHTML}
        <div class="proposals-container"></div>
    `;

  item.style.cursor = "pointer";

  if (isAdmin) {
    item.onclick = (e) => {
      // Если кликнули по кнопкам inline-предложения, не открываем модалку ДЗ
      if (e.target.tagName === "BUTTON") return;
      showHomeworkModal(day, lesson, isLang, isSplit, index);
    };
  } else {
    item.onclick = () => showProposeModal(day, lesson, index, isLang, isSplit);
    item.innerHTML += `<div class="propose-hint">✎ Предложить ДЗ</div>`;
  }

  return item;
}

function createDayCard(day, lessons) {
  const card = document.createElement("div");
  card.className = "day-card";
  card.dataset.day = day;
  card.innerHTML = `<div class="day-header"><h2 class="day-name">${day}</h2></div><div class="lessons-list"></div>`;
  const list = card.querySelector(".lessons-list");
  lessons.forEach((l, i) => list.appendChild(createLessonItem(day, l, i)));
  return card;
}

// Связывание чекбоксов (Самостоятельная / Контрольная)
function setupCheckboxHandlers() {
  const setupPair = (t, e) => {
    if (t && e) {
      t.onchange = () => {
        if (t.checked) e.checked = false;
      };
      e.onchange = () => {
        if (e.checked) t.checked = false;
      };
    }
  };
  setupPair(
    document.querySelector('input[name="homeworkTest"]'),
    document.querySelector('input[name="homeworkExam"]'),
  );
  setupPair(
    document.querySelector('input[name="englishTest"]'),
    document.querySelector('input[name="englishExam"]'),
  );
  setupPair(
    document.querySelector('input[name="germanTest"]'),
    document.querySelector('input[name="germanExam"]'),
  );
  setupPair(
    document.querySelector('input[name="firstGroupTest"]'),
    document.querySelector('input[name="firstGroupExam"]'),
  );
  setupPair(
    document.querySelector('input[name="secondGroupTest"]'),
    document.querySelector('input[name="secondGroupExam"]'),
  );
}

// --- АДМИН: РЕДАКТИРОВАНИЕ ДЗ И НАЗВАНИЯ ---
window.showHomeworkModal = function (day, lesson, isLang, isSplit, index) {
  const m = document.getElementById("homeworkModal");
  m.dataset.day = day;
  m.dataset.lesson = lesson;
  m.dataset.index = index;

  document.getElementById("adminLessonName").value = lesson;

  m.querySelectorAll('input[type="checkbox"]').forEach(
    (c) => (c.checked = false),
  );
  m.querySelectorAll("textarea").forEach((t) => (t.value = ""));

  document.getElementById("normalSection").style.display =
    !isLang && !isSplit ? "block" : "none";
  document.getElementById("languageSection").style.display = isLang
    ? "block"
    : "none";
  document.getElementById("splitSection").style.display = isSplit
    ? "block"
    : "none";

  setupCheckboxHandlers();

  const hw = cachedHomework.get(normalizeDocId(day, lesson));
  if (hw) {
    if (isLang) {
      document.getElementById("englishText").value = hw.englishText || "";
      document.getElementById("germanText").value = hw.germanText || "";
      document.querySelector('input[name="englishTest"]').checked =
        hw.englishTest || false;
      document.querySelector('input[name="englishExam"]').checked =
        hw.englishExam || false;
      document.querySelector('input[name="germanTest"]').checked =
        hw.germanTest || false;
      document.querySelector('input[name="germanExam"]').checked =
        hw.germanExam || false;
    } else if (isSplit) {
      document.getElementById("firstGroupText").value = hw.firstGroupText || "";
      document.getElementById("secondGroupText").value =
        hw.secondGroupText || "";
      document.querySelector('input[name="firstGroupTest"]').checked =
        hw.firstGroupTest || false;
      document.querySelector('input[name="firstGroupExam"]').checked =
        hw.firstGroupExam || false;
      document.querySelector('input[name="secondGroupTest"]').checked =
        hw.secondGroupTest || false;
      document.querySelector('input[name="secondGroupExam"]').checked =
        hw.secondGroupExam || false;
    } else {
      document.getElementById("homeworkText").value = hw.text || "";
      document.querySelector('input[name="homeworkTest"]').checked =
        hw.isTest || false;
      document.querySelector('input[name="homeworkExam"]').checked =
        hw.isExam || false;
    }
  }

  document.body.classList.add("modal-open");
  m.style.display = "flex";
  requestAnimationFrame(() => m.classList.add("is-visible"));
};

window.saveHomework = async function () {
  const m = document.getElementById("homeworkModal");
  const day = m.dataset.day;
  const oldLesson = m.dataset.lesson;
  const index = parseInt(m.dataset.index);
  const newLesson =
    document.getElementById("adminLessonName").value.trim() || oldLesson;

  const isLang = newLesson.includes("Иностранный");
  const isSplit = newLesson.includes("(м.)") || newLesson.includes("(д.)");

  let hwData = {
    day,
    lesson: newLesson,
    isLanguageLesson: isLang,
    isSplitLesson: isSplit,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (isLang) {
    hwData.englishText = document.getElementById("englishText").value;
    hwData.germanText = document.getElementById("germanText").value;
    hwData.englishTest = document.querySelector(
      'input[name="englishTest"]',
    ).checked;
    hwData.englishExam = document.querySelector(
      'input[name="englishExam"]',
    ).checked;
    hwData.germanTest = document.querySelector(
      'input[name="germanTest"]',
    ).checked;
    hwData.germanExam = document.querySelector(
      'input[name="germanExam"]',
    ).checked;
  } else if (isSplit) {
    hwData.firstGroupText = document.getElementById("firstGroupText").value;
    hwData.secondGroupText = document.getElementById("secondGroupText").value;
    hwData.firstGroupTest = document.querySelector(
      'input[name="firstGroupTest"]',
    ).checked;
    hwData.firstGroupExam = document.querySelector(
      'input[name="firstGroupExam"]',
    ).checked;
    hwData.secondGroupTest = document.querySelector(
      'input[name="secondGroupTest"]',
    ).checked;
    hwData.secondGroupExam = document.querySelector(
      'input[name="secondGroupExam"]',
    ).checked;
  } else {
    hwData.text = document.getElementById("homeworkText").value;
    hwData.isTest = document.querySelector(
      'input[name="homeworkTest"]',
    ).checked;
    hwData.isExam = document.querySelector(
      'input[name="homeworkExam"]',
    ).checked;
  }

  try {
    if (newLesson !== oldLesson) {
      const schedRef = db.collection("schedule").doc("main");
      const schedDoc = await schedRef.get();
      let mainSched = schedDoc.exists ? schedDoc.data() : {};
      
      // Убеждаемся, что день существует в расписании
      if (!mainSched[day]) {
        if (currentSchedule[day]) {
          mainSched[day] = [...currentSchedule[day]];
        } else {
          throw new Error(`Расписание для дня "${day}" не найдено`);
        }
      }
      
      mainSched[day][index] = newLesson;
      await schedRef.set(mainSched);
      await db
        .collection("homework")
        .doc(normalizeDocId(day, oldLesson))
        .delete();
    }

    await db
      .collection("homework")
      .doc(normalizeDocId(day, newLesson))
      .set(hwData);
    await db
      .collection("system")
      .doc("version")
      .set(
        { number: firebase.firestore.FieldValue.increment(1) },
        { merge: true },
      );

    closeModal();
    loadSchedule();
  } catch (e) {
    alert("Ошибка при сохранении: " + e.message);
  }
};

// --- ПОЛЬЗОВАТЕЛЬ: ПРЕДЛОЖЕНИЕ ДЗ ---
window.showProposeModal = function (day, lesson, index, isLang, isSplit) {
  const m = document.getElementById("proposeModal");
  m.dataset.day = day;
  m.dataset.lesson = lesson;
  m.dataset.index = index;
  m.dataset.isLang = isLang;
  m.dataset.isSplit = isSplit;

  document.getElementById("proposeSelectedLesson").textContent =
    `${day}: ${lesson}`;
  m.querySelectorAll("textarea").forEach((t) => (t.value = ""));

  document.getElementById("proposeNormalSection").style.display =
    !isLang && !isSplit ? "block" : "none";
  document.getElementById("proposeLangSection").style.display = isLang
    ? "block"
    : "none";
  document.getElementById("proposeSplitSection").style.display = isSplit
    ? "block"
    : "none";

  const hw = cachedHomework.get(normalizeDocId(day, lesson));
  if (hw) {
    if (isLang) {
      document.getElementById("proposeEngText").value = hw.englishText || "";
      document.getElementById("proposeGerText").value = hw.germanText || "";
    } else if (isSplit) {
      document.getElementById("proposeFirstText").value =
        hw.firstGroupText || "";
      document.getElementById("proposeSecondText").value =
        hw.secondGroupText || "";
    } else {
      document.getElementById("proposeNormText").value = hw.text || "";
    }
  }

  document.body.classList.add("modal-open");
  m.style.display = "flex";
  requestAnimationFrame(() => m.classList.add("is-visible"));
};

window.submitProposal = async function () {
  const m = document.getElementById("proposeModal");
  const day = m.dataset.day;
  const lesson = m.dataset.lesson;
  const index = m.dataset.index;
  const isLang = m.dataset.isLang === "true";
  const isSplit = m.dataset.isSplit === "true";

  let proposes = {};
  if (isLang) {
    if (document.getElementById("proposeEngText").value.trim())
      proposes.englishText = document
        .getElementById("proposeEngText")
        .value.trim();
    if (document.getElementById("proposeGerText").value.trim())
      proposes.germanText = document
        .getElementById("proposeGerText")
        .value.trim();
  } else if (isSplit) {
    if (document.getElementById("proposeFirstText").value.trim())
      proposes.firstGroupText = document
        .getElementById("proposeFirstText")
        .value.trim();
    if (document.getElementById("proposeSecondText").value.trim())
      proposes.secondGroupText = document
        .getElementById("proposeSecondText")
        .value.trim();
  } else {
    if (document.getElementById("proposeNormText").value.trim())
      proposes.text = document.getElementById("proposeNormText").value.trim();
  }

  if (Object.keys(proposes).length === 0)
    return alert("Введите текст предложения!");

  try {
    await db.collection("proposals").add({
      day,
      lesson,
      lessonIndex: parseInt(index),
      proposes,
      status: "pending",
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    alert("Ваше предложение успешно отправлено администратору!");
    closeProposeModal();
  } catch (e) {
    alert("Ошибка при отправке предложения: " + e.message);
  }
};

// --- АДМИН: СЛУШАТЕЛЬ ПРЕДЛОЖЕНИЙ (INLINE) ---
function setupProposalsListener() {
  db.collection("proposals")
    .where("status", "==", "pending")
    .onSnapshot((snap) => {
      pendingProposals = [];
      snap.forEach((doc) =>
        pendingProposals.push({ id: doc.id, ...doc.data() }),
      );
      renderInlineProposals();
    });
}

function renderInlineProposals() {
  // Очищаем старые
  document
    .querySelectorAll(".proposals-container")
    .forEach((c) => (c.innerHTML = ""));

  pendingProposals.forEach((p) => {
    // Находим нужный урок в DOM
    const container = document.querySelector(
      `.day-card[data-day="${p.day}"] .lesson-item[data-index="${p.lessonIndex}"] .proposals-container`,
    );
    if (!container) return;

    const div = document.createElement("div");
    div.className = "inline-proposal";

    let html =
      '<div class="inline-proposal-header">Новое предложение:</div><div class="inline-proposal-text">';
    if (p.proposes.text) html += `<div>${p.proposes.text}</div>`;
    if (p.proposes.englishText)
      html += `<div><strong>Англ:</strong> ${p.proposes.englishText}</div>`;
    if (p.proposes.germanText)
      html += `<div><strong>Нем:</strong> ${p.proposes.germanText}</div>`;
    if (p.proposes.firstGroupText)
      html += `<div><strong>Инфо:</strong> ${p.proposes.firstGroupText}</div>`;
    if (p.proposes.secondGroupText)
      html += `<div><strong>Труды:</strong> ${p.proposes.secondGroupText}</div>`;

    html += `</div>
            <div class="inline-proposal-actions">
                <button class="approve" onclick="approveProposal('${p.id}')">✅ Одобрить</button>
                <button class="reject" onclick="rejectProposal('${p.id}')">❌ Отклонить</button>
            </div>
        `;
    div.innerHTML = html;
    container.appendChild(div);
  });
}

window.approveProposal = async function (id) {
  const p = pendingProposals.find((x) => x.id === id);
  if (!p) return;
  try {
    const docId = normalizeDocId(p.day, p.lesson);
    await db
      .collection("homework")
      .doc(docId)
      .set(
        {
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          day: p.day,
          lesson: p.lesson,
          ...p.proposes,
        },
        { merge: true },
      );

    await db.collection("proposals").doc(id).delete();
    await db
      .collection("system")
      .doc("version")
      .set(
        { number: firebase.firestore.FieldValue.increment(1) },
        { merge: true },
      );

    alert("Предложение одобрено и применено!");
    loadSchedule();
  } catch (e) {
    alert("Ошибка при одобрении: " + e.message);
  }
};

window.rejectProposal = async function (id) {
  if (confirm("Вы действительно хотите удалить это предложение?")) {
    await db.collection("proposals").doc(id).delete();
  }
};

// --- УПРАВЛЕНИЕ МОДАЛКАМИ ---
window.closeModal = function () {
  const m = document.getElementById("homeworkModal");
  m.classList.remove("is-visible");
  setTimeout(() => (m.style.display = "none"), 250);
  if (!document.querySelector(".modal.is-visible"))
    document.body.classList.remove("modal-open");
};

window.closeProposeModal = function () {
  const m = document.getElementById("proposeModal");
  m.classList.remove("is-visible");
  setTimeout(() => (m.style.display = "none"), 250);
  if (!document.querySelector(".modal.is-visible"))
    document.body.classList.remove("modal-open");
};

window.onclick = function (e) {
  if (e.target.classList.contains("modal")) {
    closeModal();
    closeProposeModal();
  }
};
