// Глобальные переменные
let currentSchedule = {};
let saturdayEnabled = false;
let cachedSchedule = null;
let cachedHomework = new Map();
let isAdmin = false;
let lastVersion = 0;
let pendingProposals = [];
let isInitialLoad = true; // Флаг первой загрузки
let pendingLocalChanges = new Set(); // Отслеживание локальных изменений по типу

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

// Realtime listeners для автоматического обновления
let scheduleListener = null;
let homeworkListener = null;
let saturdayListener = null;
let changedElements = new Set(); // Отслеживание измененных элементов

function setupRealtimeListeners() {
  // Слушаем изменения в расписании
  scheduleListener = db.collection("schedule").doc("main")
    .onSnapshot((doc) => {
      if (doc.exists) {
        const newSchedule = doc.data();
        
        // Проверяем есть ли pending изменение расписания
        if (pendingLocalChanges.has('schedule')) {
          pendingLocalChanges.delete('schedule');
          currentSchedule = newSchedule;
          cachedSchedule = newSchedule;
          return;
        }
        
        // Пропускаем отслеживание изменений при первой загрузке
        if (!isInitialLoad) {
          // Проверяем что расписание действительно изменилось
          if (JSON.stringify(newSchedule) !== JSON.stringify(currentSchedule)) {
            // Находим какие дни изменились
            Object.keys(newSchedule).forEach(day => {
              if (JSON.stringify(newSchedule[day]) !== JSON.stringify(currentSchedule[day])) {
                changedElements.add(`day-${day}`);
              }
            });
            
            currentSchedule = newSchedule;
            cachedSchedule = newSchedule;
            renderSchedule();
          }
        } else {
          // Первая загрузка - просто сохраняем данные без анимации
          currentSchedule = newSchedule;
          cachedSchedule = newSchedule;
        }
      }
    }, (error) => {
      console.error("Ошибка слушателя расписания:", error);
    });

  // Слушаем изменения в домашних заданиях
  homeworkListener = db.collection("homework")
    .onSnapshot((snapshot) => {
      let hasChanges = false;
      
      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        
        // Проверяем есть ли pending изменение для этого ДЗ
        if (pendingLocalChanges.has(`homework-${docId}`)) {
          pendingLocalChanges.delete(`homework-${docId}`);
          if (change.type === "added" || change.type === "modified") {
            cachedHomework.set(docId, change.doc.data());
          } else if (change.type === "removed") {
            cachedHomework.delete(docId);
          }
          return;
        }
        
        if (change.type === "added" || change.type === "modified") {
          const oldData = cachedHomework.get(docId);
          const newData = change.doc.data();
          
          // Пропускаем отслеживание изменений при первой загрузке
          if (!isInitialLoad && JSON.stringify(oldData) !== JSON.stringify(newData)) {
            changedElements.add(`hw-${docId}`);
            hasChanges = true;
          }
          
          cachedHomework.set(docId, newData);
        }
        
        if (change.type === "removed") {
          cachedHomework.delete(docId);
          if (!isInitialLoad) {
            changedElements.add(`hw-${docId}`);
            hasChanges = true;
          }
        }
      });
      
      if (hasChanges && !isInitialLoad) {
        renderSchedule();
      }
    }, (error) => {
      console.error("Ошибка слушателя ДЗ:", error);
    });
  
  // Слушаем изменения настроек субботы
  saturdayListener = db.collection("settings").doc("saturday")
    .onSnapshot(async (doc) => {
      // Проверяем есть ли pending изменение субботы
      if (pendingLocalChanges.has('saturday')) {
        pendingLocalChanges.delete('saturday');
        return;
      }
      
      const wasSaturdayEnabled = saturdayEnabled;
      
      if (doc.exists && doc.data().enabled) {
        saturdayEnabled = true;
        const scheduleFrom = doc.data().scheduleFrom;
        
        // Загружаем расписание для субботы
        const schedDoc = await db.collection("schedule").doc("main").get();
        let baseSchedule = cachedSchedule;
        if (schedDoc.exists) {
          baseSchedule = { ...cachedSchedule, ...schedDoc.data() };
        }
        
        currentSchedule["Суббота"] = [...(baseSchedule[scheduleFrom] || [])];
        
        if (isAdmin) {
          document.getElementById("saturdayToggle").textContent = "Убрать субботу";
          document.getElementById("saturdaySchedule").style.display = "block";
          document.getElementById("saturdaySchedule").value = scheduleFrom;
        }
        
        // Отмечаем субботу как измененную если она только что добавилась (но не при первой загрузке)
        if (!isInitialLoad && !wasSaturdayEnabled) {
          changedElements.add("day-Суббота");
        }
      } else {
        saturdayEnabled = false;
        delete currentSchedule["Суббота"];
        
        if (isAdmin) {
          document.getElementById("saturdayToggle").textContent = "Добавить субботу";
          document.getElementById("saturdaySchedule").style.display = "none";
        }
      }
      
      // Перерисовываем только если статус субботы изменился (и не первая загрузка)
      if (!isInitialLoad && wasSaturdayEnabled !== saturdayEnabled) {
        renderSchedule();
      }
    }, (error) => {
      console.error("Ошибка слушателя субботы:", error);
    });
}

