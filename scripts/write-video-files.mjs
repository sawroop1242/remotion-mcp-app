import fs from 'fs';
import path from 'path';

const files = JSON.parse(process.env.VIDEO_FILES);

for (const [filePath, code] of Object.entries(files)) {
  // filePath looks like /src/Video.tsx
  const fullPath = path.join(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, code);
  console.log('Written:', fullPath);
}
