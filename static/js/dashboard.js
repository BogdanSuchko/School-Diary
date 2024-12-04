let currentClass = localStorage.getItem('class');
let currentUser = localStorage.getItem('fullName');
let currentDay = '';
let currentLesson = '';
let currentLessonNumber = '';
let currentHomework = {};
let touchStartY = 0;
let touchEndY = 0;

if (!currentClass || !currentUser) {
    window.location.href = '/';
}

document.getElementById('userName').textContent = currentUser;
document.getElementById('userClass').textContent = `Класс: ${currentClass}`;

async function loadSchedule() {
    try {
        console.log('Начинаем загрузку расписания для класса:', currentClass);
        
        // Загружаем расписание из локального JSON
        const response = await fetch('/api/schedule?class=' + currentClass);
        const schedule = await response.json();
        
        console.log('Получено расписание:', schedule);
        
        if (!schedule || Object.keys(schedule).length === 0) {
            console.error('Расписание не найдено');
            document.querySelector('.schedule-container').innerHTML = 
                '<div class="no-lessons">Расписание не найдено для вашего класса</div>';
            return;
        }
        
        // Загружаем домашние задания из Firebase
        console.log('Загружаем домашние задания из Firebase...');
        const homeworkSnapshot = await db.collection('homework')
            .doc(currentClass)
            .collection('assignments')
            .get();
            
        currentHomework = {};
        homeworkSnapshot.forEach(doc => {
            currentHomework[doc.id] = {
                current: doc.data(),
                history: doc.data().history || []
            };
        });
        
        console.log('Загружены домашние задания:', currentHomework);
        
        displaySchedule(schedule, currentHomework);
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        document.querySelector('.schedule-container').innerHTML = 
            `<div class="no-lessons">Ошибка при загрузке расписания: ${error.message}</div>`;
    }
}

// Функция отображения домашних заданий обновлена для работы с Firebase
function displaySchedule(schedule, homework) {
    const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
    const { today, tomorrow } = getDays();
    
    console.log('Расписание:', schedule);
    console.log('Дни недели:', days);
    
    days.forEach(day => {
        const lessons = schedule[day];
        console.log(`Обработка дня: ${day}, уроки:`, lessons);
        
        const dayColumn = document.querySelector(`.day-column[data-day="${day}"]`);
        if (!dayColumn) {
            console.error(`Не найдена колонка для дня недели: ${day}`);
            return;
        }
        
        const lessonsContainer = dayColumn.querySelector('.lessons');
        if (!lessonsContainer) {
            console.error(`Не найден контейнер уроков для дня: ${day}`);
            return;
        }
        
        lessonsContainer.innerHTML = '';
        
        dayColumn.classList.remove('current-day', 'tomorrow', 'has-many-lessons');
        
        if (day === today) {
            dayColumn.classList.add('current-day');
        }
        if (day === tomorrow) {
            dayColumn.classList.add('tomorrow');
        }
        
        if (!lessons || lessons.length === 0) {
            lessonsContainer.innerHTML = '<div class="no-lessons">Нет уроков</div>';
            return;
        }
        
        if (lessons && lessons.length > 6) {
            dayColumn.classList.add('has-many-lessons');
        }
        
        lessons.forEach((lesson, index) => {
            const lessonCard = document.createElement('div');
            lessonCard.className = 'lesson-card';
            lessonCard.onclick = () => openHomeworkModal(day, lesson, index + 1);
            
            const homeworkKey = `${day}-${lesson}-${index + 1}`;
            
            // Базовая информация об уроке
            lessonCard.innerHTML = `
                <div class="lesson-number">Урок ${index + 1}</div>
                <div class="lesson-name">${lesson}</div>
            `;

            // Если есть домашнее задание, добавляем его
            if (homework[homeworkKey]) {
                const homeworkData = {
                    ...homework[homeworkKey],
                    key: homeworkKey,
                    day: day,
                    lesson: lesson,
                    number: index + 1
                };
                displayHomework(homeworkData, lessonCard);
            }
            
            lessonsContainer.appendChild(lessonCard);
        });
    });
}

function getDays() {
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const today = new Date().getDay();
    let tomorrow = today + 1;
    
    if (tomorrow === 6) tomorrow = 1;
    if (today === 6) tomorrow = 1;
    if (today === 0) {
        return {
            today: days[1],
            tomorrow: days[2]
        };
    }
    
    return {
        today: days[today],
        tomorrow: days[tomorrow]
    };
}

