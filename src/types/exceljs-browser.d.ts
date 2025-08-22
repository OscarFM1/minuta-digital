// Usar el build de navegador de exceljs (evita fs/stream de Node)
declare module 'exceljs/dist/exceljs.min.js' {
  const ExcelJS: any;
  export default ExcelJS;
}
