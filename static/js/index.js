async function validateAndEnter() {
    const lastName = document.getElementById('lastName').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    const className = document.getElementById('class').value.trim();
    const errorElement = document.getElementById('error');

    // Проверка только на русские буквы
    const nameRegex = /^[А-ЯЁа-яё\s-]+$/;
    const classRegex = /^(?:[5-9][АБ]|10|11)$/;

    if (!lastName || !firstName || !className) {
        errorElement.textContent = 'Пожалуйста, заполните все поля';
        errorElement.style.display = 'block';
        return;
    }

    if (!nameRegex.test(lastName) || !nameRegex.test(firstName)) {
        errorElement.textContent = 'Имя и фамилия должны содержать только русские буквы, дефис или пробел';
        errorElement.style.display = 'block';
        return;
    }

    if (!classRegex.test(className)) {
        errorElement.textContent = 'Доступные классы: 5А, 5Б, 6А, 6Б, 7А, 7Б, 8А, 8Б, 9А, 9Б, 10, 11';
        errorElement.style.display = 'block';
        return;
    }

    try {
        // Очищаем старые данные перед новым входом
        clearAuthData();

        // Заменяем ё на е для сохранения
        const normalizedLastName = lastName.replace(/ё/gi, 'е');
        const normalizedFirstName = firstName.replace(/ё/gi, 'е');

        const response = await fetch('/api/validate_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                full_name: `${normalizedLastName} ${normalizedFirstName}`,
                class: className
            })
        });

        const data = await response.json();
        if (data.success) {
            // Сохраняем оригинальное имя с буквой ё
            if (saveUserData(lastName, firstName, className)) {
                redirectToDashboard();
            } else {
                errorElement.textContent = 'Ошибка сохранения данных. Пожалуйста, убедитесь, что cookies разрешены';
                errorElement.style.display = 'block';
            }
        } else {
            errorElement.textContent = data.error;
            errorElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorElement.textContent = 'Произошла ошибка при входе';
        errorElement.style.display = 'block';
    }
}

