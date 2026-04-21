#!/usr/bin/env python3
import re

with open('projektplanung.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace JSON.parse(localStorage.getItem('projects')) with getAllProjectsSync()
content = re.sub(
    r'JSON\.parse\(localStorage\.getItem\("projects"\) \|\| "{}"\)',
    'getAllProjectsSync() || {}',
    content
)

# Replace localStorage.setItem('projects', JSON.stringify(projects)) with saveProjectsData(projects)
content = re.sub(
    r'localStorage\.setItem\("projects", JSON\.stringify\(projects\)\)',
    'saveProjectsData(projects)',
    content
)

with open('projektplanung.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('✓ All storage calls replaced in projektplanung.html')
