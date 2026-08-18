# Radio Connect Music 24/7 - Wispbyte

Este pacote usa o JavaScript ja compilado em `build/`, portanto nao e necessario
compilar TypeScript na hospedagem.

## Criacao do servidor

- Plano: Free
- Runtime/Docker image: Node.js 24 (ou Node.js 22.12 ou superior)
- Um bot Discord neste servidor

## Variaveis de ambiente

Cadastre em `Startup` > `Server Configuration` / `Environment Variables`:

```text
DISCORD_TOKEN=NOVO_TOKEN_DO_BOT
DISCORD_CLIENT_ID=1288928183420190720
DISCORD_DEV_GUILD_ID=1301004852880478269
LOG_LEVEL=info
NODE_ENV=production
```

O token antigo deve ser redefinido no Discord Developer Portal. Nunca envie um
arquivo `.env` para a hospedagem.

## Inicializacao

Mantenha o comando padrao do servidor Node.js. No campo `JS_FILE`, `Startup
File` ou ao usar a opcao `Use on startup`, selecione:

```text
index.js
```

O painel executara `npm install` automaticamente porque o pacote possui
`package.json`. A variavel `NODE_ENV=production` impede a instalacao das
ferramentas usadas somente no desenvolvimento. Nao escreva `npm ci` no campo
do arquivo inicial e nao preencha `Additional Node.js Packages`. O pacote
autoriza apenas o script de instalacao revisado do `ffmpeg-static` e bloqueia o
script do `esbuild`, que nao e necessario em producao. No Linux, o bot prioriza
automaticamente o FFmpeg atualizado da imagem da Wispbyte e mantem o estatico
somente como fallback e para testes locais no Windows.

## Primeiro teste

1. Inicie o servidor e aguarde `Bot conectado ao Discord` no console.
2. No Discord, execute `/config` e selecione o canal de voz permanente.
3. Execute `/radio tocar` e escolha uma estacao.
4. Reinicie o servidor uma vez e confirme que o canal e a ultima estacao voltam
   automaticamente.
5. Se a voz nao conectar, copie o log desde `Estado da conexao de voz alterado`.

O diretorio `data/` nao faz parte do pacote. Ele sera criado pelo bot na
Wispbyte, evitando reutilizar canais salvos na instalacao local ou na Discloud.
Depois da primeira configuracao, preserve o diretorio `data/` nas atualizacoes:
ele contem o canal e a estacao que o bot deve restaurar.

O bot monitora voz e audio a cada 60 segundos. Falhas transitorias sao
repetidas continuamente com espera progressiva de 5 a 120 segundos, evitando
loops agressivos. Uma reproducao precisa permanecer ativa por 30 segundos antes
de zerar o contador de falhas. Logs ficam somente no console da hospedagem e
nao ocupam o disco com um arquivo sem limite.

Para respeitar a cota de CPU do plano gratuito sem reduzir a qualidade, o
encoder usa Opus VBR em 128 kbps, 48 kHz, stereo e frames de 20 ms. A
complexidade do encoder e otimizada para tempo real e o FFmpeg fica limitado a
uma thread. Volume e qualidade da fonte nao recebem filtros ou normalizacao.
