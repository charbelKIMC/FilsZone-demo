import { ipFromMac, load, msOf, randomCode, round3, save, sqlDate, sqlDay } from './demo-db.js';

// ============================================================
// API de la démo : aucune requête réseau, aucun serveur.
// Chaque appel est traité ici, dans le navigateur, avec les mêmes routes, les mêmes règles
// et les mêmes messages d'erreur que l'API PHP du projet complet (public/index.php).
// Le reste du front ne voit aucune différence : il appelle toujours get(), post(), patch(), del().
// ============================================================

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

// Petit délai : les boutons affichent leur état « en cours » comme avec un vrai serveur
const LATENCE_MS = 150;

const fail = (message, status) => {
    throw new ApiError(message, status);
};

// ---------- Routeur ----------
const routes = [];

function route(method, path, handler) {
    // /admin/tickets/{id}/desactiver  =>  regex avec un groupe nommé "id"
    const pattern = new RegExp('^' + path.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)') + '$');
    routes.push({ method, pattern, handler });
}

export async function api(path, { method = 'GET', body, query, signal } = {}) {
    await new Promise((resolve) => setTimeout(resolve, LATENCE_MS));
    if (signal?.aborted) throw new DOMException('Requête annulée', 'AbortError');

    const candidates = routes.filter((r) => r.pattern.test(path));
    const found = candidates.find((r) => r.method === method);
    const db = load();
    try {
        if (!found) fail(candidates.length ? 'Méthode non autorisée' : 'Route introuvable', candidates.length ? 405 : 404);
        const result = found.handler({
            db,
            body: body ?? {},
            query: queryParams(query),
            params: path.match(found.pattern).groups ?? {},
        });
        // Copie : la page ne doit jamais modifier les données « en base » par mégarde
        return structuredClone(result);
    } catch (error) {
        if (error.status === 401) document.dispatchEvent(new CustomEvent('api:unauthorized', { detail: { path } }));
        throw error;
    } finally {
        // Comme en PHP, ce qui a été écrit avant une erreur reste écrit (ex. ticket passé en « expire »)
        save(db);
    }
}

export const get = (path, query) => api(path, { query });
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });

// Comme dans l'URL d'une vraie requête : valeurs vides ignorées, tout le reste en texte
function queryParams(query) {
    return Object.fromEntries(Object.entries(query ?? {})
        .filter(([, value]) => value !== '' && value != null)
        .map(([key, value]) => [key, String(value)]));
}

// Pagination : ?page=2&per_page=20 (per_page limité à 100)
function pagination(query) {
    const page = Math.max(1, parseInt(query.page ?? 1, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(query.per_page ?? 20, 10) || 20));
    return { page, perPage };
}

const paginate = (rows, { page, perPage }) => ({
    data: rows.slice((page - 1) * perPage, page * perPage),
    total: rows.length,
    page,
    per_page: perPage,
});

// ---------- Contrôle d'accès ----------
function requireAdmin(db) {
    if (!db.auth.admin) fail('Authentification requise', 401);
}

// La connexion du client n'est valable que si sa session Wi-Fi est encore ouverte
function requireClient(db) {
    const client = db.auth.client;
    if (client) {
        // Ferme d'abord les sessions expirées, épuisées ou inactives depuis trop longtemps
        refreshStatuses(db);
        const session = findSession(db, client.session_id);
        if (session && session.date_fin === null && session.id_ticket === client.ticket_id) {
            session.derniere_activite = sqlDate(Date.now());
            return client;
        }
    }
    db.auth.client = null;
    fail('Connexion requise ou session terminée', 401);
}

// ---------- Accès aux données ----------
const findForfait = (db, id) => db.forfaits.find((f) => f.id_forfait === id) ?? null;
const findTicket = (db, id) => db.tickets.find((t) => t.id_ticket === id) ?? null;
const findSession = (db, id) => db.sessions.find((s) => s.id_session === id) ?? null;
const countTickets = (db, idForfait) => db.tickets.filter((t) => t.id_forfait === idForfait).length;
const secondsBetween = (debut, fin) => Math.floor((msOf(fin) - msOf(debut)) / 1000);
const nowSql = () => sqlDate(Date.now());

