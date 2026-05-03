import XLSX from 'xlsx';
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

  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
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
