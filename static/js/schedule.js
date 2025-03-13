// Глобальные переменные
let currentSchedule = {};
let saturdayEnabled = false;
let cachedSchedule = null;
let cachedHomework = new Map();
let isAdmin = false;

// Время начала уроков
const LESSON_TIMES = [
    '8:30 - 9:15',    // 1 урок
    '9:30 - 10:15',   // 2 урок
    '10:30 - 11:15',  // 3 урок
    '11:30 - 12:15',  // 4 урок
    '12:30 - 13:15',  // 5 урок
    '13:30 - 14:15',  // 6 урок
    '14:30 - 15:15',  // 7 урок
    '15:30 - 16:15'   // 8 урок
];

// Порядок дней недели
const DAYS_ORDER = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

// При загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        isAdmin = urlParams.get('admin') === 'yes' && getCookie('isAdmin') === 'true';
        
        const adminControls = document.getElementById('adminControls');
        const regularControls = document.getElementById('regularControls');
        
        if (isAdmin) {
            adminControls.style.display = 'flex';
            regularControls.style.display = 'none';
        } else {
            adminControls.style.display = 'none';
            regularControls.style.display = 'flex';
        }

        updateCurrentDate();
        await loadSchedule();
    } catch (error) {
        console.error('Ошибка при инициализации:', error);
    }
});

// Функция для получения cookie
function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
        const parts = v.split('=');
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
}

// Функция для удаления cookie
function deleteCookie(name) {
    document.cookie = name + '=; Max-Age=0; path=/';
}

// Обновление текущей даты
function updateCurrentDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const currentDate = new Date().toLocaleDateString('ru-RU', options);
    document.getElementById('currentDate').textContent = currentDate;
}

// Функция для нормализации ID документа
function normalizeDocId(day, lesson) {
    // Заменяем все пробелы и слэши на подчеркивания
    return `${day}_${lesson}`.replace(/[\s\/()\.]/g, '_');
}

// Оптимизированная загрузка расписания
async function loadSchedule() {
    console.log('Начало загрузки расписания');
    const scheduleContainer = document.querySelector('.schedule-container');
    if (!scheduleContainer) {
        console.error('Container for schedule not found');
        return;
    }
    
    scheduleContainer.innerHTML = '';

    try {
        // Сначала загружаем домашние задания
        const homeworkSnapshot = await db.collection('homework').get();
        cachedHomework.clear(); // Очищаем кэш перед загрузкой
        homeworkSnapshot.forEach(doc => {
            const data = doc.data();
            cachedHomework.set(normalizeDocId(data.day, data.lesson), data);
        });

        // Затем загружаем расписание
        if (!cachedSchedule) {
            const response = await fetch('/api/schedule');
            if (!response.ok) throw new Error('Failed to fetch schedule');
            cachedSchedule = await response.json();
        }
        currentSchedule = {...cachedSchedule};

        // Проверяем статус субботы
        const saturdayDoc = await db.collection('settings').doc('saturday').get();
        if (saturdayDoc.exists) {
            const data = saturdayDoc.data();
            saturdayEnabled = data.enabled;
            
            if (saturdayEnabled && data.scheduleFrom) {
                currentSchedule['Суббота'] = [...currentSchedule[data.scheduleFrom]];
                
                const saturdayToggle = document.getElementById('saturdayToggle');
                const saturdaySchedule = document.getElementById('saturdaySchedule');
                
                if (saturdayToggle) {
                    saturdayToggle.textContent = 'Убрать субботу';
                }
                if (saturdaySchedule) {
                    saturdaySchedule.style.display = 'block';
                    saturdaySchedule.value = data.scheduleFrom;
                }
            }
        }

        // Отображаем расписание
        DAYS_ORDER.forEach(day => {
            if (currentSchedule[day] && (day !== 'Суббота' || saturdayEnabled)) {
                const dayCard = createDayCard(day, currentSchedule[day], cachedHomework);
                scheduleContainer.appendChild(dayCard);
            }
        });

    } catch (error) {
        console.error('Ошибка загрузки расписания:', error);
        scheduleContainer.innerHTML = `<div class="error-message">Ошибка загрузки расписания: ${error.message}</div>`;
    }
}

