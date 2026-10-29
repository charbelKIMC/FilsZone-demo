// Base de données de la démo : un objet JSON gardé dans le localStorage du navigateur.
// Même structure que les tables MySQL du projet complet (administrateur, forfait, ticket, session_wifi).
// Rien ne part sur un serveur : chaque visiteur a sa propre démo, invisible pour les autres.
// Le localStorage (plutôt qu'une simple variable) permet aux pages admin et client de partager
// les mêmes données, et de les retrouver après un rechargement.

const KEY = 'fz.demo.db';
const VERSION = 1;
const H = 3600 * 1000;
const D = 24 * H;

export const DEMO_ADMIN = { login: 'demo', password: 'demo' };

// Forfaits de départ : les mêmes que le script SQL du projet complet
const FORFAITS = [
    { nom: '2 Go', prix: 100, volume_go: 2, duree_validite: null },
    { nom: '3 Go', prix: 150, volume_go: 3, duree_validite: null },
    { nom: '5 Go', prix: 200, volume_go: 5, duree_validite: null },
    { nom: 'Illimité 24 h', prix: 300, volume_go: null, duree_validite: 24 },
    { nom: 'Illimité semaine', prix: 2000, volume_go: null, duree_validite: 168 },
    { nom: 'Illimité mois', prix: 3500, volume_go: null, duree_validite: 720 },
    { nom: '2 Go journalier', prix: 100, volume_go: 2, duree_validite: 24 },
    { nom: '5 Go journalier', prix: 150, volume_go: 5, duree_validite: 24 },
];

// Si le stockage est bloqué (navigation privée stricte…), la démo marche quand même, le temps de la page
let memory = null;

export function load() {
    try {
        const db = JSON.parse(localStorage.getItem(KEY));
        if (db?.version === VERSION) return db;
    } catch { /* stockage indisponible ou illisible */ }
    if (memory) return structuredClone(memory);
    const db = seed();
    save(db);
    return db;
}

export function save(db) {
    memory = structuredClone(db);
    try {
        localStorage.setItem(KEY, JSON.stringify(db));
    } catch { /* on garde la copie en mémoire */ }
}

export function reset() {
    memory = null;
    try {
        localStorage.removeItem(KEY);
    } catch { /* rien à effacer */ }
}

// ---------- Dates : même format que MySQL ("2026-10-28 17:58:05", heure locale) ----------
const pad = (n) => String(n).padStart(2, '0');

export function sqlDate(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const sqlDay = (ms) => sqlDate(ms).slice(0, 10);
export const msOf = (sql) => new Date(sql.replace(' ', 'T')).getTime();

// ---------- Aléatoire ----------
// Sans I, O, 0, 1 pour éviter les confusions à la lecture d'un ticket imprimé
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length) {
    // 32 symboles : 2^32 est un multiple de 32, le tirage reste uniforme
    return Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export function randomMac() {
    return Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => n.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

// Adresse fictive sur le réseau du hotspot, stable pour un même appareil
export function ipFromMac(mac) {
    return `10.5.50.${(parseInt(mac.slice(-2), 16) % 250) + 2}`;
}

export const round3 = (n) => Math.round(n * 1000) / 1000;
const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (list) => list[rnd(0, list.length - 1)];

// ---------- Données de départ : une semaine d'activité fictive ----------
function seed() {
    const now = Date.now();
    const db = {
        version: VERSION,
        next: { forfait: FORFAITS.length + 1, ticket: 1, session: 1 },
        admin: { id_admin: 1, ...DEMO_ADMIN },
        forfaits: FORFAITS.map((f, i) => ({ id_forfait: i + 1, ...f })),
        tickets: [],
        sessions: [],
        auth: { admin: null, client: null },
    };

    const newTicket = (forfait, creation) => {
        const ticket = {
            id_ticket: db.next.ticket++,
            identifiant: randomCode(8),
            mot_de_passe: randomCode(6),
            statut: 'neuf',
            date_creation: sqlDate(creation),
            date_premiere_connexion: null,
            date_expiration: null,
            volume_restant: forfait.volume_go,
            prix_vente: forfait.prix,
            id_forfait: forfait.id_forfait,
        };
        db.tickets.push(ticket);
        return ticket;
    };

    // Forfaits les plus vendus en premier : ils reviennent plus souvent dans l'historique
    const populaires = [1, 1, 4, 4, 7, 7, 2, 3, 8, 5];
    const debutJour = (ms) => new Date(new Date(ms).toDateString()).getTime();

    for (let jour = 6; jour >= 0; jour--) {
        for (let i = rnd(2, 5); i > 0; i--) {
            const forfait = db.forfaits[pick(populaires) - 1];
            let debut = debutJour(now - jour * D) + rnd(7, 21) * H + rnd(0, 59) * 60000;
            if (debut > now - 20 * 60000) debut = now - rnd(20, 180) * 60000;

            const ticket = newTicket(forfait, debut - rnd(1, 48) * H);
            ticket.statut = 'actif';
            ticket.date_premiere_connexion = sqlDate(debut);
            const expiration = forfait.duree_validite ? debut + forfait.duree_validite * H : null;
            ticket.date_expiration = expiration ? sqlDate(expiration) : null;

            // Une ou deux connexions passées (toutes terminées, avant l'expiration)
            const toutConsommer = forfait.volume_go != null && Math.random() < 0.25;
            const nb = rnd(1, 2);
            let t = debut;
            for (let k = 0; k < nb; k++) {
                const fin = Math.min(t + rnd(15, 90) * 60000, now - 60000, expiration ?? Infinity);
                if (fin <= t) break;
                let go;
                if (forfait.volume_go == null) go = round3(Math.random() * 2);
                else if (toutConsommer && k === nb - 1) go = ticket.volume_restant;
                else go = round3(Math.min(ticket.volume_restant, forfait.volume_go * Math.random() * 0.4));
                if (ticket.volume_restant != null) ticket.volume_restant = round3(ticket.volume_restant - go);

                const mac = randomMac();
                db.sessions.push({
                    id_session: db.next.session++,
                    id_ticket: ticket.id_ticket,
                    date_debut: sqlDate(t),
                    date_fin: sqlDate(fin),
                    derniere_activite: sqlDate(fin),
                    adresse_mac: mac,
                    adresse_ip: ipFromMac(mac),
                    volume_utilise: go,
                });
                t = fin + rnd(1, 6) * H;
                if (t >= now) break;
            }

            if (expiration && expiration <= now) ticket.statut = 'expire';
            else if (ticket.volume_restant != null && ticket.volume_restant <= 0) ticket.statut = 'epuise';
        }
    }

    // Quelques tickets neufs prêts à être vendus, et un ticket désactivé
    for (const id of [1, 1, 4, 4, 7, 2]) newTicket(db.forfaits[id - 1], now - rnd(1, 10) * H);
    newTicket(db.forfaits[2], now - 3 * D).statut = 'desactive';

    return db;
}
