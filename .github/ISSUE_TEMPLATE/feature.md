---
name: Feature (spec-driven)
description: Nova funcionalidade ou melhoria com spec e critérios de aceite
title: "feat: "
labels: ["enhancement"]
assignees: []
---

## Contexto

<!-- Por que esta feature existe? Alinhamento com marca "Aplicações com qualidade usando IA" -->

## Objetivo

<!-- Uma frase: o que o usuário/visitante consegue fazer depois? -->

## Critérios de aceite

- [ ] 
- [ ] 
- [ ] 

## Fora de escopo

<!-- O que explicitamente NÃO será feito nesta issue -->

## Spec técnica

### Arquivos prováveis

<!-- ex.: index.html, styles.css, src/analytics.ts -->

### Testes planejados

| Tipo | Descrição |
|------|-----------|
| Unitário | |
| Mutação | |
| Integração / e2e | |
| Estático (HTML/CSS/LGPD) | |

## Segurança (threat sketch)

| Ameaça | Mitigação |
|--------|-----------|
| XSS | CSP, sem inline script |
| Segredos vazados | gitleaks, sem tokens no repo |
| Supply chain | Snyk, deps mínimas |
| | |

## LGPD

- [ ] Checklist [docs/lgpd-checklist.md](../../docs/lgpd-checklist.md) será preenchido no PR
- Coleta de dados pessoais? **Sim / Não**
- Novos terceiros/cookies? **Sim / Não**
- Base legal (art. 7 LGPD), se aplicável: 

## Uso de IA no desenvolvimento

- [ ] Agente deve seguir [AGENTS.md](../../AGENTS.md) (TDD vermelho → verde)
- Contexto adicional para o agente:

```
```

## Definição de pronto

- [ ] PR aberto com template completo
- [ ] Todos os gates CI verdes
- [ ] Review humano aprovado
