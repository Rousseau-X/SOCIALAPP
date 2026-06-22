// ============================================================
// STORIES — BARRE + OVERLAY
// ============================================================

let currentStoryIndex = 0;
let storiesList = [];
let storyTimer = null;

// Récupérer l'ID de l'utilisateur courant
const currentUserId = document.querySelector('[data-user-id]')?.dataset.userId || '';

// Charger les stories depuis le serveur
async function loadStories() {
    try {
        console.log('📥 Chargement des stories...');
        const res = await fetch('/api/stories');
        const data = await res.json();
        console.log('📥 Stories reçues :', data.stories.length);
        storiesList = data.stories || [];
        renderStoriesBar();
    } catch (e) {
        console.error('❌ Erreur chargement stories:', e);
    }
}

// Afficher la barre de stories
function renderStoriesBar() {
    const bar = document.getElementById('storiesBar');
    if (!bar) {
        console.log('❌ Barre de stories introuvable');
        return;
    }

    // Garder le bouton "Ajouter"
    const addBtn = bar.querySelector('.story-add-btn');
    bar.innerHTML = '';
    bar.appendChild(addBtn);

    if (storiesList.length === 0) {
        console.log('📭 Aucune story à afficher');
        return;
    }

    storiesList.forEach((story, index) => {
        const isSeen = story.vues.includes(currentUserId);
        const item = document.createElement('div');
        item.className = 'story-item';
        item.innerHTML = `
            <div class="story-avatar ${isSeen ? 'seen' : ''}">
                <img src="${story.auteur.photoProfil}" alt="">
            </div>
            <div class="story-name">${story.auteur.nom}</div>
        `;
        item.addEventListener('click', () => openStory(index));
        bar.appendChild(item);
    });
    console.log('✅ Stories affichées');
}

// Ouvrir une story en overlay
function openStory(index) {
    currentStoryIndex = index;
    const story = storiesList[index];
    if (!story) return;

    const overlay = document.getElementById('storyOverlay');
    const media = document.getElementById('storyMedia');
    const authorName = document.getElementById('storyAuthorName');
    const authorAvatar = document.getElementById('storyAuthorAvatar');
    const viewCount = document.getElementById('storyViewCount');
    const progressContainer = document.getElementById('storyProgress');

    media.src = story.media;
    media.alt = `Story de ${story.auteur.nom}`;
    authorName.textContent = story.auteur.nom;
    authorAvatar.src = story.auteur.photoProfil;
    viewCount.textContent = story.vues.length || 0;

    progressContainer.innerHTML = `
        <div class="story-progress-bar active">
            <div class="fill" style="animation-duration: 5s;"></div>
        </div>
    `;

    overlay.classList.add('active');

    // Marquer comme vue
    fetch(`/api/stories/${story._id}/view`, { method: 'POST' });

    // Timer : passer à la suivante après 5s
    clearTimeout(storyTimer);
    storyTimer = setTimeout(() => {
        nextStory();
    }, 5000);
}

function nextStory() {
    const next = currentStoryIndex + 1;
    if (next < storiesList.length) {
        openStory(next);
    } else {
        closeStory();
    }
}

function closeStory() {
    clearTimeout(storyTimer);
    document.getElementById('storyOverlay').classList.remove('active');
}

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    console.log('📸 Initialisation des stories');
    loadStories();

    const addBtn = document.getElementById('addStoryBtn');
    const fileInput = document.getElementById('storyInput');

    if (addBtn && fileInput) {
        addBtn.addEventListener('click', () => {
            console.log('🖱️ Clic sur Ajouter une story');
            fileInput.click();
        });

        fileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) {
                console.log('❌ Aucun fichier sélectionné');
                return;
            }
            console.log('📤 Upload story :', file.name);

            const formData = new FormData();
            formData.append('media', file);

            try {
                const res = await fetch('/api/stories/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    console.log('✅ Story uploadée avec succès');
                    loadStories();
                } else {
                    console.error('❌ Erreur upload:', data.error);
                    alert('Erreur : ' + data.error);
                }
            } catch (err) {
                console.error('❌ Erreur réseau:', err);
                alert('Erreur réseau');
            }
            fileInput.value = '';
        });
    } else {
        console.log('❌ Bouton Ajouter ou input introuvable');
    }

    document.getElementById('storyClose')?.addEventListener('click', closeStory);
    document.getElementById('storyOverlay')?.addEventListener('click', function(e) {
        if (e.target === this) closeStory();
    });
});

console.log('📦 stories.js chargé');