function closeSession(session, fin = nowSql()) {
    if (session.date_fin === null) session.date_fin = fin;
}

// ============================================================
// Règles des tickets (TicketService)
// ============================================================
const STATUTS = ['neuf', 'actif', 'epuise', 'expire', 'desactive'];
const SESSION_INACTIVITE_MINUTES = 15;

// Ticket + infos du forfait + temps restant, comme la requête SELECT de TicketRepository
function ticketView(db, ticket) {
    const forfait = findForfait(db, ticket.id_forfait);
    return {
        ...ticket,
        forfait: forfait.nom,
        volume_total: forfait.volume_go,
        duree_validite: forfait.duree_validite,
        secondes_restantes: ticket.date_expiration === null
            ? null
            : Math.floor((msOf(ticket.date_expiration) - Date.now()) / 1000),
    };
}

// Met à jour les statuts (expire / epuise) et ferme les sessions devenues invalides ou inactives
function refreshStatuses(db) {
    const now = Date.now();
    for (const ticket of db.tickets) {
        if (ticket.statut !== 'actif') continue;
        if (ticket.date_expiration !== null && msOf(ticket.date_expiration) <= now) ticket.statut = 'expire';
        else if (ticket.volume_restant !== null && ticket.volume_restant <= 0) ticket.statut = 'epuise';
    }
    closeOrphans(db);

    const limite = now - SESSION_INACTIVITE_MINUTES * 60000;
    for (const session of db.sessions) {
        if (session.date_fin === null && msOf(session.derniere_activite) < limite) {
            // La fin retenue est la dernière activité (jamais avant le début)
            closeSession(session, msOf(session.derniere_activite) > msOf(session.date_debut) ? session.derniere_activite : session.date_debut);
        }
    }
}

// Ferme les sessions encore ouvertes dont le ticket est expiré, épuisé ou désactivé
function closeOrphans(db) {
    const now = Date.now();
    for (const session of db.sessions) {
        if (session.date_fin !== null) continue;
        const ticket = findTicket(db, session.id_ticket);
        if (!['expire', 'epuise', 'desactive'].includes(ticket.statut)) continue;
        let fin = now;
        if (ticket.statut === 'expire' && ticket.date_expiration !== null) fin = Math.min(now, msOf(ticket.date_expiration));
        closeSession(session, sqlDate(Math.max(msOf(session.date_debut), fin)));
    }
}

// Lance une erreur si le ticket ne peut plus servir (règle : temps ET volume doivent rester)
function assertUsable(db, ticket) {
    const view = ticketView(db, ticket);
    if (ticket.statut === 'desactive') fail('Ticket désactivé', 403);
    if (ticket.statut === 'expire') fail('Ticket expiré', 403);
    if (ticket.statut === 'epuise') fail('Volume épuisé', 403);
    if (view.secondes_restantes !== null && view.secondes_restantes <= 0) {
        ticket.statut = 'expire';
        fail('Ticket expiré', 403);
    }
    if (ticket.volume_restant !== null && ticket.volume_restant <= 0) {
        ticket.statut = 'epuise';
        fail('Volume épuisé', 403);
    }
}

// ============================================================
// Administrateur
// ============================================================
route('POST', '/admin/login', ({ db, body }) => {
    const login = String(body.login ?? '').trim();
    const password = String(body.password ?? '');
    if (!login || !password) fail('Identifiant et mot de passe requis', 422);
    if (login !== db.admin.login || password !== db.admin.password) fail('Identifiants incorrects', 401);
    db.auth.admin = db.admin.id_admin;
    return { message: 'Connexion réussie', admin: { id_admin: db.admin.id_admin, login: db.admin.login } };
});

route('POST', '/admin/logout', ({ db }) => {
    requireAdmin(db);
    db.auth.admin = null;
    return { message: 'Déconnecté' };
});

route('GET', '/admin/me', ({ db }) => {
    requireAdmin(db);
    return { admin: { id_admin: db.admin.id_admin, login: db.admin.login } };
});

