## Descrição

<!-- O que mudou e por quê (link para issue: Fixes #) -->

Fixes #

## Tipo de mudança

- [ ] `feat` — nova funcionalidade
- [ ] `fix` — correção de bug
- [ ] `docs` — documentação / playbook
- [ ] `chore` — CI, tooling, deps
- [ ] `style` — CSS/HTML sem mudança de lógica
- [ ] `refactor` — refatoração sem mudança de comportamento
- [ ] `test` — apenas testes
- [ ] `ci` — pipelines

## TDD e testes

- [ ] Teste(s) escritos/atualizados **antes** ou junto com a implementação
- [ ] Testes unitários passam localmente ou N/A (site estático — gates HTML/CSS no CI)
- [ ] Testes de integração/e2e passam ou N/A
- [ ] Testes de mutação (Stryker) passam ou N/A (Onda 2 — sem `package.json` ainda)
- [ ] Descrevi como validar manualmente (passos abaixo)

### Como testar

1. 
2. 

## Segurança e qualidade

- [ ] CI verde (`lint-html`, `lint-css`, `a11y`, `gitleaks`, `lgpd-policy-check`)
- [ ] Snyk Code sem novas vulnerabilidades high/critical (workflow `snyk-security.yml`)
- [ ] SonarCloud Quality Gate OK ou N/A (secret não configurado ainda)
- [ ] Nenhum segredo, token ou dado sensível no diff
- [ ] CSP mantida em todos os HTML alterados
- [ ] Sem novas dependências OU dependências justificadas em PR `chore/deps` separado

## LGPD

<!-- Se não aplicável, marque "N/A" e justifique uma linha -->

- [ ] Li e preenchi [docs/lgpd-checklist.md](../docs/lgpd-checklist.md)
- [ ] **N/A** — esta mudança não altera coleta, cookies, terceiros nem política de privacidade

Se aplicável:

- [ ] [privacy-policy.html](../privacy-policy.html) atualizada (data/versão bump)
- [ ] Label `lgpd-reviewed` aplicada neste PR (obrigatório se `*.html` mudou, exceto só política)
- [ ] Corpo do PR contém `LGPD-OK` (alternativa à label)

### Resumo de impacto em dados pessoais

<!-- Ex.: nenhum / novo link Google Calendar / novo script analytics -->

## Screenshots / evidências

<!-- Opcional: antes/depois, relatório axe, cobertura -->

## Checklist final

- [ ] Commits seguem [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] [PLAYBOOK.md](../PLAYBOOK.md) e [AGENTS.md](../AGENTS.md) respeitados
- [ ] Self-review feito no diff
