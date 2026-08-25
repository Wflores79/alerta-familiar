# Alerta Familiar — Cómo publicar esto en internet (paso a paso)

No necesitas saber programar para seguir esta guía. Toma entre 30-45 minutos la primera vez.

---

## Parte 1 — Crear tu cuenta de Twilio (envío de SMS/WhatsApp)

1. Ve a **twilio.com** y crea una cuenta gratuita.
2. Una vez dentro, en el **Console Dashboard** verás dos valores: **Account SID** y **Auth Token**. Cópialos, los necesitarás en la Parte 3.
3. Ve a la sección **Phone Numbers → Buy a number** y compra un número con capacidad de SMS (cuesta ~$1/mes). Ese es tu `TWILIO_SMS_NUMBER`.
4. Para WhatsApp: ve a **Messaging → Try it out → Send a WhatsApp message**. Twilio te da un número de sandbox gratis para pruebas. (Para producción real con tu propio número de WhatsApp, Twilio requiere un proceso de aprobación de Meta — puedes empezar con el sandbox mientras tanto).
5. Cuando tengas cuentas fondeadas con crédito (Twilio cobra por mensaje enviado, unos centavos), ya puedes enviar mensajes reales.

## Parte 2 — Crear cuenta en Railway (donde vivirá tu servidor)

1. Ve a **railway.app** y crea una cuenta (puedes entrar con GitHub).
2. Click en **"New Project" → "Empty Project"**.
3. Sube los archivos de esta carpeta (`server.js`, `package.json`, la carpeta `public/`) — la forma más fácil es:
   - Crear una cuenta gratis en **github.com** si no tienes.
   - Crear un repositorio nuevo y subir todos estos archivos ahí (GitHub tiene un botón de "upload files", no necesitas comandos).
   - En Railway, elegir **"Deploy from GitHub repo"** y seleccionar ese repositorio.

## Parte 3 — Configurar las variables de entorno en Railway

1. Dentro de tu proyecto en Railway, ve a la pestaña **"Variables"**.
2. Agrega estas variables (copiando los valores de tu cuenta de Twilio de la Parte 1):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_SMS_NUMBER` (con formato +1XXXXXXXXXX)
   - `TWILIO_WHATSAPP_NUMBER` (con formato +1XXXXXXXXXX, sin la palabra "whatsapp:")
3. Railway asigna el `PORT` automáticamente — no necesitas configurarlo.

## Parte 4 — Guardar los datos de forma permanente

Por defecto, el archivo `data.db` (donde se guardan las tarjetas y contactos) se borraría cada vez que actualices el código. Para evitar esto:

1. En Railway, ve a tu servicio → pestaña **"Settings" → "Volumes"**.
2. Crea un volumen y móntalo en la ruta `/data`.
3. Agrega la variable de entorno `DB_PATH` con el valor `/data/data.db`.

## Parte 5 — Conectar tu dominio

1. Compra tu dominio (ej. en Namecheap) si no lo has hecho.
2. En Railway, ve a **Settings → Networking → Custom Domain** y sigue las instrucciones para apuntar tu dominio ahí (te dan un registro DNS que copias a tu proveedor de dominio).

## Parte 6 — Probar que todo funcione

1. Abre tu dominio en el navegador — deberías ver la pantalla de inicio de Alerta Familiar.
2. Crea una tarjeta de prueba con tu propio número de teléfono como contacto.
3. Abre el enlace de "ver como testigo" y presiona el botón de alerta.
4. Deberías recibir el SMS/WhatsApp real en tu teléfono en segundos.

---

## Parte 7 — Cómo cada persona (ej. "Wendy") pone su botón SOS en su celular

Esto ya está construido en el código — así es como se ve para el usuario final:

1. Wendy compra su tarjeta, abre el enlace/QR en su teléfono, y llena sus contactos de emergencia.
2. Toca **"Esta es mi tarjeta — guardar en este teléfono"**.
3. Su navegador le da la opción de **"Agregar a pantalla de inicio"** (en iPhone: botón de compartir → "Agregar a inicio". En Android: menú de tres puntos → "Instalar app" o "Agregar a pantalla de inicio").
4. Aparece un ícono de Alerta Familiar en su pantalla, igual que cualquier otra app.
5. **A partir de ahí, cada vez que Wendy toque ese ícono, la app abre DIRECTO en su botón SOS** — no ve menús ni tiene que buscar nada. Un toque para alertar a su familia.

Este comportamiento ya está programado: el teléfono recuerda que es "su" tarjeta (guardado de forma privada en ese dispositivo), así que la próxima vez que abra la app, salta directo a la pantalla de alerta.


**¿Qué pasa si algo no funciona?**
Revisa la pestaña "Logs" en Railway — ahí se muestra si Twilio está configurado correctamente (el servidor imprime "Twilio configurado: SÍ" o "NO" al iniciar).

**¿Cuánto cuesta mantener esto corriendo al mes?**
Railway: gratis en el plan de prueba, luego ~$5/mes. Twilio: solo pagas por mensaje enviado (centavos), más ~$1/mes por el número de teléfono.

**¿Es seguro?**
Los contactos se guardan en tu propia base de datos, nunca se muestran al testigo. Aun así, para producción real te recomendamos también activar HTTPS (Railway lo hace automático) y revisar tu aviso de privacidad con un abogado.
