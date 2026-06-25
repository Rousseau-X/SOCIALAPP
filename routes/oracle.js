const express = require("express")
const router = express.Router()
const { requireAuth } = require("../middleware/auth")
const { getOrCreateQuest, checkQuestProgress } = require("../lib/oracle")
const DailyQuest = require("../models/DailyQuest")
const User = require("../models/User")

// Calcule le multiplicateur de streak
function getStreakMultiplier(streak) {
    if (streak >= 30) return 3.0
    if (streak >= 14) return 2.5
    if (streak >= 7)  return 2.0
    if (streak >= 3)  return 1.5
    return 1.0
}

// Récupère le streak actuel de l'utilisateur (en regardant la quête d'hier)
async function computeStreak(userId) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)

    const yesterdayQuest = await DailyQuest.findOne({ userId, day: yesterdayStr })
    if (yesterdayQuest && yesterdayQuest.claimed) {
        return (yesterdayQuest.streak || 1) + 1
    }
    return 1
}

router.get("/api/oracle/quest", requireAuth, async (req, res) => {
    try {
        const quest = await getOrCreateQuest(req.session.user.id)
        // Attacher le streak courant pour l'affichage (sans le sauvegarder — fait au claim)
        if (!quest.streak || quest.streak < 1) {
            const streak = await computeStreak(req.session.user.id)
            quest._streak = streak
        }
        res.json({ success: true, quest })
    } catch (err) {
        console.error("Oracle quest error:", err)
        res.status(500).json({ success: false, error: "Erreur serveur" })
    }
})

router.post("/api/oracle/quest/verify", requireAuth, async (req, res) => {
    try {
        const quest = await checkQuestProgress(req.session.user.id)
        if (!quest) return res.json({ success: false, error: "Quête introuvable" })
        res.json({ success: true, quest })
    } catch (err) {
        console.error("Oracle verify error:", err)
        res.status(500).json({ success: false, error: "Erreur serveur" })
    }
})

router.post("/api/oracle/quest/claim", requireAuth, async (req, res) => {
    try {
        const day = new Date().toISOString().slice(0, 10)
        const quest = await DailyQuest.findOne({ userId: req.session.user.id, day })
        if (!quest) return res.json({ success: false, error: "Quête introuvable" })
        if (quest.claimed) return res.json({ success: false, already: true, message: "Récompense déjà réclamée !" })
        if (!quest.completed) return res.json({ success: false, error: "Quête non terminée" })

        // Calculer le streak
        const streak = await computeStreak(req.session.user.id)
        const multiplier = getStreakMultiplier(streak)
        const baseCoins = quest.quest.reward.coins
        const baseXp = quest.quest.reward.xp
        const totalCoins = Math.round(baseCoins * multiplier)
        const bonusCoins = totalCoins - baseCoins

        quest.claimed = true
        quest.streak = streak
        quest.bonusCoins = bonusCoins
        await quest.save()

        await User.findByIdAndUpdate(req.session.user.id, {
            $inc: { walletBalance: totalCoins, xp: baseXp }
        })

        res.json({
            success: true,
            reward: { xp: baseXp, coins: baseCoins },
            streak,
            multiplier,
            bonusCoins,
            totalCoins
        })
    } catch (err) {
        console.error("Oracle claim error:", err)
        res.status(500).json({ success: false, error: "Erreur serveur" })
    }
})

module.exports = router
