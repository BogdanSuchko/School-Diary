function applyTheme() {
    document.body.classList.add('dark-theme');
    document.documentElement.classList.add('dark-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
}

function setupThemeToggle() {
    applyTheme();
}

function applyDesign() {
    document.body.classList.add('design-new');
}

function setupDesignToggle() {
    applyDesign();
}

window.applyTheme = applyTheme;
window.setupThemeToggle = setupThemeToggle;
window.setupDesignToggle = setupDesignToggle;
window.toggleTheme = function() {};