# Guia de Automação: MomAI E-mails

A extensão MomAI E-mails permite criar automações ricas baseadas em recebimento e envio de e-mails via SMTP/IMAP.

## Triggers

1. **`momai-emails.new_email`**
   - Disparado sempre que uma nova mensagem for recebida na caixa de entrada.
   - **Campos do Payload**:
     - `accountId`: ID da conta receptora
     - `from`: Remetente (Nome e/ou endereço)
     - `to`: Destinatário
     - `subject`: Assunto do e-mail
     - `snippet`: Prévia do conteúdo em texto
     - `date`: Data/hora do e-mail
     - `messageId`: Identificador único da mensagem

2. **`momai-emails.email_matching_filter`**
   - Disparado quando um e-mail recebido atende a filtros definidos (ex: remetente específico, palavra no assunto).
   - **Campos do Payload**:
     - `from`: Remetente
     - `subject`: Assunto
     - `containsKeyword`: Palavra-chave encontrada
     - `messageId`: ID da mensagem

## Actions

1. **`momai-emails.send_email`**
   - Envia um e-mail via SMTP.
   - Parâmetros: `to`, `subject`, `body`, `isHtml`, `accountId` (opcional).

2. **`momai-emails.reply_email`**
   - Responde a um e-mail recebido.
   - Parâmetros: `messageId`, `body`, `isHtml`, `accountId` (opcional).

3. **`momai-emails.forward_email`**
   - Encaminha o e-mail recebido para outro destinatário.
   - Parâmetros: `messageId`, `to`, `comment`.

4. **`momai-emails.mark_as_read`**
   - Marca o e-mail como lido no servidor IMAP.
   - Parâmetros: `messageId`, `accountId` (opcional).

5. **`momai-emails.delete_email`**
   - Move o e-mail para a lixeira.
   - Parâmetros: `messageId`, `accountId` (opcional).

## Exemplos de Automação

1. **Notificação de E-mail Urgente**:
   - Trigger: `momai-emails.new_email`
   - Condição: `trigger.payload.subject` contém `"URGENTE"` ou `"IMPORTANTE"`
   - Ação: `system.notify`
     - `title`: `"E-mail Urgente de {{trigger.payload.from}}"`
     - `body`: `"{{trigger.payload.subject}}: {{trigger.payload.snippet}}"`

2. **Alerta no WhatsApp ao receber e-mail de cliente**:
   - Trigger: `momai-emails.email_matching_filter` (filtro de remetente `diretoria@empresa.com`)
   - Ação: `momai-whatsapp.send_message`
     - `contact`: `"Meu Número"`
     - `message`: `"🚨 Novo e-mail da diretoria recebido: {{trigger.payload.subject}}"`
