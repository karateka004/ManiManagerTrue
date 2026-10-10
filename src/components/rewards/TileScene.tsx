import { useId, type CSSProperties } from 'react'

export type Scene = 'coins' | 'podium' | 'flame' | 'crown'

/**
 * Обложка плитки хаба «Прогресс»: небольшая живая векторная сцена.
 *
 * Все сцены нарисованы в общей системе координат 120×88 и «стоят на земле» y=84 —
 * так они одинаково садятся на нижний край цветного поля и одинаково им обрезаются.
 * Верх правой части оставлен пустым: там висит бейдж с данными.
 *
 * Цвет берётся из `--tile-a`, которую задаёт плитка, поэтому обложка следует за
 * темой и за акцентом. Движение — CSS (`.ts-*` в styles/motion.css): при
 * появлении монеты падают стопкой, пьедестал вырастает, корона опускается; дальше
 * тихо живут блёстки, верхняя монета, пламя и сияние. Анимации висят только на
 * обёртках `<g>`: CSS-transform заменил бы собственный transform фигуры.
 */
export function TileScene({ scene }: { scene: Scene }) {
  const id = useId()
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 88"
      fill="none"
      className="pointer-events-none absolute bottom-0 right-1 h-[85px] w-[116px] overflow-visible"
    >
      {scene === 'coins' && <Coins />}
      {scene === 'podium' && <Podium />}
      {scene === 'flame' && <Flame />}
      {scene === 'crown' && <Crown id={id} />}
    </svg>
  )
}

/** Задержка анимации для обёртки. */
const d = (ms: number): CSSProperties => ({ '--d': `${ms}ms` }) as CSSProperties

/** Звёздочка-блёстка. */
const SPARK = 'l3 7.5 7.5 3 -7.5 3 -3 7.5 -3 -7.5 -7.5 -3 7.5 -3z'
const SPARK_SMALL = 'l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z'

/** Монета-цилиндр: нижний эллипс, боковина, верхняя грань со светлой серединой. */
function Coin({ cx, cy, rx = 27, ry = 8.5, h = 11 }: { cx: number; cy: number; rx?: number; ry?: number; h?: number }) {
  return (
    <>
      <ellipse cx={cx} cy={cy + h} rx={rx} ry={ry} fill="rgb(var(--tile-a) / 0.42)" />
      <rect x={cx - rx} y={cy} width={rx * 2} height={h} fill="rgb(var(--tile-a) / 0.42)" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgb(var(--tile-a) / 0.92)" />
      <ellipse cx={cx} cy={cy} rx={rx * 0.5} ry={ry * 0.5} fill="rgb(var(--tile-a) / 0.5)" />
    </>
  )
}

function Coins() {
  return (
    <>
      <g className="ts-drop" style={d(0)}>
        <Coin cx={62} cy={65} />
      </g>
      <g className="ts-drop" style={d(110)}>
        <Coin cx={53} cy={48} />
      </g>
      <g className="ts-drop" style={d(220)}>
        <g className="ts-bob" style={d(900)}>
          <Coin cx={64} cy={31} />
        </g>
      </g>
      <g className="ts-twinkle" style={d(300)}>
        <path d={'M20 14 ' + SPARK} fill="rgb(var(--tile-a) / 0.75)" />
      </g>
      <g className="ts-twinkle" style={d(1500)}>
        <path d={'M104 44 ' + SPARK_SMALL} fill="rgb(var(--tile-a) / 0.6)" />
      </g>
    </>
  )
}

function Podium() {
  return (
    <>
      <g className="ts-rise" style={d(90)}>
        <rect x="8" y="52" width="28" height="32" rx="5" fill="rgb(var(--tile-a) / 0.4)" />
      </g>
      <g className="ts-rise" style={d(0)}>
        <rect x="44" y="38" width="30" height="46" rx="5" fill="rgb(var(--tile-a) / 0.92)" />
      </g>
      <g className="ts-rise" style={d(180)}>
        <rect x="82" y="60" width="28" height="24" rx="5" fill="rgb(var(--tile-a) / 0.4)" />
      </g>
      {/* Звезда золотая при любом акценте — иначе награда теряет смысл */}
      <g className="ts-drop" style={d(320)}>
        <g className="ts-twinkle" style={d(1100)}>
          <path
            d="M59 5 L62.7 14.9 L73.27 15.36 L64.99 21.95 L67.82 32.14 L59 26.3 L50.18 32.14 L53.01 21.95 L44.73 15.36 L55.3 14.9 Z"
            fill="rgb(250 204 21 / 0.95)"
          />
        </g>
      </g>
    </>
  )
}

/** Тот же контур пламени, что у иконки в приложении, но залитый и в два слоя. */
const FLAME_PATH =
  'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'

function Flame() {
  return (
    <>
      {/* Искры поднимаются от пламени и гаснут */}
      <g className="ts-ember" style={d(0)}>
        <circle cx="34" cy="40" r="3" fill="rgb(var(--tile-a) / 0.6)" />
      </g>
      <g className="ts-ember" style={d(900)}>
        <circle cx="92" cy="46" r="2.5" fill="rgb(var(--tile-a) / 0.5)" />
      </g>
      <g className="ts-ember" style={d(1700)}>
        <circle cx="70" cy="30" r="2" fill="rgb(var(--tile-a) / 0.45)" />
      </g>
      <g className="ts-flicker">
        <path transform="translate(22.4,14.7) scale(3.3)" d={FLAME_PATH} fill="rgb(var(--tile-a) / 0.38)" />
      </g>
      <g className="ts-flicker" style={d(-700)}>
        <path transform="translate(37.4,40.95) scale(2.05)" d={FLAME_PATH} fill="rgb(var(--tile-a) / 0.92)" />
      </g>
    </>
  )
}

function Crown({ id }: { id: string }) {
  // useId отдаёт «:r0:» — двоеточия ломают ссылку url(#…), чистим до буквенно-цифрового
  const halo = `crown-halo-${id.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <>
      <defs>
        <radialGradient id={halo}>
          <stop offset="0" stopColor="rgb(var(--tile-a) / 0.36)" />
          <stop offset="1" stopColor="rgb(var(--tile-a) / 0)" />
        </radialGradient>
      </defs>
      <g className="ts-halo">
        <circle cx="60" cy="46" r="46" fill={`url(#${halo})`} />
      </g>
      <g className="ts-drop" style={d(60)}>
        <path d="M16 74 L24 32 L42 52 L60 20 L78 52 L96 32 L104 74 Z" fill="rgb(var(--tile-a) / 0.92)" />
        <rect x="16" y="72" width="88" height="12" rx="5" fill="rgb(var(--tile-a) / 0.5)" />
        <g className="ts-twinkle" style={d(700)}>
          <circle cx="60" cy="62" r="6" fill="rgb(255 255 255 / 0.55)" />
        </g>
        <g className="ts-twinkle" style={d(1300)}>
          <circle cx="38" cy="66" r="4.5" fill="rgb(255 255 255 / 0.45)" />
        </g>
        <g className="ts-twinkle" style={d(1900)}>
          <circle cx="82" cy="66" r="4.5" fill="rgb(255 255 255 / 0.45)" />
        </g>
      </g>
    </>
  )
}