// Функция для отрисовки расписания (без загрузки из базы)
function renderSchedule() {
  const container = document.querySelector(".schedule-container");
  container.innerHTML = "";

  try {
    DAYS_ORDER.forEach((day) => {
      if (day === "Суббота" && !saturdayEnabled) return;
      const lessons = currentSchedule[day] || [];
      if (lessons.length > 0) {
        const card = createDayCard(day, lessons);
        container.appendChild(card);
      }
    });

    // Рисуем inline-предложения для админа
    if (isAdmin) renderInlineProposals();
    
    // Обновляем подсветку текущего урока
    highlightCurrentLesson();
    
    // Применяем анимации к измененным элементам ТОЛЬКО для обычных пользователей
    if (!isAdmin && changedElements.size > 0) {
      applyChangeAnimations();
    } else {
      // Для админа просто очищаем список изменений без анимации
      changedElements.clear();
    }
  } catch (e) {
    container.innerHTML = `<div style="color:red">Ошибка: ${e.message}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  isAdmin =
    new URLSearchParams(window.location.search).get("admin") === "yes" &&
    getCookie("isAdmin") === "true";

  if (isAdmin) {
    document.getElementById("adminControls").style.display = "flex";
    document.getElementById("regularControls").style.display = "none";
    document.getElementById("mobileProposeHint").style.display = "none";
    
    // Добавляем горячую клавишу Ctrl+L для очистки ДЗ
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        showClearHomeworkModal();
      }
    });
    
    // Очищаем старые бэкапы при загрузке
    cleanupExpiredBackups();
  } else {
    document.getElementById("mobileProposeHint").style.display = "block";
  }
  
  // Запускаем слушатель предложений для всех (админ и обычные пользователи)
  setupProposalsListener();

  updateCurrentDate();
  await loadSchedule();
  
  // Запускаем realtime listeners после первой загрузки
  setupRealtimeListeners();
  
  // Через небольшую задержку снимаем флаг первой загрузки
  // Это позволит listeners начать отслеживать изменения
  setTimeout(() => {
    isInitialLoad = false;
  }, 1000);
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
// Загрузка расписания (только первый раз)
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
    // Отмечаем что это локальное изменение
    pendingLocalChanges.add('saturday');
    
    // Сохраняем настройки в Firestore
    await db
      .collection("settings")
      .doc("saturday")
      .set({
        enabled: saturdayEnabled,
        scheduleFrom: saturdayEnabled ? scheduleSelect.value : null,
      });
    
    // Увеличиваем версию
    await db
      .collection("system")
      .doc("version")
      .set(
        { number: firebase.firestore.FieldValue.increment(1) },
        { merge: true },
      );

    // Перерисовываем БЕЗ анимации (админ сам изменил)
    renderSchedule();
  } catch (error) {
    pendingLocalChanges.delete('saturday'); // Убираем флаг при ошибке
    alert("Ошибка при обновлении настроек субботы");
  }
};

document
  .getElementById("saturdaySchedule")
  ?.addEventListener("change", async (e) => {
    if (saturdayEnabled) {
      currentSchedule["Суббота"] = [...currentSchedule[e.target.value]];
      
      try {
        // Отмечаем что это локальное изменение
        pendingLocalChanges.add('saturday');
        
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
        
        // Перерисовываем БЕЗ анимации (админ сам изменил)
        renderSchedule();
      } catch (error) {
        pendingLocalChanges.delete('saturday'); // Убираем флаг при ошибке
        console.error("Ошибка при изменении расписания субботы:", error);
      }
    }
  });

// Функция для преобразования URL в кликабельные ссылки
function linkifyText(text) {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="hw-link" onclick="event.stopPropagation()">${url}</a>`;
  });
}

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
                <span class="subject-label">🇬🇧 Английский</span>${hw?.englishText ? `<div class="homework-text">${linkifyText(hw.englishText)}</div>` : ""}
            </div>
            <div class="special-homework ${hw?.germanTest ? "test" : ""} ${hw?.germanExam ? "exam" : ""}">
                <span class="subject-label">🇩🇪 Немецкий</span>${hw?.germanText ? `<div class="homework-text">${linkifyText(hw.germanText)}</div>` : ""}
            </div>
        </div>`;
  } else if (isSplit) {
    hwHTML = `<div class="special-homework-container">
            <div class="special-homework ${hw?.firstGroupTest ? "test" : ""} ${hw?.firstGroupExam ? "exam" : ""}">
                <span class="subject-label">💻 Информатика</span>${hw?.firstGroupText ? `<div class="homework-text">${linkifyText(hw.firstGroupText)}</div>` : ""}
            </div>
            <div class="special-homework ${hw?.secondGroupTest ? "test" : ""} ${hw?.secondGroupExam ? "exam" : ""}">
                <span class="subject-label">🛠️ Труды</span>${hw?.secondGroupText ? `<div class="homework-text">${linkifyText(hw.secondGroupText)}</div>` : ""}
            </div>
        </div>`;
  } else if (hw) {
    if (hw.isTest) item.classList.add("test");
    if (hw.isExam) item.classList.add("exam");
    if (hw.text) hwHTML = `<div class="homework-text">${linkifyText(hw.text)}</div>`;
  }
  
  // Проверяем есть ли локальное предложение от этого пользователя
  let localProposalHTML = "";
  if (!isAdmin) {
    const localProposals = JSON.parse(localStorage.getItem('myProposals') || '{}');
    const proposalKey = normalizeDocId(day, lesson);
    const myProposal = localProposals[proposalKey];
    
    if (myProposal) {
      localProposalHTML = '<div class="my-proposal">';
      localProposalHTML += '<div class="my-proposal-header">Ваше предложение (ожидает проверки):</div>';
      localProposalHTML += '<div class="my-proposal-content">';
      
      if (isLang) {
        if (myProposal.proposes.englishText) {
          localProposalHTML += `<div><strong>🇬🇧 Английский:</strong> ${linkifyText(myProposal.proposes.englishText)}</div>`;
        }
        if (myProposal.proposes.germanText) {
          localProposalHTML += `<div><strong>🇩🇪 Немецкий:</strong> ${linkifyText(myProposal.proposes.germanText)}</div>`;
        }
      } else if (isSplit) {
        if (myProposal.proposes.firstGroupText) {
          localProposalHTML += `<div><strong>💻 Информатика:</strong> ${linkifyText(myProposal.proposes.firstGroupText)}</div>`;
        }
        if (myProposal.proposes.secondGroupText) {
          localProposalHTML += `<div><strong>🛠️ Труды:</strong> ${linkifyText(myProposal.proposes.secondGroupText)}</div>`;
        }
      } else if (myProposal.proposes.text) {
        localProposalHTML += linkifyText(myProposal.proposes.text);
      }
      
      localProposalHTML += '</div></div>';
    }
  }

  item.innerHTML = `
        <div class="lesson-header"><span class="lesson-name">${lesson}</span><span class="lesson-time">${LESSON_TIMES[index] || ""}</span></div>
        ${hwHTML}
        ${localProposalHTML}
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
  
  // Подсветка сегодняшнего дня
  const today = getCurrentDayName();
  if (day === today) {
    card.classList.add("today");
  }
  
  card.innerHTML = `<div class="day-header"><h2 class="day-name">${day}</h2></div><div class="lessons-list"></div>`;
  const list = card.querySelector(".lessons-list");
  lessons.forEach((l, i) => list.appendChild(createLessonItem(day, l, i)));
  
  // Добавляем пустую карточку для добавления урока (только для админа и если уроков меньше 7)
  if (isAdmin && lessons.length < 7) {
    const addItem = document.createElement("div");
    addItem.className = "add-lesson-item";
    addItem.textContent = "+ Добавить урок";
    addItem.onclick = () => showAddLessonModal(day, lessons.length);
    list.appendChild(addItem);
  }
  
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
  m.dataset.isNew = "false";

  document.getElementById("adminLessonName").value = lesson;
  document.getElementById("deleteLessonBtn").style.display = "block";

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
  const isNew = m.dataset.isNew === "true";
  const proposalId = m.dataset.proposalId; // ID предложения если редактируем
  const newLesson =
    document.getElementById("adminLessonName").value.trim() || oldLesson;

  if (!newLesson) {
    alert("Пожалуйста, введите название урока");
    return;
  }

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

    if (isNew) {
      // Добавляем новый урок
      if (mainSched[day].length >= 7) {
        alert("Максимум 7 уроков в день");
        return;
      }
      mainSched[day].push(newLesson);
      // Отмечаем что это локальное изменение расписания
      pendingLocalChanges.add('schedule');
    } else if (newLesson !== oldLesson) {
      // Переименовываем существующий урок
      mainSched[day][index] = newLesson;
      // Отмечаем что это локальное изменение расписания и ДЗ
      pendingLocalChanges.add('schedule');
      pendingLocalChanges.add(`homework-${normalizeDocId(day, oldLesson)}`);
      await db
        .collection("homework")
        .doc(normalizeDocId(day, oldLesson))
        .delete();
    } else {
      // Просто обновляем ДЗ без изменения названия
      const hwDocId = normalizeDocId(day, newLesson);
      pendingLocalChanges.add(`homework-${hwDocId}`);
      
      await db
        .collection("homework")
        .doc(hwDocId)
        .set(hwData);
      
      // Удаляем предложение если редактировали его
      if (proposalId) {
        await db.collection("proposals").doc(proposalId).delete();
      }
      
      await db
        .collection("system")
        .doc("version")
        .set(
          { number: firebase.firestore.FieldValue.increment(1) },
          { merge: true },
        );
      closeModal();
      // Realtime listener автоматически обновит данные
      return;
    }

    // Сохраняем обновленное расписание
    await schedRef.set(mainSched);

    // Сохраняем домашнее задание
    const hwDocId = normalizeDocId(day, newLesson);
    pendingLocalChanges.add(`homework-${hwDocId}`);
    await db
      .collection("homework")
      .doc(hwDocId)
      .set(hwData);
    
    // Удаляем предложение если редактировали его
    if (proposalId) {
      await db.collection("proposals").doc(proposalId).delete();
    }
    
    // Увеличиваем версию
    await db
      .collection("system")
      .doc("version")
      .set(
        { number: firebase.firestore.FieldValue.increment(1) },
        { merge: true },
      );

    closeModal();
    // Realtime listener автоматически обновит данные
  } catch (e) {
    // Очищаем все pending флаги при ошибке
    pendingLocalChanges.clear();
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
    const proposalData = {
      day,
      lesson,
      lessonIndex: parseInt(index),
      proposes,
      status: "pending",
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };
    
    // Отправляем в Firestore
    const docRef = await db.collection("proposals").add(proposalData);
    
    // Сохраняем локально для отображения пользователю
    const localProposals = JSON.parse(localStorage.getItem('myProposals') || '{}');
    const proposalKey = normalizeDocId(day, lesson);
    localProposals[proposalKey] = {
      id: docRef.id,
      ...proposalData,
      proposes
    };
    localStorage.setItem('myProposals', JSON.stringify(localProposals));
    
    alert("Ваше предложение успешно отправлено администратору!");
    closeProposeModal();
    
    // Перерисовываем чтобы показать предложение
    renderSchedule();
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
      
      if (isAdmin) {
        renderInlineProposals();
      } else {
        // Для обычных пользователей - очищаем обработанные предложения
        cleanupLocalProposals();
      }
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
    if (p.proposes.text) html += `<div>${linkifyText(p.proposes.text)}</div>`;
    if (p.proposes.englishText)
      html += `<div><strong>Англ:</strong> ${linkifyText(p.proposes.englishText)}</div>`;
    if (p.proposes.germanText)
      html += `<div><strong>Нем:</strong> ${linkifyText(p.proposes.germanText)}</div>`;
    if (p.proposes.firstGroupText)
      html += `<div><strong>Инфо:</strong> ${linkifyText(p.proposes.firstGroupText)}</div>`;
    if (p.proposes.secondGroupText)
      html += `<div><strong>Труды:</strong> ${linkifyText(p.proposes.secondGroupText)}</div>`;

    html += `</div>
            <div class="inline-proposal-actions">
                <button class="approve" onclick="approveProposal('${p.id}')">Одобрить</button>
                <button class="edit" onclick="editProposal('${p.id}')">Редактировать</button>
                <button class="reject" onclick="rejectProposal('${p.id}')">Отклонить</button>
            </div>
        `;
    div.innerHTML = html;
    container.appendChild(div);
  });
}

