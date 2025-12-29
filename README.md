# dj1free-player (from scratch)

## Qué incluye
- Home (destacado + álbumes + tracks + artistas)
- Vista Artistas
- Vista Artista
- Vista Release (álbum o single)
- Reproductor dock (preview 30s) + botones Spotify / YouTube Music

## Importante para estabilidad
- Sin Service Worker por defecto (evita cachés “zombi” en iOS/Safari).
- Rutas 100% relativas + hash routing (compatible con GitHub Pages).

## Cómo usar tus assets
Copia tu carpeta `assets/` al root del repo manteniendo rutas como:
- assets/artists/dj1free.jpg
- assets/covers/dj1free/subelo.jpg
- assets/previews/dj1free/singles/subelo.mp3

## Deploy en GitHub Pages
- Branch: main
- Folder: / (root)
