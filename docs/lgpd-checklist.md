# Checklist LGPD por feature

Checklist de **DPIA leve** para cada PR que altere funcionalidade, rastreamento, terceiros ou [privacy-policy.html](../privacy-policy.html).

**Controladora:** Railane Passos (pessoa física), nome comercial Workflow Tech Engineering  
**Canal:** [privacy@railanepassos.tec.br](mailto:privacy@railanepassos.tec.br)

Copie esta seção no PR ou marque os itens no [template de PR](../.github/pull_request_template.md).

---

## 1. Escopo da mudança

- [ ] Descrevi em uma frase o que a feature faz para o visitante
- [ ] Listei todos os dados pessoais potencialmente envolvidos (IP, e-mail, nome, etc.)

**Dados tocados nesta feature:**

| Dado | Coletado no nosso domínio? | Origem |
|------|----------------------------|--------|
| | Sim / Não | |

---

## 2. Base legal (LGPD art. 7)

Marque a(s) aplicável(is):

- [ ] Consentimento (art. 7, I)
- [ ] Execução de contrato ou procedimentos preliminares (art. 7, V)
- [ ] Legítimo interesse (art. 7, IX) — documentar balanceamento abaixo
- [ ] Obrigação legal/regulatória (art. 7, II)
- [ ] **N/A** — nenhum dado pessoal novo

**Justificativa (se legítimo interesse):**

---

## 3. Terceiros e operadores

- [ ] Nenhum terceiro novo
- [ ] Novo terceiro — atualizei [privacy-policy.html](../privacy-policy.html) §4 e §5

| Terceiro | Finalidade | País | DPA/contrato? |
|----------|------------|------|---------------|
| | | | |

---

## 4. Cookies e tecnologias similares

- [ ] Nenhum cookie, localStorage, sessionStorage ou pixel novo no domínio `railanepassos.tec.br`
- [ ] Há tecnologia nova — atualizei política §6
- [ ] Avaliei necessidade de banner de consentimento antes de ativar em produção

**Detalhes:**

---

## 5. Transferência internacional

- [ ] Não há transferência nova fora do Brasil
- [ ] Há transferência — documentada na política §5 (EUA/EU/etc.)

---

## 6. Direitos do titular (art. 18)

- [ ] Canal `privacy@railanepassos.tec.br` continua válido para exercício de direitos
- [ ] Feature permite exclusão/portabilidade/revogação quando aplicável

---

## 7. Decisões automatizadas e perfilamento

- [ ] Não há decisão automatizada com efeito legal ou relevante
- [ ] Há — documentado na política §10 e explicado ao titular

---

## 8. Segurança (art. 46)

- [ ] Medidas proporcionais aplicadas (HTTPS, CSP, mínimo de dados)
- [ ] Sem segredos no código (gitleaks OK)
- [ ] Plano se incidente: notificar ANPD/titulares conforme arts. 48–50

---

## 9. Retenção

- [ ] Prazo de retenção definido ou N/A (dados só em terceiro, ex.: Google Calendar)

| Dado | Prazo | Após o prazo |
|------|-------|--------------|
| | | eliminação / anonimização |

---

## 10. Atualização documental

- [ ] **N/A** — sem impacto na política
- [ ] Atualizei [privacy-policy.html](../privacy-policy.html)
- [ ] Bump em **Última atualização** e **Versão** no topo da política
- [ ] PR tem label `lgpd-reviewed` ou texto `LGPD-OK` (exigido pelo CI se HTML do site mudou)

---

## Aprovação

| Papel | Nome | Data |
|-------|------|------|
| Responsável técnico | | |
| Revisão LGPD (titular/controladora) | Railane Passos | |

---

## Referências

- [PLAYBOOK.md](../PLAYBOOK.md) §5
- [ANPD](https://www.gov.br/anpd/pt-br)
- Lei 13.709/2018 (LGPD)
