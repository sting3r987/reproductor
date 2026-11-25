# Reproductor

Nuestras playlists con YouTube, para dos cuentas: <https://sting3r987.github.io/reproductor/>

Es una sola página (`index.html`) en GitHub Pages. Los datos (catálogo, playlists, historial) viven en Firebase (Firestore) y se entra con Google. Lo que uno guarda, el otro lo ve al instante.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app: pantalla, estilos y lógica |
| `lib.js` | Funciones puras (búsquedas, filtros, cambios de listas). Las usa la app y las prueban los tests |
| `sw.js` | Modo sin conexión: guarda la app para que abra sin señal |
| `manifest.webmanifest`, `icons/` | Para instalarla como app en el celular |
| `config.js` | Configuración pública de Firebase y clave de YouTube (restringida al dominio) |
| `firestore.rules` | Quién puede leer y escribir. **Se publican a mano** en la consola de Firebase |
| `player.html` | Reproductor anterior, sin cuenta: recibe la lista en el enlace (`#d=…`) y no guarda nada |
| `tests/` | Pruebas (ver «Desarrollo») |

## Instalar como app

En Android (Chrome o Brave): menú ⋮ → **Instalar app** o **Agregar a pantalla de inicio**. En iPhone (Safari): Compartir → **Agregar a inicio**. Abre a pantalla completa, sin barra de direcciones.

## Sin conexión

- La app abre sin señal con lo último que vio (la guarda `sw.js`; los datos, la caché de Firestore).
- Lo que cambies sin señal queda en cola, aunque cierres la app, y se sube solo al volver. Abajo aparece un aviso mientras no hay conexión.
- Sin señal solo suenan los **archivos de audio** guardados en el teléfono (YouTube necesita internet).

## Guardado sin pisarse

Cada cambio (agregar, quitar, mover, renombrar, cambiar video) se vuelve a aplicar sobre lo último que hay en el servidor (transacción de Firestore). Si los dos editan casi a la vez, quedan los dos cambios.

## Copias de seguridad

- **Automática**: una vez al día, la primera vez que alguno abre la app con conexión, se guarda una copia del catálogo y las playlists en `copias/<fecha>`, más el historial de escuchadas de cada cuenta. Quedan las últimas 14.
- **Restaurar**: menú de la cuenta → **Restaurar…** (o abrir con `?restaurar`). Antes de restaurar se guarda cómo estaba todo en `copias/antes-de-restaurar`. Las playlists creadas después de la copia se conservan.
- **Manual**: menú de la cuenta → **Descargar copia** (archivo .json con catálogo, playlists e historial). Se carga con `?restaurar`.

## Acceso

Entran las cuentas de Google de la lista `config/acceso` (campo `emails`) en Firestore. La lista no está en `firestore.rules` porque el repositorio es público.

Cada cuenta que ya tiene acceso se anota sola en esa lista al abrir la app. Para cambiar a las reglas nuevas:

1. Que las dos cuentas abran la app una vez con la versión nueva.
2. En la consola de Firebase → Firestore → Datos, revisar que `config/acceso` tenga los dos correos en `emails`.
3. Firestore → Reglas: pegar el contenido de `firestore.rules` y **Publicar**.

Para dar acceso a otra cuenta: agregar su correo (en minúsculas) a `emails` en `config/acceso`.

## Con la pantalla bloqueada

YouTube pausa sus videos al bloquear la pantalla o cambiar de app. En la pestaña **Archivos** se agregan archivos de audio (MP3, M4A…) que quedan guardados solo en ese dispositivo. Esas canciones suenan como en Spotify: en segundo plano, con la pantalla bloqueada y con ⏮ ⏯ ⏭ en la pantalla de bloqueo. Si el nombre del archivo trae artista y título ("Artista - Canción.mp3"), se une sola a esa canción de la lista. Con la pantalla bloqueada, el reproductor salta a la siguiente canción que tenga archivo.

## Videos que YouTube no deja poner aquí (error 100/101/150)

Si una canción no tiene otra versión guardada que sirva: 1) si tiene enlace de SoundCloud guardado, suena desde ahí (sin gastar cuota); 2) si no, se busca otra subida que sí se deje insertar (`videoEmbeddable` y `videoSyndicated`, título que contenga el de la canción y duración parecida) y se prueba al momento, hasta 3 copias; la que suene queda guardada como el video de la canción; 3) si nada sirve, sigue la próxima con un aviso y la canción queda en la pestaña **Bloqueadas**.

Cada búsqueda cuesta 100 unidades de cuota de la YouTube Data API (más 1 de los detalles). Lo buscado por cada canción se recuerda 7 días en el dispositivo: una canción que ya gastó sus 3 intentos no vuelve a buscar cada vez que se abre la app (máximo 303 unidades por canción por semana).

## Bloqueadas

La pestaña **Bloqueadas** junta las canciones que llegaron al último paso (YouTube no deja ponerlas aquí y no hubo otra copia). La lista es de los dos y vive en el catálogo (`catalog/main`, campo `sinrep`: clave, título, artista, fecha y código de error de YouTube), se guarda sin pisarse como el resto y va en las copias diarias. Por cada canción:

