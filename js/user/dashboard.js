import { get, post } from '../api.js';
import { showAlert } from '../common.js';
import { badgeStatut, dateHeure, duree, meterTone, nombre, prix, volume } from '../format.js';
import { icon } from '../icons.js';
import { $, handleError, html, setHTML, toast } from '../ui.js';

// Récapitulatif du client connecté.
// Le serveur est interrogé toutes les 15 s (ce qui maintient aussi la session active) ;
// entre deux appels, les compteurs avancent localement chaque seconde.

const POLL_MS = 15000;
const SEUIL_ALERTE = 10; // % restant à partir duquel on prévient le client

let data = null;
let receivedAt = 0;
let tickTimer = null;
let pollTimer = null;
let refreshing = false;
let onEnd = () => {};

export function start(initial, { onSessionEnd }) {
    stop();
    onEnd = onSessionEnd;
    update(initial);
    tickTimer = setInterval(tick, 1000);
    pollTimer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
}

export function stop() {
    clearInterval(tickTimer);
    clearInterval(pollTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    data = null;
}

// Retour sur l'onglet : on resynchronise tout de suite au lieu d'attendre le prochain appel
function onVisibility() {
    if (!document.hidden) refresh();
}

const elapsed = () => (performance.now() - receivedAt) / 1000;
const tempsRestant = () => (data.temps_restant_secondes == null ? null : data.temps_restant_secondes - elapsed());

export async function refresh() {
    if (refreshing || !data) return;
    refreshing = true;
    try {
        const r = await get('/me');
        if (data) update(r.data);
    } catch (error) {
        if (error.status === 401) end(endReason());
        else handleError(error);
    } finally {
        refreshing = false;
    }
}

// Mode démonstration : enregistre une consommation fictive
export async function simulateUsage() {
    const r = await post('/usage', { go: 0.25 });
    if (r.data.session_terminee) end(r.data.message);
    else {
        update(r.data);
        toast('250 Mo consommés', 'info');
    }
}

function end(message) {
    const callback = onEnd;
    stop();
    callback(message);
}

function endReason() {
    if (!data) return null;
    const t = tempsRestant();
    if (t != null && t <= 0) return 'Votre forfait a expiré. Achetez un nouveau ticket pour continuer à naviguer.';
    if (data.volume_restant_go != null && data.volume_restant_go <= 0) return 'Votre volume de données est épuisé.';
    return 'Votre connexion a été fermée (inactivité prolongée ou ticket désactivé). Reconnectez-vous si votre ticket est encore valable.';
}

function update(d) {
    data = d;
    receivedAt = performance.now();

    $('#d-forfait').textContent = d.forfait;
    $('#d-ident').textContent = d.identifiant;
    setHTML($('#d-statut'), badgeStatut(d.statut));

    // Données
    const volIllimite = d.volume_restant_go == null;
    const volEl = $('#d-vol');
    volEl.textContent = volIllimite ? 'Illimité' : volume(d.volume_restant_go);
    volEl.classList.toggle('infinite', volIllimite);
    setMeter($('#d-vol-meter'), volIllimite ? null : percent(d.volume_restant_go, d.volume_total_go));
    $('#d-vol-foot').textContent = volIllimite
        ? `${volume(d.volume_consomme_go)} consommés depuis l'activation`
        : `${volume(d.volume_consomme_go)} consommés sur ${volume(d.volume_total_go)}`;

    // Temps (la valeur et la jauge sont mises à jour par tick)
    $('#d-time-foot').textContent = d.date_expiration
        ? `Expire le ${dateHeure(d.date_expiration)}`
        : 'Votre forfait n\'a pas de limite de temps';

    const items = [
        { icon: 'clock', label: 'Connecté depuis', value: '', id: 'r-session' },
        { icon: 'data', label: 'Cette session', value: volume(d.session_volume_go) },
        { icon: 'data', label: 'Total consommé', value: volume(d.volume_consomme_go) },
        { icon: 'devices', label: 'Connexions', value: nombre(d.nb_connexions) },
        { icon: 'check', label: 'Activé le', value: dateHeure(d.date_premiere_connexion) },
        { icon: 'clock', label: 'Fin de validité', value: dateHeure(d.date_expiration, 'Aucune') },
        { icon: 'tag', label: 'Prix payé', value: prix(d.prix) },
        { icon: 'wifi', label: 'Appareil', value: d.adresse_mac },
    ];
    setHTML($('#d-recap'), items.map((item) => html`
        <div><dt>${icon(item.icon)} ${item.label}</dt><dd ${item.id ? html`id="${item.id}"` : ''}>${item.value}</dd></div>`));

    tick();
}

function tick() {
    if (!data) return;
    const t = tempsRestant();
    const timeEl = $('#d-time');
    timeEl.textContent = t == null ? 'Illimité' : duree(t);
    timeEl.classList.toggle('infinite', t == null);
    const timePct = t == null || !data.duree_totale_secondes ? null : percent(t, data.duree_totale_secondes);
    setMeter($('#d-time-meter'), timePct);

    $('#r-session').textContent = duree(data.session_duree_secondes + elapsed());

    // Alerte quand il reste peu de données ou de temps
    const volPct = data.volume_restant_go == null ? null : percent(data.volume_restant_go, data.volume_total_go);
    const alerts = [];
    if (volPct != null && volPct <= SEUIL_ALERTE) alerts.push(`il vous reste moins de ${SEUIL_ALERTE} % de vos données`);
    if (timePct != null && timePct <= SEUIL_ALERTE) alerts.push(`votre forfait expire dans ${duree(t)}`);
    showAlert($('#d-alert'), alerts.length ? `Attention : ${alerts.join(' et ')}.` : '', 'warn');

    // Temps écoulé : le serveur confirme l'expiration (une seule requête grâce au verrou "refreshing")
    if (t != null && t <= 0) refresh();
}

function percent(reste, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, (reste / total) * 100));
}

function setMeter(meter, pct) {
    meter.hidden = pct == null;
    if (pct == null) return;
    meter.className = 'meter ' + meterTone(pct);
    meter.firstElementChild.style.width = pct + '%';
}
