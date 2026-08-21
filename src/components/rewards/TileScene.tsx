import { useId } from 'react'

export type Scene = 'coins' | 'podium' | 'flame' | 'crown'

/**
 * Обложка плитки хаба «Прогресс»: небольшая векторная сцена вместо чип-иконки.
 *
 * Все сцены нарисованы в общей системе координат 120×88 и «стоят на земле» y=84 —
 * так они одинаково садятся на нижний край цветного поля и одинаково им обрезаются.
 * Верх правой части оставлен пустым: там висит бейдж-счётчик.
 *
 * Цвет берётся из `--tile-a`, которую задаёт Tile по акценту (см. ACCENT_RGB),
 * поэтому обложка следует за темой и за акцентом, выбранным в наградах.
 * Растр не используем: вектор ничего не весит и не мылится на любом экране.
 */
export function TileScene({ scene }: { scene: Scene }) {
  const id = useId()
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 88"
      fill="none"
      className="pointer-events-none absolute bottom-0 right-1 h-[85px] w-[116px]"
    >
      {scene === 'coins' && <Coins />}
      {scene === 'podium' && <Podium />}
      {scene === 'flame' && <Flame />}
      {scene === 'crown' && <Crown id={id} />}
    </svg>
  )
}

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
      <Coin cx={62} cy={65} />
      <Coin cx={53} cy={48} />
      <Coin cx={64} cy={31} />
      <path d="M20 14 l3 7.5 7.5 3 -7.5 3 -3 7.5 -3 -7.5 -7.5 -3 7.5 -3z" fill="rgb(var(--tile-a) / 0.7)" />
    </>
  )
}

function Podium() {
  return (
    <>
      <rect x="8" y="52" width="28" height="32" rx="5" fill="rgb(var(--tile-a) / 0.4)" />
      <rect x="44" y="38" width="30" height="46" rx="5" fill="rgb(var(--tile-a) / 0.92)" />
      <rect x="82" y="60" width="28" height="24" rx="5" fill="rgb(var(--tile-a) / 0.4)" />
      {/* Звезда золотая при любом акценте — иначе награда теряет смысл */}
      <path
        d="M59 5 L62.7 14.9 L73.27 15.36 L64.99 21.95 L67.82 32.14 L59 26.3 L50.18 32.14 L53.01 21.95 L44.73 15.36 L55.3 14.9 Z"
        fill="rgb(250 204 21 / 0.95)"
      />
    </>
  )
}

/** Тот же контур пламени, что у иконки в приложении, но залитый и в два слоя. */
const FLAME_PATH =
  'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'

function Flame() {
  return (
    <>
      <circle cx="18" cy="34" r="4" fill="rgb(var(--tile-a) / 0.5)" />
      <circle cx="105" cy="44" r="3.5" fill="rgb(var(--tile-a) / 0.4)" />
      <circle cx="27" cy="15" r="2.5" fill="rgb(var(--tile-a) / 0.3)" />
      <path transform="translate(22.4,14.7) scale(3.3)" d={FLAME_PATH} fill="rgb(var(--tile-a) / 0.38)" />
      <path transform="translate(37.4,40.95) scale(2.05)" d={FLAME_PATH} fill="rgb(var(--tile-a) / 0.92)" />
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
          <stop offset="0" stopColor="rgb(var(--tile-a) / 0.3)" />
          <stop offset="1" stopColor="rgb(var(--tile-a) / 0)" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="46" r="46" fill={`url(#${halo})`} />
      <path d="M16 74 L24 32 L42 52 L60 20 L78 52 L96 32 L104 74 Z" fill="rgb(var(--tile-a) / 0.92)" />
      <rect x="16" y="72" width="88" height="12" rx="5" fill="rgb(var(--tile-a) / 0.5)" />
      <circle cx="60" cy="62" r="6" fill="rgb(var(--tile-a) / 0.35)" />
      <circle cx="38" cy="66" r="4.5" fill="rgb(var(--tile-a) / 0.35)" />
      <circle cx="82" cy="66" r="4.5" fill="rgb(var(--tile-a) / 0.35)" />
    </>
  )
}
