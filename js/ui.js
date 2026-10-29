// Outils d'interface partagés : sélection, rendu HTML sûr, notifications, fenêtres, pagination

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ---------- Rendu HTML ----------
// html`...` échappe automatiquement chaque valeur insérée ; raw() marque un HTML déjà sûr (icônes, sous-gabarits)
const RAW = Symbol('raw');

export const raw = (value) => ({ [RAW]: String(value) });

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(value) {
    if (value == null || value === false) return '';
    if (Array.isArray(value)) return value.map(render).join('');
    if (typeof value === 'object' && RAW in value) return value[RAW];
    return esc(value);
}

export function html(strings, ...values) {
    return raw(strings.reduce((out, str, i) => out + str + (i < values.length ? render(values[i]) : ''), ''));
}

export function setHTML(element, content) {
    element.innerHTML = render(content);
}

// ---------- Notifications ----------
export function toast(message, type = 'err') {
    let stack = $('#toasts');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toasts';
        stack.setAttribute('role', 'status');
        stack.setAttribute('aria-live', 'polite');
        document.body.append(stack);
    }
    const item = document.createElement('div');
    item.className = 'toast ' + type;
    item.textContent = message;
    stack.append(item);
    setTimeout(() => item.remove(), 4000);
}

// Les 401 sont gérés globalement (retour à la connexion) ; une requête annulée n'est pas une erreur
export function handleError(error) {
    if (error?.name === 'AbortError' || error?.status === 401) return;
    toast(error?.message || 'Une erreur est survenue');
}

// ---------- Boutons ----------
export async function withBusy(button, task) {
    button?.classList.add('is-busy');
    button?.setAttribute('disabled', '');
    try {
        return await task();
    } finally {
        button?.classList.remove('is-busy');
        button?.removeAttribute('disabled');
    }
}

// ---------- Fenêtre de confirmation ----------
let confirmEl = null;

export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
    if (!confirmEl) {
        confirmEl = document.createElement('dialog');
        confirmEl.innerHTML = `
            <form method="dialog">
                <div class="dialog-head"><h2 data-title></h2></div>
                <div class="dialog-body"><p class="muted" data-message></p></div>
                <div class="dialog-foot">
                    <button class="btn btn-ghost" value="cancel">Annuler</button>
                    <button class="btn" value="ok" data-ok></button>
                </div>
            </form>`;
        document.body.append(confirmEl);
    }
    $('[data-title]', confirmEl).textContent = title;
    $('[data-message]', confirmEl).textContent = message;
    const ok = $('[data-ok]', confirmEl);
    ok.textContent = confirmLabel;
    ok.className = 'btn ' + (danger ? 'btn-danger' : '');

    return new Promise((resolve) => {
        confirmEl.returnValue = '';
        confirmEl.addEventListener('close', () => resolve(confirmEl.returnValue === 'ok'), { once: true });
        confirmEl.showModal();
        ok.focus();
    });
}

// ---------- Pagination ----------
export function pager({ page, perPage, total }) {
    const pages = Math.max(1, Math.ceil(total / perPage));
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(total, page * perPage);
    return html`
        <div class="pager">
            <span>${from}–${to} sur ${total}</span>
            <div>
                <button class="btn btn-ghost btn-sm" data-page="${page - 1}" ${raw(page <= 1 ? 'disabled' : '')}>Précédent</button>
                <button class="btn btn-ghost btn-sm" data-page="${page + 1}" ${raw(page >= pages ? 'disabled' : '')}>Suivant</button>
            </div>
        </div>`;
}

export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Stockage local protégé : navigation privée ou stockage bloqué ne doivent jamais casser la page
export const storage = {
    get(key, fallback = null) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch { /* ignoré */ }
    },
};
