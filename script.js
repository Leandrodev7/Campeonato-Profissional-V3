/* =====================================================
   CONFIGURAÇÃO DO SUPABASE
   Cole aqui os dois dados do seu projeto
   (Project Settings > API):
   - Project URL
   - chave "anon public" (ou "publishable", conforme o painel)
   NUNCA cole a chave service_role / secret aqui.
   ===================================================== */
const SUPABASE_URL = "https://yiprhfetaimulzqvoukq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_zyCootX0dUUaLAfP0Gp0kg_4MlsBGJ5";
const TABELA = "campeonato";
const LINHA_ID = 1;

const STORAGE_KEY = "campeonato_profissional_v23";

let data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

/* Estado da nuvem */
let nuvemAtiva =
  !SUPABASE_URL.startsWith("COLE_AQUI") &&
  !SUPABASE_ANON_KEY.startsWith("COLE_AQUI");
let supa = null;
let ehAdmin = false;
let servidorCarregado = false;
let ultimaAtualizacaoServidor = null;
let enviando = false;
let reenviar = false;

function validarEstrutura() {
  if (!data || typeof data !== "object") data = {};
  if (!data.temporadaAtual) data.temporadaAtual = "2026";
  if (!Array.isArray(data.times)) data.times = [];
  if (!Array.isArray(data.jogadores)) data.jogadores = [];
  if (!Array.isArray(data.historico)) data.historico = [];

  if (!data.campeonato || typeof data.campeonato !== "object") {
    data.campeonato = {
      formato: "PONTOS_CORRIDOS",
      faseAtualIndex: 0,
      fases: [],
    };
  }

  if (!Array.isArray(data.campeonato.fases)) {
    data.campeonato.fases = [];
  }

  data.times.forEach((t, idx) => {
    if (!t || typeof t !== "object") {
      data.times[idx] = {
        id: "t_" + Date.now() + "_" + idx,
        nome: "Time " + (idx + 1),
        cidade: "",
        pts: 0,
        j: 0,
        v: 0,
        e: 0,
        d: 0,
        gp: 0,
        gc: 0,
        sg: 0,
      };
      return;
    }

    if (!t.id || t.id === "undefined") {
      t.id =
        "t_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000);
    } else {
      t.id = String(t.id);
    }

    if (!t.nome) t.nome = "Time " + (idx + 1);
    if (typeof t.cidade !== "string") t.cidade = "";

    t.pts = Number(t.pts) || 0;
    t.j = Number(t.j) || 0;
    t.v = Number(t.v) || 0;
    t.e = Number(t.e) || 0;
    t.d = Number(t.d) || 0;
    t.gp = Number(t.gp) || 0;
    t.gc = Number(t.gc) || 0;
    t.sg = Number(t.sg) || 0;
  });
}

validarEstrutura();

