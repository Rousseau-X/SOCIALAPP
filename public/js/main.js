// =====================================================
// 1. MODE SOMBRE
// =====================================================
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const currentTheme = localStorage.getItem('theme');

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = themeToggle.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-sun';
    }

    themeToggle.addEventListener('click', function(e) {
        e.preventDefault();
        document.body.classList.toggle('dark-mode');
        
        const icon = this.querySelector('i');
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            if (icon) icon.className = 'fa-solid fa-sun';
        } else {
            localStorage.setItem('theme', 'light');
            if (icon) icon.className = 'fa-solid fa-moon';
        }
    });

    if (!localStorage.getItem('theme')) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
            const icon = themeToggle.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-sun';
            localStorage.setItem('theme', 'dark');
        }
    }

    initNotifications();
    setTimeout(function() { initProfileEffects(); }, 100);
    updateNotificationBadge();

    initSocketNotifications();
});

// =====================================================
// 2. GESTION DES NOTIFICATIONS
// =====================================================
let notificationEnabled = true;
let soundEnabled = true;

function initNotifications() {
    const savedNotif = localStorage.getItem('notificationEnabled');
    if (savedNotif !== null) notificationEnabled = savedNotif === 'true';
    const savedSound = localStorage.getItem('soundEnabled');
    if (savedSound !== null) soundEnabled = savedSound === 'true';

    requestNotificationPermission();
    updateNotificationIcon();

    const toggleBtn = document.getElementById('toggleNotificationsBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            notificationEnabled = !notificationEnabled;
            localStorage.setItem('notificationEnabled', notificationEnabled);
            updateNotificationIcon();
            if (notificationEnabled && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        });
    }
}

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('⚠️ Ce navigateur ne supporte pas les notifications');
        return;
    }
    if (Notification.permission === 'granted') {
        console.log('✅ Notifications déjà autorisées');
        return;
    }
    if (Notification.permission === 'denied') {
        console.log('⚠️ Notifications bloquées');
        notificationEnabled = false;
        localStorage.setItem('notificationEnabled', 'false');
        updateNotificationIcon();
        return;
    }
    if (notificationEnabled) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('✅ Permission accordée');
            } else {
                notificationEnabled = false;
                localStorage.setItem('notificationEnabled', 'false');
                updateNotificationIcon();
            }
        });
    }
}

function updateNotificationIcon() {
    const toggleBtn = document.getElementById('toggleNotificationsBtn');
    if (!toggleBtn) return;
    const icon = toggleBtn.querySelector('i');
    if (!icon) return;
    if (notificationEnabled && Notification.permission === 'granted') {
        icon.className = 'fa-solid fa-bell';
        icon.style.color = '#3b82f6';
    } else {
        icon.className = 'fa-regular fa-bell';
        icon.style.color = 'var(--text-secondary)';
    }
}

// =====================================================
// 3. NOTIFICATION PUSH
// =====================================================
function sendPushNotification(title, body, icon = '/images/logo.png') {
    if (!notificationEnabled) return;
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, icon });
    } catch (e) {
        console.log('⚠️ Erreur push:', e);
    }
}

// =====================================================
// 4. SON
// =====================================================
function playNotificationSound() {
    if (!soundEnabled) return;
    try {
        const audio = new Audio('/sounds/Sale-notification-chime-sound-effect.mp3');
        audio.volume = 0.6;
        audio.play().catch(e => console.log('⚠️ Son bloqué:', e.message));
    } catch (e) {
        console.log('⚠️ Erreur son:', e.message);
    }
}

