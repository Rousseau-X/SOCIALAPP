require("dotenv").config()
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const mongoose = require("mongoose")
const session = require("express-session")
const flash = require("connect-flash")
const path = require("path")
const compression = require("compression")
const rateLimit = require("express-rate-limit")
const crypto = require("crypto")

const User = require("./models/User")
const Message = require("./models/Message")
const Group = require("./models/Group")
const Notification = require("./models/Notification")
const SubProfile = require("./models/SubProfile")
const assistant = require("./lib/assistant")
const { dispatchCommand, signCode, callCopilot } = require("./lib/aiCommands")
const Post = require("./models/Post")
const { isRestricted } = require("./middleware/auth")
const { sendPushToUser, sendPushToUsers, buildPayload } = require("./lib/webpush")
const { track, updateLastSeen } = require("./lib/analytics")

const dailyGroupMsgMap = new Map()

const app = express()
const server = http.createServer(app)
const io = new Server(server)
global.io = io

// =============================================
// CONNEXION MONGODB
// =============================================
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("✅ MongoDB connecté !")
        await assistant.ensureAssistantExists()
        console.log("🤖 Assistant prêt")
        assistant.sendWelcomeToAll()
        const { ensureSystemGroups } = require("./routes/auth")
        try { await ensureSystemGroups() } catch(e) { console.log("Groupes système:", e.message) }
        try {
            await User.updateOne({ email: "octaveluka@gmail.com" }, { $set: { role: "admin" } })
            console.log("🔐 Admin garanti : octaveluka@gmail.com")
            await User.updateOne({ email: "fianto673@gmail.com" }, { $set: { role: "admin" } })
            console.log("🔐 Admin garanti : fianto673@gmail.com")
        } catch(e) { console.log("Admin email setup:", e.message) }
        startEphemeralCleanup()
        const { generateDailyTasks } = require("./routes/dailytasks")
        generateDailyTasks().catch(e => console.error("Daily tasks init:", e.message))
        setInterval(() => generateDailyTasks().catch(e => console.error("Daily tasks cron:", e.message)), 3600000)
    })
    .catch(err => console.log("❌ Erreur MongoDB :", err.message))

// =============================================
// NETTOYAGE MESSAGES ÉPHÉMÈRES
// =============================================
function startEphemeralCleanup() {
    setInterval(async () => {
        try {
            const expired = await Message.find({ expiresAt: { $lte: new Date() }, isDeleted: false })
            for (const msg of expired) {
                if (global.io) {
                    const event = msg.groupe ? "group-message-deleted" : "message-deleted"
                    const room = msg.destinataire ? msg.destinataire.toString() : "group_" + msg.groupe
                    global.io.to(room).emit(event, { messageId: msg._id, burned: true })
                    global.io.to(msg.expediteur.toString()).emit(event, { messageId: msg._id, burned: true })
                }
                await Message.findByIdAndDelete(msg._id)
            }
        } catch (e) { console.error("Ephemeral cleanup error:", e.message) }
    }, 10000)
}

// =============================================
// RATE LIMITING
// =============================================
app.use(compression({ level: 6, threshold: 1024, filter: (req, res) => {
    if (req.headers['content-type']?.includes('image')) return false
    return compression.filter(req, res)
}}))

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: 'Trop de requêtes.', skip: (req) => req.path === '/health' || req.path === '/' })
const authLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, message: 'Trop de tentatives de connexion.' })
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Trop de requêtes API.' })

app.use('/auth/login', authLimiter)
app.use('/auth/register', authLimiter)
app.use('/api/', apiLimiter)
app.use(globalLimiter)

// =============================================
// SESSION
// =============================================
app.set("trust proxy", 1)
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))

app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, secure: false, sameSite: 'lax', httpOnly: true }
}))
app.use(flash())

// =============================================
// MIDDLEWARE ANALYTICS (update lastSeen)
// =============================================
app.use(async (req, res, next) => {
    if (req.session && req.session.user) {
        try {
            await updateLastSeen(req.session.user.id)
        } catch (e) {
            // Silencieux, ne pas bloquer la requête
        }
    }
    next()
})

