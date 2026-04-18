# Godz Discord Plugin para StreamDock (Vision Sound 01)

## Visão Geral

Este plugin integra o Discord ao StreamDock (Rise Mode Vision Sound 01), permitindo controlar diversas funções do Discord diretamente pelo seu painel. Ele oferece ações como mutar, desmutar, alternar canais de voz/texto, controlar volume de usuários, compartilhar tela, entre outros.

## Funcionalidades


## Detalhamento das Funções/Ações


### 1. Mute/Unmute (`MuteAction`)
Ativa ou desativa o microfone no Discord.
- **Como usar:** Pressione o botão para alternar entre mudo e não mudo. Gire o knob para aumentar/diminuir o volume do microfone.
- **Exemplo:** Use durante uma call para silenciar rapidamente seu microfone.
- **Sugestão de imagem:** Ícone de microfone com barra para mudo.


### 2. Deaf/Undeaf (`DeafAction`)
Ativa ou desativa o modo surdo, silenciando todo o áudio do Discord para você.
- **Como usar:** Pressione para alternar entre surdo e normal. Gire o knob para ajustar o volume de saída.
- **Exemplo:** Use quando precisar se concentrar e não ouvir ninguém na call.
- **Sugestão de imagem:** Ícone de fone de ouvido com barra.


### 3. Entrar/Sair de Canal de Voz (`VoiceChannelAction`)
Permite alternar rapidamente entre canais de voz.
- **Como usar:** Configure o canal desejado e pressione para entrar/sair. Mostra usuários conectados e ícone do servidor.
- **Exemplo:** Troque de sala sem abrir o Discord.
- **Sugestão de imagem:** Ícone de canal de voz ou avatar dos usuários.


### 4. Enviar Mensagem em Canal de Texto (`TextChannelAction`)
Envia mensagens para canais de texto do Discord.
- **Como usar:** Configure o canal e a mensagem. Pressione para enviar. Suporta webhooks.
- **Exemplo:** Envie avisos automáticos para um grupo.
- **Sugestão de imagem:** Ícone de balão de chat ou símbolo de texto.


### 5. Notificações (`NoticeAction`)
Exibe o número de notificações recebidas do Discord.
- **Como usar:** Pressione para zerar o contador de notificações.
- **Exemplo:** Veja quantas menções recebeu sem abrir o app.
- **Sugestão de imagem:** Sininho ou badge de notificação.


### 6. Controle de Volume de Usuário (`UserVolumeAction`)
Ajusta o volume de outros usuários no canal de voz.
- **Como usar:** Selecione o usuário, gire o knob para ajustar o volume, pressione para mutar/desmutar.
- **Exemplo:** Abaixe o volume de alguém que está muito alto.
- **Sugestão de imagem:** Avatar do usuário ou ícone de alto-falante.


### 7. Soundboard (`SoundboardAction`)
Toca sons personalizados no canal de voz.
- **Como usar:** Escolha o som e pressione para tocar.
- **Exemplo:** Toque efeitos sonoros durante a live.
- **Sugestão de imagem:** Emoji ou ícone de alto-falante divertido.


### 8. Selecionar Dispositivos (`SetDevicesAction`)
Troca entre microfones e alto-falantes configurados no Discord.
- **Como usar:** Escolha o dispositivo nas opções e pressione para alternar.
- **Exemplo:** Mude do headset para caixa de som em um clique.
- **Sugestão de imagem:** Ícone de microfone ou fone de ouvido.


### 9. Alternar Vídeo (`ToggleVideoAction`)
Ativa ou desativa sua câmera no Discord.
- **Como usar:** Pressione para ligar/desligar o vídeo.
- **Exemplo:** Entre em vídeo só quando quiser aparecer.
- **Sugestão de imagem:** Ícone de câmera.


### 10. Compartilhar Tela (`ScreenShareAction`)
Inicia ou para o compartilhamento de tela.
- **Como usar:** Pressione para abrir o seletor de tela do Discord.
- **Exemplo:** Compartilhe sua tela em reuniões ou lives.
- **Sugestão de imagem:** Ícone de monitor ou tela.


