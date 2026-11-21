import hashlib
import json
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parent.parent
source = root/'.tmp/s'
target = root/'.tmp/signal-source/v8.36.0/Signal-Desktop-8.36.0'
reference = root/'reference-sources/Signal-Desktop-v8.36.0/Signal-Desktop-8.36.0'
if (source/'package.json').read_bytes() != (reference/'package.json').read_bytes():
    raise RuntimeError('Official package.json not restored after unsigned packaging')
for required in ['Signal.exe', 'resources/app.asar']:
    if not (source/'release/win-unpacked'/required).is_file():
        raise RuntimeError('Missing packaged artifact: ' + required)
shutil.copytree('\\\\?\\' + str(source/'release'), '\\\\?\\' + str(target/'release'), dirs_exist_ok=True)
file = root/'tools/test-signal-source-artifact.cjs'
text = file.read_text(encoding='utf-8').replace("baselineVersion === '8.18.0'", "['8.18.0', '8.36.0'].includes(baselineVersion)")
file.write_text(text, encoding='utf-8', newline='\n')
print(json.dumps({name: hashlib.sha256((target/'release/win-unpacked'/name).read_bytes()).hexdigest().upper() for name in ['Signal.exe', 'resources/app.asar']}, indent=2))
