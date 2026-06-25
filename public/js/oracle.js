async function loadOracleQuest() {
    try {
        const res = await fetch("/api/oracle/quest")
        const data = await res.json()
        if (data.success) renderOracleQuest(data.quest, data.streak || 1)
        else hideOracle()
    } catch (e) {
        console.error("Oracle load error:", e)
        hideOracle()
    }
}

function hideOracle() {
    const card = document.getElementById("oracleQuestCard")
    if (card) card.style.display = "none"
}

function getStreakInfo(streak) {
    if (streak >= 30) return { mult: "x3",   emoji: "🏆", label: "Légendaire",    color: "#a855f7" }
    if (streak >= 14) return { mult: "x2.5",  emoji: "⚡", label: "Incroyable",   color: "#f59e0b" }
    if (streak >= 7)  return { mult: "x2",    emoji: "🔥", label: "En feu",       color: "#ef4444" }
    if (streak >= 3)  return { mult: "x1.5",  emoji: "💪", label: "Sur ta lancée",color: "#f97316" }
    if (streak >= 2)  return { mult: "x1",    emoji: "🔥", label: "C'est parti",  color: "#f59e0b" }
    return             { mult: "x1",    emoji: "🌱", label: "1er jour",     color: "#22c55e" }
}

function renderOracleQuest(quest, streak) {
    streak = streak || 1
    const loading   = document.getElementById("oracleLoading")
    const content   = document.getElementById("oracleContent")
    const text      = document.getElementById("oracleQuestText")
    const fill      = document.getElementById("oracleProgressFill")
    const label     = document.getElementById("oracleProgressLabel")
    const footer    = document.getElementById("oracleFooter")
    const xpEl      = document.getElementById("oracleXp")
    const coinsEl   = document.getElementById("oracleCoins")
    const streakBadge = document.getElementById("oracleStreakBadge")
    const streakCount = document.getElementById("oracleStreakCount")
    const streakBar   = document.getElementById("oracleStreakBar")

    if (!content) return

    const q = quest.quest
    if (xpEl) xpEl.textContent = q.reward.xp
    if (coinsEl) coinsEl.textContent = q.reward.coins

    // Streak badge — toujours affiché (jour 1 = 🌱, jour 2+ = 🔥)
    const info = getStreakInfo(streak)
    if (streakBadge && streakCount) {
        streakBadge.style.display = "block"
        streakCount.textContent = streak
        const badgeEl = streakBadge.querySelector(".oracle-streak-badge")
        if (badgeEl) {
            badgeEl.style.background = streak >= 3
                ? `linear-gradient(135deg, #ff6b35, ${info.color})`
                : `linear-gradient(135deg, #22c55e, #16a34a)`
        }
    }

    // Barre info streak
    if (streakBar) {
        streakBar.style.display = "block"
        if (streak === 1) {
            streakBar.innerHTML = `🌱 Premier jour ! Reviens demain pour démarrer un streak et gagner des <strong>bonus coins</strong>.`
        } else if (streak < 3) {
            streakBar.innerHTML = `🔥 Streak de <strong>${streak} jours</strong> — encore ${3 - streak} jour(s) pour un bonus <strong>x1.5</strong> sur les coins !`
        } else {
            const nextThreshold = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : null
            const nextMult = streak < 7 ? "x2" : streak < 14 ? "x2.5" : streak < 30 ? "x3" : null
            const progressTxt = nextThreshold
                ? `Encore ${nextThreshold - streak} jour(s) pour un bonus <strong>${nextMult}</strong>`
                : "Tu es au maximum 🏆 !"
            streakBar.innerHTML = `${info.emoji} Streak <strong>${streak} jours</strong> · Bonus actif <strong>${info.mult}</strong> sur les coins · ${info.label} &nbsp;·&nbsp; ${progressTxt}`
        }
    }

    const progress = quest.progress || 0
    const target = q.targetCount || 1
    const pct = Math.min(Math.round((progress / target) * 100), 100)

    if (text) text.textContent = q.text
    if (fill) fill.style.width = pct + "%"
    if (label) label.textContent = progress + " / " + target

    if (footer) {
        if (quest.claimed) {
            const bonusCoins = quest.bonusCoins || 0
            const bonusTxt = bonusCoins > 0 ? ` · <span style="color:#f59e0b">+${bonusCoins} bonus streak 🔥</span>` : ""
            footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Récompense réclamée — Reviens demain !${bonusTxt}</div>`
        } else if (quest.completed) {
            const bonusTxt = streak >= 3 ? `<span style="font-size:11px;opacity:.8;margin-left:6px;">${info.emoji} Bonus ${info.mult} inclus !</span>` : ""
            footer.innerHTML = `
                <button class="btn oracle-claim-btn" onclick="claimOracleReward()" id="oracleClaimBtn">
                    <i class="fa-solid fa-gift"></i> Réclamer ma récompense ${bonusTxt}
                </button>`
        } else {
            footer.innerHTML = `
                <button class="btn btn-secondary btn-sm oracle-verify-btn" onclick="verifyOracleQuest()" id="oracleVerifyBtn">
                    <i class="fa-solid fa-rotate"></i> Vérifier ma progression
                </button>`
        }
    }

    if (loading) loading.style.display = "none"
    if (content) content.style.display = "block"

    if (quest.completed && !quest.claimed) {
        const card = document.getElementById("oracleQuestCard")
        if (card) card.classList.add("oracle-completed")
    }
}

async function verifyOracleQuest() {
    const btn = document.getElementById("oracleVerifyBtn")
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Vérification…' }
    try {
        const res = await fetch("/api/oracle/quest/verify", { method: "POST" })
        const data = await res.json()
        if (data.success) renderOracleQuest(data.quest, data.streak || 1)
    } catch (e) {
        console.error("Oracle verify error:", e)
    } finally {
        if (btn) btn.disabled = false
    }
}

async function claimOracleReward() {
    const btn = document.getElementById("oracleClaimBtn")
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Réclamation…' }
    try {
        const res = await fetch("/api/oracle/quest/claim", { method: "POST" })
        const data = await res.json()
        if (data.success) {
            const footer = document.getElementById("oracleFooter")
            const card   = document.getElementById("oracleQuestCard")
            const bonusTxt = data.bonusCoins > 0 ? ` · <span style="color:#f59e0b">+${data.bonusCoins} bonus 🔥</span>` : ""
            if (footer) footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Récompense réclamée !${bonusTxt}</div>`
            if (card) { card.classList.remove("oracle-completed"); card.classList.add("oracle-claimed-anim") }
            showOracleToast(data)
        } else if (data.already) {
            const footer = document.getElementById("oracleFooter")
            if (footer) footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Déjà réclamée — Reviens demain !</div>`
        }
    } catch (e) {
        console.error("Oracle claim error:", e)
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-gift"></i> Réclamer ma récompense' }
    }
}

function showOracleToast(data) {
    const { reward, streak, bonusCoins, totalCoins } = data
    const info = getStreakInfo(streak || 1)
    const hasBonus = bonusCoins > 0
    const toast = document.createElement("div")
    toast.className = "oracle-toast"
    toast.innerHTML = `
        <div class="oracle-toast-inner">
            <span style="font-size:26px;">${info.emoji}</span>
            <div>
                <div style="font-weight:700;font-size:14px;">Quête accomplie ! ${streak >= 2 ? "· Streak " + streak + " jours" : ""}</div>
                <div style="font-size:13px;color:var(--text-secondary);">
                    +${reward.xp} XP &nbsp;·&nbsp;
                    ${hasBonus
                        ? `<span style="color:#f59e0b;font-weight:600;">+${totalCoins} coins <small>(+${bonusCoins} bonus)</small></span>`
                        : `+${totalCoins} coins`}
                </div>
            </div>
        </div>`
    document.body.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add("oracle-toast-show"))
    setTimeout(() => { toast.classList.remove("oracle-toast-show"); setTimeout(() => toast.remove(), 400) }, 4500)
}

// ── Historique (affiché dans /profile) ──────────────────────
async function loadOracleHistory() {
    const container = document.getElementById("oracleHistoryList")
    if (!container) return
    try {
        const res  = await fetch("/api/oracle/history")
        const data = await res.json()
        if (!data.success) return
        const dayNames = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]
        container.innerHTML = data.history.map(({ day, quest }) => {
            const d     = new Date(day)
            const label = dayNames[d.getDay()] + " " + d.getDate()
            if (!quest) {
                return `<div class="oh-day oh-day-miss" title="${day}">
                    <span class="oh-dot">—</span>
                    <span class="oh-lbl">${label}</span>
                </div>`
            }
            if (quest.claimed) {
                const streak = quest.streak || 1
                const info   = getStreakInfo(streak)
                return `<div class="oh-day oh-day-done" title="${day} · ${quest.quest.text}">
                    <span class="oh-dot">${info.emoji}</span>
                    <span class="oh-lbl">${label}</span>
                    <span class="oh-coins">+${quest.quest.reward.coins + (quest.bonusCoins||0)}</span>
                </div>`
            }
            if (quest.completed) {
                return `<div class="oh-day oh-day-todo" title="${day} · ${quest.quest.text}">
                    <span class="oh-dot">✅</span>
                    <span class="oh-lbl">${label}</span>
                </div>`
            }
            return `<div class="oh-day oh-day-active" title="${day} · ${quest.quest.text}">
                <span class="oh-dot">🎯</span>
                <span class="oh-lbl">${label}</span>
            </div>`
        }).join("")
    } catch (e) {
        console.error("Oracle history error:", e)
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("oracleQuestCard")) loadOracleQuest()
    if (document.getElementById("oracleHistoryList")) loadOracleHistory()
})