window.editProposal = function(id) {
  const p = pendingProposals.find((x) => x.id === id);
  if (!p) return;
  
  // Открываем модалку редактирования с данными из предложения
  const m = document.getElementById("homeworkModal");
  m.dataset.day = p.day;
  m.dataset.lesson = p.lesson;
  m.dataset.index = p.lessonIndex;
  m.dataset.isNew = "false";
  m.dataset.proposalId = id; // Сохраняем ID предложения

  document.getElementById("adminLessonName").value = p.lesson;
  document.getElementById("deleteLessonBtn").style.display = "block";

  m.querySelectorAll('input[type="checkbox"]').forEach(
    (c) => (c.checked = false),
  );
  m.querySelectorAll("textarea").forEach((t) => (t.value = ""));

  const isLang = p.lesson.includes("Иностранный");
  const isSplit = p.lesson.includes("(м.)") || p.lesson.includes("(д.)");

  document.getElementById("normalSection").style.display =
    !isLang && !isSplit ? "block" : "none";
  document.getElementById("languageSection").style.display = isLang
    ? "block"
    : "none";
  document.getElementById("splitSection").style.display = isSplit
    ? "block"
    : "none";

  setupCheckboxHandlers();

  // Заполняем данными из предложения
  if (isLang) {
    document.getElementById("englishText").value = p.proposes.englishText || "";
    document.getElementById("germanText").value = p.proposes.germanText || "";
  } else if (isSplit) {
    document.getElementById("firstGroupText").value = p.proposes.firstGroupText || "";
    document.getElementById("secondGroupText").value = p.proposes.secondGroupText || "";
  } else {
    document.getElementById("homeworkText").value = p.proposes.text || "";
  }

  // Добавляем обработчик Enter
  const enterHandler = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveHomework();
    }
  };
  
  m.querySelectorAll("textarea, input").forEach(el => {
    el.removeEventListener("keydown", enterHandler);
    el.addEventListener("keydown", enterHandler);
  });

  document.body.classList.add("modal-open");
  m.style.display = "flex";
  requestAnimationFrame(() => m.classList.add("is-visible"));
};

