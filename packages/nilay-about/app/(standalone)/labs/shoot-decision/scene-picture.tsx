import type { Scene } from '@/lib/shoot-decision';

import { AnimalShape } from './animal-shapes';

const sky = { day: '#cfe3f6', dusk: '#5b5577', night: '#1d2233' } as const;

/**
 * A drawing of a scene: the ground behind the animal, the light, and anything else in the line of
 * fire. The situation text says the same in words; the picture is decorative for screen readers.
 */
export function ScenePicture({ scene }: { scene: Scene }) {
  const { layout } = scene;
  const animalColour = scene.animal === 'bear' ? '#222' : scene.animal === 'serow' ? '#6d6a64' : '#7a5230';
  return (
    <svg viewBox="0 0 400 220" className="h-auto w-full rounded-md" aria-hidden="true">
      <rect width="400" height="220" fill={sky[layout.light]} />
      {layout.backdrop === 'bank' && <path d="M0 60 Q200 20 400 70 L400 220 L0 220 Z" fill="#8a6a45" />}
      {layout.backdrop === 'skyline' && <path d="M0 220 L120 150 L200 118 L290 150 L400 220 Z" fill="#6f7d4a" />}
      {layout.backdrop === 'field' && <rect y="150" width="400" height="70" fill="#8fae5f" />}
      {layout.backdrop === 'water' && (
        <>
          <rect y="140" width="400" height="80" fill="#5b8fc2" />
          <path d="M20 170 H80 M150 190 H230 M290 165 H360" stroke="#d6e8f7" strokeWidth="3" />
        </>
      )}
      {layout.backdrop === 'rock' && (
        <>
          <rect y="150" width="400" height="70" fill="#9a9a93" />
          <path d="M30 150 L60 90 L100 150 Z M250 150 L300 70 L350 150 Z" fill="#7b7b75" />
          {[140, 160, 180, 200, 220].map((x) => (
            <line key={x} x1={x} y1="150" x2={x + 6} y2="40" stroke="#5f8c3e" strokeWidth="5" />
          ))}
        </>
      )}
      {layout.backdrop !== 'field' && layout.backdrop !== 'water' && layout.backdrop !== 'rock' && (
        <rect y="190" width="400" height="30" fill="#5d7a3a" />
      )}
      {layout.road && <rect y="170" width="400" height="30" fill="#6b6b6b" />}
      {layout.house && (
        <g transform="translate(300 90)">
          <rect x="0" y="30" width="60" height="45" fill="#f1efe9" stroke="#555" />
          <path d="M-6 32 L30 4 L66 32 Z" fill="#a33" />
        </g>
      )}
      {layout.person && (
        <g transform="translate(330 110)">
          <circle cx="10" cy="8" r="8" fill="#e9c7a0" />
          <rect x="1" y="16" width="18" height="30" rx="4" fill="#f07a1a" />
          <rect x="3" y="46" width="6" height="24" fill="#444" />
          <rect x="11" y="46" width="6" height="24" fill="#444" />
        </g>
      )}
      {layout.sign && (
        <g transform="translate(20 100)">
          <rect
            x="0"
            y="0"
            width={layout.sign.length * 16 + 16}
            height="30"
            fill="#fff"
            stroke="#2e7d32"
            strokeWidth="3"
          />
          <text x="8" y="21" fontSize="16" fill="#1b5e20">
            {layout.sign}
          </text>
          <rect x={layout.sign.length * 8 + 4} y="30" width="6" height="40" fill="#6d4c41" />
        </g>
      )}
      {layout.movement ? (
        <g>
          <ellipse cx="200" cy="165" rx="90" ry="40" fill="#557a35" />
          <ellipse cx="205" cy="160" rx="26" ry="16" fill="#333" opacity="0.7" />
          <text x="196" y="130" fontSize="28" fill="#222">
            ?
          </text>
        </g>
      ) : (
        <g
          transform={layout.backdrop === 'skyline' ? 'translate(150 62) scale(0.26)' : 'translate(140 110) scale(0.3)'}
        >
          <AnimalShape animal={scene.animal} fill={animalColour} />
        </g>
      )}
      {layout.light !== 'day' && <circle cx="360" cy="30" r="12" fill="#f4e7b0" opacity="0.8" />}
    </svg>
  );
}
