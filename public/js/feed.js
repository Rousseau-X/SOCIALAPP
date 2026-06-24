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
