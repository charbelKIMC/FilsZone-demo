import { CONFIG } from '../../config.js';
import { get, post } from '../api.js';
import { initPage, showAlert } from '../common.js';
import { icon } from '../icons.js';
import { $, confirmDialog, handleError, html, setHTML, storage, toast, withBusy } from '../ui.js';
import * as dashboard from './dashboard.js';
import { loadOffres } from './offres.js';

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

// Adresse MAC : fournie par le routeur (?mac=...) sur un vrai hotspot ; simulée et mémorisée pour le prototype
function deviceMac() {
    let mac = (new URLSearchParams(location.search).get('mac') ?? '').toUpperCase().replace(/-/g, ':');
    if (!MAC_REGEX.test(mac)) mac = storage.get('wz.mac', '');
    if (!MAC_REGEX.test(mac)) {
        mac = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':').toUpperCase();
    }
    storage.set('wz.mac', mac);
    return mac;
}

const MAC = deviceMac();

function renderBanner() {
    const { zone } = CONFIG;
    $('#zone-slogan').textContent = zone.slogan;
    $('#zone-description').textContent = zone.description;
    setHTML($('#zone-infos'), zone.infos.map((info) => html`<li>${icon(info.icon)} ${info.texte}</li>`));
    $('#footer-year').textContent = new Date().getFullYear();
    $('#device-mac').textContent = MAC;
    $('#demo').hidden = !CONFIG.demo;
}

function showLogin(message, tone = 'info') {
    dashboard.stop();
    $('#view-dash').hidden = true;
    $('#view-login').hidden = false;
    $('#login-form').reset(); // les codes du ticket ne restent jamais affichés après une session
    showAlert($('#login-alert'), message, tone);
}

function showDashboard(data) {
    $('#view-login').hidden = true;
    $('#view-dash').hidden = false;
    showAlert($('#login-alert'), '');
    dashboard.start(data, { onSessionEnd: (message) => showLogin(message, 'warn') });
}

function bindEvents() {
    $('#login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const identifiant = $('#ticket-id').value.trim().toUpperCase();
        const password = $('#ticket-pass').value.trim().toUpperCase();
        if (!identifiant || !password) {
            showAlert($('#login-alert'), 'Saisissez l\'identifiant et le mot de passe inscrits sur votre ticket.');
            return;
        }
        try {
            const { data } = await withBusy(event.submitter, () => post('/login', { identifiant, password, mac: MAC }));
            showDashboard(data);
            toast('Connexion réussie, bonne navigation !', 'ok');
        } catch (error) {
            showAlert($('#login-alert'), error.message);
        }
    });

    $('#logout').addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Se déconnecter ?',
            message: 'Le crédit restant de votre ticket est conservé : vous pourrez vous reconnecter plus tard avec les mêmes codes.',
            confirmLabel: 'Se déconnecter',
        });
        if (!ok) return;
        try {
            await withBusy($('#logout'), () => post('/logout'));
        } catch (error) {
            handleError(error);
        }
        showLogin('Vous êtes déconnecté. Le crédit restant de votre ticket est conservé.', 'ok');
    });

    $('#demo-usage').addEventListener('click', (event) =>
        withBusy(event.currentTarget, dashboard.simulateUsage).catch(handleError));
}

async function start() {
    initPage();
    renderBanner();
    bindEvents();
    loadOffres($('#offres'));

    // Déjà connecté (page rechargée) : on reprend directement sur le récapitulatif
    try {
        const { data } = await get('/me');
        showDashboard(data);
    } catch {
        showLogin();
    }
}

start();
