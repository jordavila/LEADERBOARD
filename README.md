# LEADERBOARD

Dashboard estático del equipo, conectado a Google Sheets y publicado mediante GitHub Pages.

## Datos

- `Sheet1`: nombres de los jugadores activos y kills totales; se muestran hasta cuatro jugadores.
- `Sheet2`: cuatro filas de jugadores y hasta 24 columnas de partidas. Se conservan las partidas con kills registradas para todos los jugadores activos, incluidos los ceros.
- Fila `Resultado` (también acepta `Resultados` o `WIN`; por compatibilidad usa la sexta fila de la hoja si no encuentra el nombre): escribir el puesto numérico de cada partida. Solo el puesto **1** cuenta como victoria. Los resultados vacíos o inválidos no entran en la posición promedio. Los puestos deben ser enteros positivos.
- Las kills y el win rate conservan su denominador de partidas completas. La posición promedio usa únicamente las partidas completas con puesto válido; sin puestos muestra `N/A`.
- Los datos se actualizan cada 30 segundos. El recuadro de partida rota cada 5 segundos.
- El botón **Abrir Google Sheets** abre la misma hoja de origen, con los permisos de acceso que ya tenga cada visitante.

## Capitán

El mejor jugador se elige por kills acumuladas en las partidas completas, luego por Sharpe grupal sin redondear y luego por su récord de kills en una sola partida. Un Sharpe no disponible queda detrás de uno válido. Si también empatan en el récord, se usa orden alfabético para que el avatar sea estable. Sin partidas completas no se muestra capitán.

Los avatares de cuerpo completo están en `assets/captains/`. Se crearon con ImageGen usando los retratos existentes como referencia. JOSEVEGA, POTRANCO y SNEYDER comparten el retrato original `DEFAULT`, por lo que usan también el capitán genérico. La animación es CSS: respiración y balanceo leves, desactivados al exportar y cuando el dispositivo solicita movimiento reducido.

## Diseño y gráficos

Paleta: `#11120F`, `#292B27`, `#77786D`, `#C6C5B9`, `#F4F2E9` y acento `#F5D21B`.

Se mantienen los gráficos de kills y partidas lideradas. El gráfico de posición muestra el puesto 1 arriba, marca las victorias en amarillo y deja huecos para resultados desconocidos. El heatmap incluye una fila de posiciones.

## Verificación local

Sin instalación de dependencias:

```sh
node tests/stats.test.cjs
python -m http.server 8765
```

Abrir `http://localhost:8765`. Chart.js y html2canvas se cargan desde el CDN existente. La exportación conserva los botones originales para permitir descargas repetidas.

