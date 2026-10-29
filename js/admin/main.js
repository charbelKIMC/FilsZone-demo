import { CONFIG } from '../../config.js';
import { get, post } from '../api.js';
import { initPage, showAlert } from '../common.js';
import { $, $$, handleError, withBusy } from '../ui.js';
import * as dashboard from './dashboard.js';
import * as forfaits from './forfaits.js';
import * as tickets from './tickets.js';
import * as sessions from './sessions.js';

// Navigation par l'adresse (#/tickets…) : le rechargement et le bouton « retour » gardent la bonne page
const PAGES = {
    'tableau-de-bord': { title: 'Tableau de bord', module: dashboard },
    forfaits: { title: 'Forfaits', module: forfaits },
    tickets: { title: 'Tickets', module: tickets },
    connexions: { title: 'Connexions', module: sessions },
};
const DEFAULT_PAGE = 'tableau-de-bord';
let currentKey = null;

function showLogin(message) {
    PAGES[currentKey]?.module.hide();
    currentKey = null;
    $$('dialog[open]').forEach((d) => d.close());
    $('#app').hidden = true;
    $('#login').hidden = false;
    showAlert($('#login-alert'), message, 'info');
    document.title = `Administration · ${CONFIG.zone.nom}`;
    $('#login-user').focus();
}

function showApp(admin) {
    $('#admin-name').textContent = admin.login;
    $('#login').hidden = true;
    $('#app').hidden = false;
    route();
}

function route() {
    if ($('#app').hidden) return;
    let key = location.hash.replace(/^#\/?/, '');
    if (!PAGES[key]) key = DEFAULT_PAGE;
    if (key === currentKey) return;

    PAGES[currentKey]?.module.hide();
    currentKey = key;
    $$('.page').forEach((page) => (page.hidden = page.id !== 'page-' + key));
    $$('.nav a').forEach((a) => {
        const active = a.getAttribute('href') === '#/' + key;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    document.title = `${PAGES[key].title} · ${CONFIG.zone.nom}`;
    window.scrollTo(0, 0);
    PAGES[key].module.show();
}

function bindLogin() {
    $('#login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const login = $('#login-user').value.trim();
        const password = $('#login-pass').value;
        if (!login || !password) {
            showAlert($('#login-alert'), 'Saisissez votre identifiant et votre mot de passe.');
            return;
        }
        try {
            const { admin } = await withBusy(event.submitter, () => post('/admin/login', { login, password }));
            $('#login-pass').value = '';
            showAlert($('#login-alert'), '');
            showApp(admin);
        } catch (error) {
            showAlert($('#login-alert'), error.message);
        }
    });

    $('#logout').addEventListener('click', async () => {
        try {
            await post('/admin/logout');
        } catch (error) {
            handleError(error);
        }
        showLogin('Vous êtes déconnecté.');
    });
}

async function start() {
    initPage();
    bindLogin();
    Object.values(PAGES).forEach(({ module }) => module.init());
    window.addEventListener('hashchange', route);

    // Session expirée pendant l'utilisation : retour à la connexion (sauf pendant la connexion elle-même)
    document.addEventListener('api:unauthorized', (event) => {
        if (event.detail.path !== '/admin/login' && !$('#app').hidden) {
            showLogin('Votre session a expiré. Reconnectez-vous pour continuer.');
        }
    });

    try {
        const { admin } = await get('/admin/me');
        showApp(admin);
    } catch {
        showLogin();
    }
}

start();
