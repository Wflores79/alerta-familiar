// ============================================================
// ALERTA FAMILIAR — Servidor backend (version estable)
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { customAlphabet } = require('nanoid');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.json');

function loadDB() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { cards: {}, alerts: {} };
  }
}
function saveDB(db) {
  const tmpPath = dbPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2));
  fs.renameSync(tmpPath, dbPath);
}

if (!fs.existsSync(dbPath)) {
  saveDB({ cards: {}, alerts: {} });
}

const genId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const COOLDOWN_MS = 5 * 60 * 1000;

app.post('/api/cards', (req, res) => {
  const { name, contacts } = req.body;
  if (!name || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'Falta nombre o contactos.' });
  }
  const db = loadDB();
  const id = genId();
  db.cards[id] = {
    name,
    contacts: contacts
      .filter(c => c.name && c.phone)
      .map(c => ({ name: c.name, phone: c.phone, channel: c.channel || 'both' })),
    created_at: Date.now()
  };
  saveDB(db);
  res.json({ id, name });
});

app.get('/api/cards/:id', (req, res) => {
  const db = loadDB();
  const card = db.cards[req.params.id];
  if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
  const lastAlert = db.alerts[req.params.id];
  const onCooldown = lastAlert && Date.now() - lastAlert.last_sent_at < COOLDOWN_MS;
  const cooldownRemainingMs = onCooldown ? COOLDOWN_MS - (Date.now() - lastAlert.last_sent_at) : 0;
  res.json({
    id: req.params.id,
    name: card.name,
    contactCount: card.contacts.length,
    onCooldown,
    cooldownRemainingMs
  });
});

app.post('/api/cards/:id/alert', async (req, res) => {
  const cardId = req.params.id;
  const db = loadDB();
  const card = db.cards[cardId];
  if (!card) return res.status(404).json({ error: 'Tarjeta no encontrada.' });

  const lastAlert = db.alerts[cardId];
  if (lastAlert && Date.now() - lastAlert.last_sent_at < COOLDOWN_MS) {
    return res.status(429).json({
      error: 'Ya se envio una alerta recientemente para esta tarjeta.',
      cooldownRemainingMs: COOLDOWN_MS - (Date.now() - lastAlert.last_sent_at)
    });
  }

  const contacts = card.contacts;
  if (contacts.length === 0) {
    return res.status(400).json({ error: 'Esta tarjeta no tiene contactos configurados.' });
  }

  const messageText =
    `ALERTA FAMILIAR: Un testigo reporta que ${card.name} podria estar siendo ` +
    `detenido/a o retenido/a por autoridades de inmigracion. Por favor active ahora ` +
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
        errors.push(err.message);
      }
    }
  }

  db.alerts[cardId] = { last_sent_at: Date.now() };
  saveDB(db);

  res.json({
    ok: true,
    contactsNotified: contacts.length,
    smsSent,
    whatsappSent: waSent,
    errors: errors.length ? errors : undefined
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Alerta Familiar backend corriendo en el puerto ${PORT}`);
  console.log(`Twilio configurado: ${twilioClient ? 'SI' : 'NO (revisa tus variables)'}`);
});
