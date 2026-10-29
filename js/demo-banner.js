import { showAlert } from './common.js';
import { DEMO_ADMIN, load, msOf, reset } from './demo-db.js';
import { confirmDialog } from './ui.js';

// Bandeau de la démo (pages admin et client) : rappelle que tout reste dans ce navigateur,
// permet de passer d'un espace à l'autre et de repartir des données de départ.
// Les formulaires de connexion sont pré-remplis pour que le visiteur n'ait rien à chercher.

const isAdmin = Boolean(document.getElementById('login-user'));

const bar = document.createElement('div');
bar.className = 'demo-bar';
bar.innerHTML = '<span>Démo : données fictives, enregistrées uniquement dans votre navigateur.</span>'
    + `<a class="btn btn-sm" href="${isAdmin ? '../user/' : '../admin/'}">${isAdmin ? 'Espace client' : 'Espace admin'}</a>`
    + '<button type="button" class="btn btn-ghost btn-sm" data-reset>Réinitialiser</button>';
document.body.prepend(bar);

bar.querySelector('[data-reset]').addEventListener('click', async () => {
    const ok = await confirmDialog({
        title: 'Réinitialiser la démo ?',
        message: 'Vos forfaits, tickets et connexions seront effacés et remplacés par les données de départ.',
        confirmLabel: 'Réinitialiser',
        danger: true,
    });
    if (!ok) return;
    reset();
    location.reload();
});

// Encart d'information placé sous les messages d'erreur du formulaire de connexion
function hint(message) {
    let el = document.getElementById('demo-hint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'demo-hint';
        document.getElementById('login-alert').after(el);
    }
    showAlert(el, message, 'info');
}

// Ticket proposé au visiteur : le plus récent encore utilisable (neuf, ou actif avec du temps et du volume).
// Juste après une génération dans l'espace admin, c'est donc un ticket du dernier lot.
function demoTicket() {
    const now = Date.now();
    return load().tickets
        .filter((t) => t.statut === 'neuf' || (t.statut === 'actif'
            && (t.date_expiration === null || msOf(t.date_expiration) > now)
            && (t.volume_restant === null || t.volume_restant > 0)))
        .sort((a, b) => b.id_ticket - a.id_ticket)[0] ?? null;
}

function fillClient() {
    const ticket = demoTicket();
    if (!ticket) {
        hint('Aucun ticket utilisable : générez-en un dans l\'espace admin.');
        return;
    }
    document.getElementById('ticket-id').value = ticket.identifiant;
    document.getElementById('ticket-pass').value = ticket.mot_de_passe;
    hint(`Ticket de démo pré-rempli : identifiant « ${ticket.identifiant} », mot de passe « ${ticket.mot_de_passe} ». D'autres tickets peuvent être générés dans l'espace admin.`);
}

if (isAdmin) {
    hint(`Compte de démo : identifiant « ${DEMO_ADMIN.login} », mot de passe « ${DEMO_ADMIN.password} ».`);
    document.getElementById('login-user').value = DEMO_ADMIN.login;
    document.getElementById('login-pass').value = DEMO_ADMIN.password;
} else {
    fillClient();
    // La page client vide le formulaire à chaque retour à l'écran de connexion (après une déconnexion…) :
    // on re-remplit juste après, avec un ticket à jour
    document.getElementById('login-form').addEventListener('reset', () => setTimeout(fillClient));
}
