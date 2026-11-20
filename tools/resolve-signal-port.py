"""Reviewed resolutions for v8.36.0 migration conflicts."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / '.tmp/signal-port/Signal-Desktop-8.36.0'
pattern = re.compile(r'^<<<<<<< upstream-8\.36\.0\n(.*?)^=======\n(.*?)^>>>>>>> maoyi-patches\n', re.M | re.S)

def resolve(rel, handler):
    file = SOURCE / rel
    text = file.read_text(encoding='utf-8')
    text, count = pattern.subn(lambda match: handler(match[1], match[2]), text)
    if not count:
        raise RuntimeError('Expected conflict in ' + rel)
    file.write_text(text, encoding='utf-8', newline='\n')
    print(rel, count)

resolve('app/main.main.ts', lambda upstream, custom: upstream + custom)
resolve('ts/windows/main/phase1-ipc.preload.ts', lambda upstream, custom: upstream + custom)
resolve('ts/state/smart/TimelineItem.preload.tsx', lambda upstream, custom: custom + upstream)
resolve('ts/components/CompositionArea.dom.tsx', lambda upstream, custom: upstream + custom.replace("import type { ContactNameColorType } from '../types/Colors.std.ts';\n", ''))
resolve('ts/models/conversations.preload.ts', lambda upstream, custom: upstream + custom.replace("import { storageServiceUploadJob } from '../services/storage.preload.ts';\n", ''))
resolve('ts/components/conversation/TimelineItem.dom.tsx', lambda upstream, custom: custom.replace("import type { InteractionModeType } from '../../state/ducks/conversations.preload.ts';\n", ''))

def message(upstream, custom):
    if upstream.startswith('import '):
        return upstream + custom
    return upstream.replace('        {this.#renderText()}\n', '        {this.#renderText()}\n        {this.renderMaoyiTranslation()}\n        {this.renderMaoyiSmartReply()}\n        {this.renderMaoyiSmartReplySuggestions()}\n')
resolve('ts/components/conversation/Message.dom.tsx', message)
resolve('app/renderWindowsToast.std.tsx', lambda upstream, custom: upstream[:upstream.index('    launch =')])
toast = SOURCE / 'app/renderWindowsToast.std.tsx'
text = toast.read_text()
text = text.replace('if (type === NotificationType.Message || type === NotificationType.Reaction) {', 'if (type === NotificationType.Message || type === NotificationType.Reaction || type === NotificationType.UnreadReminder) {')
toast.write_text(text, newline='\n')
