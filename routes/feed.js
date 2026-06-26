const express = require("express")
const router = express.Router()
const Post = require("../models/Post")
const User = require("../models/User")
const Notification = require("../models/Notification")
const { requireAuth, requireNotRestricted } = require("../middleware/auth")
const { uploadPost } = require("../lib/cloudinary")
const { track } = require("../lib/analytics")
const { sendPushToUser, buildPayload } = require("../lib/webpush")

// Page d'accueil — Feed
router.get("/", requireAuth, async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.user.id)

        // Feed = mes posts + amis + abonnements. Fallback global si < 5 posts.
        const feedUserIds = [
            currentUser._id,
            ...(currentUser.amis || []),
            ...(currentUser.following || [])
        ]

        let rawPosts = await Post.find({ auteur: { $in: feedUserIds } })
            .populate("auteur", "nom photoProfil badges profileEffect")
            .populate("commentaires.auteur", "nom photoProfil badges profileEffect")
            .populate({
                path: "sharedFrom",
                populate: { path: "auteur", select: "nom photoProfil badges" }
            })
            .sort({ createdAt: -1 })
            .limit(50)

        if (rawPosts.filter(p => p.auteur != null).length < 5) {
            rawPosts = await Post.find()
                .populate("auteur", "nom photoProfil badges profileEffect")
                .populate("commentaires.auteur", "nom photoProfil badges profileEffect")
                .populate({
                    path: "sharedFrom",
                    populate: { path: "auteur", select: "nom photoProfil badges" }
                })
                .sort({ createdAt: -1 })
                .limit(50)
        }

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

        // =============================================
        // === ORACLE / ANALYTICS : tracker POST ===
        // =============================================
        await track(req.session.user.id, 'POST')

        // Diffuser le nouveau post en temps réel à tous les utilisateurs connectés
        if (global.io) {
            try {
                const populated = await Post.findById(newPost._id)
                    .populate("auteur", "nom photoProfil badges profileEffect")
                global.io.emit("new-post", populated)
            } catch (e) { console.error("Socket new-post:", e.message) }
        }

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
                const liker = await User.findById(userId, "nom")
                sendPushToUser(post.auteur.toString(), buildPayload("like", {
                    senderName: liker?.nom || "Quelqu'un",
                    senderId: userId,
                    content: post.contenu
                })).catch(() => {})
            }
        }

        await post.save()

        // =============================================
        // === ORACLE / ANALYTICS : tracker LIKE ===
        // =============================================
        await track(userId, 'LIKE')

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

        const currentUser = await User.findById(req.session.user.id)

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
            sendPushToUser(post.auteur.toString(), buildPayload("comment", {
                senderName: currentUser?.nom || "Quelqu'un",
                senderId: req.session.user.id,
                content: texte.trim()
            })).catch(() => {})
        }

        // =============================================
        // === ORACLE / ANALYTICS : tracker COMMENT ===
        // =============================================
        await track(req.session.user.id, 'COMMENT')

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

        // =============================================
        // === ORACLE / ANALYTICS : tracker SHARE ===
        // =============================================
        await track(req.session.user.id, 'SHARE')

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

        // Notification en arrière-plan — ne bloque pas la réponse
        if (originalPost.auteur._id.toString() !== req.session.user.id) {
            try {
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
            } catch (e) { console.error("Notif partage:", e.message) }
        }
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

module.exports = router