window.approveProposal = async function (id) {
  const p = pendingProposals.find((x) => x.id === id);
  if (!p) return;
  try {
    const docId = normalizeDocId(p.day, p.lesson);
    
    // Отмечаем что это локальное изменение
    pendingLocalChanges.add(`homework-${docId}`);
    
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

    // Realtime listener автоматически обновит данные
  } catch (e) {
    pendingLocalChanges.delete(`homework-${docId}`); // Убираем флаг при ошибке
    alert("Ошибка при одобрении: " + e.message);
  }
};

window.rejectProposal = async function (id) {
  if (confirm("Вы действительно хотите удалить это предложение?")) {
    await db.collection("proposals").doc(id).delete();
  }
};

// Функция для очистки локальных предложений (вызывается при одобрении/отклонении)
function cleanupLocalProposals() {
  if (isAdmin) return; // Админу не нужно
  
  const localProposals = JSON.parse(localStorage.getItem('myProposals') || '{}');
  let hasChanges = false;
  
  // Проверяем каждое локальное предложение
  Object.keys(localProposals).forEach(key => {
    const proposal = localProposals[key];
    
    // Проверяем существует ли это предложение в Firestore
    const stillPending = pendingProposals.some(p => p.id === proposal.id);
    
    if (!stillPending) {
      // Предложение было обработано (одобрено или отклонено)
      delete localProposals[key];
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    localStorage.setItem('myProposals', JSON.stringify(localProposals));
    renderSchedule(); // Перерисовываем чтобы убрать предложение
  }
}

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
    closeClearHomeworkModal();
    closeArchiveModal();
  }
};


// Функция для показа модалки добавления урока
window.showAddLessonModal = function(day, index) {
  const m = document.getElementById("homeworkModal");
  m.dataset.day = day;
  m.dataset.lesson = "";
  m.dataset.index = index;
  m.dataset.isNew = "true";

  document.getElementById("adminLessonName").value = "";
  document.getElementById("deleteLessonBtn").style.display = "none";

  m.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
  m.querySelectorAll("textarea").forEach(t => t.value = "");

  document.getElementById("normalSection").style.display = "block";
  document.getElementById("languageSection").style.display = "none";
  document.getElementById("splitSection").style.display = "none";

  setupCheckboxHandlers();

  document.body.classList.add("modal-open");
  m.style.display = "flex";
  requestAnimationFrame(() => m.classList.add("is-visible"));
};