function save() {
  validarEstrutura();

  // Visitante não pode alterar nada: descarta a mudança e recarrega do servidor
  if (nuvemAtiva && !ehAdmin) {
    alert(
      "Somente o administrador pode alterar os dados. Faça login para editar.",
    );
    carregarDoServidor(true);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render();
  enviarParaServidor();
}

function mostrarAba(e, id) {
  document
    .querySelectorAll(".tab-content")
    .forEach((x) => x.classList.remove("active"));

  document
    .querySelectorAll(".tab-btn")
    .forEach((x) => x.classList.remove("active"));

  const el = document.getElementById(id);
  if (el) el.classList.add("active");

  if (e) {
    const botao = e.currentTarget || e.target?.closest?.(".tab-btn");

    if (botao) botao.classList.add("active");
  }
}

function alternarVisibilidadeFormatos() {
  const fmt = document.getElementById("formatoCampeonato")?.value;

  const box = document.getElementById("boxTurnos");

  if (box) {
    box.style.display = fmt === "PONTOS_CORRIDOS" ? "block" : "none";
  }
}

function addTeam() {
  const nomeInput = document.getElementById("teamName").value.trim();

  const cidade = document.getElementById("teamCidade").value.trim();

  if (!nomeInput) {
    return alert("Digite o nome do time");
  }

  const nome = nomeInput.charAt(0).toUpperCase() + nomeInput.slice(1);

  const jaExiste = data.times.some(
    (t) => t.nome.toLowerCase() === nome.toLowerCase(),
  );

  if (jaExiste) {
    return alert("Esse time já está cadastrado!");
  }

  const idUnica = "t_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

  data.times.push({
    id: idUnica,
    nome,
    cidade,
    pts: 0,
    j: 0,
    v: 0,
    e: 0,
    d: 0,
    gp: 0,
    gc: 0,
    sg: 0,
  });

  document.getElementById("teamName").value = "";
  document.getElementById("teamCidade").value = "";

  save();
}

function removeTeam(id) {
  const idProcurado = String(id);

  const index = data.times.findIndex((x) => String(x.id) === idProcurado);

  if (index === -1) {
    return alert("Erro: Time não encontrado.");
  }

  const t = data.times[index];

  if (!confirm(`Remover ${t.nome}? Isso vai reiniciar o campeonato atual.`)) {
    return;
  }

  data.times.splice(index, 1);

  data.jogadores = data.jogadores.filter(
    (j) => String(j.timeId) !== idProcurado,
  );

  data.campeonato.fases = [];
  data.campeonato.faseAtualIndex = 0;

  recalcularTodasEstatisticas();
  save();
}

function obterForma(timeId) {
  const res = [];
  const idStr = String(timeId);

  data.campeonato.fases.forEach((fase) => {
    if (fase.tipo !== "PONTOS_CORRIDOS") return;

    (fase.rodadas || []).forEach((r) => {
      (r.jogos || []).forEach((j) => {
        if (j.golsCasa === null || j.golsFora === null) {
          return;
        }

        const c = String(j.casa) === idStr;
        const f = String(j.fora) === idStr;

        if (!c && !f) return;

        const gt = c ? j.golsCasa : j.golsFora;
        const ga = c ? j.golsFora : j.golsCasa;

        res.push(gt > ga ? "V" : gt < ga ? "D" : "E");
      });
    });
  });

  return res.slice(-5);
}

function abrirPerfil(timeId) {
  const idStr = String(timeId);

  const t = data.times.find((x) => String(x.id) === idStr);

  if (!t) return;

  const forma =
    obterForma(timeId)
      .map((r) => `<span class="bol ${r}">${r}</span>`)
      .join("") || "<span style='color:#999'>sem jogos</span>";

  const jog = data.jogadores.filter((j) => String(j.timeId) === idStr);

  let jogos = [];

  data.campeonato.fases.forEach((fase) => {
    if (fase.tipo === "PONTOS_CORRIDOS") {
      (fase.rodadas || []).forEach((r) => {
        (r.jogos || []).forEach((j) => {
          if (String(j.casa) === idStr || String(j.fora) === idStr) {
            jogos.push({
              fase: fase.nome,
              n: r.numero,
              ...j,
            });
          }
        });
      });
    }

    if (fase.tipo === "MATA_MATA") {
      (fase.etapas || []).forEach((etapa) => {
        (etapa.jogos || []).forEach((j) => {
          if (String(j.casa) === idStr || String(j.fora) === idStr) {
            jogos.push({
              fase: etapa.nome,
              n: "",
              ...j,
            });
          }
        });
      });
    }
  });

  const jogosHTML = jogos.length
    ? jogos
        .map((j) => {
          const c = data.times.find((x) => String(x.id) === String(j.casa)) || {
            nome: j.casaPlaceholder || "A definir",
          };

          const f = data.times.find((x) => String(x.id) === String(j.fora)) || {
            nome: j.foraPlaceholder || "A definir",
          };

          const pl =
            j.golsCasa !== null ? `${j.golsCasa} x ${j.golsFora}` : "— x —";

          return `
            <div
              class="rodada"
              style="margin:6px 0;padding:10px"
            >
              ${j.fase}
              ${j.n ? "Rod." + j.n : ""}:
              ${c.nome} ${pl} ${f.nome}
            </div>
          `;
        })
        .join("")
    : "<p>Sem jogos registrados</p>";

  document.getElementById("conteudoPerfil").innerHTML = `
    <h2
      style="
        text-align:center;
        color:#22c55e;
        margin-bottom:16px
      "
    >
      ${t.nome}
    </h2>

    ${
      t.cidade
        ? `<p style="text-align:center;color:#8b949e">${t.cidade}</p>`
        : ""
    }

    <p class="destaque">
      📊 Resumo Geral na Temporada
    </p>

    <div
      style="
        display:grid;
        grid-template-columns:repeat(5,1fr);
        gap:8px;
        margin:12px 0
      "
    >
      <div class="perfil-stat">
        <strong>${t.pts}</strong>
        <span>PTS</span>
      </div>

      <div class="perfil-stat">
        <strong>${t.j}</strong>
        <span>JOGOS</span>
      </div>

      <div class="perfil-stat">
        <strong>${t.v}</strong>
        <span>VITÓRIAS</span>
      </div>

      <div class="perfil-stat">
        <strong>${t.e}</strong>
        <span>EMPATES</span>
      </div>

      <div class="perfil-stat">
        <strong>${t.d}</strong>
        <span>DERROTAS</span>
      </div>
    </div>

    <div
      style="
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:8px;
        margin:8px 0 16px
      "
    >
      <div class="perfil-stat">
        <strong>${t.gp}</strong>
        <span>GP</span>
      </div>

      <div class="perfil-stat">
        <strong>${t.gc}</strong>
        <span>GC</span>
      </div>

      <div class="perfil-stat">
        <strong>${t.sg}</strong>
        <span>SALDO</span>
      </div>
    </div>

    <p>Forma: ${forma}</p>

    <br>

    <p class="destaque">
      👟 Artilheiros do Time
    </p>

    ${
      jog.length
        ? jog.map((j) => `<p>• ${j.nome} — ${j.gols} gols</p>`).join("")
        : "<p>Sem jogadores</p>"
    }

    <br>

    <p class="destaque">
      📋 Histórico de Jogos
    </p>

    ${jogosHTML}
  `;

  mostrarAba(null, "perfilTime");
}

function gerarCampeonatoCompleto() {
  validarEstrutura();

  if (data.times.length < 2) {
    return alert("Cadastre pelo menos 2 times diferentes!");
  }

  const fmt = document.getElementById("formatoCampeonato").value;

  data.campeonato.formato = fmt;
  data.campeonato.faseAtualIndex = 0;
  data.campeonato.fases = [];

  if (fmt === "PONTOS_CORRIDOS") {
    const turnos = document.getElementById("opcaoTurnos").value;

    data.campeonato.fases.push(
      criarFasePontosCorridos("Fase Única", data.times, turnos),
    );
  } else if (fmt === "MATA_MATA") {
    data.campeonato.fases.push(
      criarFaseMataMata("Mata-Mata Principal", data.times),
    );
  } else if (fmt === "MISTO") {
    data.campeonato.fases.push(
      criarFaseGruposMisto("Fase de Grupos", data.times),
    );
  }

  recalcularTodasEstatisticas();
  save();
}

function criarFasePontosCorridos(
  nomeFase,
  listaTimes,
  turnos,
  grupoNome = null,
) {
  let t = [...listaTimes];

  if (t.length % 2 !== 0) {
    t.push({
      id: "FOLGA",
      nome: "Folga",
    });
  }

  const totalTimes = t.length;
  const totalRodadas = totalTimes - 1;
  const metade = totalTimes / 2;
  const rodadas = [];

  for (let r = 0; r < totalRodadas; r++) {
    const jogos = [];

    for (let i = 0; i < metade; i++) {
      const casa = t[i];
      const fora = t[totalTimes - 1 - i];

      if (casa.id !== "FOLGA" && fora.id !== "FOLGA") {
        jogos.push({
          id: "j_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
          casa: String(casa.id),
          fora: String(fora.id),
          golsCasa: null,
          golsFora: null,
          grupo: grupoNome,
        });
      }
    }

    if (jogos.length) {
      rodadas.push({
        numero: r + 1,
        jogos,
      });
    }

    t = [t[0], t[totalTimes - 1], ...t.slice(1, totalTimes - 1)];
  }

  if (String(turnos) === "2") {
    const primeiraParte = [...rodadas];

    rodadas.push(
      ...primeiraParte.map((r, i) => ({
        numero: primeiraParte.length + i + 1,

        jogos: r.jogos.map((j) => ({
          id: "j_" + Date.now() + "_" + Math.floor(Math.random() * 10000),

          casa: String(j.fora),
          fora: String(j.casa),

          golsCasa: null,
          golsFora: null,

          grupo: grupoNome,
        })),
      })),
    );
  }

  return {
    id: "fase_" + Date.now(),
    nome: nomeFase,
    tipo: "PONTOS_CORRIDOS",
    concluida: false,
    rodadas,
  };
}

function criarFaseGruposMisto(nomeFase, listaTimes) {
  const sorteados = [...listaTimes].sort(() => Math.random() - 0.5);

  const timesPorGrupo = 4;

  const numGrupos = Math.max(1, Math.floor(sorteados.length / timesPorGrupo));

  const grupos = {};

  for (let i = 0; i < numGrupos; i++) {
    const letra = String.fromCharCode(65 + i);

    grupos[`Grupo ${letra}`] = [];
  }

  sorteados.forEach((time, index) => {
    const letra = String.fromCharCode(65 + (index % numGrupos));

    grupos[`Grupo ${letra}`].push(time);
  });

  const todasRodadas = [];

  for (const [nomeGrupo, membros] of Object.entries(grupos)) {
    const faseGrupo = criarFasePontosCorridos(
      nomeGrupo,
      membros,
      "1",
      nomeGrupo,
    );

    faseGrupo.rodadas.forEach((r) => {
      todasRodadas.push({
        numero: r.numero,
        grupo: nomeGrupo,
        jogos: r.jogos,
      });
    });
  }

  return {
    id: "fase_grupos",
    nome: nomeFase,
    tipo: "PONTOS_CORRIDOS",
    concluida: false,
    grupos,
    rodadas: todasRodadas,
  };
}
function nomeEtapaPorNumeroDeJogos(n) {
  if (n === 16) return "16 avos de Final";
  if (n === 8) return "Oitavas de Final";
  if (n === 4) return "Quartas de Final";
  if (n === 2) return "Semifinal";
  if (n === 1) return "Grande Final";
  return "Fase";
}

function criarFaseMataMata(nomeFase, listaTimes) {
  const n = listaTimes.length;
  if (n < 2) return null;

  const times = [...listaTimes].sort(() => Math.random() - 0.5);

  let potencia = 2;
  while (potencia < n) potencia *= 2;

  const totalJogos = potencia / 2;
  const byes = potencia - n;
  const nomes = [];

  if (n !== potencia) nomes.push("Primeira Fase");

  let jogosProxima = totalJogos / 2;

  while (jogosProxima >= 1) {
    nomes.push(nomeEtapaPorNumeroDeJogos(jogosProxima));
    jogosProxima /= 2;
  }

  const etapas = [];
  const indicesBye = [];

  while (indicesBye.length < byes) {
    const i = Math.floor(Math.random() * totalJogos);
    if (!indicesBye.includes(i)) {
      indicesBye.push(i);
    }
  }

  const jogosPrimeira = [];
  let pos = 0;

  for (let i = 0; i < totalJogos; i++) {
    const casa = times[pos++] || null;
    let fora = null;

    if (!indicesBye.includes(i)) {
      fora = times[pos++] || null;
    }

    const isBye = casa && !fora;

    jogosPrimeira.push({
      id: "m_" + totalJogos + "_" + i,
      casa: casa ? String(casa.id) : null,
      fora: fora ? String(fora.id) : null,
      casaPlaceholder: casa ? casa.nome : "BYE",
      foraPlaceholder: fora ? fora.nome : "BYE",
      golsCasa: isBye ? 0 : null,
      golsFora: isBye ? 0 : null,
      vencedor: isBye ? String(casa.id) : null,
      isBye: !!isBye,
    });
  }

  etapas.push({
    nome: nomes[0],
    jogos: jogosPrimeira,
  });

  let quantidade = totalJogos / 2;
  let indiceNome = 1;

  while (quantidade >= 1) {
    const jogos = [];

    for (let i = 0; i < quantidade; i++) {
      jogos.push({
        id: "m_" + quantidade + "_" + i,
        casa: null,
        fora: null,
        casaPlaceholder: "A definir",
        foraPlaceholder: "A definir",
        golsCasa: null,
        golsFora: null,
        vencedor: null,
        isBye: false,
      });
    }

    etapas.push({
      nome: nomes[indiceNome] || nomeEtapaPorNumeroDeJogos(quantidade),
      jogos,
    });

    quantidade /= 2;
    indiceNome++;
  }

  const fase = {
    id: "fase_mm_" + Date.now(),
    nome: nomeFase,
    tipo: "MATA_MATA",
    concluida: false,
    etapas,
  };

  recalcularMataMata(fase);
  return fase;
}

function recalcularMataMata(fase) {
  if (!fase || fase.tipo !== "MATA_MATA") return;

  for (let e = 0; e < fase.etapas.length - 1; e++) {
    const atual = fase.etapas[e];
    const proxima = fase.etapas[e + 1];

    atual.jogos.forEach((j, indice) => {
      const proximo = proxima.jogos[Math.floor(indice / 2)];

      if (!proximo) return;

      const vencedor =
        j.vencedor && j.vencedor !== "BYE" ? String(j.vencedor) : null;

      const time =
        vencedor && data.times.find((t) => String(t.id) === vencedor);

      const nome = time ? time.nome : "A definir";

      if (indice % 2 === 0) {
        if (proximo.casa !== vencedor) {
          proximo.golsCasa = null;
          proximo.golsFora = null;
          proximo.vencedor = null;
        }

        proximo.casa = vencedor;
        proximo.casaPlaceholder = nome;
      } else {
        if (proximo.fora !== vencedor) {
          proximo.golsCasa = null;
          proximo.golsFora = null;
          proximo.vencedor = null;
        }

        proximo.fora = vencedor;
        proximo.foraPlaceholder = nome;
      }
    });
  }
}

function definirJogoMataMata(faseIdx, etapaIdx, jogoIdx) {
  const fase = data.campeonato.fases[faseIdx];
  if (!fase) return;

  const etapa = fase.etapas[etapaIdx];
  if (!etapa) return;

  const jogo = etapa.jogos[jogoIdx];
  if (!jogo) return;

  if (!jogo.casa || !jogo.fora) {
    return alert("Aguardando a definição dos dois times.");
  }

  let gc = prompt("Gols do time da casa:", jogo.golsCasa ?? "");

  if (gc === null) return;

  let gf = prompt("Gols do visitante:", jogo.golsFora ?? "");

  if (gf === null) return;

  gc = parseInt(gc, 10);
  gf = parseInt(gf, 10);

  if (isNaN(gc) || isNaN(gf) || gc < 0 || gf < 0) {
    return alert("Digite placares válidos.");
  }

  let vencedor;

  if (gc === gf) {
    const pen = prompt(
      "Empate! Quem venceu nos pênaltis?\nDigite C para Casa ou F para Fora:",
    );

    if (pen === null) return;

    const opcao = pen.trim().toUpperCase();

    if (opcao === "C") {
      vencedor = jogo.casa;
    } else if (opcao === "F") {
      vencedor = jogo.fora;
    } else {
      return alert("Opção de pênaltis inválida.");
    }
  } else {
    vencedor = gc > gf ? jogo.casa : jogo.fora;
  }

  jogo.golsCasa = gc;
  jogo.golsFora = gf;
  jogo.vencedor = String(vencedor);

  recalcularMataMata(fase);
  recalcularTodasEstatisticas();
  save();
}

function promoverGruposParaMataMata() {
  const grupos = data.campeonato.fases[0];

  if (!grupos || !grupos.grupos) {
    return alert("A fase de grupos não foi encontrada.");
  }

  for (const rodada of grupos.rodadas) {
    for (const jogo of rodada.jogos) {
      if (jogo.golsCasa === null || jogo.golsFora === null) {
        return alert("Finalize todos os jogos da fase de grupos primeiro.");
      }
    }
  }

  if (data.campeonato.fases.some((f) => f.tipo === "MATA_MATA")) {
    return alert("A fase final já foi criada.");
  }

  const classificados = [];

  for (const [nome, membros] of Object.entries(grupos.grupos)) {
    const tabela = calcularTabelaClassificacao(membros, grupos.rodadas);

    if (tabela[0]) classificados.push(tabela[0]);
    if (tabela[1]) classificados.push(tabela[1]);
  }

  if (classificados.length < 2) {
    return alert("Não há classificados suficientes.");
  }

  const mataMata = criarFaseMataMata("Fase Final (Mata-Mata)", classificados);

  data.campeonato.fases.push(mataMata);
  data.campeonato.faseAtualIndex = 1;
  grupos.concluida = true;

  save();

  alert("🎉 Classificados promovidos para a Fase Final!");
}

function calcularTabelaClassificacao(listaTimes, rodadas) {
  const stats = listaTimes.map((t) => ({
    ...t,
    pts: 0,
    j: 0,
    v: 0,
    e: 0,
    d: 0,
    gp: 0,
    gc: 0,
    sg: 0,
  }));

  rodadas.forEach((rodada) => {
    rodada.jogos.forEach((jogo) => {
      if (jogo.golsCasa === null || jogo.golsFora === null) {
        return;
      }

      const casa = stats.find((t) => String(t.id) === String(jogo.casa));

      const fora = stats.find((t) => String(t.id) === String(jogo.fora));

      if (!casa || !fora) return;

      casa.j++;
      fora.j++;

      casa.gp += jogo.golsCasa;
      casa.gc += jogo.golsFora;

      fora.gp += jogo.golsFora;
      fora.gc += jogo.golsCasa;

      if (jogo.golsCasa > jogo.golsFora) {
        casa.v++;
        casa.pts += 3;
        fora.d++;
      } else if (jogo.golsCasa < jogo.golsFora) {
        fora.v++;
        fora.pts += 3;
        casa.d++;
      } else {
        casa.e++;
        fora.e++;
        casa.pts++;
        fora.pts++;
      }
    });
  });

  stats.forEach((t) => {
    t.sg = t.gp - t.gc;
  });

  return stats.sort((a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp);
}

function recalcularTodasEstatisticas() {
  validarEstrutura();

  data.times.forEach((t) => {
    t.pts = 0;
    t.j = 0;
    t.v = 0;
    t.e = 0;
    t.d = 0;
    t.gp = 0;
    t.gc = 0;
    t.sg = 0;
  });

  data.campeonato.fases.forEach((fase) => {
    if (fase.tipo === "PONTOS_CORRIDOS") {
      fase.rodadas.forEach((rodada) => {
        rodada.jogos.forEach((jogo) => {
          if (jogo.golsCasa === null || jogo.golsFora === null) {
            return;
          }

          const casa = data.times.find(
            (t) => String(t.id) === String(jogo.casa),
          );

          const fora = data.times.find(
            (t) => String(t.id) === String(jogo.fora),
          );

          if (!casa || !fora) return;

          casa.j++;
          fora.j++;

          casa.gp += jogo.golsCasa;
          casa.gc += jogo.golsFora;

          fora.gp += jogo.golsFora;
          fora.gc += jogo.golsCasa;

          if (jogo.golsCasa > jogo.golsFora) {
            casa.v++;
            casa.pts += 3;
            fora.d++;
          } else if (jogo.golsCasa < jogo.golsFora) {
            fora.v++;
            fora.pts += 3;
            casa.d++;
          } else {
            casa.e++;
            fora.e++;
            casa.pts++;
            fora.pts++;
          }
        });
      });
    }

    if (fase.tipo === "MATA_MATA") {
      recalcularMataMata(fase);

      fase.etapas.forEach((etapa) => {
        etapa.jogos.forEach((jogo) => {
          if (jogo.golsCasa === null || jogo.golsFora === null) {
            return;
          }

          const casa = data.times.find(
            (t) => String(t.id) === String(jogo.casa),
          );

          const fora = data.times.find(
            (t) => String(t.id) === String(jogo.fora),
          );

          if (!casa || !fora) return;

          casa.j++;
          fora.j++;

          casa.gp += jogo.golsCasa;
          casa.gc += jogo.golsFora;

          fora.gp += jogo.golsFora;
          fora.gc += jogo.golsCasa;

          if (jogo.golsCasa > jogo.golsFora) {
            casa.v++;
            fora.d++;
          } else if (jogo.golsCasa < jogo.golsFora) {
            fora.v++;
            casa.d++;
          } else {
            casa.e++;
            fora.e++;
          }
        });
      });
    }
  });

  data.times.forEach((t) => {
    t.sg = t.gp - t.gc;
  });
}

function definirJogoPontosCorridos(faseIdx, rodadaIdx, jogoIdx) {
  const jogo = data.campeonato.fases[faseIdx].rodadas[rodadaIdx].jogos[jogoIdx];

  let gc = prompt("Gols do mandante:", jogo.golsCasa ?? "");

  if (gc === null) return;

  let gf = prompt("Gols do visitante:", jogo.golsFora ?? "");

  if (gf === null) return;

  gc = Number(gc);
  gf = Number(gf);

  if (isNaN(gc) || isNaN(gf) || gc < 0 || gf < 0) {
    return alert("Resultado inválido");
  }

  jogo.golsCasa = gc;
  jogo.golsFora = gf;

  recalcularTodasEstatisticas();
  save();
}

function addJogador() {
  const nome = document.getElementById("jogadorNome").value.trim();

  const gols = Number(document.getElementById("jogadorGols").value);

  const time = document.getElementById("jogadorTime").value;

  if (!nome || !time) {
    return alert("Preencha todos os campos");
  }

  data.jogadores.push({
    id: Date.now(),
    nome,
    gols: gols || 0,
    timeId: time,
  });

  document.getElementById("jogadorNome").value = "";
  document.getElementById("jogadorGols").value = "";

  save();
}

function delJogador(id) {
  data.jogadores = data.jogadores.filter((j) => j.id !== id);

  save();
}

function obterCampeaoMataMata(fase) {
  if (!fase || fase.tipo !== "MATA_MATA") {
    return null;
  }

  const final = fase.etapas[fase.etapas.length - 1];

  if (!final || !final.jogos[0]) {
    return null;
  }

  const vencedor = final.jogos[0].vencedor;

  if (!vencedor) return null;

  return data.times.find((t) => String(t.id) === String(vencedor));
}

function encerrarTemporada() {
  if (!data.campeonato.fases.length) {
    return alert("Nenhum torneio em andamento.");
  }

  const tabela = [...data.times].sort(
    (a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp,
  );

  if (!tabela.length) {
    return alert("Sem times");
  }

  const formato = data.campeonato.formato;
  let campeao = null;

  if (formato === "MATA_MATA" || formato === "MISTO") {
    const faseMata = data.campeonato.fases.find((f) => f.tipo === "MATA_MATA");

    campeao = obterCampeaoMataMata(faseMata);

    if (!campeao) {
      return alert("Finalize o mata-mata antes de encerrar a temporada.");
    }
  } else {
    const fase = data.campeonato.fases[0];

    const concluida =
      fase.rodadas.length > 0 &&
      fase.rodadas.every((rodada) =>
        rodada.jogos.every(
          (jogo) => jogo.golsCasa !== null && jogo.golsFora !== null,
        ),
      );

    if (!concluida) {
      return alert("Finalize todos os jogos antes de encerrar a temporada.");
    }

    campeao = tabela[0];
  }

  const artilheiro = [...data.jogadores].sort((a, b) => b.gols - a.gols)[0];

  const ataque = [...data.times].sort((a, b) => b.gp - a.gp)[0];

  const defesa = [...data.times].sort((a, b) => a.gc - b.gc)[0];

  const vice = tabela.find((t) => String(t.id) !== String(campeao.id)) || null;

  data.historico.unshift({
    temporada: data.temporadaAtual,
    dataFim: new Date().toLocaleString(),

    campeao: {
      nome: campeao.nome,
    },

    vice: vice ? { nome: vice.nome } : null,

    artilheiro: artilheiro
      ? {
          nome: artilheiro.nome,
          gols: artilheiro.gols,
        }
      : null,

    melhorAtaque: ataque
      ? {
          nome: ataque.nome,
          gols: ataque.gp,
        }
      : null,

    melhorDefesa: defesa
      ? {
          nome: defesa.nome,
          gols: defesa.gc,
        }
      : null,
  });

  const nova = document.getElementById("novaTemporadaNome")?.value.trim();

  data.temporadaAtual = nova || (Number(data.temporadaAtual) + 1).toString();

  data.times.forEach((t) => {
    t.pts = 0;
    t.j = 0;
    t.v = 0;
    t.e = 0;
    t.d = 0;
    t.gp = 0;
    t.gc = 0;
    t.sg = 0;
  });

  data.campeonato.fases = [];
  data.campeonato.faseAtualIndex = 0;
  data.jogadores = [];

  save();

  alert("Temporada encerrada com sucesso!");
}

function exportarDados() {
  const a = document.createElement("a");

  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );

  a.download = `campeonato_v23_${data.temporadaAtual}.json`;

  a.click();

  URL.revokeObjectURL(a.href);
}

function importarDados() {
  const arquivo = document.getElementById("arquivoImportar").files[0];

  if (!arquivo) {
    return alert("Escolha um arquivo");
  }

  const leitor = new FileReader();

  leitor.onload = (e) => {
    try {
      const novo = JSON.parse(e.target.result);

      if (!confirm("Substituir todos os dados do sistema?")) {
        return;
      }

      data = novo;
      validarEstrutura();
      save();

      alert("Importado com sucesso!");
    } catch {
      alert("Arquivo JSON inválido.");
    }
  };

  leitor.readAsText(arquivo);
}

function comecarNovo() {
  if (!confirm("Apagar todos os dados e começar do zero?")) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);

  data = {
    temporadaAtual: "2026",
    times: [],
    jogadores: [],
    historico: [],
    campeonato: {
      formato: "PONTOS_CORRIDOS",
      faseAtualIndex: 0,
      fases: [],
    },
  };

  save();
}

function render() {
  validarEstrutura();

  const formato = document.getElementById("formatoCampeonato");

  if (formato) {
    formato.value = data.campeonato.formato || "PONTOS_CORRIDOS";
  }

  alternarVisibilidadeFormatos();

  const nomeTemp = document.getElementById("nomeTemporadaAtual");

  const atualTemp = document.getElementById("atualTemporada");

  const headerTemp = document.getElementById("headerTemporada");

  if (nomeTemp) nomeTemp.textContent = data.temporadaAtual;

  if (atualTemp) atualTemp.textContent = data.temporadaAtual;

  if (headerTemp) headerTemp.textContent = data.temporadaAtual;

  let totalJogos = 0;
  let realizados = 0;
  let gols = 0;

  data.campeonato.fases.forEach((fase) => {
    if (fase.tipo === "PONTOS_CORRIDOS") {
      fase.rodadas.forEach((rodada) => {
        rodada.jogos.forEach((jogo) => {
          totalJogos++;

          if (jogo.golsCasa !== null && jogo.golsFora !== null) {
            realizados++;
            gols += jogo.golsCasa + jogo.golsFora;
          }
        });
      });
    }

    if (fase.tipo === "MATA_MATA") {
      fase.etapas.forEach((etapa) => {
        etapa.jogos.forEach((jogo) => {
          if (!jogo.isBye && jogo.casa && jogo.fora) {
            totalJogos++;

            if (jogo.golsCasa !== null && jogo.golsFora !== null) {
              realizados++;
              gols += jogo.golsCasa + jogo.golsFora;
            }
          }
        });
      });
    }
  });

  const tabela = [...data.times].sort(
    (a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp,
  );

  const artilheiros = [...data.jogadores].sort((a, b) => b.gols - a.gols);

  const elTimes = document.getElementById("s-times");

  const elJogos = document.getElementById("s-jogos");

  const elReal = document.getElementById("s-real");

  const elGols = document.getElementById("s-gols");

  const elLider = document.getElementById("s-lider");

  const elArt = document.getElementById("s-artilheiro");

  if (elTimes) elTimes.textContent = data.times.length;

  if (elJogos) elJogos.textContent = totalJogos;

  if (elReal) elReal.textContent = realizados;

  if (elGols) elGols.textContent = gols;

  if (elLider) elLider.textContent = tabela[0]?.nome || "—";

  if (elArt) {
    elArt.textContent = artilheiros[0]
      ? `${artilheiros[0].nome} (${artilheiros[0].gols})`
      : "—";
  }

  const grid = document.getElementById("timesGrid");

  if (grid) {
    grid.innerHTML = tabela
      .map(
        (t, i) => `
          <div
            class="time-card"
            onclick="abrirPerfil('${t.id}')"
          >
            <div class="pos">
              ${i + 1}º
            </div>

            <div class="nome">
              ${t.nome}
            </div>

            ${
              t.cidade
                ? `<div style="font-size:13px;color:#8b949e">${t.cidade}</div>`
                : ""
            }

            <div class="pts">
              ${t.pts} pts • ${t.j} jogos
            </div>

            <div
              style="
                font-size:13px;
                color:#9ca3af;
                margin-top:4px
              "
            >
              V:${t.v}
              E:${t.e}
              D:${t.d}
            </div>

            <button
              class="del"
              style="margin-top:12px"
              onclick="
                event.stopPropagation();
                removeTeam('${t.id}')
              "
            >
              Excluir
            </button>
          </div>
        `,
      )
      .join("");
  }

  renderRodadasAba();
  renderTabelasAba();

  const jogadorTime = document.getElementById("jogadorTime");

  if (jogadorTime) {
    jogadorTime.innerHTML =
      `<option value="">-- Time --</option>` +
      data.times
        .map((t) => `<option value="${t.id}">${t.nome}</option>`)
        .join("");
  }

  const ranking = document.getElementById("rankingArtilheiros");

  if (ranking) {
    ranking.innerHTML = artilheiros
      .map((j, i) => {
        const time = data.times.find((t) => String(t.id) === String(j.timeId));

        return `
            <tr>
              <td>${i + 1}</td>
              <td>${j.nome}</td>
              <td>${time?.nome || "-"}</td>
              <td>${j.gols}</td>
              <td>
                <button
                  class="del"
                  onclick="delJogador(${j.id})"
                >
                  Excluir
                </button>
              </td>
            </tr>
          `;
      })
      .join("");
  }

  const historico = document.getElementById("listaHistorico");

  if (historico) {
    historico.innerHTML = data.historico.length
      ? data.historico
          .map(
            (h) => `
              <div class="historico-item">
                <h4 class="destaque">
                  🏆 Temporada ${h.temporada}
                </h4>

                <p>
                  Campeão:
                  ${h.campeao?.nome || "-"}
                </p>

                <p>
                  Vice:
                  ${h.vice?.nome || "-"}
                </p>

                <p>
                  Artilheiro:
                  ${
                    h.artilheiro
                      ? h.artilheiro.nome + " (" + h.artilheiro.gols + ")"
                      : "-"
                  }
                </p>

                <p>
                  Ataque:
                  ${h.melhorAtaque?.nome || "-"}
                  |
                  Defesa:
                  ${h.melhorDefesa?.nome || "-"}
                </p>

                <small>
                  ${h.dataFim || ""}
                </small>
              </div>
            `,
          )
          .join("")
      : "<p style='color:#999'>Nenhuma temporada encerrada</p>";
  }
}

function renderTabelasAba() {
  const container = document.getElementById("conteudoTabelas");

  if (!container) return;

  if (!data.campeonato.fases.length) {
    container.innerHTML = `
      <div class="card">
        <p style="color:var(--muted)">
          Nenhum campeonato iniciado.
          Vá até 'Rodadas & Chaves'
          e clique em 'Iniciar Torneio'.
        </p>
      </div>
    `;
    return;
  }

  let html = "";

  data.campeonato.fases.forEach((fase) => {
    if (fase.tipo !== "PONTOS_CORRIDOS") return;

    if (fase.grupos) {
      for (const [grupo, membros] of Object.entries(fase.grupos)) {
        const tabela = calcularTabelaClassificacao(membros, fase.rodadas);

        html += `
          <div class="card">
            <span class="fase-badge">
              ${fase.nome} — ${grupo}
            </span>

            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Pts</th>
                  <th>J</th>
                  <th>V</th>
                  <th>E</th>
                  <th>D</th>
                  <th>GP</th>
                  <th>GC</th>
                  <th>SG</th>
                </tr>
              </thead>

              <tbody>
                ${tabela
                  .map(
                    (t, i) => `
                    <tr>
                      <td>${i + 1}</td>
                      <td>${t.nome}</td>
                      <td>${t.pts}</td>
                      <td>${t.j}</td>
                      <td>${t.v}</td>
                      <td>${t.e}</td>
                      <td>${t.d}</td>
                      <td>${t.gp}</td>
                      <td>${t.gc}</td>
                      <td>${t.sg}</td>
                    </tr>
                  `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }

      return;
    }

    const tabela = [...data.times].sort(
      (a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp,
    );

    const concluida =
      fase.rodadas.length > 0 &&
      fase.rodadas.every((rodada) =>
        rodada.jogos.every(
          (jogo) => jogo.golsCasa !== null && jogo.golsFora !== null,
        ),
      );

    html += `
      <div class="card">
        <span class="fase-badge">
          ${fase.nome}
        </span>

        ${
          concluida && tabela[0]
            ? `
              <div class="chave-campeao">
                🏆 CAMPEÃO:
                ${tabela[0].nome}
              </div>
            `
            : ""
        }

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Pts</th>
              <th>J</th>
              <th>V</th>
              <th>E</th>
              <th>D</th>
              <th>GP</th>
              <th>GC</th>
              <th>SG</th>
              <th>Forma</th>
            </tr>
          </thead>

          <tbody>
            ${tabela
              .map((t, i) => {
                const forma = obterForma(t.id)
                  .map((r) => `<span class="bol ${r}">${r}</span>`)
                  .join("");

                const pos =
                  i === 0
                    ? "pos-1"
                    : i === 1
                      ? "pos-2"
                      : i === 2
                        ? "pos-3"
                        : "";

                return `
                  <tr class="${pos}">
                    <td>${i + 1}</td>
                    <td>${t.nome}</td>
                    <td>${t.pts}</td>
                    <td>${t.j}</td>
                    <td>${t.v}</td>
                    <td>${t.e}</td>
                    <td>${t.d}</td>
                    <td>${t.gp}</td>
                    <td>${t.gc}</td>
                    <td>${t.sg}</td>
                    <td>
                      <div class="forma">
                        ${forma}
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  });

  data.campeonato.fases.forEach((fase) => {
    if (fase.tipo !== "MATA_MATA") return;

    const final = fase.etapas[fase.etapas.length - 1];

    if (final && final.jogos[0] && final.jogos[0].vencedor) {
      const campeao = data.times.find(
        (t) => String(t.id) === String(final.jogos[0].vencedor),
      );

      if (campeao) {
        html += `
          <div class="card">
            <div class="chave-campeao">
              🏆 CAMPEÃO:
              ${campeao.nome}
            </div>
          </div>
        `;
      }
    }
  });

  container.innerHTML = html;
}

function renderRodadasAba() {
  const container = document.getElementById("listaRodadas");

  if (!container) return;

  if (!data.campeonato.fases.length) {
    container.innerHTML = `
      <p style="color:var(--muted)">
        Clique acima em "Iniciar Torneio"
        para gerar as partidas.
      </p>
    `;
    return;
  }

  let html = "";

  data.campeonato.fases.forEach((fase, fIdx) => {
    html += `
        <div style="margin-bottom:24px">
          <span class="fase-badge">
            ${fase.nome}
          </span>
      `;

    if (fase.tipo === "PONTOS_CORRIDOS") {
      fase.rodadas.forEach((rodada, rIdx) => {
        html += `
              <div class="rodada">
                <h3>
                  ${rodada.grupo ? rodada.grupo + " - " : ""}
                  Rodada ${rodada.numero}
                </h3>
            `;

        rodada.jogos.forEach((jogo, jIdx) => {
          const casa = data.times.find(
            (t) => String(t.id) === String(jogo.casa),
          );

          const fora = data.times.find(
            (t) => String(t.id) === String(jogo.fora),
          );

          if (!casa || !fora) return;

          html += `
                  <div class="jogo-info">
                    <span>
                      ${casa.nome}
                    </span>

                    <span class="placar">
                      ${
                        jogo.golsCasa === null
                          ? "— x —"
                          : jogo.golsCasa + " x " + jogo.golsFora
                      }
                    </span>

                    <span>
                      ${fora.nome}
                    </span>

                    <button
                      onclick="
                        definirJogoPontosCorridos(
                          ${fIdx},
                          ${rIdx},
                          ${jIdx}
                        )
                      "
                    >
                      Editar
                    </button>
                  </div>
                `;
        });

        html += `</div>`;
      });

      if (fase.grupos && !fase.concluida) {
        html += `
            <button
              class="gold"
              style="
                width:100%;
                padding:14px;
                margin-top:10px
              "
              onclick="promoverGruposParaMataMata()"
            >
              🚀 Promover Classificados
              dos Grupos para o Mata-Mata
            </button>
          `;
      }
    }

    if (fase.tipo === "MATA_MATA") {
      recalcularMataMata(fase);

      fase.etapas.forEach((etapa, eIdx) => {
        const jogos = etapa.jogos.filter((jogo) => !jogo.isBye);

        if (!jogos.length) return;

        html += `
              <div
                class="rodada"
                style="
                  border-left:
                    4px solid
                    var(--primary)
                "
              >
                <h3
                  style="
                    color:var(--primary)
                  "
                >
                  🔥 ${etapa.nome}
                </h3>
            `;

        jogos.forEach((jogo) => {
          const indice = etapa.jogos.findIndex((x) => x.id === jogo.id);

          const casa = data.times.find(
            (t) => String(t.id) === String(jogo.casa),
          );

          const fora = data.times.find(
            (t) => String(t.id) === String(jogo.fora),
          );

          const nomeCasa = casa?.nome || jogo.casaPlaceholder || "A definir";

          const nomeFora = fora?.nome || jogo.foraPlaceholder || "A definir";

          const pronto = jogo.casa !== null && jogo.fora !== null;

          html += `
                <div class="jogo-info">
                  <span>
                    ${nomeCasa}
                  </span>

                  <span class="placar">
                    ${
                      jogo.golsCasa === null
                        ? "— x —"
                        : jogo.golsCasa + " x " + jogo.golsFora
                    }
                  </span>

                  <span>
                    ${nomeFora}
                  </span>

                  ${
                    pronto
                      ? `
                        <button
                          onclick="
                            definirJogoMataMata(
                              ${fIdx},
                              ${eIdx},
                              ${indice}
                            )
                          "
                        >
                          ${jogo.golsCasa === null ? "Definir" : "Editar"}
                        </button>
                      `
                      : `
                        <button
                          style="
                            opacity:.4;
                            cursor:not-allowed
                          "
                          disabled
                        >
                          Aguardando
                        </button>
                      `
                  }
                </div>
              `;
        });

        html += `</div>`;

        if (etapa.nome === "Grande Final") {
          const final = etapa.jogos[0];

          if (final && final.vencedor) {
            const campeao = data.times.find(
              (t) => String(t.id) === String(final.vencedor),
            );

            if (campeao) {
              html += `
                    <div
                      style="
                        text-align:center;
                        margin-top:20px;
                        padding:24px;
                        background:
                          linear-gradient(
                            135deg,
                            #facc15,
                            #f59e0b
                          );
                        border-radius:12px
                      "
                    >
                      <div style="font-size:48px">
                        🏆
                      </div>

                      <div
                        style="
                          font-size:14px;
                          color:#78350f;
                          font-weight:bold;
                          letter-spacing:1px
                        "
                      >
                        CAMPEÃO
                      </div>

                      <div
                        style="
                          font-size:28px;
                          color:#1a1a1a;
                          font-weight:900
                        "
                      >
                        ${campeao.nome}
                      </div>
                    </div>
                  `;
            }
          }
        }
      });
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

/* =====================================================
   SUPABASE: banco de dados online + login do administrador
   ===================================================== */

function carregarBibliotecaSupabase() {
  return new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) {
      resolve();
      return;
    }

    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Falha ao carregar o Supabase"));
    document.head.appendChild(s);
  });
}

function criarBarraNuvem() {
  if (document.getElementById("barraNuvem")) return;

  const estilo = document.createElement("style");

  estilo.textContent = `
    #barraNuvem {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #161b22;
      color: #e6edf3;
      border: 1px solid #30363d;
      border-radius: 999px;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    #barraNuvem button {
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 600;
      border: 0;
      border-radius: 999px;
      background: #22c55e;
      color: #04120a;
      cursor: pointer;
    }

    #modalLogin {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 10000;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
    }

    #modalLogin .nuvem-caixa {
      width: min(90vw, 340px);
      padding: 20px;
      background: #161b22;
      color: #e6edf3;
      border: 1px solid #30363d;
      border-radius: 12px;
    }

    #modalLogin h3 {
      margin: 0 0 12px;
      font-size: 16px;
    }

    #modalLogin input {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 10px;
      padding: 10px;
      font-size: 15px;
      background: #0d1117;
      color: #e6edf3;
      border: 1px solid #30363d;
      border-radius: 8px;
    }

    #modalLogin .nuvem-acoes {
      display: flex;
      gap: 8px;
    }

    #modalLogin button {
      flex: 1;
      padding: 10px;
      font-size: 14px;
      font-weight: 600;
      border: 0;
      border-radius: 8px;
      background: #22c55e;
      color: #04120a;
      cursor: pointer;
    }

    #modalLogin button.nuvem-cancelar {
      background: #30363d;
      color: #e6edf3;
    }

    #loginErro {
      min-height: 18px;
      margin: 0 0 8px;
      font-size: 13px;
      color: #f87171;
    }

    /* Modo leitura: esconde os botões que alteram dados (visitantes) */
    body.modo-leitura button.del,
    body.modo-leitura [onclick*="addTeam("],
    body.modo-leitura [onclick*="removeTeam("],
    body.modo-leitura [onclick*="gerarCampeonatoCompleto("],
    body.modo-leitura [onclick*="definirJogoPontosCorridos("],
    body.modo-leitura [onclick*="definirJogoMataMata("],
    body.modo-leitura [onclick*="promoverGruposParaMataMata("],
    body.modo-leitura [onclick*="addJogador("],
    body.modo-leitura [onclick*="delJogador("],
    body.modo-leitura [onclick*="encerrarTemporada("],
    body.modo-leitura [onclick*="importarDados("],
    body.modo-leitura [onclick*="comecarNovo("] {
      display: none !important;
    }
  `;

  document.head.appendChild(estilo);

  const barra = document.createElement("div");
  barra.id = "barraNuvem";
  barra.innerHTML = `
    <span id="nuvemStatus"></span>
    <button id="nuvemBtn" type="button">Entrar</button>
  `;
  document.body.appendChild(barra);

  const modal = document.createElement("div");
  modal.id = "modalLogin";
  modal.innerHTML = `
    <div class="nuvem-caixa">
      <h3>Entrar como administrador</h3>

      <input
        id="loginEmail"
        type="email"
        placeholder="E-mail"
        autocomplete="username"
      >

      <input
        id="loginSenha"
        type="password"
        placeholder="Senha"
        autocomplete="current-password"
      >

      <p id="loginErro"></p>

      <div class="nuvem-acoes">
        <button id="loginEntrar" type="button">Entrar</button>
        <button
          id="loginCancelar"
          class="nuvem-cancelar"
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("nuvemBtn").addEventListener("click", () => {
    if (ehAdmin) {
      fazerLogout();
    } else {
      abrirLogin();
    }
  });

  document.getElementById("loginEntrar").addEventListener("click", fazerLogin);

  document
    .getElementById("loginCancelar")
    .addEventListener("click", fecharLogin);

  document.getElementById("loginSenha").addEventListener("keydown", (e) => {
    if (e.key === "Enter") fazerLogin();
  });
}