// ---------- Forfaits (ForfaitService) ----------
const FORFAIT_FIELDS = ['nom', 'prix', 'volume_go', 'duree_validite'];
const PRIX_MAX = 99999999.99;
const VOLUME_MAX = 999999.99;
const DUREE_MAX = 87600; // 10 ans en heures

const isNumeric = (v) => (typeof v === 'number' && Number.isFinite(v))
    || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const pickFields = (input) => Object.fromEntries(FORFAIT_FIELDS.filter((k) => k in input).map((k) => [k, input[k]]));
const sortForfaits = (a, b) => a.prix - b.prix || a.nom.localeCompare(b.nom, 'fr');

function validateForfait(input) {
    const nom = String(input.nom ?? '').trim();
    if (!nom || nom.length > 50) fail('Nom requis (50 caractères maximum)', 422);

    if (!isNumeric(input.prix) || Number(input.prix) < 0 || Number(input.prix) > PRIX_MAX) fail('Prix invalide', 422);

    const volume = input.volume_go ?? null;
    if (volume !== null && (!isNumeric(volume) || Number(volume) <= 0 || Number(volume) > VOLUME_MAX)) {
        fail('Volume invalide (nombre supérieur à 0 ou vide)', 422);
    }

    const duree = input.duree_validite ?? null;
    if (duree !== null && (!isNumeric(duree) || !Number.isInteger(Number(duree)) || duree < 1 || duree > DUREE_MAX)) {
        fail('Durée invalide (heures, entier supérieur à 0 ou vide)', 422);
    }

    if (volume === null && duree === null) fail('Un forfait doit avoir un volume ou une durée', 422);

    return {
        nom,
        prix: Number(input.prix),
        volume_go: volume === null ? null : Number(volume),
        duree_validite: duree === null ? null : Number(duree),
    };
}

// Le nom est unique, sans tenir compte des majuscules ni des accents (comme l'index UNIQUE MySQL)
function assertNomLibre(db, nom, exceptId = null) {
    const pris = db.forfaits.some((f) => f.id_forfait !== exceptId && f.nom.localeCompare(nom, 'fr', { sensitivity: 'base' }) === 0);
    if (pris) fail('Un forfait porte déjà ce nom', 409);
}

const forfaitPublic = ({ id_forfait, nom, prix, volume_go, duree_validite }) => ({ id_forfait, nom, prix, volume_go, duree_validite });

route('GET', '/admin/forfaits', ({ db }) => {
    requireAdmin(db);
    // nb_tickets : l'interface s'en sert pour bloquer la suppression et la modification des limites
    return { data: [...db.forfaits].sort(sortForfaits).map((f) => ({ ...forfaitPublic(f), nb_tickets: countTickets(db, f.id_forfait) })) };
});

route('POST', '/admin/forfaits', ({ db, body }) => {
    requireAdmin(db);
    const data = validateForfait({ volume_go: null, duree_validite: null, ...pickFields(body) });
    assertNomLibre(db, data.nom);
    const forfait = { id_forfait: db.next.forfait++, ...data };
    db.forfaits.push(forfait);
    return { data: forfaitPublic(forfait) };
});

// PATCH : on part du forfait existant et on remplace seulement les champs envoyés
route('PATCH', '/admin/forfaits/{id}', ({ db, body, params }) => {
    requireAdmin(db);
    const forfait = findForfait(db, Number(params.id)) ?? fail('Forfait introuvable', 404);
    const data = validateForfait({ ...forfait, ...pickFields(body) });

    // Les tickets déjà générés ont été vendus avec ces limites : on ne les change plus
    const limitesModifiees = data.volume_go !== forfait.volume_go || data.duree_validite !== forfait.duree_validite;
    if (limitesModifiees && countTickets(db, forfait.id_forfait) > 0) {
        fail('Ce forfait a déjà des tickets : son volume et sa durée ne peuvent plus être modifiés (créez un nouveau forfait)', 409);
    }
    assertNomLibre(db, data.nom, forfait.id_forfait);
    Object.assign(forfait, data);
    return { data: forfaitPublic(forfait) };
});