// Функция удаления урока
window.deleteLesson = async function() {
  if (!confirm("Вы уверены, что хотите удалить этот урок?")) return;

  const m = document.getElementById("homeworkModal");
  const day = m.dataset.day;
  const lesson = m.dataset.lesson;
  const index = parseInt(m.dataset.index);

  try {
    // Отмечаем что это локальное изменение
    pendingLocalChanges.add('schedule');
    const hwDocId = normalizeDocId(day, lesson);
    pendingLocalChanges.add(`homework-${hwDocId}`);
    
    const schedRef = db.collection("schedule").doc("main");
    const schedDoc = await schedRef.get();
    let mainSched = schedDoc.exists ? schedDoc.data() : {};
    
    if (!mainSched[day]) {
      mainSched[day] = [...currentSchedule[day]];
    }
    
    // Удаляем урок из массива
    mainSched[day].splice(index, 1);
    
    await schedRef.set(mainSched);
    
    // Удаляем домашнее задание
    await db.collection("homework").doc(hwDocId).delete();
    
    // Увеличиваем версию
    await db.collection("system").doc("version").set({
      number: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });

    closeModal();
    // Realtime listener автоматически обновит данные
  } catch (e) {
    // Очищаем pending флаги при ошибке
    pendingLocalChanges.delete('schedule');
    pendingLocalChanges.delete(`homework-${normalizeDocId(day, lesson)}`);
    alert("Ошибка при удалении урока: " + e.message);
  }
};

// ============ АРХИВ РАСПИСАНИЯ ============

// Функция для получения номера недели и года
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

// Функция для получения даты начала недели
function getWeekStartDate(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4)
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return ISOweekStart;
}