function atualizarBarra(mensagem) {
  const status = document.getElementById("nuvemStatus");
  const botao = document.getElementById("nuvemBtn");

  if (!status || !botao) return;

  if (!nuvemAtiva) {
    status.textContent = mensagem || "💾 Modo local";
    botao.style.display = "none";
    return;
  }

  status.textContent =
    mensagem || (ehAdmin ? "✏️ Admin" : "👁 Somente leitura");
  botao.style.display = "inline-block";
  botao.textContent = ehAdmin ? "Sair" : "Entrar";
}

function aplicarModo() {
  document.body.classList.toggle("modo-leitura", nuvemAtiva && !ehAdmin);
  atualizarBarra();
}

function abrirLogin() {
  const modal = document.getElementById("modalLogin");

  if (!modal) return;

  document.getElementById("loginErro").textContent = "";
  modal.style.display = "flex";
  document.getElementById("loginEmail").focus();
}

function fecharLogin() {
  const modal = document.getElementById("modalLogin");

  if (modal) modal.style.display = "none";

  const senha = document.getElementById("loginSenha");

  if (senha) senha.value = "";
}

async function fazerLogin() {
  if (!supa) return;

  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  const erro = document.getElementById("loginErro");

  erro.textContent = "";

  if (!email || !senha) {
    erro.textContent = "Preencha e-mail e senha.";
    return;
  }

  try {
    const resp = await supa.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (resp.error) {
      console.error(resp.error);
      erro.textContent = "Não foi possível entrar. Confira e-mail e senha.";
      return;
    }

    ehAdmin = true;
    fecharLogin();
    aplicarModo();

    await carregarDoServidor(true);
  } catch (err) {
    console.error(err);
    erro.textContent = "Erro de conexão. Tente de novo.";
  }
}

