import { get, patch, post } from '../api.js';
import { showAlert } from '../common.js';
import { badgeStatut, dateHeure, meterTone, nombre, prix, validite, volume } from '../format.js';
import { icon } from '../icons.js';
import { $, $$, confirmDialog, debounce, handleError, html, pager, setHTML, storage, toast, withBusy } from '../ui.js';
import { exportCsv, printTickets } from './batch.js';
import { getForfaits, invalidateForfaits } from './store.js';

const state = { statut: '', q: '', page: 1, perPage: 20 };
let lastBatch = null; // dernier lot généré : gardé en mémoire jusqu'au rechargement de la page
let requestId = 0;    // seule la réponse de la dernière requête est affichée (recherche rapide)

export function init() {
    const search = $('#ticket-search');
    search.addEventListener('input', debounce(() => {
        // Les identifiants ne contiennent que des lettres majuscules et des chiffres
        state.q = search.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        state.page = 1;
        load();
    }, 250));

    $('#ticket-filter').addEventListener('click', (event) => {
        const button = event.target.closest('[data-statut]');
        if (!button) return;
        $$('#ticket-filter button').forEach((b) => b.classList.toggle('active', b === button));
        state.statut = button.dataset.statut;
        state.page = 1;
        load();
    });

    $('#tickets-table').addEventListener('click', (event) => {
        const page = event.target.closest('[data-page]');
        const off = event.target.closest('[data-off]');
        if (page) {
            state.page = Number(page.dataset.page);
            load();
        }
        if (off) deactivate(off);
    });

    $('#ticket-generate').addEventListener('click', openGenerate);
    $('#generate-form').addEventListener('submit', generate);
    $('#g-forfait').addEventListener('change', updateSummary);
    $('#g-quantite').addEventListener('input', updateSummary);

    $('#batch-reopen').addEventListener('click', () => $('#batch-dialog').showModal());
    $('#batch-print').addEventListener('click', () => printTickets(lastBatch));
    $('#batch-csv').addEventListener('click', () => exportCsv(lastBatch));
}

export function show() {
    load();
}

export function hide() {}

async function load() {
    const id = ++requestId;
    const container = $('#tickets-table');
    container.classList.add('is-loading');
    try {
        const r = await get('/admin/tickets', { statut: state.statut, q: state.q, page: state.page, per_page: state.perPage });
        if (id !== requestId) return;
        // Page vidée (ex. après une désactivation) : on revient à la précédente
        if (!r.data.length && state.page > 1) {
            state.page--;
            return load();
        }
        render(r);
    } catch (error) {
        handleError(error);
    } finally {
        if (id === requestId) container.classList.remove('is-loading');
    }
}

function render(r) {
    if (!r.data.length) {
        const filtre = state.q || state.statut;
        setHTML($('#tickets-table'), html`
            <div class="empty">${icon('ticket')}
                <p>${filtre ? 'Aucun ticket ne correspond à votre recherche.' : 'Aucun ticket pour l\'instant. Générez votre premier lot.'}</p>
            </div>`);
        return;
    }
    setHTML($('#tickets-table'), html`
        <div class="table-wrap">
            <table>
                <thead><tr>
                    <th>Identifiant</th><th>Forfait</th><th>Statut</th><th>Volume restant</th>
                    <th class="num">Prix</th><th>Activé le</th><th>Expire le</th><th></th>
                </tr></thead>
                <tbody>${r.data.map(row)}</tbody>
            </table>
        </div>
        ${pager({ page: r.page, perPage: r.per_page, total: r.total })}`);
}

