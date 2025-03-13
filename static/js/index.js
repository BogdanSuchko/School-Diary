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

    if (isAdmin && lastUsedPassword && ADMIN_PASSWORDS.includes(lastUsedPassword)) {
        window.location.href = '/schedule?admin=yes';
    } else {
        document.querySelector('.container').style.display = 'block';
    }
});

function viewSchedule() {
    deleteCookie('isAdmin');
    window.location.href = '/schedule';
}

function showAdminLogin() {
    const adminPasswordInput = document.getElementById('adminPassword');
    const lastUsedPassword = getCookie('lastUsedPassword');

    if (lastUsedPassword) {
        adminPasswordInput.value = lastUsedPassword;
    }

    document.getElementById('adminModal').style.display = 'block';
    adminPasswordInput.focus();
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

function loginAsAdmin() {
    const password = document.getElementById('adminPassword').value;

    if (ADMIN_PASSWORDS.includes(password)) {
        setCookie('isAdmin', 'true', 1);
        setCookie('lastUsedPassword', password, 30);
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
  