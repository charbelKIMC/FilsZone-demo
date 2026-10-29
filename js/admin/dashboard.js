import { get } from '../api.js';
import { badgeStatut, jourCourt, nombre, prix, STATUTS, volume } from '../format.js';
import { icon } from '../icons.js';
import { $, handleError, html, setHTML, withBusy } from '../ui.js';
import { setBadge } from './store.js';

const REFRESH_MS = 30000;
let timer = null;

export function init() {
    $('#dash-refresh').addEventListener('click', (event) => withBusy(event.currentTarget, load));
}

export function show() {
    load();
    timer = setInterval(() => !document.hidden && load(), REFRESH_MS);
}

export function hide() {
    clearInterval(timer);
}

async function load() {
    try {
        const { data } = await get('/admin/stats');
        render(data);
    } catch (error) {
        handleError(error);
    }
}

function render(d) {
    const aujourdhui = d.ventes_7_jours.at(-1) ?? { tickets: 0, revenu: 0 };
    const semaine = d.ventes_7_jours.reduce((acc, j) => ({ tickets: acc.tickets + j.tickets, revenu: acc.revenu + j.revenu }), { tickets: 0, revenu: 0 });

    const kpis = [
        { icon: 'tag', label: 'Revenu total', value: prix(d.revenu_estime), sub: `${nombre(d.tickets_utilises)} tickets activés` },
        { icon: 'zap', label: "Aujourd'hui", value: prix(aujourdhui.revenu), sub: `${nombre(aujourdhui.tickets)} ticket(s) activé(s)` },
        { icon: 'devices', label: 'Connectés', value: nombre(d.sessions_en_cours), sub: 'appareils en ce moment' },
        { icon: 'ticket', label: 'Tickets neufs', value: nombre(d.tickets_par_statut.neuf), sub: 'prêts à être vendus' },
        { icon: 'data', label: 'Données', value: volume(d.volume_total_consomme_go, '0 Go'), sub: 'consommées au total' },
    ];
    setHTML($('#dash-kpis'), kpis.map((k) => html`
        <article class="card kpi">
            <div class="kpi-label"><span class="kpi-icon">${icon(k.icon)}</span>${k.label}</div>
            <div class="kpi-value">${k.value}</div>
            <div class="kpi-sub">${k.sub}</div>
        </article>`));

    renderBars(d.ventes_7_jours);
    $('#dash-week-total').textContent = `${prix(semaine.revenu)} · ${nombre(semaine.tickets)} tickets`;
    renderStatuts(d.tickets_par_statut);
    renderForfaits(d.par_forfait);

    setBadge('connexions', d.sessions_en_cours);
    $('#dash-updated').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderBars(jours) {
    const max = Math.max(1, ...jours.map((j) => j.revenu));
    setHTML($('#dash-bars'), jours.map((j, i) => html`
        <div class="bar ${i === jours.length - 1 ? 'today' : ''}" title="${jourCourt(j.jour)} : ${prix(j.revenu)} (${j.tickets} tickets)">
            <span class="bar-value">${j.revenu ? nombre(j.revenu) : ''}</span>
            <span class="bar-fill" style="height:${Math.round((j.revenu / max) * 100)}%"></span>
            <span class="bar-label">${jourCourt(j.jour)}</span>
        </div>`));
}

function renderStatuts(parStatut) {
    const total = Object.values(parStatut).reduce((a, b) => a + b, 0);
    const tone = (statut) => STATUTS[statut].tone || 'mut';
    if (!total) {
        setHTML($('#dash-statuts'), html`<div class="empty">${icon('ticket')}<p>Aucun ticket généré pour l'instant.</p></div>`);
        return;
    }
    setHTML($('#dash-statuts'), html`
        <div class="stack" role="img" aria-label="Répartition des tickets par statut">
            ${Object.entries(parStatut).map(([s, n]) => n ? html`<span class="tone-${tone(s)}" style="width:${(n / total) * 100}%"></span>` : '')}
        </div>
        <ul class="legend">
            ${Object.entries(parStatut).map(([s, n]) => html`
                <li><span class="dot tone-${tone(s)}"></span>${badgeStatut(s)}<b>${nombre(n)}</b></li>`)}
            <li class="legend-total"><span>Total</span><b>${nombre(total)}</b></li>
        </ul>`);
}

function renderForfaits(rows) {
    if (!rows.length) {
        setHTML($('#dash-forfaits'), html`<div class="empty"><p>Aucun forfait.</p></div>`);
        return;
    }
    setHTML($('#dash-forfaits'), html`
        <table>
            <thead><tr><th>Forfait</th><th class="num">Générés</th><th class="num">Activés</th><th>Taux d'activation</th><th class="num">Revenu</th></tr></thead>
            <tbody>${rows.map((f) => {
                const taux = f.generes ? Math.round((f.utilises / f.generes) * 100) : 0;
                return html`<tr>
                    <td><b>${f.nom}</b></td>
                    <td class="num">${nombre(f.generes)}</td>
                    <td class="num">${nombre(f.utilises)}</td>
                    <td><div class="vol-cell"><div class="meter sm"><span style="width:${taux}%"></span></div><span class="muted small">${taux} %</span></div></td>
                    <td class="num"><b>${prix(f.revenu)}</b></td>
                </tr>`;
            })}</tbody>
        </table>`);
}