function row(t) {
    let reste = html`<span class="muted">Illimité</span>`;
    if (t.volume_restant != null) {
        const pourcent = t.volume_total ? Math.min(100, (t.volume_restant / t.volume_total) * 100) : 0;
        reste = html`<div class="vol-cell">
            <div class="meter sm ${meterTone(pourcent)}"><span style="width:${pourcent}%"></span></div>
            <span>${volume(t.volume_restant, '—')}</span>
        </div>`;
    }
    return html`<tr>
        <td><code>${t.identifiant}</code></td>
        <td>${t.forfait}</td>
        <td>${badgeStatut(t.statut)}</td>
        <td>${reste}</td>
        <td class="num">${prix(t.prix_vente)}</td>
        <td>${dateHeure(t.date_premiere_connexion, html`<span class="muted">Jamais</span>`)}</td>
        <td>${dateHeure(t.date_expiration, html`<span class="muted">—</span>`)}</td>
        <td class="actions">${['neuf', 'actif'].includes(t.statut)
            ? html`<button class="btn btn-ghost btn-sm danger" data-off="${t.id_ticket}" data-ident="${t.identifiant}">${icon('ban')} Désactiver</button>`
            : ''}</td>
    </tr>`;
}

async function deactivate(button) {
    const ok = await confirmDialog({
        title: 'Désactiver ce ticket ?',
        message: `Le ticket ${button.dataset.ident} ne pourra plus être utilisé et sa connexion éventuelle sera coupée. Cette action est définitive.`,
        confirmLabel: 'Désactiver',
        danger: true,
    });
    if (!ok) return;
    try {
        await withBusy(button, () => patch(`/admin/tickets/${button.dataset.off}/desactiver`));
        toast('Ticket désactivé', 'ok');
        load();
    } catch (error) {
        handleError(error);
    }
}

// ---------- Génération ----------

async function openGenerate() {
    try {
        const forfaits = await getForfaits();
        if (!forfaits.length) {
            toast("Créez d'abord un forfait", 'info');
            location.hash = '#/forfaits';
            return;
        }
        // On garde le dernier forfait choisi : générer plusieurs lots du même forfait est le cas courant
        const select = $('#g-forfait');
        const previous = storage.get('wz.admin.forfait');
        setHTML(select, forfaits.map((f) => html`
            <option value="${f.id_forfait}">${f.nom} · ${prix(f.prix)}</option>`));
        if (forfaits.some((f) => f.id_forfait === previous)) select.value = previous;
        showAlert($('#generate-error'), '');
        updateSummary();
        $('#generate-dialog').showModal();
    } catch (error) {
        handleError(error);
    }
}

async function selectedForfait() {
    const forfaits = await getForfaits();
    return forfaits.find((f) => f.id_forfait === Number($('#g-forfait').value));
}

async function updateSummary() {
    const forfait = await selectedForfait();
    const quantite = Number($('#g-quantite').value) || 0;
    if (!forfait) return;
    setHTML($('#g-summary'), html`
        <b>${nombre(quantite)} ticket(s)</b> « ${forfait.nom} » :
        ${forfait.volume_go == null ? 'données illimitées' : volume(forfait.volume_go)}, ${validite(forfait.duree_validite).toLowerCase()}.<br>
        Valeur de vente : <b>${prix(quantite * forfait.prix)}</b>`);
}

async function generate(event) {
    event.preventDefault();
    const forfait = await selectedForfait();
    const quantite = Number($('#g-quantite').value);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > 100) {
        showAlert($('#generate-error'), 'La quantité doit être un nombre entier entre 1 et 100.');
        return;
    }
    try {
        const { data } = await withBusy($('#generate-submit'), () =>
            post('/admin/tickets/generer', { id_forfait: forfait.id_forfait, quantite }));
        storage.set('wz.admin.forfait', forfait.id_forfait);
        lastBatch = { forfait, tickets: data, date: new Date() };
        $('#generate-dialog').close();
        openBatch();
        invalidateForfaits(); // le nombre de tickets du forfait a changé
        state.page = 1;
        load();
    } catch (error) {
        if (error.status !== 401) showAlert($('#generate-error'), error.message);
    }
}

function openBatch() {
    const { forfait, tickets, date } = lastBatch;
    $('#batch-meta').textContent = `${tickets.length} ticket(s) « ${forfait.nom} » · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    setHTML($('#batch-list'), tickets.map((t) => html`
        <div class="batch-item">
            <span class="muted">Identifiant</span><b>${t.identifiant}</b>
            <span class="muted">Mot de passe</span><b>${t.mot_de_passe}</b>
        </div>`));
    $('#batch-reopen').hidden = false;
    $('#batch-dialog').showModal();
}
