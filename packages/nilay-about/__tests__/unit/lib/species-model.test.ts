import { describe, expect, it } from 'vitest';

import { cameraSpeciesOf, labelCommonName, speciesCrop } from '@/lib/species-model';

const label = (taxa: string) => `00000000-0000-0000-0000-000000000000;${taxa}`;

describe('SpeciesNet labels', () => {
  it('puts the species of Japan it names under the page’s choices', () => {
    expect(cameraSpeciesOf(label('mammalia;artiodactyla;cervidae;cervus;nippon;sika deer'))).toBe('sika-deer');
    expect(cameraSpeciesOf(label('mammalia;artiodactyla;suidae;sus;scrofa;wild boar'))).toBe('wild-boar');
    expect(cameraSpeciesOf(label('mammalia;carnivora;ursidae;ursus;thibetanus;asiatic black bear'))).toBe('black-bear');
    expect(cameraSpeciesOf(label('mammalia;carnivora;ursidae;ursus;arctos horribilis;grizzly bear'))).toBe(
      'brown-bear',
    );
  });

  it('counts a genus-only answer for the genus the model has no Japanese species for', () => {
    expect(cameraSpeciesOf(label('mammalia;artiodactyla;bovidae;capricornis;;capricornis species'))).toBe('serow');
    expect(cameraSpeciesOf(label('mammalia;carnivora;mustelidae;meles;;meles species'))).toBe('badger');
    expect(cameraSpeciesOf(label('mammalia;primates;cercopithecidae;macaca;;macaque species'))).toBe('macaque');
    expect(cameraSpeciesOf(label('mammalia;lagomorpha;;;;lagomorpha order'))).toBe('hare');
  });

  it('keeps a domestic pig, and anything else, apart as other', () => {
    expect(cameraSpeciesOf(label('mammalia;artiodactyla;suidae;sus;scrofa scrofa;domestic pig'))).toBe('other');
    expect(cameraSpeciesOf(label('mammalia;primates;callitrichidae;saguinus;melanoleucus;tamarin'))).toBe('other');
  });

  it('reads people, vehicles, birds and empty frames', () => {
    expect(cameraSpeciesOf(label('mammalia;primates;hominidae;homo;sapiens;human'))).toBe('human');
    expect(cameraSpeciesOf(label(';;;;;vehicle'))).toBe('vehicle');
    expect(cameraSpeciesOf(label('aves;;;;;bird'))).toBe('bird');
    expect(cameraSpeciesOf(label(';;;;;blank'))).toBe('blank');
    expect(labelCommonName(label(';;;;;blank'))).toBe('blank');
  });

  it('crops the top and bottom as the original whole-image preprocessing does', () => {
    // max(floor(3000 × 0.7), 3000 − 400) = 2600, centred.
    expect(speciesCrop(4000, 3000)).toEqual({ x: 0, y: 200, width: 4000, height: 2600 });
    // max(floor(1000 × 0.7), 600) = 700.
    expect(speciesCrop(1000, 1000)).toEqual({ x: 0, y: 150, width: 1000, height: 700 });
    // A half row rounds to even, as Python's round() does: 150.5 → 150, 151.5 → 152.
    expect(speciesCrop(1000, 1001).y).toBe(150);
    expect(speciesCrop(1000, 1010)).toEqual({ x: 0, y: 152, width: 1000, height: 707 });
  });
});