// Обновляем функцию checkAuth для лучшей поддержки мобильных устройств
function checkAuth() {
    try {
        // Проверяем сначала sessionStorage для быстрого доступа
        let fullName = sessionStorage.getItem('fullName');
        let className = sessionStorage.getItem('class');
        let lastLogin = sessionStorage.getItem('lastLogin');

        // Если данных нет в sessionStorage, проверяем localStorage
        if (!fullName || !className || !lastLogin) {
            fullName = localStorage.getItem('fullName');
            className = localStorage.getItem('class');
            lastLogin = localStorage.getItem('lastLogin');
        }

        if (!fullName || !className || !lastLogin) {
            return false;
        }

        const lastLoginDate = new Date(lastLogin);
        const now = new Date();
        const daysSinceLastLogin = (now - lastLoginDate) / (1000 * 60 * 60 * 24);

        // Увеличиваем период автологина для мобильных устройств
        const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const maxDays = isMobile ? 60 : 7; // 60 дней для мбильных

        return daysSinceLastLogin < maxDays;
    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

// Обновляем функцию сохранения данных
function saveUserData(lastName, firstName, className) {
    try {
        const userData = {
            fullName: `${lastName} ${firstName}`,
            class: className,
            lastLogin: new Date().toISOString(),
            isMobile: /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        };

        // Сохраняем в обоих хранилищах
        ['localStorage', 'sessionStorage'].forEach(storage => {
            try {
                window[storage].setItem('fullName', userData.fullName);
                window[storage].setItem('class', userData.class);
                window[storage].setItem('lastLogin', userData.lastLogin);
                window[storage].setItem('isMobile', userData.isMobile);
            } catch (e) {
                console.error(`${storage} save error:`, e);
            }
        });

        return true;
    } catch (error) {
        console.error('Storage error:', error);
        return false;
    }
}

// Добавляем функцию для восстановления сессии
function restoreSession() {
    try {
        // Пробуем восстановить из sessionStorage сначала
        let fullName = sessionStorage.getItem('fullName');
        let className = sessionStorage.getItem('class');
        
        // Если нет в sessionStorage, пробуем из localStorage
        if (!fullName || !className) {
            fullName = localStorage.getItem('fullName');
            className = localStorage.getItem('class');
            
            // Если нашли в localStorage, восстанавливаем в sessionStorage
            if (fullName && className) {
                sessionStorage.setItem('fullName', fullName);
                sessionStorage.setItem('class', className);
                sessionStorage.setItem('lastLogin', new Date().toISOString());
            }
        }
        
        return fullName && className;
    } catch (error) {
        console.error('Session restore error:', error);
        return false;
    }
}

// Функция для перенаправления
function redirectToDashboard() {
    try {
        if (window.location.pathname === '/') {
            // Используем более надежнй способ перенаправления
            window.location.replace('/dashboard');
            // Добавлям запасной вариант
            setTimeout(() => {
                if (window.location.pathname === '/') {
                    window.location.href = '/dashboard';
                }
            }, 100);
        }
    } catch (error) {
        console.error('Ошибка перенаправления:', error);
        // Запасной вариант
        window.location.href = '/dashboard';
    }
}

// Обновляем емедленную проверку авторизации
(function checkAuthAndRedirect() {
    try {
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            // Пробуем в��сстановить сессию
            if (restoreSession() && checkAuth()) {
                const currentTime = new Date().toISOString();
                
                // Обновляем время последнего входа в обоих хранилищах
                ['localStorage', 'sessionStorage'].forEach(storage => {
                    try {
                        window[storage].setItem('lastLogin', currentTime);
                    } catch (e) {
                        console.error(`${storage} update error:`, e);
                    }
                });

                redirectToDashboard();
                return;
            }
        }
    } catch (error) {
        console.error('Initial auth check error:', error);
    }
})();

// Добавляем обработчик для мобильных событий
window.addEventListener('pageshow', function(event) {
    // Проверяем, загружена ли страница из кэша
    if (event.persisted) {
        // Если траница из кэша, проверяем авторизацию
        if (restoreSession() && checkAuth()) {
            redirectToDashboard();
        }
    }
});

// Обновляем обработчик видимости для мобильных устройств
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        if (restoreSession() && checkAuth()) {
            redirectToDashboard();
        }
    }
});

// Добавляем обработчик видимости страницы
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && checkAuth()) {
        redirectToDashboard();
    }
});

// Добавляем обработчик фокуса окна
window.addEventListener('focus', function() {
    if (checkAuth()) {
        redirectToDashboard();
    }
});

// Добавляем обаботку Enter для всех полей вода
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            validateAndEnter();
        }
    });
});

// Заменяем устаревшие обработчики событий на современные
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Для Safari
document.addEventListener('MSFullscreenChange', handleFullscreenChange); // Для IE11

function handleFullscreenChange() {
    const isFullscreen = document.fullscreenElement || 
                        document.webkitFullscreenElement || 
                        document.msFullscreenElement;
    
    // Ваша лоика обработки изменения полноэкранного режима
    if (isFullscreen) {
        console.log('Вошли в полноэкранный режим');
    } else {
        console.log('Вышли из полноэкранного режима');
    }
}

// Функция для запроса полноэкранного режима
function requestFullscreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
}

// Добавляем функцию для очистки всех данных авторизации
function clearAuthData() {
    try {
        // Очищаем localStorage
        localStorage.removeItem('fullName');
        localStorage.removeItem('class');
        localStorage.removeItem('lastLogin');
        localStorage.removeItem('isMobile');
        
        // Очищаем sessionStorage
        sessionStorage.removeItem('fullName');
        sessionStorage.removeItem('class');
        sessionStorage.removeItem('lastLogin');
        sessionStorage.removeItem('isMobile');
        
        // Очищаем cookies
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
    } catch (error) {
        console.error('Clear auth data error:', error);
    }
}
  