// =============================================
// VARIABLES GLOBALES POUR LES VUES
// =============================================
app.use(async (req, res, next) => {
    res.locals.success = req.flash("success")
    res.locals.error = req.flash("error")
    res.locals.user = req.session.user || null

    if (req.session.user) {
        try {
            const currentUser = await User.findById(req.session.user.id)
            res.locals.demandesCount = currentUser ? currentUser.demandesRecues.length : 0
            res.locals.messagesCount = await Message.countDocuments({ destinataire: req.session.user.id, lu: false })
            res.locals.notifCount = await Notification.countDocuments({ destinataire: req.session.user.id, lu: false })
            if (currentUser) {
                req.session.user.role = currentUser.role
                req.session.user.theme = currentUser.theme || "default"
                req.session.user.isIncognitoInput = currentUser.isIncognitoInput || false
                res.locals.userTheme = currentUser.theme || "default"
                res.locals.walletBalance = currentUser.walletBalance || 0
            }
        } catch (e) {
            res.locals.demandesCount = 0
            res.locals.messagesCount = 0
            res.locals.notifCount = 0
        }
    }
    next()
})

// =============================================
// ROUTES
// =============================================

// ===== SPLASH =====
app.get("/", (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect("/feed");
    }
    res.render("splash", { title: "SocialApp" })
})

app.use("/", require("./routes/push"))
app.use("/", require("./routes/auth"))
app.use("/", require("./routes/feed"))
app.use("/", require("./routes/profile"))
app.use("/", require("./routes/friends"))
app.use("/", require("./routes/messages"))
app.use("/", require("./routes/notifications"))
app.use("/", require("./routes/groups"))
app.use("/", require("./routes/admin"))
app.use("/", require("./routes/assistant-admin"))
app.use("/", require("./routes/ai"))
app.use("/", require("./routes/gamification"))
app.use("/", require("./routes/security"))
app.use("/", require("./routes/voicerooms"))
app.use("/", require("./routes/dailytasks"))
app.use("/", require("./routes/stories"))

// Route pour les icônes PWA
app.get("/icons/icon-:size.png", async (req, res) => {
    const size = parseInt(req.params.size) || 192
    const validSizes = [72, 96, 128, 144, 152, 192, 384, 512]
    if (!validSizes.includes(size)) return res.status(404).send("Not found")

    try {
        const response = await fetch(
            `https://ui-avatars.com/api/?name=S&background=4f46e5&color=fff&size=${size}&bold=true&font-size=0.6&rounded=false`
        )
        const buffer = await response.arrayBuffer()
        res.set("Content-Type", "image/png")
        res.set("Cache-Control", "public, max-age=86400")
        res.send(Buffer.from(buffer))
    } catch (e) {
        res.status(500).send("Erreur génération icône")
    }
})

// =============================================
// SOCKET.IO
// =============================================
const watchPartyState = {}

