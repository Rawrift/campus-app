
### A · La masa cambia el timbre

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `masa_005` | 1.27 s | -15.5 | -32.9 | 17.4 | 1670 | 0.86 s | -46.4 | -29.2 | 4 | no |
| `masa_050` | 1.80 s | -8.9 | -25.7 | 16.7 | 647 | 1.21 s | -9.3 | -33.9 | 3 | no |
| `masa_200` | 2.26 s | -6.3 | -23.1 | 16.8 | 507 | 1.53 s | -0.6 | -40.2 | 3 | no |
| `masa_800` | 2.83 s | -3.8 | -19.6 | 15.7 | 304 | 1.92 s | -0.5 | -56.9 | 3 | no |
| `masa_800_sin_limitador` | 2.57 s | -17.2 | -35.9 | 18.8 | 316 | 1.73 s | -0.6 | -58.0 | 3 | no |
| `diag_masa_005_seco` | 1.23 s | -27.8 | -46.0 | 18.2 | 1653 | 0.90 s | -43.3 | -28.2 | 4 | no |
| `diag_masa_005_seco_sinhrtf` | 1.10 s | -25.2 | -46.5 | 21.2 | 2509 | 0.77 s | -41.0 | -17.2 | 4 | no |

### B · Matriz de pares de materiales (momento 120)

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `par_metal_hormigon` | 2.06 s | -6.9 | -23.8 | 16.9 | 496 | 1.39 s | -4.5 | -42.8 | 4 | no |
| `par_metal_metal` | 3.00 s | -5.9 | -23.6 | 17.7 | 845 | 2.02 s | -13.6 | -26.5 | 3 | no |
| `par_madera_madera` | 0.46 s | -13.1 | -28.3 | 15.2 | 412 | 0.28 s | -0.3 | -54.9 | 4 | no |
| `par_vidrio_hormigon` | 0.80 s | -9.1 | -25.1 | 16.1 | 1034 | 0.49 s | -9.2 | -25.9 | 5 | no |
| `par_goma_metal` | 0.51 s | -9.4 | -24.0 | 14.6 | 251 | 0.36 s | -1.8 | -63.5 | 5 | no |
| `par_hormigon_hormigon` | 0.37 s | -13.5 | -31.5 | 18.0 | 229 | 0.28 s | -0.1 | -60.4 | 3 | no |
| `par_plastico_madera` | 0.45 s | -11.1 | -27.7 | 16.6 | 490 | 0.28 s | -10.7 | -53.1 | 4 | no |
| `par_grava_metal` | 1.71 s | -8.3 | -24.8 | 16.5 | 608 | 1.12 s | -9.6 | -44.6 | 3 | no |
| `par_metalSordo_piedra` | 0.40 s | -11.5 | -26.6 | 15.1 | 329 | 0.30 s | -0.1 | -57.6 | 5 | no |
| `par_carton_piedra` | 0.45 s | -15.8 | -35.0 | 19.2 | 191 | 0.28 s | -0.1 | -66.8 | 4 | no |
| `par_tela_piedra` | 0.46 s | -16.6 | -36.5 | 19.9 | 205 | 0.27 s | -0.1 | -64.1 | 4 | no |

### C · 200 impactos en 300 ms

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `densidad_200_con_limitador` | 2.65 s | -1.3 | -16.1 | 14.7 | 517 | 1.83 s | -1.1 | -43.9 | 5 | no |
| `densidad_200_sin_limitador` | 2.16 s | 2.5 | -18.2 | 20.7 | 603 | 1.05 s | -1.7 | -45.0 | 5 | **sí (210)** |
| `densidad_200_sin_agrupacion` | 2.29 s | 4.9 | -14.1 | 19.0 | 743 | 1.20 s | -1.6 | -32.9 | 4 | **sí (2043)** |

### D · Explosión

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `explosion_p1` | 2.12 s | -6.0 | -25.9 | 19.8 | 1666 | 1.53 s | -2.1 | -25.5 | 7 | no |
| `explosion_p6` | 3.45 s | -2.9 | -20.3 | 17.4 | 882 | 2.60 s | -0.7 | -32.5 | 9 | no |

### E · Disparos

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `disparo_pistola` | 0.38 s | -6.9 | -23.0 | 16.1 | 2277 | 0.18 s | -1.4 | -25.1 | 2 | no |
| `disparo_escopeta` | 0.43 s | -3.3 | -17.0 | 13.7 | 1575 | 0.29 s | -0.1 | -30.5 | 2 | no |
| `disparo_rifle` | 0.44 s | -3.1 | -20.0 | 16.9 | 2390 | 0.28 s | -0.2 | -21.3 | 2 | no |
| `disparo_laser` | 0.36 s | -10.6 | -33.8 | 23.2 | 2893 | 0.30 s | -21.2 | -13.6 | 1 | no |