// Автоматическое сохранение архива (вызывается при изменении расписания)
async function saveWeeklyArchive() {
  try {
    const now = new Date();
    const { year, week } = getWeekNumber(now);
    const archiveId = `${year}-W${week.toString().padStart(2, '0')}`;
    
    // Проверяем, есть ли уже архив за эту неделю
    const archiveDoc = await db.collection("archive").doc(archiveId).get();
    
    // Собираем текущее состояние расписания и ДЗ
    const scheduleSnapshot = {};
    const homeworkSnapshot = {};
    
    for (const day of Object.keys(currentSchedule)) {
      // Пропускаем субботу если там нет реальных уроков
      if (day === "Суббота") {
        const lessons = currentSchedule[day];
        if (!lessons || lessons.length === 0) {
          continue;
        }
        
        // Проверяем что есть хоть один нормальный урок (не "Суббота" и не "test")
        const hasRealLessons = lessons.some(lesson => {
          return lesson && lesson !== "Суббота" && lesson !== "test" && lesson.trim() !== "";
        });
        
        // Или проверяем что есть контрольные/самостоятельные
        const hasTests = lessons.some(lesson => {
          const hwKey = normalizeDocId(day, lesson);
          const hw = cachedHomework.get(hwKey);
          return hw && (hw.isTest || hw.isExam || hw.englishTest || hw.englishExam || 
                       hw.germanTest || hw.germanExam || hw.firstGroupTest || 
                       hw.firstGroupExam || hw.secondGroupTest || hw.secondGroupExam);
        });
        
        if (!hasRealLessons && !hasTests) {
          continue; // Не сохраняем субботу если нет ни уроков, ни контрольных
        }
      }
      scheduleSnapshot[day] = [...currentSchedule[day]];
    }
    
    const homeworkDocs = await db.collection("homework").get();
    homeworkDocs.forEach(doc => {
      const data = doc.data();
      // Пропускаем ДЗ для субботы если она не в расписании
      if (data.day === "Суббота" && !scheduleSnapshot["Суббота"]) {
        return;
      }
      homeworkSnapshot[doc.id] = data;
    });
    
    const weekStart = getWeekStartDate(year, week);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    await db.collection("archive").doc(archiveId).set({
      year,
      week,
      weekStart: firebase.firestore.Timestamp.fromDate(weekStart),
      weekEnd: firebase.firestore.Timestamp.fromDate(weekEnd),
      schedule: scheduleSnapshot,
      homework: homeworkSnapshot,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error("Ошибка сохранения архива:", e);
  }
}

// Открытие модального окна архива
window.showArchiveModal = async function() {
  const modal = document.getElementById("archiveModal");
  const list = document.getElementById("archiveWeeksList");
  
  list.innerHTML = '<div class="archive-loading">Загрузка архива...</div>';
  
  document.body.classList.add("modal-open");
  modal.style.display = "flex";
  requestAnimationFrame(() => modal.classList.add("is-visible"));
  
  try {
    const archiveDocs = await db.collection("archive")
      .orderBy("year", "desc")
      .orderBy("week", "desc")
      .limit(20)
      .get();
    
    if (archiveDocs.empty) {
      const emptyHTML = '<div class="archive-loading">Архив пуст. Архивы создаются автоматически при изменении расписания.</div>';
      if (isAdmin) {
        list.innerHTML = emptyHTML + '<button onclick="generateArchiveNow()" class="admin-btn" style="margin-top: 20px;">Сгенерировать архив сейчас</button>';
      } else {
        list.innerHTML = emptyHTML;
      }
      return;
    }
    
    list.innerHTML = "";
    
    archiveDocs.forEach(doc => {
      const data = doc.data();
      const weekItem = createArchiveWeekItem(doc.id, data);
      list.appendChild(weekItem);
    });
  } catch (e) {
    list.innerHTML = '<div class="archive-loading">Ошибка загрузки архива: ' + e.message + '</div>';
  }
};

// Генерация архива вручную
window.generateArchiveNow = async function() {
  try {
    await saveWeeklyArchive();
    showArchiveModal(); // Перезагружаем
  } catch (e) {
    alert("Ошибка при создании архива: " + e.message);
  }
};

// Создание элемента недели в архиве
function createArchiveWeekItem(archiveId, data) {
  const item = document.createElement("div");
  item.className = "archive-week-item";
  
  const weekStart = data.weekStart.toDate();
  const weekEnd = data.weekEnd.toDate();
  
  const formatDate = (date) => {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };
  
  const deleteBtn = isAdmin ? `<button class="archive-delete-btn" onclick="event.stopPropagation(); deleteArchive('${archiveId}')">Удалить</button>` : '';
  
  item.innerHTML = `
    <div class="archive-week-header">
      <div class="archive-week-title">Неделя ${data.week}, ${data.year}</div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="archive-week-date">${formatDate(weekStart)} - ${formatDate(weekEnd)}</div>
        ${deleteBtn}
      </div>
    </div>
    <div class="archive-week-content" id="archive-${archiveId}"></div>
  `;
  
  item.onclick = () => {
    const isExpanded = item.classList.contains("expanded");
    
    // Закрываем все остальные
    document.querySelectorAll(".archive-week-item").forEach(i => i.classList.remove("expanded"));
    
    if (!isExpanded) {
      item.classList.add("expanded");
      renderArchiveWeek(archiveId, data);
    }
  };
  
  return item;
}

// Удаление архива
window.deleteArchive = async function(archiveId) {
  if (!confirm('Вы уверены, что хотите удалить этот архив?')) return;
  
  try {
    await db.collection("archive").doc(archiveId).delete();
    showArchiveModal(); // Перезагружаем список
  } catch (e) {
    alert("Ошибка при удалении архива: " + e.message);
  }
};

// Отрисовка содержимого недели
function renderArchiveWeek(archiveId, data) {
  const container = document.getElementById(`archive-${archiveId}`);
  container.innerHTML = "";
  
  const daysOrder = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  
  daysOrder.forEach(day => {
    if (!data.schedule[day] || data.schedule[day].length === 0) return;
    
    // Пропускаем субботу если там только пустые/тестовые уроки И нет контрольных
    if (day === "Суббота") {
      const lessons = data.schedule[day];
      const hasRealLessons = lessons.some(lesson => {
        // Проверяем что урок не пустой и не тестовый
        if (!lesson || lesson === "Суббота" || lesson === "test" || lesson.trim() === "") {
          return false;
        }
        return true;
      });
      
      // Проверяем есть ли контрольные/самостоятельные
      const hasTests = lessons.some(lesson => {
        const hwKey = normalizeDocId(day, lesson);
        const hw = data.homework[hwKey];
        return hw && (hw.isTest || hw.isExam || hw.englishTest || hw.englishExam || 
                     hw.germanTest || hw.germanExam || hw.firstGroupTest || 
                     hw.firstGroupExam || hw.secondGroupTest || hw.secondGroupExam);
      });
      
      if (!hasRealLessons && !hasTests) return; // Не показываем пустую субботу без контрольных
    }
    
    const dayDiv = document.createElement("div");
    dayDiv.className = "archive-day";
    
    let dayHTML = `<div class="archive-day-name">${day}</div>`;
    
    data.schedule[day].forEach((lesson, index) => {
      // Пропускаем пустые и тестовые уроки
      if (!lesson || lesson === "Суббота" || lesson === "test" || lesson.trim() === "") {
        return;
      }
      
      const hwKey = normalizeDocId(day, lesson);
      const hw = data.homework[hwKey];
      
      let lessonClass = "archive-lesson";
      if (hw?.isTest) lessonClass += " test";
      if (hw?.isExam) lessonClass += " exam";
      
      let hwText = "";
      if (hw) {
        if (hw.isLanguageLesson) {
          if (hw.englishText) hwText += `🇬🇧 ${linkifyText(hw.englishText)}\n`;
          if (hw.germanText) hwText += `🇩🇪 ${linkifyText(hw.germanText)}`;
        } else if (hw.isSplitLesson) {
          if (hw.firstGroupText) hwText += `💻 ${linkifyText(hw.firstGroupText)}\n`;
          if (hw.secondGroupText) hwText += `🛠️ ${linkifyText(hw.secondGroupText)}`;
        } else if (hw.text) {
          hwText = linkifyText(hw.text);
        }
      }
      
      dayHTML += `
        <div class="${lessonClass}">
          <div class="archive-lesson-header">
            <span class="archive-lesson-name">${lesson}</span>
            <span class="archive-lesson-time">${LESSON_TIMES[index] || ""}</span>
          </div>
          ${hwText ? `<div class="archive-homework">${hwText}</div>` : ""}
        </div>
      `;
    });
    
    dayDiv.innerHTML = dayHTML;
    container.appendChild(dayDiv);
  });
}

// Закрытие модального окна архива
window.closeArchiveModal = function() {
  const modal = document.getElementById("archiveModal");
  modal.classList.remove("is-visible");
  setTimeout(() => {
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }, 250);
};

// ============ ОЧИСТКА ДОМАШНИХ ЗАДАНИЙ ============

// Открытие модального окна очистки ДЗ
window.showClearHomeworkModal = function() {
  if (!isAdmin) return; // Только для админа
  
  const modal = document.getElementById("clearHomeworkModal");
  document.body.classList.add("modal-open");
  modal.style.display = "flex";
  requestAnimationFrame(() => modal.classList.add("is-visible"));
};

// Закрытие модального окна очистки ДЗ
window.closeClearHomeworkModal = function() {
  const modal = document.getElementById("clearHomeworkModal");
  modal.classList.remove("is-visible");
  setTimeout(() => {
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }, 250);
};

// Очистка всех домашних заданий
window.clearAllHomework = async function() {
  if (!isAdmin) return; // Только для админа
  
  try {
    // 1. Сначала сохраняем архив текущей недели
    await saveWeeklyArchive();
    
    // 2. Получаем все документы из коллекции homework
    const homeworkSnapshot = await db.collection("homework").get();
    
    if (homeworkSnapshot.empty) {
      alert("Нет домашних заданий для удаления");
      closeClearHomeworkModal();
      return;
    }
    
    // 3. Сохраняем все ДЗ во временную коллекцию для возможности отмены
    const backupId = `backup-${Date.now()}`;
    const backupData = {
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000)), // 5 минут
      homework: {}
    };
    
    homeworkSnapshot.docs.forEach(doc => {
      backupData.homework[doc.id] = doc.data();
    });
    
    await db.collection("homework_backups").doc(backupId).set(backupData);
    
    // 4. Удаляем все документы
    const batch = db.batch();
    homeworkSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    // 5. Увеличиваем версию
    await db.collection("system").doc("version").set({
      number: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
    
    // 6. Очищаем локальный кеш
    cachedHomework.clear();
    
    // 7. Закрываем модалку
    closeClearHomeworkModal();
    
    // 8. Показываем уведомление с кнопкой отмены
    showUndoNotification(backupId);
    
    // Realtime listener автоматически обновит данные
  } catch (e) {
    alert("Ошибка при очистке домашних заданий: " + e.message);
  }
};

// Показать уведомление с возможностью отмены
function showUndoNotification(backupId) {
  // Создаем элемент уведомления
  const notification = document.createElement('div');
  notification.id = 'undoNotification';
  notification.className = 'undo-notification';
  
  let timeLeft = 300; // 5 минут в секундах
  
  const updateTimer = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    notification.innerHTML = `
      <div class="undo-notification-content">
        <div class="undo-notification-text">
          <strong>Все домашние задания удалены</strong>
          <div class="undo-notification-timer">Отменить можно в течение ${timeString}</div>
        </div>
        <button onclick="undoClearHomework('${backupId}')" class="undo-notification-btn">Отменить</button>
      </div>
    `;
  };
  
  updateTimer();
  document.body.appendChild(notification);
  
  // Показываем уведомление
  setTimeout(() => notification.classList.add('visible'), 100);
  
  // Обновляем таймер каждую секунду
  const timerInterval = setInterval(() => {
    timeLeft--;
    updateTimer();
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      hideUndoNotification();
      // Удаляем бэкап из Firestore
      db.collection("homework_backups").doc(backupId).delete();
    }
  }, 1000);
  
  // Сохраняем interval ID для возможности очистки
  notification.dataset.intervalId = timerInterval;
}

