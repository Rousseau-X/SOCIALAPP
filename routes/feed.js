const express = require("express")
const router = express.Router()
const Post = require("../models/Post")
const User = require("../models/User")
const Notification = require("../models/Notification")
const { requireAuth, requireNotRestricted } = require("../middleware/auth")
const { uploadPost } = require("../lib/cloudinary")

// Page d'accueil — Feed
router.get("/", requireAuth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.user.id)

        const rawPosts = await Post.find()
            .populate("auteur", "nom photoProfil badges profileEffect")
            .populate("commentaires.auteur", "nom photoProfil badges profileEffect")
            .populate({
                path: "sharedFrom",
                populate: { path: "auteur", select: "nom photoProfil badges" }
            })
            .sort({ createdAt: -1 })
            .limit(50)

        const posts = rawPosts.filter(p => p.auteur != null)
        const demandesCount = currentUser.demandesRecues.length

        res.render("feed", {
            title: "Accueil",
            currentPage: "feed",
            posts,
            currentUserId: currentUser._id.toString(),
            demandesCount
        })
    } catch (err) {
        console.error(err)
        res.send("❌ Erreur lors du chargement du feed")
    }
})

// Publier un post
router.post("/post", requireAuth, requireNotRestricted("posts"), uploadPost.single("image"), async (req, res) => {
    try {
        const { contenu } = req.body

        if (!contenu || contenu.trim().length === 0) {
            req.flash("error", "Le contenu ne peut pas être vide.")
            return res.redirect("/")
        }

        const newPost = new Post({
            auteur: req.session.user.id,
            contenu: contenu.trim(),
            image: req.file ? req.file.path : null
        })

        await newPost.save()
        res.redirect("/")
    } catch (err) {
        console.error(err)
        req.flash("error", "Erreur lors de la publication.")
        res.redirect("/")
    }
})

// Supprimer un post
router.post("/post/:id/delete", requireAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)

        if (!post) return res.redirect("/")

        if (post.auteur.toString() !== req.session.user.id) {
            req.flash("error", "Tu ne peux pas supprimer ce post.")
            return res.redirect("/")
        }

        await Post.findByIdAndDelete(req.params.id)
        res.redirect("/")
    } catch (err) {
        console.error(err)
        res.redirect("/")
    }
})

// Like / Unlike un post (AJAX)
router.post("/post/:id/like", requireAuth, requireNotRestricted("likes"), async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
        if (!post) return res.status(404).json({ error: "Post introuvable" })

        const userId = req.session.user.id
        const alreadyLiked = post.likes.some(id => id.toString() === userId)

        if (alreadyLiked) {
            post.likes = post.likes.filter(id => id.toString() !== userId)
        } else {
            post.likes.push(userId)

            if (post.auteur.toString() !== userId) {
                const notification = await Notification.create({
                    destinataire: post.auteur,
                    expediteur: userId,
                    type: "like",
                    lien: "/"
                })
                if (global.io) {
                    const notifComplete = await Notification.findById(notification._id)
                        .populate("expediteur", "nom photoProfil")
                    global.io.to(post.auteur.toString()).emit("notification", notifComplete)
                }
            }
        }

        await post.save()

        res.json({
            success: true,
            likesCount: post.likes.length,
            liked: !alreadyLiked
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Erreur serveur" })
    }
})

