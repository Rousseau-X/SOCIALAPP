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

function renderOracleQuest(quest) {
    const loading = document.getElementById("oracleLoading")
    const content = document.getElementById("oracleContent")
    const text = document.getElementById("oracleQuestText")
    const fill = document.getElementById("oracleProgressFill")
    const label = document.getElementById("oracleProgressLabel")
    const footer = document.getElementById("oracleFooter")
    const xpEl = document.getElementById("oracleXp")
    const coinsEl = document.getElementById("oracleCoins")

    if (!content) return

    const q = quest.quest
    if (xpEl) xpEl.textContent = q.reward.xp
    if (coinsEl) coinsEl.textContent = q.reward.coins

    const progress = quest.progress || 0
    const target = q.targetCount || 1
    const pct = Math.min(Math.round((progress / target) * 100), 100)

    if (text) text.textContent = q.text
    if (fill) fill.style.width = pct + "%"
    if (label) label.textContent = progress + " / " + target

    if (footer) {
        if (quest.claimed) {
            footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Récompense réclamée — Reviens demain !</div>`
        } else if (quest.completed) {
            footer.innerHTML = `
                <button class="btn oracle-claim-btn" onclick="claimOracleReward()" id="oracleClaimBtn">
                    <i class="fa-solid fa-gift"></i> Réclamer ma récompense
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
        if (btn) { btn.disabled = false }
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
            if (footer) {
                footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Récompense réclamée !</div>`
            }
            if (card) {
                card.classList.remove("oracle-completed")
                card.classList.add("oracle-claimed-anim")
            }
            showOracleToast(data.reward)
        } else if (data.already) {
            const footer = document.getElementById("oracleFooter")
            if (footer) footer.innerHTML = `<div class="oracle-claimed-badge"><i class="fa-solid fa-check-circle"></i> Déjà réclamée — Reviens demain !</div>`
        }
    } catch (e) {
        console.error("Oracle claim error:", e)
        if (btn) { btn.disabled = false; btn.textContent = "Réclamer ma récompense" }
    }
}

function showOracleToast(reward) {
    const toast = document.createElement("div")
    toast.className = "oracle-toast"
    toast.innerHTML = `
        <div class="oracle-toast-inner">
            <i class="fa-solid fa-trophy" style="color:#f59e0b; font-size:22px;"></i>
            <div>
                <div style="font-weight:700; font-size:14px;">Quête accomplie !</div>
                <div style="font-size:13px; color:var(--text-secondary);">+${reward.xp} XP &nbsp;·&nbsp; +${reward.coins} coins</div>
            </div>
        </div>
    `
    document.body.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add("oracle-toast-show"))
    setTimeout(() => {
        toast.classList.remove("oracle-toast-show")
        setTimeout(() => toast.remove(), 400)
    }, 3500)
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("oracleQuestCard")) {
        loadOracleQuest()
    }
})