route('DELETE', '/admin/forfaits/{id}', ({ db, params }) => {
    requireAdmin(db);
    const forfait = findForfait(db, Number(params.id)) ?? fail('Forfait introuvable', 404);
    if (countTickets(db, forfait.id_forfait) > 0) fail('Ce forfait a déjà des tickets, il ne peut pas être supprimé', 409);
    db.forfaits.splice(db.forfaits.indexOf(forfait), 1);
    return { message: 'Forfait supprimé' };
});

// ---------- Tickets ----------
const MAX_PAR_LOT = 100;

// Retourne les identifiants et mots de passe : l'admin les imprime ou les exporte
route('POST', '/admin/tickets/generer', ({ db, body }) => {
    requireAdmin(db);
    const forfait = findForfait(db, Math.trunc(Number(body.id_forfait) || 0)) ?? fail('Forfait introuvable', 404);
    const quantite = Math.trunc(Number(body.quantite) || 0);
    if (quantite < 1 || quantite > MAX_PAR_LOT) fail(`La quantité doit être comprise entre 1 et ${MAX_PAR_LOT}`, 422);

    const used = new Set(db.tickets.map((t) => t.identifiant));
    const created = [];
    while (created.length < quantite) {
        const identifiant = randomCode(8);
        if (used.has(identifiant)) continue;
        used.add(identifiant);
        const ticket = {
            id_ticket: db.next.ticket++,
            identifiant,
            mot_de_passe: randomCode(6),
            statut: 'neuf',
            date_creation: nowSql(),
            date_premiere_connexion: null,
            date_expiration: null,
            volume_restant: forfait.volume_go,
            prix_vente: forfait.prix,
            id_forfait: forfait.id_forfait,
        };
        db.tickets.push(ticket);
        created.push({ identifiant, mot_de_passe: ticket.mot_de_passe, forfait: forfait.nom });
    }
    return { data: created };
});

// Filtres : statut exact et/ou début d'identifiant (recherche)
route('GET', '/admin/tickets', ({ db, query }) => {
    requireAdmin(db);
    const statut = query.statut ?? null;
    let recherche = query.q?.trim() || null;
    if (statut !== null && !STATUTS.includes(statut)) fail('Statut invalide', 422);
    if (recherche !== null) {
        recherche = recherche.toUpperCase();
        if (!/^[A-Z0-9]{1,20}$/.test(recherche)) fail('Recherche invalide (lettres et chiffres uniquement)', 422);
    }

    refreshStatuses(db);
    const rows = db.tickets
        .filter((t) => (statut === null || t.statut === statut) && (recherche === null || t.identifiant.startsWith(recherche)))
        .sort((a, b) => b.id_ticket - a.id_ticket)
        .map((t) => {
            const v = ticketView(db, t);
            return {
                id_ticket: v.id_ticket, identifiant: v.identifiant, statut: v.statut, date_creation: v.date_creation,
                date_premiere_connexion: v.date_premiere_connexion, date_expiration: v.date_expiration,
                volume_restant: v.volume_restant, prix_vente: v.prix_vente, forfait: v.forfait, volume_total: v.volume_total,
            };
        });
    return paginate(rows, pagination(query));
});

route('PATCH', '/admin/tickets/{id}/desactiver', ({ db, params }) => {
    requireAdmin(db);
    const ticket = findTicket(db, Number(params.id)) ?? fail('Ticket introuvable', 404);
    ticket.statut = 'desactive';
    closeOrphans(db);
    return { data: { id_ticket: ticket.id_ticket, statut: 'desactive' } };
});

// ---------- Connexions ----------
route('GET', '/admin/sessions', ({ db, query }) => {
    requireAdmin(db);
    refreshStatuses(db);
    const enCours = query.en_cours === '1';
    const rows = db.sessions
        .filter((s) => !enCours || s.date_fin === null)
        .sort((a, b) => b.id_session - a.id_session)
        .map((s) => {
            const ticket = findTicket(db, s.id_ticket);
            return {
                id_session: s.id_session, identifiant: ticket.identifiant, forfait: findForfait(db, ticket.id_forfait).nom,
                date_debut: s.date_debut, date_fin: s.date_fin, adresse_mac: s.adresse_mac, adresse_ip: s.adresse_ip,
                volume_utilise: s.volume_utilise, duree_secondes: secondsBetween(s.date_debut, s.date_fin ?? nowSql()),
            };
        });
    return paginate(rows, pagination(query));
});

