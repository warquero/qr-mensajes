# QR Mensajes 🎁

Mensajes personalizados (texto, audio o video) detrás de un código QR para
regalos sublimados. El QR se imprime/sublima en el producto; quien lo escanea
abre una página limpia con el mensaje.

**Costo de operación: $0** — 100% en planes gratuitos, sin método de pago:

| Pieza | Servicio | Rol |
|---|---|---|
| Frontend | **Netlify** (free) | Sitio estático: inicio, creador, vista y admin |
| Base de datos | **Supabase Postgres** (free) | Metadatos de mensajes, con RLS |
| Archivos | **Supabase Storage** (free, 1 GB) | Audios y videos del bucket `messages` |
| API | **Supabase Edge Functions** (free, 500k/mes) | Crear mensajes y panel admin |

---

## Cómo funciona

| Página | Ruta | Para qué |
|---|---|---|
| Inicio | `/` | Explicación del servicio |
| **Creador** | `/crear` | Cliente o empleado crea el mensaje: texto, audio o video (grabando desde el celular o subiendo archivo). Devuelve el QR listo para imprimir. |
| **Vista pública** | `/m/<id>` | Lo que abre el escaneo del QR. |
| **Panel admin** | `/admin` | Listado, pausar/activar, extender vigencia, borrar. |

Decisiones de diseño clave:

- **El QR apunta siempre a `/m/<id>`**, nunca al archivo directo. Si algún día
  se migra de hosting o de bucket, los QR ya impresos siguen funcionando.
- **IDs aleatorios de 12 caracteres** (~69 bits de entropía): imposible adivinar
  mensajes ajenos, no hace falta login para ver uno.
- **Seguridad**: la tabla `messages` tiene RLS sin políticas públicas — el
  acceso anónimo pasa solo por el RPC `get_message` (filtra por id + vigencia)
  y `count_message_view`. La escritura solo ocurre en las Edge Functions con
  la service role key del servidor (nunca llega al navegador).
- **Token del panel admin**: el navegador envía el token en el header
  `Authorization`; la función `admin` compara su hash SHA-256 contra la tabla
  protegida `app_config` en tiempo constante. El token en claro solo existe en
  el archivo local `.admin-token.txt` (excluido de git).
- **Expiración** (30 / 90 / 365 días): pasada la fecha, `get_message` deja de
  devolver el mensaje.

---

## Uso diario del taller

1. Abrir `https://<sitio>.netlify.app/crear` (ideal desde el celular del cliente).
2. Elegir tipo → escribir / grabar / subir → elegir vigencia → **Generar el QR**.
3. Descargar el QR en PNG (o copiar el enlace) y mandarlo a sublimar.
4. Gestionar mensajes existentes: `/admin` con el token (está en `.admin-token.txt`).

## Desarrollo local

```powershell
npm install        # solo instala el server de desarrollo (serve)
npm run dev        # http://localhost:5173
```

No hace falta backend local: la página ya habla con Supabase en producción.
Los mensajes que crees en dev son reales (y se ven en `/admin`).

## Configuración de infraestructura (solo referencia)

Ya está hecha para el proyecto actual; se documenta por si hay que recrearla.

1. **Supabase**: crear proyecto free (región sa-east-1) y aplicar las
   migraciones de `supabase/migrations` (SQL Editor → pegar y ejecutar):
   tabla `messages` con RLS, RPCs `get_message` / `count_message_view` /
   `extend_message`, tabla `app_config` y bucket público `messages`.
2. **Edge Functions**: desplegar `supabase/functions/create-message` y
   `supabase/functions/admin` (Dashboard → Edge Functions → Create).
   Ambas con **Verify JWT disabled**.
3. **Token admin**: generar un secreto largo, guardar su SHA-256 en
   `app_config.admin_token_sha256` y el texto plano en `.admin-token.txt`.
4. **Netlify**: conectar el repo de GitHub → build automático (config en
   `netlify.toml`, sin build command, publish `public`).

## Personalización

- **Nombre del taller**: `BRAND` en `public/js/config.js`.
- **URL/anon key de Supabase**: `SUPABASE` en `public/js/config.js` (la anon
  key es pública por diseño; la seguridad vive en el servidor).
- **Logo**: reemplazar `public/logo.svg` (mismo tamaño cuadrado).
- **Colores**: variables en `public/css/styles.css` (`:root`).

## Estructura del proyecto

```
qr-mensajes/
├── netlify.toml              # Config de Netlify (SPA + CSP)
├── public/                   # Frontend estático (SPA ligera, sin framework)
│   ├── index.html            # Único HTML (el router decide la vista)
│   ├── css/styles.css
│   ├── js/                   # app.js (router) + view / create / admin
│   │   └── config.js         # Marca + URL/anon key de Supabase
│   └── vendor/qrcode.js      # Generador de QR local (sin servicios externos)
├── supabase/
│   ├── functions/
│   │   ├── create-message/   # Edge Function: crea mensajes (pública)
│   │   └── admin/            # Edge Function: panel admin (Bearer token)
│   └── migrations/           # SQL: tablas, RPCs, RLS y bucket
└── .admin-token.txt          # Token del panel (LOCAL, no va a git)
```

## Límites del free tier (y por qué no nos afectan)

| Recurso | Límite free | Uso estimado |
|---|---|---|
| Storage | 1 GB | ~180 MB steady-state con expiración a 1 año |
| Egreso | 5 GB/mes (+5 GB cacheados) | ~1,5 GB/mes con 200 ventas y video |
| Edge Functions | 500k invocaciones/mes | ~6.000/mes |
| Postgres | 500 MB | Metadatos: unos KB |

Nota: si el archivo supera 30 MB (límite de diseño), el creador lo rechaza.
Video de ~2-3 min a 720p entra holgado.

## Limitaciones actuales (fase de validación)

- Video hasta 30 MB por archivo.
- Un mensaje = texto + un archivo (audio o video).
- Sin dashboard de estadísticas (hay contador de vistas en `/admin`).
