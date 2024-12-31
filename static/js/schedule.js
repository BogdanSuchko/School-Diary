// Глобальные переменные
let currentSchedule = {};
let saturdayEnabled = false;
let cachedSchedule = null;
let cachedHomework = new Map();

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

// Добавьте эту вспомогательную функцию в начало файла
function normalizeDocumentId(day, lesson) {
    // Заменяем пробелы и специальные символы на подчеркивания
    return `${day}_${lesson.replace(/[\s\/\(\)\.]/g, '_')}`;
}

// При загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const isAdmin = urlParams.get('admin') === 'yes' && getCookie('isAdmin') === 'true';
        
        // Показываем/скрываем соответствующие контролы
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

// Проверка статуса админа
function checkAdminStatus() {
    const isAdmin = localStorage.getItem('isAdmin') === 'true';
    
    if (isAdmin) {
        const adminControls = document.getElementById('adminControls');
        if (adminControls) {
            adminControls.style.display = 'flex';
        }
    }
}

// Обновление текущей даты
function updateCurrentDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const currentDate = new Date().toLocaleDateString('ru-RU', options);
    document.getElementById('currentDate').textContent = currentDate;
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
        console.log('Загрузка базового расписания...');
        if (!cachedSchedule) {
            const response = await fetch('/api/schedule');
            console.log('Ответ от сервера:', response);
            if (!response.ok) {
                throw new Error('Failed to fetch schedule');
            }
            cachedSchedule = await response.json();
            console.log('Получено расписание:', cachedSchedule);
        }
        currentSchedule = {...cachedSchedule};

        // Затем проверяем статус субботы
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

        // Загружаем домашние задания
        if (cachedHomework.size === 0) {
            const homeworkSnapshot = await db.collection('homework').get();
            homeworkSnapshot.forEach(doc => {
                const data = doc.data();
                cachedHomework.set(`${data.day}_${data.lesson}`, data);
            });
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
    
    const homework = homeworkMap.get(`${day}_${lesson}`);
    const isLanguageLesson = lesson.includes('Иностранный');
    const isSplitLesson = lesson.includes('/');

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
        const [firstPart, secondPart] = lesson.split('/').map(part => part.trim());
        
        homeworkHTML = `
            <div class="language-homework">
                <div class="split-homework${homework?.firstGroupTest ? ' test' : ''}${homework?.firstGroupExam ? ' exam' : ''}">
                    <span class="language-label">💻 Информатика</span>
                    ${homework?.firstGroupText ? `
                        <p class="homework-text">${homework.firstGroupText}</p>
                    ` : ''}
                </div>
                <div class="split-homework${homework?.secondGroupTest ? ' test' : ''}${homework?.secondGroupExam ? ' exam' : ''}">
                    <span class="language-label">🛠️ Труды</span>
                    ${homework?.secondGroupText ? `
                        <p class="homework-text">${homework.secondGroupText}</p>
                    ` : ''}
                </div>
            </div>
        `;
    } else {
    if (homework) {
        if (homework.isTest) lessonItem.classList.add('test');
        if (homework.isExam) lessonItem.classList.add('exam');
        }
        homeworkHTML = `<p class="homework-text">${homework ? homework.text || '' : ''}</p>`;
    }

    lessonItem.innerHTML = `
        <div class="lesson-header">
            <div class="lesson-info">
                <span class="lesson-number">${index + 1}</span>
                <span class="lesson-name">${lesson}</span>
            </div>
            <span class="lesson-time">${LESSON_TIMES[index]}</span>
        </div>
        ${homeworkHTML}
    `;

    const isAdmin = getCookie('isAdmin') === 'true';
    if (isAdmin) {
        lessonItem.style.cursor = 'pointer';
        lessonItem.addEventListener('click', () => {
            showHomeworkModal(day, lesson, isLanguageLesson);
        });
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

// Обновляем функцию для обработки чекбоксов
function setupCheckboxHandlers() {
    // Для обычных предметов
    const homeworkTestCheckbox = document.querySelector('input[name="homeworkTest"]');
    const homeworkExamCheckbox = document.querySelector('input[name="homeworkExam"]');

    if (homeworkTestCheckbox && homeworkExamCheckbox) {
        homeworkTestCheckbox.addEventListener('change', () => {
            if (homeworkTestCheckbox.checked) {
                homeworkExamCheckbox.checked = false;
            }
        });

        homeworkExamCheckbox.addEventListener('change', () => {
            if (homeworkExamCheckbox.checked) {
                homeworkTestCheckbox.checked = false;
            }
        });
    }

    // Для английского языка
    const englishTestCheckbox = document.querySelector('input[name="englishTest"]');
    const englishExamCheckbox = document.querySelector('input[name="englishExam"]');

    if (englishTestCheckbox && englishExamCheckbox) {
        englishTestCheckbox.addEventListener('change', () => {
            if (englishTestCheckbox.checked) {
                englishExamCheckbox.checked = false;
            }
        });

        englishExamCheckbox.addEventListener('change', () => {
            if (englishExamCheckbox.checked) {
                englishTestCheckbox.checked = false;
            }
        });
    }

    // Для немецкого языка
    const germanTestCheckbox = document.querySelector('input[name="germanTest"]');
    const germanExamCheckbox = document.querySelector('input[name="germanExam"]');

    if (germanTestCheckbox && germanExamCheckbox) {
        germanTestCheckbox.addEventListener('change', () => {
            if (germanTestCheckbox.checked) {
                germanExamCheckbox.checked = false;
            }
        });

        germanExamCheckbox.addEventListener('change', () => {
            if (germanExamCheckbox.checked) {
                germanTestCheckbox.checked = false;
            }
        });
    }

    // Для первой группы (Информатика)
    const firstGroupTestCheckbox = document.querySelector('input[name="firstGroupTest"]');
    const firstGroupExamCheckbox = document.querySelector('input[name="firstGroupExam"]');

    if (firstGroupTestCheckbox && firstGroupExamCheckbox) {
        firstGroupTestCheckbox.addEventListener('change', () => {
            if (firstGroupTestCheckbox.checked) {
                firstGroupExamCheckbox.checked = false;
            }
        });

        firstGroupExamCheckbox.addEventListener('change', () => {
            if (firstGroupExamCheckbox.checked) {
                firstGroupTestCheckbox.checked = false;
            }
        });
    }

    // Для второй группы (Труды)
    const secondGroupTestCheckbox = document.querySelector('input[name="secondGroupTest"]');
    const secondGroupExamCheckbox = document.querySelector('input[name="secondGroupExam"]');

    if (secondGroupTestCheckbox && secondGroupExamCheckbox) {
        secondGroupTestCheckbox.addEventListener('change', () => {
            if (secondGroupTestCheckbox.checked) {
                secondGroupExamCheckbox.checked = false;
            }
        });

        secondGroupExamCheckbox.addEventListener('change', () => {
            if (secondGroupExamCheckbox.checked) {
                secondGroupTestCheckbox.checked = false;
            }
        });
    }
}

// Вызываем функцию при загрузке страницы
document.addEventListener('DOMContentLoaded', setupCheckboxHandlers);

// Показ модального окна для домашнего задания
function showHomeworkModal(day, lesson, isLanguageLesson) {
    const modal = document.getElementById('homeworkModal');
    const selectedLesson = document.getElementById('selectedLesson');
    const homeworkText = document.getElementById('homeworkText');
    const languageSection = document.getElementById('languageSection');
    const splitSection = document.getElementById('splitSection');
    const homeworkMarks = document.querySelector('.homework-marks');

    const isSplitLesson = lesson.includes('/');

    selectedLesson.textContent = `${day}: ${lesson}`;
    modal.dataset.day = day;
    modal.dataset.lesson = lesson;

    // Сбрасываем все чекбоксы
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });

    // Очищаем все текстовые поля
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

    loadExistingHomework(day, lesson, isLanguageLesson, isSplitLesson);
    setupCheckboxHandlers();
    modal.style.display = 'block';
}

