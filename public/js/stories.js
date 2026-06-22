let currentStoryIndex = 0;
let storiesList = [];
let storyTimer = null;

const currentUserId = document.querySelector('[data-user-id]')?.dataset.userId || '';

async function loadStories() {
    try {
        const res = await fetch('/api/stories');
        const data = await res.json();
        storiesList = data.stories || [];
        renderStoriesBar();
    } catch (e) {
        console.error('Erreur chargement stories:', e);
    }
}

function renderStoriesBar() {
    const bar = document.getElementById('storiesBar');
    if (!bar) return;

    // Vider complètement la barre en gardant le bouton "+"
    const addBtn = bar.querySelector('.story-add-btn');
    bar.innerHTML = '';
    bar.appendChild(addBtn);

    if (storiesList.length === 0) return;

    storiesList.forEach((story, index) => {
        const isSeen = story.vues && story.vues.includes(currentUserId);
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
}

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
    viewCount.textContent = story.vues ? story.vues.length : 0;

    progressContainer.innerHTML = `
        <div class="story-progress-bar active">
            <div class="fill" style="animation-duration: 5s;"></div>
        </div>
    `;

    overlay.classList.add('active');

    fetch(`/api/stories/${story._id}/view`, { method: 'POST' });

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

document.addEventListener('DOMContentLoaded', function() {
    loadStories();

    const addBtn = document.getElementById('addStoryBtn');
    const fileInput = document.getElementById('storyInput');

    if (addBtn && fileInput) {
        addBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('media', file);
            try {
                const res = await fetch('/api/stories/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    loadStories();
                } else {
                    alert('Erreur : ' + data.error);
                }
            } catch (err) {
                alert('Erreur réseau');
            }
            fileInput.value = '';
        });
    }

    document.getElementById('storyClose')?.addEventListener('click', closeStory);
    document.getElementById('storyOverlay')?.addEventListener('click', function(e) {
        if (e.target === this) closeStory();
    });
});
