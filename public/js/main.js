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

        // Ré-exécuter les scripts inline de la nouvelle page (dans un scope isolé)
        doc.querySelectorAll('body script:not([src])').forEach(oldScript => {
            const content = oldScript.textContent.trim();
            if (!content) return;
            const s = document.createElement('script');
            s.textContent = '(()=>{\n' + content + '\n})();';
            document.body.appendChild(s);
            _spaScripts.push(s);
        });

        // ✅ Sauvegarder l'URL dans l'historique
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

// ✅ Gestion de la touche RETOUR (popstate) — CORRIGÉE
window.addEventListener('popstate', function(e) {
    // Si on a une URL dans l'état, on y navigue
    if (e.state && e.state.url) {
        navigateTo(e.state.url, false);
        return;
    }
    
    // Sinon, on recharge la page (fallback)
    // Cela gère le cas où l'utilisateur arrive sur une URL sans état
    const currentUrl = window.location.href;
    navigateTo(currentUrl, false);
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
// 11. DÉMARRAGE
// =====================================================
console.log('📦 main.js chargé');
