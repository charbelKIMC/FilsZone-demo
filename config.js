// ============================================================
// Réglages de l'interface : c'est le seul fichier à modifier pour personnaliser la zone
// ============================================================
export const CONFIG = {
    // Version démo : pas d'API ni de serveur, tout est simulé dans le navigateur (voir js/api.js)

    devise: 'FCFA',

    // true : affiche le bouton « Simuler une consommation » côté client (prototype uniquement)
    demo: true,

    zone: {
        nom: 'FilsZone',
        // Logos (chemins relatifs aux pages admin/ et user/). Si un fichier manque, l'icône Wi-Fi s'affiche à la place.
        logos: {
            header: '../assets/logo-header.png', // bandeau client + menu admin
            page: '../assets/logo.png',          // écran de connexion admin, tickets imprimés, icône d'onglet
        },
        slogan: 'Internet haut débit, sans abonnement',
        description: 'Achetez un ticket, connectez-vous en quelques secondes et suivez votre consommation en direct.',
        // Bandeau de la page client : icônes disponibles dans js/icons.js
        // ⚠️ Valeurs d'exemple : remplacez-les par les vraies informations de votre zone
        infos: [
            { icon: 'zap', texte: 'Connexion haut débit' },
            { icon: 'clock', texte: 'Ouvert 7j/7, 24h/24' },
            { icon: 'ticket', texte: 'Tickets en vente au comptoir' },
            { icon: 'phone', texte: '+229 00 00 00 00' },
        ],
        // Rappel imprimé sur chaque ticket
        instructions: 'Connectez-vous au réseau Wi-Fi, puis saisissez ces codes sur la page de connexion.',
    },
};
