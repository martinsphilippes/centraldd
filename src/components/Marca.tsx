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

/** Só o símbolo (C→DD), com o halo laranja que o separa do fundo escuro. */
export function SimboloMarca({ className = '' }: { className?: string }) {
  return (
    <img
      // simbolo-v3 é o recorte JUSTO (2,2:1). A versão quadrada (marca-v3)
      // sobra espaço vazio em cima e embaixo e abre um buraco antes do
      // letreiro — ela serve só para os ícones, que precisam ser quadrados.
      src="/icons/simbolo-v3.png"
      alt=""
      className={`object-contain ${className}`}
      // O halo não é enfeite: o "DD" é azul-noite e, sem ele, encosta no fundo
      // do menu e some. É o mesmo brilho que a arte original tem por baixo.
      style={{ filter: 'drop-shadow(0 0 18px rgba(238,118,35,0.45))' }}
    />
  )
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