// L'admin coupe une connexion (le ticket reste utilisable, le client pourra se reconnecter)
route('PATCH', '/admin/sessions/{id}/fermer', ({ db, params }) => {
    requireAdmin(db);
    const session = findSession(db, Number(params.id)) ?? fail('Connexion introuvable', 404);
    if (session.date_fin !== null) fail('Cette connexion est déjà terminée', 409);
    closeSession(session);
    return { data: { id_session: session.id_session, terminee: true } };
});

// ---------- Statistiques ----------
route('GET', '/admin/stats', ({ db }) => {
    requireAdmin(db);
    refreshStatuses(db);

    const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
    db.tickets.forEach((t) => parStatut[t.statut]++);

    // Un ticket « utilisé » = connecté au moins une fois ; le revenu utilise le prix figé sur le ticket
    const utilises = db.tickets.filter((t) => t.date_premiere_connexion !== null);
    const somme = (list, fn) => list.reduce((total, x) => total + fn(x), 0);

    const parForfait = db.forfaits.map((f) => {
        const tickets = db.tickets.filter((t) => t.id_forfait === f.id_forfait);
        const actives = tickets.filter((t) => t.date_premiere_connexion !== null);
        return { nom: f.nom, generes: tickets.length, utilises: actives.length, revenu: somme(actives, (t) => t.prix_vente) };
    }).sort((a, b) => b.revenu - a.revenu || a.nom.localeCompare(b.nom, 'fr'));

    // Tickets activés et revenu par jour sur 7 jours, jours sans vente inclus (à 0)
    const ventes = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const jour = sqlDay(date.getTime());
        const duJour = utilises.filter((t) => t.date_premiere_connexion.startsWith(jour));
        ventes.push({ jour, tickets: duJour.length, revenu: somme(duJour, (t) => t.prix_vente) });
    }

    return {
        data: {
            tickets_par_statut: parStatut,
            sessions_en_cours: db.sessions.filter((s) => s.date_fin === null).length,
            volume_total_consomme_go: round3(somme(db.sessions, (s) => s.volume_utilise)),
            tickets_utilises: utilises.length,
            revenu_estime: somme(utilises, (t) => t.prix_vente),
            par_forfait: parForfait,
            ventes_7_jours: ventes,
        },
    };
});

// ============================================================
// Utilisateur (client du Wi-Fi) : ClientService
// ============================================================
const USAGE_MAX_GO = 1000;
const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

route('GET', '/forfaits', ({ db }) => ({ data: [...db.forfaits].sort(sortForfaits).map(forfaitPublic) }));

route('POST', '/login', ({ db, body }) => {
    const identifiant = String(body.identifiant ?? '').trim().toUpperCase();
    const password = String(body.password ?? '').trim().toUpperCase();
    let mac = String(body.mac ?? '');
    if (!identifiant || !password || !mac) fail('Identifiant, mot de passe et adresse MAC requis', 422);

    mac = mac.trim().replace(/-/g, ':').toUpperCase();
    if (!MAC_REGEX.test(mac)) fail('Adresse MAC invalide', 422);

    refreshStatuses(db);
    const ticket = db.tickets.find((t) => t.identifiant === identifiant);
    if (!ticket || ticket.mot_de_passe !== password) fail('Identifiant ou mot de passe incorrect', 401);
    assertUsable(db, ticket);

    // Un seul appareil à la fois par ticket : l'autre doit d'abord se déconnecter
    const open = db.sessions.filter((s) => s.id_ticket === ticket.id_ticket && s.date_fin === null).at(-1);
    if (open) {
        if (open.adresse_mac !== mac) fail('Ce ticket est déjà utilisé sur un autre appareil', 409);
        closeSession(open);
    }

    // Première connexion : démarre le décompte de la durée
    if (ticket.date_premiere_connexion === null) {
        const now = Date.now();
        const forfait = findForfait(db, ticket.id_forfait);
        ticket.date_premiere_connexion = sqlDate(now);
        ticket.date_expiration = forfait.duree_validite === null ? null : sqlDate(now + forfait.duree_validite * 3600000);
        ticket.statut = 'actif';
    }

    const session = {
        id_session: db.next.session++,
        id_ticket: ticket.id_ticket,
        date_debut: nowSql(),
        date_fin: null,
        derniere_activite: nowSql(),
        adresse_mac: mac,
        adresse_ip: ipFromMac(mac),
        volume_utilise: 0,
    };
    db.sessions.push(session);
    db.auth.client = { ticket_id: ticket.id_ticket, session_id: session.id_session };

    return { message: 'Connexion réussie', data: dashboard(db, ticket.id_ticket, session.id_session) };
});

