# AGENTS.md — Regras para agentes de IA

Instruções obrigatórias para **Cursor**, **GitHub Copilot**, **Claude Code** e qualquer agente automatizado que edite este repositório.

Leia também: [PLAYBOOK.md](PLAYBOOK.md) | [docs/lgpd-checklist.md](docs/lgpd-checklist.md)

---

## Antes de qualquer mudança

1. Ler [PLAYBOOK.md](PLAYBOOK.md) (este projeto segue a esteira completa).
2. Identificar o tipo de trabalho: `feat`, `fix`, `chore`, `docs`.
3. Confirmar se existe issue/spec; se não existir, propor criação antes de codar.
4. Verificar se a mudança toca dados pessoais → abrir [docs/lgpd-checklist.md](docs/lgpd-checklist.md).

---

## TDD (obrigatório)

| Fase | Ação do agente |
|------|----------------|
| Vermelho | Escrever ou atualizar teste que **falha** antes da implementação |
| Verde | Implementar o mínimo para passar |
| Refatorar | Limpar sem quebrar testes |

- **Nunca** entregar apenas código de produção sem teste correspondente.
- **Site estático (HTML/CSS):** equivalente = atualizar ou adicionar verificação no CI (`html-validate`, `stylelint`, checklist LGPD) e descrever no PR como foi validado.
- **JS/TS (quando existir `package.json`):** usar Vitest (unit), Stryker (mutação), Playwright (integração).

---

## O que o agente PODE fazer

- Criar/editar arquivos em branches de feature (não em `main` diretamente).
- Sugerir commits no formato Conventional Commits.
- Preencher template de PR e checklist LGPD.
- Rodar testes e linters localmente quando o ambiente permitir.
- Propor dependências novas em **PR separado** `chore/deps-*` com justificativa de segurança.

---

## O que o agente NÃO PODE fazer

- `git push` para `main` ou merge sem aprovação humana.
- Pular testes ou desabilitar gates de CI sem issue aprovada.
- Inserir segredos, tokens, CNPJ, dados de empregador CLT ou informações que o titular pediu para não expor.
- Adicionar analytics, cookies ou scripts de terceiros sem atualizar [privacy-policy.html](privacy-policy.html) e checklist LGPD.
- Alterar [privacy-policy.html](privacy-policy.html) sem checklist LGPD completo.
- Relaxar CSP (`script-src`, `connect-src`, etc.) sem revisão de segurança explícita na issue.
- Usar modo “caveman” ou linguagem informal em **código, commits, issues ou PRs** (apenas conversa com usuário, se solicitado).

---

## Context engineering (prompts internos)

Ao iniciar tarefa, o agente deve considerar:

```
Projeto: site de marca pessoal — qualidade de software × IA
Stack atual: HTML/CSS estático; TS/Vitest/Playwright na Onda 2
Domínio: railanepassos.tec.br
LGPD: sem formulários embutidos; calendar via Google sob clique do usuário
Segurança: CSP estrita, sem CDN de scripts, Snyk + Sonar + gitleaks no CI
```

Incluir no contexto do PR: **o que mudou**, **por que**, **como testar**, **impacto LGPD**.

---

## Fluxo recomendado com IA

1. Humano descreve feature na issue (template feature).
2. Agente propõe plano em comentário (arquivos afetados + testes).
3. Agente implementa teste vermelho → verde.
4. Humano revisa diff (especialmente LGPD e segurança).
5. CI verde → merge.

---

## Arquivos sensíveis

| Arquivo | Cuidado |
|---------|---------|
| `privacy-policy.html` | Sempre checklist LGPD + bump de versão/data |
| `.github/workflows/*` | Não remover gates; mudanças exigem `chore/ci` |
| `assets/img/perfil.jpg` | Crop quadrado com rosto visível; JPEG válido |
| `CNAME` | Não alterar sem confirmação explícita |

---

## Comandos úteis (Onda 2+, quando existir `package.json`)

```bash
npm run test:unit
npm run test:mutation
npm run test:e2e
npm run lint
```

**Onda 1 (atual):** validação via CI no PR; localmente revisar HTML/CSS manualmente ou aguardar checks do GitHub Actions.

---

## Escalação

- Dúvida LGPD → marcar issue com label `lgpd` e não mergear até revisão humana.
- Vulnerabilidade encontrada → não commitar exploit; abrir issue `fix/security-*` privada se necessário.
- Conflito entre velocidade e TDD → TDD prevalece (ver PLAYBOOK §1).
