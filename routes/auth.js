const express = require("express")
const router = express.Router()
const bcrypt = require("bcryptjs")
const User = require("../models/User")
const Group = require("../models/Group")
const { redirectIfAuth } = require("../middleware/auth")
const { nomValide } = require("../lib/validation")
const assistant = require("../lib/assistant")
const crypto = require("crypto")
const { sendResetEmail } = require("../lib/email")
const { track } = require("../lib/analytics") // ← AJOUT

// =============================================
// PAGE DEMANDE DE RÉINITIALISATION
// =============================================
router.get("/forgot-password", redirectIfAuth, (req, res) => {
    res.render("forgot-password", {
        title: "Mot de passe oublié",
        error: req.flash("error"),
        success: req.flash("success")
    })
})

// =============================================
// ENVOI DU CODE PAR EMAIL
// =============================================
router.post("/forgot-password", redirectIfAuth, async (req, res) => {
    try {
        const { email } = req.body

        if (!email) {
            req.flash("error", "Veuillez entrer votre adresse email.")
            return res.redirect("/forgot-password")
        }

        const user = await User.findOne({ email: email.toLowerCase() })
        if (!user) {
            req.flash("error", "Aucun compte associé à cet email.")
            return res.redirect("/forgot-password")
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString()

        user.resetCode = code
        user.resetCodeExpires = Date.now() + 15 * 60 * 1000
        await user.save()

        await sendResetEmail(email, code)

        req.flash("success", "Un code de réinitialisation a été envoyé à votre email.")
        req.session.resetEmail = email
        res.redirect("/reset-password")

    } catch (err) {
        console.error("Erreur forgot-password:", err)
        req.flash("error", "Erreur lors de l'envoi du code. Veuillez réessayer.")
        res.redirect("/forgot-password")
    }
})

// =============================================
// PAGE SAISIE DU CODE + NOUVEAU MOT DE PASSE
// =============================================
router.get("/reset-password", redirectIfAuth, (req, res) => {
    if (!req.session.resetEmail) {
        req.flash("error", "Veuillez d'abord demander un code de réinitialisation.")
        return res.redirect("/forgot-password")
    }

    res.render("reset-password", {
        title: "Réinitialiser le mot de passe",
        email: req.session.resetEmail,
        error: req.flash("error"),
        success: req.flash("success")
    })
})

// =============================================
// VALIDER LE CODE ET CHANGER LE MOT DE PASSE
// =============================================
router.post("/reset-password", redirectIfAuth, async (req, res) => {
    try {
        const { code, motDePasse, confirmMotDePasse } = req.body

        if (!code || !motDePasse || !confirmMotDePasse) {
            req.flash("error", "Tous les champs sont obligatoires.")
            return res.redirect("/reset-password")
        }

        if (motDePasse !== confirmMotDePasse) {
            req.flash("error", "Les mots de passe ne correspondent pas.")
            return res.redirect("/reset-password")
        }

        if (motDePasse.length < 6) {
            req.flash("error", "Le mot de passe doit contenir au moins 6 caractères.")
            return res.redirect("/reset-password")
        }

        const email = req.session.resetEmail
        const user = await User.findOne({ email })

        if (!user) {
            req.flash("error", "Utilisateur introuvable.")
            return res.redirect("/forgot-password")
        }

        if (user.resetCode !== code) {
            req.flash("error", "Code invalide.")
            return res.redirect("/reset-password")
        }

        if (Date.now() > user.resetCodeExpires) {
            req.flash("error", "Le code a expiré. Veuillez en demander un nouveau.")
            return res.redirect("/forgot-password")
        }

        user.motDePasse = motDePasse
        user.resetCode = null
        user.resetCodeExpires = null
        await user.save()

        req.session.resetEmail = null
        req.flash("success", "Votre mot de passe a été réinitialisé avec succès !")
        res.redirect("/login")

    } catch (err) {
        console.error("Erreur reset-password:", err)
        req.flash("error", "Erreur lors de la réinitialisation. Veuillez réessayer.")
        res.redirect("/reset-password")
    }
})

// Assurer que les groupes système existent
async function ensureSystemGroups() {
    const adminUser = await User.findOne({ role: "admin", isBot: false })
    if (!adminUser) return null

    const groups = {}

    for (const cfg of [
        { key: "avis_solutions", nom: "Avis & Solutions", emoji: "💡", desc: "Feedback, entraide et suggestions" },
        { key: "primes", nom: "Primes", emoji: "💰", desc: "Annonces et quêtes pour gagner des crédits" }
    ]) {
        let grp = await Group.findOne({ systemGroupKey: cfg.key })
        if (!grp) {
            grp = await Group.create({
                nom: cfg.nom,
                createur: adminUser._id,
                membres: [{ user: adminUser._id, isAdmin: true }],
                inviteCode: crypto.randomBytes(6).toString("hex"),
                isPermanent: true,
                isSystemGroup: true,
                systemGroupKey: cfg.key,
                photo: `https://ui-avatars.com/api/?background=4f46e5&color=fff&name=${encodeURIComponent(cfg.emoji)}&bold=true`
            })
            console.log(`✅ Groupe système créé : ${cfg.nom}`)
        }
        groups[cfg.key] = grp
    }
    return groups
}

// Ajouter un utilisateur aux groupes système
async function addUserToSystemGroups(userId) {
    try {
        const systemGroups = await Group.find({ isSystemGroup: true })
        for (const grp of systemGroups) {
            const alreadyIn = grp.membres.some(m => m.user.toString() === userId.toString())
            if (!alreadyIn) {
                grp.membres.push({ user: userId, isAdmin: false })
                await grp.save()
            }
        }
    } catch (e) {
        console.error("Erreur addUserToSystemGroups:", e.message)
    }
}

// =============================================
// PAGE DE CONNEXION
// =============================================
router.get("/login", redirectIfAuth, (req, res) => {
    res.render("login", { title: "Connexion" })
})

// =============================================
// TRAITEMENT CONNEXION
// =============================================
router.post("/login", async (req, res) => {
    try {
        const { email, motDePasse } = req.body
        const user = await User.findOne({ email: email.toLowerCase() })

        if (!user) {
            req.flash("error", "Email ou mot de passe incorrect.")
            return res.redirect("/login")
        }

        const match = await bcrypt.compare(motDePasse, user.motDePasse)
        if (!match) {
            req.flash("error", "Email ou mot de passe incorrect.")
            return res.redirect("/login")
        }

        if (user.deletionReason && user.nom === "Compte supprimé") {
            return res.render("account-deleted", {
                title: "Compte supprimé",
                reason: user.deletionReason
            })
        }

        if (user.isDisabled) {
            return res.render("account-disabled", {
                title: "Compte désactivé",
                reason: user.disableReason || "Non spécifié",
                contact: user.disableContact || null
            })
        }

        req.session.user = {
            id: user._id,
            nom: user.nom,
            email: user.email,
            photoProfil: user.photoProfil,
            role: user.role,
            theme: user.theme || "default",
            isIncognitoInput: user.isIncognitoInput || false
        }

        user.enLigne = true
        await user.save()

        // =============================================
        // === ORACLE / ANALYTICS : tracker LOGIN ===
        // =============================================
        await track(user._id, 'LOGIN')

        try {
            await ensureSystemGroups()
            await addUserToSystemGroups(user._id)
        } catch(e) {}

        res.redirect("/")
    } catch (err) {
        console.error(err)
        req.flash("error", "Une erreur est survenue.")
        res.redirect("/login")
    }
})

// =============================================
// PAGE D'INSCRIPTION
// =============================================
router.get("/register", redirectIfAuth, (req, res) => {
    res.render("register", { title: "Inscription" })
})

// =============================================
// TRAITEMENT INSCRIPTION
// =============================================
router.post("/register", redirectIfAuth, async (req, res) => {
    try {
        const { nom, email, motDePasse, confirmMotDePasse } = req.body

        if (!nom || !email || !motDePasse) {
            req.flash("error", "Tous les champs sont requis.")
            return res.redirect("/register")
        }

        if (!nomValide(nom)) {
            req.flash("error", "Le nom ne doit contenir que des lettres, chiffres, espaces, tirets ou apostrophes (2 à 30 caractères).")
            return res.redirect("/register")
        }

        if (motDePasse !== confirmMotDePasse) {
            req.flash("error", "Les mots de passe ne correspondent pas.")
            return res.redirect("/register")
        }

        if (motDePasse.length < 6) {
            req.flash("error", "Le mot de passe doit contenir au moins 6 caractères.")
            return res.redirect("/register")
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() })
        if (existingUser) {
            req.flash("error", "Un compte existe déjà avec cet email.")
            return res.redirect("/register")
        }

        const humanCount = await User.countDocuments({ isBot: { $ne: true } })
        const role = humanCount === 0 ? "admin" : "user"

        const newUser = new User({
            nom: nom.trim(),
            email: email.toLowerCase(),
            motDePasse,
            role
        })
        await newUser.save()

        await assistant.sendWelcomeMessage(newUser._id)
        await ensureSystemGroups()
        await addUserToSystemGroups(newUser._id)

        newUser.walletBalance = 100
        newUser.xp = 10
        await newUser.save()

        // =============================================
        // === ORACLE / ANALYTICS : tracker REGISTER ===
        // =============================================
        await track(newUser._id, 'REGISTER')

        req.flash("success", "Compte créé avec succès ! Tu as reçu 100 crédits de bienvenue. Connecte-toi.")
        res.redirect("/login")
    } catch (err) {
        console.error(err)
        req.flash("error", "Une erreur est survenue.")
        res.redirect("/register")
    }
})

// =============================================
// DÉCONNEXION
// =============================================
router.get("/logout", async (req, res) => {
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user.id)
            if (user) {
                user.enLigne = false
                user.derniereConnexion = new Date()
                await user.save()
            }
        } catch (e) {}
    }
    req.session.destroy(() => { res.redirect("/login") })
})

module.exports = router
module.exports.ensureSystemGroups = ensureSystemGroups
module.exports.addUserToSystemGroups = addUserToSystemGroups