// =====================================================
// 5. TOAST
// =====================================================
function showNotificationToast(notif) {
    if (!notif) return;
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    const expediteurNom = notif.expediteur?.nom || 'Quelqu\'un';
    let text = '';
    switch (notif.type) {
        case 'like': text = `${expediteurNom} a aimé votre publication.`; break;
        case 'commentaire': text = `${expediteurNom} a commenté votre publication.`; break;
        case 'demande_ami': text = `${expediteurNom} vous a envoyé une demande d'ami.`; break;
        case 'ami_accepte': text = `${expediteurNom} a accepté votre demande d'ami.`; break;
        case 'message': text = `Nouveau message de ${expediteurNom}`; break;
        default: text = 'Nouvelle notification';
    }
    toast.innerHTML = `<i class="fas fa-bell"></i> ${text}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// =====================================================
// 6. BADGE
// =====================================================
async function updateNotificationBadge() {
    try {
        const res = await fetch('/notifications/unread');
        const data = await res.json();
        
        const badge = document.getElementById('notifBadge');
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline-block';
            } else {
                badge.textContent = '';
                badge.style.display = 'none';
            }
        }
        const badgeMobile = document.getElementById('notifBadgeMobile');
        if (badgeMobile) {
            if (data.count > 0) {
                badgeMobile.textContent = data.count;
                badgeMobile.style.display = 'inline-block';
            } else {
                badgeMobile.textContent = '';
                badgeMobile.style.display = 'none';
            }
        }
    } catch (err) {
        console.log('⚠️ Erreur mise à jour badge:', err);
    }
}

// =====================================================
// 7. NOTIFICATION UNIFIÉE (VERSION FINALE)
// =====================================================
function notifyUser(notif) {
    console.log('🔔 notifyUser() appelé avec :', notif);

    playNotificationSound();

    const message = getNotificationMessage(notif);

    sendPushNotification(
        'Nouvelle notification',
        message
    );

    updateNotificationBadge();
    showNotificationToast(notif);
}

// =====================================================
// 8. EXPOSITION GLOBALE
// =====================================================
window.notifyUser = notifyUser;
window.playNotificationSound = playNotificationSound;
window.sendPushNotification = sendPushNotification;
window.updateNotificationBadge = updateNotificationBadge;
window.notificationEnabled = notificationEnabled;

// =====================================================
// 9. NAVIGATION AJAX (SPA) — CORRIGÉ
// =====================================================
let _spaScripts = [];

async function navigateTo(url, pushState = true) {
    if (!url || url === window.location.href) return;
    if (url.includes('/logout')) { window.location.href = url; return; }

    try {
        document.body.classList.add('page-loading');

        const response = await fetch(url);
        if (!response.ok) { window.location.href = url; return; }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Pages de chat → rechargement complet (socket.io, WebRTC complexes)
        if (doc.body && doc.body.classList.contains('chat-page')) {
            window.location.href = url;
            return;
        }

        const newMain = doc.querySelector('.main-container');
        const curMain = document.querySelector('.main-container');
        if (!newMain || !curMain) { window.location.href = url; return; }

        // Nettoyer les scripts injectés précédemment
        _spaScripts.forEach(s => { try { s.remove(); } catch(e) {} });
        _spaScripts = [];

        // Remplacer le contenu principal
        curMain.innerHTML = newMain.innerHTML;

        // Mettre à jour le titre
        const newTitle = doc.querySelector('title');
        if (newTitle) document.title = newTitle.textContent;

        // ✅ Exécuter les scripts inline de la nouvelle page
        doc.querySelectorAll('body script:not([src])').forEach(oldScript => {
            const content = oldScript.textContent.trim();
            if (!content) return;
            const s = document.createElement('script');
            s.textContent = '(()=>{\n' + content + '\n})();';
            document.body.appendChild(s);
            _spaScripts.push(s);
        });

        // ✅ Charger les scripts externes (boutique, etc.)
        doc.querySelectorAll('body script[src]').forEach(oldScript => {
            const src = oldScript.getAttribute('src');
            if (!src) return;
            // Éviter les doublons
            if (document.querySelector(`script[src="${src}"]`)) return;
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            document.body.appendChild(s);
            _spaScripts.push(s);
        });

        // ✅ Réinitialiser les effets de profil sur la nouvelle page
        requestAnimationFrame(function() { initProfileEffects(); });

        // ✅ Déclencher un événement pour dire que la page est chargée
        document.dispatchEvent(new CustomEvent('page-loaded'));

        if (pushState) {
            history.pushState({ url: url, scroll: window.scrollY }, '', url);
        }

        window.scrollTo(0, 0);

    } catch (err) {
        console.log('Erreur navigation AJAX:', err);
        window.location.href = url;
    } finally {
        document.body.classList.remove('page-loading');
    }
}

// Délégation globale — intercepte tous les liens internes
document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '#' || href === '/logout') return;
    if (href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (a.hasAttribute('download')) return;
    if (a.getAttribute('target') && a.getAttribute('target') !== '_self') return;
    e.preventDefault();
    navigateTo(new URL(href, location.origin).href);
});

// ✅ Gestion de la touche RETOUR (popstate)
window.addEventListener('popstate', function(e) {
    if (e.state && e.state.url) {
        navigateTo(e.state.url, false);
        return;
    }
    navigateTo(window.location.href, false);
});

// =====================================================
// 10. SOCKET.IO NOTIFICATIONS (SOCKET UNIQUE)
// =====================================================
function getNotificationMessage(notif) {
    const expediteurNom = notif.expediteur?.nom || 'Quelqu\'un';
    switch (notif.type) {
        case 'like': return `${expediteurNom} a aimé votre publication.`;
        case 'commentaire': return `${expediteurNom} a commenté votre publication.`;
        case 'demande_ami': return `${expediteurNom} vous a envoyé une demande d'ami.`;
        case 'ami_accepte': return `${expediteurNom} a accepté votre demande d'ami.`;
        case 'message': return `Nouveau message de ${expediteurNom}`;
        default: return 'Nouvelle notification';
    }
}

