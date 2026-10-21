# Cómo contribuir

¡Gracias por dar una mano! Algunas pautas cortas:

1. **Abrí un issue antes** de un cambio grande, para charlar el enfoque.
2. **Un cambio por pull request**, con una descripción de qué arregla o agrega
   y cómo lo probaste.
3. **Corré la prueba** antes de mandar el PR:
   `cd backend && ../.venv/bin/python -m pytest ../tests -q`
   y, si tocaste la interfaz, `cd frontend && npm run build`.
4. **Nada de datos reales** en el repo: ni videos, ni bases, ni `.env`.
   Para probar, generá clips sintéticos con FFmpeg (`-f lavfi -i testsrc`).
5. Toda llamada nueva a FFmpeg usa las constantes `FFMPEG` / `FFPROBE` de
   `backend/services/video_processor.py`, nunca `"ffmpeg"` a secas.

Los textos de la interfaz están en castellano rioplatense; las traducciones son
bienvenidas.

Al contribuir aceptás que tu aporte se publique bajo la licencia MIT del
proyecto.
