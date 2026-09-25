import type { ModelFile } from './model-download';

/**
 * SpeciesNet, the camera-trap classifier Google publishes (github.com/google/cameratrapai, Apache
 * License 2.0), as the whole-image version 4.0.3b converted to ONNX with float16 weights and
 * published as sasakiuri/speciesnet-v4.0.3b-onnx on Hugging Face. The files are fetched from there
 * at a pinned revision, only when the reader asks, and checked against the hashes recorded here.
 */
const SPECIES_MODEL_BASE =
  'https://huggingface.co/sasakiuri/speciesnet-v4.0.3b-onnx/resolve/7317802fda363b1c9dd91e5a8769bdbb77814514';

export const SPECIES_MODEL_FILES = {
  model: {
    url: `${SPECIES_MODEL_BASE}/speciesnet-v4.0.3b-full_image.fp16.onnx`,
    sha256: '236f5be75be4781627b6d077dfdac541f173f11a38c2cb55836617950c556936',
    bytes: 112_297_037,
  },
  labels: {
    url: `${SPECIES_MODEL_BASE}/labels.txt`,
    sha256: 'e0c41415d9b29dfd6d2e2494205d1197d28595cc6f69cb129495f9827155547e',
    bytes: 255_693,
  },
} as const satisfies Record<string, ModelFile>;

export const SPECIES_MODEL_BYTES = SPECIES_MODEL_FILES.model.bytes + SPECIES_MODEL_FILES.labels.bytes;

/** The side of the square the model reads, and the crop it takes first (speciesnet/classifier.py). */
export const SPECIES_INPUT_SIZE = 480;

/**
 * The part of a photo the model reads: the full width, and the height less the top and bottom, where
 * trail cameras print their data band, as the original preprocessing for the whole-image model does.
 */
export function speciesCrop(width: number, height: number) {
  const cropHeight = Math.max(Math.floor(height * 0.7), height - 400);
  // Rounded half to even, as Python's round() in torchvision's center_crop.
  const offset = (height - cropHeight) / 2;
  const y = offset % 1 === 0.5 && Math.floor(offset) % 2 === 0 ? Math.floor(offset) : Math.round(offset);
  return { x: 0, y, width, height: cropHeight };
}

/** What a photo can be marked as. `other` holds anything else the model names. */
export const CAMERA_SPECIES = [
  { id: 'sika-deer', ja: 'ニホンジカ', en: 'Sika deer' },
  { id: 'wild-boar', ja: 'イノシシ', en: 'Wild boar' },
  { id: 'black-bear', ja: 'ツキノワグマ', en: 'Asiatic black bear' },
  { id: 'brown-bear', ja: 'ヒグマ', en: 'Brown bear' },
  { id: 'macaque', ja: 'サル', en: 'Macaque' },
  { id: 'serow', ja: 'カモシカ', en: 'Serow' },
  { id: 'raccoon-dog', ja: 'タヌキ', en: 'Raccoon dog' },
  { id: 'fox', ja: 'キツネ', en: 'Red fox' },
  { id: 'badger', ja: 'アナグマ', en: 'Badger' },
  { id: 'civet', ja: 'ハクビシン', en: 'Masked palm civet' },
  { id: 'raccoon', ja: 'アライグマ', en: 'Raccoon' },
  { id: 'hare', ja: 'ノウサギ', en: 'Hare' },
  { id: 'marten', ja: 'テン', en: 'Marten' },
  { id: 'weasel', ja: 'イタチ', en: 'Weasel' },
  { id: 'cat', ja: 'ネコ', en: 'Cat' },
  { id: 'dog', ja: 'イヌ', en: 'Dog' },
  { id: 'bird', ja: '鳥', en: 'Bird' },
  { id: 'human', ja: '人', en: 'Person' },
  { id: 'vehicle', ja: '車両', en: 'Vehicle' },
  { id: 'blank', ja: '写っていない', en: 'Nothing' },
  { id: 'other', ja: 'その他', en: 'Other' },
] as const;

export type CameraSpeciesId = (typeof CAMERA_SPECIES)[number]['id'];

/**
 * Which of `CAMERA_SPECIES` a SpeciesNet label falls under. Labels read
 * `id;class;order;family;genus;species;common name`; a label given only to the genus (the model's
 * answer for Japanese serow, badger, hare, marten and macaque, which it has no species for) counts
 * for the genus. Anything not listed is `other`.
 */
export function cameraSpeciesOf(label: string): CameraSpeciesId {
  const [, taxonClass = '', order = '', , genus = '', species = '', common = ''] = label.split(';');
  const is = (g: string, s?: string) => genus === g && (s === undefined || species === s);
  if (is('cervus', 'nippon')) return 'sika-deer';
  if (is('sus', 'scrofa')) return 'wild-boar';
  if (is('ursus', 'thibetanus')) return 'black-bear';
  if (genus === 'ursus' && species.startsWith('arctos')) return 'brown-bear';
  if (is('macaca')) return 'macaque';
  if (is('capricornis')) return 'serow';
  if (is('nyctereutes', 'procyonoides')) return 'raccoon-dog';
  if (is('vulpes', 'vulpes')) return 'fox';
  if (is('meles')) return 'badger';
  if (is('paguma', 'larvata')) return 'civet';
  if (is('procyon', 'lotor')) return 'raccoon';
  if (is('lepus') || (order === 'lagomorpha' && genus === '')) return 'hare';
  if (is('martes')) return 'marten';
  if (is('mustela')) return 'weasel';
  if (is('felis', 'catus')) return 'cat';
  if (is('canis', 'familiaris')) return 'dog';
  if (taxonClass === 'aves') return 'bird';
  if (is('homo', 'sapiens') || common === 'human') return 'human';
  if (common === 'vehicle') return 'vehicle';
  if (common === 'blank') return 'blank';
  return 'other';
}

/** The common name at the end of a label, as the model gives it (English). */
export const labelCommonName = (label: string) => label.split(';').at(-1) ?? label;
