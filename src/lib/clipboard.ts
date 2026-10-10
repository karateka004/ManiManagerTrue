/**
 * Скопировать текст. Сначала Clipboard API; если его нет или он отказал
 * (старый WebView, нет разрешения) — через скрытое поле и execCommand, который
 * в WebView Telegram работает почти везде. Возвращает, получилось ли.
 *
 * Раньше при отказе Clipboard API кнопка «Копировать» молча ничего не делала.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* пробуем по-старому */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
