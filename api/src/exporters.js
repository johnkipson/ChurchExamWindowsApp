const { Document, Packer, Paragraph, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = require('docx');
const XLSX = require('xlsx');

function safeFileBase(title, dateDisplay) {
  const base = (title.replace(/[^\w\s-]/g, '').trim() || 'Exam_Attendance').replace(/\s+/g, '_');
  return base + '_' + dateDisplay.replace(/\//g, '-');
}

async function buildDocxBuffer({ title, dateDisplay, presentNames, totalCount }) {
  const tableRows = [
    new TableRow({
      children: [
        new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: '#', bold: true })] }),
        new TableCell({ width: { size: 90, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: 'Name', bold: true })] })
      ]
    }),
    ...presentNames.map((name, i) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(String(i + 1))] }),
        new TableCell({ children: [new Paragraph(name)] })
      ]
    }))
  ];

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: 'Date: ' + dateDisplay, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: 'Present: ' + presentNames.length + ' of ' + totalCount, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } })
      ]
    }]
  });

  return Packer.toBuffer(doc);
}

function buildXlsxBuffer({ title, dateDisplay, presentNames, totalCount }) {
  const rows = [
    [title],
    ['Date: ' + dateDisplay],
    ['Present: ' + presentNames.length + ' of ' + totalCount],
    [],
    ['#', 'Name'],
    ...presentNames.map((name, i) => [i + 1, name])
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 6 }, { wch: 50 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { safeFileBase, buildDocxBuffer, buildXlsxBuffer };
