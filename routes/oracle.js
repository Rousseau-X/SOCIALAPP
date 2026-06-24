const express = require("express")
const router = express.Router()
const { requireAuth } = require("../middleware/auth")
const { getOrCreateQuest, checkQuestProgress } = require("../lib/oracle")
const DailyQuest = require("../models/DailyQuest")
const User = require("../models/User")

router.get("/api/oracle/quest", requireAuth, async (req, res) => {
    try {
        const quest = await getOrCreateQuest(req.session.user.id)
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

        quest.claimed = true
        await quest.save()

        await User.findByIdAndUpdate(req.session.user.id, {
            $inc: { walletBalance: quest.quest.reward.coins, xp: quest.quest.reward.xp }
        })

        res.json({ success: true, reward: quest.quest.reward })
    } catch (err) {
        console.error("Oracle claim error:", err)
        res.status(500).json({ success: false, error: "Erreur serveur" })
    }
})

module.exports = router
