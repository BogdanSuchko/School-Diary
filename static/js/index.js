async function validateAndEnter() {
    const lastName = document.getElementById('lastName').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    const className = document.getElementById('class').value.trim();
    const errorElement = document.getElementById('error');

    // Базовая валидация
    if (!lastName || !firstName || !className) {
        errorElement.textContent = 'Пожалуйста, заполните все поля';
        errorElement.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/validate_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                full_name: `${lastName} ${firstName}`,
                class: className
            })
        });

        const data = await response.json();
        if (data.success) {
            localStorage.setItem('fullName', `${lastName} ${firstName}`);
            localStorage.setItem('class', className);
            window.location.href = '/dashboard';
        } else {
            errorElement.textContent = data.error;
            errorElement.style.display = 'block';
        }
    } catch (error) {
        errorElement.textContent = 'Произошла ошибка при входе';
        errorElement.style.display = 'block';
    }
}

// Добавляем обработку Enter для всех полей ввода
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
    
    // Ваша логика обработки изменения полноэкранного режима
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