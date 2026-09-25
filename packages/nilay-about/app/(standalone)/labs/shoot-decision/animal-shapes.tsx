import type { SceneAnimal } from '@/lib/shoot-decision';

/**
 * Side-view silhouettes drawn for this tool, head to the left, in a 400 × 260 box. They are
 * schematic: proportions are only meant to place the head, neck and chest where the guidance
 * describes them, not to reproduce any photograph or published drawing.
 */
export function AnimalShape({ animal, fill }: { animal: SceneAnimal; fill: string }) {
  switch (animal) {
    case 'deer':
    case 'serow':
      return (
        <g fill={fill}>
          <ellipse cx="195" cy="140" rx="82" ry="38" />
          <path d="M150 118 L120 70 L96 60 L90 78 L112 96 L128 150 Z" />
          <ellipse cx="78" cy="66" rx="24" ry="13" />
          <path d="M92 52 L100 38 L104 56 Z" />
          {animal === 'deer' ? (
            <path d="M92 50 L84 18 L74 6 M84 18 L96 10 M86 28 L70 24" stroke={fill} strokeWidth="6" fill="none" />
          ) : (
            <path d="M86 50 L84 36" stroke={fill} strokeWidth="4" fill="none" />
          )}
          <rect x="138" y="160" width="12" height="80" rx="4" />
          <rect x="158" y="160" width="12" height="80" rx="4" />
          <rect x="228" y="160" width="12" height="80" rx="4" />
          <rect x="248" y="160" width="12" height="80" rx="4" />
          <path d="M274 122 L290 112 L284 132 Z" />
        </g>
      );
    case 'boar':
      return (
        <g fill={fill}>
          <ellipse cx="200" cy="145" rx="98" ry="50" />
          <path d="M112 112 L60 116 L38 130 L42 146 L70 156 L118 170 Z" />
          <path d="M92 104 L100 86 L110 108 Z" />
          <rect x="130" y="180" width="16" height="58" rx="5" />
          <rect x="156" y="180" width="16" height="58" rx="5" />
          <rect x="236" y="180" width="16" height="58" rx="5" />
          <rect x="262" y="180" width="16" height="58" rx="5" />
          <path d="M296 136 L312 144 L298 150 Z" />
        </g>
      );
    case 'bear':
      return (
        <g fill={fill}>
          <ellipse cx="205" cy="140" rx="102" ry="56" />
          <circle cx="80" cy="96" r="32" />
          <path d="M104 80 L128 100 L128 150 L104 120 Z" />
          <ellipse cx="50" cy="104" rx="16" ry="11" />
          <circle cx="70" cy="66" r="9" />
          <circle cx="96" cy="68" r="9" />
          <rect x="130" y="170" width="24" height="68" rx="8" />
          <rect x="162" y="170" width="24" height="68" rx="8" />
          <rect x="236" y="170" width="24" height="68" rx="8" />
          <rect x="268" y="170" width="24" height="68" rx="8" />
        </g>
      );
  }
}
