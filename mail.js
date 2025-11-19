const nodemailer = require("nodemailer");

const SMTP_USER = process.env.SMTP_USER || 'shop@proentry.id';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});

const send = async (to, subject, text, html, attachments) => {
    return transporter.sendMail({
        from: SMTP_USER,
        to,
        subject,
        text,
        html,
        attachments,
    });
}

module.exports = {
    send,
}