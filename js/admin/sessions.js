import { get, patch } from '../api.js';
import { dateHeure, dureeCourte, volume } from '../format.js';
import { icon } from '../icons.js';
import { $, $$, confirmDialog, handleError, html, pager, setHTML, toast, withBusy } from '../ui.js';
import { setBadge } from './store.js';

const REFRESH_MS = 15000;
const state = { enCours: true, page: 1, perPage: 20 };
let timer = null;
let requestId = 0;

export function init() {
    $('#session-filter').addEventListener('click', (event) => {
        const button = event.target.closest('[data-en-cours]');
        if (!button) return;
        $$('#session-filter button').forEach((b) => b.classList.toggle('active', b === button));
        state.enCours = button.dataset.enCours === '1';
        state.page = 1;
        $('#sessions-live').hidden = !state.enCours;
        load();
    });

    $('#sessions-table').addEventListener('click', (event) => {
        const page = event.target.closest('[data-page]');
        const close = event.target.closest('[data-close-session]');
        if (page) {
            state.page = Number(page.dataset.page);
            load();
        }
        if (close) closeSession(close);
    });
}

export function show() {
    load();
    // Seules les connexions en cours évoluent : inutile de rafraîchir l'historique
    timer = setInterval(() => state.enCours && !document.hidden && load(), REFRESH_MS);
}

export function hide() {
    clearInterval(timer);
}

async function load() {
    const id = ++requestId;
    try {
        const r = await get('/admin/sessions', { en_cours: state.enCours ? 1 : '', page: state.page, per_page: state.perPage });
        if (id !== requestId) return;
        if (!r.data.length && state.page > 1) {
            state.page--;
            return load();
        }
        if (state.enCours) setBadge('connexions', r.total);
        render(r);
    } catch (error) {
        handleError(error);
    }
}

function render(r) {
    if (!r.data.length) {
        setHTML($('#sessions-table'), html`
            <div class="empty">${icon('devices')}
                <p>${state.enCours ? 'Aucun appareil connecté en ce moment.' : 'Aucune connexion enregistrée.'}</p>
            </div>`);
        return;
    }
    setHTML($('#sessions-table'), html`
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>Ticket</th><th>Forfait</th><th>Appareil</th><th>Début</th>
                    <th>Durée</th><th class="num">Consommé</th><th>État</th><th></th>
                </tr></thead>
                <tbody>${r.data.map((s) => html`<tr>
                    <td><code>${s.identifiant}</code></td>
                    <td>${s.forfait}</td>
                    <td><code>${s.adresse_mac}</code><span class="cell-sub">${s.adresse_ip}</span></td>
                    <td>${dateHeure(s.date_debut)}</td>
                    <td>${dureeCourte(s.duree_secondes)}</td>
                    <td class="num">${volume(s.volume_utilise, '—')}</td>
                    <td>${s.date_fin
                        ? html`<span class="muted small">Terminée ${dateHeure(s.date_fin)}</span>`
                        : html`<span class="badge ok">En cours</span>`}</td>
                    <td class="actions">${s.date_fin ? '' : html`
                        <button class="btn btn-ghost btn-sm danger" data-close-session="${s.id_session}" data-ident="${s.identifiant}">${icon('power')} Couper</button>`}</td>
                </tr>`)}</tbody>
            </table>
        </div>
        ${pager({ page: r.page, perPage: r.per_page, total: r.total })}`);
}

async function closeSession(button) {
    const ok = await confirmDialog({
        title: 'Couper cette connexion ?',
        message: `L'appareil utilisant le ticket ${button.dataset.ident} sera déconnecté. Le ticket reste valable : le client pourra se reconnecter.`,
        confirmLabel: 'Couper la connexion',
        danger: true,
    });
    if (!ok) return;
    try {
        await withBusy(button, () => patch(`/admin/sessions/${button.dataset.closeSession}/fermer`));
        toast('Connexion coupée', 'ok');
        load();
    } catch (error) {
        handleError(error);
    }
}
