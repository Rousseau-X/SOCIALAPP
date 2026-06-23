// === LIKE (AJAX) ===
document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".like-btn")
    if (!btn) return

    const postId = btn.getAttribute("data-id")

    try {
        const res = await fetch(`/post/${postId}/like`, { method: "POST" })
        const data = await res.json()

        if (data.success) {
            btn.querySelector(".likes-count").innerText = data.likesCount
            if (data.liked) {
                btn.classList.add("liked")
            } else {
                btn.classList.remove("liked")
            }
        }
    } catch (err) {
        console.error("Erreur like :", err)
    }
})

// === COMMENTAIRE (AJAX) ===
document.addEventListener("submit", async (e) => {
    const form = e.target.closest(".ajax-comment-form")
    if (!form) return

    e.preventDefault()

    const postId = form.getAttribute("data-id")
    const input = form.querySelector("input[name='texte']")
    const texte = input.value.trim()
    if (!texte) return

    try {
        const res = await fetch(`/post/${postId}/comment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texte })
        })

        const data = await res.json()
        if (!data.success) return

        const commentsList = form.parentElement.querySelector(".comments-list")
        const commentEl = document.createElement("div")
        commentEl.className = "comment"
        commentEl.innerHTML = `
            <img src="${data.comment.auteur.photoProfil}" class="comment-avatar" alt="">
            <div class="comment-bubble">
                <div class="comment-author">${escapeHtml(data.comment.auteur.nom)}</div>
                <div>${escapeHtml(data.comment.texte)}</div>
            </div>
        `
        commentsList.appendChild(commentEl)

        const card = form.closest(".post")
        card.querySelector(".comments-count").innerText = data.commentsCount

        input.value = ""
    } catch (err) {
        console.error("Erreur commentaire :", err)
    }
})

function escapeHtml(text) {
    const div = document.createElement("div")
    div.innerText = text
    return div.innerHTML
}
// =============================================
// PARTAGE DE POST
// =============================================
let currentSharePostId = null

function openShareModal(postId) {
    currentSharePostId = postId
    const modal = document.getElementById("share-modal-overlay")
    modal.classList.add("active")
    document.body.style.overflow = "hidden"

    // Vider le champ message
    document.getElementById("share-message-input").value = ""
    document.getElementById("share-submit-btn").disabled = false
    document.getElementById("share-submit-btn").innerHTML = '<i class="fa-solid fa-share-nodes"></i> Partager'
}

function closeShareModal() {
    const modal = document.getElementById("share-modal-overlay")
    modal.classList.remove("active")
    document.body.style.overflow = ""
    currentSharePostId = null
}

async function submitShare() {
    if (!currentSharePostId) return

    const message = document.getElementById("share-message-input").value.trim()
    const btn = document.getElementById("share-submit-btn")

    btn.disabled = true
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Partage...'

    try {
        const res = await fetch(`/post/${currentSharePostId}/share`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        })

        const data = await res.json()

        if (data.success) {
            // Mettre à jour le compteur sur le post original
            const countEl = document.querySelector(`.share-count[data-id="${currentSharePostId}"] .shares-count`)
            if (countEl) countEl.innerText = data.sharesCount

            // Ajouter le nouveau post partagé en haut du feed
            const feedEl = document.querySelector(".feed")
            const firstPost = feedEl.querySelector(".post")
            const newPostEl = buildSharedPostElement(data.post)

            if (firstPost) {
                feedEl.insertBefore(newPostEl, firstPost)
            } else {
                feedEl.appendChild(newPostEl)
            }

            closeShareModal()
            showShareToast("Publication partagée !")
        } else {
            showShareToast(data.error || "Erreur", true)
            btn.disabled = false
            btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Partager'
        }
    } catch (e) {
        console.error("Erreur partage:", e)
        showShareToast("Erreur de connexion.", true)
        btn.disabled = false
        btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Partager'
    }
}

function buildSharedPostElement(post) {
    const div = document.createElement("div")
    div.className = "card post"
    div.setAttribute("data-id", post._id)

    const date = new Date(post.createdAt).toLocaleString("fr-FR", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    })

    const sharedDate = new Date(post.sharedFrom.createdAt).toLocaleString("fr-FR", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    })

    div.innerHTML = `
        <div class="post-header">
            <img src="${post.auteur.photoProfil}" class="post-avatar" alt="">
            <div>
                <div class="post-author">${escapeHtml(post.auteur.nom)}</div>
                <div class="post-date">${date}</div>
            </div>
        </div>

        ${post.shareMessage ? `<div class="share-message">${escapeHtml(post.shareMessage)}</div>` : ""}

        <div class="shared-post-preview">
            <div class="shared-post-header">
                <img src="${post.sharedFrom.auteur.photoProfil}" alt="">
                <div>
                    <div class="shared-post-author">${escapeHtml(post.sharedFrom.auteur.nom)}</div>
                    <div class="shared-post-date">${sharedDate}</div>
                </div>
            </div>
            <div class="shared-post-content">${escapeHtml(post.sharedFrom.contenu)}</div>
            ${post.sharedFrom.image ? `<img src="${post.sharedFrom.image}" class="shared-post-image" alt="">` : ""}
        </div>

        <div class="post-actions">
            <button class="like-btn" data-id="${post._id}">
                <i class="fa-solid fa-thumbs-up"></i>
                <span class="likes-count">0</span> J'aime
            </button>
            <button onclick="toggleComments('${post._id}')">
                <i class="fa-solid fa-comment"></i>
                <span class="comments-count">0</span> Commentaires
            </button>
            <button onclick="openShareModal('${post._id}')">
                <i class="fa-solid fa-share-nodes"></i>
                <span class="share-count" data-id="${post._id}">
                    <span class="shares-count">0</span>
                </span> Partager
            </button>
        </div>

        <div class="comments-section" id="comments-${post._id}" style="display:none;">
            <div class="comments-list"></div>
            <form class="comment-form ajax-comment-form" data-id="${post._id}">
                <input type="text" name="texte" placeholder="Écrire un commentaire..." required>
                <button type="submit">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    `
    return div
}

function showShareToast(message, isError = false) {
    const existing = document.getElementById("share-toast")
    if (existing) existing.remove()

    const toast = document.createElement("div")
    toast.id = "share-toast"
    toast.style.cssText = `
        position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
        background:${isError ? "#fee2e2" : "#dcfce7"};
        color:${isError ? "#dc2626" : "#16a34a"};
        border:1px solid ${isError ? "#fca5a5" : "#86efac"};
        padding:10px 20px; border-radius:8px; font-size:13px; font-weight:600;
        z-index:9999; white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,0.1);
    `
    toast.innerHTML = `<i class="fa-solid fa-${isError ? "circle-exclamation" : "circle-check"}"></i> ${message}`
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
}

// Fermer le modal si on clique en dehors
document.addEventListener("click", (e) => {
    if (e.target.id === "share-modal-overlay") {
        closeShareModal()
    }
})

// ============================================================
// STORIES — TOUT EN UN (À AJOUTER EN BAS DE feed.js)
// ============================================================

let currentStoryGroups = [];
let currentGroupIndex = 0;
let currentStoryIndex = 0;
let storyTimer = null;
const STORY_DURATION = 5000;
const storyColors = ["#4f46e5","#7c3aed","#db2777","#dc2626","#d97706","#16a34a","#0891b2","#0f172a"];
let selectedColor = storyColors[0];
let selectedFile = null;

async function loadStories() {
    try {
        const res = await fetch("/stories");
        const data = await res.json();
        if (data.success) {
            currentStoryGroups = data.groups || [];
        } else {
            currentStoryGroups = [];
        }
        renderStories();
    } catch (e) {
        console.error("Erreur loadStories:", e);
        currentStoryGroups = [];
        renderStories();
    }
}

function renderStories() {
    const container = document.getElementById("stories-container");
    if (!container) return;

    const addBtn = document.getElementById("addStoryStatic");
    container.innerHTML = "";
    container.appendChild(addBtn);

    if (currentStoryGroups.length === 0) return;

    currentStoryGroups.forEach((group, idx) => {
        const item = document.createElement("div");
        item.className = "story-item";
        const allSeen = !group.hasUnseen;
        item.innerHTML = `
            <div class="story-ring ${allSeen ? 'seen' : ''}">
                <div class="story-ring-inner"><img src="${group.user.photoProfil}" alt=""></div>
            </div>
            <div class="story-label">${group.user.nom.split(" ")[0]}</div>
        `;
        item.onclick = () => openStoryViewer(idx);
        container.appendChild(item);
    });
}

function openStoryViewer(groupIndex, storyIndex = 0) {
    currentGroupIndex = groupIndex;
    currentStoryIndex = storyIndex;
    document.getElementById("story-viewer-overlay").classList.add("active");
    showStory();
    document.body.style.overflow = "hidden";
}

function closeStoryViewer() {
    document.getElementById("story-viewer-overlay").classList.remove("active");
    stopStoryTimer();
    document.body.style.overflow = "";
}

function showStory() {
    stopStoryTimer();
    const group = currentStoryGroups[currentGroupIndex];
    if (!group) { closeStoryViewer(); return; }
    const story = group.stories[currentStoryIndex];
    if (!story) { closeStoryViewer(); return; }

    fetch(`/stories/${story._id}/view`, { method: "POST" });

    const progressContainer = document.getElementById("story-progress-container");
    progressContainer.innerHTML = "";
    group.stories.forEach((_, i) => {
        const seg = document.createElement("div");
        seg.className = "story-progress-segment";
        const fill = document.createElement("div");
        fill.className = "story-progress-fill";
        if (i < currentStoryIndex) fill.style.width = "100%";
        seg.appendChild(fill);
        progressContainer.appendChild(seg);
    });

    document.getElementById("story-author-avatar").src = group.user.photoProfil;
    document.getElementById("story-author-name").textContent = group.user.nom;
    document.getElementById("story-time").textContent = "à l'instant";

    const mediaContainer = document.getElementById("story-media-container");
    if (story.couleurFond) {
        mediaContainer.style.background = story.couleurFond;
        mediaContainer.innerHTML = "";
    } else if (story.mediaType === "video") {
        mediaContainer.style.background = "#000";
        mediaContainer.innerHTML = `<video src="${story.media}" autoplay muted playsinline style="width:100%;height:100%;object-fit:contain;"></video>`;
    } else {
        mediaContainer.style.background = "#000";
        mediaContainer.innerHTML = `<img src="${story.media}" style="width:100%;height:100%;object-fit:contain;" alt="">`;
    }

    const textEl = document.getElementById("story-text-overlay");
    textEl.textContent = story.texte || "";
    textEl.style.display = story.texte ? "block" : "none";
    document.getElementById("story-views-count").textContent = story.vues?.length || 0;

    const viewsCountEl = document.getElementById("storyViewsCount");
    viewsCountEl.onclick = () => toggleStoryViews(story._id);

    startStoryTimer();
}

function startStoryTimer() {
    const fills = document.querySelectorAll(".story-progress-fill");
    if (!fills[currentStoryIndex]) return;
    const fill = fills[currentStoryIndex];
    fill.style.transition = `width ${STORY_DURATION}ms linear`;
    fill.style.width = "100%";
    storyTimer = setTimeout(goToNextStory, STORY_DURATION);
}

function stopStoryTimer() {
    if (storyTimer) {
        clearTimeout(storyTimer);
        storyTimer = null;
    }
}

function goToNextStory() {
    const group = currentStoryGroups[currentGroupIndex];
    if (!group) { closeStoryViewer(); return; }
    if (currentStoryIndex < group.stories.length - 1) {
        currentStoryIndex++;
        showStory();
    } else if (currentGroupIndex < currentStoryGroups.length - 1) {
        currentGroupIndex++;
        currentStoryIndex = 0;
        showStory();
    } else {
        closeStoryViewer();
    }
}

function goToPrevStory() {
    if (currentStoryIndex > 0) {
        currentStoryIndex--;
        showStory();
    } else if (currentGroupIndex > 0) {
        currentGroupIndex--;
        currentStoryIndex = currentStoryGroups[currentGroupIndex].stories.length - 1;
        showStory();
    }
}

async function reactToStory(emoji) {
    const story = currentStoryGroups[currentGroupIndex]?.stories[currentStoryIndex];
    if (!story) return;
    await fetch(`/stories/${story._id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji })
    });
    showReactionAnimation(emoji);
}