// Ajouter un commentaire (AJAX)
router.post("/post/:id/comment", requireAuth, requireNotRestricted("messages"), async (req, res) => {
    try {
        const { texte } = req.body
        if (!texte || texte.trim().length === 0) {
            return res.status(400).json({ error: "Commentaire vide" })
        }

        const post = await Post.findById(req.params.id)
        if (!post) return res.status(404).json({ error: "Post introuvable" })

        post.commentaires.push({
            auteur: req.session.user.id,
            texte: texte.trim()
        })

        await post.save()

        if (post.auteur.toString() !== req.session.user.id) {
            const notification = await Notification.create({
                destinataire: post.auteur,
                expediteur: req.session.user.id,
                type: "commentaire",
                lien: "/"
            })
            if (global.io) {
                const notifComplete = await Notification.findById(notification._id)
                    .populate("expediteur", "nom photoProfil")
                global.io.to(post.auteur.toString()).emit("notification", notifComplete)
            }
        }

        const currentUser = await User.findById(req.session.user.id)

        res.json({
            success: true,
            commentsCount: post.commentaires.length,
            comment: {
                auteur: {
                    nom: currentUser.nom,
                    photoProfil: currentUser.photoProfil
                },
                texte: texte.trim()
            }
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Erreur serveur" })
    }
})

// Partager un post (AJAX)
router.post("/post/:id/share", requireAuth, requireNotRestricted("posts"), async (req, res) => {
    try {
        const { message } = req.body
        const originalPost = await Post.findById(req.params.id)
            .populate("auteur", "nom photoProfil badges")

        if (!originalPost) {
            return res.status(404).json({ error: "Publication introuvable." })
        }

        const alreadyShared = await Post.findOne({
            auteur: req.session.user.id,
            sharedFrom: originalPost._id,
            isShared: true
        })

        if (alreadyShared) {
            return res.status(400).json({ error: "Tu as déjà partagé cette publication." })
        }

        const sharedPost = await Post.create({
            auteur: req.session.user.id,
            contenu: message?.trim() || "",
            isShared: true,
            sharedFrom: originalPost._id,
            shareMessage: message?.trim() || ""
        })

        await Post.findByIdAndUpdate(originalPost._id, { $inc: { sharesCount: 1 } })
        await User.findByIdAndUpdate(req.session.user.id, { $inc: { xp: 3 } })

        if (originalPost.auteur._id.toString() !== req.session.user.id) {
            const notification = await Notification.create({
                destinataire: originalPost.auteur._id,
                expediteur: req.session.user.id,
                type: "partage",
                lien: "/"
            })
            if (global.io) {
                const notifComplete = await Notification.findById(notification._id)
                    .populate("expediteur", "nom photoProfil")
                global.io.to(originalPost.auteur._id.toString()).emit("notification", notifComplete)
            }
        }

        const populated = await Post.findById(sharedPost._id)
            .populate("auteur", "nom photoProfil badges")
            .populate({
                path: "sharedFrom",
                populate: { path: "auteur", select: "nom photoProfil badges" }
            })

        res.json({
            success: true,
            post: populated,
            sharesCount: originalPost.sharesCount + 1
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Erreur serveur" })
    }
})

// Nombre de partages d'un post (AJAX)
router.get("/post/:id/shares", requireAuth, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
        if (!post) return res.status(404).json({ error: "Publication introuvable." })
        res.json({ success: true, sharesCount: post.sharesCount || 0 })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Erreur serveur" })
    }
})

// Route /feed
router.get("/feed", requireAuth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.user.id)

        const rawPosts = await Post.find()
            .populate("auteur", "nom photoProfil badges profileEffect")
            .populate("commentaires.auteur", "nom photoProfil badges profileEffect")
            .populate({
                path: "sharedFrom",
                populate: { path: "auteur", select: "nom photoProfil badges" }
            })
            .sort({ createdAt: -1 })
            .limit(50)

        const posts = rawPosts.filter(p => p.auteur != null)
        const demandesCount = currentUser.demandesRecues.length

        res.render("feed", {
            title: "Accueil",
            currentPage: "feed",
            posts,
            currentUserId: currentUser._id.toString(),
            demandesCount
        })
    } catch (err) {
        console.error(err)
        req.flash("error", "Erreur lors du chargement du feed.")
        res.redirect("/login")
    }
})
// ============================================================
// STORIES — Tout en un (à ajouter en bas de feed.js)
// ============================================================

let currentStoryGroups = [];
let currentGroupIndex = 0;
let currentStoryIndex = 0;
let storyTimer = null;
const STORY_DURATION = 5000;
const storyColors = ["#4f46e5","#7c3aed","#db2777","#dc2626","#d97706","#16a34a","#0891b2","#0f172a"];
let selectedColor = storyColors[0];
let selectedFile = null;

// ============================================================
// CHARGEMENT ET AFFICHAGE
// ============================================================

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

    // Garder le bouton statique
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

// ============================================================
// VISIONNEUSE DE STORY
// ============================================================

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

    // Barres de progression
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

    // Header
    document.getElementById("story-author-avatar").src = group.user.photoProfil;
    document.getElementById("story-author-name").textContent = group.user.nom;
    document.getElementById("story-time").textContent = "à l'instant";

    // Média
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

    // Texte
    const textEl = document.getElementById("story-text-overlay");
    textEl.textContent = story.texte || "";
    textEl.style.display = story.texte ? "block" : "none";

    // Vues
    document.getElementById("story-views-count").textContent = story.vues?.length || 0;

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
}

// ============================================================
// CRÉATEUR DE STORY
// ============================================================

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

// ============================================================
// INITIALISATION
// ============================================================

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
});

console.log("📸 Stories chargées (depuis feed.js)");
module.exports = router