### 11. Desconectar (`DisconnectAction`)
Sai do canal de voz atual.
- **Como usar:** Pressione para sair da call.
- **Exemplo:** Termine a reunião com um clique.
- **Sugestão de imagem:** Ícone de telefone desligado.


### 12. Supressão de Ruído (`NoiseSuppressionAction`)
Ativa ou desativa a supressão de ruído do Discord.
- **Como usar:** Pressione para alternar o modo de supressão.
- **Exemplo:** Use em ambientes barulhentos para melhorar o áudio.
- **Sugestão de imagem:** Ícone de onda sonora com barra.


### 13. Abrir Link (`OpenLinkAction`)
Abre o último link compartilhado em um canal de texto.
- **Como usar:** Configure o canal, pressione para abrir o link mais recente.
- **Exemplo:** Acesse rapidamente links enviados no grupo.
- **Sugestão de imagem:** Ícone de link ou globo.


### 14. Push to Talk (`PushToTalkAction`)
Enquanto o botão estiver pressionado, seu microfone fica ativado (unmute).
- **Como usar:** Segure o botão para falar, solte para mutar.
- **Exemplo:** Use para evitar ruídos em transmissões.
- **Sugestão de imagem:** Ícone de microfone com mão.


### 15. Push to Mute (`PushToMuteAction`)
Enquanto o botão estiver pressionado, seu microfone fica mudo.
- **Como usar:** Segure para mutar, solte para voltar ao normal.
- **Exemplo:** Silencie rapidamente ao tossir ou atender o telefone.
- **Sugestão de imagem:** Microfone com X ou barra.

## Instalação

### Pré-requisitos
- StreamDock instalado (Rise Mode Vision Sound 01)
- Node.js instalado (recomendado para logs e depuração)
- Discord instalado e logado

### Passos
1. **Copie a pasta do plugin**
   - Copie a pasta `com.godz.Discord.sdPlugin` para:
     `C:\Users\<SEU_USUARIO>\AppData\Roaming\HotSpot\StreamDock\plugins\`

2. **(Opcional) Instale ícones personalizados**
   - Copie pacotes de ícones para:
     `C:\Users\<SEU_USUARIO>\AppData\Roaming\HotSpot\StreamDock\icons\`

3. **Reinicie o StreamDock**
   - Feche e abra novamente o StreamDock para que o plugin seja reconhecido.

4. **Configure o Plugin**
   - Ao adicionar uma ação do Discord no painel, será solicitado o `Client ID` e `Client Secret` do seu aplicativo Discord Developer.
   - Siga as instruções na tela para criar um aplicativo no [Discord Developer Portal](https://discord.com/developers/applications), adicione a URL de redirecionamento `http://127.0.0.1:26432/callback` e copie os dados para o plugin.

## Como Ativar o Plugin Usando o StoreCache.json

O arquivo `StoreCache.json` armazena os plugins e ícones disponíveis no seu StreamDock. Para garantir que o plugin seja reconhecido:

1. **Abra o arquivo**:
   - Caminho: `C:\Users\<SEU_USUARIO>\AppData\Roaming\HotSpot\StreamDock\storecache\StoreCache.json`

2. **Adicione ou verifique a entrada do plugin**:
   - Certifique-se de que existe uma entrada semelhante a:

```json
{
  "device": ["ControllerDeviceS2"],
  "fileName": "com.godz.Discord.sdPlugin",
  "localFile": "C:\\Users\\<SEU_USUARIO>\\AppData\\Roaming\\HotSpot\\StreamDock\\plugins\\com.godz.Discord.sdPlugin",
  "serverFile": "",
  "title": "Godz Discord"
}
```

- Se não existir, adicione manualmente dentro do array `plugins`.
- Salve o arquivo e reinicie o StreamDock.

## Dicas e Solução de Problemas
- **Logs**: Os logs do plugin ficam em `log/plugin-<timestamp>.log` dentro da pasta do plugin.
- **Autorização**: Se mudar os escopos do Discord, será necessário reautorizar o plugin.
- **Ajuda Visual**: Use o arquivo `authorization.html` na pasta `propertyInspector/utils` para um passo a passo visual de como obter o Client ID/Secret.

## Créditos
Desenvolvido por Godz para a comunidade StreamDock.

---

**Dúvidas?** Abra um issue ou entre em contato pelo Discord!