// Обновляем функцию создания карточки урока
function createLessonItem(day, lesson, index, homeworkMap) {
    const lessonItem = document.createElement('div');
    lessonItem.className = 'lesson-item';
    
    const docId = normalizeDocId(day, lesson);
    const homework = homeworkMap.get(docId);
    const isLanguageLesson = lesson.includes('Иностранный');
    const isSplitLesson = lesson.includes('(м.)') || lesson.includes('(д.)');

    let homeworkHTML = '';
    if (isLanguageLesson) {
        homeworkHTML = `
            <div class="language-homework">
                <div class="english-homework${homework?.englishTest ? ' test' : ''}${homework?.englishExam ? ' exam' : ''}">
                    <span class="language-label">🇬🇧 Английский</span>
                    ${homework?.englishText ? `
                        <p class="homework-text">${homework.englishText}</p>
                    ` : ''}
                </div>
                <div class="german-homework${homework?.germanTest ? ' test' : ''}${homework?.germanExam ? ' exam' : ''}">
                    <span class="language-label">🇩🇪 Немецкий</span>
                    ${homework?.germanText ? `
                        <p class="homework-text">${homework.germanText}</p>
                    ` : ''}
                </div>
            </div>
        `;
    } else if (isSplitLesson) {
        homeworkHTML = `
            <div class="split-homework">
                <div class="info-homework${homework?.firstGroupTest ? ' test' : ''}${homework?.firstGroupExam ? ' exam' : ''}">
                    <span class="language-label">💻 Информатика</span>
                    ${homework?.firstGroupText ? `<div class="homework-text">${homework.firstGroupText}</div>` : ''}
                </div>
                <div class="labor-homework${homework?.secondGroupTest ? ' test' : ''}${homework?.secondGroupExam ? ' exam' : ''}">
                    <span class="language-label">🛠️ Труды</span>
                    ${homework?.secondGroupText ? `<div class="homework-text">${homework.secondGroupText}</div>` : ''}
                </div>
            </div>
        `;
    } else {
        if (homework) {
            if (homework.isTest) lessonItem.classList.add('test');
            if (homework.isExam) lessonItem.classList.add('exam');
            homeworkHTML = homework.text ? `<div class="homework-text">${homework.text}</div>` : '';
        }
    }

    lessonItem.innerHTML = `
        <div class="lesson-header">
            <span class="lesson-name">${lesson}</span>
            <span class="lesson-time">${LESSON_TIMES[index]}</span>
        </div>
        ${homeworkHTML}
    `;

    if (isAdmin) {
        lessonItem.style.cursor = 'pointer';
        lessonItem.onclick = () => showHomeworkModal(day, lesson, isLanguageLesson, isSplitLesson);
    }

    return lessonItem;
}

// Обновляем функцию создания карточки дня
function createDayCard(day, lessons, homeworkMap) {
    const dayCard = document.createElement('div');
    dayCard.className = 'day-card';
    
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    dayHeader.innerHTML = `<h2 class="day-name">${day}</h2>`;
    
    const lessonsList = document.createElement('div');
    lessonsList.className = 'lessons-list';
    
    lessons.forEach((lesson, index) => {
        const lessonItem = createLessonItem(day, lesson, index, homeworkMap);
        lessonsList.appendChild(lessonItem);
    });
    
    dayCard.appendChild(dayHeader);
    dayCard.appendChild(lessonsList);
    return dayCard;
}

