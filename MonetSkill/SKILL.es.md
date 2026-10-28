---
name: monet
description: Monet es una bóveda Markdown local con un grafo interactivo de enlaces. Usa esta skill para leer, crear, buscar y conectar notas en una bóveda de Monet desde la terminal o mediante el servidor MCP de Monet.
---

# Monet

Monet es una bóveda de conocimiento en Markdown. Las notas son archivos `.md`
comunes en una carpeta, los enlaces son `[[wikilinks]]`, y la misma carpeta
puede abrirse con la app de escritorio y con la CLI `monet` sin ningún estado
duplicado.

Esta skill se instala junto con las skills generadas `monet-<command>`, que documentan cada comando de la CLI en detalle.

## La bóveda

- Una bóveda es una carpeta común de archivos Markdown.
- Cada nota puede empezar con un bloque opcional de frontmatter YAML.
- Los enlaces se escriben como `[[Nota]]`, opcionalmente con `[[Nota|texto]]`
  o `[[Nota#Sección]]`.
- Los embeds se escriben como `![[Nota]]`.
- Las etiquetas se escriben como `#etiqueta` o se declaran en el frontmatter.
- La resolución de enlaces es igual que en Obsidian: sin extensión, sin
  distinguir mayúsculas, los alias funcionan y los títulos duplicados se
  resuelven al archivo más cercano.

## Elegir una bóveda

Una sola bóveda es suficiente. Apunta la CLI a ella una vez:

```sh
monet vault use ~/Documents/MiBoveda
monet vault current
```

A partir de ahí, cada comando —y la app, y el servidor MCP— usa esa carpeta
sin la flag `--vault`. `monet vault list` muestra la bóveda actual y las
abiertas recientemente; `monet vault current` también dice si la ruta vino de
la flag, del entorno, de la configuración o del directorio actual.

El orden de resolución es: `--vault`, `MONET_VAULT`, la bóveda configurada y
el directorio actual. Cuando la bóveda no sea obvia, ejecuta
`monet vault current` antes de leer o escribir — nunca adivines una ruta.

Para abrir la bóveda en la app de escritorio:

```sh
monet open
```

## Leer notas

```sh
monet note list                    # todas las notas de la bóveda
monet note list --tag proyecto     # solo notas con esa etiqueta
monet note show "Notas de la reunión"
monet note show "Notas de la reunión" --format json
```

## Crear y editar notas

```sh
monet note new "Plan de lanzamiento" --body "# Plan de lanzamiento\n\nEl viernes."
monet note new "Plan de lanzamiento" --folder Proyectos
monet note edit "Plan de lanzamiento" --body "Cuerpo actualizado"
monet note move "Plan de lanzamiento" --to Archivo/2026/Plan de lanzamiento
monet note delete "Plan de lanzamiento" --yes
```

Cada escritura es una escritura de archivo normal. La CLI avisa cuando la app
de Monet ya tiene abierta la misma bóveda, porque ambas pueden escribir en el
mismo archivo.

## Enlazar notas

```sh
monet link create "Plan de lanzamiento" --target "Lista de verificación"
monet link check "Plan de lanzamiento" --target "Lista de verificación"
monet backlinks "Lista de verificación"
```

`monet link create` añade `[[Destino]]` al cuerpo de la nota. `monet link
check` indica si el enlace se resuelve: es la forma más rápida de detectar
una nota renombrada.

## Buscar

```sh
monet search "lanzamiento" --limit 20
monet search "lanzamient"        # fuzzy: encuentra erratas
monet search "lanzamiento" --tag proyecto --format json
```

## Explorar el grafo

```sh
monet graph --format json      # nodos y aristas
monet graph --format json --tag proyecto
```

La forma del JSON es:

```json
{
  "nodes": [{ "id": "Plan de lanzamiento", "title": "Plan de lanzamiento", "tags": ["proyecto"], "linkCount": 3, "backlinkCount": 1 }],
  "edges": [{ "source": "Plan de lanzamiento", "target": "Lista de verificación" }]
}
```

La app de escritorio dibuja exactamente este grafo con la misma
distribución dirigida por fuerzas, así que un id de nodo de la CLI es el
mismo nodo que ves en la app.

## Etiquetas

```sh
monet tags                       # todas las etiquetas con su recuento
monet tags --format json
```

## Servidor MCP

La CLI también funciona como servidor MCP. Los agentes pueden llamar a los
mismos comandos como herramientas.

```sh
monet --mcp                       # servidor por stdio
monet mcp add                     # registra la CLI en tu agente
```

Los nombres de las herramientas son los nombres de los comandos con el
prefijo del grupo, por ejemplo `note_show`, `search`, `backlinks` y `graph`.

## Formatos de salida

Todos los comandos aceptan `--format toon|json|yaml|md|jsonl`. El
predeterminado es TOON, que es compacto y fácil de leer para un agente. Usa
`--format json` cuando un programa consuma la salida.

## Errores comunes

- Enlazar con la extensión `.md` funciona, pero la convención de Obsidian es
  `[[Nota]]`.
- Una nota cuyo nombre de archivo contenga `/` no puede existir; usa carpetas.
- Renombrar una nota rompe los enlaces que apuntaban a ella.
  `monet backlinks` te dice quién apuntaba a ella antes de renombrar.
