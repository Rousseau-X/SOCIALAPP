const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: 'afcf22001@smtp-brevo.com',
        pass: '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'
    },
    tls: {
        rejectUnauthorized: false
    }
})

async function sendResetEmail(to, code) {
    try {
        const info = await transporter.sendMail({
            from: `"SocialApp" <afcf22001@smtp-brevo.com>`,
            to,
            subject: '🔐 Réinitialisation de votre mot de passe',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Réinitialisation mot de passe</title>
                    <style>
                        body { font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px; }
                        .container { max-width: 500px; margin: auto; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .code { font-size: 32px; font-weight: bold; color: #4f46e5; text-align: center; padding: 20px; background: #eef2ff; border-radius: 8px; letter-spacing: 4px; }
                        .footer { text-align: center; margin-top: 20px; color: #999; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2 style="text-align:center;">🔐 Réinitialisation du mot de passe</h2>
                        <p>Bonjour,</p>
                        <p>Vous avez demandé à réinitialiser votre mot de passe. Voici votre code de vérification :</p>
                        <div class="code">${code}</div>
                        <p>Ce code est valable pendant <strong>15 minutes</strong>.</p>
                        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
                        <div class="footer">Application SocialApp</div>
                    </div>
                </body>
                </html>
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
