# 🧪 Laboratório em Apuros - Jogo 3D com Three.js

## Versão Atual

### Melhorias Implementadas

#### 1. 📐 Câmera Isométrica Inclinada (Todos os Níveis)
- Vista em perspetiva isométrica consistente
- Posição: [6, 8, 6]
- Altura de visão: 0.15
- Resultado: Visualização clara e intuitiva do laboratório 3D

#### 2. 🛑 Colisão com Móveis
O boneco **NÃO pode atravessar** nenhum móvel:
- ✅ Bancadas (benches)
- ✅ Reator/Equação
- ✅ Estação de Entrega
- ✅ Estações de Reagentes
- ✅ Outros móveis (aquecedor, filtro, magneto, etc.)

**EXCEÇÕES**: O boneco pode passar por:
- Reagentes em movimento (pode apanhá-los)
- Carros/Carrinhos (são hazards para evitar, não barreiras)

#### 3. 🏗️ Nível 1 - Fase Água
- Obstáculos movidos para os cantos: [1,1] e [7,5]
- Equação em [4,3] é totalmente acessível
- Mais espaço para explorar e recolher reagentes

#### 4. 🛣️ Nível 2 - Fase Travessia
- 1 carro por faixa (em vez de 2)
- Faixas em Y=1 e Y=5 (extremos do mapa)
- Y=3 fica livre para o boneco atravessar
- Muito mais fácil e divertido!

#### 5. 🏁 Nível 3 - Fase Labirinto
- Mesmo sistema de câmera isométrica
- Colisão com mobiliário garantida
- Labirinto navegável sem atravessar paredes/móveis

## 🎮 Como Jogar

### Controles
- **WASD** ou **Setas** - Mover boneco
- **ESPAÇO** - Interagir com bancadas/equipamentos

### Objetivo
1. Recolhe os reagentes em movimento
2. Leva-os à bancada "Equação"
3. Acerta a equação química (balanceamento de átomos)
4. Entrega o resultado na estação "Entregar"

## 📁 Arquivos

- `index.html` - Interface do jogo
- `style.css` - Estilos e layout
- `game.js` - Lógica do jogo
- `laboratory-3d.js` - Renderização 3D com Three.js
- `vendor/three.min.js` - Three.js library

## 🚀 Como Executar

```bash
cd /home/mariana/Desktop/jogo-quimica
python3 -m http.server 8000
# Abrir em http://localhost:8000
```

## 🌐 Publicar no GitHub Pages

O repositório já inclui um workflow que publica automaticamente o jogo no GitHub
Pages sempre que houver um push na branch `master`.

1. Faça o push do projeto para o GitHub:

   ```bash
   git push -u origin master
   ```

2. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como
   origem da publicação, se essa opção ainda não estiver selecionada.
3. Aguarde a execução do workflow **Publicar no GitHub Pages** em **Actions**.
4. O endereço do jogo aparecerá em **Settings → Pages** e também no resumo da
   execução do workflow.

## ✨ Destaques Técnicos

- **Three.js** para renderização 3D
- **Câmera Ortográfica** para perspetiva isométrica precisa
- **Sistema de Colisão** grid-based
- **Renderização Dinâmica** com caching de geometrias
- **Responsive Design** (funciona em desktop e mobile)
- **Simulações Químicas** com balanceamento de equações

---

Desenvolvido com ❤️ para ensino de química interativo!
