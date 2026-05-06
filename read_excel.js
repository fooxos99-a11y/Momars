import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const filePath = path.join('C:', 'Users', 'RAIQ', 'Desktop', 'المواقع', 'القياس القبلي لدورة مدخل في التربية وخصائص النمو.xlsx');

try {
  if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath);
    console.log('Current directory:', process.cwd());
    console.log('Desktop files:');
    const files = fs.readdirSync('C:\\Users\\RAIQ\\Desktop');
    files.forEach(f => console.log('  ' + f));
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  const data = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    data.push(values.map((value) => value ?? ''));
  });
  
  console.log('='.repeat(120));
  console.log('Excel Data:');
  console.log('='.repeat(120));
  
  data.slice(0, 20).forEach((row, idx) => {
    console.log(`Row ${idx}:`, row);
  });

  if (data.length > 20) {
    console.log(`\n... (${data.length - 20} more rows)`);
  }
} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}
