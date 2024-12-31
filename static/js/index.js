// Константы для паролей админов
const ADMIN_PASSWORDS = ['СуБоСе', 'БоЛаВа'];

// Функция для установки cookie
function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/';
}

// Функция для получения cookie
function getCookie(name) {
    return document.cookie.split('; ').reduce((r, v) => {
        const parts = v.split('=');
        return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
}

// Функция для удаления cookie
function deleteCookie(name) {
    setCookie(name, '', -1);
}

// При загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const isAdmin = getCookie('isAdmin') === 'true';
    const lastUsedPassword = getCookie('lastUsedPassword');
    const savedPassword = localStorage.getItem('lastPassword');

    if (isAdmin && lastUsedPassword && ADMIN_PASSWORDS.includes(lastUsedPassword)) {
        window.location.href = '/schedule?admin=yes';
    } else {
        document.querySelector('.container').style.display = 'block';
        if (savedPassword) {
            document.getElementById('password').value = savedPassword;
        }
    }
});

// Добавление обработчика события popstate для кнопки "Назад"
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
        if (event.state.page === 'admin') {
            autoLogin();
        } else {
            document.querySelector('.container').style.display = 'block';
        }
    }
});

function viewSchedule() {
    // Убедимся, что просмотр расписания не активирует админский вход
    deleteCookie('isAdmin');
    history.pushState({ page: 'schedule' }, 'Schedule', '/schedule');
    window.location.href = '/schedule';
}

function showAdminLogin() {
    const adminPasswordInput = document.getElementById('adminPassword');
    const lastUsedPassword = getCookie('lastUsedPassword');

    if (lastUsedPassword) {
        adminPasswordInput.value = lastUsedPassword;
    } else {
        adminPasswordInput.value = '';
    }

    document.getElementById('adminModal').style.display = 'block';
    adminPasswordInput.focus();
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function loginAsAdmin() {
    const password = document.getElementById('adminPassword').value;

    if (ADMIN_PASSWORDS.includes(password)) {
        setCookie('isAdmin', 'true', 1);
        setCookie('lastUsedPassword', password, 30); // Сохраняем последний использованный пароль на 30 дней
        window.location.href = '/schedule?admin=yes';
    } else {
        alert('Неверный пароль');
    }
}

// Закрытие модального окна при клике вне его
window.onclick = function(event) {
    const modal = document.getElementById('adminModal');
    if (event.target == modal) {
        closeAdminModal();
    }
}

// Обработка Enter в поле пароля
document.getElementById('adminPassword')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginAsAdmin();
    }
});

// Функция для выхода
function logout() {
    deleteCookie('isAdmin');
    window.location.href = '/';
}

function goBack() {
    const isAdmin = getCookie('isAdmin') === 'true';
    if (isAdmin) {
        deleteCookie('isAdmin');
    }
    history.back();
}

// Функция для автоматического входа
function autoLogin() {
    deleteCookie('isLoggedOut');
    setCookie('isAdmin', 'true', 1);
    window.location.href = '/admin_schedule';
}

// Обновляем функцию проверки пароля
async function checkPassword() {
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password })
        });

        if (response.ok) {
            // Сохраняем пароль в localStorage при успешном входе
            localStorage.setItem('lastPassword', password);
            window.location.href = '/schedule?admin=yes';
        } else {
            alert('Неверный пароль');
        }
    } catch (error) {
        console.error('Ошибка при проверке пароля:', error);
        alert('Произошла ошибка при проверке пароля');
    }
}
  