// Обновляем функцию setupCheckboxHandlers
function setupCheckboxHandlers() {
    const setupPair = (testBox, examBox) => {
        if (testBox && examBox) {
            testBox.addEventListener('change', () => {
                if (testBox.checked) examBox.checked = false;
            });
            examBox.addEventListener('change', () => {
                if (examBox.checked) testBox.checked = false;
            });
        }
    };

    // Для обычных предметов
    setupPair(
        document.querySelector('input[name="homeworkTest"]'),
        document.querySelector('input[name="homeworkExam"]')
    );

    // Для английского языка
    setupPair(
        document.querySelector('input[name="englishTest"]'),
        document.querySelector('input[name="englishExam"]')
    );

    // Для немецкого языка
    setupPair(
        document.querySelector('input[name="germanTest"]'),
        document.querySelector('input[name="germanExam"]')
    );

    // Для первой группы
    setupPair(
        document.querySelector('input[name="firstGroupTest"]'),
        document.querySelector('input[name="firstGroupExam"]')
    );

    // Для второй группы
    setupPair(
        document.querySelector('input[name="secondGroupTest"]'),
        document.querySelector('input[name="secondGroupExam"]')
    );
}

// Показ модального окна для домашнего задания
function showHomeworkModal(day, lesson, isLanguageLesson, isSplitLesson) {
    const modal = document.getElementById('homeworkModal');
    document.body.classList.add('modal-open');
    const selectedLesson = document.getElementById('selectedLesson');
    const homeworkText = document.getElementById('homeworkText');
    const languageSection = document.getElementById('languageSection');
    const splitSection = document.getElementById('splitSection');
    const homeworkMarks = document.querySelector('.homework-marks');

    selectedLesson.textContent = `${day}: ${lesson}`;
    modal.dataset.day = day;
    modal.dataset.lesson = lesson;

    // Сбрасываем все чекбоксы и поля
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.querySelectorAll('textarea').forEach(textarea => {
        textarea.value = '';
    });

    if (isLanguageLesson) {
        homeworkText.style.display = 'none';
        homeworkMarks.style.display = 'none';
        languageSection.style.display = 'block';
        splitSection.style.display = 'none';
    } else if (isSplitLesson) {
        homeworkText.style.display = 'none';
        homeworkMarks.style.display = 'none';
        languageSection.style.display = 'none';
        splitSection.style.display = 'block';
    } else {
        homeworkText.style.display = 'block';
        homeworkMarks.style.display = 'block';
        languageSection.style.display = 'none';
        splitSection.style.display = 'none';
    }

    // Устанавливаем обработчики чекбоксов
    setupCheckboxHandlers();

    // Загружаем существующее домашнее задание
    loadExistingHomework(day, lesson, isLanguageLesson, isSplitLesson);
    modal.style.display = 'block';
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('homeworkModal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

// Обновляем функцию загрузки существующего домашнего задания
async function loadExistingHomework(day, lesson, isLanguageLesson, isSplitLesson) {
    try {
        const docId = normalizeDocId(day, lesson);
    const homeworkDoc = await db.collection('homework')
            .doc(docId)
        .get();

        if (homeworkDoc.exists) {
            const data = homeworkDoc.data();
            if (isLanguageLesson) {
                document.getElementById('englishText').value = data.englishText || '';
                document.getElementById('germanText').value = data.germanText || '';
                document.querySelector('input[name="englishTest"]').checked = data.englishTest || false;
                document.querySelector('input[name="englishExam"]').checked = data.englishExam || false;
                document.querySelector('input[name="germanTest"]').checked = data.germanTest || false;
                document.querySelector('input[name="germanExam"]').checked = data.germanExam || false;
            } else if (isSplitLesson) {
                document.getElementById('firstGroupText').value = data.firstGroupText || '';
                document.getElementById('secondGroupText').value = data.secondGroupText || '';
                document.querySelector('input[name="firstGroupTest"]').checked = data.firstGroupTest || false;
                document.querySelector('input[name="firstGroupExam"]').checked = data.firstGroupExam || false;
                document.querySelector('input[name="secondGroupTest"]').checked = data.secondGroupTest || false;
                document.querySelector('input[name="secondGroupExam"]').checked = data.secondGroupExam || false;
            } else {
        document.getElementById('homeworkText').value = data.text || '';
                document.querySelector('input[name="homeworkTest"]').checked = data.isTest || false;
                document.querySelector('input[name="homeworkExam"]').checked = data.isExam || false;
            }
        }
    } catch (error) {
        console.error('Ошибка при загрузке домашнего задания:', error);
    }
}

// Обновляем функцию сохранения домашнего задания
async function saveHomework() {
    try {
        const modal = document.getElementById('homeworkModal');
        const day = modal.dataset.day;
        const lesson = modal.dataset.lesson;
        const docId = normalizeDocId(day, lesson);
        
        const isLanguageLesson = lesson.includes('Иностранный');
        const isSplitLesson = lesson.includes('(м.)') || lesson.includes('(д.)');

        let homeworkData = {
            day,
            lesson,
            isLanguageLesson,
            isSplitLesson,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (isLanguageLesson) {
            Object.assign(homeworkData, {
                englishText: document.getElementById('englishText').value,
                germanText: document.getElementById('germanText').value,
                englishTest: document.querySelector('input[name="englishTest"]').checked,
                englishExam: document.querySelector('input[name="englishExam"]').checked,
                germanTest: document.querySelector('input[name="germanTest"]').checked,
                germanExam: document.querySelector('input[name="germanExam"]').checked
            });
        } else if (isSplitLesson) {
            Object.assign(homeworkData, {
                firstGroupText: document.getElementById('firstGroupText').value,
                secondGroupText: document.getElementById('secondGroupText').value,
                firstGroupTest: document.querySelector('input[name="firstGroupTest"]').checked,
                firstGroupExam: document.querySelector('input[name="firstGroupExam"]').checked,
                secondGroupTest: document.querySelector('input[name="secondGroupTest"]').checked,
                secondGroupExam: document.querySelector('input[name="secondGroupExam"]').checked
            });
        } else {
            Object.assign(homeworkData, {
                text: document.getElementById('homeworkText').value,
                isTest: document.querySelector('input[name="homeworkTest"]').checked,
                isExam: document.querySelector('input[name="homeworkExam"]').checked
            });
        }

        // Сохраняем в Firebase
        await db.collection('homework').doc(docId).set(homeworkData);
        
        // Обновляем кэш
        cachedHomework.set(docId, homeworkData);
        
        // Обновляем отображение
        await loadSchedule();
        closeModal();
    } catch (error) {
        console.error('Ошибка при сохранении:', error);
        showNotification('Ошибка', 'Не удалось сохранить домашнее задание', 'error');
    }
}

// Переключение субботы
async function toggleSaturday() {
    const toggleBtn = document.getElementById('saturdayToggle');
    const scheduleSelect = document.getElementById('saturdaySchedule');
    
    saturdayEnabled = !saturdayEnabled;
    
    if (saturdayEnabled) {
        toggleBtn.textContent = 'Убрать субботу';
        scheduleSelect.style.display = 'block';
        
        // Получаем выбранный день для расписания
        const selectedDay = scheduleSelect.value;
        currentSchedule['Суббота'] = [...currentSchedule[selectedDay]];
    } else {
        toggleBtn.textContent = 'Добавить субботу';
        scheduleSelect.style.display = 'none';
        delete currentSchedule['Суббота'];
    }
    
    try {
        await db.collection('settings').doc('saturday').set({
            enabled: saturdayEnabled,
            scheduleFrom: saturdayEnabled ? scheduleSelect.value : null
        });

        // Очищаем кэш и перезагружаем расписание
        cachedSchedule = null;
        cachedHomework.clear();
        await loadSchedule();
    } catch (error) {
        console.error('Ошибка при обновлении настроек субботы:', error);
    }
}

// Выход из админки
function logout() {
    deleteCookie('isAdmin');
    cachedSchedule = null;
    cachedHomework.clear();
    window.location.href = '/';
}

// Закрытие модального окна при клике вне его
window.onclick = function(event) {
    const modal = document.getElementById('homeworkModal');
    if (event.target == modal) {
        closeModal();
    }
}

// Добавляем обработчик изменения выбранного дня для субботы
document.getElementById('saturdaySchedule')?.addEventListener('change', async (e) => {
    if (saturdayEnabled) {
        currentSchedule['Суббота'] = [...currentSchedule[e.target.value]];
        await db.collection('settings').doc('saturday').set({
            enabled: true,
            scheduleFrom: e.target.value
        });
        loadSchedule();
    }
});

// После инициализации Firebase добавьте:
const homeworkRef = db.collection('homework');

// Подписываемся на изменения в коллекции homework
homeworkRef.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        
        if (change.type === "added" || change.type === "modified") {
            // Обновляем UI для добавленного/измененного ДЗ
            updateHomeworkUI(data);
        } else if (change.type === "removed") {
            // Удаляем ДЗ из UI
            removeHomeworkFromUI(data);
        }
    });
});

