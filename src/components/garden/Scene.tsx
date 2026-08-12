import { useEffect, useRef, useState } from 'react'
import { getUnlock } from '../../lib/garden'

/**
 * Сцена сада: небо → облака → дальний лес → ближний лес → остров → дерево → декор.
 *
 * Сцена рисуется в фиксированной ЛОГИЧЕСКОЙ системе координат (360×300) и
 * масштабируется через `transform: scale`. Так координаты слоёв не зависят от
 * ширины экрана, а `image-rendering: pixelated` сохраняет чёткость пикселей.
 */

const SPRITES = import.meta.glob('../../assets/game/*.png', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>

/** 'tree-3' → URL спрайта (бросает при опечатке в имени — ловим на сборке). */
function sprite(name: string): string {
  const hit = Object.entries(SPRITES).find(([path]) => path.endsWith(`/${name}.png`))
  if (!hit) throw new Error(`нет спрайта ${name}.png`)
  return hit[1]
}

export const SCENE_W = 360
export const SCENE_H = 272

/** Линия травы на острове — по ней «стоят» дерево и декор. */
const GROUND_TOP = 156
const GRASS_Y = GROUND_TOP + 12

/**
 * Ранние стадии — маленькие спрайты (20–40px). В кадре 360×272 они теряются,
 * поэтому увеличиваем их вдвое: целочисленный масштаб пиксель-арт не мылит.
 */
const stageZoom = (stage: number) => (stage <= 3 ? 2 : 1)

/** Куда ставим редкие элементы: смещение от центра сцены и от линии травы. */
const DECOR_SPOTS: Record<string, { dx: number; dy: number }> = {
  mushrooms: { dx: -72, dy: 2 },
  mushroom_big: { dx: 78, dy: 2 },
  mushroom_small: { dx: -46, dy: 4 },
  stones: { dx: 58, dy: -2 },
  crystal: { dx: -92, dy: 0 },
  sign: { dx: 92, dy: 0 },
  chest: { dx: 44, dy: 2 },
}

interface Props {
  stage: number
  /** Открытые редкие элементы. */
  unlocked: string[]
  /** Сегодня не поливали — сцена приглушается. */
  thirsty?: boolean
}

export function GardenScene({ stage, unlocked, thirsty }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)

  // Масштаб под ширину контейнера: логический кадр всегда 360×300.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const apply = () => setK(el.clientWidth / SCENE_W)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const wide = stage >= 6
  const ground = wide ? 'ground-wide' : 'ground'

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-4xl"
      style={{ height: SCENE_H * k }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: SCENE_W,
          height: SCENE_H,
          transform: `scale(${k})`,
          imageRendering: 'pixelated',
          filter: thirsty ? 'saturate(0.78) brightness(0.97)' : undefined,
          transition: 'filter 400ms ease',
        }}
      >
        {/*
          max-width: none обязателен: базовый reset ужимает картинку до ширины
          родителя, из-за чего фон 480px сжимался до 360 и пиксельная сетка плыла.
        */}
        <img src={sprite('bg-sky')} alt="" className="absolute max-w-none" style={{ left: -60, top: -8 }} />
        <img src={sprite('bg-clouds')} alt="" className="absolute max-w-none" style={{ left: -60, top: 0 }} />
        <img src={sprite('bg-far')} alt="" className="absolute max-w-none" style={{ left: -60, top: 56 }} />
        <img src={sprite('bg-near')} alt="" className="absolute max-w-none" style={{ left: -60, top: 106 }} />

        <img
          src={sprite(ground)}
          alt=""
          className="absolute max-w-none"
          style={{ left: '50%', top: GROUND_TOP, transform: 'translateX(-50%)' }}
        />

        {/* Редкие элементы стоят на траве, до дерева — чтобы крона их перекрывала. */}
        {unlocked.map((id) => {
          const def = getUnlock(id)
          const spot = DECOR_SPOTS[id]
          if (!def || !spot) return null
          // Смещения заданы под широкий остров; на узком поджимаем, иначе декор висит в воздухе.
          const dx = Math.round(spot.dx * (wide ? 1 : 0.6))
          return (
            <img
              key={id}
              src={sprite(def.sprite)}
              alt=""
              className="absolute max-w-none"
              style={{
                left: `calc(50% + ${dx}px)`,
                top: GRASS_Y + spot.dy,
                transform: 'translate(-50%, -100%)',
              }}
            />
          )
        })}

        {/*
          Обёртка ставит дерево низом ровно на линию травы и масштабирует стадию,
          покачивание живёт на самой картинке (чистый rotate, без сдвигов).
        */}
        <span
          className="absolute block"
          style={{
            left: '50%',
            top: GRASS_Y,
            transform: `translate(-50%, -100%) scale(${stageZoom(stage)})`,
            transformOrigin: 'bottom center',
          }}
        >
          <img src={sprite(`tree-${stage}`)} alt="" className="block max-w-none garden-sway" />
        </span>
      </div>
    </div>
  )
}