function showReactionAnimation(emoji) {
    const overlay = document.getElementById("story-viewer-overlay");
    const el = document.createElement("div");
    el.style.cssText = `
        position:absolute; bottom:120px; left:50%; transform:translateX(-50%);
        font-size:48px; animation:storyReactionPop 1s ease forwards;
        z-index:20; pointer-events:none;
    `;
    el.innerText = emoji;
    overlay.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

async function toggleStoryViews(storyId) {
    const container = document.getElementById("story-views-list");
    if (!container) {
        const footer = document.getElementById("story-viewer-footer");
        const list = document.createElement("div");
        list.id = "story-views-list";
        list.style.cssText = `
            position:absolute; bottom:80px; left:0; right:0;
            max-height:200px; background:rgba(0,0,0,0.9);
            border-radius:12px 12px 0 0; padding:16px;
            z-index:20; overflow-y:auto; display:none;
            backdrop-filter:blur(8px);
        `;
        footer.parentNode.appendChild(list);
    }

    const listEl = document.getElementById("story-views-list");
    if (listEl.style.display === "block") {
        listEl.style.display = "none";
        return;
    }

    try {
        const res = await fetch(`/stories/${storyId}/viewers`);
        const data = await res.json();
        if (!data.success) return;
        const viewers = data.viewers || [];
        if (viewers.length === 0) {
            listEl.innerHTML = `<div style="color:rgba(255,255,255,0.6); text-align:center; padding:10px;">Aucune vue</div>`;
        } else {
            listEl.innerHTML = viewers.map(v => `
                <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); color:#fff;">
                    <img src="${v.user?.photoProfil || 'https://ui-avatars.com/api/?background=4f46e5&color=fff&name=' + v.user?.nom}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
                    <span style="font-size:13px;">${v.user?.nom || 'Inconnu'}</span>
                </div>
            `).join('');
        }
        listEl.style.display = "block";
    } catch (e) {
        console.error("Erreur chargement vues:", e);
    }
}

function openStoryCreator() {
    document.getElementById("story-creator-overlay").classList.add("active");
    document.body.style.overflow = "hidden";
    renderColorPicker();
}

function closeStoryCreator() {
    document.getElementById("story-creator-overlay").classList.remove("active");
    document.body.style.overflow = "";
    document.getElementById("story-file-input").value = "";
    document.getElementById("story-text-input").value = "";
    selectedFile = null;
    const preview = document.getElementById("story-preview-area");
    preview.style.background = selectedColor;
    preview.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.7);"><i class="fa-solid fa-image" style="font-size:32px; margin-bottom:8px; display:block;"></i><div style="font-size:13px;">Clique pour ajouter une photo ou vidéo</div></div>`;
}

