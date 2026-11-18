# Reproductor

Reproductor de playlists con YouTube. Recibe la lista de videos en el enlace (después del #) y no guarda datos.

## Con la pantalla bloqueada

YouTube pausa sus videos al bloquear la pantalla o cambiar de app. En la pestaña **Archivos** se agregan archivos de audio (MP3, M4A…) que quedan guardados solo en ese dispositivo. Esas canciones suenan como en Spotify: en segundo plano, con la pantalla bloqueada y con ⏮ ⏯ ⏭ en la pantalla de bloqueo. Si el nombre del archivo trae artista y título ("Artista - Canción.mp3"), se une sola a esa canción de la lista. Con la pantalla bloqueada, el reproductor salta a la siguiente canción que tenga archivo.

## Videos que YouTube no deja poner aquí (error 100/101/150)

Si una canción no tiene otra versión guardada que sirva: 1) si tiene enlace de SoundCloud guardado, suena desde ahí (sin gastar cuota); 2) si no, se busca otra subida que sí se deje insertar (`videoEmbeddable` y `videoSyndicated`, título que contenga el de la canción y duración parecida) y se prueba al momento, hasta 3 copias; la que suene queda guardada como el video de la canción; 3) si nada sirve, sigue la próxima con un aviso. Cada búsqueda cuesta 100 unidades de cuota de la YouTube Data API (más 1 de los detalles); casi siempre basta una.

## SoundCloud

Suena con el reproductor oficial de SoundCloud (Widget API). Buscar en SoundCloud pide un `client_id` y SoundCloud no da nuevos, así que no se busca allí: se pega el enlace de una canción en el buscador (sale como resultado; ＋ la guarda en una playlist) o en ⋯ › Pegar enlace de una canción, que lo deja guardado para ella (campo `sc`).