function openHomeworkModal(day, lesson, number) {
    currentDay = day;
    currentLesson = lesson;
    currentLessonNumber = number;
    
    const modal = document.getElementById('homeworkModal');
    const selectedLesson = document.getElementById('selectedLesson');
    const homeworkText = document.getElementById('homeworkText');
    const historyContainer = document.getElementById('homeworkHistory');
    
    selectedLesson.textContent = `${day}, ${lesson} (Урок ${number})`;
    
    const homeworkKey = `${day}-${lesson}-${number}`;
    const homeworkData = currentHomework[homeworkKey];
    
    if (homeworkData && homeworkData.current) {
        homeworkText.value = homeworkData.current.homework;
        
        if (homeworkData.history && homeworkData.history.length > 0) {
            historyContainer.innerHTML = `
                <div class="history-header">История изменений:</div>
                ${homeworkData.history.map(item => `
                    <div class="history-item">
                        <div>${item.homework}</div>
                        <div class="history-author">
                            Изменил(а): ${item.author}<br>
                            ${new Date(item.timestamp).toLocaleString()}
                        </div>
                    </div>
                `).join('')}
            `;
        } else {
            historyContainer.innerHTML = '';
        }
    } else {
        homeworkText.value = '';
        historyContainer.innerHTML = '';
    }
    
    modal.style.display = 'flex';
}

async function saveHomework() {
    const homeworkText = document.getElementById('homeworkText').value.trim();
    
    if (!homeworkText) {
        showNotification('Ошибка', 'Введите домашнее задание', 'error');
        return;
    }
    
    const homeworkKey = `${currentDay}-${currentLesson}-${currentLessonNumber}`;
    const timestamp = new Date().toISOString();
    
    try {
        const docRef = db.collection('homework')
            .doc(currentClass)
            .collection('assignments')
            .doc(homeworkKey);
            
        const doc = await docRef.get();
        let history = [];
        
        if (doc.exists) {
            const currentData = doc.data();
            history = currentData.history || [];
            history.unshift({
                homework: currentData.homework,
                author: currentData.author,
                timestamp: currentData.timestamp
            });
        }
        
        await docRef.set({
            homework: homeworkText,
            author: currentUser,
            timestamp: timestamp,
            history: history
        });
        
        closeModal();
        loadSchedule();
        showNotification('Успешно', 'Домашнее задание сохранено', 'success');
    } catch (error) {
        console.error('Ошибка при сохранении:', error);
        showNotification('Ошибка', 'Не удалось сохранить домашнее задание', 'error');
    }
}

function closeModal() {
    const modal = document.getElementById('homeworkModal');
    modal.style.display = 'none';
    document.getElementById('homeworkText').value = '';
}

window.onclick = function(event) {
    const homeworkModal = document.getElementById('homeworkModal');
    const reminderModal = document.getElementById('reminderModal');
    
    if (event.target == homeworkModal) {
        closeModal();
    }
    if (event.target == reminderModal) {
        closeReminderModal();
    }
}

function logout() {
    localStorage.removeItem('fullName');
    localStorage.removeItem('class');
    window.location.href = '/';
}

// Добавляем функцию поиска
function addSearchFeature() {
    const container = document.querySelector('.schedule-container');
    const searchDiv = document.createElement('div');
    searchDiv.className = 'search-container';
    searchDiv.innerHTML = `
        <input type="text" 
               id="searchHomework" 
               placeholder="Поиск по домашним заданиям..."
               class="search-input">
        <button onclick="deleteAllHomework()" 
                style="margin-top: 10px; padding: 8px 16px; background: #FF3B30; color: white; border: none; border-radius: 8px; cursor: pointer;">
            Удалить все домашние задания
        </button>
    `;
    container.insertBefore(searchDiv, container.firstChild);

    document.getElementById('searchHomework').addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        const lessonCards = document.querySelectorAll('.lesson-card');

        lessonCards.forEach(card => {
            const homeworkText = card.querySelector('.homework-text')?.textContent.toLowerCase() || '';
            const lessonName = card.querySelector('.lesson-name').textContent.toLowerCase();
            
            if (homeworkText.includes(searchText) || lessonName.includes(searchText)) {
                card.style.display = 'flex';
                card.closest('.day-column').style.display = 'flex';
            } else {
                card.style.display = 'none';
                // Проверяем, есть ли видимые карточки в колонке
                const visibleCards = card.closest('.day-column').querySelectorAll('.lesson-card[style="display: flex;"]');
                if (visibleCards.length === 0) {
                    card.closest('.day-column').style.display = 'none';
                }
            }
        });
    });
}

// Обновляем инициализацию
document.addEventListener('DOMContentLoaded', async () => {
    await loadSchedule();
    addSearchFeature();
});

