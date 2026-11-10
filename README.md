# QR Mensajes 🎁

Mensajes personalizados (texto, audio o video) detrás de un código QR para
regalos sublimados. El QR se imprime/sublima en el producto; quien lo escanea
abre una página limpia con el mensaje del taller.

**Costo de operación: $0** dentro de los free tiers de Cloudflare
(Workers + D1 + R2), hasta ~200 ventas/mes con video.

---

## Cómo funciona

| Página | Ruta | Para qué |
|---|---|---|
| Inicio | `/` | Explicación del servicio |
| **Creador** | `/crear` | Cliente o empleado crea el mensaje: texto, audio o video (grabando desde el celular o subiendo archivo). Devuelve el QR listo para imprimir. |
| **Vista pública** | `/m/<id>` | Lo que abre el escaneo del QR: mensaje con la marca del taller. |
| **Panel admin** | `/admin` | Listado, pausar/activar, extender vigencia, borrar. |

Decisiones de diseño clave:

- **El QR apunta siempre a `/m/<id>`**, nunca al archivo directo. Si algún día
  se migra de hosting o de bucket, los QR ya impresos siguen funcionando.
- **IDs aleatorios de 12 caracteres** (~69 bits de entropía): imposible
  adivinar mensajes ajenos sin autenticación.
- **Expiración** (30 / 90 / 365 días): el storage no crece infinito; el cron
  diario borra archivos vencidos.
- **Ancho de banda gratis**: los archivos se sirven desde R2 (Cloudflare no
  cobra egreso), por eso el video no dispara la factura.
- **Seguridad**: CSP estricta sin JavaScript inline, MIME validado contra
  lista blanca, límite de 30 MB, token de admin comparado en tiempo constante,
  archivos servidos con `nosniff` y `Content-Disposition: inline`.

---

## Puesta en marcha (una sola vez)

Requisitos: Node 18+ y una cuenta gratuita de Cloudflare.

```powershell
# 1. Instalar dependencias
npm install

# 2. Iniciar sesión en Cloudflare (abre el navegador)
npx wrangler login

# 3. Crear la base de datos y copiar el ID que devuelve el comando
npx wrangler d1 create qr-mensajes
#    → pegar ese "database_id" en wrangler.jsonc (reemplaza REEMPLAZAR_CON_EL_DATABASE_ID)

# 4. Crear el bucket de archivos
npx wrangler r2 bucket create qr-mensajes-media

# 5. Crear las tablas en producción
npm run db:remote

# 6. Definir el token del panel admin (lo que pedirá /admin)
npx wrangler secret put ADMIN_TOKEN
#    → escribe un secreto largo, ej: un generador de contraseñas
```

## Desarrollo local

```powershell
# .dev.vars.local: copiar .dev.vars.example como .dev.vars y cambiar el token
Copy-Item .dev.vars.example .dev.vars

# Crear la BD local (simulada en .wrangler/)
npm run db:local

# Correr: http://localhost:8787
npm run dev
```

En local los archivos van a un simulador de R2 en disco: se puede probar todo
sin gastar nada.

## Desplegar

```powershell
npm run deploy
```

Devuelve la URL `https://qr-mensajes.<subdominio>.workers.dev`. Con esa URL:

1. Probar `/crear` desde el celular (permite grabar audio/video).
2. Escanear el QR generado y verificar la vista pública.
3. Opcional: dominio propio en el dashboard de Cloudflare
   (Workers → qr-mensajes → Domains). Es gratis y da mejor imagen de marca.

## Uso diario del taller

1. Abrir `https://<dominio>/crear` (ideal desde el celular del cliente).
2. Elegir tipo → escribir/grabar/subir → elegir vigencia → **Generar el QR**.
3. Descargar el QR en PNG (o copiar el enlace) y mandarlo a sublimar.
4. Para gestionar mensajes existentes: `/admin` con el token guardado.

## Personalización

- **Nombre del taller**: editar `BRAND` en `public/js/config.js`.
- **Logo**: reemplazar `public/logo.svg` (mismo tamaño cuadrado).
- **Colores**: variables en `public/css/styles.css` (`:root`).

## Verificación y salud

```powershell
npm run typecheck   # TypeScript del backend
```

- Logs en producción: dashboard de Cloudflare → Workers → qr-mensajes → Logs.
- Métricas de uso (requests, R2, D1): dashboard → Storage & Databases.

## Estructura del proyecto

```
qr-mensajes/
├── wrangler.jsonc        # Config de Cloudflare (D1, R2, cron, assets)
├── schema.sql            # Tabla de mensajes en D1
├── src/                  # Backend (Worker + API)
│   ├── index.ts          # Enrutador + cabeceras de seguridad + cron
│   ├── api.ts            # Crear / leer / contar vistas
│   ├── media.ts          # Servir archivos desde R2 (soporte Range)
│   ├── admin.ts          # Endpoints del panel (Bearer token)
│   ├── cron.ts           # Limpieza diaria de mensajes vencidos
│   ├── ids.ts            # IDs aleatorios no adivinables
│   └── http.ts           # Helpers JSON + comparación segura de secretos
└── public/               # Frontend estático (SPA ligera, sin framework)
    ├── index.html        # Único HTML (el router decide la vista)
    ├── css/styles.css
    ├── js/               # app.js (router) + view / create / admin
    └── vendor/qrcode.js  # Generador de QR local (sin servicios externos)
```

## Limitaciones actuales (fase de validación)

- Video hasta 30 MB por archivo (≈ 2-3 min a 720p). Si hace falta más, se
  agrega compresión en el navegador antes de subir.
- Sin dashboard de estadísticas por mensaje (hay contador de vistas en /admin).
- Un mensaje = texto + un archivo (audio o video). Mensajes con varios medios
  quedan para la fase 2.