async function fazerLogout() {
  if (!supa) return;

  try {
    await supa.auth.signOut();
  } catch (err) {
    console.error(err);
  }

  ehAdmin = false;
  aplicarModo();

  await carregarDoServidor(true);
}

async function carregarDoServidor(forcar = false) {
  if (!supa) return;

  try {
    const resp = await supa
      .from(TABELA)
      .select("dados, updated_at")
      .eq("id", LINHA_ID)
      .maybeSingle();

    if (resp.error) {
      console.error(resp.error);
      atualizarBarra("⚠️ Erro ao ler do servidor");
      return;
    }

    const linha = resp.data;

    if (!linha) {
      atualizarBarra("⚠️ Tabela vazia: rode o SQL de criação");
      return;
    }

    // Visitante: se nada mudou desde a última leitura, não faz nada
    if (!forcar && linha.updated_at === ultimaAtualizacaoServidor) {
      return;
    }

    ultimaAtualizacaoServidor = linha.updated_at;

    const dadosServidor = linha.dados || {};
    const servidorVazio = Object.keys(dadosServidor).length === 0;

    if (servidorVazio) {
      if (ehAdmin) {
        // Primeira vez: oferece enviar os dados guardados neste navegador
        let localSalvo = {};

        try {
          localSalvo = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        } catch {
          localSalvo = {};
        }

        const localTemDados =
          (Array.isArray(localSalvo.times) && localSalvo.times.length > 0) ||
          (Array.isArray(localSalvo.historico) &&
            localSalvo.historico.length > 0);

        if (
          localTemDados &&
          confirm(
            "O servidor ainda está vazio. Enviar para ele os dados salvos neste navegador?",
          )
        ) {
          data = localSalvo;
          validarEstrutura();
          servidorCarregado = true;
          render();
          await enviarParaServidor();
          return;
        }
      } else {
        // Visitante vê o campeonato vazio
        data = {};
        validarEstrutura();
        render();
      }

      servidorCarregado = true;
      atualizarBarra();
      return;
    }

    data = dadosServidor;
    validarEstrutura();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    servidorCarregado = true;
    render();
    atualizarBarra();
  } catch (err) {
    console.error(err);
    atualizarBarra("⚠️ Sem conexão com o servidor");
  }
}

