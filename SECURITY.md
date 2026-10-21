# Seguridad

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usá el reporte privado de GitHub:
pestaña **Security → Report a vulnerability** de este repositorio
(GitHub Security Advisories). Contá qué encontraste, cómo reproducirlo y qué
versión usás. Vamos a responder ahí mismo.

## Alcance y modelo de amenaza

- El editor **no tiene usuarios ni login**. Está pensado para correr en tu
  máquina y escucha en `127.0.0.1` por defecto.
- Si lo abrís a la red (`HOST=0.0.0.0`), cualquiera con acceso a esa red puede
  ver, bajar y borrar videos y proyectos. **No lo expongas a internet** sin un
  proxy con autenticación delante.
- CORS está abierto (`*`) para el modo desarrollo; cerralo en
  `backend/main.py` si lo publicás.

Son reportes válidos, por ejemplo: lectura o escritura de archivos fuera de la
carpeta de almacenamiento, ejecución de comandos a través de los parámetros de
export, o caídas provocadas por un archivo subido.