- **Buscar**: abre una búsqueda web del título y el artista en otra pestaña (la app no descarga nada).
- **Poner archivo**: eliges un archivo de audio del aparato (MP3, M4A, AAC, OGG, WAV, OPUS o WEBM). Se guarda solo en ese aparato y ese navegador (IndexedDB `np-audio`, unido a la canción por su clave; nada sube a Firebase). Desde ese momento la canción suena desde el archivo en cualquier playlist, con los controles de siempre y la pantalla de bloqueo, y arriba dice «Desde tu archivo». También se pone, cambia o quita desde ⋯ en cualquier canción.
- **Pegar SoundCloud**: el mismo campo de ⋯ › Pegar enlace; con el enlace guardado sale de la lista para los dos.

Con archivo en un aparato deja de contar en ese aparato, pero sigue en la lista para el otro (que no tiene el archivo); en «Ver juntos» la otra persona tampoco lo tiene. Quitar el archivo la devuelve a la lista; si otro video llega a sonar, sale sola. Si el aparato no tiene espacio, la app lo avisa y no guarda nada.

## SoundCloud

Suena con el reproductor oficial de SoundCloud (Widget API). Buscar en SoundCloud pide un `client_id` y SoundCloud no da nuevos, así que no se busca allí: se pega el enlace de una canción en el buscador (sale como resultado; ＋ la guarda en una playlist) o en ⋯ › Pegar enlace de una canción, que lo deja guardado para ella (campo `sc`).

## 👥 Ver juntos

Comparte un enlace (`?juntos=<id>`); lo que suena en un teléfono suena en el otro al mismo tiempo. Viajan hasta 300 canciones de la cola (las que siguen, en el orden en que van a sonar). Las sesiones vencidas de cada cuenta se borran solas una vez al día.

## Repetir canciÃ³n

BotÃ³n âŸ² con un 1 en la fila de abajo del reproductor (junto a Volumen): al terminar la canciÃ³n vuelve a empezar la misma, en YouTube, archivo o SoundCloud. Se recuerda en el aparato (`np-repeat`). Apagado, la cola ya da la vuelta sola al llegar al final. Con repetir encendido no hay fundido cruzado con la siguiente. No cuenta escuchas de mÃ¡s (no recarga la canciÃ³n). En Â«Ver juntosÂ» estÃ¡ apagado (no debe repetir en un solo telÃ©fono).

## Reproducir despuÃ©s

En â‹¯ de cualquier canciÃ³n (pestaÃ±a Todas): **â–¶ Reproducir despuÃ©s** la pone justo detrÃ¡s de la que suena, estÃ© o no en la cola (si no estaba, se agrega al final y se sube). Aviso Â«Suena despuÃ©s: Â«tÃ­tuloÂ»Â». Sin nada sonando, la reproduce. No cambia con Â«No repetir lo ya escuchadoÂ» (`fixNext` respeta la que se puso a mano). En Â«Ver juntosÂ» no se cambia la cola. La inserciÃ³n es `queueNext` en `lib.js`.

## Opciones en la dirección

| Agregar a la dirección | Para qué |
|---|---|
| `?debug` | Muestra el registro de lo que pasa (útil con la pantalla bloqueada, el Bluetooth o YouTube) |
| `?restaurar` | Restaurar una copia (automática o archivo descargado) |
| `?importar-audio` | Cargar versiones solo audio desde `audio_import.json` |
| `?juntos=<id>` | Entrar a una sesión de Ver juntos |

## Desarrollo

```bash
npm run check   # sintaxis de los scripts y que lo importado de lib.js exista (no instala nada)
npm test        # pruebas de lib.js (no instala nada)
npm install && npx playwright install chromium
npm run e2e     # prueba completa con los emuladores de Firebase (necesita Java 21)
```

La prueba completa abre la app en `localhost` con `?emu`: usa los emuladores con un proyecto de prueba y nunca los datos reales. Prueba dos cuentas editando a la vez, la copia diaria y su limpieza, restaurar, las reglas nuevas, borrar sesiones vencidas de Ver juntos, el modo sin conexión y Bloqueadas (anotar una canción bloqueada, ponerle un archivo de audio y que suene desde él, quitarlo, ⋯ › Poner archivo, SoundCloud). Sin el Chromium de Playwright usa el Chrome o Edge instalado (o `CHROMIUM=/ruta`); con `SHOTS=<carpeta>` guarda capturas de Bloqueadas a 390, 1400 y 320 px. En Windows el emulador de Firestore puede quedar abierto al terminar (puerto 8080): ciérralo antes de volver a correrla.

GitHub Actions corre todo en cada cambio (`.github/workflows/pruebas.yml`). Si se cambia la versión de `lib.js` (`?v=`) o de Firebase en `index.html`, hay que cambiarla también en `sw.js` (`npm run check` lo avisa).