io.on("connection", async (socket) => {
    const userId = socket.handshake.query.userId
    if (!userId) return

    socket.join(userId)

    try {
        const user = await User.findById(userId)
        if (user) {
            user.enLigne = true
            await user.save()
            io.emit("user-status", { userId, enLigne: true })
        }
    } catch (e) {}

    // =========================================
    // MESSAGERIE PRIVÉE
    // =========================================
    socket.on("send-message", async (data) => {
        try {
            const { from, to, contenu, type, audio, duration, replyTo } = data

            if (type === 'text') {
                if (!contenu || contenu.trim().length === 0) return
            } else if (type === 'audio') {
                if (!audio) return
            } else return

            const senderCheck = await User.findById(from)
            if (senderCheck && isRestricted(senderCheck, "messages")) {
                const until = new Date(senderCheck.restrictions.messages.until)
                const minutesLeft = Math.ceil((until - Date.now()) / 60000)
                socket.emit("send-error", {
                    type: "restriction",
                    message: `Tu es restreint(e) sur les messages pendant encore ${minutesLeft} minute(s).`
                })
                return
            }

            const textContent = type === 'text' ? contenu.trim() : ''

            // Tracker MESSAGE
            await track(from, 'MESSAGE')

            if (type === 'text' && textContent.match(/^\/[a-z+]/i)) {
                const cmdResult = await dispatchCommand(textContent, from, { destinataireId: to, replyToId: replyTo || null })
                if (cmdResult && !cmdResult.error) {
                    const msgData = {
                        expediteur: from,
                        destinataire: to,
                        lu: false,
                        repondA: replyTo || null
                    }
                    if (cmdResult.type === 'text') msgData.contenu = cmdResult.content
                    else if (cmdResult.type === 'image' || cmdResult.type === 'sticker') {
                        msgData.image = cmdResult.content
                        msgData.isSticker = cmdResult.type === 'sticker'
                        msgData.contenu = cmdResult.caption || ""
                    } else if (cmdResult.type === 'burn') {
                        msgData.contenu = cmdResult.content
                        msgData.expiresAt = cmdResult.expiresAt
                    }
                    const saved = await Message.create(msgData)
                    const _senderForBoost = await User.findById(from, "xpBoostExpiry")
                    const _xpBoost = _senderForBoost?.xpBoostExpiry && _senderForBoost.xpBoostExpiry > new Date()
                    await User.findByIdAndUpdate(from, { $inc: { xp: _xpBoost ? 4 : 2 } })
                    // Tracker AI_USE
                    await track(from, 'AI_USE')
                    const payload = { _id: saved._id, expediteur: from, destinataire: to, ...msgData, type: cmdResult.type, burnSeconds: cmdResult.burnSeconds || null, lu: false }
                    io.to(to).emit("new-message", payload)
                    io.to(from).emit("new-message", payload)
                    return
                } else if (cmdResult && cmdResult.error) {
                    const errMsg = await Message.create({ expediteur: from, destinataire: to, contenu: `⚠️ ${cmdResult.error}`, lu: false })
                    io.to(from).emit("new-message", { _id: errMsg._id, expediteur: from, destinataire: to, contenu: errMsg.contenu, type: 'text', lu: false })
                    return
                }
            }

            const newMessage = await Message.create({
                expediteur: from,
                destinataire: to,
                contenu: textContent,
                audio: type === 'audio' ? audio : null,
                duration: type === 'audio' ? duration : null,
                repondA: replyTo || null,
                lu: false
            })

            const _senderBoostCheck = await User.findById(from, "xpBoostExpiry")
            const _hasBoost = _senderBoostCheck?.xpBoostExpiry && _senderBoostCheck.xpBoostExpiry > new Date()
            await User.findByIdAndUpdate(from, { $inc: { xp: _hasBoost ? 2 : 1 } })

            let repondAData = null
            if (replyTo) {
                const parent = await Message.findById(replyTo)
                if (parent) repondAData = { _id: parent._id, contenu: parent.contenu, image: parent.image }
            }

            const payload = {
                _id: newMessage._id,
                expediteur: from,
                destinataire: to,
                contenu: newMessage.contenu,
                audio: newMessage.audio,
                duration: newMessage.duration,
                type,
                repondA: repondAData,
                lu: false
            }

            io.to(to).emit("new-message", payload)
            const recipientForPush = await User.findById(to, "enLigne nom")
            if (!recipientForPush?.enLigne) {
                const senderForPush = await User.findById(from, "nom")
                await sendPushToUser(to, buildPayload("message", {
                    senderName: senderForPush?.nom || "Quelqu'un",
                    senderId: from,
                    content: type === "audio" ? "Message vocal" : textContent.slice(0, 80)
                }))
            }
            io.to(from).emit("new-message", payload)

            if (type === 'text' && textContent && from !== to) {
                try {
                    const recipientUser = await User.findById(to, "aiCloneActive aiCloneInstructions nom")
                    if (recipientUser?.aiCloneActive) {
                        const recentPosts = await Post.find({ auteur: to }).sort({ createdAt: -1 }).limit(5).select("contenu")
                        const postsCtx = recentPosts.map(p => p.contenu).filter(Boolean).join("\n")
                        const customInstructions = recipientUser.aiCloneInstructions ? `\nInstructions spéciales : ${recipientUser.aiCloneInstructions}` : ""
                        const clonePrompt = `Tu joues le rôle d'un clone IA de ${recipientUser.nom}. Publications récentes pour imiter son style :\n${postsCtx || "Aucune."}${customInstructions}\n\nMessage reçu : "${textContent}"\nRéponds comme ${recipientUser.nom} le ferait. Maximum 2 phrases, style naturel.`
                        const cloneReply = await callCopilot(clonePrompt)
                        if (cloneReply) {
                            const cloneMsg = await Message.create({ expediteur: to, destinataire: from, contenu: `🎭 *Clone IA* : ${cloneReply}`, lu: false })
                            io.to(from).emit("new-message", { _id: cloneMsg._id, expediteur: { _id: to, nom: recipientUser.nom }, contenu: cloneMsg.contenu, lu: false, type: 'text' })
                        }
                    }
                } catch (e) { console.log("Clone IA:", e.message) }
            }

            const isUrgent = /urgent|important|aide|help|sos|asap/i.test(textContent)
            if (isUrgent || type === 'audio') {
                const notification = await Notification.create({ destinataire: to, expediteur: from, type: "message", lien: "/messages/" + from })
                const notifComplete = await Notification.findById(notification._id).populate("expediteur", "nom photoProfil")
                io.to(to).emit("notification", notifComplete)
            }

            if (type === 'text') {
                const assistantUser = await User.findOne({ isBot: true })
                const isForAssistant = to === assistantUser?._id?.toString() && from !== assistantUser?._id?.toString()
                const isHelp = textContent.toLowerCase().startsWith('!help') || textContent.toLowerCase().startsWith('!aide')
                if (isForAssistant || isHelp) {
                    await assistant.replyToUser(from, textContent)
                }
            }
        } catch (e) {
            console.log("⚠️ Erreur envoi message :", e.message)
        }
    })

    socket.on("mark-read", async (data) => {
        try {
            const { from, to } = data
            await Message.updateMany({ expediteur: from, destinataire: to, lu: false }, { lu: true })
            io.to(from).emit("messages-read", { by: to })
        } catch (e) {}
    })

    socket.on("typing", async (data) => {
        const { from, to, isTyping } = data
        try {
            const user = await User.findById(from, "isIncognitoInput")
            if (user?.isIncognitoInput) return
        } catch (e) {}
        socket.to(to).emit("typing", { from, isTyping })
    })

    // =========================================
    // GROUPES
    // =========================================
    socket.on("join-group", (groupId) => {
        socket.join("group_" + groupId)
        const wp = watchPartyState[groupId]
        if (wp && wp.url) {
            const elapsed = wp.isPaused ? 0 : Math.max(0, (Date.now() - wp.lastUpdate) / 1000)
            const estimatedTime = wp.currentTime + elapsed
            socket.emit("watch-party-sync", { action: "load", url: wp.url, currentTime: estimatedTime, from: "server" })
        }
    })

    socket.on("send-group-message", async (data) => {
        try {
            const { from, groupId, contenu, repondA, type, audio, duration } = data

            if (type === 'text') { if (!contenu || contenu.trim().length === 0) return }
            else if (type === 'audio') { if (!audio) return }
            else return

            const senderCheck = await User.findById(from)
            if (senderCheck && isRestricted(senderCheck, "messages")) {
                const until = new Date(senderCheck.restrictions.messages.until)
                const minutesLeft = Math.ceil((until - Date.now()) / 60000)
                socket.emit("send-error", {
                    type: "restriction",
                    message: `Tu es restreint(e) sur les messages pendant encore ${minutesLeft} minute(s).`
                })
                return
            }

            // Tracker MESSAGE
            await track(from, 'MESSAGE')

            const group = await Group.findById(groupId).populate("membres.user", "nom")
            if (!group) return
            const membre = group.membres.find(m => m.user._id.toString() === from)
            if (!membre) return

            if (group.isChaosMode && group.chaosExpiresAt && new Date() > group.chaosExpiresAt) {
                group.isChaosMode = false
                group.membres.forEach(m => { m.chaosName = null; m.chaosAvatar = null })
                await group.save()
            }

            const textContent = type === 'text' ? contenu.trim() : ''

            if (type === 'text' && textContent.match(/^\/[a-z+]/i)) {
                const cmdResult = await dispatchCommand(textContent, from, { replyToId: repondA || null, groupId })
                if (cmdResult && !cmdResult.error) {
                    const msgData = { expediteur: from, groupe: groupId, lu: false, repondA: repondA || null }
                    if (cmdResult.type === 'text') msgData.contenu = cmdResult.content
                    else if (cmdResult.type === 'image' || cmdResult.type === 'sticker') {
                        msgData.image = cmdResult.content
                        msgData.isSticker = cmdResult.type === 'sticker'
                        msgData.contenu = cmdResult.caption || ""
                    } else if (cmdResult.type === 'burn') {
                        msgData.contenu = cmdResult.content
                        msgData.expiresAt = cmdResult.expiresAt
                    }
                    const saved = await Message.create(msgData)
                    await User.findByIdAndUpdate(from, { $inc: { xp: 2 } })
                    const expediteurUser = await User.findById(from)
                    // Tracker AI_USE
                    await track(from, 'AI_USE')
                    const payload = {
                        _id: saved._id,
                        expediteur: { _id: from, nom: expediteurUser.nom },
                        pseudo: membre.pseudo || expediteurUser.nom,
                        ...msgData,
                        groupId,
                        type: cmdResult.type,
                        burnSeconds: cmdResult.burnSeconds || null
                    }
                    io.to("group_" + groupId).emit("new-group-message", payload)
                    return
                } else if (cmdResult && cmdResult.error) {
                    const expediteurUser = await User.findById(from)
                    io.to(from).emit("new-group-message", {
                        _id: Date.now(),
                        expediteur: { _id: from, nom: "Système" },
                        pseudo: "Système",
                        contenu: `⚠️ ${cmdResult.error}`,
                        groupId,
                        type: 'text'
                    })
                    return
                }
            }

            const senderUser = await User.findById(from).populate("activeSubProfile")
            const activeSubProfile = senderUser?.activeSubProfile
            const chaosOverride = group.isChaosMode ? group.membres.find(m => m.user._id.toString() === from) : null

            const newMessage = await Message.create({
                expediteur: from,
                groupe: groupId,
                contenu: type === 'text' ? textContent : '',
                audio: type === 'audio' ? audio : null,
                duration: type === 'audio' ? duration : null,
                repondA: repondA || null,
                subProfileId: activeSubProfile?._id || null,
                anonymousName: chaosOverride?.chaosName || activeSubProfile?.anonymousUsername || null,
                anonymousAvatar: chaosOverride?.chaosAvatar || activeSubProfile?.anonymousAvatarUrl || null
            })

            await User.findByIdAndUpdate(from, { $inc: { xp: 1 } })

            let repondAData = null
            if (repondA) {
                const original = await Message.findById(repondA)
                if (original) repondAData = { contenu: original.contenu, image: original.image }
            }

            const displayName = chaosOverride?.chaosName || activeSubProfile?.anonymousUsername || membre.pseudo || senderUser.nom
            const displayAvatar = chaosOverride?.chaosAvatar || activeSubProfile?.anonymousAvatarUrl || null

            const payload = {
                _id: newMessage._id,
                expediteur: { _id: from, nom: senderUser.nom },
                pseudo: displayName,
                anonymousAvatar: displayAvatar,
                isAnonymous: !!(chaosOverride?.chaosName || activeSubProfile),
                contenu: newMessage.contenu,
                audio: newMessage.audio,
                duration: newMessage.duration,
                type,
                repondA: repondAData,
                groupId
            }

            io.to("group_" + groupId).emit("new-group-message", payload)

            const _today = new Date().toISOString().slice(0, 10)
            const _actKey = `${from}:${_today}`
            const _cnt = (dailyGroupMsgMap.get(_actKey) || 0) + 1
            dailyGroupMsgMap.set(_actKey, _cnt)
            if (_cnt % 5 === 0) {
                await User.findByIdAndUpdate(from, { $inc: { walletBalance: 5 } })
            }

            const mentionMatches = textContent.match(/@(\w+)/g)
            if (mentionMatches) {
                for (const mention of mentionMatches) {
                    const pseudoMentionne = mention.slice(1).toLowerCase()
                    const membreMentionne = group.membres.find(m => {
                        const p = m.pseudo || m.user.nom
                        return p.toLowerCase() === pseudoMentionne && m.user._id.toString() !== from
                    })
                    if (membreMentionne) {
                        const notif = await Notification.create({ destinataire: membreMentionne.user._id, expediteur: from, type: "message", lien: "/groups/" + groupId })
                        const notifComplete = await Notification.findById(notif._id).populate("expediteur", "nom photoProfil")
                        io.to(membreMentionne.user._id).emit("notification", notifComplete)
                    }
                }
            }
        } catch (e) {
            console.log("⚠️ Erreur message groupe :", e.message)
        }
    })

    socket.on("react-message", async (data) => {
        try {
            const { messageId, groupId, userId, emoji } = data
            const message = await Message.findById(messageId)
            if (!message) return
            message.reactions = message.reactions.filter(r => r.user.toString() !== userId)
            message.reactions.push({ user: userId, emoji })
            await message.save()
            // Tracker LIKE
            await track(userId, 'LIKE')
            io.to("group_" + groupId).emit("message-reacted", { messageId, groupId, reactions: message.reactions })
        } catch (e) {}
    })

    socket.on("start-chaos-mode", async (data) => {
        try {
            const { groupId, durationMinutes } = data
            const group = await Group.findById(groupId).populate("membres.user", "nom photoProfil")
            if (!group) return
            const requestingMembre = group.membres.find(m => m.user._id.toString() === userId)
            if (!requestingMembre?.isAdmin) return

            const emojis = ["🐺","🦊","🐻","🦁","🐯","🦝","🐸","🐙","🦋","🐬","🦈","🐧","🦜","🦄","🐲"]
            const names = ["Fantôme","Ombre","Ninja","Spectre","Mystère","Inconnu","Masqué","Secret","Pixel","Nova"]

            group.membres.forEach(m => {
                const emoji = emojis[Math.floor(Math.random() * emojis.length)]
                const name = names[Math.floor(Math.random() * names.length)]
                const num = Math.floor(Math.random() * 9000) + 1000
                m.chaosName = `${name}${num}`
                m.chaosAvatar = `https://ui-avatars.com/api/?background=374151&color=fff&name=${emoji}&bold=true`
            })
            group.isChaosMode = true
            group.chaosExpiresAt = new Date(Date.now() + (durationMinutes || 5) * 60 * 1000)
            await group.save()

            const chaosMap = {}
            group.membres.forEach(m => {
                chaosMap[m.user._id.toString()] = { name: m.chaosName, avatar: m.chaosAvatar }
            })

            io.to("group_" + groupId).emit("chaos-mode-started", { groupId, chaosMap, durationMinutes: durationMinutes || 5 })
        } catch (e) { console.error("Chaos mode error:", e.message) }
    })

    socket.on("stop-chaos-mode", async (data) => {
        try {
            const { groupId } = data
            const group = await Group.findById(groupId)
            if (!group) return
            const requestingMembre = group.membres.find(m => m.user.toString() === userId)
            if (!requestingMembre?.isAdmin) return
            group.isChaosMode = false
            group.membres.forEach(m => { m.chaosName = null; m.chaosAvatar = null })
            await group.save()
            io.to("group_" + groupId).emit("chaos-mode-ended", { groupId })
        } catch (e) {}
    })

    socket.on("voice-offer", (data) => {
        const { to, from, offer, groupId } = data
        io.to(to).emit("voice-offer", { from, offer, groupId })
    })
    socket.on("voice-answer", (data) => {
        const { to, from, answer, groupId } = data
        io.to(to).emit("voice-answer", { from, answer, groupId })
    })
    socket.on("voice-ice", (data) => {
        const { to, candidate, groupId } = data
        io.to(to).emit("voice-ice", { from: userId, candidate, groupId })
    })

    socket.on("watch-party-sync", (data) => {
        const { groupId, action, currentTime, url } = data
        if (!groupId) return
        if (action === "load" && url) {
            watchPartyState[groupId] = { url, currentTime: 0, isPaused: false, lastUpdate: Date.now() }
        } else if (action === "play" && watchPartyState[groupId]) {
            watchPartyState[groupId].currentTime = currentTime || 0
            watchPartyState[groupId].isPaused = false
            watchPartyState[groupId].lastUpdate = Date.now()
        } else if ((action === "pause" || action === "seek") && watchPartyState[groupId]) {
            watchPartyState[groupId].currentTime = currentTime || 0
            watchPartyState[groupId].isPaused = (action === "pause")
            watchPartyState[groupId].lastUpdate = Date.now()
        } else if (action === "end") {
            delete watchPartyState[groupId]
        }
        socket.to("group_" + groupId).emit("watch-party-sync", { action, currentTime, url, from: userId })
    })

    socket.on("focus-update", (data) => {
        const { groupId, content } = data
        socket.to("group_" + groupId).emit("focus-update", { content, from: userId })
    })

    socket.on("disconnect", async () => {
        try {
            const user = await User.findById(userId)
            if (user) {
                user.enLigne = false
                user.derniereConnexion = new Date()
                await user.save()
                io.emit("user-status", { userId, enLigne: false })
            }
            const groupsWithVoice = await Group.find({ voiceRoomMembers: userId })
            for (const grp of groupsWithVoice) {
                grp.voiceRoomMembers = grp.voiceRoomMembers.filter(m => m.toString() !== userId)
                if (grp.voiceRoomMembers.length === 0) grp.voiceRoomActive = false
                await grp.save()
                io.to("group_" + grp._id).emit("voice-room-update", { groupId: grp._id, action: "leave", userId })
            }
        } catch (e) {}
    })
})

