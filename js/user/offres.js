import { CONFIG } from '../../config.js';
import { get } from '../api.js';
import { nombre, validite, volume } from '../format.js';
import { icon } from '../icons.js';
import { html, setHTML, storage } from '../ui.js';

const CACHE_KEY = 'wz.offres';

// Les forfaits viennent du cache JSON du serveur (GET /forfaits) et sont aussi gardés dans le navigateur :
// la liste s'affiche immédiatement depuis la copie locale, puis se met à jour si elle a changé.
export async function loadOffres(container) {
    const cached = storage.get(CACHE_KEY);
    if (cached?.data) render(container, cached.data);
    else setHTML(container, html`<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`);

    try {
        const { data } = await get('/forfaits');
        if (JSON.stringify(data) !== JSON.stringify(cached?.data)) render(container, data);
        storage.set(CACHE_KEY, { data, savedAt: Date.now() });
    } catch {
        if (!cached?.data) {
            setHTML(container, html`<div class="card empty">${icon('alert')}<p>Les forfaits ne peuvent pas être chargés pour le moment.</p></div>`);
        }
    }
}

function render(container, forfaits) {
    if (!forfaits.length) {
        setHTML(container, html`<div class="card empty">${icon('tag')}<p>Aucun forfait disponible pour le moment.</p></div>`);
        return;
    }
    setHTML(container, forfaits.map((f) => html`
        <article class="card offre">
            ${f.volume_go == null ? html`<span class="offre-tag">Illimité</span>` : ''}
            <h3>${f.nom}</h3>
            <p class="offre-prix">${nombre(f.prix)} <small>${CONFIG.devise}</small></p>
            <ul>
                <li>${icon('data')} ${f.volume_go == null ? 'Données illimitées' : volume(f.volume_go)}</li>
                <li>${icon('clock')} ${f.duree_validite == null ? 'Sans limite de temps' : `Valable ${validite(f.duree_validite)}`}</li>
            </ul>
        </article>`));
}
