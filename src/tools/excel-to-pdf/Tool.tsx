import { OfficeToPdf } from '../../components/office/OfficeToPdf'
import { manifest } from './manifest'

function ExcelToPdf() {
  return (
    <OfficeToPdf
      manifest={manifest}
      one="an Excel spreadsheet"
      many="Excel spreadsheets"
      kinds="XLSX, XLSM, XLS, ODS or CSV"
      intro="Turn Excel spreadsheets into PDFs, laid out as they’d print, and CSV files into tidy tables that fit the page. LibreOffice does the work, right here in your browser."
    />
  )
}

export default ExcelToPdf
