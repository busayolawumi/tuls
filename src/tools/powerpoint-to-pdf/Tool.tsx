import { OfficeToPdf } from '../../components/office/OfficeToPdf'
import { manifest } from './manifest'

function PowerPointToPdf() {
  return (
    <OfficeToPdf
      manifest={manifest}
      one="a PowerPoint presentation"
      many="PowerPoint presentations"
      kinds="PPTX, PPSX, PPT or ODP"
      intro="Turn PowerPoint presentations into PDFs, one slide to a page. LibreOffice does the work, right here in your browser."
    />
  )
}

export default PowerPointToPdf
