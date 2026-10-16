import { OfficeToPdf } from '../../components/office/OfficeToPdf'
import { manifest } from './manifest'

function WordToPdf() {
  return (
    <OfficeToPdf
      manifest={manifest}
      one="a Word document"
      many="Word documents"
      kinds="DOCX, DOC, ODT or RTF"
      intro="Turn Word documents into PDFs. LibreOffice does the work, right here in your browser."
    />
  )
}

export default WordToPdf
