// Motor de roteirização da rota do motorista.
//
// Trabalha com as coordenadas de telhado que a página do Meli traz por pacote:
// agrupa pacotes do mesmo endereço numa parada, ordena as paradas partindo da
// base (vizinho mais próximo) e refina com 2-opt — para 60-80 paradas isso
// roda em milissegundos e chega muito perto do ótimo.
//
// A distância é em LINHA RETA (haversine): boa aproximação na região, mas não
// enxerga rio nem rodovia. Por isso o app sempre mostra a comparação com a
// ordem do Meli e deixa o motorista escolher a próxima parada — a escolha
// humana manda, e o resto da rota é recalculado a partir dela.

export interface Ponto {
  lat: number
  lng: number
}

export interface PacoteParada {
  numeracao: string
  etiqueta: string
}

export interface Parada extends Ponto {
  /** Chave estável da parada (coordenada arredondada). */
  id: string
  cidade: string
  endereco: string
  destinatario: string
  pacotes: PacoteParada[]
  /** Menor ordem do Meli entre os pacotes da parada. */
  ordemMeli: number | null
}

/** Distância em km entre dois pontos (haversine). */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const R = 6371
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

interface PacoteComDados {
  numeracao: string
  etiqueta?: string
  cidade?: string
  endereco?: string
  destinatario?: string
  lat?: number | null
  lng?: number | null
  ordemMeli?: number | null
}

/** Agrupa os pacotes com coordenada em paradas (mesmo endereço = uma parada). */
export function montarParadas(pacotes: PacoteComDados[]): Parada[] {
  const mapa = new Map<string, Parada>()
  for (const p of pacotes) {
    if (p.lat == null || p.lng == null) continue
    const id = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
    const parada = mapa.get(id) ?? {
      id,
      lat: p.lat,
      lng: p.lng,
      cidade: p.cidade ?? '',
      endereco: p.endereco ?? '',
      destinatario: p.destinatario ?? '',
      pacotes: [],
      ordemMeli: null,
    }
    parada.pacotes.push({ numeracao: p.numeracao, etiqueta: p.etiqueta ?? '' })
    if (p.ordemMeli != null)
      parada.ordemMeli = parada.ordemMeli === null ? p.ordemMeli : Math.min(parada.ordemMeli, p.ordemMeli)
    mapa.set(id, parada)
  }
  return [...mapa.values()]
}

/** Soma dos trechos: partida → 1ª parada → … → última. */
export function kmDaOrdem(partida: Ponto, ordem: Parada[]): number {
  let km = 0
  let atual: Ponto = partida
  for (const p of ordem) {
    km += distanciaKm(atual, p)
    atual = p
  }
  return km
}

/** Vizinho mais próximo a partir de um ponto. */
function vizinhoMaisProximo(partida: Ponto, paradas: Parada[]): Parada[] {
  const restantes = [...paradas]
  const ordem: Parada[] = []
  let atual: Ponto = partida
  while (restantes.length > 0) {
    let melhor = 0
    let melhorD = Infinity
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(atual, restantes[i])
      if (d < melhorD) {
        melhorD = d
        melhor = i
      }
    }
    const [p] = restantes.splice(melhor, 1)
    ordem.push(p)
    atual = p
  }
  return ordem
}

/** Refinamento 2-opt: desfaz cruzamentos da rota até não melhorar mais. */
function doisOpt(partida: Ponto, ordem: Parada[]): Parada[] {
  const rota = [...ordem]
  const ponto = (i: number): Ponto => (i < 0 ? partida : rota[i])
  let melhorou = true
  let voltas = 0
  while (melhorou && voltas < 30) {
    melhorou = false
    voltas++
    for (let i = -1; i < rota.length - 2; i++) {
      for (let j = i + 2; j < rota.length - 1; j++) {
        const antes =
          distanciaKm(ponto(i), rota[i + 1]) + distanciaKm(rota[j], rota[j + 1])
        const depois =
          distanciaKm(ponto(i), rota[j]) + distanciaKm(rota[i + 1], rota[j + 1])
        if (depois < antes - 1e-9) {
          // inverte o trecho i+1..j
          let a = i + 1
          let b = j
          while (a < b) {
            const t = rota[a]
            rota[a] = rota[b]
            rota[b] = t
            a++
            b--
          }
          melhorou = true
        }
      }
    }
  }
  return rota
}

/**
 * Roteiro otimizado. `primeiraId` é a escolha do motorista: aquela parada vira
 * a primeira custe o que custar, e o RESTO é recalculado a partir dela — a
 * mesma função serve para o começo do dia e para trocar no meio do percurso
 * (aí `partida` é a posição atual, não a base).
 */
export function otimizarRoteiro(partida: Ponto, paradas: Parada[], primeiraId?: string | null): Parada[] {
  if (paradas.length === 0) return []
  const escolhida = primeiraId ? paradas.find((p) => p.id === primeiraId) : undefined
  if (escolhida) {
    const demais = paradas.filter((p) => p.id !== escolhida.id)
    return [escolhida, ...doisOpt(escolhida, vizinhoMaisProximo(escolhida, demais))]
  }
  return doisOpt(partida, vizinhoMaisProximo(partida, paradas))
}

/** Ordem planejada pelo Meli (pela sequência das paradas no documento). */
export function ordemMeli(paradas: Parada[]): Parada[] {
  return [...paradas].sort((a, b) => (a.ordemMeli ?? 9999) - (b.ordemMeli ?? 9999))
}

/** Links de navegação para a parada — abre o app que o motorista preferir. */
export function linksNavegacao(p: Ponto): { googleMaps: string; waze: string } {
  return {
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
    waze: `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`,
  }
}
