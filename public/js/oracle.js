async function loadOracleQuest() {
    try {
        const res = await fetch("/api/oracle/quest")
        const data = await res.json()
        if (data.success) renderOracleQuest(data.quest)
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

function getMultiplierLabel(streak) {
    if (streak >= 30) return { mult: "x3", label: "Légendaire 🏆" }
    if (streak >= 14) return { mult: "x2.5", label: "Incroyable ⚡" }
    if (streak >= 7)  return { mult: "x2", label: "En feu 🔥" }
    if (streak >= 3)  return { mult: "x1.5", label: "Sur ta lancée 💪" }
    return null
}

function renderOracleQuest(quest) {
    const loading = document.getElementById("oracleLoading")
    const content = document.getElementById("oracleContent")
    const text = document.getElementById("oracleQuestText")
    const fill = document.getElementById("oracleProgressFill")
    const label = document.getElementById("oracleProgressLabel")
    const footer = document.getElementById("oracleFooter")
    const xpEl = document.getElementById("oracleXp")
    const coinsEl = document.getElementById("oracleCoins")
    const streakBadge = document.getElementById("oracleStreakBadge")
    const streakCount = document.getElementById("oracleStreakCount")
    const streakBar = document.getElementById("oracleStreakBar")

    if (!content) return

    const q = quest.quest
    if (xpEl) xpEl.textContent = q.reward.xp
    if (coinsEl) coinsEl.textContent = q.reward.coins

    // Streak (passé par _streak ou streak)
    const streak = quest.streak || quest._streak || 1
    if (streak >= 2 && streakBadge && streakCount) {
        streakBadge.style.display = "block"
        streakCount.textContent = streak
    }

    // Barre de bonus multiplicateur
    if (streakBar) {
        const info = getMultiplierLabel(streak)
        if (info) {
            const nextMult = streak < 3 ? `Encore ${3 - streak} jour(s) pour un bonus ${getMultiplierLabel(3).mult}` :
                             streak < 7 ? `Encore ${7 - streak} jour(s) pour un bonus x2` :
                             streak < 14 ? `Encore ${14 - streak} jour(s) pour un bonus x2.5` :
                             streak < 30 ? `Encore ${30 - streak} jour(s) pour un bonus x3` : "Tu es au maximum !"
            streakBar.style.display = "block"
            streakBar.innerHTML = `✨ Bonus streak actif : <strong>${info.mult}</strong> sur les coins · ${info.label} &nbsp;·&nbsp; <em>${nextMult}</em>`
        } else if (streak === 1) {
            streakBar.style.display = "block"
            streakBar.innerHTML = `💡 Reviens demain pour démarrer un streak et gagner des bonus coins !`
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
            const bonusTxt = bonusCoins > 0 ? ` <span style="color:#f59e0b">+${bonusCoins} bonus 🔥</span>` : ""
            footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Récompense réclamée — Reviens demain !${bonusTxt}</div>`
        } else if (quest.completed) {
            const info = getMultiplierLabel(streak)
            const bonusTxt = info ? `<span style="font-size:11px; opacity:.75; margin-left:6px;">Bonus streak ${info.mult} inclus !</span>` : ""
            footer.innerHTML = `
                <button class="btn oracle-claim-btn" onclick="claimOracleReward()" id="oracleClaimBtn">
                    <i class="fa-solid fa-gift"></i> Réclamer ma récompense${bonusTxt}
                </button>
            `
        } else {
            footer.innerHTML = `
                <button class="btn btn-secondary btn-sm oracle-verify-btn" onclick="verifyOracleQuest()" id="oracleVerifyBtn">
                    <i class="fa-solid fa-rotate"></i> Vérifier ma progression
                </button>
            `
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
        if (data.success) renderOracleQuest(data.quest)
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
            const card = document.getElementById("oracleQuestCard")
            const bonusTxt = data.bonusCoins > 0 ? ` <span style="color:#f59e0b">+${data.bonusCoins} bonus 🔥</span>` : ""
            if (footer) {
                footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Récompense réclamée !${bonusTxt}</div>`
            }
            if (card) {
                card.classList.remove("oracle-completed")
                card.classList.add("oracle-claimed-anim")
            }
            showOracleToast(data)
        } else if (data.already) {
            const footer = document.getElementById("oracleFooter")
            if (footer) footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Déjà réclamée — Reviens demain !</div>`
        }
    } catch (e) {
        console.error("Oracle claim error:", e)
        if (btn) { btn.disabled = false; btn.textContent = "Réclamer ma récompense" }
    }
}

function showOracleToast(data) {
    const { reward, streak, bonusCoins, totalCoins } = data
    const hasBonus = bonusCoins > 0

    const toast = document.createElement("div")
    toast.className = "oracle-toast"
    toast.innerHTML = `
        <div class="oracle-toast-inner">
            <i class="fa-solid fa-trophy" style="color:#f59e0b; font-size:22px;"></i>
            <div>
                <div style="font-weight:700; font-size:14px;">Quête accomplie ! ${streak >= 2 ? "🔥 Streak " + streak + "j" : ""}</div>
                <div style="font-size:13px; color:var(--text-secondary);">
                    +${reward.xp} XP &nbsp;·&nbsp;
                    ${hasBonus
                        ? `<span style="color:#f59e0b; font-weight:600;">+${totalCoins} coins <small>(+${bonusCoins} bonus streak)</small></span>`
                        : `+${totalCoins} coins`}
                </div>
            </div>
        </div>
    `
    document.body.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add("oracle-toast-show"))
    setTimeout(() => {
        toast.classList.remove("oracle-toast-show")
        setTimeout(() => toast.remove(), 400)
    }, 4500)
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("oracleQuestCard")) {
        loadOracleQuest()
    }
})
