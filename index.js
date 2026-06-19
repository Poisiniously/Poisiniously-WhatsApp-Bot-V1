const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');

// Dein gewünschtes Präfix
const PREFIX = '€'; 

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut 
                : true;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('Bot ist online und bereit!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.imageMessage?.caption || "";

        if (!text.startsWith(PREFIX)) return;

        const args = text.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // ---- BEFEHLS-LOGIK ----
        
        // 1. Hilfe-Befehl
        if (command === 'help' || command === 'hilfe') {
            const menu = `*🤖 BOT MENÜ* \n\n` +
                         `${PREFIX}ping - Testet die Antwortzeit\n` +
                         `${PREFIX}jid @Nutzer - Zeigt die JID eines Nutzers an\n` +
                         `${PREFIX}runtime - Zeigt die Laufzeit des Bots`;
            await sock.sendMessage(from, { text: menu });
        }

        // 2. Ping-Befehl
        if (command === 'ping') {
            await sock.sendMessage(from, { text: '🏓 Pong!' });
        }

        // 3. JID-Befehl (Auslesen der WhatsApp-ID)
        if (command === 'jid') {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

            if (!mentioned || mentioned.length === 0) {
                await sock.sendMessage(from, { text: `Bitte markiere einen Nutzer. Beispiel: ${PREFIX}jid @Nutzer` });
                return;
            }

            const targetJid = mentioned[0];
            const responseText = `🆔 *JID Information:*\n\n• *Benutzer:* @${targetJid.split('@')[0]}\n• *JID:* \`${targetJid}\``;

            await sock.sendMessage(from, { 
                text: responseText,
                mentions: [targetJid]
            });
        }

        // 4. Runtime-Befehl
        if (command === 'runtime') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            await sock.sendMessage(from, { text: `⏱️ *Laufzeit:* ${hours}h ${minutes}m ${seconds}s` });
        }
    });
}

connectToWhatsApp();