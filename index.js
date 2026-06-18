const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');

async function connectToWhatsApp() {
    // 1. Session-Speicher initialisieren (speichert die Login-Daten lokal)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // 2. Bot-Instanz erstellen
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true // Zeigt den QR-Code direkt in der Konsole an
    });

    // 3. Auf Verbindungsänderungen hören
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Falls der QR-Code nicht automatisch kommt, hier manuell ausgeben
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut 
                : true;
            
            console.log('Verbindung geschlossen wegen:', lastDisconnect.error, ', Versuche Neustart:', shouldReconnect);
            
            // Automatisch neu verbinden, wenn nicht manuell ausgeloggt
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Erfolgreich mit WhatsApp verbunden!');
        }
    });

    // 4. Zugangsdaten speichern, wenn sie sich aktualisieren
    sock.ev.on('creds.update', saveCreds);

    // 5. Auf eingehende Nachrichten reagieren
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Ignoriere eigene Nachrichten oder leere Events

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        console.log(`Nachricht von ${from}: ${text}`);

        // Einfacher Ping-Pong-Test
        if (text && text.toLowerCase() === 'ping') {
            await sock.sendMessage(from, { text: 'Pong! 🏓' });
        }
    });
}

connectToWhatsApp();