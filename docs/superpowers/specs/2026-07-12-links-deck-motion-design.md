# Design: Deck — motion estilo Tinder

**Date:** 2026-07-12  
**Status:** Approved in chat (awaiting file review)  
**Parent:** [links-deck-tinder-design](./2026-07-12-links-deck-tinder-design.md)  
**Surface:** `/p/a8f3k2/` Deck (editor autenticado)  
**Tipo:** `feat`

---

## 1. Problem

O Deck já segue o dedo (translate + rotação + carimbos), mas a decisão é **instantânea**: o card some sem voo de saída, sem snap-back e sem o próximo card “subir” da pilha. Falta o feedback cinético que torna o gesto legível e prazeroso.

## 2. Goals

| Gatilho | Resultado visual |
|---------|------------------|
| Soltar abaixo do limiar de swipe | Snap-back ao centro (~220ms, ease-out) |
| Swipe / botão / seta **direita** (Quero / Repetir) | Voo para a direita + carimbo “Quero/Repetir” |
| Swipe / botão / seta **esquerda** (Agora não / Passar) | Voo para a esquerda + carimbo “Agora não/Passar” |
| Botão / tecla **D** **Já fiz** (só wishlist) | Voo para cima |
| Após qualquer voo | Próximo card da pilha sobe (scale/opacity) e entra como ativo |
| `prefers-reduced-motion: reduce` | Sem voo, snap ou enter — decisão imediata |

**Fora de escopo:** partículas, haptic, sons, lib de animação/gesture, CDN, mudar regras de negócio do Deck.

## 3. Decisions (aprovadas)

| Tema | Decisão |
|------|----------|
| Pacote | B — fly-off + snap-back + peek→front + mesmos voos nos botões |
| Reduced motion | A — respeitar; instantâneo |
| Já fiz | A — voo para cima |
| Técnica | CSS + classes; `animationend` / `transitionend` antes de avançar a fila |
| Lib | Nenhuma |

## 4. Motion details

### 4.1 Snap-back

- Ao soltar com `|dx| < SWIPE_THRESHOLD`, aplicar classe `--snap` (ou transition de `--deck-drag-*` → 0).
- Duração alvo: ~220ms, `ease-out`.
- Limpar variáveis CSS ao terminar.

### 4.2 Fly-off

Classes no card ativo (BEM):

| Classe | Transform alvo (approx.) |
|--------|---------------------------|
| `links-deck-screen__card--fly-right` | `translateX(120vw) rotate(18deg)` |
| `links-deck-screen__card--fly-left` | `translateX(-120vw) rotate(-18deg)` |
| `links-deck-screen__card--fly-up` | `translateY(-120vh) rotate(-6deg)` |
| `links-deck-screen__card--snap` | volta ao centro |
| `links-deck-screen__card--enter` | entrada do próximo |

- Duração alvo: ~280–320ms, `ease-in`.
- Carimbo da direção fica em opacidade 1 durante o voo.
- Stamp / lean já existentes podem permanecer até o fim do voo.

### 4.3 Peek → next

Durante o fly-off do card da frente:

- Peek (próximo) anima de ~`scale(0.94)` / opacidade reduzida → `scale(1)` / opacidade 1 (~180–220ms).

Após `animationend` do fly-off:

1. Chamar o handler de negócio (já feito hoje *antes* do paint — ver §5).
2. Remover o card voado da fila / `paintCard`.
3. Novo card ativo recebe `--enter` curto (fade/scale ~180ms) se houver item.

### 4.4 Botões e teclado

Mesmos voos que o swipe correspondente:

| Controle | Voo |
|----------|-----|
| Quero / → / ArrowRight | `fly-right` |
| Agora não / Passar / ← / ArrowLeft | `fly-left` |
| Já fiz / D | `fly-up` |

### 4.5 Busy / reentrância

- Durante snap ou fly-off: `busy = true` (ou flag `animating`) — ignora pointer, botões e teclado.
- Liberar só após `animationend` / `transitionend` (com timeout de segurança ~500ms se o evento não vier).
- Reduced motion: não setar animating além do fluxo sync atual.

## 5. Controle de fluxo (importante)

Hoje `actWant` / `actSkip` / `actDone` mutam a fila **na hora**. Com motion:

```
decidir direção → animar → (on end) handler + advance/paint
```

Ordem sugerida:

1. Travar UI (`busy`).
2. Aplicar classe de fly (ou skip anim se reduced motion).
3. No fim: `await handlers.*` quando aplicável; atualizar queue; `paintCard`; liberar UI.

Handlers assíncronos (`onWant`, `onMarkDone`, `onWantAgain`) continuam após o voo, para o usuário sentir a resposta imediata do gesto; erro de rede pode ser tratado como hoje (toast / refresh).

## 6. CSS

- Keyframes / transitions em `styles.css` sob `.links-deck-screen__card--fly-*`, `--snap`, `--enter`.
- Em `@media (prefers-reduced-motion: reduce)`: desligar transitions/animations do Deck (já há bloco similar); JS também short-circuita.

## 7. Testes

Unitários (`deck-ui.test.ts` / helper se extrair):

- Com reduced motion (mock `matchMedia`): handler chamado sem esperar animação.
- Com motion mockável: após disparar Quero, handler **não** corre antes do `animationend` simulado; corre depois.
- Snap-back não chama handler.

(Preferir injetar/aguardar eventos DOM em jsdom; se flaky, extrair `runExitAnimation(dir): Promise<void>` testável.)

## 8. LGPD / segurança

Sem mudança de dados pessoais, cookies ou CSP. Só UX no client já autenticado.

## 9. Success criteria

- [ ] Swipe completo e botões produzem voo na direção correta.
- [ ] Soltar cedo faz snap-back; não decide.
- [ ] Já fiz voa para cima.
- [ ] Próximo card sobe da pilha de forma perceptível.
- [ ] Reduced motion: decisão instantânea, sem classes de motion.
- [ ] Sem double-submit durante animação.
- [ ] Testes unitários cobrindo ordem animação → handler.