function initSocketNotifications() {
    // Éviter les connexions multiples
    if (window.notificationSocket) {
        console.log('ℹ️ Socket déjà initialisé');
        return;
    }

    // Récupération de currentUserId
    let currentUserId = null;
    
    const userElement = document.querySelector('[data-user-id]');
    if (userElement) {
        currentUserId = userElement.dataset.userId;
        console.log('✅ currentUserId trouvé via data-user-id:', currentUserId);
    }
    
    if (!currentUserId) {
        const scriptTags = document.querySelectorAll('script');
        for (const script of scriptTags) {
            const match = script.textContent.match(/const\s+currentUserId\s*=\s*["']([^"']+)["']/);
            if (match) {
                currentUserId = match[1];
                console.log('✅ currentUserId trouvé via script:', currentUserId);
                break;
            }
        }
    }
    
    if (!currentUserId) {
        const bodyUserId = document.body.getAttribute('data-user-id');
        if (bodyUserId) {
            currentUserId = bodyUserId;
            console.log('✅ currentUserId trouvé via body:', currentUserId);
        }
    }

    if (!currentUserId) {
        console.error('❌ Impossible de récupérer currentUserId !');
        return;
    }

    if (typeof io === 'undefined') {
        console.error('❌ Socket.IO non chargé !');
        return;
    }

    // Socket unique avec userId
    window.notificationSocket = io({
        query: { userId: currentUserId }
    });

    const socket = window.notificationSocket;
    
    socket.on('connect', function() {
        console.log('✅ Socket.IO connecté avec userId:', currentUserId);
    });

    socket.on('connect_error', function(err) {
        console.error('❌ Erreur de connexion Socket.IO:', err);
    });

    // Écoute des notifications
    socket.on('notification', function(notif) {
        console.log('🔔 Événement notification reçu brut :', notif);
        console.log('🔔 Destinataire reçu:', notif.destinataire, '| CurrentUserId:', currentUserId);
        
        if (String(notif.destinataire) !== String(currentUserId)) {
            console.log('🔔 Notification ignorée (pas pour moi)');
            return;
        }
        
        console.log('🔔 Notification acceptée, appel de notifyUser()');
        notifyUser(notif);
    });
    
    console.log('✅ Écoute des notifications Socket.IO activée (socket unique)');
}

