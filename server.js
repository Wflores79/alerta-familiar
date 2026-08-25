// ============================================================
// ALERTA FAMILIAR — Servidor backend
// ============================================================
// Qué hace este archivo:
// 1. Guarda tarjetas (nombre + contactos) en una base de datos local (SQLite)
// 2. Sirve la página web (frontend) al público
// 3. Cuando alguien presiona "Alertar a su familia", envía SMS/WhatsApp
//    reales usando Twilio, SIN revelar los contactos a quien escanea
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const { customAlphabet } = require('nanoid');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Base de datos ----------
// Se guarda en un archivo local llamado data.db. En Railway, monta un
// "volume" en /data para que esto no se borre en cada despliegue.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'both',
    FOREIGN KEY (card_id) REFERENCES cards(id)
  );
  CREATE TABLE IF NOT EXISTS alert_log (
    card_id TEXT PRIMARY KEY,
    last_sent_at INTEGER NOT NULL
  );
`);

// ---------- Generador de ID de tarjeta ----------
// Letras/números sin caracteres confusos (sin O/0, I/1, etc.)
const genId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

// ---------- Cliente de Twilio ----------
// Necesitas 3 valores de tu cuenta de Twilio (ver .env.example):
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_NUMBER, TWILIO_WHATSAPP_NUMBER
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos entre activaciones de la misma tarjeta

// ============================================================
// RUTAS DE LA API
// ============================================================

// Crear una tarjeta nueva con sus contactos
app.post('/api/cards', (req, res) => {
  const { name, contacts } = req.body;

  if (!name || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'Falta nombre o contactos.' });
  }

  const id = genId();
  const now = Date.now();

  const insertCard = db.prepare('INSERT INTO cards (id, name, created_at) VALUES (?, ?, ?)');
  const insertContact = db.prepare(
    'INSERT INTO contacts (card_id, name, phone, channel) VALUES (?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    insertCard.run(id, name, now);
    for (const c of contacts) {
      if (c.name && c.phone) {
        insertContact.run(id, c.name, c.phone, c.channel || 'both');
      }
    }
  });
  tx();

  res.json({ id, name });
});

// Obtener info PÚBLICA de una tarjeta (solo el nombre, nunca los contactos)
// Esto es lo que ve el testigo cuando escanea el QR.
app.get('/api/cards/:id', (req, res) => {
  const card = db.prepare('SELECT id, name FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

  const contactCount = db
    .prepare('SELECT COUNT(*) as n FROM contacts WHERE card_id = ?')
    .get(req.params.id).n;

  const lastAlert = db.prepare('SELECT last_sent_at FROM alert_log WHERE card_id = ?').get(req.params.id);
  const onCooldown = lastAlert && Date.now() - lastAlert.last_sent_at < COOLDOWN_MS;
  const cooldownRemainingMs = onCooldown ? COOLDOWN_MS - (Date.now() - lastAlert.last_sent_at) : 0;

  res.json({
    id: card.id,
    name: card.name,
    contactCount,
    onCooldown,
    cooldownRemainingMs
  });
});

// Activar la alerta — envía SMS/WhatsApp real a los contactos de esa tarjeta
app.post('/api/cards/:id/alert', async (req, res) => {
  const cardId = req.params.id;
  const card = db.prepare('SELECT id, name FROM cards WHERE id = ?').get(cardId);
  if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

  const lastAlert = db.prepare('SELECT last_sent_at FROM alert_log WHERE card_id = ?').get(cardId);
  if (lastAlert && Date.now() - lastAlert.last_sent_at < COOLDOWN_MS) {
    return res.status(429).json({
      error: 'Ya se envió una alerta recientemente para esta tarjeta.',
      cooldownRemainingMs: COOLDOWN_MS - (Date.now() - lastAlert.last_sent_at)
    });
  }

  const contacts = db.prepare('SELECT name, phone, channel FROM contacts WHERE card_id = ?').all(cardId);
  if (contacts.length === 0) {
    return res.status(400).json({ error: 'Esta tarjeta no tiene contactos configurados.' });
  }

  const messageText =
    `🚨 ALERTA FAMILIAR: Un testigo reporta que ${card.name} podría estar siendo ` +
    `detenido/a o retenido/a por autoridades de inmigración. Por favor active ahora ` +
    `su Plan Familiar de Emergencia.`;

  let smsSent = 0;
  let waSent = 0;
  const errors = [];

  for (const contact of contacts) {
    const wantsSms = contact.channel === 'sms' || contact.channel === 'both';
    const wantsWa = contact.channel === 'whatsapp' || contact.channel === 'both';

    if (twilioClient) {
      try {
        if (wantsSms && process.env.TWILIO_SMS_NUMBER) {
          await twilioClient.messages.create({
            body: messageText,
            from: process.env.TWILIO_SMS_NUMBER,
            to: contact.phone
          });
          smsSent++;
        }
        if (wantsWa && process.env.TWILIO_WHATSAPP_NUMBER) {
          await twilioClient.messages.create({
            body: messageText,
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: `whatsapp:${contact.phone}`
          });
          waSent++;
        }
      } catch (err) {
        // No exponemos el número del contacto en el error, solo que uno falló
        errors.push(err.message);
      }
    }
  }

  db.prepare(
    'INSERT INTO alert_log (card_id, last_sent_at) VALUES (?, ?) ' +
    'ON CONFLICT(card_id) DO UPDATE SET last_sent_at = excluded.last_sent_at'
  ).run(cardId, Date.now());

  res.json({
    ok: true,
    contactsNotified: contacts.length,
    smsSent,
    whatsappSent: waSent,
    errors: errors.length ? errors.length : undefined
  });
});

// ============================================================
// Servir el frontend (la página que ve la gente)
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Alerta Familiar backend corriendo en el puerto ${PORT}`);
  console.log(`Twilio configurado: ${twilioClient ? 'SÍ' : 'NO (revisa tu .env)'}`);
});
