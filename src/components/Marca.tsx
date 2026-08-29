// A marca da Central DD, em um lugar só.
//
// O letreiro é TEXTO, não imagem. A arte que o dono aprovou (a versão
// empilhada, sobre fundo escuro) foi remontada aqui em HTML por dois motivos
// práticos: fica nítida em qualquer tela — de 320px a um monitor grande — e
// pesa alguns bytes, contra ~1 MB da imagem. O símbolo continua sendo o PNG
// recortado da arte original.
//
// Sobre fundo escuro as letras precisam ser CLARAS. O PNG do letreiro tem as
// letras em azul-noite, feitas para fundo branco; usá-lo aqui sumiria com
// metade do nome.

/**
 * Só o símbolo (C→DD), na versão de FUNDO ESCURO.
 *
 * Recortado da arte escura, não do PNG transparente: naquele, a seta e a
 * estrada brancas foram vazadas junto com o fundo branco (o pixel do meio da
 * seta tem alfa 0). Sobre fundo claro isso não aparecia — o branco da página
 * preenchia o buraco. Sobre o azul-noite, a seta ficava marrom.
 *
 * O halo laranja já vem na imagem, e as bordas do recorte foram esmaecidas
 * para o retângulo do fundo não marcar por cima do azul-noite do app.
 */
export function SimboloMarca({ className = '' }: { className?: string }) {
  return <img src="/icons/simbolo-escuro-v4.png" alt="" className={`object-contain ${className}`} />
}

/** O letreiro: Central DD / Dispatcher & Driver / a serviço da Rodacoop. */
export function LetreiroMarca({ tamanho = 'grande' }: { tamanho?: 'grande' | 'medio' }) {
  const grande = tamanho === 'grande'
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2.5">
        <span aria-hidden className="h-px w-6 bg-marca sm:w-8" />
        <p
          className={`font-extrabold leading-none tracking-tight text-white ${
            grande ? 'text-3xl' : 'text-xl'
          }`}
        >
          Central <span className="text-marca">DD</span>
        </p>
        <span aria-hidden className="h-px w-6 bg-marca sm:w-8" />
      </div>
      <p
        className={`mt-1.5 font-medium uppercase text-slate-300 ${
          grande ? 'text-[11px] tracking-[0.3em]' : 'text-[9px] tracking-[0.25em]'
        }`}
      >
        Dispatcher &amp; Driver
      </p>
      <p
        className={`mt-2 uppercase text-slate-400 ${
          grande ? 'text-[10px] tracking-[0.2em]' : 'text-[9px] tracking-[0.15em]'
        }`}
      >
        a serviço da <span className="font-bold text-marca">Rodacoop</span> 📦
      </p>
    </div>
  )
}

/** Marca inteira, empilhada — tela de entrada e tela de carregamento. */
export function MarcaEmpilhada({
  tamanho = 'grande',
  pulsando = false,
}: {
  tamanho?: 'grande' | 'medio'
  pulsando?: boolean
}) {
  return (
    <div className={pulsando ? 'animate-pulse' : undefined}>
      <SimboloMarca
        className={`mx-auto ${tamanho === 'grande' ? 'h-auto w-64' : 'h-auto w-48'}`}
      />
      <div className="mt-3">
        <LetreiroMarca tamanho={tamanho} />
      </div>
    </div>
  )
}
