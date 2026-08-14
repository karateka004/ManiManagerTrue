import { useEffect, useRef, useState } from 'react'
import { getUnlock } from '../../lib/garden'

/**
 * Сцена сада: небо → облака → дальний лес → ближний лес → остров → декор → дерево.
 *
 * Рисуется в фиксированной ЛОГИЧЕСКОЙ системе координат (см. SCENE_W/H) и
 * масштабируется через `transform: scale` под ширину контейнера. Так координаты
 * слоёв не зависят от экрана, а `image-rendering: pixelated` держит пиксель чётким.
 */

const SPRITES = import.meta.glob('../../assets/game/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>

/** 'tree-3' → URL спрайта (бросает при опечатке — ловим на сборке). */
export function sprite(name: string): string {
  const hit = Object.entries(SPRITES).find(([path]) => path.endsWith(`/${name}.png`))
  if (!hit) throw new Error(`нет спрайта ${name}.png`)
  return hit[1]
}

/**
 * Размер кадра по стадиям — это «камера»: у ростка она близко, у взрослого
 * дерева отъезжает. Так масштабируется ВСЯ сцена целиком, и пиксель у дерева,
 * острова и фона остаётся одного размера.
 *
 * Раньше зумилось только дерево — в кадре оказывались два разных разрешения
 * пикселя, и сцена читалась как склейка из разных игр.
 */
const CAMERA: [w: number, h: number][] = [
  [200, 250], // 0 семечко
  [200, 250], // 1 росток
  [210, 260], // 2 кустик
  [220, 270], // 3 куст
  [240, 290], // 4 саженец
  [280, 330], // 5 деревце
  [320, 360], // 6 молодое дерево
  [420, 500], // 7 взрослое
  [420, 500], // 8 финал
]

const camera = (stage: number) => CAMERA[Math.max(0, Math.min(stage, CAMERA.length - 1))]

/**
 * Остров (высота ~116px) целиком помещается над нижней кромкой, плюс запас
 * под HUD — иначе кнопка полива срезает землю.
 */
const groundTop = (h: number) => h - 156

/** Куда ставим редкие элементы: смещение от центра и от линии травы. */
const DECOR_SPOTS: Record<string, { dx: number; dy: number }> = {
  mushrooms: { dx: -68, dy: 2 },
  mushroom_big: { dx: 74, dy: 2 },
  mushroom_small: { dx: -40, dy: 4 },
  stones: { dx: 52, dy: -2 },
  crystal: { dx: -88, dy: 0 },
  sign: { dx: 88, dy: 0 },
  chest: { dx: 38, dy: 2 },
}

interface Props {
  stage: number
  unlocked: string[]
  /** Сегодня не поливали — сцена чуть приглушается. */
  thirsty?: boolean
  /** Длина серии: с ней сад «оживает» — светлячки над кроной. */
  streak?: number
  /** Идёт анимация полива. */
  watering?: boolean
}

export function GardenScene({ stage, unlocked, thirsty, streak = 0, watering }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)

  // Мир растёт вместе с деревом: у взрослого остров шире.
  const ground = stage >= 6 ? 'ground-wide' : 'ground'
  const [W, H] = camera(stage)
  const GROUND_TOP = groundTop(H)
  const GRASS_Y = GROUND_TOP + 12

  useEffect(() => {
    const el = box.current
    if (!el) return
    const apply = () => setK(el.clientWidth / W)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [W])

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden"
      style={{ height: H * k, transition: 'height 400ms ease' }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: W,
          height: H,
          transform: `scale(${k})`,
          imageRendering: 'pixelated',
          // Кадр выше и ниже картинок фона: сверху заливаем цветом неба (иначе
          // крона высокого дерева торчит на фоне страницы), снизу — цветом
          // подлеска, чтобы под островом не было пустой полосы.
          background: 'linear-gradient(to bottom, rgb(154,168,205) 0%, rgb(154,168,205) 55%, rgb(110,121,133) 88%)',
          filter: thirsty ? 'saturate(0.82) brightness(0.96)' : undefined,
          transition: 'filter 500ms ease',
        }}
      >
        {/* max-w-none обязателен: reset ужимает спрайт до ширины родителя и пиксельная сетка плывёт. */}
        {/* Фон привязан к линии земли, чтобы горизонт не «плавал» при смене стадии. */}
        <img src={sprite('bg-sky')} alt="" className="absolute max-w-none" style={{ left: -80, top: GROUND_TOP - 206 }} />
        <img src={sprite('bg-clouds')} alt="" className="absolute max-w-none garden-drift" style={{ left: -80, top: GROUND_TOP - 186 }} />
        <img src={sprite('bg-far')} alt="" className="absolute max-w-none" style={{ left: -80, top: GROUND_TOP - 116 }} />
        <img src={sprite('bg-near')} alt="" className="absolute max-w-none" style={{ left: -80, top: GROUND_TOP - 54 }} />

        <img
          src={sprite(ground)}
          alt=""
          className="absolute max-w-none"
          style={{ left: '50%', top: GROUND_TOP, transform: 'translateX(-50%)' }}
        />

        {/* Редкие элементы — до дерева, чтобы крона их перекрывала. */}
        {unlocked.map((id) => {
          const def = getUnlock(id)
          const spot = DECOR_SPOTS[id]
          if (!def || !spot) return null
          const dx = Math.round(spot.dx * (stage >= 6 ? 1 : 0.62))
          return (
            <img
              key={id}
              src={sprite(def.sprite)}
              alt=""
              className="absolute max-w-none garden-pop"
              style={{
                left: `calc(50% + ${dx}px)`,
                top: GRASS_Y + spot.dy,
                transform: 'translate(-50%, -100%)',
              }}
            />
          )
        })}

        <span
          className="absolute block"
          style={{
            left: '50%',
            top: GRASS_Y,
            transform: 'translate(-50%, -100%)',
            transformOrigin: 'bottom center',
          }}
        >
          <img src={sprite(`tree-${stage}`)} alt="" className="block max-w-none garden-sway" />
        </span>

        {/* Серия оживляет сад: чем длиннее, тем больше светлячков над кроной. */}
        {streak >= 3 && (
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: Math.min(6, Math.floor(streak / 3)) }).map((_, i) => (
              <span
                key={i}
                className="garden-firefly absolute rounded-full"
                style={{
                  left: `${34 + i * 11}%`,
                  top: `${34 + (i % 3) * 9}%`,
                  width: 2,
                  height: 2,
                  background: '#ffe9a3',
                  boxShadow: '0 0 4px 1px rgba(255,225,140,0.9)',
                  animationDelay: `${i * 0.7}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Капли при поливе. */}
        {watering && (
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="garden-drop absolute rounded-full"
                style={{
                  left: `${38 + i * 4}%`,
                  top: 40,
                  width: 3,
                  height: 6,
                  background: '#8fd3ef',
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