// =====================================================
// 11. RÉINITIALISATION DES ÉVÉNEMENTS APRÈS CHARGEMENT AJAX
// =====================================================
document.addEventListener('page-loaded', function() {
    console.log('📄 Page chargée dynamiquement, réinitialisation des événements...');

    // ✅ Réinitialiser les événements de la boutique (shop)
    document.querySelectorAll('.btn-shop-buy').forEach(btn => {
        // Supprimer les anciens événements pour éviter les doublons
        btn.removeEventListener('click', handleShopBuy);
        btn.addEventListener('click', handleShopBuy);
    });

    // ✅ Réinitialiser les événements des primes (bounties)
    document.querySelectorAll('.btn-accomplish').forEach(btn => {
        btn.removeEventListener('click', handleBountyAccomplish);
        btn.addEventListener('click', handleBountyAccomplish);
    });

    document.querySelectorAll('.btn-view-applicants').forEach(btn => {
        btn.removeEventListener('click', handleViewApplicants);
        btn.addEventListener('click', handleViewApplicants);
    });

    // ✅ Ajoute ici d'autres initialisations si besoin
    // (ex: création de primes, wallet, etc.)
});

// =====================================================
// 12. GESTIONNAIRES D'ÉVÉNEMENTS (BOUTIQUE, PRIMES, etc.)
// =====================================================

// Boutique : Acheter un article
async function handleShopBuy(e) {
    const btn = e.currentTarget;
    const itemId = btn.dataset.itemId;
    if (!itemId) return;

    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
        const res = await fetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId })
        });
        const data = await res.json();
        if (data.success) {
            alert('✅ Achat réussi !');
            location.reload(); // ou mettre à jour le solde dynamiquement
        } else {
            alert('❌ ' + (data.error || 'Erreur'));
        }
    } catch (err) {
        alert('❌ Erreur réseau');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Acheter';
    }
}

// Primes : Accomplir une prime
async function handleBountyAccomplish(e) {
    const btn = e.currentTarget;
    const bountyId = btn.dataset.id;
    if (!bountyId) return;

    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
        const res = await fetch(`/api/bounties/${bountyId}/accomplish`, {
            method: 'POST'
        });
        const data = await res.json();
        if (data.ok) {
            alert(`✅ Félicitations ! +${data.reward} crédits !`);
            location.reload();
        } else {
            alert('❌ ' + (data.reason || 'Erreur'));
        }
    } catch (err) {
        alert('❌ Erreur réseau');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Accomplir';
    }
}

// Primes : Voir les candidats
async function handleViewApplicants(e) {
    const btn = e.currentTarget;
    const bountyId = btn.dataset.id;
    if (!bountyId) return;

    try {
        const res = await fetch(`/api/bounties/${bountyId}/applicants`);
        const data = await res.json();
        if (data.success) {
            // Afficher les candidats dans une modal ou une alerte
            const names = data.applicants.map(a => a.user?.nom || 'Inconnu').join('\n');
            alert(`👥 Candidats :\n${names || 'Aucun'}`);
        } else {
            alert('❌ ' + (data.error || 'Erreur'));
        }
    } catch (err) {
        alert('❌ Erreur réseau');
        console.error(err);
    }
}

