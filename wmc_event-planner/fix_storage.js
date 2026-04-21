const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'projektplanung.html');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace JSON.parse(localStorage.getItem('projects')) with getAllProjectsSync()
content = content.replace(
    /JSON\.parse\(localStorage\.getItem\("projects"\) \|\| "{}"\)/g,
    'getAllProjectsSync() || {}'
);

// Replace localStorage.setItem('projects', JSON.stringify(projects)) with saveProjectsData(projects)
content = content.replace(
    /localStorage\.setItem\("projects", JSON\.stringify\(projects\)\)/g,
    'saveProjectsData(projects)'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ All storage calls replaced in projektplanung.html');