// Обновляем функцию загрузки существующего домашнего задания
async function loadExistingHomework(day, lesson, isLanguageLesson, isSplitLesson) {
    try {
        const docId = normalizeDocumentId(day, lesson);
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
        } else {
            // Сброс всех полей
            if (isLanguageLesson) {
                document.getElementById('englishText').value = '';
                document.getElementById('germanText').value = '';
                document.querySelector('input[name="englishTest"]').checked = false;
                document.querySelector('input[name="englishExam"]').checked = false;
                document.querySelector('input[name="germanTest"]').checked = false;
                document.querySelector('input[name="germanExam"]').checked = false;
            } else if (isSplitLesson) {
                document.getElementById('firstGroupText').value = '';
                document.getElementById('secondGroupText').value = '';
                document.querySelector('input[name="firstGroupTest"]').checked = false;
                document.querySelector('input[name="firstGroupExam"]').checked = false;
                document.querySelector('input[name="secondGroupTest"]').checked = false;
                document.querySelector('input[name="secondGroupExam"]').checked = false;
    } else {
        document.getElementById('homeworkText').value = '';
                document.querySelector('input[name="homeworkTest"]').checked = false;
                document.querySelector('input[name="homeworkExam"]').checked = false;
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
        const docId = normalizeDocumentId(day, lesson);
        
        const isLanguageLesson = lesson.includes('Иностранный');
        const isSplitLesson = lesson.includes('/');

        let homeworkData = {
            day,
            lesson,
            updatedAt: new Date().toISOString()
        };

        if (isLanguageLesson) {
            // Для иностранных языков
            homeworkData = {
                ...homeworkData,
                englishText: document.getElementById('englishText')?.value || '',
                germanText: document.getElementById('germanText')?.value || '',
                englishTest: document.querySelector('input[name="englishTest"]')?.checked || false,
                englishExam: document.querySelector('input[name="englishExam"]')?.checked || false,
                germanTest: document.querySelector('input[name="germanTest"]')?.checked || false,
                germanExam: document.querySelector('input[name="germanExam"]')?.checked || false
            };
        } else if (isSplitLesson) {
            // Для разделенных уроков (Информатика/Труды)
            homeworkData = {
                ...homeworkData,
                firstGroupText: document.getElementById('firstGroupText')?.value || '',
                secondGroupText: document.getElementById('secondGroupText')?.value || '',
                firstGroupTest: document.querySelector('input[name="firstGroupTest"]')?.checked || false,
                firstGroupExam: document.querySelector('input[name="firstGroupExam"]')?.checked || false,
                secondGroupTest: document.querySelector('input[name="secondGroupTest"]')?.checked || false,
                secondGroupExam: document.querySelector('input[name="secondGroupExam"]')?.checked || false
            };
        } else {
            // Для обычных предметов
            homeworkData = {
                ...homeworkData,
                text: document.getElementById('homeworkText')?.value || '',
                isTest: document.querySelector('input[name="homeworkTest"]')?.checked || false,
                isExam: document.querySelector('input[name="homeworkExam"]')?.checked || false
            };
        }

        // Сохраняем в базу данных
        const docRef = db.collection('homework').doc(docId);
        await docRef.set(homeworkData);

        // Обновляем кэш и перезагружаем
        cachedHomework.set(`${day}_${lesson}`, homeworkData);
        await loadSchedule();
        closeModal();

    } catch (error) {
        console.error('Ошибка при сохранении:', error);
        alert('Произошла ошибка при сохранен��и. Пожалуйста, попробуйте еще раз.');
    }
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('homeworkModal').style.display = 'none';
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

// Добавим обработчик изменения выбранного дня для субботы
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
 