route('GET', '/me', ({ db }) => {
    const client = requireClient(db);
    return { data: dashboard(db, client.ticket_id, client.session_id) };
});

// Consommation simulée (en Go) : dans un vrai hotspot, elle viendrait du routeur
route('POST', '/usage', ({ db, body }) => {
    const client = requireClient(db);
    let go = Number(body.go ?? 0) || 0;
    if (go <= 0 || go > USAGE_MAX_GO) fail(`Volume invalide (entre 0 et ${USAGE_MAX_GO} Go)`, 422);

    const ticket = usableTicket(db, client.ticket_id, client.session_id);
    const session = findSession(db, client.session_id);

    if (ticket.volume_restant !== null) go = Math.min(go, ticket.volume_restant);
    session.volume_utilise = round3(session.volume_utilise + go);

    if (ticket.volume_restant !== null) {
        ticket.volume_restant = round3(Math.max(ticket.volume_restant - go, 0));
        if (ticket.volume_restant <= 0) {
            ticket.statut = 'epuise';
            closeSession(session);
            return { data: { volume_restant_go: 0, session_terminee: true, message: 'Volume épuisé, vous êtes déconnecté' } };
        }
    }
    return { data: { ...dashboard(db, client.ticket_id, client.session_id), session_terminee: false } };
});

// Déconnexion : on ferme la session, le volume restant est conservé
route('POST', '/logout', ({ db }) => {
    const client = requireClient(db);
    closeSession(findSession(db, client.session_id));
    db.auth.client = null;
    return { message: 'Déconnecté' };
});

function usableTicket(db, ticketId, sessionId) {
    refreshStatuses(db);
    const ticket = findTicket(db, ticketId) ?? fail('Ticket introuvable', 404);
    try {
        assertUsable(db, ticket);
    } catch (error) {
        closeSession(findSession(db, sessionId));
        throw error;
    }
    return ticket;
}

function dashboard(db, ticketId, sessionId) {
    const ticket = ticketView(db, usableTicket(db, ticketId, sessionId));
    const session = findSession(db, sessionId) ?? fail('Session introuvable', 404);
    const sessions = db.sessions.filter((s) => s.id_ticket === ticketId);

    return {
        identifiant: ticket.identifiant,
        forfait: ticket.forfait,
        statut: ticket.statut,
        prix: ticket.prix_vente,
        volume_total_go: ticket.volume_total,
        volume_restant_go: ticket.volume_restant,
        volume_consomme_go: round3(sessions.reduce((total, s) => total + s.volume_utilise, 0)),
        duree_totale_secondes: ticket.duree_validite === null ? null : ticket.duree_validite * 3600,
        temps_restant_secondes: ticket.secondes_restantes,
        date_premiere_connexion: ticket.date_premiere_connexion,
        date_expiration: ticket.date_expiration,
        nb_connexions: sessions.length,
        session_debut: session.date_debut,
        session_duree_secondes: secondsBetween(session.date_debut, session.date_fin ?? nowSql()),
        session_volume_go: session.volume_utilise,
        adresse_mac: session.adresse_mac,
    };
}
