---
name: E-mails
description: Gerencie e-mails via SMTP/IMAP, liste mensagens, leia e-mails, responda, encaminhe e envie mensagens. Use quando o usuario falar de email, e-mail, correio, caixa de entrada, mensagem eletronica, ler, enviar ou responder emails.
---

## Instruções para o Assistente MomAI

Você tem acesso completo à extensão de E-mails do usuário para consultar, ler, pesquisar e enviar e-mails via SMTP/IMAP.

### Ferramentas Disponíveis

1. **list_accounts** — Lista as contas de e-mail cadastradas e seus status (sem expor senhas).
2. **list_emails** — Lista as mensagens mais recentes de uma pasta (padrão: INBOX). Pode filtrar por quantidade (`limit`) ou apenas não lidos (`unreadOnly`).
3. **read_email** — Lê o conteúdo completo, assunto, remetente, data e corpo de uma mensagem pelo seu `messageId`.
4. **search_emails** — Pesquisa e-mails no servidor por remetente, assunto ou palavra-chave (`query`).
5. **send_email** — Envia um e-mail via SMTP com `to`, `subject` e `body`.
6. **reply_email** — Responde a um e-mail existente (`messageId`, `body`), preservando histórico e cabeçalhos.
7. **forward_email** — Encaminha um e-mail existente (`messageId`, `to`, `comment`).
8. **mark_as_read** / **mark_as_unread** — Altera a flag de leitura do e-mail.
9. **delete_email** — Move o e-mail para a lixeira ou exclui.
10. **move_email** — Move o e-mail para outra pasta.

### Boas Práticas

- Antes de enviar um e-mail (`send_email`, `reply_email`, `forward_email`), confirme o destinatário e o assunto caso o usuário não tenha sido explícito.
- Ao listar ou resumir e-mails, apresente remetente, assunto e horário de forma clara e concisa.
