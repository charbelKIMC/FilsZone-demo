import { CONFIG } from '../../config.js';
import { loadLogo } from '../common.js';
import { prix, validite, volume } from '../format.js';
import { $, html, setHTML } from '../ui.js';

// Impression : un ticket à découper par code (3 par ligne), voir @media print dans style.css
export async function printTickets(batch) {
    if (!batch) return;
    const { forfait, tickets } = batch;
    const logo = await loadLogo('page');
    const details = `${forfait.volume_go == null ? 'Données illimitées' : volume(forfait.volume_go)} · ${validite(forfait.duree_validite)}`;
    setHTML($('#print-area'), tickets.map((t) => html`
        <div class="print-ticket">
            <div class="pt-zone">${logo ? html`<img class="pt-logo" src="${logo}" alt="">` : ''}${CONFIG.zone.nom}</div>
            <div class="pt-forfait">${forfait.nom} — ${prix(forfait.prix)}<br>${details}</div>
            <div class="pt-codes">
                <span>Identifiant</span><b>${t.identifiant}</b>
                <span>Mot de passe</span><b>${t.mot_de_passe}</b>
            </div>
            <div class="pt-help">${CONFIG.zone.instructions}</div>
        </div>`));
    window.print();
}

// Une cellule commençant par = + - @ serait exécutée comme formule par Excel : on la neutralise
function cell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
}

export function exportCsv(batch) {
    if (!batch) return;
    const { forfait, tickets, date } = batch;
    const lines = [
        ['identifiant', 'mot_de_passe', 'forfait', 'prix'],
        ...tickets.map((t) => [t.identifiant, t.mot_de_passe, forfait.nom, forfait.prix]),
    ].map((row) => row.map(cell).join(';'));

    const stamp = date.toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    link.download = `tickets-${stamp}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
