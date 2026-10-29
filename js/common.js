import { CONFIG } from '../config.js';
import { hydrateIcons, setIcon } from './icons.js';
import { $$ } from './ui.js';

// Préparation commune aux pages : icônes, nom de la zone, devise, boutons « afficher le mot de passe »
export function initPage() {
    hydrateIcons();
    $$('[data-zone-nom]').forEach((el) => (el.textContent = CONFIG.zone.nom));
    $$('[data-devise]').forEach((el) => (el.textContent = CONFIG.devise));
    applyLogos();

    $$('[data-toggle-password]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.togglePassword);
            const visible = input.type === 'text';
            input.type = visible ? 'password' : 'text';
            setIcon(button, visible ? 'eye' : 'eyeOff');
            button.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
        });
    });

    // Boutons [data-close] : ferment la fenêtre (dialog) qui les contient
    document.addEventListener('click', (event) => {
        const close = event.target.closest('[data-close]');
        if (close) close.closest('dialog')?.close();
    });
}

// Logos de la zone : l'image ne remplace l'icône par défaut qu'une fois chargée,
// un fichier manquant laisse donc simplement l'icône Wi-Fi en place.
const logoCache = {};

export function loadLogo(type) {
    const src = CONFIG.zone.logos?.[type];
    if (!src) return Promise.resolve(null);
    logoCache[type] ??= new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.src);
        img.onerror = () => resolve(null);
        img.src = src;
    });
    return logoCache[type];
}

function applyLogos() {
    $$('[data-logo]').forEach(async (el) => {
        const src = await loadLogo(el.dataset.logo);
        if (!src) return;
        const img = new Image();
        img.src = src;
        img.alt = CONFIG.zone.nom;
        el.replaceChildren(img);
        el.classList.add('has-logo');
    });

    // Icône d'onglet du navigateur
    loadLogo('page').then((src) => {
        if (src) document.querySelector('link[rel="icon"]')?.setAttribute('href', src);
    });
}

// Affiche ou masque un message dans un bloc .alert
export function showAlert(element, message, tone = '') {
    element.className = 'alert ' + tone;
    element.textContent = message ?? '';
    element.hidden = !message;
}