// Функция обновления UI
function updateHomeworkUI(homework) {
    const dayCard = document.querySelector(`[data-day="${homework.day}"]`);
    if (!dayCard) return;

    const lessonItem = dayCard.querySelector(`[data-lesson="${homework.lesson}"]`);
    if (!lessonItem) return;

    const homeworkContainer = lessonItem.querySelector('.homework-container');
    if (!homeworkContainer) return;

    // Очищаем контейнер
    homeworkContainer.innerHTML = '';

    if (homework.isLanguageLesson) {
        // Для иностранных языков
        if (homework.englishText) {
            const englishDiv = createHomeworkElement(
                '🇬🇧 Английский', 
                homework.englishText, 
                homework.englishTest, 
                homework.englishExam
            );
            homeworkContainer.appendChild(englishDiv);
        }
        if (homework.germanText) {
            const germanDiv = createHomeworkElement(
                '🇩🇪 Немецкий', 
                homework.germanText, 
                homework.germanTest, 
                homework.germanExam
            );
            homeworkContainer.appendChild(germanDiv);
        }
    } else if (homework.isSplitLesson) {
        // Для информатики/трудов
        if (homework.firstGroupText) {
            const infoDiv = createHomeworkElement(
                '💻 Информатика', 
                homework.firstGroupText, 
                homework.firstGroupTest, 
                homework.firstGroupExam
            );
            homeworkContainer.appendChild(infoDiv);
        }
        if (homework.secondGroupText) {
            const laborDiv = createHomeworkElement(
                '🛠️ Труды', 
                homework.secondGroupText, 
                homework.secondGroupTest, 
                homework.secondGroupExam
            );
            homeworkContainer.appendChild(laborDiv);
        }
    } else {
        // Для обычных предметов
        if (homework.text) {
            const homeworkDiv = createHomeworkElement(
                '', 
                homework.text, 
                homework.isTest, 
                homework.isExam
            );
            homeworkContainer.appendChild(homeworkDiv);
        }
    }

    // Обновляем классы для стилей
    lessonItem.classList.toggle('test', homework.isTest);
    lessonItem.classList.toggle('exam', homework.isExam);
}

function createHomeworkElement(label, text, isTest, isExam) {
    const div = document.createElement('div');
    div.className = 'homework-text';
    if (isTest) div.classList.add('has-test');
    if (isExam) div.classList.add('has-exam');

    if (label) {
        const labelSpan = document.createElement('span');
        labelSpan.className = 'language-label';
        labelSpan.textContent = label;
        div.appendChild(labelSpan);
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    div.appendChild(textSpan);

    return div;
}

// Функция удаления ДЗ из UI
function removeHomeworkFromUI(homework) {
    const dayElement = document.querySelector(`[data-day="${homework.day}"]`);
    if (!dayElement) return;

    const lessonElement = dayElement.querySelector(`[data-lesson="${homework.lesson}"]`);
    if (!lessonElement) return;

    const homeworkElement = lessonElement.querySelector('.homework-text');
    if (homeworkElement) {
        homeworkElement.remove();
    }
}

// Обновляем функцию deleteHomework
async function deleteHomework(day, lesson) {
    try {
        await homeworkRef.doc(`${day}_${lesson}`).delete();
        // Не нужно обновлять UI здесь - это сделает onSnapshot
    } catch (error) {
        showNotification('Ошибка', 'Не удалось удалить домашнее задание', 'error');
    }
}
 