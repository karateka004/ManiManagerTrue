// wrangler кладёт *.html в сборку текстом (правило модулей по умолчанию).
declare module '*.html' {
  const text: string
  export default text
}
