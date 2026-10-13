/**
 * Тумблер. Сам по себе не кнопка — нажимается вся строка, в которой он стоит
 * (строка настроек, строка быстрого старта): попасть пальцем в 44 px сложнее,
 * чем в строку во всю ширину.
 */
export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-surface-sunken'}`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2)] transition-all ${
          on ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </span>
  )
}