async function enviarParaServidor() {
  if (!supa || !ehAdmin || !servidorCarregado) return;

  // Se já tem um envio em andamento, marca para reenviar o estado mais novo
  if (enviando) {
    reenviar = true;
    return;
  }

  enviando = true;

  try {
    atualizarBarra("⏳ Salvando...");

    const resp = await supa
      .from(TABELA)
      .update({
        dados: data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", LINHA_ID)
      .select("id");

    if (resp.error) {
      console.error(resp.error);
      atualizarBarra("⚠️ Erro ao salvar no servidor");
    } else if (!resp.data || resp.data.length === 0) {
      // O banco recusou a gravação em silêncio (regra de acesso)
      atualizarBarra("⚠️ Sem permissão para salvar");
    } else {
      atualizarBarra("✅ Salvo no servidor");
      setTimeout(() => atualizarBarra(), 2500);
    }
  } catch (err) {
    console.error(err);
    atualizarBarra("⚠️ Sem conexão. Alteração só neste aparelho");
  } finally {
    enviando = false;

    if (reenviar) {
      reenviar = false;
      enviarParaServidor();
    }
  }
}

async function iniciarNuvem() {
  criarBarraNuvem();

  if (!nuvemAtiva) {
    atualizarBarra("💾 Modo local (Supabase não configurado)");
    return;
  }

  try {
    await carregarBibliotecaSupabase();
  } catch (err) {
    console.error(err);
    nuvemAtiva = false;
    atualizarBarra("⚠️ Sem conexão com o servidor: modo local");
    return;
  }

  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const sessao = await supa.auth.getSession();

  ehAdmin = !!(sessao.data && sessao.data.session);

  supa.auth.onAuthStateChange((evento, novaSessao) => {
    ehAdmin = !!novaSessao;
    aplicarModo();
  });

  aplicarModo();

  await carregarDoServidor(true);

  // Visitantes recebem as atualizações automaticamente a cada 30 segundos
  setInterval(() => {
    if (supa && !ehAdmin && !document.hidden) {
      carregarDoServidor();
    }
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && supa && !ehAdmin) {
      carregarDoServidor();
    }
  });
}

render();
iniciarNuvem();
