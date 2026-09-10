# SPDX-License-Identifier: MIT
"""Run from saika-docs after content:generate, with fonttools[woff]==4.57.0."""
import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

text = ''.join(doc['markdown'] for doc in json.loads(Path('.generated/documents.json').read_text()))
text += ''.join(path.read_text() for path in sorted(Path('src').rglob('*.tsx')))
font = instantiateVariableFont(TTFont('assets/fonts/NotoSansJP.ttf'), {'wght': 400}, inplace=True)
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
options.name_IDs = ['*']
subsetter = subset.Subsetter(options)
subsetter.populate(text=''.join(sorted(set(text))))
subsetter.subset(font)
font.flavor = 'woff2'
font.save('assets/fonts/NotoSansJP-Docs.woff2')