// Функция для отметки выполнения домашнего задания
async function toggleHomeworkStatus(homeworkKey) {
    try {
        const docRef = db.collection('homework')
            .doc(currentClass)
            .collection('assignments')
            .doc(homeworkKey);
            
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            // Создаем или получаем объект с отметками выполнения для разных пользователей
            const completedBy = data.completedBy || {};
            // Инвертируем статус для текущего пользователя
            const isDone = !completedBy[currentUser];
            
            // Обновляем статус только для текущего пользователя
            await docRef.update({
                [`completedBy.${currentUser}`]: isDone ? {
                    done: true,
                    doneAt: new Date().toISOString()
                } : firebase.firestore.FieldValue.delete()
            });

            // Обновляем локальные данные
            if (currentHomework[homeworkKey]) {
                if (!currentHomework[homeworkKey].current.completedBy) {
                    currentHomework[homeworkKey].current.completedBy = {};
                }
                currentHomework[homeworkKey].current.completedBy[currentUser] = {
                    done: isDone,
                    doneAt: new Date().toISOString()
                };
            }

            // Обновляем UI
            const homeworkCard = document.querySelector(`[data-homework-key="${homeworkKey}"]`);
            if (homeworkCard) {
                const statusBtn = homeworkCard.querySelector('.status-btn');
                statusBtn.classList.toggle('done', isDone);
                statusBtn.textContent = isDone ? 'Выполнено' : 'Отметить как выполненное';
            }

            showToast(isDone ? 'Задание отмечено как выполненное' : 'Отметка о выполнении снята');
        }
    } catch (error) {
        console.error('Ошибка при обновлении статуса:', error);
        showNotification('Ошибка', 'Не удалось обновить статус задания', 'error');
    }
}

// Обновление UI при изменении статуса
function updateHomeworkUI(homeworkKey, isDone) {
    const card = document.querySelector(`[data-homework-key="${homeworkKey}"]`);
    if (card) {
        const statusBtn = card.querySelector('.status-btn');
        statusBtn.classList.toggle('done', isDone);
        statusBtn.textContent = isDone ? 'Выполнено' : 'Отметить как выполненное';
    }
}

// Функция для проверки несделанных заданий
async function checkUnfinishedHomework() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const unfinishedHomework = Object.entries(currentHomework)
        .filter(([key, hw]) => !hw.current.done)
        .length;

    if (unfinishedHomework > 0) {
        sendNotification(
            'Невыполненные задания',
            `У вас ${unfinishedHomework} невыполненных заданий`
        );
    }
}

// Регистрация Service Worker для push-уведомлений
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/static/js/service-worker.js');
            console.log('ServiceWorker зарегистрирован:', registration);
        } catch (error) {
            console.error('Ошибка при регистрации ServiceWorker:', error);
        }
    }
}

// Обновляем функцию отображения домашнего задания
function displayHomework(homeworkData, card) {
    if (!homeworkData || !homeworkData.current) return;

    const homeworkContent = document.createElement('div');
    homeworkContent.className = `homework-card ${homeworkData.type || ''}`;
    homeworkContent.setAttribute('data-homework-key', homeworkData.key);
    
    // Проверяем, выполнено ли задание текущим пользователем
    const isCompletedByCurrentUser = homeworkData.current.completedBy && 
                                   homeworkData.current.completedBy[currentUser] && 
                                   homeworkData.current.completedBy[currentUser].done;
    
    let homeworkHtml = `
        <div class="homework-text">${homeworkData.current.homework}</div>
        <div class="homework-author">
            Добавил(а): ${homeworkData.current.author}
            ${homeworkData.history?.length > 0 ? 
                `<br><span class="edit-count">(изменений: ${homeworkData.history.length})</span>` : 
                ''}
        </div>
        <div class="homework-status">
            <button class="status-btn ${isCompletedByCurrentUser ? 'done' : ''}"
                    onclick="event.stopPropagation(); toggleHomeworkStatus('${homeworkData.key}')">
                ${isCompletedByCurrentUser ? 'Выполнено' : 'Отметить как выполненное'}
            </button>
        </div>
    `;
    
    homeworkContent.innerHTML = homeworkHtml;
    card.appendChild(homeworkContent);
}

function saveReminderSettings() {
    const timeInput = document.getElementById('reminderTime');
    const time = timeInput.value;
    
    if (time) {
        localStorage.setItem('reminderTime', time);
        scheduleReminder(time);
        closeReminderModal();
        alert(`Напоминание будет показано в ${time}`);
    } else {
        alert('Пожалуйста, выберите время');
    }
}

// Функция для показа уведомлений
function showNotification(title, message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(notification);
    
    // Автоматически удаляем через 5 секунд
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Функция для показа тостов
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

async function deleteAllHomework() {
    try {
        // Получаем все документы из коллекции
        const snapshot = await db.collection('homework')
            .doc(currentClass)
            .collection('assignments')
            .get();

        // Удаляем каждый документ
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        
        showNotification('Успешно', 'Все домашние задания удалены', 'success');
        // Перезагружаем расписание
        loadSchedule();
    } catch (error) {
        console.error('Ошибка при удалении:', error);
        showNotification('Ошибка', 'Не удалось удалить задания', 'error');
    }
}

// Обновим обработчики событий для модальных окон
function addModalTouchHandlers() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        modal.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        modal.addEventListener('touchmove', (e) => {
            touchEndY = e.touches[0].clientY;
        }, { passive: true });

        modal.addEventListener('touchend', (e) => {
            if (touchEndY - touchStartY > 50) { // Свайп вниз
                if (e.target === modal) {
                    if (modal.id === 'homeworkModal') {
                        closeModal();
                    } else if (modal.id === 'reminderModal') {
                        closeReminderModal();
                    }
                }
            }
        });
    });
} 