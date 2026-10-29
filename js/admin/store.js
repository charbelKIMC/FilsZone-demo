import { get } from '../api.js';

// Liste des forfaits partagée entre les pages Forfaits et Tickets (une seule requête tant que rien ne change)
let forfaits = null;

export function getForfaits({ force = false } = {}) {
    if (!forfaits || force) {
        forfaits = get('/admin/forfaits')
            .then((r) => r.data)
            .catch((error) => {
                forfaits = null;
                throw error;
            });
    }
    return forfaits;
}

export function invalidateForfaits() {
    forfaits = null;
}

// Pastille du menu (ex. nombre de connexions en cours)
export function setBadge(name, value) {
    const badge = document.querySelector(`[data-badge="${name}"]`);
    if (!badge) return;
    badge.textContent = value;
    badge.hidden = !value;
}