function renderColorPicker() {
    const container = document.getElementById("story-color-picker");
    if (!container) return;
    container.innerHTML = "";
    storyColors.forEach(color => {
        const swatch = document.createElement("div");
        swatch.className = "story-color-swatch" + (color === selectedColor ? " selected" : "");
        swatch.style.background = color;
        swatch.onclick = () => {
            selectedColor = color;
            document.querySelectorAll(".story-color-swatch").forEach(s => s.classList.remove("selected"));
            swatch.classList.add("selected");
            if (!selectedFile) document.getElementById("story-preview-area").style.background = color;
        };
        container.appendChild(swatch);
    });
}

function handleStoryFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    selectedFile = file;
    const preview = document.getElementById("story-preview-area");
    const url = URL.createObjectURL(file);
    preview.innerHTML = file.type.startsWith("video/")
        ? `<video src="${url}" style="width:100%;height:100%;object-fit:cover;" autoplay muted loop></video>`
        : `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
    preview.style.background = "none";
}

async function publishStory() {
    const texte = document.getElementById("story-text-input").value.trim();
    const btn = document.getElementById("story-publish-btn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Publication...';
    try {
        let res;
        if (selectedFile) {
            const formData = new FormData();
            formData.append("media", selectedFile);
            if (texte) formData.append("texte", texte);
            formData.append("couleurFond", selectedColor);
            res = await fetch("/stories", { method: "POST", body: formData });
        } else if (texte) {
            res = await fetch("/stories/text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texte, couleurFond: selectedColor })
            });
        } else {
            alert("Ajoute une image ou un texte.");
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publier';
            return;
        }
        const data = await res.json();
        if (data.success) {
            closeStoryCreator();
            loadStories();
        } else {
            alert(data.error || "Erreur");
        }
    } catch (e) {
        alert("Erreur de connexion.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publier';
    }
}

document.addEventListener("DOMContentLoaded", function() {
    loadStories();

    document.getElementById("story-viewer-close")?.addEventListener("click", closeStoryViewer);
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") {
            closeStoryViewer();
            closeStoryCreator();
            closeShareModal();
        }
        if (e.key === "ArrowRight") goToNextStory();
        if (e.key === "ArrowLeft") goToPrevStory();
    });
    document.getElementById("share-modal-overlay")?.addEventListener("click", function(e) {
        if (e.target.id === "share-modal-overlay") closeShareModal();
    });

    if (!document.getElementById("storyReactionStyle")) {
        const style = document.createElement("style");
        style.id = "storyReactionStyle";
        style.textContent = `
            @keyframes storyReactionPop {
                0% { opacity:1; transform:translateX(-50%) scale(0.8); }
                50% { opacity:1; transform:translateX(-50%) translateY(-30px) scale(1.3); }
                100% { opacity:0; transform:translateX(-50%) translateY(-60px) scale(0.8); }
            }
        `;
        document.head.appendChild(style);
    }
});

console.log("📸 Stories chargées (depuis feed.js)");
