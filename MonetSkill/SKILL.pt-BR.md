---
name: monet
description: Monet é um cofre Markdown local para macOS com grafo 3D de links. Use esta skill para ler, criar, buscar e conectar notas em um cofre Monet pelo terminal ou pelo servidor MCP do Monet.
---

# Monet

Monet é um cofre de conhecimento em Markdown. As notas são arquivos `.md`
comuns em uma pasta, os links são `[[wikilinks]]`, e a mesma pasta pode ser
aberta pelo app macOS e pela CLI `monet` sem nenhum estado duplicado.

Esta skill é instalada junto com as skills geradas `monet-<command>`, que documentam cada comando da CLI em detalhe.

## O cofre

- Um cofre é uma pasta comum de arquivos Markdown.
- Cada nota pode começar com um bloco opcional de frontmatter YAML.
- Os links são escritos como `[[Nota]]`, opcionalmente com `[[Nota|texto]]`
  ou `[[Nota#Seção]]`.
- Os embeds são escritos como `![[Nota]]`.
- As etiquetas são escritas como `#etiqueta` ou declaradas no frontmatter.
- A resolução de links é igual à do Obsidian: sem extensão, sem diferenciar
  maiúsculas de minúsculas, aliases funcionam e títulos duplicados resolvem
  para o arquivo mais próximo.

## Escolhendo um cofre

Um único cofre basta. Aponte a CLI para ele uma vez:

```sh
monet vault use ~/Documents/MeuCofre
monet vault current
```

A partir daí todo comando — e o app, e o servidor MCP — usa essa pasta sem a
flag `--vault`. `monet vault list` mostra o cofre atual e os abertos
recentemente; `monet vault current` também diz se o caminho veio da flag, do
ambiente, da configuração ou do diretório atual.

A ordem de resolução é: `--vault`, `MONET_VAULT`, o cofre configurado e o
diretório atual. Quando o cofre não estiver óbvio, rode `monet vault current`
antes de ler ou escrever — nunca adivinhe um caminho.

Para abrir o cofre no app macOS:

```sh
monet open
```

## Lendo notas

```sh
monet note list                      # todas as notas do cofre
monet note list --tag projeto        # apenas notas com a etiqueta
monet note show "Notas da Reunião"   # imprime uma nota
monet note show "Notas da Reunião" --format json
```

## Criando e editando notas

```sh
monet note new "Plano de Lançamento" --body "# Plano de Lançamento\n\nSexta-feira."
monet note new "Plano de Lançamento" --folder Projetos
monet note edit "Plano de Lançamento" --body "Corpo atualizado"
monet note move "Plano de Lançamento" --to Arquivo/2026/Plano de Lançamento
monet note delete "Plano de Lançamento" --yes
```

Cada escrita é uma gravação de arquivo comum. A CLI avisa quando o app Monet
já está com o mesmo cofre aberto, porque os dois podem gravar no mesmo
arquivo.

## Ligando notas

```sh
monet link create "Plano de Lançamento" --target "Checklist de Lançamento"
monet link check "Plano de Lançamento" --target "Checklist de Lançamento"
monet backlinks "Checklist de Lançamento"
```

`monet link create` acrescenta `[[Alvo]]` ao corpo da nota. `monet link check`
informa se o link resolve — é a forma mais rápida de detectar uma nota que
foi renomeada.

## Buscando

```sh
monet search "lançamento" --limit 20
monet search "lancamento"          # fuzzy: encontra erros de digitação
monet search "lançamento" --tag projeto --format json
```

## Explorando o grafo

```sh
monet graph --format json      # nós e arestas
monet graph --format json --tag projeto
```

O formato JSON é:

```json
{
  "nodes": [{ "id": "Plano de Lançamento", "title": "Plano de Lançamento", "tags": ["projeto"], "linkCount": 3, "backlinkCount": 1 }],
  "edges": [{ "source": "Plano de Lançamento", "target": "Checklist de Lançamento" }]
}
```

O app macOS desenha exatamente este grafo em 3D, com o mesmo layout dirigido
por forças, então um id de nó da CLI é o mesmo nó que você vê no app.

## Etiquetas

```sh
monet tags                       # todas as etiquetas com a contagem de notas
monet tags --format json
```

## Servidor MCP

A CLI também funciona como servidor MCP. Os agentes podem chamar os mesmos
comandos como ferramentas.

```sh
monet --mcp                       # servidor via stdio
monet mcp add                     # registra a CLI no seu agente
```

Os nomes das ferramentas são os nomes dos comandos com o prefixo do grupo,
por exemplo `note_show`, `search`, `backlinks` e `graph`.

## Formatos de saída

Todo comando aceita `--format toon|json|yaml|md|jsonl`. O padrão é TOON, que
é compacto e fácil de ler para um agente. Use `--format json` quando um
programa consome a saída.

## Erros comuns

- Ligar com a extensão `.md` funciona, mas a convenção do Obsidian é
  `[[Nota]]`.
- Uma nota cujo nome de arquivo contenha `/` não pode existir; use pastas.
- Renomear uma nota quebra os links que apontavam para ela. `monet backlinks`
  mostra quem pointed para ela antes de renomear.