// Скрыть уведомление об отмене
function hideUndoNotification() {
  const notification = document.getElementById('undoNotification');
  if (notification) {
    // Очищаем таймер
    const intervalId = notification.dataset.intervalId;
    if (intervalId) {
      clearInterval(parseInt(intervalId));
    }
    
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), 300);
  }
}

// Отменить удаление домашних заданий
window.undoClearHomework = async function(backupId) {
  try {
    // 1. Получаем бэкап
    const backupDoc = await db.collection("homework_backups").doc(backupId).get();
    
    if (!backupDoc.exists) {
      alert("Время для отмены истекло");
      hideUndoNotification();
      return;
    }
    
    const backupData = backupDoc.data();
    
    // 2. Восстанавливаем все ДЗ
    const batch = db.batch();
    Object.keys(backupData.homework).forEach(docId => {
      const hwRef = db.collection("homework").doc(docId);
      batch.set(hwRef, backupData.homework[docId]);
    });
    
    await batch.commit();
    
    // 3. Удаляем бэкап
    await db.collection("homework_backups").doc(backupId).delete();
    
    // 4. Увеличиваем версию
    await db.collection("system").doc("version").set({
      number: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
    
    // 5. Скрываем уведомление
    hideUndoNotification();
    
    alert("Домашние задания успешно восстановлены!");
    
    // Realtime listener автоматически обновит данные
  } catch (e) {
    alert("Ошибка при восстановлении: " + e.message);
  }
};

// Очистка истекших бэкапов
async function cleanupExpiredBackups() {
  try {
    const now = firebase.firestore.Timestamp.now();
    const expiredBackups = await db.collection("homework_backups")
      .where("expiresAt", "<=", now)
      .get();
    
    if (!expiredBackups.empty) {
      const batch = db.batch();
      expiredBackups.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`Удалено ${expiredBackups.size} истекших бэкапов`);
    }
  } catch (e) {
    console.error("Ошибка при очистке бэкапов:", e);
  }
}

// Вызываем сохранение архива при каждом изменении расписания
const originalSaveHomework = window.saveHomework;
window.saveHomework = async function() {
  await originalSaveHomework.call(this);
  await saveWeeklyArchive();
};

const originalDeleteLesson = window.deleteLesson;
window.deleteLesson = async function() {
  await originalDeleteLesson.call(this);
  await saveWeeklyArchive();
};


// ============ ИНДИКАТОР ТЕКУЩЕГО УРОКА ============

// Функция для парсинга времени урока
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Функция для получения текущего урока
function getCurrentLessonIndex() {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = воскресенье, 1 = понедельник, ..., 6 = суббота
  
  // Проверяем, что сегодня учебный день (понедельник-пятница или суббота если включена)
  if (currentDay === 0 || (currentDay === 6 && !saturdayEnabled)) {
    return -1; // Выходной
  }
  
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  for (let i = 0; i < LESSON_TIMES.length; i++) {
    const [startTime, endTime] = LESSON_TIMES[i].split(' - ');
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      return i; // Возвращаем индекс текущего урока
    }
  }
  
  return -1; // Уроки не идут
}