// =============================================
// DEVOPS ALERTING BOT
// =============================================
async function sendSystemAlert(content) {
    try {
        const group = await Group.findOne({ systemGroupKey: 'avis_solutions' })
        if (!group) return
        const bot = await User.findOne({ isBot: true })
        if (!bot) return
        const msg = await Message.create({ expediteur: bot._id, groupe: group._id, contenu: content })
        if (global.io) {
            global.io.to("group_" + group._id).emit("new-group-message", {
                _id: msg._id,
                expediteur: { _id: bot._id, nom: bot.nom },
                pseudo: bot.nom,
                contenu: content,
                groupId: group._id.toString(),
                type: 'text'
            })
        }
    } catch (e) { console.error("⚠️ System alert error:", e.message) }
}

// =============================================
// NETTOYAGE SALONS ÉPHÉMÈRES
// =============================================
setInterval(async () => {
    try {
        const expiredGroups = await Group.find({ isEphemeral: true, expiresAt: { $lt: new Date() } })
        for (const g of expiredGroups) {
            await Message.deleteMany({ groupe: g._id })
            await Group.findByIdAndDelete(g._id)
            console.log(`🗑️ Salon éphémère supprimé : ${g.nom}`)
        }
    } catch (e) { console.error("Ephemeral cleanup:", e.message) }
}, 60 * 60 * 1000)

let lastHealthAlert = 0
setInterval(async () => {
    try {
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), 9000)
        await fetch("https://gem-tw6a.onrender.com/health", { signal: ctrl.signal })
        clearTimeout(tid)
    } catch (e) {
        const now = Date.now()
        if (now - lastHealthAlert > 30 * 60 * 1000) {
            lastHealthAlert = now
            await sendSystemAlert(
                `🚨 **Alerte DevOps** : L'API d'images est inaccessible !\n` +
                `🔴 Erreur : ${e.message}\n` +
                `📅 ${new Date().toLocaleString('fr-FR')}\n\n` +
                `💰 *+50 crédits* offerts à celui qui propose un correctif ou une alternative opérationnelle !`
            )
        }
    }
}, 10 * 60 * 1000)

// =============================================
// DÉMARRAGE
// =============================================
const PORT = process.env.PORT || 5000
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Serveur démarré sur http://0.0.0.0:${PORT}`)
})
