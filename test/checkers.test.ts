import { describe, expect, it } from 'vitest';
import { routeSpecialistCheckers } from '../src/checkers.js';

describe('specialist checker routing', () => {
  it.each([
    ['authentication and untrusted shell input', 'security'],
    ['API persistence migration', 'integration'],
    ['responsive frontend component accessibility', 'ui'],
    ['prompt model retrieval dataset grader', 'ai-evaluation'],
    ['public API schema backward compatibility', 'compatibility'],
    ['README documentation for externally visible behavior', 'documentation'],
    ['manual human UAT visual judgment', 'human-uat'],
  ])('routes %s to %s', (artifactText, expected) => {
    expect(routeSpecialistCheckers({ artifactText })).toContain(expected);
  });

  it('combines explicit requirements and deterministic disablement in stable order', () => {
    expect(routeSpecialistCheckers({
      artifactText: 'authentication and UI',
      required: ['documentation'],
      disabled: ['ui'],
    })).toEqual(['security', 'documentation']);
  });
});
