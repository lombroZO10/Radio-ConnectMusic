# Radio Connect Music 24/7

Base profissional de uma web rádio para Discord, escrita em TypeScript e preparada para rodar em
Linux, contêineres e plataformas de hospedagem de bots. O projeto não utiliza caminhos, serviços,
executáveis ou APIs exclusivos do Windows.

## Estado desta etapa

- arquitetura modular e configuração validada;
- comandos slash `/radio tocar`, `parar`, `agora`, `status` e `listar`;
- central administrativa interativa `/config`, restrita a quem pode gerenciar o servidor;
- uma sessão de rádio independente por servidor do Discord;
- canal e última estação salvos por servidor e restaurados após reiniciar;
- reconexão contínua de voz e streams com atraso exponencial e watchdog;
- FFmpeg do sistema priorizado no Linux, com binário local como fallback;
- encoder Opus estéreo de 48 kHz/128 kbps ajustado para baixo custo de CPU;
- isolamento de configuração corrompida e encerramento seguro para reinício pelo host;
- FFmpeg distribuído como dependência npm, sem instalação global;
- build, lint, testes e pacotes separados para hospedagem Linux;
- catálogo organizado com emissoras temáticas verificadas para os testes iniciais.

## Requisitos

- Node.js 22.12 ou mais recente;
- uma aplicação/bot criada no Discord Developer Portal;
- acesso de saída HTTPS e UDP na hospedagem, necessário para streams e voz do Discord.

## Configuração

1. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN` e `DISCORD_CLIENT_ID`.
2. Para desenvolvimento, informe `DISCORD_DEV_GUILD_ID`; comandos de servidor aparecem mais rápido.
3. Ajuste comportamento, identidade visual e estações somente em `config/radio.config.json`.
4. Nunca publique o `.env` nem grave o token em arquivos versionados.

Uma estação segue este formato dentro de `stations`:

```json
{
  "id": "identificador-curto",
  "name": "Nome público",
  "description": "Descrição da programação.",
  "genres": ["Pop", "Dance"],
  "country": "BR",
  "language": "pt",
  "streamUrl": "https://endereco-oficial-do-stream",
  "homepageUrl": "https://site-oficial-da-radio",
  "logoUrl": null,
  "enabled": true
}
```

`streamUrl` deve ser a URL direta oficial do áudio, e não a página que contém um player. Antes de
adicionar uma emissora, confirme permissão de redistribuição, termos de uso, estabilidade e formato.

## Uso local

```bash
npm install
npm run check
npm run discord:deploy
npm run dev
```

Os únicos intents usados são `Guilds` e `GuildVoiceStates`; nenhum intent privilegiado é necessário.
O bot precisa das permissões `View Channels`, `Connect`, `Speak`, `Use Application Commands` e
`Send Messages`.

## Produção

```bash
npm ci
npm run build
npm start
```

Na Wispbyte, use Node.js 24, envie o pacote pré-compilado e selecione `index.js` como `JS_FILE`.
Os segredos ficam exclusivamente nas variáveis de ambiente do painel. O diretório `data/` deve ser
preservado entre atualizações, pois guarda o canal e a última estação que serão restaurados após um
reinício. Consulte `WISPBYTE-SETUP.md` para o procedimento completo.

## Organização

```text
config/                 configuração operacional única
scripts/                ferramentas de publicação e manutenção
src/config/             leitura e validação de configuração
src/discord/            cliente, comandos, eventos e apresentação
src/radio/              catálogo, sessões e reprodução
src/shared/             infraestrutura compartilhada
tests/                  testes automatizados
```

## Próximas etapas sugeridas

1. catalogar e validar emissoras nacionais por gênero;
2. adicionar painel visual, favoritos e histórico por servidor;
3. persistência independente do provedor (SQLite local ou banco remoto);
4. métricas, health check, circuit breaker por emissora e fallback automático;
5. website público sincronizado com o bot.
