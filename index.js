äconst { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs'); // Modul zum Lesen von Dateien

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
            console.log('Bot ist online und einsatzbereit!');
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

        // ==================== BEFEHLS-LOGIK ====================
        
        // 1. Das dynamische Menü (lädt aus commands.json)
        if (command === 'menu' || command === 'hilfe' || command === 'help') {
            try {
                // commands.json einlesen und in ein JavaScript-Objekt umwandeln
                const commandsData = JSON.parse(fs.readFileSync('./commands.json', 'utf8'));
                
                let menuText = `*⚙️ POISINIOUSLY BOT MENÜ* ⚙️\n\n` +
                               `Hier ist eine Übersicht aller verfügbaren Befehle. Nutze das Präfix *${PREFIX}* vor jedem Befehl.\n\n`;

                // Schleife durch alle Befehle in der JSON-Datei
                for (const cmd in commandsData) {
                    const info = commandsData[cmd];
                    menuText += `• \`${PREFIX}${info.usage}\` - ${info.description}\n`;
                }

                await sock.sendMessage(from, { text: menuText });
            } catch (error) {
                console.error("Fehler beim Laden der commands.json:", error);
                await sock.sendMessage(from, { text: '❌ Fehler: Die Befehlsliste konnte nicht geladen werden.' });
            }
        }

       // 2. Ping-Befehl mit echter Zeitmessung
        if (command === 'ping') {
            const timestamp = Date.now(); // Aktuelle Zeit in Millisekunden speichern
            
            // Erste Nachricht senden
            const pingMsg = await sock.sendMessage(from, { text: '🏓 *Pong...*' });
            
            // Differenz berechnen (aktuelle Zeit minus Startzeit)
            const latency = Date.now() - timestamp; 

            // Die gesendete Nachricht mit dem echten Ping-Wert aktualisieren (editieren)
            await sock.sendMessage(from, { 
                text: `🏓 *Pong!*\n\n• *Verzögerung:* \`${latency}ms\``,
                edit: pingMsg.key
            });
        }}

        // 3. JID-Befehl (User-ID auslesen)
        if (command === 'jid') {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;

            if (!mentioned || mentioned.length === 0) {
                await sock.sendMessage(from, { text: `⚠️ Bitte markiere einen Nutzer!\nBeispiel: *${PREFIX}jid @Nutzer*` });
                return;
            }

            const targetJid = mentioned[0];
            const responseText = `🆔 *User-JID extrahiert:*\n\n• *Benutzer:* @${targetJid.split('@')[0]}\n• *ID:* \`${targetJid}\``;

            await sock.sendMessage(from, { 
                text: responseText,
                mentions: [targetJid]
            });
        }

        // 4. GJID-Befehl (Gruppen-ID auslesen)
        if (command === 'gjid') {
            if (!from.endsWith('@g.us')) {
                await sock.sendMessage(from, { text: '❌ Dieser Befehl kann nur innerhalb von Gruppen-Chats verwendet werden.' });
                return;
            }

            const responseText = `👥 *Gruppen-JID extrahiert:*\n\n• *ID:* \`${from}\``;
            await sock.sendMessage(from, { text: responseText });
        }

        // 5. Runtime-Befehl (Laufzeit)
        if (command === 'runtime') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            await sock.sendMessage(from, { text: `⏱️ *Aktuelle Bot-Laufzeit:* ${hours}h ${minutes}m ${seconds}s` });
        }
        // 6. Hidetag-Befehl (Heimliches Erwähnen aller Gruppenmitglieder)
        if (command === 'hidetag') {
            // 1. Prüfen, ob der Befehl in einer Gruppe genutzt wurde
            if (!from.endsWith('@g.us')) {
                await sock.sendMessage(from, { text: '❌ Dieser Befehl kann nur in Gruppen verwendet werden!' });
                return;
            }

            // 2. Den Text herausfiltern, den der Nutzer mitschicken will
            const messageText = args.join(' ');
            if (!messageText) {
                await sock.sendMessage(from, { text: `⚠️ Bitte gib eine Nachricht an!\nBeispiel: *${PREFIX}hidetag Hallo zusammen!*` });
                return;
            }

            try {
                // 3. Gruppen-Metadaten vom Server abrufen (um die Mitglieder-Liste zu bekommen)
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;

                // 4. Ein Array mit den JIDs aller Mitglieder erstellen
                const jids = participants.map(p => p.id);

                // 5. Die Nachricht senden und das JID-Array im 'mentions'-Feld mitschicken
                await sock.sendMessage(from, { 
                    text: messageText, 
                    mentions: jids 
                });

            } catch (error) {
                console.error("Fehler beim Hidetag:", error);
                await sock.sendMessage(from, { text: '❌ Fehler beim Abrufen der Gruppenmitglieder. Ist der Bot in der Gruppe?' });
            }
        }
    });
}

connectToWhatsApp();
        