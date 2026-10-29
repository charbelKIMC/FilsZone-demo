import { del, patch, post } from '../api.js';
import { showAlert } from '../common.js';
import { nombre, prix, validite, volume } from '../format.js';
import { icon } from '../icons.js';
import { $, confirmDialog, handleError, html, setHTML, toast, withBusy } from '../ui.js';
import { getForfaits, invalidateForfaits } from './store.js';

let list = [];
let editing = null; // forfait en cours de modification (null = création)

export function init() {
    $('#forfait-new').addEventListener('click', () => openForm(null));
    $('#forfait-form').addEventListener('submit', submit);

    $('#forfaits-list').addEventListener('click', (event) => {
        const edit = event.target.closest('[data-edit]');
        const remove = event.target.closest('[data-delete]');
        if (edit) openForm(list.find((f) => f.id_forfait === Number(edit.dataset.edit)));
        if (remove) destroy(Number(remove.dataset.delete), remove);
    });
}

export function show() {
    load();
}

export function hide() {}

async function load() {
    try {
        list = await getForfaits({ force: true });
        render();
    } catch (error) {
        handleError(error);
    }
}

function render() {
    if (!list.length) {
        setHTML($('#forfaits-list'), html`
            <div class="card empty">${icon('tag')}<p>Aucun forfait. Créez votre première offre.</p></div>`);
        return;
    }
    setHTML($('#forfaits-list'), list.map((f) => html`
        <article class="card plan">
            <div class="plan-head">
                <h3>${f.nom}</h3>
                <span class="plan-price">${prix(f.prix)}</span>
            </div>
            <ul class="plan-specs">
                <li>${icon('data')} ${f.volume_go == null ? 'Données illimitées' : volume(f.volume_go)}</li>
                <li>${icon('clock')} ${validite(f.duree_validite)}</li>
                <li>${icon('ticket')} ${f.nb_tickets ? `${nombre(f.nb_tickets)} ticket(s) générés` : 'Aucun ticket généré'}</li>
            </ul>
            <div class="plan-foot">
                <button class="btn btn-ghost btn-sm" data-edit="${f.id_forfait}">${icon('edit')} Modifier</button>
                <button class="btn btn-ghost btn-sm danger" data-delete="${f.id_forfait}"
                    ${f.nb_tickets ? html`disabled title="Impossible : ce forfait a déjà des tickets"` : ''}>${icon('trash')} Supprimer</button>
            </div>
        </article>`));
}

function openForm(forfait) {
    editing = forfait;
    const locked = Boolean(forfait?.nb_tickets);
    $('#forfait-title').textContent = forfait ? 'Modifier le forfait' : 'Nouveau forfait';
    $('#f-nom').value = forfait?.nom ?? '';
    $('#f-prix').value = forfait?.prix ?? '';
    $('#f-volume').value = forfait?.volume_go ?? '';
    $('#f-duree').value = forfait?.duree_validite ?? '';
    $('#f-volume').disabled = locked;
    $('#f-duree').disabled = locked;
    $('#forfait-lock').hidden = !locked;
    showAlert($('#forfait-error'), '');
    $('#forfait-dialog').showModal();
    $('#f-nom').focus();
}

async function submit(event) {
    event.preventDefault();
    const numberOrNull = (value) => (value.trim() === '' ? null : Number(value));
    const payload = {
        nom: $('#f-nom').value.trim(),
        prix: numberOrNull($('#f-prix').value),
    };
    if (!editing?.nb_tickets) {
        payload.volume_go = numberOrNull($('#f-volume').value);
        payload.duree_validite = numberOrNull($('#f-duree').value);
    }

    // Vérifications immédiates (le serveur revérifie tout)
    const error =
        !payload.nom ? 'Donnez un nom au forfait.' :
        payload.prix == null || payload.prix < 0 ? 'Indiquez un prix valide.' :
        !editing?.nb_tickets && payload.volume_go == null && payload.duree_validite == null
            ? 'Un forfait doit avoir au moins une limite : un volume ou une durée.' : '';
    if (error) {
        showAlert($('#forfait-error'), error);
        return;
    }

    try {
        await withBusy($('#forfait-submit'), () => editing
            ? patch(`/admin/forfaits/${editing.id_forfait}`, payload)
            : post('/admin/forfaits', payload));
        $('#forfait-dialog').close();
        toast(editing ? 'Forfait modifié' : 'Forfait créé', 'ok');
        invalidateForfaits();
        load();
    } catch (err) {
        if (err.status !== 401) showAlert($('#forfait-error'), err.message);
    }
}

async function destroy(id, button) {
    const forfait = list.find((f) => f.id_forfait === id);
    const ok = await confirmDialog({
        title: 'Supprimer le forfait ?',
        message: `« ${forfait.nom} » sera définitivement supprimé.`,
        confirmLabel: 'Supprimer',
        danger: true,
    });
    if (!ok) return;
    try {
        await withBusy(button, () => del(`/admin/forfaits/${id}`));
        toast('Forfait supprimé', 'ok');
        invalidateForfaits();
        load();
    } catch (error) {
        handleError(error);
    }
}
