import { CONFIG } from '../config.js';
import { html } from './ui.js';

// Mise en forme française des nombres, volumes, prix, dates et durées

const nombre2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nombre0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pad = (n) => String(n).padStart(2, '0');

export const nombre = (n) => nombre0.format(n ?? 0);

// Moins de 1 Go : affichage en Mo (plus parlant pour un client)
export function volume(go, illimite = 'Illimité') {
    if (go == null) return illimite;
    if (go > 0 && go < 1) return `${nombre0.format(go * 1000)} Mo`;
    return `${nombre2.format(go)} Go`;
}

export const prix = (montant) => `${nombre0.format(montant ?? 0)} ${CONFIG.devise}`;

// MySQL renvoie "2026-10-28 17:58:05" (heure locale du serveur)
export function parseDate(sql) {
    return sql ? new Date(sql.replace(' ', 'T')) : null;
}

export function dateHeure(sql, vide = '—') {
    const d = parseDate(sql);
    if (!d) return vide;
    const memeAnnee = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: memeAnnee ? undefined : 'numeric' })
        + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function jourCourt(isoDate) {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

// Compte à rebours : "2 j 4 h 05 min", "4 h 05 min 09 s", "5 min 09 s"
export function duree(secondes, illimite = 'Illimité') {
    if (secondes == null) return illimite;
    const s = Math.max(0, Math.floor(secondes));
    const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (j) return `${j} j ${h} h ${pad(m)} min`;
    if (h) return `${h} h ${pad(m)} min ${pad(sec)} s`;
    if (m) return `${m} min ${pad(sec)} s`;
    return `${sec} s`;
}

// Version sans secondes pour les tableaux
export function dureeCourte(secondes) {
    const s = Math.max(0, Math.floor(secondes ?? 0));
    const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (j) return `${j} j ${h} h`;
    if (h) return `${h} h ${pad(m)}`;
    return `${m} min`;
}

// Validité d'un forfait (en heures) : 24 → "24 heures", 168 → "1 semaine", 720 → "1 mois"
export function validite(heures, illimite = 'Sans limite de temps') {
    if (heures == null) return illimite;
    const pluriel = (n, mot) => `${n} ${mot}${n > 1 && !mot.endsWith('s') ? 's' : ''}`;
    if (heures % 720 === 0) return `${heures / 720} mois`;
    if (heures % 168 === 0) return pluriel(heures / 168, 'semaine');
    if (heures > 24 && heures % 24 === 0) return pluriel(heures / 24, 'jour');
    return pluriel(heures, 'heure');
}

export const STATUTS = {
    neuf: { label: 'Neuf', tone: 'info' },
    actif: { label: 'Actif', tone: 'ok' },
    epuise: { label: 'Épuisé', tone: 'warn' },
    expire: { label: 'Expiré', tone: '' },
    desactive: { label: 'Désactivé', tone: 'err' },
};

export function badgeStatut(statut) {
    const s = STATUTS[statut] ?? { label: statut, tone: '' };
    return html`<span class="badge ${s.tone}">${s.label}</span>`;
}

// Couleur d'une jauge selon le pourcentage restant
export function meterTone(pourcent) {
    if (pourcent <= 10) return 'err';
    if (pourcent <= 30) return 'warn';
    return '';
}