### F · Continuos

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `friccion_metal` | 4.07 s | -11.1 | -35.2 | 24.1 | 3066 | 1.43 s | -3.9 | -12.6 | 32 | no |
| `friccion_madera` | 4.11 s | -15.7 | -37.7 | 22.0 | 2498 | 3.57 s | -5.8 | -19.5 | 31 | no |
| `fuego` | 6.64 s | -3.5 | -21.7 | 18.2 | 965 | 1.91 s | -2.3 | -32.3 | 100 | no |
| `motor` | 6.83 s | -1.6 | -12.4 | 10.8 | 1046 | 3.12 s | -0.7 | -31.7 | 119 | no |
| `manipulador_5kg` | 3.53 s | -2.4 | -14.3 | 11.9 | 1297 | 1.27 s | -6.0 | -33.8 | 30 | no |
| `manipulador_400kg` | 3.49 s | -2.6 | -14.5 | 11.9 | 865 | 1.38 s | -0.4 | -37.4 | 83 | no |

### G · Pasos

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `pasos_metal_andar` | 2.69 s | -14.6 | -33.3 | 18.8 | 951 | 0.24 s | -4.6 | -20.8 | 15 | no |
| `pasos_metal_correr` | 2.96 s | -5.6 | -20.5 | 14.8 | 1256 | 0.28 s | -1.2 | -28.5 | 19 | no |
| `pasos_grava_correr` | 2.88 s | -5.5 | -25.7 | 20.2 | 348 | 0.14 s | -0.2 | -24.7 | 23 | no |

### H · Rotura

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `rotura_vidrio` | 1.61 s | -10.0 | -29.0 | 19.0 | 3506 | 0.53 s | -49.1 | -6.3 | 18 | no |
| `rotura_madera` | 1.32 s | -10.6 | -30.8 | 20.2 | 1565 | 0.18 s | -3.5 | -23.4 | 11 | no |
| `rotura_hormigon` | 1.96 s | -8.9 | -28.9 | 20.0 | 1746 | 0.54 s | -0.5 | -26.0 | 16 | no |

### I · Interfaz

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `interfaz` | 3.09 s | -4.6 | -28.2 | 23.6 | 1777 | 0.18 s | -6.3 | -30.4 | 11 | no |

### J · Ambiente y reverberación

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `ambiente_exterior` | 4.97 s | -4.2 | -24.6 | 20.4 | 4273 | — | -1.9 | -15.4 | 0 | no |
| `ambiente_nave` | 4.97 s | -2.6 | -12.5 | 9.9 | 432 | — | -0.1 | -47.3 | 1 | no |
| `ambiente_transicion` | 6.97 s | -2.9 | -14.7 | 11.8 | 792 | — | -0.2 | -29.5 | 2 | no |

### K · Audio posicional

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `espacial_cerca_izquierda` | 2.05 s | -5.1 | -23.3 | 18.1 | 427 | 1.38 s | -1.0 | -44.8 | 3 | no |
| `espacial_lejos_derecha` | 1.91 s | -9.3 | -31.9 | 22.6 | 740 | 1.40 s | -1.6 | -34.9 | 6 | no |
| `espacial_ocluido` | 1.95 s | -10.2 | -29.4 | 19.2 | 392 | 1.31 s | -1.1 | -49.9 | 4 | no |

### L · Cámara lenta

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `tiempo_normal` | 3.27 s | -1.1 | -18.5 | 17.4 | 1141 | 2.14 s | -1.5 | -29.1 | 13 | no |
| `tiempo_lento_02` | 8.93 s | -1.5 | -20.1 | 18.6 | 344 | — | -0.8 | -30.5 | 11 | no |
| `tiempo_lento_05` | 5.23 s | -1.2 | -18.6 | 17.5 | 670 | 3.66 s | -1.7 | -30.7 | 15 | no |

### M · Escena mixta

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `escena_completa` | 8.97 s | -1.2 | -11.5 | 10.3 | 953 | — | -0.5 | -32.0 | 15 | no |

### Control de voces en el caso denso

| caso | voces creadas | fusionadas | descartadas | robadas | pico simultáneo | pico dBFS | recorte |
|---|--:|--:|--:|--:|--:|--:|:-:|
| `densidad_200_con_limitador` | 200 | 36 | 0 | 152 | 49 | -1.3 | no |
| `densidad_200_sin_limitador` | 200 | 36 | 0 | 152 | 49 | 2.5 | **sí (210)** |
| `densidad_200_sin_agrupacion` | 200 | 0 | 0 | 0 | 200 | 4.9 | **sí (2043)** |

_Generado por `verificacion/informe.mjs` el 2026-09-20 · 50 casos · 48000 Hz._

### Comprobaciones automáticas

| comprobación | resultado | evidencia |
|---|:-:|---|
| centroide espectral decrece con el momento | ✅ | 1670 Hz > 647 Hz > 507 Hz > 304 Hz |
| decaimiento a −40 dB crece con el momento | ✅ | 0.86 s < 1.21 s < 1.53 s < 1.92 s |
| energía < 250 Hz crece con el momento | ✅ | -46.4 dB < -9.3 dB < -0.6 dB < -0.5 dB |
| energía > 4 kHz decrece con el momento | ✅ | -29.2 dB > -33.9 dB > -40.2 dB > -56.9 dB |
| 200 impactos en 300 ms NO recortan con la cadena completa | ✅ | pico -1.3 dBFS |
| el limitador actúa: la cadena desnuda SÍ recorta | ✅ | pico 2.5 dBFS, 210 muestras recortadas |
| ningún otro caso recorta | ✅ | ninguno |
