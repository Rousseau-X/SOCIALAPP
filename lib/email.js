const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // ✅ Ajoute ces options pour éviter le timeout
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
})

async function sendResetEmail(to, code) {
    try {
        const info = await transporter.sendMail({
            from: `"SocialApp" <${process.env.EMAIL_USER}>`,
            to,
            subject: '🔐 Réinitialisation de votre mot de passe',
            html: `
                <div style="font-family:Arial;padding:20px;max-width:500px;margin:auto;background:#f8f9fb;border-radius:10px;">
                    <h2 style="color:#4f46e5;">🔐 Réinitialisation</h2>
                    <p>Voici votre code :</p>
                    <div style="font-size:32px;font-weight:bold;color:#4f46e5;background:#eef2ff;padding:20px;border-radius:8px;text-align:center;letter-spacing:4px;">
                        ${code}
                    </div>
                    <p style="margin-top:16px;">Ce code est valable <strong>15 minutes</strong>.</p>
                    <p style="font-size:12px;color:#999;">SocialApp</p>
                </div>
            `
        })
        console.log('✅ Email envoyé à :', to)
        return info
    } catch (err) {
        console.error('❌ Erreur envoi email:', err.message)
        throw err
    }
}

module.exports = { sendResetEmail }