// Функция для получения текущего дня недели
function getCurrentDayName() {
  const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  return days[new Date().getDay()];
}

// Функция для подсветки текущего урока
function highlightCurrentLesson() {
  const currentLessonIndex = getCurrentLessonIndex();
  const currentDay = getCurrentDayName();
  
  // Убираем все предыдущие подсветки
  document.querySelectorAll('.lesson-item.current-lesson').forEach(el => {
    el.classList.remove('current-lesson');
  });
  
  if (currentLessonIndex === -1) return; // Нет текущего урока
  
  // Находим карточку текущего дня
  const dayCard = document.querySelector(`.day-card[data-day="${currentDay}"]`);
  if (!dayCard) return;
  
  // Находим урок с нужным индексом
  const lessonItems = dayCard.querySelectorAll('.lesson-item');
  if (lessonItems[currentLessonIndex]) {
    lessonItems[currentLessonIndex].classList.add('current-lesson');
  }
}


// Запускаем подсветку при загрузке расписания
const originalLoadSchedule = loadSchedule;
loadSchedule = async function() {
  await originalLoadSchedule.call(this);
  highlightCurrentLesson();
};

// Обновляем подсветку каждую минуту
setInterval(highlightCurrentLesson, 60000);


// ============ АНИМАЦИЯ ИЗМЕНЕНИЙ И СКРОЛЛ ============

// Intersection Observer для отслеживания видимости элементов
let changeObserver = null;

function setupChangeObserver() {
  if (changeObserver) {
    changeObserver.disconnect();
  }
  
  changeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Элемент стал видимым - запускаем анимацию
        const element = entry.target;
        if (element.classList.contains('pending-animation')) {
          element.classList.remove('pending-animation');
          element.classList.add('changed');
          
          // Удаляем класс после завершения анимации
          setTimeout(() => {
            element.classList.remove('changed');
            changeObserver.unobserve(element);
          }, 2000);
        }
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px'
  });
}

// Применение анимаций к измененным элементам
function applyChangeAnimations() {
  setupChangeObserver();
  
  const changedElementsList = [];
  
  changedElements.forEach(changeId => {
    let element = null;
    
    if (changeId.startsWith('day-')) {
      // Изменился весь день (например, добавилась суббота)
      const day = changeId.replace('day-', '');
      element = document.querySelector(`.day-card[data-day="${day}"]`);
    } else if (changeId.startsWith('hw-')) {
      // Изменилось домашнее задание
      const docId = changeId.replace('hw-', '');
      
      // Находим урок по docId
      const allLessons = document.querySelectorAll('.lesson-item');
      allLessons.forEach(lessonEl => {
        const dayCard = lessonEl.closest('.day-card');
        if (!dayCard) return;
        
        const day = dayCard.dataset.day;
        const index = lessonEl.dataset.index;
        const lessons = currentSchedule[day];
        if (!lessons || !lessons[index]) return;
        
        const lesson = lessons[index];
        const expectedDocId = normalizeDocId(day, lesson);
        
        if (expectedDocId === docId) {
          element = lessonEl;
        }
      });
    }
    
    if (element) {
      changedElementsList.push(element);
      
      // Проверяем видимость элемента
      const rect = element.getBoundingClientRect();
      const isVisible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
      
      if (isVisible) {
        // Элемент виден - сразу запускаем анимацию
        element.classList.add('changed');
        setTimeout(() => {
          element.classList.remove('changed');
        }, 2000);
      } else {
        // Элемент не виден - ждем пока он появится
        element.classList.add('pending-animation');
        changeObserver.observe(element);
      }
    }
  });
  
  // Показываем индикатор изменений если есть невидимые изменения
  updateChangesIndicator(changedElementsList);
  
  // Очищаем список изменений
  changedElements.clear();
}

// Обновление индикатора изменений
function updateChangesIndicator(changedElementsList) {
  const indicator = document.getElementById('changesIndicator');
  if (!indicator) return;
  
  // Проверяем есть ли изменения выше текущей позиции скролла
  const hasChangesAbove = changedElementsList.some(element => {
    const rect = element.getBoundingClientRect();
    return rect.top < 0; // Элемент выше видимой области
  });
  
  // Показываем индикатор только на мобильных устройствах
  const isMobile = window.innerWidth <= 768;
  
  if (hasChangesAbove && isMobile) {
    indicator.classList.add('visible');
    indicator.style.display = 'flex';
    
    // Автоматически скрываем через 10 секунд
    setTimeout(() => {
      indicator.classList.remove('visible');
      indicator.style.display = 'none';
    }, 10000);
  } else {
    indicator.classList.remove('visible');
    indicator.style.display = 'none';
  }
}

// Функция скролла к изменениям
window.scrollToChanges = function() {
  const indicator = document.getElementById('changesIndicator');
  
  // Находим первый элемент с pending-animation или changed
  const changedElement = document.querySelector('.pending-animation, .changed');
  
  if (changedElement) {
    changedElement.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
    
    // Скрываем индикатор
    if (indicator) {
      indicator.style.display = 'none';
    }
  }
};

// Скрываем индикатор при скролле вверх
let lastScrollTop = 0;
window.addEventListener('scroll', () => {
  const indicator = document.getElementById('changesIndicator');
  if (!indicator || indicator.style.display === 'none') return;
  
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // Если пользователь скроллит вверх, скрываем индикатор
  if (scrollTop < lastScrollTop) {
    indicator.style.display = 'none';
  }
  
  lastScrollTop = scrollTop;
});


