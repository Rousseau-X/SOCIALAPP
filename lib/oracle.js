const Post = require("../models/Post")
const Message = require("../models/Message")
const Story = require("../models/Story")
const DailyQuest = require("../models/DailyQuest")

function getTodayStr() {
    return new Date().toISOString().slice(0, 10)
}

function getTodayStart() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
}

const QUEST_TEMPLATES = [
    {
        type: "post",
        text: "Publie une publication aujourd'hui",
        targetCount: 1,
        reward: { xp: 50, coins: 10 },
        check: async (userId, today) =>
            Post.countDocuments({ auteur: userId, createdAt: { $gte: today } })
    },
    {
        type: "message",
        text: "Envoie 5 messages à tes amis",
        targetCount: 5,
        reward: { xp: 30, coins: 5 },
        check: async (userId, today) =>
            Message.countDocuments({ expediteur: userId, createdAt: { $gte: today } })
    },
    {
        type: "story",
        text: "Publie une story aujourd'hui",
        targetCount: 1,
        reward: { xp: 40, coins: 8 },
        check: async (userId, today) =>
            Story.countDocuments({ auteur: userId, createdAt: { $gte: today } })
    },
    {
        type: "like",
        text: "Aime 5 publications de tes amis",
        targetCount: 5,
        reward: { xp: 25, coins: 5 },
        check: async (userId) => {
            const posts = await Post.find({ likes: userId }).lean()
            return posts.length
        }
    },
    {
        type: "ai",
        text: "Utilise une commande IA aujourd'hui",
        targetCount: 1,
        reward: { xp: 35, coins: 7 },
        check: async (userId, today) =>
            Message.countDocuments({
                expediteur: userId,
                contenu: { $regex: /^\/[+a-z]/i },
                createdAt: { $gte: today }
            })
    },
]

async function analyzeUserActivity(userId) {
    const today = getTodayStart()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [postsToday, messagesToday, storiesRecent, aiToday, postsLiked] = await Promise.all([
        Post.countDocuments({ auteur: userId, createdAt: { $gte: today } }),
        Message.countDocuments({ expediteur: userId, createdAt: { $gte: today } }),
        Story.countDocuments({ auteur: userId, createdAt: { $gte: sevenDaysAgo } }),
        Message.countDocuments({ expediteur: userId, contenu: { $regex: /^\/[+a-z]/i }, createdAt: { $gte: today } }),
        Post.countDocuments({ likes: userId })
    ])

    return { postsToday, messagesToday, storiesRecent, aiToday, postsLiked }
}

async function getOrCreateQuest(userId) {
    const day = getTodayStr()

    const existing = await DailyQuest.findOne({ userId, day })
    if (existing) return existing

    const activity = await analyzeUserActivity(userId)
    const today = getTodayStart()

    const available = []
    for (const t of QUEST_TEMPLATES) {
        const progress = await t.check(userId, today)
        if (progress < t.targetCount) {
            available.push({ ...t, currentProgress: progress })
        }
    }

    let chosen
    if (available.length === 0) {
        chosen = {
            type: "post",
            text: "Tu es en feu ! Publie encore une publication aujourd'hui",
            targetCount: (activity.postsToday || 0) + 1,
            reward: { xp: 20, coins: 5 },
            currentProgress: activity.postsToday || 0
        }
    } else {
        chosen = available[Math.floor(Math.random() * available.length)]
    }

    const expiresAt = new Date()
    expiresAt.setHours(23, 59, 59, 999)

    const quest = await DailyQuest.create({
        userId,
        day,
        quest: {
            text: chosen.text,
            type: chosen.type,
            targetCount: chosen.targetCount,
            reward: chosen.reward
        },
        progress: Math.min(chosen.currentProgress || 0, chosen.targetCount),
        completed: (chosen.currentProgress || 0) >= chosen.targetCount,
        expiresAt
    })

    return quest
}

async function checkQuestProgress(userId) {
    const day = getTodayStr()
    const quest = await DailyQuest.findOne({ userId, day })
    if (!quest || quest.claimed) return quest

    const today = getTodayStart()
    const template = QUEST_TEMPLATES.find(t => t.type === quest.quest.type)
    if (!template) return quest

    const progress = await template.check(userId, today)
    quest.progress = Math.min(progress, quest.quest.targetCount)
    if (quest.progress >= quest.quest.targetCount) {
        quest.completed = true
    }
    await quest.save()
    return quest
}

module.exports = { getOrCreateQuest, checkQuestProgress, analyzeUserActivity }
