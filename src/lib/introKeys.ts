/**
 * Ключи localStorage быстрого старта и «Что нового». Отдельным крошечным
 * модулем: их читает Главная в стартовом чанке, а whatsnew.ts с полной историей
 * обновлений (десятки килобайт текста) должен оставаться в ленивых чанках.
 */
export const ONBOARDED_KEY = 'koshel:onboarded'
export const VERSION_KEY = 'koshel:lastVersion'