// =====================================================
// =====================================================
// 13. EFFETS DE PROFIL — Particules thématiques
// =====================================================
(function() {
    const FX = {
        butterfly: function(c1, c2) {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 18" width="22" height="18">'
                + '<ellipse cx="6"  cy="5"  rx="6"   ry="5"   fill="' + c1 + '" opacity="0.92"/>'
                + '<ellipse cx="16" cy="5"  rx="6"   ry="5"   fill="' + c2 + '" opacity="0.92"/>'
                + '<ellipse cx="7"  cy="13" rx="4"   ry="3.5" fill="' + c1 + '" opacity="0.78"/>'
                + '<ellipse cx="15" cy="13" rx="4"   ry="3.5" fill="' + c2 + '" opacity="0.78"/>'
                + '<ellipse cx="11" cy="9"  rx="1.2" ry="6"   fill="#3b0764"/>'
                + '</svg>';
        },
        star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18">'
            + '<polygon points="9,1 11.2,6.5 17.5,7 13,11 14.5,17.5 9,14 3.5,17.5 5,11 0.5,7 6.8,6.5" fill="#fbbf24"/>'
            + '</svg>',
        flame: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 22" width="14" height="22">'
            + '<path d="M7,22 C1,18 0,11 4,6 C4,10 6,11 7,8 C7,13 10,13 10,7 C14,12 13,18 7,22Z" fill="#f97316" opacity="0.95"/>'
            + '<path d="M7,20 C3,17 2,12 5,8 C5,12 7,12 7,9 C7,13 9,12 9,9 C12,12 11,17 7,20Z"  fill="#fcd34d" opacity="0.85"/>'
            + '<path d="M7,18 C5,16 4.5,12 6,10 C6,13 7.5,13 7.5,11 C9,13 8.5,16 7,18Z"         fill="#fef3c7" opacity="0.7"/>'
            + '</svg>',
        sparkle: function(color) {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="18" height="18">'
                + '<path d="M10,0 L11.8,8.2 L20,10 L11.8,11.8 L10,20 L8.2,11.8 L0,10 L8.2,8.2 Z" fill="' + color + '"/>'
                + '</svg>';
        },
        diamond: function(color) {
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 24" width="16" height="20">'
                + '<polygon points="10,0 20,8 10,24 0,8" fill="' + color + '" opacity="0.9"/>'
                + '<polygon points="10,0 20,8 10,10 0,8" fill="white" opacity="0.5"/>'
                + '<polygon points="5,8 10,0 15,8" fill="white" opacity="0.2"/>'
                + '</svg>';
        }
    };

    function makeOrbit(wrapper, orbitR, w, h, orbitDur, orbitDir, innerAnim, innerDur, delay, html) {
        var orbit = document.createElement('span');
        orbit.className = 'fx-orbit';
        orbit.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:10;'
            + 'animation:' + orbitDir + ' ' + orbitDur + 's linear ' + delay + 's infinite;';

        var inner = document.createElement('span');
        inner.className = 'fx-inner';
        inner.style.cssText = 'position:absolute;width:' + w + 'px;height:' + h + 'px;'
            + 'left:' + orbitR + 'px;top:' + (-h / 2) + 'px;display:block;pointer-events:none;'
            + 'animation:' + innerAnim + ' ' + innerDur + 's ease-in-out ' + delay + 's infinite;';
        inner.innerHTML = html;

        orbit.appendChild(inner);
        wrapper.appendChild(orbit);
    }

    function makeStatic(wrapper, angle, orbitR, w, h, anim, animDur, delay, html) {
        var rad = (angle * Math.PI) / 180;
        var x = Math.cos(rad) * orbitR;
        var y = Math.sin(rad) * orbitR;

        var p = document.createElement('span');
        p.className = 'fx-static';
        p.style.cssText = 'position:absolute;'
            + 'left:calc(50% + ' + x + 'px - ' + (w / 2) + 'px);'
            + 'top:calc(50% + ' + y + 'px - ' + (h / 2) + 'px);'
            + 'width:' + w + 'px;height:' + h + 'px;display:block;pointer-events:none;z-index:10;'
            + 'animation:' + anim + ' ' + animDur + 's ease-in-out ' + delay + 's infinite;';
        p.innerHTML = html;
        wrapper.appendChild(p);
    }

    window.initProfileEffects = function() {
        var selectors = '.effect-sparkle,.effect-flame,.effect-star,.effect-diamond,.effect-butterfly';
        document.querySelectorAll(selectors).forEach(function(wrapper) {
            if (wrapper.dataset.fxInit) return;
            wrapper.dataset.fxInit = '1';

            var img = wrapper.querySelector('img');
            if (!img) return;

            var imgW = img.offsetWidth;
            if (!imgW) {
                var cs = window.getComputedStyle(img);
                imgW = parseInt(cs.width) || 46;
            }
            var orbitR = Math.round(imgW / 2) + (imgW > 60 ? 22 : 14);
            var L = imgW > 60;

            // Forcer overflow visible sur le wrapper et son parent pour que les particules ne soient pas coupées
            wrapper.style.overflow = 'visible';
            if (wrapper.parentElement) wrapper.parentElement.style.overflow = 'visible';

            var type = '';
            wrapper.classList.forEach(function(c) { if (c.startsWith('effect-')) type = c.replace('effect-', ''); });
            if (!type) return;

            if (type === 'butterfly') {
                var bColors = [
                    ['#e879f9','#c026d3'],
                    ['#f0abfc','#a21caf'],
                    ['#c084fc','#7c3aed'],
                    ['#e879f9','#6d28d9']
                ];
                var bAngles = [0, 90, 180, 270];
                var bDurs   = [0.32, 0.38, 0.28, 0.35];
                var bDels   = [0, -0.1, -0.18, -0.26];
                var bw = L ? 28 : 18, bh = L ? 22 : 14;
                for (var i = 0; i < 4; i++) {
                    makeStatic(wrapper, bAngles[i], orbitR, bw, bh, 'fxWingFlap', bDurs[i], bDels[i], FX.butterfly(bColors[i][0], bColors[i][1]));
                }
            }

            if (type === 'flame') {
                var fAngles = [0, 72, 144, 216, 288];
                var fDurs   = [0.55, 0.65, 0.45, 0.70, 0.50];
                var fDels   = [0, -0.13, -0.25, -0.38, -0.48];
                var fw = L ? 18 : 12, fh = L ? 28 : 18;
                for (var i = 0; i < 5; i++) {
                    makeStatic(wrapper, fAngles[i], orbitR, fw, fh, 'fxFlicker', fDurs[i], fDels[i], FX.flame);
                }
            }

            if (type === 'star') {
                var sAngles = [0, 60, 120, 180, 240, 300];
                var sDurs   = [0.9, 1.1, 0.7, 1.3, 0.85, 1.0];
                var sDels   = [0, -0.15, -0.30, -0.45, -0.60, -0.75];
                var sw = L ? 24 : 15, sh = L ? 24 : 15;
                for (var i = 0; i < 6; i++) {
                    makeStatic(wrapper, sAngles[i], orbitR, sw, sh, 'fxTwinkle', sDurs[i], sDels[i], FX.star);
                }
            }

            if (type === 'sparkle') {
                var spColors = ['#a855f7','#818cf8','#e879f9','#6366f1','#c084fc','#38bdf8'];
                var spDurs   = [1.6, 2.0, 1.4, 1.8, 2.2, 1.5];
                var spDels   = [0, -0.5, -1.0, -1.5, -0.8, -1.3];
                var spw = L ? 24 : 16, sph = L ? 24 : 16;
                for (var i = 0; i < 6; i++) {
                    var ang = (i / 6) * 360 - 90;
                    makeStatic(wrapper, ang, orbitR, spw, sph, 'fxSparklePopIn', spDurs[i], spDels[i], FX.sparkle(spColors[i]));
                }
            }

            if (type === 'diamond') {
                var dColors = ['#67e8f9','#0ea5e9','#a5f3fc','#38bdf8','#7dd3fc'];
                var dAngles = [30, 102, 174, 246, 318];
                var dDurs   = [1.2, 1.8, 1.0, 1.5, 1.3];
                var dDels   = [0, -0.36, -0.72, -1.08, -1.44];
                var dw = L ? 20 : 13, dh = L ? 26 : 16;
                for (var i = 0; i < 5; i++) {
                    makeStatic(wrapper, dAngles[i], orbitR, dw, dh, 'fxDiamondGlint', dDurs[i], dDels[i], FX.diamond(dColors[i]));
                }
            }
        });
    };
}());

// =====================================================
// 14. DÉMARRAGE
// =====================================================
// Backup : relancer les effets une fois tout chargé (images incluses)
window.addEventListener('load', function() { initProfileEffects(); });
console.log('📦 main.js chargé');
